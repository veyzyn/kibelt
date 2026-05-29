import cors from "cors";
import http from "node:http";
import rateLimit from "express-rate-limit";
import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";
import { getCommit, getBranch, getRemote, getVersion } from "@kibelt/version-info";

import jwt from "../security/jwt.js";
import stream from "../stream/stream.js";
import match from "../processing/match.js";

import { env } from "../config.js";
import { extract } from "../processing/url.js";
import { Bright, Cyan } from "../misc/console-text.js";
import { hashHmac } from "../security/secrets.js";
import { createStore } from "../store/redis-ratelimit.js";
import { randomizeCiphers } from "../misc/randomize-ciphers.js";
import { verifyTurnstileToken } from "../security/turnstile.js";
import { friendlyServiceName } from "../processing/service-alias.js";
import { verifyStream } from "../stream/manage.js";
import { createResponse, normalizeRequest, getIP } from "../processing/request.js";
import { setupTunnelHandler } from "./itunnel.js";

import * as APIKeys from "../security/api-keys.js";
import * as Cookies from "../processing/cookie/manager.js";
import * as YouTubeSession from "../processing/helpers/youtube-session.js";

const git = {
    branch: await getBranch(),
    commit: await getCommit(),
    remote: await getRemote(),
}

const version = await getVersion();

const acceptRegex = /^application\/json(; charset=utf-8)?$/;

const corsConfig = env.corsWildcard ? {} : {
    origin: env.corsURL,
    optionsSuccessStatus: 200
}

const fail = (res, code, context) => {
    const { status, body } = createResponse("error", { code, context });
    res.status(status).json(body);
}

// YouTube is soft-disabled: ordinary YouTube links are rejected with a
// "coming soon" message. Submitting the link with a `httpz://` scheme is a
// developer bypass — we rewrite `httpz` → `https` and let it through.
const YOUTUBE_HOST = /(?:^|\.)(?:youtube\.com|youtu\.be|youtube-nocookie\.com)$/i;

