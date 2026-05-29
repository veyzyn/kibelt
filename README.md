# Kibelt

Kibelt is a fork of [cobalt](https://github.com/imputnet/cobalt) for saving
public media links through an open, keyless API — with a fast web client to
drive it.

- **web** → https://kibe.lol
- **API** → https://dl.kibe.lol

## Open API, no keys

The API is open to anyone — no sign-ups, tokens, or captchas. Just append a link
to a base URL:

```
https://kibe.lol/<link>      # redirects straight to the file (just download)
https://dl.kibe.lol/<link>   # returns JSON — a download url + metadata
```

For the full request/response schema (the `POST /` endpoint and all options),
see the [API docs](/docs/api.md).

## Layout

- [api](/api/) — the processing API/server (forked cobalt backend, AGPL-3.0).
- [frontend](/frontend/) — the Kibelt web client (Vite + React + Tailwind, hand-rolled flat UI).
- [web](/web/) — cobalt's original SvelteKit client, retained from upstream and **not used** by Kibelt.
- [packages](/packages/) — shared workspace packages.
- [docs](/docs/) — guides and API documentation.

## Local development

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

Override ports/host with `WEB_PORT`, `API_PORT`, `API_HOST`. To point the web
client at a different API (e.g. a public one), set `VITE_KIBELT_API_URL`. The
runner lives in [scripts/dev.mjs](/scripts/dev.mjs).

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

## License & attribution

Kibelt is derived from cobalt by [imput](https://github.com/imputnet). The
forked backend (`/api`, `/packages`) — including Kibelt's modifications — stays
under [AGPL-3.0](LICENSE), with attribution preserved. cobalt's original web
client under `/web` keeps its own upstream license and branding.

"cobalt" and its branding belong to imput; Kibelt is an independent fork and is
not affiliated with or endorsed by imput.
