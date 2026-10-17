import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Runs only against the disposable local stack. The OpenSearch fixtures are
// deleted in finally, including when a parity assertion fails.
const base = process.env.ADMIN_SMOKE_BASE_URL || "http://localhost:8080";
const searchBase = process.env.ADMIN_SMOKE_OPENSEARCH_URL || "http://127.0.0.1:9200";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
assert.ok(["127.0.0.1", "localhost"].includes(new URL(searchBase).hostname));
const evidenceDir = new URL("../../docs/admin-rebuild/evidence/products/", import.meta.url);
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8").replace(/\$\{(\w+)\}/g, (match, name) => process.env[name] ?? match));
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP host.docker.internal 127.0.0.1"] : [] });
const stamp = randomUUID().slice(0, 8);
const query = `Parity${stamp}`;
const startId = 1_900_000_000 + Math.floor(Math.random() * 100_000);
const fixtures = [
  { id: startId, name: `${query} 2`, price: 1, layoutCode: "310/1/1/1", storeId: null, storeCode: null },
  { id: startId + 1, name: `${query} 10`, price: 1, layoutCode: "310/1/1/2", storeId: null, storeCode: null },
  { id: startId + 2, name: `${query} ohne Position`, price: 1, layoutCode: "invalid", storeId: null, storeCode: null },
  { id: startId + 3, name: `${query} 20`, price: 1, layoutCode: "310/1/1/10", storeId: null, storeCode: null }
];
const lifecycleIds = [startId + 4, startId + 5];

