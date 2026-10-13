import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Exercise every current URL with one simulated map flag, then its rollback.
// The committed route map remains unchanged by these intercepted responses.
const base = process.env.ADMIN_SMOKE_BASE_URL || "http://localhost:8080";
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8"));
const user = realm.users[0];
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP host.docker.internal 127.0.0.1"] : [] });
const page = await browser.newPage();

try {
  await page.goto(`${base}/admin/`, { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill(user.username);
  await page.locator("#password").fill(user.credentials.find((item) => item.type === "password").value);
  await page.locator("#kc-login").click();
  await page.waitForURL("**/admin/");

  const entries = [
    ["dashboard", "/admin/", "/admin/next/"],
    ["regions", "/admin/regions/", "/admin/next/regions/"],
    ["stores", "/admin/stores/", "/admin/next/stores/"],
    ["storeDetail", "/admin/stores/detail/?storeId=00000000-0000-0000-0000-000000000000", "/admin/next/stores/detail/"],
    ["beacons", "/admin/beacons/", "/admin/next/beacons/"],
    ["products", "/admin/products/", "/admin/next/products/"],
    ["categories", "/admin/categories/", "/admin/next/categories/"],
    ["recipes", "/admin/recipes/", "/admin/next/recipes/"],
    ["editor", "/admin/editor/?storeId=00000000-0000-0000-0000-000000000000", "/admin/next/editor/"],
    ["diagnostics", "/admin/server-logs/", "/admin/next/server-logs/"],
  ];
  let override = null;
  await page.route("**/admin/route-cutover.js", async (route) => {
    const response = await route.fetch();
    const original = await response.text();
    const currentValue = override && original.match(new RegExp(`\\b${override.key}: (true|false)\\b`));
    assert.ok(!override || currentValue, `missing map key ${override?.key}`);
    const body = override ? original.replace(`${override.key}: ${currentValue[1]}`, `${override.key}: ${override.value}`) : original;
    await route.fulfill({ response, body });
  });

  for (const [key, legacy, candidate] of entries) {
    override = { key, value: true };
    const probe = legacy.includes("?") ? `${legacy}&probe=1#proof` : `${legacy}?probe=1#proof`;
    await page.goto(base + probe, { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.pathname === candidate && url.searchParams.get("probe") === "1" && url.hash === "#proof");
    await page.locator("#root").waitFor();

    override = { key, value: false };
    await page.goto(base + probe, { waitUntil: "domcontentloaded" });
    await page.locator(legacy.startsWith("/admin/editor/") ? "#toolSelect" : "#admin-root .nav").waitFor();
    assert.equal(new URL(page.url()).pathname, new URL(legacy, base).pathname, `rollback ${key}`);
  }

  override = null;
  console.log(JSON.stringify({ result: "PASS", switchedAndRolledBack: entries.length, committedFlagsChanged: false }));
} finally {
  await browser.close();
}
