import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/admin/next/",
  plugins: [react()],
  build: {
    manifest: true,
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Keep vendor boundaries explicit so deferred views stay deferred.
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (!id.includes("/node_modules/")) return;
          if (/\/(react|react-dom|scheduler)\//.test(id)) return "react-vendor";
        }
      }
    }
  }
});
