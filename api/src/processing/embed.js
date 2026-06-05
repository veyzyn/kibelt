// Bare-media embedding for link-preview crawlers.
//
// When a crawler (Discordbot, Telegram, Slack, …) fetches a kibe.lol/<link>
// shortcut we send it straight to the proxied media instead of the usual file
// redirect. Because the media tunnels through us with a real image/video
// content-type (and CORP open), the platform renders it as bare inline media —
// just the video player / image, with no rich embed card around it.

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

// The single media URL a crawler should be pointed at so the platform shows it
// as bare inline media. Returns null when there's nothing to point at (errors,
// local-processing, empty pickers) so the caller can fall back to normal flow.
export function pickMediaUrl(body) {
    if (!body || typeof body !== "object") return null;

    if (body.status === "tunnel" || body.status === "redirect") {
        return body.url || null;
    }

    if (body.status === "picker") {
        const first = Array.isArray(body.picker) ? body.picker[0] : undefined;
        return first?.url || null;
    }

    return null;
}
