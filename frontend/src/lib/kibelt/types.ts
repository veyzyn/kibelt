// Types mirroring the Kibelt API (see docs/api.md and api/src/processing/schema.js).

export type DownloadMode = "auto" | "audio" | "mute";
export type AudioFormat = "best" | "mp3" | "ogg" | "wav" | "opus";
export type AudioBitrate = "320" | "256" | "128" | "96" | "64" | "8";
export type FilenameStyle = "classic" | "pretty" | "basic" | "nerdy";
export type VideoQuality =
    | "max"
    | "4320"
    | "2160"
    | "1440"
    | "1080"
    | "720"
    | "480"
    | "360"
    | "240"
    | "144";
export type LocalProcessing = "disabled" | "preferred" | "forced";

/** Body for `POST /`. Only `url` is required. */
export interface KibeltRequest {
    url: string;
    audioBitrate?: AudioBitrate;
    audioFormat?: AudioFormat;
    downloadMode?: DownloadMode;
    filenameStyle?: FilenameStyle;
    videoQuality?: VideoQuality;
    disableMetadata?: boolean;
    alwaysProxy?: boolean;
    localProcessing?: LocalProcessing;
    subtitleLang?: string;

    // service-specific
    youtubeVideoCodec?: "h264" | "av1" | "vp9";
    youtubeVideoContainer?: "auto" | "mp4" | "webm" | "mkv";
    youtubeDubLang?: string;
    convertGif?: boolean;
    allowH265?: boolean;
    tiktokFullAudio?: boolean;
    youtubeBetterAudio?: boolean;
    youtubeHLS?: boolean;
}

export interface TunnelResponse {
    status: "tunnel" | "redirect";
    url: string;
    filename: string;
}

export interface PickerItem {
    type: "photo" | "video" | "gif";
    url: string;
    thumb?: string;
}

export interface PickerResponse {
    status: "picker";
    audio?: string;
    audioFilename?: string;
    picker: PickerItem[];
}

export interface LocalProcessingResponse {
    status: "local-processing";
    type: "merge" | "mute" | "audio" | "gif" | "remux";
    service: string;
    tunnel: string[];
    output: {
        type: string;
        filename: string;
        metadata?: Record<string, string>;
        subtitles?: boolean;
    };
    audio?: {
        copy: boolean;
        format: string;
        bitrate: string;
        cover?: boolean;
        cropCover?: boolean;
    };
    isHLS?: boolean;
}

export interface ErrorResponse {
    status: "error";
    error: {
        code: string;
        context?: {
            service?: string;
            limit?: number;
        };
    };
}

export type KibeltResponse =
    | TunnelResponse
    | PickerResponse
    | LocalProcessingResponse
    | ErrorResponse;

export interface InstanceInfo {
    kibelt?: {
        version: string;
        url: string;
        startTime: string;
        turnstileSitekey?: string;
        services: string[];
    };
    // upstream may still report under the `cobalt` key
    cobalt?: {
        version: string;
        url: string;
        startTime: string;
        services: string[];
    };
    git?: {
        commit: string;
        branch: string;
        remote: string;
    };
}
