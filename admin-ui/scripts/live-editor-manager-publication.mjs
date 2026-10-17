import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Exercise scoped manager publication on disposable stores. Manager account
// assignments are snapshotted and restored exactly; all created scopes are
// archived. No global layout endpoint is written.
const base = process.env.ADMIN_SMOKE_BASE_URL || "http://localhost:8080";
assert.ok(["localhost", "127.0.0.1", "host.docker.internal"].includes(new URL(base).hostname), "probe only permits local hosts");
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8").replace(/\$\{(\w+)\}/g, (match, name) => process.env[name] ?? match));
const [adminUser, regionUser, storeUser] = realm.users;
const dbContainer = process.env.ADMIN_SMOKE_PG_CONTAINER || "indooro-admin-rebuild-pg";
const dbUser = process.env.ADMIN_SMOKE_PG_USER || "indooro";
const dbName = process.env.ADMIN_SMOKE_PG_DATABASE || "indooro";
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP localhost 127.0.0.1,MAP host.docker.internal 127.0.0.1"] : [] });
const evidence = {
  result: "PASS",
  scope: "localhost:8080 only; disposable manager Region/Stores; global layout read-only",
  checks: [],
  fixtureIds: {},
  publications: {},
  pairedManagerActions: {},
  denials: [],
  cleanup: { scopesRestored: false, storeArchived: false, regionArchived: false, foreignStoreArchived: false, foreignRegionArchived: false },
};
let admin = null;
let regionManager = null;
let storeManager = null;
let region = null;
let foreignRegion = null;
let regionStore = null;
let storeManagerStore = null;
let foreignStore = null;
let previousAssignments = null;
let scopesChanged = false;

function db(sql) {
  return execFileSync("docker", ["exec", dbContainer, "psql", "-U", dbUser, "-d", dbName, "-X", "-q", "-t", "-A", "-c", sql], { encoding: "utf8" }).trim();
}

function sqlString(value) {
  return value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
}

function assignmentSubjects() {
  return [regionUser.id, storeUser.id].map(sqlString).join(", ");
}

function getAssignments() {
  const raw = db(`SELECT COALESCE(json_agg(to_jsonb(u) ORDER BY keycloak_subject, id), '[]'::json) FROM user_access_assignments u WHERE keycloak_subject IN (${assignmentSubjects()})`);
  return JSON.parse(raw || "[]");
}

function setDemoScopes(regionId, assignedStoreId) {
  const sql = `INSERT INTO user_access_assignments
    (id, keycloak_subject, username, email, role, region_id, store_id, status, created_at, updated_at)
    VALUES
    (gen_random_uuid(), ${sqlString(regionUser.id)}, ${sqlString(regionUser.username)}, ${sqlString(regionUser.email)}, 'region-manager', '${regionId}', NULL, 'ACTIVE', NOW(), NOW()),
    (gen_random_uuid(), ${sqlString(storeUser.id)}, ${sqlString(storeUser.username)}, ${sqlString(storeUser.email)}, 'store-manager', NULL, '${assignedStoreId}', 'ACTIVE', NOW(), NOW())
    ON CONFLICT (keycloak_subject) WHERE status = 'ACTIVE'
    DO UPDATE SET role = EXCLUDED.role, region_id = EXCLUDED.region_id, store_id = EXCLUDED.store_id, updated_at = NOW()`;
  db(sql);
  scopesChanged = true;
}

function restoreAssignments(rows) {
  db(`DELETE FROM user_access_assignments WHERE keycloak_subject IN (${assignmentSubjects()})`);
  for (const row of rows) {
    db(`INSERT INTO user_access_assignments
      (id, keycloak_subject, username, email, role, region_id, store_id, status, created_at, updated_at)
      VALUES (${sqlString(row.id)}, ${sqlString(row.keycloak_subject)}, ${sqlString(row.username)}, ${sqlString(row.email)}, ${sqlString(row.role)}, ${sqlString(row.region_id)}, ${sqlString(row.store_id)}, ${sqlString(row.status)}, ${sqlString(row.created_at)}, ${sqlString(row.updated_at)})`);
  }
}

async function login(user, path = "/admin/next/") {
  const page = await browser.newPage();
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill(user.username);
  await page.locator("#password").fill(user.credentials.find((item) => item.type === "password").value);
  await page.locator("#kc-login").click();
  await page.waitForURL(`**${path.split("?")[0]}*`, { timeout: 15_000 });
  return page;
}

