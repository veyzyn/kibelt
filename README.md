# Kibelt

Kibelt is a fork of [cobalt](https://github.com/imputnet/cobalt) for saving public media links through an open API, with a web client to drive it.

## Layout

- [api tree & readme](/api/) — the processing API/server.
- [frontend](/frontend/) — the web client (Vite + React + Tailwind + shadcn/ui, animate-ui flourishes).
- [packages tree](/packages/)
- [docs tree](/docs/)

## Local Development

Install dependencies:

```sh
corepack pnpm install
```

### Run everything (recommended)

A single command starts both the API and the web client with prefixed logs and
clean shutdown:

```sh
corepack pnpm dev
```

- web → http://localhost:5273/
- API → http://localhost:9000/

Override ports/host with `WEB_PORT`, `API_PORT`, `API_HOST` env vars. The runner
lives in [scripts/dev.mjs](/scripts/dev.mjs).

### Run individually

```sh
corepack pnpm dev:api   # API only (runner sets API_URL/CORS for you)
corepack pnpm dev:web   # web client only
```

To run the API completely by hand (without the runner), it needs `API_URL`:

```powershell
cd api
$env:API_URL = "http://localhost:9000/"
corepack pnpm start
```

## Attribution

Kibelt is derived from cobalt by imput. The original cobalt code is AGPL-3.0; Kibelt keeps that license for the forked backend code.
