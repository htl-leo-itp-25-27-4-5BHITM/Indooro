import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4188",
    browserName: "chromium"
  },
  webServer: {
    command: "node scripts/serve-candidate.mjs",
    url: "http://127.0.0.1:4188/admin/next/",
    reuseExistingServer: false
  }
});
