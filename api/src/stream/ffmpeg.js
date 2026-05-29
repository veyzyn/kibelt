import ffmpeg from "ffmpeg-static";
import { spawn, execFileSync } from "child_process";
import { create as contentDisposition } from "content-disposition-header";

import { env } from "../config.js";
import { destroyInternalStream } from "./manage.js";
import { hlsExceptions } from "../processing/service-config.js";
import { closeResponse, pipe, estimateTunnelLength, estimateAudioMultiplier } from "./shared.js";

const metadataTags = new Set([
    "album",
    "composer",
    "genre",
    "copyright",
    "title",
    "artist",
    "album_artist",
    "track",
    "date",
    "sublanguage"
]);

const convertMetadataToFFmpeg = (metadata) => {
    const args = [];

    for (const [ name, value ] of Object.entries(metadata)) {
        if (metadataTags.has(name)) {
            if (name === "sublanguage") {
                args.push('-metadata:s:s:0', `language=${value}`);
                continue;
            }
            args.push('-metadata', `${name}=${value.replace(/[\u0000-\u0009]/g, '')}`); // skipcq: JS-0004
        } else {
            throw `${name} metadata tag is not supported.`;
        }
    }

    return args;
}

const killProcess = (p) => {
    p?.kill('SIGTERM'); // ask the process to terminate itself gracefully

    setTimeout(() => {
        if (p?.exitCode === null)
            p?.kill('SIGKILL'); // brutally murder the process if it didn't quit
    }, 5000);
}

const getCommand = (args) => {
    if (typeof env.processingPriority === 'number' && !isNaN(env.processingPriority)) {
        return ['nice', ['-n', env.processingPriority.toString(), ffmpeg, ...args]]
    }
    return [ffmpeg, args]
}

// gifsicle's lossy LZW encoder ("lossygif") is used to shrink gifs without
// touching resolution or frame rate. detect it once at startup; if it's not
// installed we fall back to emitting a plain (lossless) gif.
const gifsicleBin = process.env.GIFSICLE_PATH || "gifsicle";
let gifsicleAvailable = false;
try {
    execFileSync(gifsicleBin, ["--version"], { stdio: "ignore" });
    gifsicleAvailable = true;
} catch {
    gifsicleAvailable = false;
}

const render = async (res, streamInfo, ffargs, estimateMultiplier) => {
    let process;
    const urls = Array.isArray(streamInfo.urls) ? streamInfo.urls : [streamInfo.urls];
    const shutdown = () => (
        killProcess(process),
        closeResponse(res),
        urls.map(destroyInternalStream)
    );

    try {
        const args = [
            '-loglevel', '-8',
            ...ffargs,
        ];

        process = spawn(...getCommand(args), {
            windowsHide: true,
            stdio: [
                'inherit', 'inherit', 'inherit',
                'pipe'
            ],
        });

        const [,,, muxOutput] = process.stdio;

        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Content-Disposition', contentDisposition(streamInfo.filename));

        res.setHeader(
            'Estimated-Content-Length',
            await estimateTunnelLength(streamInfo, estimateMultiplier)
        );

        pipe(muxOutput, res, shutdown);

        process.on('close', shutdown);
        res.on('finish', shutdown);
    } catch {
        shutdown();
    }
}

const remux = async (streamInfo, res) => {
    const format = streamInfo.filename.split('.').pop();
    const urls = Array.isArray(streamInfo.urls) ? streamInfo.urls : [streamInfo.urls];
    const args = urls.flatMap(url => ['-i', url]);

    // if the stream type is merge, we expect two URLs
    if (streamInfo.type === 'merge' && urls.length !== 2) {
        return closeResponse(res);
    }

    if (streamInfo.subtitles) {
        args.push(
            '-i', streamInfo.subtitles,
            '-map', `${urls.length}:s`,
            '-c:s', format === 'mp4' ? 'mov_text' : 'webvtt',
        );
    }

    if (urls.length === 2) {
        args.push(
            '-map', '0:v',
            '-map', '1:a',
        );
    } else {
        args.push(
            '-map', '0:v:0',
            '-map', '0:a:0'
        );
    }

    args.push(
        '-c:v', 'copy',
        ...(streamInfo.type === 'mute' ? ['-an'] : ['-c:a', 'copy'])
    );

    if (format === 'mp4') {
        args.push('-movflags', 'faststart+frag_keyframe+empty_moov');
    }

    if (streamInfo.type !== 'mute' && streamInfo.isHLS && hlsExceptions.has(streamInfo.service)) {
        if (streamInfo.service === 'youtube' && format === 'webm') {
            args.push('-c:a', 'libopus');
        } else {
            args.push('-c:a', 'aac', '-bsf:a', 'aac_adtstoasc');
        }
    }

    if (streamInfo.metadata) {
        args.push(...convertMetadataToFFmpeg(streamInfo.metadata));
    }

    args.push('-f', format === 'mkv' ? 'matroska' : format, 'pipe:3');

    await render(res, streamInfo, args);
}