const youtubeGuard = (rawUrl) => {
    let url = String(rawUrl ?? "").trim();
    let bypass = false;

    if (/^httpz:\/\//i.test(url)) {
        bypass = true;
        url = url.replace(/^httpz:\/\//i, "https://");
    }

    let host = "";
    try {
        host = new URL(url).hostname.toLowerCase();
    } catch {
        // not parseable yet — let the normal pipeline report the error
        return { url };
    }

    if (!bypass && YOUTUBE_HOST.test(host)) {
        return { blocked: true };
    }

    return { url };
}

// Give our own /tunnel URLs a real file extension in the path (e.g.
// /tunnel/twitter_123.gif?...) without touching the query that carries the
// actual stream data. embedders like discord decide whether to animate a gif
// (vs. showing a static frame) by the URL extension, not the content-type — so
// this makes gifs embed live.
const tunnelWithFilename = (tunnelUrl, filename) => {
    if (!filename) return tunnelUrl;
    try {
        const u = new URL(tunnelUrl);
        if (u.pathname === "/tunnel") {
            u.pathname = `/tunnel/${encodeURIComponent(filename)}`;
        }
        return u.toString();
    } catch {
        return tunnelUrl;
    }
}

export const runAPI = async (express, app, __dirname, isPrimary = true) => {
    const startTime = new Date();
    const startTimestamp = startTime.getTime();

    const getServerInfo = () => {
        return JSON.stringify({
            kibelt: {
                version: version,
                url: env.apiURL,
                startTime: `${startTimestamp}`,
                turnstileSitekey: env.sessionEnabled ? env.turnstileSitekey : undefined,
                services: [...env.enabledServices].map(e => {
                    return friendlyServiceName(e);
                }),
            },
            git,
        });
    }

    const serverInfo = getServerInfo();

    const handleRateExceeded = (_, res) => {
        const { body } = createResponse("error", {
            code: "error.api.rate_exceeded",
            context: {
                limit: env.rateLimitWindow
            }
        });
        return res.status(429).json(body);
    };

    const keyGenerator = (req) => hashHmac(getIP(req), 'rate').toString('base64url');

    const sessionLimiter = rateLimit({
        windowMs: env.sessionRateLimitWindow * 1000,
        limit: env.sessionRateLimit,
        standardHeaders: 'draft-6',
        legacyHeaders: false,
        keyGenerator,
        store: await createStore('session'),
        handler: handleRateExceeded
    });

    const apiLimiter = rateLimit({
        windowMs: env.rateLimitWindow * 1000,
        limit: (req) => req.rateLimitMax || env.rateLimitMax,
        standardHeaders: 'draft-6',
        legacyHeaders: false,
        keyGenerator: req => req.rateLimitKey || keyGenerator(req),
        store: await createStore('api'),
        handler: handleRateExceeded
    });

    const apiTunnelLimiter = rateLimit({
        windowMs: env.tunnelRateLimitWindow * 1000,
        limit: env.tunnelRateLimitMax,
        standardHeaders: 'draft-6',
        legacyHeaders: false,
        keyGenerator: req => keyGenerator(req),
        store: await createStore('tunnel'),
        handler: (_, res) => {
            return res.sendStatus(429);
        }
    });

    app.set('trust proxy', ['loopback', 'uniquelocal']);

    app.use('/', cors({
        methods: ['GET', 'POST'],
        exposedHeaders: [
            'Ratelimit-Limit',
            'Ratelimit-Policy',
            'Ratelimit-Remaining',
            'Ratelimit-Reset'
        ],
        ...corsConfig,
    }));

    app.post('/', (req, res, next) => {
        if (!acceptRegex.test(req.header('Accept'))) {
            return fail(res, "error.api.header.accept");
        }
        if (!acceptRegex.test(req.header('Content-Type'))) {
            return fail(res, "error.api.header.content_type");
        }
        next();
    });

    app.post('/', (req, res, next) => {
        if (!env.apiKeyURL) {
            return next();
        }

        const { success, error } = APIKeys.validateAuthorization(req);
        if (!success) {
            // We call next() here if either if:
            // a) we have user sessions enabled, meaning the request
            //    will still need a Bearer token to not be rejected, or
            // b) we do not require the user to be authenticated, and
            //    so they can just make the request with the regular
            //    rate limit configuration;
            // otherwise, we reject the request.
            if (
                (env.sessionEnabled || !env.authRequired)
                && ['missing', 'not_api_key'].includes(error)
            ) {
                return next();
            }

            return fail(res, `error.api.auth.key.${error}`);
        }

        req.authType = "key";
        return next();
    });

    app.post('/', (req, res, next) => {
        if (!env.sessionEnabled || req.rateLimitKey) {
            return next();
        }

        try {
            const authorization = req.header("Authorization");
            if (!authorization) {
                return fail(res, "error.api.auth.jwt.missing");
            }

            if (authorization.length >= 256) {
                return fail(res, "error.api.auth.jwt.invalid");
            }

            const [ type, token, ...rest ] = authorization.split(" ");
            if (!token || type.toLowerCase() !== 'bearer' || rest.length) {
                return fail(res, "error.api.auth.jwt.invalid");
            }

            if (!jwt.verify(token, getIP(req, 32))) {
                return fail(res, "error.api.auth.jwt.invalid");
            }

            req.rateLimitKey = hashHmac(token, 'rate');
            req.authType = "session";
        } catch {
            return fail(res, "error.api.generic");
        }
        next();
    });

    app.post('/', apiLimiter);
    app.use('/', express.json({ limit: 1024 }));

    app.use('/', (err, _, res, next) => {
        if (err) {
            const { status, body } = createResponse("error", {
                code: "error.api.invalid_body",
            });
            return res.status(status).json(body);
        }

        next();
    });

    app.post("/session", sessionLimiter, async (req, res) => {
        if (!env.sessionEnabled) {
            return fail(res, "error.api.auth.not_configured")
        }

        const turnstileResponse = req.header("cf-turnstile-response");

        if (!turnstileResponse) {
            return fail(res, "error.api.auth.turnstile.missing");
        }

        const turnstileResult = await verifyTurnstileToken(
            turnstileResponse,
            req.ip
        );

        if (!turnstileResult) {
            return fail(res, "error.api.auth.turnstile.invalid");
        }

        try {
            res.json(jwt.generate(getIP(req, 32)));
        } catch {
            return fail(res, "error.api.generic");
        }
    });

    app.post('/', async (req, res) => {
        const request = req.body;

        if (!request.url) {
            return fail(res, "error.api.link.missing");
        }

        const yt = youtubeGuard(request.url);
        if (yt.blocked) {
            return fail(res, "error.api.youtube.unsupported");
        }
        request.url = yt.url;

        const { success, data: normalizedRequest } = await normalizeRequest(request);
        if (!success) {
            return fail(res, "error.api.invalid_body");
        }

        const parsed = extract(
            normalizedRequest.url,
            APIKeys.getAllowedServices(req.rateLimitKey),
        );

        if (!parsed) {
            return fail(res, "error.api.link.invalid");
        }

        if ("error" in parsed) {
            let context;
            if (parsed?.context) {
                context = parsed.context;
            }
            return fail(res, `error.api.${parsed.error}`, context);
        }

        try {
            const result = await match({
                host: parsed.host,
                patternMatch: parsed.patternMatch,
                params: normalizedRequest,
                authType: req.authType ?? "none",
            });

            res.status(result.status).json(result.body);
        } catch {
            fail(res, "error.api.generic");
        }
    });

    app.use('/tunnel', cors({
        methods: ['GET'],
        exposedHeaders: [
            'Estimated-Content-Length',
            'Content-Disposition'
        ],
        ...corsConfig,
    }));

    const tunnelHandler = async (req, res) => {
        const id = String(req.query.id);
        const exp = String(req.query.exp);
        const sig = String(req.query.sig);
        const sec = String(req.query.sec);
        const iv = String(req.query.iv);

        const checkQueries = id && exp && sig && sec && iv;
        const checkBaseLength = id.length === 21 && exp.length === 13;
        const checkSafeLength = sig.length === 43 && sec.length === 43 && iv.length === 22;

        if (!checkQueries || !checkBaseLength || !checkSafeLength) {
            return res.status(400).end();
        }

        if (req.query.p) {
            return res.status(200).end();
        }

        const streamInfo = await verifyStream(id, sig, exp, sec, iv);
        if (!streamInfo?.service) {
            return res.status(streamInfo.status).end();
        }

        if (streamInfo.type === 'proxy') {
            streamInfo.range = req.headers['range'];
        }

        return stream(res, streamInfo);
    };

    // `/tunnel/<filename>` is an alias for `/tunnel`. the filename in the path is
    // purely cosmetic (the query carries the real data), but it gives the URL a
    // proper file extension so embedders (e.g. discord) recognise & animate gifs.
    app.get('/tunnel', apiTunnelLimiter, tunnelHandler);
    app.get('/tunnel/:filename', apiTunnelLimiter, tunnelHandler);

    app.get('/', (_, res) => {
        res.type('json');
        res.status(200).send(env.envFile ? getServerInfo() : serverInfo);
    })

    // Open, no-frills download proxy: GET /download/<link>
    // No keys, no captcha, no session — resolves the link with sane defaults
    // (auto video+audio) and 302-redirects straight to the media. Anything that
    // can't be a single redirect (pickers, local-processing, errors) comes back
    // as the same JSON the POST endpoint returns.
    // Shared resolver for the keyless GET shortcuts. Reconstructs the link from
    // a raw path tail, runs the YouTube guard + the normal processing pipeline,
    // and returns either an { error } code or the { status, body } match result.
    const resolveLinkTail = async (tail, req) => {
        if (!tail) {
            return { error: "error.api.link.missing" };
        }

        // Accept both raw (`https://…`) and percent-encoded links.
        let link = tail;
        try {
            link = decodeURIComponent(tail);
        } catch {
            // not valid percent-encoding — use the raw tail as-is
        }

        // Pull our own `?compress=false` flag out of the link before processing.
        // Everything else stays part of the link's own query string.
        let compress = true;
        try {
            const parsed = new URL(link);
            if (parsed.searchParams.has("compress")) {
                const v = parsed.searchParams.get("compress").toLowerCase();
                compress = !["false", "0", "no", "off"].includes(v);
                parsed.searchParams.delete("compress");
                link = parsed.toString();
            }
        } catch {
            // not a parseable URL yet — leave it for the pipeline to reject
        }

        const yt = youtubeGuard(link);
        if (yt.blocked) {
            return { error: "error.api.youtube.unsupported" };
        }
        link = yt.url;

        const { success, data: normalizedRequest } = await normalizeRequest({ url: link, compress });
        if (!success) {
            return { error: "error.api.link.invalid" };
        }

        const parsed = extract(
            normalizedRequest.url,
            APIKeys.getAllowedServices(req.rateLimitKey),
        );

        if (!parsed) {
            return { error: "error.api.link.invalid" };
        }

        if ("error" in parsed) {
            return { error: `error.api.${parsed.error}`, context: parsed.context };
        }

        try {
            const { status, body } = await match({
                host: parsed.host,
                patternMatch: parsed.patternMatch,
                params: normalizedRequest,
                authType: "none",
            });
            return { status, body };
        } catch {
            return { error: "error.api.generic" };
        }
    };

    // Open CORS for the keyless shortcuts.
    app.use('/download', cors({ methods: ['GET'], origin: '*' }));

    // GET /download/<link> — no keys, no captcha. 302-redirects straight to the
    // media (this is what the kibe.lol/<link> shortcut points at). Results that
    // can't be a single redirect (pickers, local-processing, errors) are JSON.
    app.get(/^\/download\//, apiLimiter, async (req, res) => {
        const marker = '/download/';
        const tail = req.originalUrl.slice(
            req.originalUrl.indexOf(marker) + marker.length,
        );

        const r = await resolveLinkTail(tail, req);
        if (r.error) {
            return fail(res, r.error, r.context);
        }

        if (r.body?.status === "tunnel" || r.body?.status === "redirect") {
            // for our own tunnels, redirect to the filename'd alias so the URL
            // ends in a real extension (.gif/.mp4/…) — embedders need that.
            const target = r.body.status === "tunnel"
                ? tunnelWithFilename(r.body.url, r.body.filename)
                : r.body.url;
            return res.redirect(target);
        }

        return res.status(r.status).json(r.body);
    });

    // GET /<link> — developer-friendly: returns the full JSON response (a
    // download url + metadata) instead of redirecting. This is what
    // dl.kibe.lol/<link> serves. Matches root paths beginning with a URL scheme
    // (http / https / httpz), raw or percent-encoded.
    app.get(/^\/(?:https?|httpz)(?::\/\/|%3a)/i, apiLimiter, async (req, res) => {
        const tail = req.originalUrl.replace(/^\//, "");

        const r = await resolveLinkTail(tail, req);
        if (r.error) {
            return fail(res, r.error, r.context);
        }

        return res.status(r.status).json(r.body);
    });

    app.get('/favicon.ico', (req, res) => {
        res.status(404).end();
    })

    app.get('/*', (req, res) => {
        res.redirect('/');
    })

    // handle all express errors
    app.use((_, __, res, ___) => {
        return fail(res, "error.api.generic");
    })

    randomizeCiphers();
    setInterval(randomizeCiphers, 1000 * 60 * 30); // shuffle ciphers every 30 minutes

    env.subscribe(['externalProxy', 'httpProxyValues'], () => {
        // TODO: remove env.externalProxy in a future version
        const options = {};
        if (env.externalProxy) {
            options.httpProxy = env.externalProxy;
        }

        setGlobalDispatcher(
            new EnvHttpProxyAgent(options)
        );
    });

    http.createServer(app).listen({
        port: env.apiPort,
        host: env.listenAddress,
        reusePort: env.instanceCount > 1 || undefined
    }, () => {
        if (isPrimary) {
            console.log(`\n` +
                Bright(Cyan("Kibelt ")) + Bright("API ^ω^") + "\n" +

                "~~~~~~\n" +
                Bright("version: ") + version + "\n" +
                Bright("commit: ") + git.commit + "\n" +
                Bright("branch: ") + git.branch + "\n" +
                Bright("remote: ") + git.remote + "\n" +
                Bright("start time: ") + startTime.toUTCString() + "\n" +
                "~~~~~~\n" +

                Bright("url: ") + Bright(Cyan(env.apiURL)) + "\n" +
                Bright("port: ") + env.apiPort + "\n"
            );
        }

        if (env.apiKeyURL) {
            APIKeys.setup(env.apiKeyURL);
        }

        if (env.cookiePath) {
            Cookies.setup(env.cookiePath);
        }

        if (env.ytSessionServer) {
            YouTubeSession.setup();
        }
    });

    setupTunnelHandler();
}
