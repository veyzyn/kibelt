// OpenGraph embedding for link-preview crawlers.
//
// When a crawler (Discordbot, Telegram, Slack, …) fetches a kibe.lol/<link>
// shortcut we hand back a small HTML page whose OpenGraph / Twitter-card meta
// tags make the platform render the media inline — the vxtwitter / kkinstagram
// trick. Discord reliably fires its video player off `og:video`, which a bare
// media redirect does not, so this is what actually embeds video.
//
// Services attach an optional `meta` to their result ({ width, height,
// thumbnail, title, author }) so the card shows the post caption + author
// instead of looking empty.

// User-agents of services that fetch a page purely to build a link preview.
const EMBED_CRAWLER_RE = new RegExp([
    "discordbot",
    "telegrambot",
    "twitterbot",
    "slackbot",
    "slack-imgproxy",
    "whatsapp",
    "facebookexternalhit",
    "vkshare",
    "redditbot",
    "skypeuripreview",
    "embedly",
    "iframely",
    "mastodon",
    "pinterest",
].join("|"), "i");

export function isEmbedCrawler(userAgent) {
    if (!userAgent) return false;
    return EMBED_CRAWLER_RE.test(userAgent);
}

const VIDEO_EXT = new Set(["mp4", "webm", "mov", "m4v", "mkv"]);
const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);
const AUDIO_EXT = new Set(["mp3", "m4a", "opus", "ogg", "oga", "wav", "flac"]);

const VIDEO_MIME = {
    mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm",
    mkv: "video/x-matroska", mov: "video/quicktime",
};
const AUDIO_MIME = {
    mp3: "audio/mpeg", m4a: "audio/mp4", opus: "audio/opus",
    ogg: "audio/ogg", oga: "audio/ogg", wav: "audio/wav", flac: "audio/flac",
};

