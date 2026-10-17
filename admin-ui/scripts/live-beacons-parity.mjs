import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Run only against the disposable packaged admin stack. Fixture Beacons are
// archived in finally; the committed Beacon route flag is never changed.
const base = process.env.ADMIN_SMOKE_BASE_URL || "http://localhost:8080";
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8").replace(/\$\{(\w+)\}/g, (match, name) => process.env[name] ?? match));
const [adminUser, regionUser, storeUser] = realm.users;
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP host.docker.internal 127.0.0.1"] : [] });
const evidenceDir = new URL("../../docs/admin-rebuild/evidence/beacons/", import.meta.url);
const created = [];
let admin;

async function login(user) {
  const page = await browser.newPage();
  await page.goto(base + "/admin/next/beacons/", { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill(user.username);
  await page.locator("#password").fill(user.credentials.find((item) => item.type === "password").value);
  await page.locator("#kc-login").click();
  await page.waitForURL("**/admin/next/beacons/**");
  return page;
}

async function api(page, method, path, data) {
  const response = await page.context().request.fetch(base + path, { method, data, failOnStatusCode: false });
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = raw; }
  return { status: response.status(), body };
}

function ok(result, label) {
  assert.equal(result.status, 200, label + ": HTTP " + result.status + " " + JSON.stringify(result.body).slice(0, 200));
  return result.body;
}

async function codes(page, legacy) {
  const selector = legacy ? "#page-content tbody tr td:first-child strong" : ".beacons-page tbody tr td:first-child strong";
  return (await page.locator(selector).allTextContents()).map((item) => item.trim());
}

async function forceLegacyBeacons(page) {
  await page.route("**/admin/route-cutover.js", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/beacons: (true|false)/, "beacons: false");
    await route.fulfill({ response, body });
  });
}

function expectedOrder(records, field) {
  const value = (item) => field === "store" ? item.currentStore?.storeCode : item[field];
  return [...records].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (left == null && right != null) return 1;
    if (right == null && left != null) return -1;
    return String(left ?? "").localeCompare(String(right ?? ""), "de", { numeric: true, sensitivity: "base" })
      || a.beaconCode.localeCompare(b.beaconCode, "de", { numeric: true, sensitivity: "base" });
  }).map((item) => item.beaconCode);
}