async function api(page, method, path, data) {
  const response = await page.context().request.fetch(`${base}${path}`, { method, data, failOnStatusCode: false });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
  return { status: response.status(), body };
}

function ok(result, label) {
  assert.equal(result.status, 200, `${label}: HTTP ${result.status} ${JSON.stringify(result.body).slice(0, 250)}`);
  return result.body;
}

function check(label) {
  evidence.checks.push(label);
}

function documentFor(shopName) {
  return {
    shopName,
    gridSize: { width: 20, height: 20 },
    elements: [
      { id: 1, type: "entrance", x: 2, y: 0, width: 3, height: 1, label: "Eingang" },
      { id: 2, type: "shelf", x: 5, y: 5, width: 3, height: 2, category: "310/1", meter: 1, label: shopName },
    ],
  };
}

async function mobileCurrent(storeId, label) {
  const response = await fetch(`${base}/api/mobile/stores/${storeId}/layout/current`);
  assert.equal(response.status, 200, `${label}: anonymous Mobile current HTTP ${response.status}`);
  return response.json();
}

async function createStore(name, code, regionId) {
  return ok(await api(admin, "POST", "/api/stores", {
    regionId, storeCode: code, name, street: "Probeweg 1", zipCode: "4020", city: "Linz", country: "AT",
  }), `create disposable Store ${code}`);
}

async function seedActive(store, label) {
  const path = `/api/stores/${store.id}/layout/versions`;
  const version = ok(await api(admin, "POST", path, { layoutName: label, activate: true, layout: documentFor(label) }), `seed active version for ${store.storeCode}`);
  assert.equal(version.status, "ACTIVE");
  const current = await mobileCurrent(store.id, `seeded ${store.storeCode}`);
  assert.equal(current.layoutId, version.layoutId);
  return { path, version, current };
}

async function managerLegacyDraft(role, page, store, seed) {
  const versions = `/api/stores/${store.id}/layout/versions`;
  await page.goto(`${base}/admin/editor/?storeId=${store.id}&layoutId=${seed.version.layoutId}&legacy=1`, { waitUntil: "domcontentloaded" });
  await page.locator("#shopName").waitFor();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#shopName").waitFor();
  await page.waitForFunction((expected) => document.querySelector("#shopName")?.value === expected, seed.current.layout.shopName);
  assert.equal(await page.locator("#shopName").inputValue(), seed.current.layout.shopName, `${role} Legacy direct link and refresh load the fixture`);
  await page.locator("#gridHeight").fill("22");
  await page.locator("#gridHeight").dispatchEvent("change");
  await page.locator("#toolSelect").click();
  await page.locator('#layersList [data-layer-id="2"]').click();
  assert.equal(await page.locator("#propLabel").count(), 1, `${role} Legacy shelf inspector opens: ${await page.locator("#propertiesWrapper").innerText()}`);
  await page.getByTitle("Duplizieren").click();
  assert.equal(await page.locator("#layersList [data-layer-id]").count(), 3, `${role} Legacy duplicate`);
  await page.getByTitle("Löschen").click();
  assert.equal(await page.locator("#layersList [data-layer-id]").count(), 2, `${role} Legacy inspector delete is immediate`);
  await page.keyboard.press("Control+z");
  assert.equal(await page.locator("#layersList [data-layer-id]").count(), 3, `${role} Legacy undo restores deleted duplicate`);
  const screenshot = new URL(`../../docs/admin-rebuild/evidence/editor/${role}-legacy-paired.png`, import.meta.url);
  mkdirSync(new URL("../../docs/admin-rebuild/evidence/editor/", import.meta.url), { recursive: true });
  await page.screenshot({ path: screenshot.pathname, fullPage: true });
  const responseWait = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes(versions));
  await page.locator("#saveDraftBtn").click();
  const response = await responseWait;
  assert.equal(response.status(), 200, `${role} Legacy draft save`);
  const receipt = await response.json();
  const draft = ok(await api(page, "GET", `${versions}/${receipt.layoutId}`), `${role} Legacy draft readback`);
  assert.equal(draft.status, "DRAFT");
  assert.equal(draft.layout.gridSize.height, 22);
  assert.equal(draft.layout.elements.length, 3);
  assert.deepEqual(await mobileCurrent(store.id, `${role} after Legacy draft`), seed.current, `${role} Legacy draft remains private`);
  evidence.pairedManagerActions[role] = { fixtureVersionId: seed.version.layoutId, legacyDraftId: receipt.layoutId, legacyGridHeight: 22, legacyElementCount: 3, legacyInspectorDeleteImmediate: true, legacyUndoRestoresDuplicate: true, legacyScreenshot: `docs/admin-rebuild/evidence/editor/${role}-legacy-paired.png` };
  check(`${role} Legacy direct-link refresh, grid-height edit, shelf duplicate/delete/undo, private draft, API and Mobile readback`);
}

