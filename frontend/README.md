# Kibelt Frontend

A web client for the Kibelt API. Paste a media link, pick your options, and
download. Built with **Vite + React + TypeScript + Tailwind v4 + shadcn/ui**,
with motion flourishes from [animate-ui](https://animate-ui.com).

## Local Commands

Install dependencies from the repository root:

```sh
corepack pnpm install
```

Run the dev server:

```sh
corepack pnpm --filter @kibelt/frontend dev
```

Type-check and build:

```sh
corepack pnpm --filter @kibelt/frontend build
```

## Configuration

The client connects to a Kibelt API instance via a build-time environment
variable. The frontend never hardcodes an API domain.

| Variable             | Default                  | Description              |
|:---------------------|:-------------------------|:-------------------------|
| `VITE_KIBELT_API_URL`| `http://localhost:9000/` | Base URL of the Kibelt API |

For production, create `.env` (or set the variable in your build environment):

```text
VITE_KIBELT_API_URL=https://api.example.com/
```

## What it does

- `GET /` on load to show instance status. The service count in the top bar
  reveals the full supported-services list on hover.
- `POST /` to process a pasted link, sending the selected options
  (download mode, video quality, audio format/bitrate, filename style, and
  toggles like disable-metadata, always-proxy, TikTok full audio, YouTube HLS).
- **Auto-download** (on by default, toggleable in options): when a link
  resolves to a single `tunnel`/`redirect` result, the download starts
  immediately instead of waiting for a click.
- Handles every documented response type:
  - **tunnel / redirect** — download button + copy-link button.
  - **picker** — a thumbnail grid; click an item to download it (plus optional
    background audio).
  - **local-processing** — explains it needs a native client and exposes the
    raw tunnel parts.
  - **error** — maps API error codes to friendly messages (see
    [`src/lib/kibelt/errors.ts`](src/lib/kibelt/errors.ts)).

## Structure

```
src/
  lib/kibelt/        API client, request/response types, error-code mapping
  components/
    ui/              shadcn/ui primitives
    animate-ui/      animate-ui components (stars background, ripple/copy buttons)
    options-panel.tsx  download options form
    result-view.tsx    renders each API response type
  App.tsx            page composition
```

## Adding registry components

shadcn components are added via the CLI from this directory. Because `pnpm` on
this machine is provided through corepack (not on `PATH`), a small shim in
`.shim/pnpm.cmd` forwards to `corepack pnpm` so the CLI's dependency install
step works:

```sh
# from frontend/, with .shim on PATH:
npx shadcn@latest add button input            # @shadcn registry
npx shadcn@latest add @animate-ui/components-buttons-ripple
```

Registries are configured in [`components.json`](components.json).
```

## Not done yet

- No Turnstile/captcha challenge flow (`POST /session` JWT).
- No in-browser remux/transcode for `local-processing` responses.
- No API-key entry UI (the client supports it; the field isn't surfaced).
