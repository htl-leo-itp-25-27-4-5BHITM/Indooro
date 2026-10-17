import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Compare Store-scoped legacy Preview and candidate Mobile-Vorschau using
// disposable data. This probe never visits or writes the global editor.
const base = process.env.ADMIN_SMOKE_BASE_URL || "http://localhost:8080";
assert.ok(["localhost", "127.0.0.1", "host.docker.internal"].includes(new URL(base).hostname), "preview probe only permits local hosts");
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8").replace(/\$\{(\w+)\}/g, (match, name) => process.env[name] ?? match));
const [adminUser] = realm.users;
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP localhost 127.0.0.1,MAP host.docker.internal 127.0.0.1"] : [] });
let admin = null;
let region = null;
let store = null;
const evidence = {
  result: "PASS",
  scope: "localhost:8080; disposable Region/Store; Store-scoped legacy and candidate editor routes only",
  fixtureIds: {},
  legacyPreview: { versionPosts: [], popupUrl: null, localStorage: null, currentBefore: null, currentAfter: null, versionIdsBefore: null, versionIdsAfter: null, createdVersionIds: [], savedDraft: null },
  candidatePreview: { versionPosts: [], popupCount: 0, localStorageBefore: null, localStorageAfter: null, localStorageUnchanged: null, versionIdsBefore: null, versionIdsAfter: null, createdVersionIds: [], draftView: null, currentView: null, currentBefore: null, currentAfter: null },
  cleanup: { storeArchived: false, regionArchived: false },
  httpStatuses: [],
};