async function managerPublication(role, page, store, seed, stamp) {
  const draftName = `${role} published ${stamp}`;
  const root = `/api/stores/${store.id}/layout`;
  await page.goto(`${base}/admin/next/editor/?storeId=${store.id}&layoutId=${seed.version.layoutId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Layout Editor" }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Filialname" }).inputValue(), seed.current.layout.shopName, `${role} loads the seeded public version`);
  assert.equal(await page.locator(".le-layers button").count(), 2, `${role} Candidate starts from the same fixture`);
  await page.getByRole("textbox", { name: "Filialname" }).fill(draftName);
  await page.getByLabel("Höhe", { exact: true }).fill("22");
  await page.locator(".le-layers button").nth(1).click();
  await page.getByRole("button", { name: "Duplizieren" }).click();
  assert.equal(await page.locator(".le-layers button").count(), 3, `${role} Candidate duplicate`);
  let deleteConfirmation = null;
  page.once("dialog", async (dialog) => { deleteConfirmation = dialog.message(); await dialog.accept(); });
  await page.getByRole("button", { name: "Löschen" }).click();
  assert.match(deleteConfirmation || "", /löschen|entfernen/i, `${role} Candidate inspector delete confirmation`);
  assert.equal(await page.locator(".le-layers button").count(), 2, `${role} Candidate inspector delete`);
  await page.getByRole("button", { name: "Rückgängig" }).click();
  assert.equal(await page.locator(".le-layers button").count(), 3, `${role} Candidate undo restores deleted duplicate`);
  const screenshot = new URL(`../../docs/admin-rebuild/evidence/editor/${role}-candidate-paired.png`, import.meta.url);
  await page.screenshot({ path: screenshot.pathname, fullPage: true });
  await page.getByRole("button", { name: "Entwurf speichern" }).click();
  await page.getByText("Entwurf gespeichert.").waitFor({ timeout: 10_000 });
  const pairedDraftId = new URL(page.url()).searchParams.get("layoutId");
  assert.ok(pairedDraftId, `${role} paired draft save navigates to its saved version`);
  let row = ok(await api(page, "GET", `${root}/versions/${pairedDraftId}`), `${role} paired draft API readback`);
  assert.equal(row.status, "DRAFT");
  assert.equal(row.layout.shopName, draftName);
  assert.equal(row.layout.gridSize.height, 22);
  assert.equal(row.layout.elements.length, 3);
  evidence.pairedManagerActions[role].candidateDraftId = pairedDraftId;
  evidence.pairedManagerActions[role].candidateGridHeight = 22;
  evidence.pairedManagerActions[role].candidateElementCount = 3;
  evidence.pairedManagerActions[role].candidateInspectorDeleteConfirmed = true;
  evidence.pairedManagerActions[role].candidateUndoRestoresDuplicate = true;
  evidence.pairedManagerActions[role].candidateScreenshot = `docs/admin-rebuild/evidence/editor/${role}-candidate-paired.png`;
  assert.deepEqual(await mobileCurrent(store.id, `${role} before publish`), seed.current, `${role} draft is private before publishing`);
  assert.equal(await page.getByRole("button", { name: "Veröffentlichen" }).isEnabled(), false, `${role} duplicate shelf address blocks publication`);
  evidence.pairedManagerActions[role].candidateDuplicatePublishBlocked = true;

  // Publish a valid edit separately; the paired duplicate stays a private draft.
  await page.goto(`${base}/admin/next/editor/?storeId=${store.id}&layoutId=${seed.version.layoutId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Layout Editor" }).waitFor();
  await page.getByRole("textbox", { name: "Filialname" }).fill(draftName);
  await page.getByRole("button", { name: "Entwurf speichern" }).click();
  await page.getByText("Entwurf gespeichert.").waitFor({ timeout: 10_000 });
  const draftId = new URL(page.url()).searchParams.get("layoutId");
  assert.ok(draftId && draftId !== pairedDraftId, `${role} valid publication draft is separate`);
  row = ok(await api(page, "GET", `${root}/versions/${draftId}`), `${role} valid draft API readback`);
  assert.equal(row.status, "DRAFT");
  assert.equal(row.layout.shopName, draftName);
  let confirmation = null;
  page.once("dialog", async (dialog) => { confirmation = dialog.message(); await dialog.accept(); });
  assert.equal(await page.getByRole("button", { name: "Veröffentlichen" }).isEnabled(), true, `${role} Candidate publish enabled: ${await page.locator(".le-validation").innerText()}`);
  await page.getByRole("button", { name: "Veröffentlichen" }).click();
  assert.match(confirmation || "", /Entwurf veröffentlichen/);
  await page.getByRole("status").getByText("Layout veröffentlicht.").waitFor({ timeout: 10_000 });
  row = ok(await api(page, "GET", `${root}/versions/${draftId}`), `${role} published version API readback`);
  assert.equal(row.status, "ACTIVE");
  const oldAfterPublish = ok(await api(page, "GET", `${root}/versions/${seed.version.layoutId}`), `${role} previous version API readback`);
  assert.equal(oldAfterPublish.status, "ARCHIVED", `${role} publication archives the previous active version`);
  const mobilePublished = await mobileCurrent(store.id, `${role} published Mobile readback`);
  assert.equal(mobilePublished.layoutId, draftId);
  assert.equal(mobilePublished.layout.shopName, draftName);

  await page.goto(`${base}/admin/next/editor/?storeId=${store.id}&layoutId=${seed.version.layoutId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Layout Editor" }).waitFor();
  const restoreButton = page.getByRole("button", { name: "Version wieder aktivieren" });
  await restoreButton.waitFor();
  let restoreConfirmation = null;
  page.once("dialog", async (dialog) => { restoreConfirmation = dialog.message(); await dialog.accept(); });
  await restoreButton.click();
  assert.match(restoreConfirmation || "", /ältere Version wieder aktivieren/);
  await page.getByRole("status").getByText("Layout veröffentlicht.").waitFor({ timeout: 10_000 });
  const oldRestored = ok(await api(page, "GET", `${root}/versions/${seed.version.layoutId}`), `${role} reactivated version API readback`);
  assert.equal(oldRestored.status, "ACTIVE");
  const draftAfterRestore = ok(await api(page, "GET", `${root}/versions/${draftId}`), `${role} draft after restore API readback`);
  assert.equal(draftAfterRestore.status, "ARCHIVED");
  const mobileRestored = await mobileCurrent(store.id, `${role} restored Mobile readback`);
  assert.equal(mobileRestored.layoutId, seed.version.layoutId);
  assert.deepEqual(mobileRestored.layout, seed.current.layout, `${role} restores the original public layout data`);
  evidence.publications[role] = {
    storeId: store.id,
    previousVersionId: seed.version.layoutId,
    publishedDraftId: draftId,
    publishConfirmation: confirmation,
    restoreConfirmation,
    publishedMobileLayoutId: mobilePublished.layoutId,
    restoredMobileLayoutId: mobileRestored.layoutId,
    restoredOriginalLayout: true,
  };
  check(`${role} candidate UI draft save, confirmed publish, API/Mobile readbacks, and UI old-version reactivation`);
}

async function checkRoleDenials(role, page, foreign) {
  const deniedWrite = await api(page, "POST", `/api/stores/${foreign.id}/layout/versions`, {
    layoutName: `Denied ${role}`, activate: false, layout: documentFor(`Denied ${role}`),
  });
  assert.equal(deniedWrite.status, 403, `${role} foreign Store write is forbidden`);
  await page.goto(`${base}/admin/next/editor/?storeId=${foreign.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Zugriff verweigert" }).waitFor();
  const globalWrite = await api(page, "POST", "/api/layout/current", {});
  assert.equal(globalWrite.status, 403, `${role} global layout write is forbidden`);
  await page.goto(`${base}/admin/next/editor/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Zugriff verweigert" }).waitFor();
  evidence.denials.push({ role, foreignStoreApi: 403, foreignStoreEditor: "denied", globalApi: 403, globalEditor: "denied" });
  check(`${role} foreign Store API/direct-link and global API/direct-link denials`);
}

try {
  admin = await login(adminUser);
  assert.equal(ok(await api(admin, "GET", "/api/admin/me"), "admin identity").role, "admin");
  // Snapshot is the first database operation, before any temporary assignment write.
  previousAssignments = getAssignments();

  const stamp = randomUUID().slice(0, 8).toUpperCase();
  region = ok(await api(admin, "POST", "/api/regions", { code: `MP-${stamp}`, name: `Manager Publish ${stamp}` }), "create manager probe Region");
  foreignRegion = ok(await api(admin, "POST", "/api/regions", { code: `MF-${stamp}`, name: `Manager Foreign ${stamp}` }), "create foreign probe Region");
  regionStore = await createStore(`Region Manager ${stamp}`, `MR-${stamp}`, region.id);
  storeManagerStore = await createStore(`Store Manager ${stamp}`, `MS-${stamp}`, region.id);
  foreignStore = await createStore(`Foreign Manager ${stamp}`, `MF-${stamp}`, foreignRegion.id);
  evidence.fixtureIds = { regionId: region.id, regionManagerStoreId: regionStore.id, storeManagerStoreId: storeManagerStore.id, foreignRegionId: foreignRegion.id, foreignStoreId: foreignStore.id };

  const regionSeed = await seedActive(regionStore, `Region Seed ${stamp}`);
  const storeSeed = await seedActive(storeManagerStore, `Store Seed ${stamp}`);
  setDemoScopes(region.id, storeManagerStore.id);

  regionManager = await login(regionUser);
  storeManager = await login(storeUser);
  const regionMe = ok(await api(regionManager, "GET", "/api/admin/me"), "region manager identity");
  const storeMe = ok(await api(storeManager, "GET", "/api/admin/me"), "store manager identity");
  assert.equal(regionMe.role, "region-manager");
  assert.equal(regionMe.scope.regionId, region.id);
  assert.equal(storeMe.role, "store-manager");
  assert.equal(storeMe.scope.storeId, storeManagerStore.id);
  await managerLegacyDraft("region-manager", regionManager, regionStore, regionSeed);
  await managerLegacyDraft("store-manager", storeManager, storeManagerStore, storeSeed);
  await managerPublication("region-manager", regionManager, regionStore, regionSeed, stamp);
  await managerPublication("store-manager", storeManager, storeManagerStore, storeSeed, stamp);
  await checkRoleDenials("region-manager", regionManager, foreignStore);
  await checkRoleDenials("store-manager", storeManager, foreignStore);
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = error instanceof Error ? error.message : String(error);
} finally {
  for (const page of [regionManager, storeManager]) if (page) await page.close().catch(() => {});
  if (previousAssignments) {
    try {
      if (scopesChanged) restoreAssignments(previousAssignments);
      assert.deepEqual(getAssignments(), previousAssignments, "manager assignments are restored exactly");
      evidence.cleanup.scopesRestored = true;
    } catch (error) {
      evidence.result = "FAIL";
      evidence.cleanupError = `scope restore/readback failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  for (const [store, key] of [[regionStore, "storeArchived"], [storeManagerStore, "storeManagerStoreArchived"], [foreignStore, "foreignStoreArchived"]]) {
    if (!admin || !store) continue;
    try {
      const result = await api(admin, "PATCH", `/api/stores/${store.id}/archive`, {});
      evidence.cleanup[key] = result.status === 200;
      if (result.status !== 200) {
        evidence.result = "FAIL";
        evidence.cleanupError ||= `Store ${store.id} archive HTTP ${result.status}`;
      }
    } catch (error) {
      evidence.result = "FAIL";
      evidence.cleanupError ||= `Store ${store.id} archive failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  for (const [item, key] of [[foreignRegion, "foreignRegionArchived"], [region, "regionArchived"]]) {
    if (!admin || !item) continue;
    try {
      const result = await api(admin, "PATCH", `/api/regions/${item.id}/archive`, {});
      evidence.cleanup[key] = result.status === 200;
      if (result.status !== 200) {
        evidence.result = "FAIL";
        evidence.cleanupError ||= `Region ${item.id} archive HTTP ${result.status}`;
      }
    } catch (error) {
      evidence.result = "FAIL";
      evidence.cleanupError ||= `Region ${item.id} archive failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  if (admin) await admin.close().catch(() => {});
  await browser.close().catch(() => {});
  const allStoresArchived = evidence.cleanup.storeArchived && evidence.cleanup.storeManagerStoreArchived && evidence.cleanup.foreignStoreArchived;
  const allRegionsArchived = evidence.cleanup.regionArchived && evidence.cleanup.foreignRegionArchived;
  if (!evidence.cleanup.scopesRestored || !allStoresArchived || !allRegionsArchived) evidence.result = "FAIL";
  console.log(JSON.stringify(evidence));
  if (evidence.result !== "PASS") process.exitCode = 1;
}
