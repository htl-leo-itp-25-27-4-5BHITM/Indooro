import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { ROUTE_CUTOVER } from "../../backend/indooro_server/src/main/resources/META-INF/resources/admin/route-cutover.js";

// Disposable packaged-stack comparison. Fixture documents are removed directly
// from the local OpenSearch index because the public category API has no delete.
const base = process.env.ADMIN_SMOKE_BASE_URL || "http://localhost:8080";
const searchBase = process.env.ADMIN_SMOKE_OPENSEARCH_URL || "http://127.0.0.1:9200";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(searchBase).hostname), "fixture cleanup requires local OpenSearch");
const evidenceDir = new URL("../../docs/admin-rebuild/evidence/categories/", import.meta.url);
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8"));
const [adminUser, regionUser, storeUser] = realm.users;
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP host.docker.internal 127.0.0.1"] : [] });
const stamp = randomUUID().slice(0, 8).toUpperCase();
const fixtureCodes = [];

async function login(user) {
  const page = await browser.newPage();
  await page.goto(base + "/admin/next/categories/", { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill(user.username);
  await page.locator("#password").fill(user.credentials.find((item) => item.type === "password").value);
  await page.locator("#kc-login").click();
  await page.waitForURL("**/admin/next/categories/**");
  return page;
}

async function api(page, method, path, data) {
  const response = await page.context().request.fetch(base + path, { method, data, failOnStatusCode: false });
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = raw; }
  return { status: response.status(), body };
}

function ok(result, label) {
  assert.equal(result.status, 200, `${label}: HTTP ${result.status} ${JSON.stringify(result.body).slice(0, 250)}`);
  return result.body;
}

async function forceLegacy(page) {
  await page.route("**/admin/route-cutover.js", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace(/categories: (true|false)/, "categories: false") });
  });
}

