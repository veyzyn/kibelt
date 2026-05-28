import type { ReactNode } from "react";
import { Download, ExternalLink, ImageIcon, Film, FileWarning } from "lucide-react";

import type {
    KibeltResponse,
    LocalProcessingResponse,
    PickerResponse,
    TunnelResponse,
} from "@/lib/kibelt/types";
import { describeError } from "@/lib/kibelt/errors";
import { triggerDownload as downloadUrl } from "@/lib/download";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/animate-ui/components/buttons/copy";

/** Small monospace status label — editorial, not a pill. */
function Tag({ children }: { children: ReactNode }) {
    return (
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {children}
        </span>
    );
}

function ResultHeader({ tag, detail }: { tag: string; detail: string }) {
    return (
        <div className="flex items-center gap-3">
            <Tag>{tag}</Tag>
            <span className="h-px flex-1 bg-border" />
            <span className="max-w-[60%] truncate text-sm text-muted-foreground" title={detail}>
                {detail}
            </span>
        </div>
    );
}

function TunnelResult({ data }: { data: TunnelResponse }) {
    const isRedirect = data.status === "redirect";
    return (
        <div className="flex flex-col gap-4">
            <ResultHeader tag={isRedirect ? "redirect" : "tunnel"} detail={data.filename} />
            <div className="flex items-center gap-2">
                <Button
                    className="h-11 flex-1 rounded-lg font-semibold"
                    onClick={() => downloadUrl(data.url, data.filename)}
                >
                    {isRedirect ? (
                        <ExternalLink className="size-4" />
                    ) : (
                        <Download className="size-4" />
                    )}
                    {isRedirect ? "Open / download" : "Download"}
                </Button>
                <CopyButton
                    content={data.url}
                    variant="outline"
                    size="lg"
                    className="size-11 rounded-lg border-border bg-background/40"
                    aria-label="Copy link"
                />
            </div>
        </div>
    );
}

function PickerResult({ data }: { data: PickerResponse }) {
    return (
        <div className="flex flex-col gap-4">
            <ResultHeader tag="picker" detail={`${data.picker.length} items`} />

            {data.audio && (
                <Button
                    variant="outline"
                    className="justify-start rounded-lg border-border bg-background/40"
                    onClick={() => downloadUrl(data.audio!, data.audioFilename)}
                >
                    <Download className="size-4" />
                    Download background audio
                </Button>
            )}

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {data.picker.map((item, i) => (
                    <button
                        key={`${item.url}-${i}`}
                        onClick={() => downloadUrl(item.url)}
                        className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-background/40 transition-colors hover:border-foreground/40"
                    >
                        {item.thumb ? (
                            <img
                                src={item.thumb}
                                alt={`item ${i + 1}`}
                                loading="lazy"
                                className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                            />
                        ) : (
                            <div className="flex size-full items-center justify-center text-muted-foreground">
                                {item.type === "photo" ? (
                                    <ImageIcon className="size-6" />
                                ) : (
                                    <Film className="size-6" />
                                )}
                            </div>
                        )}
                        <div className="absolute inset-0 flex items-end justify-between bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                            <span className="font-mono text-[10px] uppercase tracking-wider text-white">
                                {item.type}
                            </span>
                            <Download className="size-4 text-white" />
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}

function LocalProcessingResult({ data }: { data: LocalProcessingResponse }) {
    return (
        <div className="flex flex-col gap-4">
            <ResultHeader tag="local-processing" detail={`${data.service} · ${data.type}`} />
            <p className="text-sm leading-relaxed text-muted-foreground">
                This file needs to be remuxed/transcoded locally, which the web
                client doesn't do yet. You can still download the raw parts below
                and merge them with a native client.
            </p>
            <div className="flex flex-col gap-2">
                {data.tunnel.map((url, i) => (
                    <Button
                        key={url}
                        variant="outline"
                        className="justify-start rounded-lg border-border bg-background/40 font-normal"
                        onClick={() =>
                            downloadUrl(
                                url,
                                data.tunnel.length > 1
                                    ? `${i + 1}-${data.output.filename}`
                                    : data.output.filename,
                            )
                        }
                    >
                        <Download className="size-4" />
                        Part {i + 1} — {data.output.filename}
                    </Button>
                ))}
            </div>
        </div>
    );
}

function ErrorResult({ message }: { message: string }) {
    return (
        <div className="flex items-start gap-3">
            <FileWarning className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="flex flex-col gap-1">
                <Tag>error</Tag>
                <p className="text-sm text-foreground">{message}</p>
            </div>
        </div>
    );
}

export function ResultView({ response }: { response: KibeltResponse }) {
    switch (response.status) {
        case "tunnel":
        case "redirect":
            return <TunnelResult data={response} />;
        case "picker":
            return <PickerResult data={response} />;
        case "local-processing":
            return <LocalProcessingResult data={response} />;
        case "error":
            return <ErrorResult message={describeError(response.error)} />;
    }
}
