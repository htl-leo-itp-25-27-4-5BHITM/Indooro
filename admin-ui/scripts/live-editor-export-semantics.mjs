import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Focused local probe comparing JSON export behavior against disposable Store data.
// The global customer layout is never modified.
const base = process.env.ADMIN_SMOKE_BASE_URL || "http://localhost:8080";
assert.ok(["localhost", "127.0.0.1", "host.docker.internal"].includes(new URL(base).hostname), "probe only permits local hosts");
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8").replace(/\$\{(\w+)\}/g, (match, name) => process.env[name] ?? match));
const [adminUser] = realm.users;
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP host.docker.internal 127.0.0.1"] : [] });
let admin = null;
let region = null;
let store = null;
const evidence = {
  result: "PASS",
  scope: "local packaged stack; disposable Store; candidate and legacy browser/API behavior",
  fixtureIds: {},
  httpStatuses: [],
  candidate: { filename: null, document: null, postRequests: [], versionsBefore: null, versionsAfter: null, publicBefore: null, publicAfter: null, noServerMutation: false },
  legacy: { filename: null, document: null, postRequests: [], versionsBefore: null, versionsAfter: null, draft: null, publicBefore: null, publicAfter: null, createdPrivateDraft: false },
  storeCleanupHttp: null,
  regionCleanupHttp: null,
  remainingGates: ["physical iOS/Android export behavior is not exercised"],
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
  const response = await page.context().request.fetch(base + path, { method, data, failOnStatusCode: false });
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
  evidence.httpStatuses.push({ method: "GET", path, status: response.status });
  assert.equal(response.status, 200, `anonymous public current layout: HTTP ${response.status}`);
  return response.json();
}

async function versionIds(page, path) {
  const result = await api(page, "GET", path);
  assert.equal(result.status, 200, `version listing: HTTP ${result.status}`);
  const rows = Array.isArray(result.body) ? result.body : result.body?.versions;
  assert.ok(Array.isArray(rows), "version listing contains a versions array");
  return rows.map((version) => version.layoutId ?? version.id).sort();
}

async function exportFrom(page, locator, requestMethods) {
  const downloadPromise = page.waitForEvent("download");
  await locator.click();
  const download = await downloadPromise;
  const path = await download.path();
  assert.ok(path, "browser produced a downloaded file");
  return { filename: download.suggestedFilename(), document: JSON.parse(readFileSync(path, "utf8")), requestMethods };
}

const seedDocument = (name) => ({
  shopName: name,
  gridSize: { width: 24, height: 18 },
  elements: [{ id: 1, type: "entrance", x: 2, y: 0, width: 3, height: 1, label: "Seed Eingang" }],
});

