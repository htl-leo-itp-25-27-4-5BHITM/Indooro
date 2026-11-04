/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base "./" keeps the build portable: dist/ can be served from any sub-path or opened via any static host.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist", emptyOutDir: true, target: "es2022" },
  server: { port: 4316 },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node"
  }
});
