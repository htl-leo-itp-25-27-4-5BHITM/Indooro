/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Indooro Positioning Lab – standalone, runs fully local. No proxy to any Indooro backend.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  // Explicit IPv4 loopback: "localhost" resolves to ::1 on some systems (e.g. GitHub's Ubuntu 24.04 runners),
  // while Playwright polls http://127.0.0.1:4318 – the web server would never be reached.
  server: { host: "127.0.0.1", port: 4317, strictPort: true },
  preview: { host: "127.0.0.1", port: 4318, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: true },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
  },
});
