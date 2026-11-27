/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base "./" keeps the build portable: dist/ can be served from any sub-path or opened via any static host.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    manifest: true,
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      output: {
        // Keep vendor boundaries explicit so deferred views stay deferred.
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (!id.includes("/node_modules/")) return;
          if (/\/(react|react-dom|scheduler)\//.test(id)) return "react-vendor";
          if (/\/three\//.test(id)) return "three-vendor";
          if (/\/(motion|motion-dom|motion-utils|framer-motion)\//.test(id)) return "motion-vendor";
        }
      }
    }
  },
  server: { port: 4316 },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node"
  }
});
