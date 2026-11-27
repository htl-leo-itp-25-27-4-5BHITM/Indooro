import { defineConfig, devices } from "@playwright/test";

const PORT = 4317;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // The first-visit tour hint (toast after 6 s) would cover controls in slow runs; mark it as seen.
    storageState: {
      cookies: [],
      origins: [{ origin: `http://127.0.0.1:${PORT}`, localStorage: [{ name: "indooro-pilot-tour-hint", value: "1" }] }]
    },
    // Functional specs run with reduced motion: the app then skips the continuously rendering WebGL hero and its
    // exit/enter transitions (AnimatePresence mode="wait" tab swaps, smooth scroll), which starve slow CI runners
    // of CPU and make tab panels, scroll targets and tour steps lag behind the state. The 3D specs opt back in.
    reducedMotion: "reduce",
    trace: "retain-on-failure"
  },
  projects: [
    { name: "a11y", testDir: "tests/a11y", use: { ...devices["Desktop Chrome"], launchOptions: { args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] } } },
    { name: "desktop", testIgnore: "**/visual/**", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", testIgnore: "**/visual/**", use: { ...devices["Pixel 7"] } },
    {
      name: "visual",
      testMatch: "**/visual/**/*.spec.ts",
      snapshotPathTemplate: "{testDir}/visual/snapshots/{testFilePath}/{arg}-{platform}{ext}",
      expect: {
        toHaveScreenshot: { animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.005 }
      },
      use: {
        ...devices["Desktop Chrome"],
        reducedMotion: "reduce",
        locale: "de-AT",
        timezoneId: "Europe/Vienna",
        colorScheme: "light",
        launchOptions: { args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] }
      }
    }
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI
  }
});
