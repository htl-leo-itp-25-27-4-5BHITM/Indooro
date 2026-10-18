import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Role and scope acceptance probe for the disposable packaged admin stack.
// It writes only random Store/Region fixtures and Store drafts; global layouts
// are read-only throughout this script.
const base = process.env.ADMIN_SMOKE_BASE_URL || "http://localhost:8080";
assert.ok(["localhost", "127.0.0.1", "host.docker.internal"].includes(new URL(base).hostname), "role-action probe only permits local hosts");
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8").replace(/\$\{(\w+)\}/g, (match, name) => process.env[name] ?? match));
const [adminUser, regionUser, storeUser] = realm.users;
const dbContainer = process.env.ADMIN_SMOKE_PG_CONTAINER || "indooro-admin-rebuild-pg";
const dbUser = process.env.ADMIN_SMOKE_PG_USER || "indooro";
const dbName = process.env.ADMIN_SMOKE_PG_DATABASE || "indooro";
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP localhost 127.0.0.1,MAP host.docker.internal 127.0.0.1"] : [] });
const evidence = {
  result: "PASS",
  scope: "localhost:8080 only; disposable Store/Region fixtures; global layout remains read-only",
  checks: [],
  fixtureIds: {},
  cleanup: { scopesRestored: false, storeArchived: false, regionArchived: false },
};
let admin = null;
let regionManager = null;
let storeManager = null;
let region = null;
let foreignRegion = null;
let store = null;
let foreignStore = null;
let previousAssignments = null;
let scopesChanged = false;

function db(sql) {
  return execFileSync("docker", ["exec", dbContainer, "psql", "-U", dbUser, "-d", dbName, "-X", "-q", "-t", "-A", "-c", sql], { encoding: "utf8" }).trim();
}

function sqlString(value) {
  return value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
}

function getAssignments() {
  const subjects = [regionUser.id, storeUser.id].map(sqlString).join(", ");
  const raw = db(`SELECT COALESCE(json_agg(to_jsonb(u)), '[]'::json) FROM user_access_assignments u WHERE keycloak_subject IN (${subjects})`);
  return JSON.parse(raw || "[]");
}

function setDemoScopes(regionId, storeId) {
  const sql = `INSERT INTO user_access_assignments
    (id, keycloak_subject, username, email, role, region_id, store_id, status, created_at, updated_at)
    VALUES
    (gen_random_uuid(), ${sqlString(regionUser.id)}, ${sqlString(regionUser.username)}, ${sqlString(regionUser.email)}, 'region-manager', '${regionId}', NULL, 'ACTIVE', NOW(), NOW()),
    (gen_random_uuid(), ${sqlString(storeUser.id)}, ${sqlString(storeUser.username)}, ${sqlString(storeUser.email)}, 'store-manager', NULL, '${storeId}', 'ACTIVE', NOW(), NOW())
    ON CONFLICT (keycloak_subject) WHERE status = 'ACTIVE'
    DO UPDATE SET role = EXCLUDED.role, region_id = EXCLUDED.region_id, store_id = EXCLUDED.store_id, updated_at = NOW()`;
  db(sql);
  scopesChanged = true;
}