async function candidate(page) {
  await page.goto(base + "/admin/next/categories/?probe=categories#candidate", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Kategorien", exact: true }).waitFor();
  await page.getByRole("region", { name: "Kategorie-Ergebnisse" }).waitFor();
}

try {
  mkdirSync(evidenceDir, { recursive: true });
  const admin = await login(adminUser);
  const region = await login(regionUser);
  const store = await login(storeUser);
  await forceLegacy(admin);
  const listed = ok(await api(admin, "GET", "/api/categories?size=500"), "category inventory");
  const used = new Set(listed.map((item) => item.categoryCode));
  const free = Array.from({ length: 149 }, (_, index) => 850 + index).filter((code) => !used.has(code));
  assert.ok(free.length >= 2 && listed.length < 500, "two visible disposable category codes are required");
  const [legacyCode, candidateCode] = free;
  fixtureCodes.push(legacyCode, candidateCode);

  await admin.goto(base + "/admin/categories/?probe=categories#legacy", { waitUntil: "domcontentloaded" });
  await admin.locator("#page-content table").waitFor();
  assert.equal(new URL(admin.url()).pathname, "/admin/categories/");
  assert.equal(await admin.locator("#page-content th").allTextContents().then((values) => values.map((value) => value.trim()).join("|")), "Code|Name|Aktionen");
  assert.equal(await admin.locator("#page-content tbody tr").count(), listed.length, "legacy and candidate source lists cover the same categories");
  await admin.screenshot({ path: new URL("legacy-admin.png", evidenceDir).pathname });
  await admin.locator("[data-open-category]").focus();
  await admin.keyboard.press("Enter");
  await admin.locator(".drawer #categoryCode").fill(String(legacyCode));
  await admin.locator(".drawer #categoryName").fill(`Legacy Kategorie ${stamp}`);
  await admin.locator(".drawer button.primary").focus();
  await admin.keyboard.press("Enter");
  await admin.locator("#page-content tbody tr").filter({ hasText: `Legacy Kategorie ${stamp}` }).waitFor();
  assert.equal(ok(await api(admin, "GET", `/api/categories/${legacyCode}`), "legacy create").categoryName, `Legacy Kategorie ${stamp}`);
  await admin.locator("#page-content tbody tr").filter({ hasText: `Legacy Kategorie ${stamp}` }).getByRole("button", { name: "Bearbeiten" }).focus();
  await admin.keyboard.press("Enter");
  await admin.locator(".drawer #categoryName").fill(`Legacy Kategorie ${stamp} editiert`);
  await admin.locator(".drawer button.primary").focus();
  await admin.keyboard.press("Enter");
  await admin.locator("#page-content tbody tr").filter({ hasText: `Legacy Kategorie ${stamp} editiert` }).waitFor();
  assert.equal(ok(await api(admin, "GET", `/api/categories/${legacyCode}`), "legacy edit").categoryName, `Legacy Kategorie ${stamp} editiert`);
  await admin.locator("[data-open-category-import]").click();
  await admin.locator(".drawer #payload").fill(`[{"categoryCode":${legacyCode},"categoryName":"Import ${stamp}"}]`);
  await admin.locator(".drawer button.primary").click();
  await admin.locator(".drawer [data-import-review]").getByText("Commit gesperrt.").waitFor();
  assert.equal(ok(await api(admin, "GET", `/api/categories/${legacyCode}`), "legacy import review").categoryName, `Legacy Kategorie ${stamp} editiert`);

  await candidate(admin);
  await admin.getByRole("heading", { name: `${listed.length + 1} Kategorien`, exact: true }).waitFor();
  await admin.getByRole("cell", { name: `Legacy Kategorie ${stamp} editiert` }).waitFor();
  await admin.reload();
  await admin.getByRole("region", { name: "Kategorie-Ergebnisse" }).waitFor();
  assert.equal(new URL(admin.url()).searchParams.get("probe"), "categories");
  assert.equal(new URL(admin.url()).hash, "#candidate");
  await admin.getByRole("searchbox", { name: "Suche" }).fill(stamp);
  await admin.getByRole("cell", { name: `Legacy Kategorie ${stamp} editiert` }).waitFor();
  await admin.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await admin.screenshot({ path: new URL("candidate-admin.png", evidenceDir).pathname, fullPage: true });
  await admin.getByRole("searchbox", { name: "Suche" }).fill("does-not-exist-" + stamp);
  await admin.getByText("Keine Kategorie passt zur Suche.").waitFor();
  await admin.getByRole("searchbox", { name: "Suche" }).fill("");
  await admin.getByRole("button", { name: "Kategorie anlegen" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("spinbutton", { name: "Kategorie-Code" }).fill(String(legacyCode));
  await admin.getByRole("textbox", { name: "Name" }).fill(`Nicht ersetzen ${stamp}`);
  await admin.getByRole("button", { name: "Speichern" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("alert").filter({ hasText: "existiert bereits" }).waitFor();
  assert.equal(ok(await api(admin, "GET", `/api/categories/${legacyCode}`), "candidate duplicate guard").categoryName, `Legacy Kategorie ${stamp} editiert`);
  await admin.getByRole("spinbutton", { name: "Kategorie-Code" }).fill(String(candidateCode));
  await admin.getByRole("textbox", { name: "Name" }).fill(`Candidate Kategorie ${stamp}`);
  await admin.getByRole("button", { name: "Speichern" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("status").getByText(`Kategorie ${candidateCode} gespeichert.`).waitFor();
  assert.equal(ok(await api(admin, "GET", `/api/categories/${candidateCode}`), "candidate create").categoryName, `Candidate Kategorie ${stamp}`);
  await admin.getByRole("row").filter({ hasText: `Candidate Kategorie ${stamp}` }).getByRole("button", { name: "Bearbeiten" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("textbox", { name: "Name" }).fill(`Candidate Kategorie ${stamp} editiert`);
  await admin.getByRole("button", { name: "Speichern" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("cell", { name: `Candidate Kategorie ${stamp} editiert` }).waitFor();
  assert.equal(ok(await api(admin, "GET", `/api/categories/${candidateCode}`), "candidate edit").categoryName, `Candidate Kategorie ${stamp} editiert`);
  await admin.getByLabel("JSON-Array oder NDJSON").fill(`[{"categoryCode":${candidateCode},"categoryName":"Import ${stamp}"}]`);
  await admin.getByRole("button", { name: "Parsen und prüfen" }).click();
  await admin.getByRole("button", { name: "Commit nicht verfügbar" }).waitFor();
  assert.equal(ok(await api(admin, "GET", `/api/categories/${candidateCode}`), "candidate import review").categoryName, `Candidate Kategorie ${stamp} editiert`);

  let failOnce = true;
  await admin.route("**/api/categories?size=500", (route) => {
    if (failOnce) { failOnce = false; return route.fulfill({ status: 503, json: { error: "Injected category list failure" } }); }
    return route.continue();
  });
  await admin.reload();
  await admin.getByRole("alert").getByRole("button", { name: "Erneut versuchen" }).waitFor();
  assert.equal(await admin.getByRole("button", { name: "Bearbeiten" }).count(), 0, "failed reload hides stale actions");
  await admin.getByRole("button", { name: "Erneut versuchen" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("cell", { name: `Candidate Kategorie ${stamp} editiert` }).waitFor();
  await admin.unroute("**/api/categories?size=500");

  await admin.route("**/api/categories?size=500", (route) => route.fulfill({ json: [] }));
  await admin.reload();
  await admin.getByRole("region", { name: "Kategorie-Ergebnisse" }).getByText("Keine Kategorie passt zur Suche.").waitFor();
  await admin.unroute("**/api/categories?size=500");
  await admin.reload();
  await admin.getByRole("cell", { name: `Candidate Kategorie ${stamp} editiert` }).waitFor();

  for (const [page, label] of [[region, "region"], [store, "store"]]) {
    await page.goto(base + "/admin/next/categories/", { waitUntil: "domcontentloaded" });
    await page.getByRole("alert").filter({ hasText: "Zugriff verweigert" }).waitFor();
    assert.equal((await api(page, "POST", "/api/categories?createOnly=true", { categoryCode: candidateCode, categoryName: `Denied ${stamp}` })).status, 403, `${label} write denial`);
    await forceLegacy(page);
    await page.goto(base + "/admin/categories/", { waitUntil: "domcontentloaded" });
    await page.locator("#page-title").getByText("Kein Zugriff").waitFor();
  }

  if (ROUTE_CUTOVER.categories) {
    const committed = await login(adminUser);
    await committed.goto(base + "/admin/categories/?probe=committed#proof", { waitUntil: "domcontentloaded" });
    await committed.waitForURL((url) => url.pathname === "/admin/next/categories/" && url.searchParams.get("probe") === "committed" && url.hash === "#proof");
    await committed.getByRole("region", { name: "Kategorie-Ergebnisse" }).waitFor();
  }

  console.log(JSON.stringify({ result: "PASS", legacyCandidateCreateEdit: true, fullCandidateCount: true, atomicDuplicateGuard: true, importReviewNoWrite: true, directRefresh: true, keyboard: true, emptySearch: true, emptyApi: true, faultRetry: true, scopedDenials: true, committedCategoriesRedirect: ROUTE_CUTOVER.categories, fixtureCleanup: true }));
} finally {
  for (const code of fixtureCodes) {
    const response = await fetch(`${searchBase}/categories/_doc/${code}`);
    if (!response.ok) continue;
    const document = await response.json();
    if (!document._source?.categoryName?.includes(stamp)) continue;
    const deleted = await fetch(`${searchBase}/categories/_doc/${code}?refresh=true`, { method: "DELETE" });
    assert.ok(deleted.ok, `cleanup category ${code}: HTTP ${deleted.status}`);
  }
  await browser.close();
}
