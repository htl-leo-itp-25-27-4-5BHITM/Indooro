import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Compare the authenticated legacy dashboard with its candidate without
// changing the committed route-cutover map. Passwords come from the local
// Keycloak realm file and are never included in output.
const base = process.env.ADMIN_SMOKE_BASE_URL || "http://localhost:8080";
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8").replace(/\$\{(\w+)\}/g, (match, name) => process.env[name] ?? match));
const [adminUser, regionUser, storeUser] = realm.users;
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP host.docker.internal 127.0.0.1"] : [] });

async function login(user) {
  const page = await browser.newPage();
  await page.goto(`${base}/admin/`, { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill(user.username);
  await page.locator("#password").fill(user.credentials.find((item) => item.type === "password").value);
  await page.locator("#kc-login").click();
  await page.waitForURL("**/admin/**", { timeout: 15_000 });
  return page;
}

async function json(page, path) {
  const response = await page.context().request.get(`${base}${path}`);
  assert.equal(response.status(), 200, `${path}: HTTP ${response.status()}`);
  return response.json();
}

async function legacyDashboard(page) {
  await page.route("**/admin/route-cutover.js", async (route) => {
    const response = await route.fetch();
    const original = await response.text();
    const match = original.match(/dashboard: (true|false)/);
    assert.ok(match, "dashboard key exists in route-cutover map");
    await route.fulfill({ response, body: original.replace(`dashboard: ${match[1]}`, "dashboard: false") });
  });
  await page.goto(`${base}/admin/?parity=legacy`, { waitUntil: "domcontentloaded" });
  await page.locator("#page-content .stat").first().waitFor();
  assert.equal(new URL(page.url()).pathname, "/admin/", "legacy dashboard remains selected with an intercepted map");
  const body = (await page.locator("#page-content").innerText()).replace(/\s+/g, " ").trim();
  assert.ok(body.length > 30, "legacy dashboard rendered meaningful content");
  const metrics = await page.locator("#page-content .stat").evaluateAll((items) => items.map((item) => ({ label: item.querySelector(".stat-label")?.textContent?.trim(), value: Number(item.querySelector(".stat-value")?.textContent?.trim()) })));
  assert.equal(metrics.length, 4, "legacy dashboard rendered all four metrics");
  const actions = await page.locator("#page-actions a, #page-content a").evaluateAll((links) => links.map((link) => ({ text: link.textContent.trim(), href: link.getAttribute("href") })));
  return { title: await page.locator("#page-title").textContent(), text: body, metrics, actions };
}

async function legacyEmptyAndFault(page) {
  const emptyRegions = (route) => route.fulfill({ json: [] });
  const emptyStores = (route) => route.fulfill({ json: { content: [], page: 0, size: 20, totalElements: 0 } });
  const emptyBeacons = (route) => route.fulfill({ json: [] });
  await page.route("**/api/regions", emptyRegions);
  await page.route("**/api/stores", emptyStores);
  await page.route("**/api/beacons", emptyBeacons);
  await page.reload();
  await page.locator("#page-content .stat").first().waitFor();
  const emptyValues = await page.locator("#page-content .stat-value").allTextContents();
  assert.deepEqual(emptyValues.map(Number), [0, 0, 0, 0], "legacy dashboard renders zero values for empty APIs");
  await page.getByText("Alles wirkt einsatzbereit.").waitFor();
  await page.unroute("**/api/regions", emptyRegions);
  await page.unroute("**/api/stores", emptyStores);
  await page.unroute("**/api/beacons", emptyBeacons);

  const failedRegions = (route) => route.fulfill({ status: 503, json: { error: "Injected dashboard fault" } });
  await page.route("**/api/regions", failedRegions);
  await page.reload();
  await page.locator("#page-content .stat").first().waitFor();
  const regionValue = await page.locator("#page-content .stat").first().locator(".stat-value").textContent();
  assert.equal(Number(regionValue), 0, "legacy dashboard substitutes zero after a region API failure");
  assert.equal(await page.getByRole("button", { name: "Erneut versuchen" }).count(), 0, "legacy dashboard has no retry action");
  await page.unroute("**/api/regions", failedRegions);
}

async function candidateDashboard(page, role, expected) {
  await page.unroute("**/admin/route-cutover.js");
  await page.goto(`${base}/admin/next/?parity=candidate`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Dashboard" }).waitFor();
  const metrics = page.getByRole("region", { name: "Kennzahlen" });
  for (const [label, value] of Object.entries({ "Regionen": expected["Regionen"], Stores: expected.Stores, "Layouts offen": expected["Layouts offen"], "Freie Beacons": expected["Freie Beacons"] })) {
    assert.equal(Number(await metrics.locator(".metric").filter({ hasText: label }).locator("strong").textContent()), value, `${role} candidate ${label}`);
  }
  assert.equal(await page.getByRole("heading", { name: "Letzte Aktivitäten" }).count(), role === "admin" ? 1 : 0, `${role} activity visibility`);
  if (role === "admin" && expected.recentActivity) assert.ok((await page.locator(".dashboard .activity").innerText()).includes(expected.recentActivity), "candidate dashboard shows a recent server audit entry");
  assert.equal(await page.getByRole("link", { name: "Store anlegen" }).count(), role === "store-manager" ? 0 : 1, `${role} create-store action`);
  const relevantLinks = await page.locator(".dashboard a").evaluateAll((links) => links.map((link) => ({ text: link.textContent.trim(), href: link.getAttribute("href") })));
  assert.ok(relevantLinks.some((link) => link.href === "/admin/next/stores/"), `${role} has store action destination`);
  if (role === "store-manager") assert.ok(relevantLinks.some((link) => link.href === `/admin/next/editor/?storeId=${expected.storeId}`), "store manager editor action targets assigned store");
  if (role === "region-manager") assert.ok(relevantLinks.some((link) => link.href === "/admin/next/stores/"), "region manager editor action resolves to scoped stores");
  if (role === "admin") assert.ok(relevantLinks.some((link) => link.href === "/admin/next/server-logs/"), "admin diagnostics action has candidate destination");

  await page.reload();
  await page.getByRole("region", { name: "Kennzahlen" }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("parity"), "candidate", `${role} direct link survives refresh`);

  await page.route("**/api/regions", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/stores?*", (route) => route.fulfill({ json: { content: [], page: 0, size: 1, totalElements: 0 } }));
  await page.route("**/api/beacons/free", (route) => route.fulfill({ json: [] }));
  if (role === "admin") await page.route("**/api/admin/logs?*", (route) => route.fulfill({ json: { entries: [] } }));
  await page.goto(`${base}/admin/next/?parity=empty`);
  await page.getByText("Keine offenen Einrichtungshinweise.").waitFor();
  if (role === "admin") await page.getByText("Keine Aktivitäten vorhanden.").waitFor();
  await page.unroute("**/api/regions");
  await page.unroute("**/api/stores?*");
  await page.unroute("**/api/beacons/free");
  if (role === "admin") await page.unroute("**/api/admin/logs?*");

  let fail = true;
  await page.route("**/api/regions", (route) => route.fulfill({ status: fail ? 503 : 200, json: fail ? { error: "Unavailable" } : expected.regionsData }));
  await page.goto(`${base}/admin/next/?parity=retry`);
  await page.getByRole("alert").getByRole("heading", { name: "Daten konnten nicht geladen werden" }).waitFor();
  fail = false;
  const retry = page.getByRole("button", { name: "Erneut versuchen" });
  await retry.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("region", { name: "Kennzahlen" }).waitFor();
  await page.unroute("**/api/regions");
  return relevantLinks;
}

try {
  const evidence = [];
  for (const [user, role] of [[adminUser, "admin"], [regionUser, "region-manager"], [storeUser, "store-manager"]]) {
    const page = await login(user);
    try {
      const current = await json(page, "/api/admin/me");
      assert.equal(current.role, role, `${role} authenticated identity`);
      const [regions, stores, missing, beacons] = await Promise.all([
        json(page, "/api/regions"), json(page, "/api/stores?size=1"),
        json(page, "/api/stores?size=1&hasActiveLayout=false"), json(page, "/api/beacons/free")
      ]);
      const expected = { "Regionen": regions.length, Stores: stores.totalElements, "Layouts offen": missing.totalElements, "Freie Beacons": beacons.length, storeId: current.scope?.storeId };
      const legacy = await legacyDashboard(page);
      if (role === "admin") {
        const logs = await json(page, "/api/admin/logs?limit=8");
        assert.ok(logs.entries?.length, "local admin dashboard has a recent audit fixture");
        expected.recentActivity = logs.entries[0].summary || logs.entries[0].action;
        assert.ok(legacy.text.includes(expected.recentActivity), "legacy dashboard shows the same recent audit entry");
      }
      if (role === "admin") await legacyEmptyAndFault(page);
      const actions = await candidateDashboard(page, role, { ...expected, regionsData: regions });
      evidence.push({ role, scope: current.scope, legacyTitle: legacy.title?.trim(), legacyContentLength: legacy.text.length, legacyMetrics: legacy.metrics, legacyActions: legacy.actions, candidateMetrics: { regions: expected.Regionen, stores: expected.Stores, freeBeacons: expected["Freie Beacons"], missingLayouts: expected["Layouts offen"] }, candidateActions: actions, emptyState: true, refresh: true, keyboardRetry: true });
    } finally {
      await page.close();
    }
  }
  console.log(JSON.stringify({ result: "PASS", comparedRoles: evidence, routeMapChanged: false, parityLimits: "Legacy admin empty and fault states substitute zero and have no retry; candidate shows explicit empty and retry states. Legacy scoped dashboards expose Store anlegen and Diagnose links that candidate restricts by role. Legacy Store totals can truncate at the first page; candidate uses totalElements." }));
} finally {
  await browser.close();
}