async function login(user) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}/admin/next/`, { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill(user.username);
  await page.locator("#password").fill(user.credentials.find((item) => item.type === "password").value);
  await page.locator("#kc-login").click();
  await page.waitForURL("**/admin/next/**", { timeout: 15_000 });
  return page;
}

async function api(page, method, path, data) {
  const response = await page.context().request.fetch(`${base}${path}`, { method, data, failOnStatusCode: false });
  const raw = await response.text();
  let body;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
  evidence.httpStatuses.push({ method, path, status: response.status() });
  return { status: response.status(), body };
}

function ok(result, label) {
  assert.equal(result.status, 200, `${label}: HTTP ${result.status} ${JSON.stringify(result.body).slice(0, 250)}`);
  return result.body;
}

async function anonymousCurrent(storeId) {
  const path = `/api/mobile/stores/${storeId}/layout/current`;
  const response = await fetch(`${base}${path}`);
  evidence.httpStatuses.push({ method: "GET (anonymous)", path, status: response.status });
  assert.equal(response.status, 200, `anonymous Store current-layout: HTTP ${response.status}`);
  return response.json();
}

async function versionIds(page, path) {
  const rows = ok(await api(page, "GET", path), "Store version listing");
  assert.ok(Array.isArray(rows), "version listing is an array");
  return rows.map((item) => item.layoutId).sort();
}

const documentFor = (name) => ({
  shopName: name,
  gridSize: { width: 20, height: 20 },
  elements: [
    { id: 1, type: "entrance", x: 2, y: 0, width: 3, height: 1, label: "Eingang" },
    { id: 2, type: "shelf", x: 5, y: 5, width: 3, height: 2, category: "310/1", meter: 1, label: name },
  ],
});

try {
  admin = await login(adminUser);
  assert.equal(ok(await api(admin, "GET", "/api/admin/me"), "admin identity").role, "admin");
  const stamp = randomUUID().slice(0, 8).toUpperCase();
  region = ok(await api(admin, "POST", "/api/regions", { code: `PV-${stamp}`, name: `Preview Probe ${stamp}` }), "create disposable Region");
  store = ok(await api(admin, "POST", "/api/stores", {
    regionId: region.id, storeCode: `PV-${stamp}`, name: `Preview Probe ${stamp}`,
    street: "Testgasse 1", zipCode: "4020", city: "Linz", country: "AT",
  }), "create disposable Store");
  evidence.fixtureIds = { regionId: region.id, storeId: store.id, regionCode: region.code, storeCode: store.storeCode };

  const versions = `/api/stores/${store.id}/layout/versions`;
  const seedName = `Preview active ${stamp}`;
  const active = ok(await api(admin, "POST", versions, { layoutName: seedName, activate: true, layout: documentFor(seedName) }), "create disposable active Store version");
  assert.equal(active.status, "ACTIVE");
  const versionsBefore = await versionIds(admin, versions);
  assert.deepEqual(versionsBefore, [active.layoutId]);
  const currentBeforeLegacy = await anonymousCurrent(store.id);
  assert.equal(currentBeforeLegacy.layoutId, active.layoutId);

  const legacy = await admin.context().newPage();
  await legacy.goto(`${base}/admin/editor/?storeId=${store.id}&layoutId=${active.layoutId}`, { waitUntil: "domcontentloaded" });
  await legacy.locator("#shopName").waitFor();
  await legacy.evaluate(() => localStorage.removeItem("indooro_live_layout"));
  const legacyPreviewName = `Legacy preview ${stamp}`;
  await legacy.locator("#shopName").fill(legacyPreviewName);
  legacy.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes(`/api/stores/${store.id}/layout/versions`)) {
      let body = null;
      try { body = request.postDataJSON(); } catch { /* Keep the request evidence even if its payload is not JSON. */ }
      evidence.legacyPreview.versionPosts.push({ url: request.url(), body });
    }
  });
  const popupWait = legacy.waitForEvent("popup", { timeout: 8_000 }).catch(() => null);
  await legacy.locator("#launchBtn").click();
  const popup = await popupWait;
  if (popup) {
    await popup.waitForLoadState("domcontentloaded").catch(() => {});
    evidence.legacyPreview.popupUrl = popup.url();
  }
  const localStorageRaw = await legacy.evaluate(() => localStorage.getItem("indooro_live_layout"));
  evidence.legacyPreview.localStorage = localStorageRaw ? JSON.parse(localStorageRaw) : null;
  evidence.legacyPreview.currentBefore = currentBeforeLegacy;
  evidence.legacyPreview.versionIdsBefore = versionsBefore;

  let afterLegacyIds = await versionIds(admin, versions);
  for (let attempt = 0; attempt < 25 && afterLegacyIds.length === versionsBefore.length; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    afterLegacyIds = await versionIds(admin, versions);
  }
  const legacyAddedIds = afterLegacyIds.filter((id) => !versionsBefore.includes(id));
  evidence.legacyPreview.versionIdsAfter = afterLegacyIds;
  evidence.legacyPreview.createdVersionIds = legacyAddedIds;
  for (const layoutId of legacyAddedIds) {
    const row = ok(await api(admin, "GET", `${versions}/${layoutId}`), "legacy Store Preview version readback");
    evidence.legacyPreview.savedDraft = { layoutId: row.layoutId, status: row.status, shopName: row.layout?.shopName };
    if (row.status === "DRAFT") assert.equal(row.layout.shopName, legacyPreviewName, "the observed private draft contains the edited Store name");
  }
  evidence.legacyPreview.currentAfter = await anonymousCurrent(store.id);
  assert.deepEqual(evidence.legacyPreview.currentAfter, currentBeforeLegacy, "legacy preview does not change anonymous Mobile current");
  if (popup) await popup.close().catch(() => {});
  await legacy.close();

  const candidate = await admin.context().newPage();
  candidate.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes(`/api/stores/${store.id}/layout/versions`)) evidence.candidatePreview.versionPosts.push(request.url());
  });
  candidate.on("popup", () => { evidence.candidatePreview.popupCount += 1; });
  const versionForCandidate = evidence.legacyPreview.savedDraft?.layoutId || active.layoutId;
  await candidate.goto(`${base}/admin/next/editor/?storeId=${store.id}&layoutId=${versionForCandidate}`, { waitUntil: "domcontentloaded" });
  await candidate.getByRole("heading", { name: "Layout Editor" }).waitFor();
  const preview = candidate.getByRole("region", { name: "Aktuell mobiles Layout" });
  await preview.getByText("Aktive Version").waitFor();
  await preview.getByText(seedName, { exact: true }).waitFor();
  evidence.candidatePreview.localStorageBefore = await candidate.evaluate(() => localStorage.getItem("indooro_live_layout"));
  evidence.candidatePreview.versionIdsBefore = await versionIds(admin, versions);
  evidence.candidatePreview.currentBefore = await anonymousCurrent(store.id);

  const draftViewButton = preview.getByRole("button", { name: "Gespeicherten Entwurf ansehen" });
  if (await draftViewButton.count()) {
    await draftViewButton.click();
    await preview.getByText("Gespeicherter Entwurf · nicht öffentlich").waitFor();
    const displayedName = await preview.locator(".mobile-current-preview-facts > span").textContent();
    evidence.candidatePreview.draftView = { label: "Gespeicherter Entwurf · nicht öffentlich", shopName: displayedName?.trim() ?? null };
  }
  await preview.getByRole("button", { name: "Öffentlich aktiv" }).click();
  await preview.getByText("Aktive Version").waitFor();
  await preview.getByText(seedName, { exact: true }).waitFor();
  evidence.candidatePreview.currentView = { label: "Aktive Version", shopName: seedName };
  evidence.candidatePreview.currentAfter = await anonymousCurrent(store.id);
  evidence.candidatePreview.localStorageAfter = await candidate.evaluate(() => localStorage.getItem("indooro_live_layout"));
  evidence.candidatePreview.versionIdsAfter = await versionIds(admin, versions);
  evidence.candidatePreview.createdVersionIds = evidence.candidatePreview.versionIdsAfter.filter((id) => !evidence.candidatePreview.versionIdsBefore.includes(id));
  evidence.candidatePreview.localStorageUnchanged = evidence.candidatePreview.localStorageAfter === evidence.candidatePreview.localStorageBefore;
  assert.deepEqual(evidence.candidatePreview.currentAfter, evidence.candidatePreview.currentBefore, "candidate preview view switches preserve anonymous Mobile current");
  await candidate.close();
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = error instanceof Error ? error.message : String(error);
} finally {
  if (admin && store) {
    try {
      const result = await api(admin, "PATCH", `/api/stores/${store.id}/archive`, {});
      evidence.cleanup.storeArchived = result.status === 200;
      if (!evidence.cleanup.storeArchived) { evidence.result = "FAIL"; evidence.cleanupError = `Store archive HTTP ${result.status}`; }
    } catch (error) {
      evidence.result = "FAIL";
      evidence.cleanupError = error instanceof Error ? error.message : String(error);
    }
  }
  if (admin && region) {
    try {
      const result = await api(admin, "PATCH", `/api/regions/${region.id}/archive`, {});
      evidence.cleanup.regionArchived = result.status === 200;
      if (!evidence.cleanup.regionArchived) { evidence.result = "FAIL"; evidence.cleanupError ||= `Region archive HTTP ${result.status}`; }
    } catch (error) {
      evidence.result = "FAIL";
      evidence.cleanupError ||= error instanceof Error ? error.message : String(error);
    }
  }
  if (admin) await admin.close().catch(() => {});
  await browser.close().catch(() => {});
  console.log(JSON.stringify(evidence));
  if (evidence.result !== "PASS") process.exitCode = 1;
}
