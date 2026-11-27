import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  snapshotPathTemplate: '{testDir}/snapshots/{projectName}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  expect: {
    toHaveScreenshot: { animations: 'disabled', maxDiffPixelRatio: 0.005 },
  },
  use: {
    baseURL: 'http://127.0.0.1:4188',
    browserName: 'chromium',
    locale: 'de-AT',
    timezoneId: 'Europe/Vienna',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium-390', use: { viewport: { width: 390, height: 844 } } },
    { name: 'chromium-768', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'chromium-1440', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'node server.mjs',
    url: 'http://127.0.0.1:4188',
    reuseExistingServer: false,
  },
});
