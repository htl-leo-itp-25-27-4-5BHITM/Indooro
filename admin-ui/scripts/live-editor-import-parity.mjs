import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Focused local import parity probe. It creates only a disposable Region/Store
// and Store layout versions; it never writes to the global customer layout.
const base = process.env.ADMIN_SMOKE_BASE_URL || "http://localhost:8080";
assert.ok(["localhost", "127.0.0.1", "host.docker.internal"].includes(new URL(base).hostname), "probe only permits the local stack");
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8"));
const [adminUser] = realm.users;
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP host.docker.internal 127.0.0.1"] : [] });
let admin = null;
let region = null;
let store = null;
const evidence = {
  result: "PASS",
  scope: "local packaged stack; legacy/candidate browser and Store API only",
  fixtureIds: {},
  httpStatuses: [],
  legacySaveStatusText: null,
  versionIdsAfterLegacySave: null,
  candidateValidImport: false,
  legacyValidImport: false,
  candidatePreservesImportedMetadata: false,
  importGeometryParity: false,
  legacyMetadataDifferences: [],
  importMetadataAndGeometryParity: false,
  candidateDraftPersistence: false,
  legacyDraftPersistence: false,
  invalidImportRejected: false,
  invalidImportNoDraftOrPublicMutation: false,
  anonymousPublicLayoutUnchanged: false,
  storeCleanupHttp: null,
  regionCleanupHttp: null,
  remainingGates: ["physical iOS/Android rendering is not exercised", "legacy import accepts permissive fallback values; this probe checks malformed JSON rejection and observable state parity"],
};

async function login(user) {
  const page = await browser.newPage();
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
  const result = { status: response.status(), body };
  evidence.httpStatuses.push({ method, path, status: result.status });
  return result;
}

function ok(result, label) {
  assert.equal(result.status, 200, `${label}: HTTP ${result.status} ${JSON.stringify(result.body).slice(0, 250)}`);
  return result.body;
}

async function anonymousCurrent(storeId) {
  const response = await fetch(`${base}/api/mobile/stores/${storeId}/layout/current`);
  evidence.httpStatuses.push({ method: "GET", path: `/api/mobile/stores/${storeId}/layout/current`, status: response.status });
  assert.equal(response.status, 200, `anonymous current layout: HTTP ${response.status}`);
  return response.json();
}

async function versionIds(page, path) {
  const result = await api(page, "GET", path);
  assert.equal(result.status, 200, `version listing: HTTP ${result.status}`);
  const rows = Array.isArray(result.body) ? result.body : result.body?.versions;
  assert.ok(Array.isArray(rows), "version listing response contains a versions array");
  return rows.map((version) => version.layoutId ?? version.id).sort();
}

const seedDocument = (name) => ({
  shopName: name,
  gridSize: { width: 24, height: 18 },
  elements: [{ id: 1, type: "entrance", x: 2, y: 0, width: 3, height: 1, label: "Seed Eingang" }],
});

const importedDocument = (name) => ({
  shopName: name,
  gridSize: { width: 37, height: 23 },
  navigationMetadata: { source: "import-parity-probe", revision: 7 },
  elements: [
    { id: 41, type: "entrance", x: 4, y: 1, width: 4, height: 1, rotation: 0, label: "Import Eingang", customerField: "retained" },
    { id: 42, type: "shelf", x: 11, y: 8, width: 5, height: 2, rotation: 30, category: "310", meter: 2, label: "Import Regal", productPositions: ["sku-1"] },
  ],
});

async function expectEditorLoaded(page, mode) {
  if (mode === "candidate") await page.getByRole("heading", { name: "Layout Editor" }).waitFor();
  else await page.locator("#shopName").waitFor();
}

