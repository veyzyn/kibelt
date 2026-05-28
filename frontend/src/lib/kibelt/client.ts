import type {
    InstanceInfo,
    KibeltRequest,
    KibeltResponse,
} from "./types";

const DEFAULT_API_URL = "http://localhost:9000/";

/** Base URL of the Kibelt API, configurable via VITE_KIBELT_API_URL. */
export function getApiBaseUrl(): string {
    const raw = import.meta.env.VITE_KIBELT_API_URL ?? DEFAULT_API_URL;
    return raw.endsWith("/") ? raw : `${raw}/`;
}

export interface RateLimit {
    limit?: number;
    remaining?: number;
    reset?: number;
}

export interface ProcessResult {
    response: KibeltResponse;
    rateLimit: RateLimit;
}

function parseRateLimit(headers: Headers): RateLimit {
    const num = (key: string) => {
        const v = headers.get(key);
        return v == null ? undefined : Number(v);
    };
    return {
        limit: num("RateLimit-Limit") ?? num("RateLimit-Policy"),
        remaining: num("RateLimit-Remaining"),
        reset: num("RateLimit-Reset"),
    };
}

export interface ProcessOptions {
    apiKey?: string;
    bearer?: string;
    signal?: AbortSignal;
}

/** Calls `POST /` — the main processing endpoint. */
export async function processLink(
    body: KibeltRequest,
    options: ProcessOptions = {},
): Promise<ProcessResult> {
    const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
    };
    if (options.apiKey) headers.Authorization = `Api-Key ${options.apiKey}`;
    else if (options.bearer) headers.Authorization = `Bearer ${options.bearer}`;

    let res: Response;
    try {
        res = await fetch(getApiBaseUrl(), {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: options.signal,
        });
    } catch (err) {
        if ((err as Error).name === "AbortError") throw err;
        // Network/CORS failure — surface as a synthetic error response.
        return {
            response: {
                status: "error",
                error: { code: "error.local.network" },
            },
            rateLimit: {},
        };
    }

    const rateLimit = parseRateLimit(res.headers);

    let response: KibeltResponse;
    try {
        response = (await res.json()) as KibeltResponse;
    } catch {
        response = {
            status: "error",
            error: { code: "error.local.invalid_response" },
        };
    }

    return { response, rateLimit };
}

/** Calls `GET /` for instance info. Returns null if unreachable. */
export async function getInstanceInfo(
    signal?: AbortSignal,
): Promise<InstanceInfo | null> {
    try {
        const res = await fetch(getApiBaseUrl(), {
            method: "GET",
            headers: { Accept: "application/json" },
            signal,
        });
        if (!res.ok) return null;
        return (await res.json()) as InstanceInfo;
    } catch {
        return null;
    }
}
