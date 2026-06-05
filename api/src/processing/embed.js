// Bare-media embedding for link-preview crawlers.
//
// When a crawler (Discordbot, Telegram, Slack, …) fetches a kibe.lol/<link>
// shortcut we send it straight to the proxied media instead of the usual file
// redirect. Because the media tunnels through us with a real image/video
// content-type (and CORP open), the platform renders it as bare inline media —
// just the video player / image, with no rich embed card around it.
//
// Discord only fires its *video* embedder when the URL path looks like a media
// file, so for our `/tunnel` links we tack on a `media.<ext>` path segment. The
// stream signature doesn't cover the path and the tunnel handler only reads the
// query, so the suffix is purely cosmetic.

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

const extOf = (value) => {
    if (!value) return "";
    const clean = String(value).split(/[?#]/, 1)[0];
    const m = clean.toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : "";
};

// The media URL + a file extension for the single thing a crawler should see.
function pickMedia(body) {
    if (!body || typeof body !== "object") return null;

    if (body.status === "tunnel" || body.status === "redirect") {
        if (!body.url) return null;
        return { url: body.url, ext: extOf(body.filename) || extOf(body.url) || "mp4" };
    }

    if (body.status === "picker") {
        const first = Array.isArray(body.picker) ? body.picker[0] : undefined;
        if (!first?.url) return null;

        let ext = extOf(first.url);
        if (!ext) {
            ext = first.type === "photo" ? "jpg"
                : first.type === "gif" ? "gif"
                : "mp4";
        }
        return { url: first.url, ext };
    }

    return null;
}

// URL to send a crawler to for bare inline media. For our own `/tunnel` links we
// add a `media.<ext>` path segment so Discord recognizes it as a direct media
// file and renders a player/image with no embed card. Returns null when there's
// nothing to point at (errors, local-processing, empty picker).
export function inlineMediaUrl(body) {
    const media = pickMedia(body);
    if (!media) return null;

    try {
        const url = new URL(media.url);
        if (url.pathname === "/tunnel" && media.ext) {
            url.pathname = `/tunnel/media.${media.ext}`;
            return url.toString();
        }
    } catch {
        // not a parseable URL — fall through and return it untouched
    }

    return media.url;
}
