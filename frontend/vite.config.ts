import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        // Accept the Host header forwarded by the reverse proxy (Caddy /
        // Cloudflare) in front of the dev server. localhost is always allowed.
        allowedHosts: ["kibe.lol", "kibelt.nocturne.gay"],
    },
});