try {
  admin = await login(adminUser);
  admin.on("dialog", (dialog) => void dialog.accept().catch(() => {}));
  assert.equal(ok(await api(admin, "GET", "/api/admin/me"), "admin identity").role, "admin");
  const stamp = randomUUID().slice(0, 8).toUpperCase();
  region = ok(await api(admin, "POST", "/api/regions", { code: `IP-${stamp}`, name: `Import Probe ${stamp}` }), "create disposable region");
  store = ok(await api(admin, "POST", "/api/stores", {
    regionId: region.id, storeCode: `IP-${stamp}`, name: `Import Probe ${stamp}`,
    street: "Testgasse 1", zipCode: "4020", city: "Linz", country: "AT",
  }), "create disposable Store");
  evidence.fixtureIds = { regionId: region.id, storeId: store.id, regionCode: region.code, storeCode: store.storeCode };
  const versions = `/api/stores/${store.id}/layout/versions`;
  const initial = ok(await api(admin, "POST", versions, { layoutName: `Seed ${stamp}`, activate: true, layout: seedDocument(`Seed ${stamp}`) }), "create active seed version");
  assert.equal(initial.status, "ACTIVE");
  const initialPublic = await anonymousCurrent(store.id);
  assert.equal(initialPublic.layoutId, initial.layoutId);

  const imported = importedDocument(`Imported ${stamp}`);
  const bytes = Buffer.from(JSON.stringify(imported));
  const invalidBytes = Buffer.from("{ invalid json");

  // Candidate import, verify local document, then persist it as a private draft.
  await admin.goto(`${base}/admin/next/editor/?storeId=${store.id}&layoutId=${initial.layoutId}`, { waitUntil: "domcontentloaded" });
  await expectEditorLoaded(admin, "candidate");
  await admin.locator('input[aria-label="Grundrissdatei importieren"]').setInputFiles({ name: "import.json", mimeType: "application/json", buffer: bytes });
  await admin.getByText("Grundriss importiert. Bitte prüfen und als Entwurf speichern.").waitFor();
  assert.equal(await admin.getByRole("textbox", { name: "Filialname" }).inputValue(), imported.shopName);
  await admin.getByText(`${imported.gridSize.width} × ${imported.gridSize.height} Rastereinheiten`).waitFor();
  await admin.locator(".le-layers button").filter({ hasText: "Import Regal" }).waitFor();
  evidence.candidateValidImport = true;
  const candidateBeforeSave = await versionIds(admin, versions);
  assert.deepEqual(candidateBeforeSave, [initial.layoutId], "import itself must not create a server version");
  await admin.getByRole("button", { name: "Entwurf speichern" }).click();
  await admin.getByText("Entwurf gespeichert.").waitFor();
  const candidateDraftId = new URL(admin.url()).searchParams.get("layoutId");
  assert.ok(candidateDraftId && candidateDraftId !== initial.layoutId);
  const candidateDraft = ok(await api(admin, "GET", `${versions}/${candidateDraftId}`), "candidate draft readback");
  assert.equal(candidateDraft.status, "DRAFT");
  const candidateLayoutContent = structuredClone(candidateDraft.layout);
  delete candidateLayoutContent.exportDate;
  assert.deepEqual(candidateLayoutContent, imported, "candidate draft preserves imported metadata and geometry");
  evidence.candidateDraftPersistence = true;
  evidence.candidatePreservesImportedMetadata = true;
  const candidatePublic = await anonymousCurrent(store.id);
  assert.equal(candidatePublic.layoutId, initial.layoutId);
  assert.equal(candidatePublic.layout.shopName, `Seed ${stamp}`);

  const candidateVersionsBeforeInvalid = await versionIds(admin, versions);
  await admin.locator('input[aria-label="Grundrissdatei importieren"]').setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: invalidBytes });
  await admin.getByRole("status").getByText(/Import fehlgeschlagen/).waitFor();
  assert.equal(await admin.getByRole("textbox", { name: "Filialname" }).inputValue(), imported.shopName);
  assert.deepEqual(await versionIds(admin, versions), candidateVersionsBeforeInvalid);
  assert.equal((await anonymousCurrent(store.id)).layoutId, initial.layoutId);
  evidence.invalidImportRejected = true;
  evidence.invalidImportNoDraftOrPublicMutation = true;

  // Legacy import and draft persistence use the same disposable Store/version.
  await admin.goto(`${base}/admin/editor/?storeId=${store.id}&layoutId=${initial.layoutId}`, { waitUntil: "domcontentloaded" });
  await admin.locator("#shopName").waitFor();
  await admin.locator("#fileInput").setInputFiles({ name: "import.json", mimeType: "application/json", buffer: bytes });
  await admin.locator("#shopName").waitFor();
  await admin.waitForFunction((expected) => document.querySelector("#shopName")?.value === expected, imported.shopName);
  await admin.locator("#layersList").getByText("Import Regal", { exact: true }).waitFor();
  evidence.legacyValidImport = true;
  const legacyBeforeSave = await versionIds(admin, versions);
  assert.deepEqual(legacyBeforeSave, [initial.layoutId, candidateDraftId].sort(), "legacy import itself must not create a server version");
  await admin.locator("#saveDraftBtn").click();
  await admin.locator("#saveStatus").getByText("Layout-Draft gespeichert", { exact: true }).waitFor({ timeout: 15_000 });
  const legacyVersions = await versionIds(admin, versions);
  evidence.legacySaveStatusText = await admin.locator("#saveStatus").textContent();
  evidence.versionIdsAfterLegacySave = legacyVersions;
  const legacyDraftId = legacyVersions.find((id) => id !== initial.layoutId && id !== candidateDraftId);
  assert.ok(legacyDraftId, "legacy save creates a draft version");
  const legacyDraft = ok(await api(admin, "GET", `${versions}/${legacyDraftId}`), "legacy draft readback");
  assert.equal(legacyDraft.status, "DRAFT");
  assert.equal(legacyDraft.layout.shopName, imported.shopName);
  assert.deepEqual(legacyDraft.layout.gridSize, imported.gridSize);
  assert.deepEqual(candidateDraft.layout.gridSize, legacyDraft.layout.gridSize);
  const geometryFields = ["id", "type", "x", "y", "width", "height", "rotation", "label"];
  assert.deepEqual(
    candidateDraft.layout.elements.map((item) => Object.fromEntries(geometryFields.map((key) => [key, item[key]]))),
    legacyDraft.layout.elements.map((item) => Object.fromEntries(geometryFields.map((key) => [key, item[key]]))),
    "legacy and candidate persist matching element geometry",
  );
  evidence.legacyDraftPersistence = true;
  evidence.importGeometryParity = true;
  if (JSON.stringify(legacyDraft.layout.navigationMetadata) !== JSON.stringify(imported.navigationMetadata)) evidence.legacyMetadataDifferences.push("legacy save drops unknown top-level navigationMetadata");
  imported.elements.forEach((item, index) => {
    const saved = legacyDraft.layout.elements[index];
    for (const key of ["category", "meter", "productPositions", "customerField"]) {
      if (JSON.stringify(saved[key]) !== JSON.stringify(item[key])) evidence.legacyMetadataDifferences.push(`element ${index} ${key}: imported ${JSON.stringify(item[key])}, saved ${JSON.stringify(saved[key])}`);
    }
  });
  evidence.importMetadataAndGeometryParity = evidence.legacyMetadataDifferences.length === 0;
  if (!evidence.importMetadataAndGeometryParity) evidence.remainingGates.push("legacy editor import/save does not preserve all arbitrary imported metadata; see legacyMetadataDifferences");
  const publicAfterValid = await anonymousCurrent(store.id);
  assert.equal(publicAfterValid.layoutId, initial.layoutId, "both imported drafts stay private");

  // Malformed JSON must leave each editor's current server state and public
  // version untouched. The candidate has explicit error feedback; legacy uses
  // an alert and keeps the prior imported local document.
  const legacyVersionsBeforeInvalid = await versionIds(admin, versions);
  const publicBeforeLegacyInvalid = await anonymousCurrent(store.id);
  await admin.locator("#fileInput").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: invalidBytes });
  await admin.locator("#saveStatus").getByText("Import fehlgeschlagen").waitFor();
  assert.equal(await admin.locator("#shopName").inputValue(), imported.shopName);
  assert.deepEqual(await versionIds(admin, versions), legacyVersionsBeforeInvalid);
  assert.equal((await anonymousCurrent(store.id)).layoutId, publicBeforeLegacyInvalid.layoutId);
  evidence.invalidImportNoDraftOrPublicMutation = true;
  evidence.anonymousPublicLayoutUnchanged = true;
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
