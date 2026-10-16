import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Run against the dedicated packaged local stack. Writes disposable catalog rows.
const base = "http://localhost:8080";
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8"));
const adminUser = realm.users[0];
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP host.docker.internal 127.0.0.1"] : [] });

async function api(page, method, path, data) {
  const response = await page.context().request.fetch(base + path, { method, data, failOnStatusCode: false });
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = raw; }
  return { status: response.status(), body };
}

function expectSaved(result, ids) {
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.count, ids.length);
  assert.equal(result.body.saved, ids.length);
  assert.equal(result.body.failed, 0);
  assert.equal(result.body.unknown, 0);
  assert.deepEqual(result.body.rows.map((row) => [row.row, row.id, row.status]),
    ids.map((id, index) => [index + 1, String(id), "saved"]));
}

try {
  const page = await browser.newPage();
  await page.goto(base + "/admin/next/products/", { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill(adminUser.username);
  await page.locator("#password").fill(adminUser.credentials.find((item) => item.type === "password").value);
  await page.locator("#kc-login").click();
  await page.waitForURL("**/admin/next/products/*", { timeout: 15_000 });
  assert.ok([200, 409].includes((await api(page, "POST", "/api/admin/index/create", {})).status));

  const candidateCategories = Array.from({ length: 99 }, (_, index) => 901 + index);
  const unusedCodes = [];
  for (const code of candidateCategories) {
    if ((await api(page, "GET", `/api/categories/${code}`)).status === 404) unusedCodes.push(code);
    if (unusedCodes.length === 3) break;
  }
  assert.equal(unusedCodes.length, 3, "three unused local category codes are required");

  const categories = unusedCodes.slice(0, 2).map((code) => ({ categoryCode: code, categoryName: `Bulk Probe ${code}` }));
  expectSaved(await api(page, "POST", "/api/categories/bulk", categories), unusedCodes.slice(0, 2));
  for (const category of categories) {
    const persisted = await api(page, "GET", `/api/categories/${category.categoryCode}`);
    assert.equal(persisted.status, 200);
    assert.equal(persisted.body.categoryName, category.categoryName);
  }

  const run = Math.floor(Date.now() / 1000) % 1_000_000;
  const ids = [900_000_000 + run * 2, 900_000_001 + run * 2];
  assert.ok(ids[1] <= 2_147_483_647);
  for (const id of ids) assert.equal((await api(page, "GET", `/api/products/${id}`)).status, 404);
  const products = ids.map((id, index) => ({ id, name: `Bulk Probe ${id}`, price: 1.25 + index, layoutCode: "310/1/1/1" }));
  expectSaved(await api(page, "POST", "/api/products/bulk", products), ids);
  for (const product of products) {
    const persisted = await api(page, "GET", `/api/products/${product.id}`);
    assert.equal(persisted.status, 200);
    assert.equal(persisted.body.name, product.name);
    assert.equal(persisted.body.price, product.price);
  }

  const duplicateProduct = { ...products[0], id: ids[1] + 1 };
  assert.equal((await api(page, "POST", "/api/products/bulk", [duplicateProduct, duplicateProduct])).status, 400);
  assert.equal((await api(page, "GET", `/api/products/${duplicateProduct.id}`)).status, 404);
  const duplicateCategory = { categoryCode: unusedCodes[2], categoryName: "Duplicate Probe" };
  assert.equal((await api(page, "POST", "/api/categories/bulk", [duplicateCategory, duplicateCategory])).status, 400);
  assert.equal((await api(page, "GET", `/api/categories/${duplicateCategory.categoryCode}`)).status, 404);

  console.log(`Catalog bulk live: category codes ${unusedCodes.slice(0, 2).join(", ")}; product IDs ${ids.join(", ")}; per-row responses, persisted readback, and duplicate preflight passed.`);
} finally {
  await browser.close();
}
