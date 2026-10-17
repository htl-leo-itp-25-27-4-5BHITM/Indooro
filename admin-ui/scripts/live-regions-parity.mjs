import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Regions route gate against the disposable packaged stack. The fixture is
// created and archived through the UI; demo scope assignments are read only.
const base = process.env.ADMIN_SMOKE_BASE_URL || "http://localhost:8080";
const evidenceDir = new URL("../../docs/admin-rebuild/evidence/regions/", import.meta.url);
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8").replace(/\$\{(\w+)\}/g, (match, name) => process.env[name] ?? match));
const [adminUser, regionUser, storeUser] = realm.users;
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP host.docker.internal 127.0.0.1"] : [] });

async function login(user) {
  const page = await browser.newPage();
  await page.goto(`${base}/admin/next/regions/`, { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill(user.username);
  await page.locator("#password").fill(user.credentials.find((item) => item.type === "password").value);
  await page.locator("#kc-login").click();
  await page.waitForURL("**/admin/next/regions/**");
  return page;
}

async function api(page, method, path, data) {
  const response = await page.context().request.fetch(`${base}${path}`, { method, data, failOnStatusCode: false });
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = raw; }
  return { status: response.status(), body };
}

function ok(result, label) {
  assert.equal(result.status, 200, `${label}: HTTP ${result.status} ${JSON.stringify(result.body).slice(0, 200)}`);
  return result.body;
}

async function forceLegacy(page) {
  const handler = async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/regions: (true|false)/, "regions: false");
    await route.fulfill({ response, body });
  };
  await page.route("**/admin/route-cutover.js", handler);
  return handler;
}

async function waitCandidate(page) {
  await page.getByRole("heading", { name: "Regionen" }).waitFor();
  await page.getByRole("heading", { name: "Übersicht" }).waitFor();
}