async function login(user) {
  const page = await browser.newPage();
  await page.goto(base + "/admin/next/products/", { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill(user.username);
  await page.locator("#password").fill(user.credentials.find((item) => item.type === "password").value);
  await page.locator("#kc-login").click();
  await page.waitForURL("**/admin/next/products/**");
  return page;
}

async function api(page, path) {
  const response = await page.context().request.get(base + path, { failOnStatusCode: false });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

async function persistedProduct(page, id) {
  const result = await api(page, `/api/admin/products?page=0&size=20&q=${id}`);
  assert.equal(result.status, 200);
  return result.body.content.find((item) => item.id === id) ?? null;
}

async function waitProduct(page, id, expectedName) {
  for (let attempt = 0; attempt < 24; attempt++) {
    const product = await persistedProduct(page, id);
    if ((product?.name ?? null) === expectedName) return product;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Product ${id} did not reach expected index state ${expectedName}`);
}

async function indexFixture(product) {
  const response = await fetch(`${searchBase}/products/_doc/${product.id}?refresh=true`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(product)
  });
  assert.ok(response.ok, `fixture ${product.id}: HTTP ${response.status}`);
}

try {
  mkdirSync(evidenceDir, { recursive: true });
  const [adminUser, regionUser, storeUser] = realm.users;
  const admin = await login(adminUser);
  const region = await login(regionUser);
  const store = await login(storeUser);
  await admin.route("**/admin/route-cutover.js", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace(/products: (true|false)/, "products: false") });
  });
  for (const product of fixtures) await indexFixture(product);

  for (const [label, userPage] of [["region", region], ["store", store]]) {
    const denied = await api(userPage, `/api/admin/products?page=0&q=${query}&sort=name&routable=true`);
    assert.equal(denied.status, 403, `${label} product API denial`);
    await userPage.reload();
    await userPage.getByRole("alert").getByText("Zugriff verweigert").waitFor();
  }

  const expected = [fixtures[0].id, fixtures[1].id, fixtures[3].id];
  await admin.goto(base + "/admin/products/", { waitUntil: "domcontentloaded" });
  await admin.locator("#page-content table").waitFor();
  await admin.locator("[data-filter=query]").fill(query);
  await admin.locator("[data-filter=readiness]").selectOption("ready");
  await admin.locator("[data-filter=sort]").selectOption("name");
  const legacyIds = await admin.locator("#page-content tbody tr td:first-child").allTextContents();
  assert.deepEqual(legacyIds.map((value) => Number(value.trim())), expected, "legacy natural-name/readiness fixture order");
  await admin.screenshot({ path: new URL("legacy-admin.png", evidenceDir).pathname, fullPage: true });

  const first = await api(admin, `/api/admin/products?page=0&size=1&q=${query}&sort=name&routable=true`);
  const second = await api(admin, `/api/admin/products?page=1&size=1&q=${query}&sort=name&routable=true`);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.body.totalElements, 3, "readiness filter precedes pagination");
  assert.equal(second.body.totalElements, 3);
  assert.deepEqual([first.body.content[0].id, second.body.content[0].id], expected.slice(0, 2), "natural name order across pages");
  const layoutSecond = await api(admin, `/api/admin/products?page=1&size=1&q=${query}&sort=layoutCode&routable=true`);
  const layoutThird = await api(admin, `/api/admin/products?page=2&size=1&q=${query}&sort=layoutCode&routable=true`);
  assert.deepEqual([layoutSecond.body.content[0].layoutCode, layoutThird.body.content[0].layoutCode], ["310/1/1/2", "310/1/1/10"], "natural layout-code order across pages");
  const notRoutable = await api(admin, `/api/admin/products?page=0&size=20&q=${query}&sort=id&routable=false`);
  assert.equal(notRoutable.status, 200);
  assert.deepEqual(notRoutable.body.content.map((item) => item.id), [fixtures[2].id]);

  await admin.goto(base + `/admin/next/products/?q=${query}&readiness=warning&sort=id`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("cell", { name: `${query} ohne Position` }).waitFor();
  await admin.reload();
  await admin.getByRole("cell", { name: `${query} ohne Position` }).waitFor();
  await admin.getByLabel("Readiness").selectOption("ready");
  await admin.getByLabel("Sortierung").selectOption("name");
  await admin.getByRole("cell", { name: `${query} 2`, exact: true }).waitFor();
  assert.equal(await admin.getByRole("cell", { name: `${query} ohne Position` }).count(), 0);
  await admin.screenshot({ path: new URL("candidate-admin.png", evidenceDir).pathname, fullPage: true });
  let failOnce = true;
  await admin.route("**/api/admin/products?*", (route) => {
    if (failOnce) { failOnce = false; return route.fulfill({ status: 503, json: { error: "Injected product list failure" } }); }
    return route.continue();
  });
  await admin.reload();
  await admin.getByRole("alert").getByRole("button", { name: "Erneut laden" }).waitFor();
  assert.equal(await admin.getByRole("button", { name: "Bearbeiten" }).count(), 0, "failed reload hides stale product actions");
  await admin.getByRole("button", { name: "Erneut laden" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("cell", { name: `${query} 2`, exact: true }).waitFor();
  await admin.unroute("**/api/admin/products?*");
  await admin.route("**/api/admin/products?*", (route) => route.fulfill({ json: { content: [], page: 0, size: 20, totalElements: 0 } }));
  await admin.reload();
  await admin.getByText("Keine Produkte zu Suche oder Filter gefunden.").waitFor();
  await admin.unroute("**/api/admin/products?*");
  const legacyName = `${query} Legacy`;
  await admin.goto(base + "/admin/products/", { waitUntil: "domcontentloaded" });
  for (let attempt = 0; attempt < 4 && await admin.locator(".drawer").count() === 0; attempt++) {
    await admin.locator("[data-open-product]").click();
    await admin.locator(".drawer").waitFor({ timeout: 800 }).catch(() => {});
  }
  await admin.locator(".drawer #id").fill(String(lifecycleIds[0]));
  await admin.locator(".drawer #name").fill(legacyName);
  await admin.locator(".drawer #price").fill("1.25");
  await admin.locator(".drawer #layoutCode").fill("310/1/1/1");
  await admin.locator(".drawer button.primary").focus();
  await admin.keyboard.press("Enter");
  await admin.locator(".drawer").waitFor({ state: "detached" });
  await waitProduct(admin, lifecycleIds[0], legacyName);
  await admin.reload();
  await admin.locator("#page-content table").waitFor();
  await admin.locator("[data-filter=query]").fill(legacyName);
  const legacyRow = admin.locator("#page-content tbody tr").filter({ hasText: legacyName });
  await legacyRow.getByRole("button", { name: "Bearbeiten" }).focus();
  await admin.keyboard.press("Enter");
  await admin.locator(".drawer #name").fill(`${legacyName} editiert`);
  await admin.locator(".drawer button.primary").focus();
  await admin.keyboard.press("Enter");
  await admin.locator(".drawer").waitFor({ state: "detached" });
  await waitProduct(admin, lifecycleIds[0], `${legacyName} editiert`);
  await admin.reload();
  await admin.locator("#page-content table").waitFor();
  await admin.locator("[data-filter=query]").fill(legacyName);
  await admin.locator("#page-content tbody tr").filter({ hasText: `${legacyName} editiert` }).getByRole("button", { name: /Loeschen|Löschen/ }).focus();
  await admin.keyboard.press("Enter");
  await admin.locator(".dialog [data-confirm]").focus();
  await admin.keyboard.press("Enter");
  await admin.locator(".dialog").waitFor({ state: "detached" });
  await waitProduct(admin, lifecycleIds[0], null);

  const candidateName = `${query} Candidate`;
  await admin.goto(base + "/admin/next/products/", { waitUntil: "domcontentloaded" });
  await admin.getByRole("button", { name: "Produkt anlegen" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByLabel("Produkt-ID").fill(String(lifecycleIds[1]));
  await admin.getByRole("textbox", { name: "Name" }).fill(candidateName);
  await admin.getByLabel("Preis (EUR)").fill("1,25");
  await admin.getByLabel("Kategorie").selectOption("310");
  await admin.getByRole("button", { name: "Speichern" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByText("Produkt wurde angelegt.").waitFor();
  await waitProduct(admin, lifecycleIds[1], candidateName);
  await admin.reload();
  await admin.getByRole("searchbox", { name: "Suche" }).fill(candidateName);
  await admin.getByRole("button", { name: "Suchen" }).focus();
  await admin.keyboard.press("Enter");
  const candidateRow = admin.getByRole("row").filter({ hasText: candidateName });
  await candidateRow.getByRole("button", { name: "Bearbeiten" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("textbox", { name: "Name" }).fill(`${candidateName} editiert`);
  await admin.getByRole("button", { name: "Speichern" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByText("Produkt wurde aktualisiert.").waitFor();
  await waitProduct(admin, lifecycleIds[1], `${candidateName} editiert`);
  await admin.reload();
  await admin.getByRole("searchbox", { name: "Suche" }).fill(candidateName);
  await admin.getByRole("button", { name: "Suchen" }).click();
  admin.once("dialog", (dialog) => void dialog.accept());
  await admin.getByRole("row").filter({ hasText: `${candidateName} editiert` }).getByRole("button", { name: "Löschen" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByText(`Produkt ${candidateName} editiert wurde gelöscht.`).waitFor();
  await waitProduct(admin, lifecycleIds[1], null);

  const importPayload = JSON.stringify([{ id: lifecycleIds[0], name: `${query} Import`, price: 1.25, layoutCode: "310/1/1/1" }]);
  await admin.goto(base + "/admin/products/", { waitUntil: "domcontentloaded" });
  for (let attempt = 0; attempt < 4 && await admin.locator(".drawer").count() === 0; attempt++) {
    await admin.locator("[data-open-product-import]").click();
    await admin.locator(".drawer").waitFor({ timeout: 800 }).catch(() => {});
  }
  await admin.locator(".drawer #payload").fill(importPayload);
  await admin.locator(".drawer button.primary").click();
  await admin.locator(".drawer [data-import-review]").getByText("Commit gesperrt.").waitFor();
  assert.equal(await admin.locator(".drawer [data-import-review] button:disabled").count(), 1);
  assert.equal(await persistedProduct(admin, lifecycleIds[0]), null);
  await admin.goto(base + "/admin/next/products/", { waitUntil: "domcontentloaded" });
  await admin.getByLabel("JSON-Array oder NDJSON").fill(importPayload);
  await admin.getByRole("button", { name: "Parsen und prüfen" }).click();
  await admin.getByRole("button", { name: "Commit nicht verfügbar" }).waitFor();
  assert.equal(await admin.getByRole("button", { name: "Commit nicht verfügbar" }).isDisabled(), true);
  assert.equal(await persistedProduct(admin, lifecycleIds[0]), null);

  console.log(JSON.stringify({ productFilterSort: true, roleDenial: true, directRefresh: true, keyboardRetry: true, emptyState: true, legacyAndCandidateLifecycle: true, importReviewWithoutWrite: true, fixtures: fixtures.length }));
} finally {
  for (const id of [...fixtures.map((item) => item.id), ...lifecycleIds]) {
    await fetch(`${searchBase}/products/_doc/${id}?refresh=true`, { method: "DELETE" }).catch(() => {});
  }
  await browser.close();
}
