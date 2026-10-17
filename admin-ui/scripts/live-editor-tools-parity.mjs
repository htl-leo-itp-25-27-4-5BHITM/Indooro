import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Focused disposable-Store probe for legacy/candidate editor tool behavior.
// It archives its Store/Region fixtures in finally and never publishes globally.
const base = process.env.ADMIN_SMOKE_BASE_URL || "http://localhost:8080";
assert.ok(["localhost", "127.0.0.1", "host.docker.internal"].includes(new URL(base).hostname), "probe only permits the local stack");
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8").replace(/\$\{(\w+)\}/g, (match, name) => process.env[name] ?? match));
const [adminUser] = realm.users;
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP host.docker.internal 127.0.0.1"] : [] });
let admin = null;
let region = null;
let store = null;
const evidence = { result: "PASS", scope: "local packaged stack; browser/API evidence only", candidateCreate: false, candidateMoveResizeRotate: false, candidateInspectorMetadata: false, candidateDuplicateLockDelete: false, candidateUndoRedo: false, candidateExport: false, candidateApiReadback: false, legacyReadsCandidateVersion: false, mobileDraftRemainsPrivate: false, fixtureIds: {}, fixtureCleanup: false, fixtureCleanupHttp: null, regionCleanup: false, regionCleanupHttp: null, remainingGates: ["candidate import was not exercised", "legacy tool mutations were not compared action-by-action", "physical iOS/Android navigation is not exercised"] };
async function login(user) {
  const page = await browser.newPage();
  await page.goto(base + "/admin/next/", { waitUntil: "domcontentloaded" });
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
  return { status: response.status(), body };
}
function ok(result, label) {
  assert.equal(result.status, 200, `${label}: HTTP ${result.status} ${JSON.stringify(result.body).slice(0, 250)}`);
  return result.body;
}
async function anonymousCurrent(storeId) {
  const response = await fetch(`${base}/api/mobile/stores/${storeId}/layout/current`);
  assert.equal(response.status, 200, "anonymous mobile current-layout response");
  return response.json();
}
const documentFor = (name) => ({ shopName: name, gridSize: { width: 20, height: 20 }, elements: [{ id: 1, type: "entrance", x: 1, y: 0, width: 3, height: 1, label: "Eingang" }, { id: 2, type: "shelf", x: 5, y: 5, width: 3, height: 2, category: "310/1", meter: 1, label: "Probe-Regal" }] });
try {
  admin = await login(adminUser);
  admin.on("dialog", (dialog) => void dialog.accept().catch(() => {}));
  assert.equal(ok(await api(admin, "GET", "/api/admin/me"), "admin identity").role, "admin");
  const stamp = randomUUID().slice(0, 8).toUpperCase();
  region = ok(await api(admin, "POST", "/api/regions", { code: `ET-${stamp}`, name: `Editor Tools ${stamp}` }), "create disposable region");
  store = ok(await api(admin, "POST", "/api/stores", { regionId: region.id, storeCode: `ET-${stamp}`, name: `Editor Tools ${stamp}`, street: "Testgasse 1", zipCode: "4020", city: "Linz", country: "AT" }), "create disposable Store");
  evidence.fixtureIds = { regionId: region.id, storeId: store.id, regionCode: region.code, storeCode: store.storeCode };
  const versions = `/api/stores/${store.id}/layout/versions`;
  const initial = ok(await api(admin, "POST", versions, { layoutName: `Initial ${stamp}`, activate: true, layout: documentFor(`Initial ${stamp}`) }), "create active fixture layout");
  const initialPublic = await anonymousCurrent(store.id);
  assert.equal(initialPublic.layoutId, initial.layoutId);
  await admin.goto(`${base}/admin/next/editor/?storeId=${store.id}&layoutId=${initial.layoutId}`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("heading", { name: "Layout Editor" }).waitFor();
  const layers = admin.locator(".le-layers button");
  assert.equal(await layers.count(), 2);
  await admin.getByRole("button", { name: "Regal", exact: true }).first().click();
  await admin.getByRole("group", { name: "Interaktiver Grundriss" }).focus();
  await admin.keyboard.press("Enter");
  assert.equal(await layers.count(), 3);
  evidence.candidateCreate = true;
  await layers.last().click();
  await admin.getByLabel("X", { exact: true }).fill("12");
  await admin.getByLabel("Breite", { exact: true }).fill("5");
  await admin.getByLabel("Winkel", { exact: true }).fill("30");
  await admin.getByLabel("Bezeichnung", { exact: true }).fill(`Tool Shelf ${stamp}`);
  await admin.getByLabel("Kategoriecode", { exact: true }).fill("310");
  await admin.getByLabel("Abschnitt", { exact: true }).fill("2");
  evidence.candidateMoveResizeRotate = true;
  evidence.candidateInspectorMetadata = true;
  await admin.getByRole("button", { name: "Duplizieren" }).click();
  assert.equal(await layers.count(), 4);
  const locked = admin.getByLabel("Gesperrt");
  await locked.check();
  assert.equal(await admin.getByLabel("Bezeichnung", { exact: true }).isDisabled(), true);
  await locked.uncheck();
  await admin.getByRole("button", { name: "Löschen" }).click();
  assert.equal(await layers.count(), 3);
  evidence.candidateDuplicateLockDelete = true;
  await admin.getByRole("button", { name: "Rückgängig" }).click();
  assert.equal(await layers.count(), 4);
  await admin.getByRole("button", { name: "Wiederholen" }).click();
  assert.equal(await layers.count(), 3);
  evidence.candidateUndoRedo = true;
  const downloadWait = admin.waitForEvent("download");
  await admin.getByRole("button", { name: "JSON exportieren" }).click();
  assert.match((await downloadWait).suggestedFilename(), /\.json$/i);
  evidence.candidateExport = true;
  await layers.filter({ hasText: `Tool Shelf ${stamp}` }).click();
  await admin.getByRole("button", { name: "Entwurf speichern" }).click();
  await admin.getByText("Entwurf gespeichert.").waitFor();
  const toolVersionId = new URL(admin.url()).searchParams.get("layoutId");
  assert.ok(toolVersionId && toolVersionId !== initial.layoutId);
  const toolVersion = ok(await api(admin, "GET", `${versions}/${toolVersionId}`), "candidate tool version API readback");
  const edited = toolVersion.layout.elements.find((item) => item.label === `Tool Shelf ${stamp}`);
  assert.ok(edited);
  assert.equal(edited.x, 12);
  assert.equal(edited.width, 5);
  assert.equal(edited.rotation, 30);
  assert.equal(edited.category, "310/2");
  assert.equal(edited.meter, 2);
  assert.equal(toolVersion.layout.elements.length, 3, "duplicate deletion persists");
  evidence.candidateApiReadback = true;
  const publicAfter = await anonymousCurrent(store.id);
  assert.equal(publicAfter.layoutId, initial.layoutId, "draft is not served by anonymous mobile current-layout");
  evidence.mobileDraftRemainsPrivate = true;
  await admin.goto(`${base}/admin/editor/?storeId=${store.id}&layoutId=${toolVersionId}`, { waitUntil: "domcontentloaded" });
  await admin.locator("#shopName").waitFor();
  await admin.locator("#layersList").getByText(`Tool Shelf ${stamp}`, { exact: true }).waitFor();
  evidence.legacyReadsCandidateVersion = true;
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = error instanceof Error ? error.message : String(error);
} finally {
  if (admin && store) {
    try { const result = await api(admin, "PATCH", `/api/stores/${store.id}/archive`, {}); evidence.fixtureCleanupHttp = result.status; evidence.fixtureCleanup = result.status === 200; if (!evidence.fixtureCleanup) { evidence.result = "FAIL"; evidence.cleanupError = `Store archive HTTP ${result.status}`; } }
    catch (error) { evidence.result = "FAIL"; evidence.cleanupError = error instanceof Error ? error.message : String(error); }
  }
  if (admin && region) {
    try { const result = await api(admin, "PATCH", `/api/regions/${region.id}/archive`, {}); evidence.regionCleanupHttp = result.status; evidence.regionCleanup = result.status === 200; if (!evidence.regionCleanup) { evidence.result = "FAIL"; evidence.cleanupError ||= `Region archive HTTP ${result.status}`; } }
    catch (error) { evidence.result = "FAIL"; evidence.cleanupError ||= error instanceof Error ? error.message : String(error); }
  }
  if (admin) await admin.close().catch(() => {});
  await browser.close().catch(() => {});
  console.log(JSON.stringify(evidence));
  if (evidence.result !== "PASS") process.exitCode = 1;
}
