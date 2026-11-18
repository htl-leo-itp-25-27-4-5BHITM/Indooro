import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Chromium-Pfad: PW_CHROMIUM_PATH (explizit) > erster Treffer unter /opt/pw-browsers/chromium-* > Playwright-Standard.
 * Auf normalen Entwicklungsrechnern bleibt der Pfad undefiniert und Playwright nutzt seinen eigenen Browser.
 */
function findChromium(): string | undefined {
  const fromEnv = process.env.PW_CHROMIUM_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const root = "/opt/pw-browsers";
  try {
    for (const dir of readdirSync(root).filter((d) => /^chromium-\d+/.test(d)).sort()) {
      for (const sub of readdirSync(join(root, dir)).filter((d) => /^chrome-linux/.test(d))) {
        const exe = join(root, dir, sub, "chrome");
        if (existsSync(exe)) return exe;
      }
    }
  } catch {
    /* kein /opt/pw-browsers: Standard-Browser */
  }
  return undefined;
}

const executablePath = findChromium();
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4318",
    trace: "retain-on-failure",
    launchOptions,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 }, launchOptions }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: "npm run build && npm run preview",
    url: "http://127.0.0.1:4318",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
