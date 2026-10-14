import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Run only against the disposable packaged admin stack. Creates two Stores and
// archives them in finally; the legacy list consumes only the API's first page.
const base = process.env.ADMIN_SMOKE_BASE_URL || "http://localhost:8080";
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8"));
const [adminUser, regionUser, storeUser] = realm.users;
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP host.docker.internal 127.0.0.1"] : [] });
const created = [];
let admin;

async function login(user) {
  const page = await browser.newPage();
  await page.goto(`${base}/admin/next/stores/`, { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill(user.username);
  await page.locator("#password").fill(user.credentials.find((item) => item.type === "password").value);
  await page.locator("#kc-login").click();
  await page.waitForURL("**/admin/next/stores/**");
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

async function candidateRows(page) {
  await page.getByRole("region", { name: "Store-Ergebnisse" }).waitFor();
  return page.locator(".stores-page tbody tr td:first-child small").allTextContents().then((items) => items.map((item) => item.trim()));
}

try {
  admin = await login(adminUser);
  const regionManager = await login(regionUser);
  const storeManager = await login(storeUser);
  const assignedRegionId = ok(await api(regionManager, "GET", "/api/admin/me"), "region identity").scope.regionId;
  const assignedStoreId = ok(await api(storeManager, "GET", "/api/admin/me"), "store identity").scope.storeId;
  assert.ok(assignedRegionId && assignedStoreId, "demo role scopes must be assigned");

  const stamp = randomUUID().slice(0, 8).toUpperCase();
  const fixtures = [
    { storeCode: `PAR-A-${stamp}`, name: `000 ${stamp} Z`, city: "Linz" },
    { storeCode: `PAR-B-${stamp}`, name: `000 ${stamp} A`, city: "Wien" }
  ];
  for (const item of fixtures) created.push(ok(await api(admin, "POST", "/api/stores", {
    regionId: assignedRegionId, ...item, street: "Testgasse 1", zipCode: "4020", country: "AT"
  }), `create ${item.storeCode}`));

  await admin.goto(`${base}/admin/stores/`, { waitUntil: "domcontentloaded" });
  await admin.locator("#page-content table").waitFor();
  await admin.locator('[data-filter="query"]').fill(stamp);
  await admin.locator("#page-content tbody tr").first().waitFor();
  await admin.locator('[data-filter="sort"]').selectOption("city");
  const legacyCodes = await admin.locator("#page-content tbody tr td:first-child .mono").allTextContents();
  assert.deepEqual(legacyCodes.map((code) => code.trim()), [fixtures[0].storeCode, fixtures[1].storeCode], "legacy city order for fixture in first API page");
  assert.equal(await admin.locator("#page-content th").allTextContents().then((items) => items.map((item) => item.trim()).join("|")), "Store|Region|Ort|Beacons|Layout|Aktionen");
  assert.equal(await admin.locator("#page-content tbody tr").first().getByRole("button", { name: "Bearbeiten" }).count(), 1);

  await admin.goto(`${base}/admin/next/stores/?query=${stamp}&sort=city`, { waitUntil: "domcontentloaded" });
  assert.deepEqual(await candidateRows(admin), legacyCodes.map((code) => code.trim()), "candidate and legacy city sort match on the same fixture");
  await admin.reload();
  assert.deepEqual(await candidateRows(admin), legacyCodes.map((code) => code.trim()), "direct query survives refresh");
  assert.equal(await admin.getByRole("combobox", { name: "Sortierung" }).inputValue(), "city");
  await admin.getByRole("combobox", { name: "Sortierung" }).selectOption("name");
  await admin.getByRole("button", { name: "Anwenden" }).click();
  assert.deepEqual(await candidateRows(admin), [fixtures[1].storeCode, fixtures[0].storeCode], "name sort reaches UI");
  await admin.getByRole("combobox", { name: "Sortierung" }).selectOption("storeCode");
  await admin.getByRole("button", { name: "Anwenden" }).click();
  assert.deepEqual(await candidateRows(admin), [fixtures[0].storeCode, fixtures[1].storeCode], "code sort reaches UI");
  assert.equal((await api(admin, "GET", `/api/stores?query=${stamp}&sort=city`)).status, 200);
  assert.equal((await api(admin, "GET", "/api/stores?sort=name%3Bdelete")).status, 400, "unknown sort is rejected");

  await admin.getByRole("combobox", { name: "Region" }).selectOption(assignedRegionId);
  await admin.getByRole("combobox", { name: "Layout" }).selectOption("missing");
  await admin.getByRole("button", { name: "Anwenden" }).click();
  assert.deepEqual(await candidateRows(admin), [fixtures[0].storeCode, fixtures[1].storeCode], "region and missing-layout filters apply before paging");
  const detailLink = admin.getByRole("row").filter({ hasText: fixtures[0].storeCode }).getByRole("link", { name: "Details" });
  await detailLink.focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("heading", { name: fixtures[0].name }).waitFor();
  assert.equal(new URL(admin.url()).searchParams.get("storeId"), created[0].id);

  const pageOne = ok(await api(admin, "GET", "/api/stores?page=1&size=20&sort=city"), "second server page");
  await admin.goto(`${base}/admin/next/stores/?sort=city&page=1`, { waitUntil: "domcontentloaded" });
  assert.deepEqual(await candidateRows(admin), pageOne.content.map((item) => item.storeCode), "second UI page matches filtered server order");
  assert.equal(await admin.getByRole("link", { name: "Zurück" }).getAttribute("href"), "/admin/next/stores/?sort=city");
  assert.ok(pageOne.totalElements > 20, "local fixture has enough Stores to exercise paging");

  let failOnce = true;
  const fault = (route) => {
    if (failOnce) { failOnce = false; return route.fulfill({ status: 503, json: { error: "Injected Store list failure" } }); }
    return route.continue();
  };
  await admin.route("**/api/stores?*", fault);
  await admin.goto(`${base}/admin/next/stores/?query=${stamp}`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("alert").getByRole("button", { name: "Erneut versuchen" }).waitFor();
  await admin.getByRole("button", { name: "Erneut versuchen" }).focus();
  await admin.keyboard.press("Enter");
  assert.equal((await candidateRows(admin)).length, 2, "keyboard retry reloads real data");
  await admin.unroute("**/api/stores?*", fault);
  await admin.goto(`${base}/admin/next/stores/?query=not-found-${stamp}`, { waitUntil: "domcontentloaded" });
  await admin.getByText("Keine Stores passen zu den Filtern.").waitFor();

  await regionManager.goto(`${base}/admin/next/stores/?query=${stamp}`, { waitUntil: "domcontentloaded" });
  assert.deepEqual(await candidateRows(regionManager), [fixtures[1].storeCode, fixtures[0].storeCode], "region manager sees both assigned-region Stores");
  assert.equal(await regionManager.getByRole("link", { name: "Store anlegen" }).count(), 1);
  await storeManager.goto(`${base}/admin/next/stores/?query=${stamp}`, { waitUntil: "domcontentloaded" });
  assert.deepEqual(await candidateRows(storeManager), [], "store manager does not see other Stores");
  assert.equal(await storeManager.getByRole("link", { name: "Store anlegen" }).count(), 0);
  const own = ok(await api(storeManager, "GET", `/api/stores/${assignedStoreId}`), "own Store read");
  await storeManager.goto(`${base}/admin/next/stores/?query=${encodeURIComponent(own.storeCode)}`, { waitUntil: "domcontentloaded" });
  assert.deepEqual(await candidateRows(storeManager), [own.storeCode], "store manager sees own Store");
  assert.equal((await api(storeManager, "GET", `/api/stores/${created[0].id}`)).status, 403, "foreign Store detail denied");

  console.log(JSON.stringify({ result: "PASS", legacyCandidateSort: true, stableServerPaging: true, filtersBeforePaging: true, roleScopes: 3, faultRetryAndEmpty: true, routeFlagChanged: false }));
} finally {
  if (admin) for (const item of created) ok(await api(admin, "PATCH", `/api/stores/${item.id}/archive`, {}), `archive fixture ${item.storeCode}`);
  await browser.close();
}