try {
  mkdirSync(evidenceDir, { recursive: true });
  admin = await login(adminUser);
  const regionManager = await login(regionUser);
  const storeManager = await login(storeUser);
  await forceLegacyBeacons(admin);
  await forceLegacyBeacons(regionManager);
  await forceLegacyBeacons(storeManager);
  const regionId = ok(await api(regionManager, "GET", "/api/admin/me"), "region scope").scope.regionId;
  const ownStoreId = ok(await api(storeManager, "GET", "/api/admin/me"), "store scope").scope.storeId;
  const storePage = ok(await api(admin, "GET", "/api/stores?status=ACTIVE&page=0&size=100"), "store candidates");
  const foreignStore = storePage.content.find((item) => item.id !== ownStoreId && item.region?.id !== regionId);
  assert.ok(foreignStore, "a foreign active Store is required for scope parity");
  const stamp = randomUUID().slice(0, 8).toUpperCase();
  const names = ["B-" + stamp + "-2", "B-" + stamp + "-10", "B-" + stamp + "-1"];
  for (let index = 0; index < names.length; index += 1) {
    created.push(ok(await api(admin, "POST", "/api/beacons", {
      beaconCode: names[index], uuid: randomUUID(), major: 1, minor: index + 1,
      notes: "Disposable Beacon parity fixture"
    }), "create Beacon " + names[index]));
  }
  ok(await api(admin, "POST", "/api/beacons/" + created[0].id + "/assign", { storeId: ownStoreId }), "assign own Beacon");
  ok(await api(admin, "POST", "/api/beacons/" + created[1].id + "/assign", { storeId: foreignStore.id }), "assign foreign Beacon");
  const records = ok(await api(admin, "GET", "/api/beacons?query=" + stamp), "fixture Beacon list");
  assert.equal(records.length, 3);

  await admin.goto(base + "/admin/beacons/", { waitUntil: "domcontentloaded" });
  await admin.locator("#page-content table").waitFor();
  await admin.locator('[data-filter="query"]').fill(stamp);
  await admin.locator("#page-content tbody tr").first().waitFor();
  assert.deepEqual(await codes(admin, true), expectedOrder(records, "beaconCode"), "legacy Code order");
  await admin.locator('[data-filter="sort"]').selectOption("uuid");
  assert.deepEqual(await codes(admin, true), expectedOrder(records, "uuid"), "legacy UUID order");
  await admin.locator('[data-filter="sort"]').selectOption("currentStore.storeCode");
  assert.deepEqual(await codes(admin, true), expectedOrder(records, "store"), "legacy Store order");
  await admin.screenshot({ path: new URL("legacy-admin.png", evidenceDir).pathname });

  await admin.goto(base + "/admin/next/beacons/", { waitUntil: "domcontentloaded" });
  await admin.getByRole("searchbox", { name: "Suche" }).fill(stamp);
  await admin.getByRole("row").filter({ hasText: names[0] }).waitFor();
  assert.deepEqual(await codes(admin, false), expectedOrder(records, "beaconCode"), "candidate Code order");
  await admin.getByRole("combobox", { name: "Sortierung" }).selectOption("uuid");
  assert.deepEqual(await codes(admin, false), expectedOrder(records, "uuid"), "candidate UUID order");
  await admin.getByRole("combobox", { name: "Sortierung" }).selectOption("storeCode");
  assert.deepEqual(await codes(admin, false), expectedOrder(records, "store"), "candidate Store order");
  await admin.screenshot({ path: new URL("candidate-admin.png", evidenceDir).pathname });
  await admin.getByRole("combobox", { name: "Zuweisung" }).selectOption("free");
  await admin.getByRole("row").filter({ hasText: names[2] }).waitFor();
  assert.deepEqual(await codes(admin, false), [names[2]], "free filter");
  await admin.getByRole("combobox", { name: "Zuweisung" }).selectOption("assigned");
  await admin.getByRole("row").filter({ hasText: names[0] }).waitFor();
  assert.deepEqual((await codes(admin, false)).sort(), [names[0], names[1]].sort(), "assigned filter");
  await admin.getByRole("combobox", { name: "Zuweisung" }).selectOption("all");

  let failOnce = true;
  const fault = (route) => {
    if (failOnce) { failOnce = false; return route.fulfill({ status: 503, json: { error: "Injected Beacon inventory failure" } }); }
    return route.continue();
  };
  await admin.route("**/api/beacons?*", fault);
  await admin.getByRole("combobox", { name: "Zuweisung" }).selectOption("assigned");
  await admin.getByRole("alert").getByRole("button", { name: "Erneut laden" }).waitFor();
  assert.deepEqual(await codes(admin, false), [], "failed reload hides stale rows");
  assert.equal(await admin.getByRole("button", { name: "Bearbeiten" }).count(), 0, "failed reload hides stale actions");
  await admin.getByRole("button", { name: "Erneut laden" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("row").filter({ hasText: names[0] }).waitFor();
  await admin.unroute("**/api/beacons?*", fault);

  for (const [page, role] of [[regionManager, "region"], [storeManager, "store"]]) {
    const visible = ok(await api(page, "GET", "/api/beacons?query=" + stamp), role + " Beacon list").map((item) => item.beaconCode);
    await page.goto(base + "/admin/beacons/", { waitUntil: "domcontentloaded" });
    await page.locator("#page-content").waitFor();
    await page.locator('[data-filter="query"]').fill(stamp);
    assert.deepEqual((await codes(page, true)).sort(), [...visible].sort(), role + " legacy scope");
    await page.goto(base + "/admin/next/beacons/", { waitUntil: "domcontentloaded" });
    await page.getByRole("searchbox", { name: "Suche" }).fill(stamp);
    await page.getByRole("status").filter({ hasText: "Beacons werden geladen" }).waitFor({ state: "hidden" });
    assert.deepEqual((await codes(page, false)).sort(), [...visible].sort(), role + " candidate scope");
    assert.equal(await page.getByRole("button", { name: "Beacon anlegen" }).count(), 0, role + " cannot create");
  }

  await regionManager.getByRole("row").filter({ hasText: names[0] }).getByRole("button", { name: "Bearbeiten" }).focus();
  await regionManager.keyboard.press("Enter");
  await regionManager.getByRole("textbox", { name: "Notizen" }).fill("Edited by Region Manager " + stamp);
  await regionManager.getByRole("button", { name: "Speichern" }).focus();
  await regionManager.keyboard.press("Enter");
  await regionManager.getByRole("status").getByText("Beacon wurde gespeichert.").waitFor();
  assert.equal(ok(await api(admin, "GET", "/api/beacons/" + created[0].id), "region Beacon edit").notes, "Edited by Region Manager " + stamp);
  storeManager.once("dialog", (dialog) => dialog.accept());
  await storeManager.getByRole("row").filter({ hasText: names[0] }).getByRole("button", { name: "Freigeben" }).focus();
  await storeManager.keyboard.press("Enter");
  await storeManager.getByRole("status").getByText(/freigegeben/).waitFor();
  assert.equal(ok(await api(admin, "GET", "/api/beacons/" + created[0].id), "store Beacon release").currentStore, null);

  await admin.goto(base + "/admin/next/beacons/?storeId=" + ownStoreId, { waitUntil: "domcontentloaded" });
  await admin.reload();
  await admin.getByRole("searchbox", { name: "Suche" }).fill(stamp);
  await admin.getByRole("row").filter({ hasText: names[2] }).getByRole("button", { name: "Zuweisen" }).focus();
  await admin.keyboard.press("Enter");
  assert.equal(await admin.getByRole("combobox", { name: "Ziel-Store" }).inputValue(), ownStoreId, "Store deep link preselects target");
  admin.once("dialog", (dialog) => dialog.accept());
  await admin.getByRole("button", { name: "Zuweisung bestätigen" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("status").getByText(/zugewiesen/).waitFor();
  assert.equal(ok(await api(admin, "GET", "/api/beacons/" + created[2].id), "Store context assignment").currentStore?.id, ownStoreId);

  await admin.getByRole("searchbox", { name: "Suche" }).fill("not-found-" + stamp);
  await admin.getByText("Keine Beacons passen zu Suche, Filtern oder Zugriff.").waitFor();
  await admin.getByRole("button", { name: "Beacon anlegen" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("textbox", { name: "Beacon-Code" }).fill(names[1]);
  await admin.getByRole("textbox", { name: "UUID" }).fill(randomUUID());
  await admin.getByRole("textbox", { name: "Major (optional)" }).fill("1");
  await admin.getByRole("textbox", { name: "Minor (optional)" }).fill("9");
  await admin.getByRole("button", { name: "Speichern" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("alert").getByText(/existiert bereits/).waitFor();
  assert.equal(await admin.getByRole("textbox", { name: "Beacon-Code" }).inputValue(), names[1], "server conflict retains candidate input");
  const identityConflictCode = "B-" + stamp + "-IDENTITY";
  await admin.getByRole("textbox", { name: "Beacon-Code" }).fill(identityConflictCode);
  await admin.getByRole("textbox", { name: "UUID" }).fill(created[1].uuid);
  await admin.getByRole("textbox", { name: "Major (optional)" }).fill("1");
  await admin.getByRole("textbox", { name: "Minor (optional)" }).fill("2");
  await admin.getByRole("button", { name: "Speichern" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("alert").getByText(/bereits vergeben/).waitFor();
  assert.equal(await admin.getByRole("textbox", { name: "Beacon-Code" }).inputValue(), identityConflictCode, "identity conflict retains candidate input");
  await admin.getByRole("button", { name: "Abbrechen" }).click();

  const legacyCode = "B-" + stamp + "-LEG";
  await admin.goto(base + "/admin/beacons/", { waitUntil: "domcontentloaded" });
  await admin.locator("#page-content table").waitFor();
  await admin.locator("[data-open-beacon]").click();
  for (const [field, value] of Object.entries({ beaconCode: legacyCode, uuid: randomUUID(), major: "3", minor: "1", notes: "Created in legacy" })) {
    await admin.locator(".drawer #" + field).fill(value);
  }
  await admin.locator(".drawer button.primary").focus();
  await admin.keyboard.press("Enter");
  await admin.locator(".drawer").waitFor({ state: "hidden" });
  const legacyBeacon = ok(await api(admin, "GET", "/api/beacons?query=" + legacyCode), "legacy Beacon create").find((item) => item.beaconCode === legacyCode);
  assert.ok(legacyBeacon, "legacy Beacon create persists");
  created.push(legacyBeacon);
  await admin.locator('[data-filter="query"]').fill(legacyCode);
  const legacyRow = admin.locator("#page-content tbody tr").filter({ hasText: legacyCode });
  await legacyRow.getByRole("button", { name: "Bearbeiten" }).focus();
  await admin.keyboard.press("Enter");
  await admin.locator(".drawer #notes").fill("Edited in legacy " + stamp);
  await admin.locator(".drawer button.primary").focus();
  await admin.keyboard.press("Enter");
  await admin.locator(".drawer").waitFor({ state: "hidden" });
  assert.equal(ok(await api(admin, "GET", "/api/beacons/" + legacyBeacon.id), "legacy Beacon edit").notes, "Edited in legacy " + stamp);
  await admin.locator("#page-content tbody tr").filter({ hasText: legacyCode }).getByRole("button", { name: "Zuweisen" }).focus();
  await admin.keyboard.press("Enter");
  const legacyTargetStoreId = await admin.locator(".drawer #storeId option").nth(1).getAttribute("value");
  assert.ok(legacyTargetStoreId, "legacy assignment has a first-page Store target");
  await admin.locator(".drawer #storeId").selectOption(legacyTargetStoreId);
  await admin.locator(".drawer button.primary").focus();
  await admin.keyboard.press("Enter");
  await admin.locator(".drawer").waitFor({ state: "hidden" });
  assert.equal(ok(await api(admin, "GET", "/api/beacons/" + legacyBeacon.id), "legacy Beacon assign").currentStore?.id, legacyTargetStoreId);
  await admin.locator("#page-content tbody tr").filter({ hasText: legacyCode }).getByRole("button", { name: "Freigeben" }).focus();
  await admin.keyboard.press("Enter");
  await admin.locator(".dialog-backdrop [data-confirm]").focus();
  await admin.keyboard.press("Enter");
  await admin.locator(".dialog-backdrop").waitFor({ state: "hidden" });
  assert.equal(ok(await api(admin, "GET", "/api/beacons/" + legacyBeacon.id), "legacy Beacon release").currentStore, null);
  await admin.locator("#page-content tbody tr").filter({ hasText: legacyCode }).getByRole("button", { name: "Archivieren" }).focus();
  await admin.keyboard.press("Enter");
  await admin.locator(".dialog-backdrop [data-confirm]").focus();
  await admin.keyboard.press("Enter");
  await admin.locator(".dialog-backdrop").waitFor({ state: "hidden" });
  assert.equal(ok(await api(admin, "GET", "/api/beacons/" + legacyBeacon.id), "legacy Beacon archive").status, "ARCHIVED");

  const bulkCode = "B-" + stamp + "-BULK";
  await admin.goto(base + "/admin/beacons/", { waitUntil: "domcontentloaded" });
  await admin.locator("#page-content table").waitFor();
  await admin.locator("[data-open-beacon-bulk]").click();
  await admin.locator(".drawer #uuid").fill(randomUUID());
  await admin.locator(".drawer #major").fill("4");
  await admin.locator(".drawer #items").fill(bulkCode + "-1,1\n" + bulkCode + "-2,2");
  await admin.locator(".drawer button.primary").focus();
  await admin.keyboard.press("Enter");
  await admin.locator(".drawer").waitFor({ state: "hidden" });
  const bulkRecords = ok(await api(admin, "GET", "/api/beacons?query=" + bulkCode), "legacy Beacon bulk");
  assert.equal(bulkRecords.length, 2, "legacy bulk creates both rows");
  created.push(...bulkRecords);

  const committedContext = await browser.newContext({ storageState: await admin.context().storageState() });
  const committedPage = await committedContext.newPage();
  await committedPage.goto(base + "/admin/beacons/?probe=committed#proof", { waitUntil: "domcontentloaded" });
  await committedPage.waitForURL((url) => url.pathname === "/admin/next/beacons/" && url.searchParams.get("probe") === "committed" && url.hash === "#proof");
  await committedPage.getByRole("heading", { name: "Beacons" }).waitFor();
  await committedContext.close();

  console.log(JSON.stringify({ result: "PASS", legacyCandidateSort: true, adminFilters: true, threeRoleScopes: true, scopedEditRelease: true, faultHidesStaleRows: true, keyboardRetry: true, contextAssignment: true, codeAndIdentityConflictRetention: true, legacyCreateEditAssignReleaseArchiveBulk: true, committedBeaconRedirect: true, beaconFlagChanged: false }));
} finally {
  if (admin) for (const item of created) {
    const current = await api(admin, "GET", "/api/beacons/" + item.id);
    if (current.status === 200 && current.body.status !== "ARCHIVED") ok(await api(admin, "PATCH", "/api/beacons/" + item.id + "/archive", {}), "archive fixture " + item.beaconCode);
  }
  await browser.close();
}
