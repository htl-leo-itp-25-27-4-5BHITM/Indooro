import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Run only against the disposable packaged admin stack. Exercises list and
// detail routes, then archives its Stores and Beacon; the legacy list consumes
// only the API's first page.
const base = process.env.ADMIN_SMOKE_BASE_URL || "http://localhost:8080";
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8").replace(/\$\{(\w+)\}/g, (match, name) => process.env[name] ?? match));
const [adminUser, regionUser, storeUser] = realm.users;
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP host.docker.internal 127.0.0.1"] : [] });
const evidenceDir = new URL("../../docs/admin-rebuild/evidence/stores/", import.meta.url);
const created = [];
const createdBeacons = [];
const archivedStores = new Set();
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

async function forceLegacyStores(page) {
  await page.route("**/admin/route-cutover.js", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/stores: (true|false)/, "stores: false").replace(/storeDetail: (true|false)/, "storeDetail: false");
    await route.fulfill({ response, body });
  });
}

try {
  mkdirSync(evidenceDir, { recursive: true });
  admin = await login(adminUser);
  await forceLegacyStores(admin);
  const regionManager = await login(regionUser);
  await forceLegacyStores(regionManager);
  const storeManager = await login(storeUser);
  await forceLegacyStores(storeManager);
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
  await admin.screenshot({ path: new URL("legacy-admin.png", evidenceDir).pathname });
  await admin.locator("#page-content tbody tr").first().getByRole("button", { name: "Bearbeiten" }).focus();
  await admin.keyboard.press("Enter");
  await admin.locator(".drawer h2").getByText("Store bearbeiten").waitFor();
  for (const [field, value] of Object.entries({ street: "Testgasse 1", zipCode: "4020", city: "Linz", country: "AT", notes: `Edited in legacy list ${stamp}` })) await admin.locator(`.drawer #${field}`).fill(value);
  await admin.locator(".drawer button.primary").focus();
  await admin.keyboard.press("Enter");
  await admin.waitForURL("**/admin/stores/detail/?storeId=*");
  assert.equal(ok(await api(admin, "GET", `/api/stores/${created[0].id}`), "legacy list edit readback").notes, `Edited in legacy list ${stamp}`);
  await admin.locator("#page-content").getByText(fixtures[0].storeCode, { exact: true }).waitFor();
  assert.equal(await admin.locator("#page-content").getByRole("link", { name: "Beacon zuweisen" }).count(), 1, "legacy detail offers the Beacon workflow");
  assert.equal(await admin.locator("#page-content").getByRole("link", { name: "Layout-Version erstellen" }).count(), 1, "legacy detail offers the Editor workflow");
  assert.equal(await admin.locator("#page-content").getByText("Keine Beacons zugewiesen.").count(), 1, "legacy detail has the fixture's empty Beacon state");
  assert.equal(await admin.locator("#page-content").getByText("Keine Layout-Versionen.").count(), 1, "legacy detail has the fixture's empty Layout state");

  await admin.goto(`${base}/admin/next/stores/?query=${stamp}&sort=city`, { waitUntil: "domcontentloaded" });
  assert.deepEqual(await candidateRows(admin), legacyCodes.map((code) => code.trim()), "candidate and legacy city sort match on the same fixture");
  await admin.screenshot({ path: new URL("candidate-admin.png", evidenceDir).pathname });
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
  await admin.getByText("Keine Beacons zugeordnet.").waitFor();
  await admin.getByText("Noch kein aktives Layout.", { exact: false }).waitFor();
  await admin.getByRole("heading", { name: "Änderungsverlauf" }).waitFor();
  assert.equal(await admin.getByRole("link", { name: "Layout Editor öffnen" }).getAttribute("href"), `/admin/next/editor/?storeId=${created[0].id}`);
  await admin.screenshot({ path: new URL("candidate-detail-admin.png", evidenceDir).pathname });
  await admin.reload();
  await admin.getByRole("heading", { name: fixtures[0].name }).waitFor();
  let failDetailOnce = true;
  const failDetail = (route) => {
    if (failDetailOnce) { failDetailOnce = false; return route.fulfill({ status: 503, json: { error: "Injected Store detail failure" } }); }
    return route.continue();
  };
  await admin.route(`**/api/stores/${created[0].id}`, failDetail);
  await admin.reload();
  await admin.getByRole("alert").getByRole("button", { name: "Erneut versuchen" }).waitFor();
  await admin.getByRole("button", { name: "Erneut versuchen" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("heading", { name: fixtures[0].name }).waitFor();
  await admin.unroute(`**/api/stores/${created[0].id}`, failDetail);
  await admin.goto(`${base}/admin/next/stores/?query=${stamp}`, { waitUntil: "domcontentloaded" });
  await candidateRows(admin);
  const editLink = admin.getByRole("row").filter({ hasText: fixtures[0].storeCode }).getByRole("link", { name: "Bearbeiten" });
  await editLink.focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("textbox", { name: "Notizen" }).fill(`Edited from Store list ${stamp}`);
  await admin.getByRole("button", { name: "Speichern" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("status").getByText("Store gespeichert.").waitFor();
  assert.equal(ok(await api(admin, "GET", `/api/stores/${created[0].id}`), "Store list edit readback").notes, `Edited from Store list ${stamp}`);
  assert.equal(new URL(admin.url()).searchParams.has("edit"), false, "completed edit leaves the deep link in view mode");
  await admin.getByRole("button", { name: "Bearbeiten" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("textbox", { name: "Store-Code" }).fill(fixtures[1].storeCode);
  await admin.getByRole("button", { name: "Speichern" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("alert").getByText(/bereits|vorhanden|duplicate/i).waitFor();
  assert.equal(await admin.getByRole("textbox", { name: "Store-Code" }).inputValue(), fixtures[1].storeCode, "conflicting detail edit retains input");
  await admin.getByRole("textbox", { name: "Store-Code" }).fill(fixtures[0].storeCode);
  await admin.getByRole("button", { name: "Abbrechen" }).focus();
  await admin.keyboard.press("Enter");
  assert.equal(await admin.getByRole("textbox", { name: "Store-Code" }).count(), 0, "cancel closes detail edit");
  const detailBeacon = ok(await api(admin, "POST", "/api/beacons", { beaconCode: `PAR-BEACON-${stamp}`, uuid: randomUUID(), major: 1, minor: 1 }), "detail Beacon fixture");
  createdBeacons.push(detailBeacon);
  await admin.reload();
  await admin.getByRole("combobox", { name: "Freien Beacon zuordnen" }).selectOption(detailBeacon.id);
  await admin.getByRole("button", { name: "Zuordnen" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByText(detailBeacon.beaconCode, { exact: true }).waitFor();
  assert.equal(ok(await api(admin, "GET", `/api/stores/${created[0].id}/beacons`), "Beacon assignment readback").some((item) => item.beaconId === detailBeacon.id), true);
  admin.once("dialog", (dialog) => dialog.accept());
  await admin.getByRole("button", { name: "Freigeben" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByText("Keine Beacons zugeordnet.").waitFor();
  assert.equal(ok(await api(admin, "GET", `/api/stores/${created[0].id}/beacons`), "Beacon release readback").length, 0);

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
  await regionManager.goto(`${base}/admin/stores/`, { waitUntil: "domcontentloaded" });
  await regionManager.locator("#page-content table").waitFor();
  assert.equal(await regionManager.locator("#page-content tbody tr").filter({ hasText: fixtures[0].storeCode }).count(), 1, "legacy region list includes assigned Store");
  assert.equal(await regionManager.locator("#page-content tbody tr").filter({ hasText: fixtures[1].storeCode }).count(), 1, "legacy region list includes second assigned Store");
  await regionManager.goto(`${base}/admin/stores/detail/?storeId=${created[0].id}`, { waitUntil: "domcontentloaded" });
  await regionManager.locator("#page-content").getByText(fixtures[0].storeCode, { exact: true }).waitFor();
  await regionManager.goto(`${base}/admin/next/stores/detail/?storeId=${created[0].id}#scope`, { waitUntil: "domcontentloaded" });
  await regionManager.getByRole("heading", { name: fixtures[0].name }).waitFor();
  await regionManager.reload();
  await regionManager.getByRole("heading", { name: fixtures[0].name }).waitFor();
  assert.equal(await regionManager.getByRole("button", { name: "Archivieren" }).count(), 0, "region manager cannot archive through candidate detail");
  await regionManager.getByRole("button", { name: "Bearbeiten" }).focus();
  await regionManager.keyboard.press("Enter");
  assert.equal(await regionManager.getByRole("combobox", { name: "Region" }).isDisabled(), true, "region manager cannot move Store across regions");
  await regionManager.getByRole("textbox", { name: "Notizen" }).fill(`Region detail ${stamp}`);
  await regionManager.getByRole("button", { name: "Speichern" }).focus();
  await regionManager.keyboard.press("Enter");
  await regionManager.getByRole("status").getByText("Store gespeichert.").waitFor();
  assert.equal(ok(await api(admin, "GET", `/api/stores/${created[0].id}`), "region detail edit readback").notes, `Region detail ${stamp}`);
  await storeManager.goto(`${base}/admin/next/stores/?query=${stamp}`, { waitUntil: "domcontentloaded" });
  assert.deepEqual(await candidateRows(storeManager), [], "store manager does not see other Stores");
  assert.equal(await storeManager.getByRole("link", { name: "Store anlegen" }).count(), 0);
  const own = ok(await api(storeManager, "GET", `/api/stores/${assignedStoreId}`), "own Store read");
  await storeManager.goto(`${base}/admin/next/stores/?query=${encodeURIComponent(own.storeCode)}`, { waitUntil: "domcontentloaded" });
  assert.deepEqual(await candidateRows(storeManager), [own.storeCode], "store manager sees own Store");
  await storeManager.goto(`${base}/admin/stores/`, { waitUntil: "domcontentloaded" });
  await storeManager.locator("#page-content table").waitFor();
  assert.equal(await storeManager.locator("#page-content tbody tr").filter({ hasText: own.storeCode }).count(), 1, "legacy Store Manager list includes own Store");
  await storeManager.goto(`${base}/admin/stores/detail/?storeId=${assignedStoreId}`, { waitUntil: "domcontentloaded" });
  await storeManager.locator("#page-content").getByText(own.storeCode, { exact: true }).waitFor();
  await storeManager.goto(`${base}/admin/next/stores/detail/?storeId=${assignedStoreId}`, { waitUntil: "domcontentloaded" });
  await storeManager.getByRole("heading", { name: own.name }).waitFor();
  assert.equal(await storeManager.getByRole("button", { name: "Archivieren" }).count(), 0, "store manager cannot archive through candidate detail");
  assert.equal(await storeManager.getByRole("combobox", { name: "Freien Beacon zuordnen" }).count(), 0, "store manager has no candidate Beacon assignment control");
  assert.equal((await api(storeManager, "GET", `/api/stores/${created[0].id}`)).status, 403, "foreign Store detail denied");
  await storeManager.goto(`${base}/admin/next/stores/detail/?storeId=${created[0].id}`, { waitUntil: "domcontentloaded" });
  await storeManager.getByRole("alert").getByRole("heading", { name: "Zugriff verweigert" }).waitFor();
  assert.equal(await storeManager.getByRole("button", { name: "Erneut versuchen" }).count(), 0, "forbidden detail has no retry action");

  const legacyCode = `PAR-LEG-${stamp}`;
  await admin.goto(`${base}/admin/stores/`, { waitUntil: "domcontentloaded" });
  await admin.locator("#page-content table").waitFor();
  await admin.locator("[data-open-store]").focus();
  await admin.keyboard.press("Enter");
  await admin.locator(".drawer #regionId").selectOption(assignedRegionId);
  for (const [field, value] of Object.entries({ storeCode: legacyCode, name: `000 Legacy ${stamp}`, street: "Testgasse 2", zipCode: "4020", city: "Linz", country: "AT" })) await admin.locator(`.drawer #${field}`).fill(value);
  await admin.locator(".drawer button.primary").focus();
  await admin.keyboard.press("Enter");
  await admin.waitForURL("**/admin/stores/detail/?storeId=*");
  const legacyId = new URL(admin.url()).searchParams.get("storeId");
  assert.ok(legacyId);
  created.push({ id: legacyId, storeCode: legacyCode });
  assert.equal(ok(await api(admin, "GET", `/api/stores/${legacyId}`), "legacy list create readback").storeCode, legacyCode);

  const candidateCode = `PAR-NEW-${stamp}`;
  await admin.goto(`${base}/admin/next/stores/`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("link", { name: "Store anlegen" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("heading", { name: "Store anlegen" }).waitFor();
  await admin.getByRole("combobox", { name: "Region" }).selectOption(assignedRegionId);
  for (const [field, value] of Object.entries({ storeCode: candidateCode, name: `000 Candidate ${stamp}`, street: "Testgasse 3", zipCode: "4020", city: "Wien", country: "AT" })) await admin.locator(`input[name="${field}"]`).fill(value);
  await admin.getByRole("button", { name: "Store anlegen" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("status").getByRole("heading", { name: "Store angelegt" }).waitFor();
  const newHref = await admin.getByRole("link", { name: "Store-Detail öffnen" }).getAttribute("href");
  const candidateId = new URL(newHref, base).searchParams.get("storeId");
  assert.ok(candidateId);
  created.push({ id: candidateId, storeCode: candidateCode });
  assert.equal(ok(await api(admin, "GET", `/api/stores/${candidateId}`), "candidate list create readback").storeCode, candidateCode);

  const detailLayout = ok(await api(admin, "POST", `/api/stores/${created[1].id}/layout/versions`, {
    layoutName: `Parity Layout ${stamp}`, activate: true,
    layout: { shopName: `Parity Layout ${stamp}`, gridSize: { width: 10, height: 10 }, elements: [{ id: 1, type: "entrance", x: 4, y: 0, width: 2, height: 1, label: "Eingang" }] }
  }), "publish detail Layout fixture");
  assert.equal(detailLayout.status, "ACTIVE");
  await admin.goto(`${base}/admin/stores/detail/?storeId=${created[1].id}`, { waitUntil: "domcontentloaded" });
  await admin.locator("#page-content").getByText(`Version ${detailLayout.versionNo}`).waitFor();
  assert.equal(await admin.locator("#page-content").getByRole("link", { name: "Oeffnen" }).count(), 1, "legacy detail links the active Layout version");
  await admin.goto(`${base}/admin/next/stores/detail/?storeId=${created[1].id}#version`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("heading", { name: fixtures[1].name }).waitFor();
  await admin.getByText(`Aktiv: Version ${detailLayout.versionNo}`).waitFor();
  const versionLink = admin.getByRole("link", { name: "Im Editor öffnen" });
  assert.equal(await versionLink.getAttribute("href"), `/admin/next/editor/?storeId=${created[1].id}&layoutId=${detailLayout.layoutId}`);
  await admin.reload();
  await admin.getByText(`Aktiv: Version ${detailLayout.versionNo}`).waitFor();
  assert.equal(new URL(admin.url()).hash, "#version", "detail fragment survives refresh");
  admin.once("dialog", (dialog) => dialog.accept());
  await admin.getByRole("button", { name: "Archivieren" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("status").getByText("Store archiviert.").waitFor();
  archivedStores.add(created[1].id);
  assert.equal(ok(await api(admin, "GET", `/api/stores/${created[1].id}`), "detail archive readback").status, "ARCHIVED");
  await admin.locator(".page-intro").getByText(/Archiviert/).waitFor();
  assert.equal(await admin.getByRole("button", { name: "Archivieren" }).count(), 0, "archived Store cannot be archived again");
  assert.equal(await admin.getByRole("button", { name: "Bearbeiten" }).count(), 0, "archived Store cannot be edited");
  await admin.locator('[aria-labelledby="audit-title"]').getByText(/archiviert/i).waitFor();
  await admin.unroute("**/admin/route-cutover.js");
  await admin.goto(`${base}/admin/stores/detail/?storeId=${created[0].id}&probe=committed#proof`, { waitUntil: "domcontentloaded" });
  await admin.waitForURL((url) => url.pathname === "/admin/next/stores/detail/" && url.searchParams.get("storeId") === created[0].id && url.searchParams.get("probe") === "committed" && url.hash === "#proof");
  await admin.getByRole("heading", { name: fixtures[0].name }).waitFor();

  console.log(JSON.stringify({ result: "PASS", legacyCandidateSort: true, stableServerPaging: true, filtersBeforePaging: true, bothEditPathsPersisted: true, bothCreatePathsPersisted: true, detailFaultRetry: true, detailConflictAndBeaconLifecycle: true, detailLayoutAndArchive: true, committedDetailWithRealStore: true, roleScopes: 3, faultRetryAndEmpty: true, routeFlagChanged: false }));
} finally {
  if (admin) for (const item of created) if (!archivedStores.has(item.id)) ok(await api(admin, "PATCH", `/api/stores/${item.id}/archive`, {}), `archive fixture ${item.storeCode}`);
  if (admin) for (const beacon of createdBeacons) ok(await api(admin, "PATCH", `/api/beacons/${beacon.id}/archive`, {}), `archive Beacon fixture ${beacon.beaconCode}`);
  await browser.close();
}