const extOf = (value) => {
    if (!value) return "";
    const clean = String(value).split(/[?#]/, 1)[0];
    const m = clean.toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : "";
};

// Discord uses og:video:width/height as the player aspect ratio; keep them sane
// and fall back to 16:9 when a service didn't give us dimensions.
const clampDim = (n) => {
    const v = Math.round(Number(n));
    if (!Number.isFinite(v) || v <= 0 || v > 10000) return undefined;
    return v;
};

const escapeHtml = (value) =>
    String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

const truncate = (value, max = 280) => {
    const s = String(value ?? "").replace(/\s+/g, " ").trim();
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

// Turn a resolved match result body into a normalized media descriptor, or null
// if there's nothing embeddable (errors, local-processing, empty pickers).
export function describeEmbedMedia(body) {
    if (!body || typeof body !== "object") return null;

    const meta = body.meta || {};
    const common = {
        title: meta.title ? truncate(meta.title) : undefined,
        author: meta.author ? truncate(meta.author, 96) : undefined,
        width: clampDim(meta.width),
        height: clampDim(meta.height),
    };

    if (body.status === "picker") {
        const first = Array.isArray(body.picker) ? body.picker[0] : undefined;
        if (!first?.url) return null;

        const isVideo = first.type === "video" || VIDEO_EXT.has(extOf(first.url));
        return {
            ...common,
            kind: isVideo ? "video" : "image",
            mediaUrl: first.url,
            posterUrl: isVideo ? first.thumb : undefined,
        };
    }

    if (body.status !== "tunnel" && body.status !== "redirect") return null;
    if (!body.url) return null;

    const ext = extOf(body.filename) || extOf(body.url);
    let kind;
    if (ext === "gif" || IMAGE_EXT.has(ext)) kind = "image";
    else if (AUDIO_EXT.has(ext)) kind = "audio";
    else kind = "video";

    return {
        ...common,
        kind,
        mediaUrl: body.url,
        posterUrl: meta.thumbnail,
    };
}

// Render the meta-tag page. `sourceUrl` is the original post link (humans get
// bounced there; crawlers read the OG tags). Returns an HTML string, or null
// when the body has nothing to embed.
export function renderResultEmbed(body, sourceUrl, siteName = "kibelt") {
    const media = describeEmbedMedia(body);
    if (!media) return null;

    let host = siteName;
    try {
        if (sourceUrl) host = new URL(sourceUrl).hostname.replace(/^www\./, "");
    } catch { /* not a parseable URL — keep the site name */ }

    // Heading line of the card = author when we have one, else the source host.
    // Body line = the post caption/text.
    const heading = media.author || host;
    const description = media.title;

    const esc = escapeHtml;
    const tags = [
        `<meta charset="utf-8">`,
        `<meta name="theme-color" content="#a3d977">`,
        `<meta property="og:site_name" content="${esc(siteName)}">`,
        `<title>${esc(heading)}</title>`,
        `<meta property="og:title" content="${esc(heading)}">`,
    ];
    if (sourceUrl) tags.push(`<meta property="og:url" content="${esc(sourceUrl)}">`);
    if (description) {
        tags.push(`<meta property="og:description" content="${esc(description)}">`);
        tags.push(`<meta name="description" content="${esc(description)}">`);
    }

    if (media.kind === "video") {
        const width = media.width || 1280;
        const height = media.height || 720;
        const type = VIDEO_MIME[extOf(media.mediaUrl)] || "video/mp4";
        tags.push(
            `<meta property="og:type" content="video.other">`,
            `<meta property="og:video" content="${esc(media.mediaUrl)}">`,
            `<meta property="og:video:url" content="${esc(media.mediaUrl)}">`,
            `<meta property="og:video:secure_url" content="${esc(media.mediaUrl)}">`,
            `<meta property="og:video:type" content="${type}">`,
            `<meta property="og:video:width" content="${width}">`,
            `<meta property="og:video:height" content="${height}">`,
            `<meta name="twitter:card" content="player">`,
            `<meta name="twitter:player:stream" content="${esc(media.mediaUrl)}">`,
            `<meta name="twitter:player:stream:content_type" content="${type}">`,
            `<meta name="twitter:player:width" content="${width}">`,
            `<meta name="twitter:player:height" content="${height}">`,
        );
        if (media.posterUrl) tags.push(`<meta property="og:image" content="${esc(media.posterUrl)}">`);
    } else if (media.kind === "audio") {
        const type = AUDIO_MIME[extOf(media.mediaUrl)] || "audio/mpeg";
        tags.push(
            `<meta property="og:type" content="music.song">`,
            `<meta property="og:audio" content="${esc(media.mediaUrl)}">`,
            `<meta property="og:audio:secure_url" content="${esc(media.mediaUrl)}">`,
            `<meta property="og:audio:type" content="${type}">`,
            `<meta name="twitter:card" content="summary">`,
        );
        if (media.posterUrl) tags.push(`<meta property="og:image" content="${esc(media.posterUrl)}">`);
    } else {
        tags.push(
            `<meta property="og:type" content="website">`,
            `<meta property="og:image" content="${esc(media.mediaUrl)}">`,
            `<meta name="twitter:card" content="summary_large_image">`,
            `<meta name="twitter:image" content="${esc(media.mediaUrl)}">`,
        );
        if (media.width) tags.push(`<meta property="og:image:width" content="${media.width}">`);
        if (media.height) tags.push(`<meta property="og:image:height" content="${media.height}">`);
    }

    // Crawlers don't run JS; the refresh is for humans who open the link.
    const redirectTarget = sourceUrl || media.mediaUrl;
    return `<!doctype html>
<html lang="en">
<head>
${tags.join("\n")}
<meta http-equiv="refresh" content="0; url=${esc(redirectTarget)}">
</head>
<body>
<p>Redirecting to <a href="${esc(redirectTarget)}">${esc(redirectTarget)}</a>…</p>
</body>
</html>`;
}