function restoreAssignments(rows) {
  const subjects = [regionUser.id, storeUser.id].map(sqlString).join(", ");
  db(`DELETE FROM user_access_assignments WHERE keycloak_subject IN (${subjects})`);
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

function check(label, condition = true) {
  assert.ok(condition, label);
  evidence.checks.push(label);
}

const layout = (shopName) => ({
  shopName,
  gridSize: { width: 20, height: 20 },
  elements: [
    { id: 1, type: "entrance", x: 2, y: 0, width: 3, height: 1, label: "Eingang" },
    { id: 2, type: "shelf", x: 5, y: 5, width: 3, height: 2, category: "310/1", meter: 1, label: shopName },
  ],
});

try {
  admin = await login(adminUser);
  assert.equal(ok(await api(admin, "GET", "/api/admin/me"), "admin identity").role, "admin");
  previousAssignments = getAssignments();

  const stamp = randomUUID().slice(0, 8).toUpperCase();
  region = ok(await api(admin, "POST", "/api/regions", { code: `ER-${stamp}`, name: `Editor Roles ${stamp}` }), "create disposable region");
  foreignRegion = ok(await api(admin, "POST", "/api/regions", { code: `EF-${stamp}`, name: `Editor Foreign ${stamp}` }), "create foreign disposable region");
  store = ok(await api(admin, "POST", "/api/stores", {
    regionId: region.id, storeCode: `ER-${stamp}`, name: `Editor Roles ${stamp}`,
    street: "Testgasse 1", zipCode: "4020", city: "Linz", country: "AT",
  }), "create in-scope disposable Store");
  foreignStore = ok(await api(admin, "POST", "/api/stores", {
    regionId: foreignRegion.id, storeCode: `EF-${stamp}`, name: `Editor Foreign ${stamp}`,
    street: "Fremdgasse 2", zipCode: "1010", city: "Wien", country: "AT",
  }), "create out-of-scope disposable Store");
  evidence.fixtureIds = { regionId: region.id, storeId: store.id, foreignRegionId: foreignRegion.id, foreignStoreId: foreignStore.id };

  setDemoScopes(region.id, store.id);
  regionManager = await login(regionUser);
  storeManager = await login(storeUser);
  for (const [role, page] of [["region-manager", regionManager], ["store-manager", storeManager]]) {
    const me = ok(await api(page, "GET", "/api/admin/me"), `${role} identity`);
    assert.equal(me.role, role);
    check(`${role} identity and temporary scope`, role === "region-manager" ? me.scope.regionId === region.id : me.scope.storeId === store.id);
  }

  const versionPath = `/api/stores/${store.id}/layout/versions`;
  const initialMobile = await fetch(`${base}/api/mobile/stores/${store.id}/layout/current`).then(async (response) => {
    assert.equal(response.status, 200, "fixture mobile current layout is readable");
    return response.json();
  });
  assert.equal(initialMobile.layoutId, null, "fixture starts without an active version");
  for (const [role, page] of [["region-manager", regionManager], ["store-manager", storeManager]]) {
    const name = `${role} disposable draft ${stamp}`;
    await page.goto(`${base}/admin/editor/?storeId=${store.id}&probe=role#canvas`, { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.pathname === "/admin/next/editor/" && url.searchParams.get("storeId") === store.id && url.searchParams.get("probe") === "role" && url.hash === "#canvas");
    await page.getByRole("heading", { name: "Layout Editor" }).waitFor();
    await page.screenshot({ path: `../docs/admin-rebuild/evidence/editor-cutover/${role}-own-store.png`, fullPage: true });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Layout Editor" }).waitFor();
    check(`${role} old Store entry redirects with query/fragment and survives refresh`);
    await page.goto(`${base}/admin/next/editor/?storeId=${store.id}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Layout Editor" }).waitFor();
    await page.getByRole("textbox", { name: "Filialname" }).fill(name);
    await page.getByRole("button", { name: "Entwurf speichern" }).click();
    await page.getByText("Entwurf gespeichert.").waitFor();
    const draftId = new URL(page.url()).searchParams.get("layoutId");
    assert.ok(draftId, `${role} saved draft URL contains a version ID`);
    const saved = ok(await api(page, "GET", `${versionPath}/${draftId}`), `${role} in-scope draft readback`);
    assert.equal(saved.status, "DRAFT", `${role} save creates a draft`);
    assert.equal(saved.layout.shopName, name);
    const mobileAfter = await fetch(`${base}/api/mobile/stores/${store.id}/layout/current`).then((response) => response.json());
    assert.equal(mobileAfter.layoutId, initialMobile.layoutId, `${role} draft remains unpublished`);
    check(`${role} can save an in-scope Store draft without publishing`);
  }

  const foreignPath = `/api/stores/${foreignStore.id}/layout/versions`;
  for (const [role, page] of [["region-manager", regionManager], ["store-manager", storeManager]]) {
    const denied = await api(page, "POST", foreignPath, { layoutName: `Denied ${stamp}`, activate: false, layout: layout(`Denied ${stamp}`) });
    assert.equal(denied.status, 403, `${role} out-of-scope Store mutation is forbidden`);
    await page.goto(`${base}/admin/next/editor/?storeId=${foreignStore.id}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Zugriff verweigert" }).waitFor();
    await page.goto(`${base}/admin/editor/?storeId=${foreignStore.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.pathname === "/admin/next/editor/" && url.searchParams.get("storeId") === foreignStore.id);
    await page.getByRole("heading", { name: "Zugriff verweigert" }).waitFor();
    check(`${role} out-of-scope API mutation and editor direct link denied`);

    const globalWrite = await api(page, "POST", "/api/layout/current", {});
    assert.equal(globalWrite.status, 403, `${role} global-layout API mutation is forbidden (empty payload prevents writes if guard regresses)`);
    await page.goto(`${base}/admin/next/editor/`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Zugriff verweigert" }).waitFor();
    await page.goto(`${base}/admin/editor/`, { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.pathname === "/admin/next/editor/");
    await page.getByRole("heading", { name: "Zugriff verweigert" }).waitFor();
    check(`${role} candidate global editor direct link denied`);
  }

  await admin.goto(`${base}/admin/next/editor/`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("heading", { name: "Globales Layout", exact: true }).waitFor();
  await admin.goto(`${base}/admin/editor/?probe=admin#canvas`, { waitUntil: "domcontentloaded" });
  await admin.waitForURL((url) => url.pathname === "/admin/next/editor/" && url.searchParams.get("probe") === "admin" && url.hash === "#canvas");
  await admin.getByRole("heading", { name: "Globales Layout", exact: true }).waitFor();
  await admin.screenshot({ path: "../docs/admin-rebuild/evidence/editor-cutover/admin-global.png", fullPage: true });
  await admin.reload({ waitUntil: "domcontentloaded" });
  await admin.getByRole("heading", { name: "Globales Layout", exact: true }).waitFor();
  check("admin old global entry redirects with query/fragment and survives refresh");
  check("admin can open the candidate global editor");
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = error instanceof Error ? error.message : String(error);
} finally {
  for (const page of [regionManager, storeManager]) if (page) await page.close().catch(() => {});
  if (scopesChanged && previousAssignments) {
    try {
      restoreAssignments(previousAssignments);
      evidence.cleanup.scopesRestored = true;
    } catch (error) {
      evidence.result = "FAIL";
      evidence.cleanupError = `role scope restore failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  if (admin && store) {
    try {
      const result = await api(admin, "PATCH", `/api/stores/${store.id}/archive`, {});
      evidence.cleanup.storeArchived = result.status === 200;
      if (!evidence.cleanup.storeArchived) { evidence.result = "FAIL"; evidence.cleanupError ||= `Store archive HTTP ${result.status}`; }
    } catch (error) {
      evidence.result = "FAIL";
      evidence.cleanupError ||= error instanceof Error ? error.message : String(error);
    }
  }
  if (admin && foreignStore) {
    try {
      const result = await api(admin, "PATCH", `/api/stores/${foreignStore.id}/archive`, {});
      if (result.status !== 200) { evidence.result = "FAIL"; evidence.cleanupError ||= `Foreign Store archive HTTP ${result.status}`; }
    } catch (error) {
      evidence.result = "FAIL";
      evidence.cleanupError ||= error instanceof Error ? error.message : String(error);
    }
  }
  for (const item of [foreignRegion, region]) if (admin && item) {
    try {
      const result = await api(admin, "PATCH", `/api/regions/${item.id}/archive`, {});
      const archived = result.status === 200;
      if (item === region) evidence.cleanup.regionArchived = archived;
      if (!archived) { evidence.result = "FAIL"; evidence.cleanupError ||= `Region ${item.id} archive HTTP ${result.status}`; }
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