const convertAudio = async (streamInfo, res) => {
    const args = [
        '-i', streamInfo.urls,
        '-vn',
        ...(streamInfo.audioCopy ? ['-c:a', 'copy'] : ['-b:a', `${streamInfo.audioBitrate}k`]),
    ];

    if (streamInfo.audioFormat === 'mp3' && streamInfo.audioBitrate === '8') {
        args.push('-ar', '12000');
    }

    if (streamInfo.audioFormat === 'opus') {
        args.push('-vbr', 'off');
    }

    if (streamInfo.audioFormat === 'mp4a') {
        args.push('-movflags', 'frag_keyframe+empty_moov');
    }

    if (streamInfo.metadata) {
        args.push(...convertMetadataToFFmpeg(streamInfo.metadata));
    }

    args.push(
        '-f',
        streamInfo.audioFormat === 'm4a' ? 'ipod' : streamInfo.audioFormat,
        'pipe:3',
    );

    await render(
        res,
        streamInfo,
        args,
        estimateAudioMultiplier(streamInfo) * 1.1,
    );
}

const GIF_FILTER =
    "scale=-1:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse";

const convertGif = async (streamInfo, res) => {
    // ffmpeg always renders a full-quality gif (no resolution/fps changes).
    // when compression is on (default) we pipe it through gifsicle's lossy LZW
    // encoder to shrink it; `compress=false` keeps it lossless.
    const compress = streamInfo.gifCompress !== false;

    // plain (lossless) path — also the fallback when gifsicle isn't installed.
    if (!compress || !gifsicleAvailable) {
        return await render(
            res,
            streamInfo,
            ['-i', streamInfo.urls, '-vf', GIF_FILTER, '-loop', '0', '-f', 'gif', 'pipe:3'],
            60,
        );
    }

    // ffmpeg gif (stdout) -> gifsicle --lossy (stdin -> stdout) -> response
    let ffProcess, gifProcess;
    const urls = Array.isArray(streamInfo.urls) ? streamInfo.urls : [streamInfo.urls];
    const shutdown = () => (
        killProcess(ffProcess),
        killProcess(gifProcess),
        closeResponse(res),
        urls.map(destroyInternalStream)
    );

    try {
        ffProcess = spawn(...getCommand([
            '-loglevel', '-8',
            '-i', streamInfo.urls,
            '-vf', GIF_FILTER,
            '-loop', '0',
            '-f', 'gif', 'pipe:1',
        ]), {
            windowsHide: true,
            stdio: ['inherit', 'pipe', 'inherit'],
        });

        gifProcess = spawn(gifsicleBin, ['--lossy=100', '-O3'], {
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'inherit'],
        });

        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Content-Disposition', contentDisposition(streamInfo.filename));
        res.setHeader(
            'Estimated-Content-Length',
            await estimateTunnelLength(streamInfo, 30),
        );

        ffProcess.on('error', shutdown);
        gifProcess.on('error', shutdown);
        ffProcess.stdout.on('error', shutdown);
        gifProcess.stdin.on('error', () => {}); // ignore EPIPE if gifsicle exits first

        ffProcess.stdout.pipe(gifProcess.stdin);
        pipe(gifProcess.stdout, res, shutdown);

        gifProcess.on('close', shutdown);
        res.on('finish', shutdown);
    } catch {
        shutdown();
    }
}

export default {
    remux,
    convertAudio,
    convertGif,
}
