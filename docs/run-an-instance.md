# how to run a Kibelt instance
this tutorial will help you run your own Kibelt processing instance. if your instance is public-facing, we highly recommend that you also [protect it from abuse](/docs/protect-an-instance.md) using api keys or other abuse controls.

## using docker compose (recommended)
to run Kibelt in docker, you need to have `docker` and `docker-compose` installed and configured. Kibelt doesn't publish a prebuilt image, so the compose file below builds it straight from the repo.

if you need help with installing docker, you can find more information here:
- [how to install docker](https://docs.docker.com/engine/install/)
- [how to install docker compose](https://docs.docker.com/compose/install/)

## how to run Kibelt with docker compose:
1. create a folder for the Kibelt config file, something like this:
    ```sh
    mkdir kibelt
    ```

2. go to Kibelt folder, and create a docker compose config file:
    ```sh
    cd kibelt && nano docker-compose.yml
    ```
    i'm using `nano` in this example, it may not be available in your distro. you can use any other text editor.

3. copy and paste the [sample config from here](examples/docker-compose.example.yml) and edit it to your needs.
    make sure to replace default URLs with your own or Kibelt won't work correctly.

4. finally, build & start the Kibelt container (from the Kibelt directory):
    ```sh
    docker compose up -d --build
    ```

if you want your instance to support services that require authentication to view content (e.g. age-restricted twitter/x posts), create a `cookies.json` file in the same directory as `docker-compose.yml`. example cookies file [can be found here](examples/cookies.example.json).

to update later, rebuild from the latest source:
```sh
docker compose build --pull && docker compose up -d
```

it's highly recommended to use a reverse proxy (such as nginx or caddy) if you want your instance to face the public internet. look up tutorials online.

## run Kibelt API outside of docker (useful for local development)
requirements:
- node.js >= 18
- git
- pnpm

1. clone the repo.
2. go to api directory: `cd kibelt/api`.
3. install dependencies: `pnpm install`.
4. create `.env` file in the same directory.
5. add needed environment variables to `.env` file. only `API_URL` is required to run Kibelt.
    - if you don't know what api url to use for local development, use `http://localhost:9000/`.
6. run Kibelt: `pnpm start`.

### ubuntu 22.04 workaround
`nscd` needs to be installed and running so that the `ffmpeg-static` binary can resolve DNS ([#101](https://github.com/imputnet/cobalt/issues/101#issuecomment-1494822258)):

```bash
sudo apt install nscd
sudo service nscd start
```

## list of environment variables
[this section has moved](/docs/api-env-variables.md) to a dedicated document that is way easier to understand and maintain. go check it out!