try {
  admin = await login(adminUser);
  admin.on("dialog", (dialog) => void dialog.accept().catch(() => {}));
  assert.equal(ok(await api(admin, "GET", "/api/admin/me"), "admin identity").role, "admin");
  const stamp = randomUUID().slice(0, 8).toUpperCase();
  region = ok(await api(admin, "POST", "/api/regions", { code: `EX-${stamp}`, name: `Export Probe ${stamp}` }), "create disposable region");
  store = ok(await api(admin, "POST", "/api/stores", {
    regionId: region.id, storeCode: `EX-${stamp}`, name: `Export Probe ${stamp}`,
    street: "Testgasse 1", zipCode: "4020", city: "Linz", country: "AT",
  }), "create disposable Store");
  evidence.fixtureIds = { regionId: region.id, storeId: store.id, regionCode: region.code, storeCode: store.storeCode };
  const versions = `/api/stores/${store.id}/layout/versions`;
  const initial = ok(await api(admin, "POST", versions, { layoutName: `Seed ${stamp}`, activate: true, layout: seedDocument(`Seed ${stamp}`) }), "create disposable active version");
  assert.equal(initial.status, "ACTIVE");

  const initialPublic = await anonymousCurrent(store.id);
  assert.equal(initialPublic.layoutId, initial.layoutId);

  // Candidate: edit only local editor state, download it, and prove no version POST or public change.
  const candidatePosts = [];
  const candidatePage = await admin.context().newPage();
  candidatePage.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes(`/api/stores/${store.id}/layout/versions`)) candidatePosts.push(request.method());
  });
  await candidatePage.goto(`${base}/admin/next/editor/?storeId=${store.id}&layoutId=${initial.layoutId}`, { waitUntil: "domcontentloaded" });
  await Promise.race([
    candidatePage.getByRole("heading", { name: "Layout Editor" }).waitFor(),
    candidatePage.getByRole("alert").waitFor(),
  ]);
  const candidateEditorHeading = await candidatePage.getByRole("heading", { name: "Layout Editor" }).count();
  if (!candidateEditorHeading) throw new Error(`candidate editor did not load: ${(await candidatePage.locator("body").innerText()).slice(0, 1200)}`);
  await candidatePage.getByRole("textbox", { name: "Filialname" }).fill(`Candidate unsaved ${stamp}`);
  evidence.candidate.versionsBefore = await versionIds(admin, versions);
  evidence.candidate.publicBefore = await anonymousCurrent(store.id);
  const candidateExport = await exportFrom(candidatePage, candidatePage.getByRole("button", { name: "JSON exportieren" }), candidatePosts);
  evidence.candidate.filename = candidateExport.filename;
  evidence.candidate.document = candidateExport.document;
  evidence.candidate.postRequests = candidatePosts;
  evidence.candidate.versionsAfter = await versionIds(admin, versions);
  evidence.candidate.publicAfter = await anonymousCurrent(store.id);
  assert.equal(candidateExport.document.shopName, `Candidate unsaved ${stamp}`, "candidate export includes unsaved edit");
  assert.match(candidateExport.filename, /Candidate_unsaved_[A-F0-9]+_layout\.json$/);
  assert.deepEqual(candidatePosts, [], "candidate export must not POST a Store version");
  assert.deepEqual(evidence.candidate.versionsAfter, evidence.candidate.versionsBefore, "candidate export must not change version list");
  assert.equal(evidence.candidate.publicAfter.layoutId, evidence.candidate.publicBefore.layoutId);
  assert.deepEqual(evidence.candidate.publicAfter, evidence.candidate.publicBefore, "candidate export must not change anonymous public layout");
  evidence.candidate.noServerMutation = true;
  await candidatePage.close();

  // Legacy: same disposable active version; export's legacy handler is expected to save a private draft.
  const legacyPosts = [];
  const legacyPage = await admin.context().newPage();
  legacyPage.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes(`/api/stores/${store.id}/layout/versions`)) legacyPosts.push(request.method());
  });
  await legacyPage.goto(`${base}/admin/editor/?storeId=${store.id}&layoutId=${initial.layoutId}`, { waitUntil: "domcontentloaded" });
  await legacyPage.locator("#shopName").waitFor();
  await legacyPage.locator("#shopName").fill(`Legacy unsaved ${stamp}`);
  evidence.legacy.versionsBefore = await versionIds(admin, versions);
  evidence.legacy.publicBefore = await anonymousCurrent(store.id);
  const legacyExport = await exportFrom(legacyPage, legacyPage.locator("#exportBtn"), legacyPosts);
  evidence.legacy.filename = legacyExport.filename;
  evidence.legacy.document = legacyExport.document;
  // The download event may fire before the export handler's asynchronous POST resolves.
  let observedVersions = evidence.legacy.versionsBefore;
  for (let attempt = 0; attempt < 25 && observedVersions.length === evidence.legacy.versionsBefore.length; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    observedVersions = await versionIds(admin, versions);
  }
  evidence.legacy.postRequests = legacyPosts;
  evidence.legacy.versionsAfter = observedVersions;
  evidence.legacy.publicAfter = await anonymousCurrent(store.id);
  assert.equal(legacyExport.document.shopName, `Legacy unsaved ${stamp}`, "legacy export includes unsaved edit");
  assert.match(legacyExport.filename, /Legacy_unsaved_[A-F0-9]+_layout\.json$/);
  assert.equal(legacyPosts.length, 1, "legacy export is expected to POST exactly one Store version");
  assert.equal(evidence.legacy.versionsAfter.length, evidence.legacy.versionsBefore.length + 1, "legacy export creates one Store version");
  const addedIds = evidence.legacy.versionsAfter.filter((id) => !evidence.legacy.versionsBefore.includes(id));
  assert.equal(addedIds.length, 1, "one new version appears after legacy export");
  const draft = ok(await api(admin, "GET", `${versions}/${addedIds[0]}`), "legacy export private draft readback");
  evidence.legacy.draft = { layoutId: draft.layoutId, status: draft.status, shopName: draft.layout?.shopName };
  assert.equal(draft.status, "DRAFT", "legacy export saves a private draft");
  assert.equal(draft.layout.shopName, `Legacy unsaved ${stamp}`);
  assert.equal(evidence.legacy.publicAfter.layoutId, evidence.legacy.publicBefore.layoutId, "legacy export draft remains private to anonymous current-layout");
  assert.deepEqual(evidence.legacy.publicAfter, evidence.legacy.publicBefore, "legacy export must not change anonymous public layout");
  evidence.legacy.createdPrivateDraft = true;
  await legacyPage.close();
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = error instanceof Error ? error.message : String(error);
} finally {
  if (admin && store) {
    try {
      const result = await api(admin, "PATCH", `/api/stores/${store.id}/archive`, {});
      evidence.storeCleanupHttp = result.status;
      if (result.status !== 200) { evidence.result = "FAIL"; evidence.cleanupError = `Store archive HTTP ${result.status}`; }
    } catch (error) { evidence.result = "FAIL"; evidence.cleanupError = error instanceof Error ? error.message : String(error); }
  }
  if (admin && region) {
    try {
      const result = await api(admin, "PATCH", `/api/regions/${region.id}/archive`, {});
      evidence.regionCleanupHttp = result.status;
      if (result.status !== 200) { evidence.result = "FAIL"; evidence.cleanupError ||= `Region archive HTTP ${result.status}`; }
    } catch (error) { evidence.result = "FAIL"; evidence.cleanupError ||= error instanceof Error ? error.message : String(error); }
  }
  if (admin) await admin.close().catch(() => {});
  await browser.close().catch(() => {});
  console.log(JSON.stringify(evidence));
  if (evidence.result !== "PASS") process.exitCode = 1;
}
