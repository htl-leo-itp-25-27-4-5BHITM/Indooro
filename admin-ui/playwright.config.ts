import { defineConfig } from "@playwright/test";

// Parallel checkouts on one machine need their own port: `ADMIN_TEST_PORT=5186 npm run test:browser`.
const port = Number(process.env.ADMIN_TEST_PORT ?? 4188);

export default defineConfig({
  testDir: "tests/browser",
  timeout: 30_000,
  projects: [
    { name: "functional", testIgnore: ["**/visual/**", "**/a11y.spec.ts"] },
    { name: "a11y", testMatch: "**/a11y.spec.ts", timeout: 60_000 },
    {
      name: "visual",
      testMatch: "**/visual/**/*.spec.ts",
      use: { reducedMotion: "reduce", locale: "de-AT", timezoneId: "Europe/Vienna", colorScheme: "light" },
      expect: { toHaveScreenshot: { animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.005 } }
    }
  ],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium"
  },
  webServer: {
    command: "node scripts/serve-candidate.mjs",
    url: `http://127.0.0.1:${port}/admin/next/`,
    env: { ADMIN_TEST_PORT: String(port) },
    reuseExistingServer: false
  }
});
