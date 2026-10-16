import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/admin/next/",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true }
});
