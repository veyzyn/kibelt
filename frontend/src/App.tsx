import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, ClipboardPaste, Loader2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/animate-ui/components/radix/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { CopyButton } from "@/components/animate-ui/components/buttons/copy";
import {
    DEFAULT_SETTINGS,
    OptionsPanel,
    type DownloadSettings,
} from "@/components/options-panel";
import { ResultView } from "@/components/result-view";
import {
    getApiBaseUrl,
    getInstanceInfo,
    processLink,
} from "@/lib/kibelt/client";
import { describeError } from "@/lib/kibelt/errors";
import { triggerDownload } from "@/lib/download";
import type {
    InstanceInfo,
    KibeltRequest,
    KibeltResponse,
} from "@/lib/kibelt/types";
import { cn } from "@/lib/utils";

function buildRequest(url: string, s: DownloadSettings): KibeltRequest {
    return {
        url: url.trim(),
        downloadMode: s.downloadMode,
        videoQuality: s.videoQuality,
        audioFormat: s.audioFormat,
        audioBitrate: s.audioBitrate,
        filenameStyle: s.filenameStyle,
        disableMetadata: s.disableMetadata,
        alwaysProxy: s.alwaysProxy,
        tiktokFullAudio: s.tiktokFullAudio,
        youtubeHLS: s.youtubeHLS,
    };
}

export function App() {
    const [url, setUrl] = useState("");
    const [settings, setSettings] = useState<DownloadSettings>(DEFAULT_SETTINGS);
    const [showOptions, setShowOptions] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<KibeltResponse | null>(null);
    const [info, setInfo] = useState<InstanceInfo | null>(null);
    const [reachable, setReachable] = useState<boolean | null>(null);

    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        getInstanceInfo(controller.signal).then((data) => {
            setInfo(data);
            setReachable(data !== null);
        });
        return () => controller.abort();
    }, []);

    const submit = useCallback(async () => {
        const trimmed = url.trim();
        if (!trimmed) {
            toast.error("Paste a link first.");
            return;
        }

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setResult(null);
        try {
            const { response } = await processLink(buildRequest(trimmed, settings), {
                signal: controller.signal,
            });
            setResult(response);
            if (response.status === "error") {
                toast.error(describeError(response.error));
            } else if (
                settings.autoDownload &&
                (response.status === "tunnel" || response.status === "redirect")
            ) {
                triggerDownload(response.url, response.filename);
                toast.success(
                    response.status === "redirect"
                        ? "Opening source link…"
                        : `Downloading ${response.filename}`,
                );
            }
        } catch (err) {
            if ((err as Error).name !== "AbortError") {
                toast.error("Request failed unexpectedly.");
            }
        } finally {
            setLoading(false);
        }
    }, [url, settings]);

    const pasteFromClipboard = useCallback(async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) setUrl(text.trim());
        } catch {
            toast.error("Couldn't read the clipboard.");
        }
    }, []);

    const meta = info?.kibelt ?? info?.cobalt;
    const serviceCount = meta?.services?.length ?? 0;

    return (
        <div className="flex min-h-screen flex-col">
            <Toaster theme="dark" position="top-center" />

            {/* Top bar */}
            <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-sm">
                <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-5">
                    <div className="flex items-center gap-2.5">
                        <img src="/kibelt.svg" alt="" className="size-5" />
                        <span className="text-[15px] font-semibold tracking-tight">
                            Kibelt
                        </span>
                    </div>
                    <StatusBadge
                        reachable={reachable}
                        version={meta?.version}
                        services={meta?.services ?? []}
                    />
                </div>
            </header>

            {/* Main */}
            <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-5 pt-20 pb-16 sm:pt-28">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="w-full text-center"
                >
                    <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
                        Save what you love.
                    </h1>
                    <p className="mx-auto mt-5 max-w-md text-balance text-[15px] leading-relaxed text-muted-foreground">
                        Paste a link from{" "}
                        {serviceCount > 0 ? `any of ${serviceCount}` : "dozens of"}{" "}
                        supported services and pull the media straight down, no ads,
                        no trackers, no clutter.
                    </p>
                </motion.div>

                {/* Command bar */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
                    className="mt-10 w-full"
                >
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            submit();
                        }}
                        className="flex items-center gap-1.5 rounded-2xl border border-input bg-card p-1.5 transition-colors focus-within:border-foreground/35"
                    >
                        <input
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://…"
                            inputMode="url"
                            autoComplete="off"
                            spellCheck={false}
                            aria-label="Media link"
                            className="h-11 min-w-0 flex-1 bg-transparent px-3.5 font-mono text-[15px] outline-none placeholder:text-muted-foreground/50"
                        />
                        <button
                            type="button"
                            onClick={pasteFromClipboard}
                            aria-label="Paste from clipboard"
                            className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                            <ClipboardPaste className="size-[18px]" />
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="group flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-[15px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {loading ? (
                                <Loader2 className="size-[18px] animate-spin" />
                            ) : (
                                <>
                                    <span className="hidden sm:inline">Download</span>
                                    <ArrowRight className="size-[18px] transition-transform group-hover:translate-x-0.5" />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-3 flex justify-center">
                        <button
                            type="button"
                            onClick={() => setShowOptions((v) => !v)}
                            className={cn(
                                "flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                                showOptions
                                    ? "bg-accent text-foreground"
                                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                            )}
                        >
                            <SlidersHorizontal className="size-3.5" />
                            {showOptions ? "Hide options" : "Options"}
                        </button>
                    </div>
                </motion.div>

                {showOptions && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className="w-full overflow-hidden"
                    >
                        <div className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
                            <OptionsPanel settings={settings} onChange={setSettings} />
                        </div>
                    </motion.div>
                )}

                {result && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="mt-4 w-full rounded-2xl border border-border bg-card p-4 sm:p-5"
                    >
                        <ResultView response={result} />
                    </motion.div>
                )}
            </main>

            {/* Open-API callout */}
            <ApiHint />

            {/* Footer */}
            <footer className="border-t border-border">
                <div className="mx-auto flex w-full max-w-2xl items-center justify-center px-5 py-5 text-xs text-muted-foreground">
                    <span>
                        <a
                            href="https://github.com/veyzyn/kibelt"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground/80 underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
                        >
                            Kibelt
                        </a>{" "}
                        — a fork of{" "}
                        <a
                            href="https://github.com/imputnet/cobalt"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground/80 underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
                        >
                            cobalt.tools
                        </a>
                    </span>
                </div>
            </footer>
        </div>
    );
}

