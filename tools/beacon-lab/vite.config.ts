/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Indooro Positioning Lab – standalone, runs fully local. No proxy to any Indooro backend.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  server: { port: 4317, strictPort: true },
  preview: { port: 4318, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: true },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
  },
});
