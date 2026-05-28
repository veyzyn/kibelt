import type {
    AudioBitrate,
    AudioFormat,
    DownloadMode,
    FilenameStyle,
    VideoQuality,
} from "@/lib/kibelt/types";
import { OptionSelect } from "@/components/option-select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export interface DownloadSettings {
    downloadMode: DownloadMode;
    videoQuality: VideoQuality;
    audioFormat: AudioFormat;
    audioBitrate: AudioBitrate;
    filenameStyle: FilenameStyle;
    disableMetadata: boolean;
    alwaysProxy: boolean;
    tiktokFullAudio: boolean;
    youtubeHLS: boolean;
    autoDownload: boolean;
}

export const DEFAULT_SETTINGS: DownloadSettings = {
    downloadMode: "auto",
    videoQuality: "1080",
    audioFormat: "mp3",
    audioBitrate: "128",
    filenameStyle: "basic",
    disableMetadata: false,
    alwaysProxy: false,
    tiktokFullAudio: false,
    youtubeHLS: false,
    autoDownload: true,
};

const DOWNLOAD_MODES = [
    { value: "auto", label: "Auto (video + audio)" },
    { value: "audio", label: "Audio only" },
    { value: "mute", label: "Mute (video, no audio)" },
] as const satisfies readonly { value: DownloadMode; label: string }[];

const VIDEO_QUALITIES = [
    { value: "max", label: "Max" },
    { value: "2160", label: "2160p (4K)" },
    { value: "1440", label: "1440p (2K)" },
    { value: "1080", label: "1080p" },
    { value: "720", label: "720p" },
    { value: "480", label: "480p" },
    { value: "360", label: "360p" },
    { value: "240", label: "240p" },
    { value: "144", label: "144p" },
] as const satisfies readonly { value: VideoQuality; label: string }[];

const AUDIO_FORMATS = [
    { value: "best", label: "Best" },
    { value: "mp3", label: "MP3" },
    { value: "opus", label: "Opus" },
    { value: "ogg", label: "Ogg" },
    { value: "wav", label: "WAV" },
] as const satisfies readonly { value: AudioFormat; label: string }[];

const AUDIO_BITRATES = [
    { value: "320", label: "320 kbps" },
    { value: "256", label: "256 kbps" },
    { value: "128", label: "128 kbps" },
    { value: "96", label: "96 kbps" },
    { value: "64", label: "64 kbps" },
    { value: "8", label: "8 kbps" },
] as const satisfies readonly { value: AudioBitrate; label: string }[];

const FILENAME_STYLES = [
    { value: "classic", label: "Classic" },
    { value: "pretty", label: "Pretty" },
    { value: "basic", label: "Basic" },
    { value: "nerdy", label: "Nerdy" },
] as const satisfies readonly { value: FilenameStyle; label: string }[];

function ToggleRow({
    id,
    label,
    description,
    checked,
    onCheckedChange,
}: {
    id: string;
    label: string;
    description: string;
    checked: boolean;
    onCheckedChange: (v: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background/40 px-3.5 py-3 transition-colors hover:bg-accent/40">
            <div className="flex flex-col">
                <Label htmlFor={id} className="text-sm font-medium">
                    {label}
                </Label>
                <span className="text-xs text-muted-foreground">{description}</span>
            </div>
            <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
        </div>
    );
}

export interface OptionsPanelProps {
    settings: DownloadSettings;
    onChange: (next: DownloadSettings) => void;
}

export function OptionsPanel({ settings, onChange }: OptionsPanelProps) {
    const set = <K extends keyof DownloadSettings>(
        key: K,
        value: DownloadSettings[K],
    ) => onChange({ ...settings, [key]: value });

    return (
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <OptionSelect
                    label="Download mode"
                    value={settings.downloadMode}
                    options={DOWNLOAD_MODES}
                    onChange={(v) => set("downloadMode", v)}
                />
                <OptionSelect
                    label="Video quality"
                    value={settings.videoQuality}
                    options={VIDEO_QUALITIES}
                    onChange={(v) => set("videoQuality", v)}
                />
                <OptionSelect
                    label="Audio format"
                    value={settings.audioFormat}
                    options={AUDIO_FORMATS}
                    onChange={(v) => set("audioFormat", v)}
                />
                <OptionSelect
                    label="Audio bitrate"
                    value={settings.audioBitrate}
                    options={AUDIO_BITRATES}
                    onChange={(v) => set("audioBitrate", v)}
                />
                <OptionSelect
                    label="Filename style"
                    value={settings.filenameStyle}
                    options={FILENAME_STYLES}
                    onChange={(v) => set("filenameStyle", v)}
                />
            </div>

            <ToggleRow
                id="autoDownload"
                label="Auto-download"
                description="Start the download as soon as a link resolves"
                checked={settings.autoDownload}
                onCheckedChange={(v) => set("autoDownload", v)}
            />

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <ToggleRow
                    id="disableMetadata"
                    label="Disable metadata"
                    description="Skip title, artist & other tags"
                    checked={settings.disableMetadata}
                    onCheckedChange={(v) => set("disableMetadata", v)}
                />
                <ToggleRow
                    id="alwaysProxy"
                    label="Always proxy"
                    description="Tunnel every file through the server"
                    checked={settings.alwaysProxy}
                    onCheckedChange={(v) => set("alwaysProxy", v)}
                />
                <ToggleRow
                    id="tiktokFullAudio"
                    label="TikTok full audio"
                    description="Grab the original sound"
                    checked={settings.tiktokFullAudio}
                    onCheckedChange={(v) => set("tiktokFullAudio", v)}
                />
                <ToggleRow
                    id="youtubeHLS"
                    label="YouTube HLS"
                    description="Use HLS formats from YouTube"
                    checked={settings.youtubeHLS}
                    onCheckedChange={(v) => set("youtubeHLS", v)}
                />
            </div>
        </div>
    );
}