function ApiHint() {
    const webOrigin = (
        typeof window !== "undefined"
            ? window.location.origin
            : "https://kibe.lol"
    ).replace(/\/+$/, "");
    const apiBase = getApiBaseUrl().replace(/\/+$/, "");

    const short = (u: string) => u.replace(/^https?:\/\//, "");
    const dlPattern = `${short(webOrigin)}/<link>`;
    const jsonPattern = `${short(apiBase)}/<link>`;
    const jsonExample = `${apiBase}/https://vimeo.com/76979871`;

    return (
        <section className="border-t border-border">
            <div className="mx-auto w-full max-w-2xl px-5 py-8">
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    psst — no keys, no captchas
                </p>
                <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-muted-foreground">
                    Our API is open to anyone — no sign-ups, tokens, or robot
                    checks. Append a link to download it instantly, or hit{" "}
                    <code className="font-mono text-foreground/90">{short(apiBase)}</code>{" "}
                    for JSON (download url + metadata).{" "}
                    <a
                        href={jsonExample}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-foreground underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-foreground"
                    >
                        Try it
                    </a>
                    .
                </p>

                <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 px-3 py-1.5">
                        <span className="w-8 shrink-0 select-none font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            file
                        </span>
                        <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground/80">
                            {dlPattern}
                        </code>
                    </div>
                    <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 px-3 py-1.5">
                        <span className="w-8 shrink-0 select-none font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            json
                        </span>
                        <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground/80">
                            {jsonPattern}
                        </code>
                        <CopyButton
                            content={jsonExample}
                            variant="ghost"
                            size="xs"
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                            aria-label="Copy example request"
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}

function StatusBadge({
    reachable,
    version,
    services,
}: {
    reachable: boolean | null;
    version?: string;
    services: string[];
}) {
    const dot =
        reachable === null
            ? "bg-muted-foreground"
            : reachable
              ? "bg-ok"
              : "bg-destructive";
    const text =
        reachable === null
            ? "connecting"
            : reachable
              ? "operational"
              : "offline";

    return (
        <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <span className="relative flex size-1.5">
                {reachable && (
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" />
                )}
                <span className={cn("relative inline-flex size-1.5 rounded-full", dot)} />
            </span>
            <span className="tabular-nums">
                {text}
                {reachable && version && (
                    <span className="text-muted-foreground/55"> · v{version}</span>
                )}
            </span>
            {reachable && services.length > 0 && (
                <>
                    <span className="text-muted-foreground/35">·</span>
                    <ServicesTooltip services={services} />
                </>
            )}
        </div>
    );
}

function ServicesTooltip({ services }: { services: string[] }) {
    const sorted = [...services].sort((a, b) => a.localeCompare(b));
    return (
        <Tooltip delayDuration={120}>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    className="cursor-help text-muted-foreground underline decoration-dotted decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-foreground"
                >
                    {services.length} services
                </button>
            </TooltipTrigger>
            <TooltipContent
                side="bottom"
                align="end"
                className="w-[min(26rem,88vw)] p-4"
            >
                <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    {services.length} supported services
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px] leading-relaxed text-foreground/75">
                    {sorted.map((name, i) => (
                        <Fragment key={name}>
                            {i > 0 && (
                                <span
                                    aria-hidden
                                    className="text-muted-foreground/30"
                                >
                                    ·
                                </span>
                            )}
                            <span className="capitalize">{name}</span>
                        </Fragment>
                    ))}
                </div>
            </TooltipContent>
        </Tooltip>
    );
}
