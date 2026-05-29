#!/usr/bin/env node
// All-in-one dev runner: starts the Kibelt API and the frontend together.
//
//   node scripts/dev.mjs           # both API + web   (corepack pnpm dev)
//   node scripts/dev.mjs api       # API only         (corepack pnpm dev:api)
//   node scripts/dev.mjs web       # web client only  (corepack pnpm dev:web)
//
// Env overrides:
//   API_PORT   port the API listens on            (default 9000)
//   WEB_PORT   port the Vite dev server listens on (default 5273)
//   API_HOST   host used to build API_URL          (default localhost)

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const API_PORT = process.env.API_PORT || "9000";
const WEB_PORT = process.env.WEB_PORT || "5273";
const API_HOST = process.env.API_HOST || "localhost";
// Public-facing API URL. Honour an explicit override (e.g. behind a reverse
// proxy with TLS) and otherwise fall back to the local host:port.
const API_URL = process.env.API_URL || `http://${API_HOST}:${API_PORT}/`;
// What the browser client should call. Defaults to the API URL above, but can
// differ from it when the web client and API live on separate public domains.
const WEB_API_URL = process.env.VITE_KIBELT_API_URL || API_URL;

const isWindows = process.platform === "win32";

// Which services to run: "api", "web", or both (default).
const only = (process.argv[2] || "").toLowerCase();
const runApi = only !== "web";
const runWeb = only !== "api";

// ── pretty prefixed logging ──────────────────────────────────────────────
const colors = {
    reset: "\x1b[0m",
    dim: "\x1b[2m",
    bold: "\x1b[1m",
    api: "\x1b[38;5;213m", // pink
    web: "\x1b[38;5;81m", // cyan
    sys: "\x1b[38;5;245m", // grey
};

function makeLogger(label, color) {
    const tag = `${color}${colors.bold}${label.padEnd(3)}${colors.reset} ${colors.dim}│${colors.reset} `;
    let buffer = "";
    return (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
            process.stdout.write(`${tag}${line}\n`);
        }
    };
}

function sys(msg) {
    process.stdout.write(`${colors.sys}${colors.bold}dev${colors.reset} ${colors.dim}│${colors.reset} ${msg}\n`);
}

// ── child process spawning ───────────────────────────────────────────────
const children = [];

function run(label, color, command, args, options) {
    const log = makeLogger(label, color);
    const child = spawn(command, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env, FORCE_COLOR: "1" },
        shell: isWindows, // resolve corepack/npm shims on Windows
        stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", log);
    child.stderr.on("data", log);

    child.on("exit", (code, signal) => {
        if (!shuttingDown) {
            sys(`${color}${colors.bold}${label}${colors.reset} exited (${signal || `code ${code}`}). Shutting everything down.`);
            shutdown(code ?? 1);
        }
    });

    children.push(child);
    return child;
}

// ── graceful shutdown ────────────────────────────────────────────────────
let shuttingDown = false;

function killChild(child) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    if (isWindows) {
        // Kill the whole process tree (corepack → pnpm → node).
        spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
            stdio: "ignore",
        });
    } else {
        child.kill("SIGTERM");
    }
}

function shutdown(code = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) killChild(child);
    setTimeout(() => process.exit(code), 400);
}

process.on("SIGINT", () => {
    sys("Stopping…");
    shutdown(0);
});
process.on("SIGTERM", () => shutdown(0));

// ── go ───────────────────────────────────────────────────────────────────
sys(`${colors.bold}Kibelt${colors.reset} dev environment`);
if (runApi) sys(`API  → ${colors.api}${API_URL}${colors.reset}`);
if (runWeb) sys(`web  → ${colors.web}http://localhost:${WEB_PORT}/${colors.reset}`);
sys("");

if (runApi) {
    run("api", colors.api, "node", ["src/kibelt.js"], {
        cwd: resolve(root, "api"),
        env: {
            API_URL,
            API_PORT,
            // open CORS so the web origin (and anyone else) can call the API
            CORS_WILDCARD: process.env.CORS_WILDCARD ?? "1",
        },
    });
}

if (runWeb) {
    run("web", colors.web, "corepack", [
        "pnpm",
        "--filter",
        "@kibelt/frontend",
        "exec",
        "vite",
        "--port",
        WEB_PORT,
        "--strictPort",
    ], {
        cwd: root,
        env: {
            VITE_KIBELT_API_URL: WEB_API_URL,
        },
    });
}
