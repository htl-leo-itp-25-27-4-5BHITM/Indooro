export default {
  testDir: "backend/indooro_server/src/test/playwright",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4177",
    viewport: { width: 1440, height: 950 }
  },
  webServer: {
    command: "node scripts/serve-admin-smoke.mjs",
    url: "http://127.0.0.1:4177/admin/",
    reuseExistingServer: false
  }
};
