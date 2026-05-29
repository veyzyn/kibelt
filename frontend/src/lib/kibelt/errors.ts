import type { ErrorResponse } from "./types";

// Maps machine-readable error codes from the API to short, user-facing copy.
// Codes arrive like "error.api.link.invalid" or "error.api.content.too_long".
const ERROR_MESSAGES: Record<string, string> = {
    "error.local.network":
        "Couldn't reach the Kibelt API. Check that it's running and the URL is correct.",
    "error.local.invalid_response": "The API returned a response we couldn't read.",
    "error.api.rate_exceeded": "You're being rate limited. Try again in a moment.",
    "error.api.capacity": "The server is at capacity right now. Try again shortly.",
    "error.api.generic": "Something went wrong while processing your link.",
    "error.api.unknown_response": "The source service returned something unexpected.",
    "error.api.service.unsupported": "This service isn't supported.",
    "error.api.service.disabled": "This service is disabled on this instance.",
    "error.api.service.audio_not_supported": "Audio-only isn't supported for this service.",
    "error.api.link.invalid": "That doesn't look like a valid link.",
    "error.api.link.unsupported": "This kind of link isn't supported.",
    "error.api.link.missing": "Please paste a link first.",
    "error.api.invalid_body": "The request was malformed.",
    "error.api.fetch.fail": "Couldn't fetch media from the source service.",
    "error.api.fetch.critical": "The source service failed in a way we can't recover from.",
    "error.api.fetch.empty": "The source service returned no media.",
    "error.api.fetch.rate": "The source service is rate limiting us. Try again later.",
    "error.api.fetch.short_link": "Couldn't resolve that short link.",
    "error.api.content.too_long": "This media is longer than the instance allows.",
    "error.api.content.video.unavailable": "This video is unavailable.",
    "error.api.content.video.private": "This video is private.",
    "error.api.content.video.age": "This video is age-restricted.",
    "error.api.content.video.region": "This video is region-locked.",
    "error.api.content.post.unavailable": "This post is unavailable.",
    "error.api.content.post.private": "This post is private.",
    "error.api.content.post.age": "This post is age-restricted.",
    "error.api.youtube.unsupported":
        "YouTube links are currently unsupported — we're working to support them.",
    "error.api.youtube.login": "YouTube requires authentication for this video.",
    "error.api.youtube.token_expired": "The instance's YouTube token expired.",
    "error.api.youtube.no_hls_streams": "No HLS streams available for this video.",
    "error.api.auth.key.missing": "This instance requires an API key.",
    "error.api.auth.key.invalid": "The provided API key is invalid.",
    "error.api.auth.key.not_found": "The provided API key was not found.",
    "error.api.auth.jwt.missing": "Authentication is required.",
    "error.api.auth.jwt.invalid": "Your session is invalid or expired.",
    "error.api.auth.turnstile.missing": "A captcha challenge is required.",
    "error.api.auth.turnstile.invalid": "The captcha challenge failed.",
    "error.api.auth.not_configured": "Authentication isn't configured on this instance.",
};

export function describeError(error: ErrorResponse["error"]): string {
    const { code, context } = error;
    let message = ERROR_MESSAGES[code];

    // Service-scoped codes look like "error.api.service.<name>.<code>" —
    // fall back to the generic suffix if there's no exact match.
    if (!message && code.startsWith("error.api.service.")) {
        const suffix = code.split(".").slice(-1)[0];
        message = `This service failed (${suffix.replace(/_/g, " ")}).`;
    }

    if (!message) {
        // Prettify an unknown code as a last resort.
        const tail = code.replace(/^error\.(api\.)?/, "").replace(/[._]/g, " ");
        message = tail ? `Error: ${tail}.` : "An unknown error occurred.";
    }

    if (context?.service) {
        message = `${message} (${context.service})`;
    }
    if (typeof context?.limit === "number" && code === "error.api.content.too_long") {
        const minutes = Math.round(context.limit / 60);
        message = `This media exceeds the ${minutes} min limit on this instance.`;
    }

    return message;
}
