import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, ChevronDown, ClipboardPaste, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
    RippleButton,
    RippleButtonRipples,
} from "@/components/animate-ui/components/buttons/ripple";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/animate-ui/components/radix/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Input } from "@/components/ui/input";
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
        <div className="relative z-10 flex min-h-screen flex-col">
            <Toaster theme="dark" position="top-center" />

            {/* Top bar */}
            <header className="border-b border-border">
                <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-5 sm:px-6">
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
            <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 pt-16 sm:px-6 sm:pt-24">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                    <p className="mb-4 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        Media downloader
                    </p>
                    <h1 className="font-display text-6xl leading-[0.95] tracking-tight sm:text-7xl">
                        Save what
                        <br />
                        you <span className="italic">love</span>.
                    </h1>
                    <p className="mt-6 max-w-md text-[15px] leading-relaxed text-muted-foreground">
                        Paste a link from{" "}
                        {serviceCount > 0 ? `any of ${serviceCount}` : "dozens of"}{" "}
                        supported services and pull the media straight down — no ads,
                        no trackers, no clutter.
                    </p>
                </motion.div>

                {/* Command bar */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
                    className="mt-10"
                >
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-stretch">
                        <div className="group relative flex-1">
                            <Input
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") submit();
                                }}
                                placeholder="https://…"
                                inputMode="url"
                                autoComplete="off"
                                spellCheck={false}
                                aria-label="Media link"
                                className="h-13 rounded-lg border-border bg-card pl-4 pr-12 font-mono text-[15px] shadow-none transition-colors placeholder:font-mono placeholder:text-muted-foreground/60 focus-visible:border-foreground/30 focus-visible:ring-0"
                            />
                            <button
                                type="button"
                                onClick={pasteFromClipboard}
                                aria-label="Paste from clipboard"
                                className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                                <ClipboardPaste className="size-4" />
                            </button>
                        </div>
                        <RippleButton
                            onClick={submit}
                            disabled={loading}
                            className="group h-13 min-w-[8.5rem] cursor-pointer gap-2 rounded-lg bg-primary px-5 text-[15px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                        >
                            <RippleButtonRipples />
                            {loading ? (
                                <>
                                    <Loader2 className="size-4 animate-spin" />
                                    Working
                                </>
                            ) : (
                                <>
                                    Download
                                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                                </>
                            )}
                        </RippleButton>
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowOptions((v) => !v)}
                        className="mt-3 flex items-center gap-1.5 rounded text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                        {showOptions ? "Hide options" : "Options"}
                        <ChevronDown
                            className={cn(
                                "size-3.5 transition-transform",
                                showOptions && "rotate-180",
                            )}
                        />
                    </button>
                </motion.div>

                {showOptions && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className="overflow-hidden"
                    >
                        <div className="mt-5 rounded-xl border border-border bg-card/40 p-4 sm:p-5">
                            <OptionsPanel settings={settings} onChange={setSettings} />
                        </div>
                    </motion.div>
                )}

                {result && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="mt-5 rounded-xl border border-border bg-card p-4 sm:p-5"
                    >
                        <ResultView response={result} />
                    </motion.div>
                )}
            </main>

            {/* Footer */}
            <footer className="mt-20 border-t border-border">
                <div className="mx-auto flex w-full max-w-3xl flex-col items-start justify-between gap-1 px-5 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:px-6">
                    <span>
                        Kibelt — a fork of{" "}
                        <span className="text-foreground/70">cobalt</span>
                    </span>
                    <span className="font-mono text-muted-foreground/70">
                        {getApiBaseUrl()}
                    </span>
                </div>
            </footer>
        </div>
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
              ? "bg-emerald-500"
              : "bg-destructive";
    const text =
        reachable === null
            ? "connecting"
            : reachable
              ? "operational"
              : "offline";

    return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="relative flex size-1.5">
                {reachable && (
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                )}
                <span className={cn("relative inline-flex size-1.5 rounded-full", dot)} />
            </span>
            <span className="tabular-nums">
                {text}
                {reachable && version && (
                    <span className="text-muted-foreground/60"> · v{version}</span>
                )}
            </span>
            {reachable && services.length > 0 && (
                <>
                    <span className="text-muted-foreground/40">·</span>
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
                className="w-[min(24rem,86vw)] p-3"
            >
                <p className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Supported services
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                    {sorted.map((name) => (
                        <span
                            key={name}
                            className="truncate rounded-md border border-border bg-background/50 px-2 py-1 text-center text-[11px] capitalize text-foreground/80"
                            title={name}
                        >
                            {name}
                        </span>
                    ))}
                </div>
            </TooltipContent>
        </Tooltip>
    );
}
