import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Read-only role/route matrix against the disposable local stack. Browser OIDC
// sessions are used because the configured web client disables password grants.
const base = process.env.ADMIN_SMOKE_BASE_URL || "http://localhost:8080";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8").replace(/\$\{(\w+)\}/g, (match, name) => process.env[name] ?? match));
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP host.docker.internal 127.0.0.1"] : [] });
const results = [];

async function login(user) {
  const page = await browser.newPage();
  await page.goto(`${base}/admin/next/`, { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill(user.username);
  await page.locator("#password").fill(user.credentials.find((item) => item.type === "password").value);
  await page.locator("#kc-login").click();
  await page.waitForURL("**/admin/next/**");
  return page;
}

async function get(page, path) {
  const response = await page.context().request.get(`${base}${path}`, { failOnStatusCode: false });
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = raw; }
  return { status: response.status(), body };
}

async function expect(label, page, path, status) {
  const result = await get(page, path);
  assert.equal(result.status, status, `${label}: ${path} returned ${result.status}, expected ${status}`);
  results.push({ label, path, status });
  return result.body;
}

try {
  const [admin, region, store] = await Promise.all(realm.users.slice(0, 3).map(login));
  const users = { admin, region, store };
  const adminMe = await expect("admin identity", admin, "/api/admin/me", 200);
  const regionMe = await expect("region identity", region, "/api/admin/me", 200);
  const storeMe = await expect("store identity", store, "/api/admin/me", 200);
  assert.deepEqual([adminMe.role, regionMe.role, storeMe.role], ["admin", "region-manager", "store-manager"]);
  assert.ok(regionMe.scope.regionId && storeMe.scope.storeId, "both scoped assignments must exist");

  const ownStoreId = storeMe.scope.storeId;
  const ownStore = await expect("assigned store", store, `/api/stores/${ownStoreId}`, 200);
  assert.equal(ownStore.region?.id, regionMe.scope.regionId, "the assigned store must be in the region-manager scope");
  const adminStores = [];
  for (let page = 0; page < 30; page++) {
    const list = await expect(`admin stores page ${page}`, admin, `/api/stores?page=${page}&size=100`, 200);
    adminStores.push(...list.content);
    if (adminStores.length >= list.totalElements) break;
  }
  const foreignStore = adminStores.find((item) => item.region?.id !== regionMe.scope.regionId && item.id !== ownStoreId);
  assert.ok(foreignStore, "a foreign store is required for the denial matrix");

  for (const [role, page] of Object.entries(users)) {
    const isAdmin = role === "admin";
    await expect(`${role} audit logs`, page, "/api/admin/logs?limit=5", isAdmin ? 200 : 403);
    await expect(`${role} error logs`, page, "/api/admin/error-logs?limit=5", isAdmin ? 200 : 403);
    await expect(`${role} regions`, page, "/api/regions", 200);
    const stores = await expect(`${role} stores`, page, "/api/stores?page=0&size=100", 200);
    assert.ok(Array.isArray(stores.content));
    if (!isAdmin) assert.ok(!stores.content.some((item) => item.id === foreignStore.id), `${role} list leaks foreign store`);
    await expect(`${role} beacons`, page, "/api/beacons", 200);
    await expect(`${role} free beacons`, page, "/api/beacons/free", 200);
    // The admin product API is store-scoped: every call names a store, and the caller needs scope on it.
    const ownScope = `storeCode=${encodeURIComponent(ownStore.storeCode)}`;
    await expect(`${role} products without store context`, page, "/api/admin/products?page=0&size=1", 400);
    await expect(`${role} products in assigned store`, page, `/api/admin/products?page=0&size=1&${ownScope}`, 200);
    await expect(`${role} products in foreign store`, page, `/api/admin/products?page=0&size=1&storeCode=${encodeURIComponent(foreignStore.storeCode)}`, isAdmin ? 200 : 403);
    await expect(`${role} recipes`, page, "/api/admin/recipes?page=0&size=1", isAdmin ? 200 : 403);
  }

  await expect("admin assigned detail", admin, `/api/stores/${ownStoreId}`, 200);
  await expect("region assigned detail", region, `/api/stores/${ownStoreId}`, 200);
  await expect("region foreign detail", region, `/api/stores/${foreignStore.id}`, 403);
  await expect("store foreign detail", store, `/api/stores/${foreignStore.id}`, 403);
  for (const suffix of ["audit", "beacons", "layout/current", "layout/versions", "layout/editor-context"]) {
    await expect(`admin assigned ${suffix}`, admin, `/api/stores/${ownStoreId}/${suffix}`, 200);
    await expect(`store assigned ${suffix}`, store, `/api/stores/${ownStoreId}/${suffix}`, 200);
    await expect(`store foreign ${suffix}`, store, `/api/stores/${foreignStore.id}/${suffix}`, 403);
  }
  for (const suffix of ["layout/current", "layout/versions", "layout/editor-context"]) {
    await expect(`region assigned ${suffix}`, region, `/api/stores/${ownStoreId}/${suffix}`, 200);
    await expect(`region foreign ${suffix}`, region, `/api/stores/${foreignStore.id}/${suffix}`, 403);
  }
  console.log(JSON.stringify({ result: "PASS", scope: "local-stack-only", checks: results.length, roles: 3, assignedStoreId: ownStoreId, foreignStoreId: foreignStore.id, noMutations: true }));
} catch (error) {
  console.log(JSON.stringify({ result: "FAIL", scope: "local-stack-only", completedChecks: results.length, error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
} finally {
  await browser.close();
}