try {
  mkdirSync(evidenceDir, { recursive: true });
  const admin = await login(adminUser);
  assert.equal(ok(await api(admin, "GET", "/api/admin/me"), "admin identity").role, "admin");
  const stamp = randomUUID().slice(0, 8).toUpperCase();
  const code = `RG-${stamp}`;
  const name = `Region Gate ${stamp}`;

  const legacy = await forceLegacy(admin);
  await admin.goto(`${base}/admin/regions/?probe=regions#legacy`, { waitUntil: "domcontentloaded" });
  await admin.locator("#page-content table").waitFor();
  assert.equal(new URL(admin.url()).pathname, "/admin/regions/");
  assert.equal(await admin.locator("#page-actions [data-open-region]").count(), 1);
  assert.equal(await admin.locator("#page-content th").allTextContents().then((values) => values.map((value) => value.trim()).join("|")), "Code|Name|Status|Aktionen");
  const legacyCodes = await admin.locator("#page-content tbody tr td:first-child").allTextContents();
  await admin.screenshot({ path: new URL("legacy-admin.png", evidenceDir).pathname });
  const legacyCode = `RG-L-${stamp}`;
  await admin.locator("[data-open-region]").focus();
  await admin.keyboard.press("Enter");
  await admin.locator(".drawer h2").getByText("Region anlegen").waitFor();
  await admin.locator(".drawer #code").fill(legacyCode);
  await admin.locator(".drawer #name").fill(`Legacy ${name}`);
  await admin.locator(".drawer button.primary").focus();
  await admin.keyboard.press("Enter");
  await admin.locator("#page-content tbody tr").filter({ hasText: legacyCode }).waitFor();
  const legacyCreated = ok(await api(admin, "GET", "/api/regions?status=ACTIVE"), "legacy region create readback").find((item) => item.code === legacyCode);
  assert.ok(legacyCreated, "legacy create persists");
  await admin.locator("#page-content tbody tr").filter({ hasText: legacyCode }).getByRole("button", { name: "Bearbeiten" }).focus();
  await admin.keyboard.press("Enter");
  await admin.locator(".drawer #name").fill(`Legacy ${name} edit`);
  await admin.locator(".drawer button.primary").focus();
  await admin.keyboard.press("Enter");
  await admin.locator("#page-content tbody tr").filter({ hasText: `Legacy ${name} edit` }).waitFor();
  assert.equal(ok(await api(admin, "GET", `/api/regions/${legacyCreated.id}`), "legacy region edit readback").name, `Legacy ${name} edit`);
  await admin.locator("#page-content tbody tr").filter({ hasText: legacyCode }).getByRole("button", { name: "Archivieren" }).focus();
  await admin.keyboard.press("Enter");
  await admin.locator(".dialog h2").getByText(/archivieren/).waitFor();
  await admin.locator(".dialog [data-confirm]").focus();
  await admin.keyboard.press("Enter");
  await admin.locator("#page-content tbody tr").filter({ hasText: legacyCode }).waitFor({ state: "detached" });
  assert.equal(ok(await api(admin, "GET", `/api/regions/${legacyCreated.id}`), "legacy region archive readback").status, "ARCHIVED");
  await admin.unroute("**/admin/route-cutover.js", legacy);

  await admin.goto(`${base}/admin/next/regions/?probe=regions#candidate`, { waitUntil: "domcontentloaded" });
  await waitCandidate(admin);
  await admin.getByRole("cell", { name: legacyCodes[0]?.trim() || code }).first().waitFor();
  const candidateCodes = await admin.locator(".regions-page tbody tr td:first-child").allTextContents();
  assert.deepEqual(new Set(candidateCodes.map((value) => value.trim())), new Set(legacyCodes.map((value) => value.trim())), "candidate and legacy show the same active region codes after the legacy fixture is archived");
  await admin.reload();
  await waitCandidate(admin);
  assert.equal(new URL(admin.url()).searchParams.get("probe"), "regions", "query survives candidate refresh");
  assert.equal(new URL(admin.url()).hash, "#candidate", "fragment survives candidate refresh");
  await admin.getByRole("searchbox", { name: "Suche" }).fill(code);
  await admin.getByText("Keine Region passt zur Suche.").waitFor();
  await admin.getByRole("searchbox", { name: "Suche" }).fill(legacyCodes[0].trim());
  await admin.getByRole("cell", { name: legacyCodes[0].trim() }).waitFor();
  await admin.screenshot({ path: new URL("candidate-admin.png", evidenceDir).pathname });
  await admin.getByRole("searchbox", { name: "Suche" }).fill("");

  await admin.getByRole("button", { name: "Region anlegen" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("heading", { name: "Region anlegen" }).waitFor();
  await admin.getByRole("button", { name: "Speichern" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByText("Code ist erforderlich.").waitFor();
  await admin.getByText("Name ist erforderlich.").waitFor();
  await admin.getByRole("textbox", { name: "Code" }).fill(legacyCodes[0].trim());
  await admin.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await admin.getByRole("button", { name: "Speichern" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("alert").filter({ hasText: /existiert bereits/ }).waitFor();
  assert.equal(await admin.getByRole("textbox", { name: "Name", exact: true }).inputValue(), name, "conflict keeps form input");
  await admin.getByRole("textbox", { name: "Code" }).fill(code);
  await admin.getByRole("button", { name: "Speichern" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("cell", { name }).waitFor();
  const created = ok(await api(admin, "GET", "/api/regions?status=ACTIVE"), "created region readback").find((item) => item.code === code);
  assert.ok(created, "create persists");
  assert.equal(created.name, name);
  await admin.getByRole("button", { name: "Bearbeiten" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("heading", { name: "Region bearbeiten" }).waitFor();
  await admin.getByRole("textbox", { name: "Name", exact: true }).fill(`${name} edit`);
  await admin.getByRole("textbox", { name: "Beschreibung" }).fill("Persisted region detail");
  await admin.getByRole("button", { name: "Speichern" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("cell", { name: `${name} edit`, exact: true }).waitFor();
  const edited = ok(await api(admin, "GET", `/api/regions/${created.id}`), "edited region readback");
  assert.equal(edited.description, "Persisted region detail");

  let detailFault = true;
  const failDetail = (route) => {
    if (detailFault) {
      detailFault = false;
      return route.fulfill({ status: 503, json: { error: "Injected region detail fault" } });
    }
    return route.continue();
  };
  await admin.route(`**/api/regions/${created.id}`, failDetail);
  await admin.getByRole("button", { name: "Region anlegen" }).click();
  await admin.getByRole("button", { name: "Abbrechen" }).click();
  await admin.getByRole("row").filter({ hasText: code }).getByRole("button", { name: "Details" }).click();
  await admin.getByRole("alert").getByRole("button", { name: "Erneut laden" }).waitFor();
  assert.equal(await admin.getByRole("button", { name: "Archivieren" }).count(), 0, "failed detail does not expose stale archive action");
  await admin.getByRole("button", { name: "Erneut laden" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("button", { name: "Archivieren" }).waitFor();
  await admin.unroute(`**/api/regions/${created.id}`, failDetail);

  admin.once("dialog", (dialog) => { assert.match(dialog.message(), /archivieren/); void dialog.dismiss(); });
  await admin.getByRole("button", { name: "Archivieren" }).focus();
  await admin.keyboard.press("Enter");
  assert.equal(ok(await api(admin, "GET", `/api/regions/${created.id}`), "cancel archive readback").status, "ACTIVE");
  admin.once("dialog", (dialog) => { assert.match(dialog.message(), /archivieren/); void dialog.accept(); });
  await admin.getByRole("button", { name: "Archivieren" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("status").getByText(`Region „${name} edit“ wurde archiviert.`).waitFor();
  assert.equal(ok(await api(admin, "GET", `/api/regions/${created.id}`), "archive readback").status, "ARCHIVED");
  await admin.getByLabel("Status").selectOption("ARCHIVED");
  await admin.getByRole("cell", { name: `${name} edit`, exact: true }).waitFor();

  let listFault = true;
  const failList = (route) => route.fulfill({ status: listFault ? 503 : 200, json: listFault ? { error: "Injected region fault" } : [] });
  await admin.route("**/api/regions?status=ACTIVE", failList);
  await admin.goto(`${base}/admin/next/regions/?probe=fault`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("alert").getByRole("button", { name: "Erneut laden" }).waitFor();
  listFault = false;
  await admin.getByRole("button", { name: "Erneut laden" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByText("Keine Regionen in diesem Status.").waitFor();
  await admin.unroute("**/api/regions?status=ACTIVE", failList);

  const regionManager = await login(regionUser);
  const regionIdentity = ok(await api(regionManager, "GET", "/api/admin/me"), "region manager identity");
  assert.equal(regionIdentity.role, "region-manager");
  const assigned = ok(await api(regionManager, "GET", "/api/regions?status=ACTIVE"), "region manager scoped list");
  assert.equal(assigned.length, 1, "region manager only sees assigned active region");
  assert.equal(assigned[0].id, regionIdentity.scope.regionId);
  const rmLegacy = await forceLegacy(regionManager);
  await regionManager.goto(`${base}/admin/regions/`, { waitUntil: "domcontentloaded" });
  await regionManager.locator("#page-content table").waitFor();
  assert.equal(await regionManager.locator("#page-content tbody tr").count(), 1, "legacy scoped list");
  await regionManager.unroute("**/admin/route-cutover.js", rmLegacy);
  await regionManager.goto(`${base}/admin/next/regions/`, { waitUntil: "domcontentloaded" });
  await waitCandidate(regionManager);
  await regionManager.getByRole("cell", { name: assigned[0].name }).waitFor();
  assert.equal(await regionManager.getByRole("button", { name: "Region anlegen" }).count(), 0);
  await regionManager.getByRole("button", { name: "Details" }).focus();
  await regionManager.keyboard.press("Enter");
  await regionManager.getByText(assigned[0].description || "Keine Beschreibung").last().waitFor();
  assert.equal(await regionManager.getByRole("button", { name: "Bearbeiten" }).count(), 0);
  assert.equal((await api(regionManager, "GET", `/api/regions/${created.id}`)).status, 403, "foreign detail denied");
  assert.equal((await api(regionManager, "POST", "/api/regions", { code: `DENIED-${stamp}`, name: "Denied" })).status, 403);
  assert.equal((await api(regionManager, "PUT", `/api/regions/${assigned[0].id}`, { code: assigned[0].code, name: "Denied" })).status, 403);
  assert.equal((await api(regionManager, "PATCH", `/api/regions/${assigned[0].id}/archive`, {})).status, 403);

  const storeManager = await login(storeUser);
  assert.equal(ok(await api(storeManager, "GET", "/api/admin/me"), "store manager identity").role, "store-manager");
  await storeManager.getByRole("alert").getByText("Zugriff verweigert").waitFor();
  assert.equal((await api(storeManager, "POST", "/api/regions", { code: `DENIED-SM-${stamp}`, name: "Denied" })).status, 403);
  assert.equal((await api(storeManager, "PUT", `/api/regions/${created.id}`, { code, name: "Denied" })).status, 403);
  assert.equal((await api(storeManager, "PATCH", `/api/regions/${created.id}/archive`, {})).status, 403);

  console.log(JSON.stringify({ result: "PASS", fixture: { code, regionId: created.id, legacyRegionId: legacyCreated.id }, legacyCandidateListParity: true, legacyKeyboardCreateEditArchive: true, candidateQueryRefresh: true, keyboardCreateEditArchive: true, cancellation: true, persistedReadback: true, liveConflict: true, liveDetailFaultRetry: true, liveListFaultEmptyRetry: true, scopedRegionManager: true, storeManagerDenied: true, screenshots: ["legacy-admin.png", "candidate-admin.png"] }));
} finally {
  await browser.close();
}
