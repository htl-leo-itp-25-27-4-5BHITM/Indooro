import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Compares the packaged legacy and candidate Store editors on one disposable
// fixture. It never publishes or writes a global layout.
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
  scope: "packaged local stack; same disposable Store fixture; no global layout writes or publication",
  fixtureIds: {},
  legacy: {
    initialLoaded: false,
    newAction: { confirmation: null, clearsElements: false, undoRestoresElements: false, versionPostCount: null },
    template: { confirmationCount: null, gridSizeAfter: null, clearsElements: false, undoRestoresGridAndElements: false, versionPostCount: null },
    back: { stayDialog: null, stayedOnEditor: false, sourceHref: null, navigationUrl: null, destination: null },
    beforeUnloadStay: { observed: false, type: null, message: null },
  },
  candidate: {
    initialLoaded: false,
    newAction: { confirmation: null, clearsElements: false, undoRestoresElements: false, versionPostCount: null },
    template: { confirmation: null, gridSizeAfter: null, clearsElements: false, undoRestoresGridAndElements: false, versionPostCount: null },
    back: { stayDialog: null, stayedOnEditor: false, sourceHref: null, navigationUrl: null, destination: null },
    beforeUnloadStay: { observed: false, type: null, message: null },
  },
  observedDifferences: {},
  anonymousMobileUnchanged: false,
  versionIdsUnchanged: false,
  actualStoreVersionPosts: [],
  httpStatuses: [],
  cleanup: { store: null, region: null },
};

async function login() {
  const page = await browser.newPage();
  await page.goto(`${base}/admin/next/`, { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill(adminUser.username);
  await page.locator("#password").fill(adminUser.credentials.find((item) => item.type === "password").value);
  await page.locator("#kc-login").click();
  await page.waitForURL("**/admin/next/**", { timeout: 15_000 });
  return page;
}

async function api(page, method, path, data) {
  const response = await page.context().request.fetch(base + path, { method, data, failOnStatusCode: false });
  const raw = await response.text();
  let body;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
  evidence.httpStatuses.push({ method, path, status: response.status() });
  return { status: response.status(), body };
}

function ok(result, label) {
  assert.equal(result.status, 200, `${label}: HTTP ${result.status} ${JSON.stringify(result.body).slice(0, 300)}`);
  return result.body;
}

async function mobileCurrent(storeId) {
  const path = `/api/mobile/stores/${storeId}/layout/current`;
  const response = await fetch(base + path);
  evidence.httpStatuses.push({ method: "GET (anonymous)", path, status: response.status });
  assert.equal(response.status, 200, `anonymous mobile current HTTP ${response.status}`);
  return response.json();
}

async function versionIds(page, path) {
  const rows = ok(await api(page, "GET", path), "version listing");
  assert.ok(Array.isArray(rows));
  return rows.map((row) => row.layoutId).sort();
}

function trackVersionPosts(page, versionsPath, pageName) {
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === versionsPath) {
      evidence.actualStoreVersionPosts.push({ page: pageName, method: request.method(), url: new URL(request.url()).pathname });
    }
  });
}

async function expectNativeBeforeUnloadStay(page, target) {
  const currentUrl = page.url();
  const dialogPromise = page.waitForEvent("dialog", { timeout: 8_000 });
  await page.evaluate((url) => { window.setTimeout(() => { window.location.href = url; }, 0); }, target);
  const dialog = await dialogPromise;
  const details = { type: dialog.type(), message: dialog.message() };
  assert.equal(dialog.type(), "beforeunload", "dirty navigation opens the browser beforeunload confirmation");
  await dialog.dismiss();
  await page.waitForTimeout(100);
  assert.equal(page.url(), currentUrl, "dismissing beforeunload keeps the editor open");
  return details;
}

async function legacyWorkflow(page, versionsPath, baselineCount) {
  const route = `${base}/admin/editor/?storeId=${store.id}&legacy=1`;
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.locator("#shopName").waitFor();
  await page.waitForFunction((expected) => document.querySelectorAll("#layersList button.layer-item").length === expected, baselineCount);
  assert.equal(await page.locator("#layersList button.layer-item").count(), baselineCount);
  const startDialogs = [];
  const acceptStartupDialog = async (dialog) => { startDialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.accept(); };
  page.on("dialog", acceptStartupDialog);
  trackVersionPosts(page, versionsPath, "legacy");

  await page.locator("#newBtn").click();
  assert.equal(await page.locator("#layersList button.layer-item").count(), 0, "legacy New clears current elements");
  assert.equal(startDialogs.length, 1);
  evidence.legacy.newAction.confirmation = startDialogs[0];
  evidence.legacy.newAction.clearsElements = true;
  await page.keyboard.press("ControlOrMeta+z");
  assert.equal(await page.locator("#layersList button.layer-item").count(), baselineCount, "legacy undo restores cleared elements");
  evidence.legacy.newAction.undoRestoresElements = true;

  const templateDialogStart = startDialogs.length;
  await page.locator("#templates").getByRole("button", { name: /Kleiner Laden/ }).click();
  assert.equal(startDialogs.length, templateDialogStart, "legacy template applies without a confirmation dialog");
  assert.equal(await page.locator("#gridWidth").inputValue(), "15");
  assert.equal(await page.locator("#gridHeight").inputValue(), "20");
  assert.equal(await page.locator("#layersList button.layer-item").count(), 0);
  evidence.legacy.template.confirmationCount = 0;
  evidence.legacy.template.gridSizeAfter = { width: 15, height: 20 };
  evidence.legacy.template.clearsElements = true;
  await page.keyboard.press("ControlOrMeta+z");
  assert.equal(await page.locator("#gridWidth").inputValue(), "20");
  assert.equal(await page.locator("#gridHeight").inputValue(), "20");
  assert.equal(await page.locator("#layersList button.layer-item").count(), baselineCount);
  evidence.legacy.template.undoRestoresGridAndElements = true;
  evidence.legacy.newAction.versionPostCount = evidence.actualStoreVersionPosts.filter((item) => item.page === "legacy").length;
  evidence.legacy.template.versionPostCount = evidence.legacy.newAction.versionPostCount;
  assert.equal(evidence.legacy.newAction.versionPostCount, 0, "legacy New/template only change editor/history state");

  await page.locator("#shopName").fill(`Dirty legacy ${randomUUID().slice(0, 6)}`);
  page.off("dialog", acceptStartupDialog);
  const legacyBeforeUnload = await expectNativeBeforeUnloadStay(page, `${base}/admin/next/stores/`);
  evidence.legacy.beforeUnloadStay = { observed: true, ...legacyBeforeUnload };

  // The historic Store Back link targets Store details. Dismiss the native
  // beforeunload prompt once to prove Stay, then accept it to observe navigation.
  let dismissed = false;
  const backDialogs = [];
  page.on("dialog", async (dialog) => {
    backDialogs.push({ type: dialog.type(), message: dialog.message() });
    if (!dismissed) { dismissed = true; await dialog.dismiss(); }
    else await dialog.accept();
  });
  await page.locator("#backLink").click();
  assert.equal(page.url(), route, "dismissing legacy Back beforeunload stays in editor");
  evidence.legacy.back.stayDialog = backDialogs[0] || null;
  evidence.legacy.back.stayedOnEditor = true;
  evidence.legacy.back.sourceHref = await page.locator("#backLink").getAttribute("href");
  assert.equal(new URL(evidence.legacy.back.sourceHref, base).pathname, "/admin/stores/detail/");
  await page.locator("#backLink").click();
  await page.waitForURL(`**/admin/next/stores/detail/?storeId=${store.id}`, { timeout: 10_000 });
  evidence.legacy.back.navigationUrl = new URL(page.url()).pathname + new URL(page.url()).search;
  evidence.legacy.back.destination = "Store-Detail (nach Cutover-Redirect)";
  assert.equal(new URL(page.url()).pathname, "/admin/next/stores/detail/");
}

async function candidateWorkflow(page, versionsPath, baselineCount) {
  const route = `${base}/admin/next/editor/?storeId=${store.id}`;
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Layout Editor" }).waitFor();
  await page.waitForFunction((expected) => document.querySelectorAll(".le-layers button").length === expected, baselineCount);
  assert.equal(await page.locator(".le-layers button").count(), baselineCount);
  evidence.candidate.initialLoaded = true;
  const dialogs = [];
  const acceptStartupDialog = async (dialog) => { dialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.accept(); };
  page.on("dialog", acceptStartupDialog);
  trackVersionPosts(page, versionsPath, "candidate");

  await page.getByRole("button", { name: "Neues Layout" }).click();
  assert.equal(await page.locator(".le-layers button").count(), 0, "candidate New clears current elements");
  assert.equal(dialogs.length, 1);
  evidence.candidate.newAction.confirmation = dialogs[0];
  evidence.candidate.newAction.clearsElements = true;
  await page.getByRole("button", { name: "Rückgängig" }).click();
  assert.equal(await page.locator(".le-layers button").count(), baselineCount, "candidate undo restores cleared elements");
  evidence.candidate.newAction.undoRestoresElements = true;

  await page.getByRole("button", { name: /Kleiner Laden/ }).click();
  assert.equal(dialogs.length, 2, "candidate template confirms before replacing elements");
  assert.equal(await page.locator(".le-layers button").count(), 0);
  const gridSizeAfter = {
    width: Number(await page.locator(".le-number-grid input").first().inputValue()),
    height: Number(await page.locator(".le-number-grid input").nth(1).inputValue()),
  };
  assert.deepEqual(gridSizeAfter, { width: 15, height: 20 });
  evidence.candidate.template.confirmation = dialogs[1];
  evidence.candidate.template.gridSizeAfter = gridSizeAfter;
  evidence.candidate.template.clearsElements = true;
  await page.getByRole("button", { name: "Rückgängig" }).click();
  assert.equal(await page.locator(".le-layers button").count(), baselineCount);
  const restoredGrid = {
    width: Number(await page.locator(".le-number-grid input").first().inputValue()),
    height: Number(await page.locator(".le-number-grid input").nth(1).inputValue()),
  };
  assert.deepEqual(restoredGrid, { width: 20, height: 20 });
  evidence.candidate.template.undoRestoresGridAndElements = true;
  evidence.candidate.newAction.versionPostCount = evidence.actualStoreVersionPosts.filter((item) => item.page === "candidate").length;
  evidence.candidate.template.versionPostCount = evidence.candidate.newAction.versionPostCount;
  assert.equal(evidence.candidate.newAction.versionPostCount, 0, "candidate New/template only change local draft state");

  await page.getByRole("textbox", { name: "Filialname" }).fill(`Dirty candidate ${randomUUID().slice(0, 6)}`);
  page.off("dialog", acceptStartupDialog);

  const stayDialogPromise = new Promise((resolve) => page.once("dialog", async (dialog) => {
    const details = { type: dialog.type(), message: dialog.message() };
    await dialog.dismiss();
    resolve(details);
  }));
  evidence.candidate.back.sourceHref = null; // Button navigation has no href.
  await page.getByRole("button", { name: "Zurück" }).click();
  const stayDialog = await stayDialogPromise;
  assert.equal(stayDialog.type, "confirm", "candidate Back uses its explicit dirty-change confirmation");
  assert.match(page.url(), /\/admin\/next\/editor\//, "candidate Back Stay leaves editor route open");
  evidence.candidate.back.stayDialog = stayDialog;
  evidence.candidate.back.stayedOnEditor = true;

  const backDialogs = [];
  page.on("dialog", async (dialog) => { backDialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.accept(); });
  await page.getByRole("button", { name: "Zurück" }).click();
  await page.waitForURL(`**/admin/next/stores/detail/?storeId=${store.id}`, { timeout: 10_000 });
  evidence.candidate.back.navigationUrl = new URL(page.url()).pathname + new URL(page.url()).search;
  evidence.candidate.back.destination = "Store-Detail";
  assert.equal(new URL(page.url()).pathname, "/admin/next/stores/detail/");

  // A fresh editor page isolates the native browser prompt from the explicit
  // Back confirmation above, so the two Stay paths are observed separately.
  const nativePage = await login();
  await nativePage.goto(route, { waitUntil: "domcontentloaded" });
  await nativePage.getByRole("textbox", { name: "Filialname" }).fill(`Dirty unload ${randomUUID().slice(0, 6)}`);
  const candidateBeforeUnload = await expectNativeBeforeUnloadStay(nativePage, `${base}/admin/next/stores/`);
  evidence.candidate.beforeUnloadStay = { observed: true, ...candidateBeforeUnload };
  await nativePage.close({ runBeforeUnload: false }).catch(() => {});
}

try {
  admin = await login();
  assert.equal(ok(await api(admin, "GET", "/api/admin/me"), "admin identity").role, "admin");
  const stamp = randomUUID().slice(0, 8).toUpperCase();
  region = ok(await api(admin, "POST", "/api/regions", { code: `TN-${stamp}`, name: `Template Navigation ${stamp}` }), "create fixture Region");
  store = ok(await api(admin, "POST", "/api/stores", {
    regionId: region.id, storeCode: `TN-${stamp}`, name: `Template Navigation ${stamp}`,
    street: "Testgasse 1", zipCode: "4020", city: "Linz", country: "AT",
  }), "create fixture Store");
  evidence.fixtureIds = { regionId: region.id, storeId: store.id };
  const versionsPath = `/api/stores/${store.id}/layout/versions`;
  const initialLayout = {
    shopName: store.name,
    gridSize: { width: 20, height: 20 },
    elements: [
      { id: 1, type: "entrance", x: 1, y: 0, width: 3, height: 1, label: "Eingang" },
      { id: 2, type: "shelf", x: 6, y: 6, width: 4, height: 2, label: "Fixture-Regal", category: "310/1", meter: 1 },
    ],
  };
  const initial = ok(await api(admin, "POST", versionsPath, { layoutName: store.name, activate: true, layout: initialLayout }), "create active fixture version");
  const beforeMobile = await mobileCurrent(store.id);
  assert.equal(beforeMobile.layoutId, initial.layoutId);
  const beforeVersions = await versionIds(admin, versionsPath);
  assert.deepEqual(beforeVersions, [initial.layoutId]);

  const legacy = await login();
  await legacy.goto(`${base}/admin/editor/?storeId=${store.id}&legacy=1`, { waitUntil: "domcontentloaded" });
  await legacy.locator("#shopName").waitFor();
  await legacy.waitForFunction(() => document.querySelectorAll("#layersList button.layer-item").length === 2);
  assert.equal(await legacy.locator("#layersList button.layer-item").count(), 2);
  evidence.legacy.initialLoaded = true;
  await legacy.close();

  const legacyPage = await login();
  await legacyWorkflow(legacyPage, versionsPath, 2);
  const candidatePage = await login();
  await candidateWorkflow(candidatePage, versionsPath, 2);

  evidence.observedDifferences = {
    newAction: "Beide zeigen eine Bestätigung; beide entfernen Elemente lokal, Undo stellt sie wieder her.",
    template: "Legacy wendet Kleiner Laden ohne Bestätigungsdialog an; Candidate bestätigt vor dem Ersetzen. Beide setzen 15×20, leeren Elemente und stellen Raster plus Elemente mit Undo wieder her.",
    persistence: "Beide UIs erzeugten bei New, Template und Undo null Store-Version-POSTs; der aktive Versionssatz blieb unverändert.",
    backTarget: `Legacy ${evidence.legacy.back.navigationUrl}; Candidate ${evidence.candidate.back.navigationUrl}. Both reach Store detail after the candidate fix.`,
    unsavedNavigation: "Legacy Stay ist der native beforeunload-Dialog; Candidate Back zuerst ein eigener Confirm-Dialog. In beiden Fällen ließ Stay den Editor geöffnet.",
  };
  const afterMobile = await mobileCurrent(store.id);
  assert.deepEqual(afterMobile, beforeMobile, "anonymous Mobile Current is unchanged after both editors");
  evidence.anonymousMobileUnchanged = true;
  const afterVersions = await versionIds(admin, versionsPath);
  assert.deepEqual(afterVersions, beforeVersions, "UI New/template/undo did not create or activate Store versions");
  evidence.versionIdsUnchanged = true;
  assert.equal(evidence.actualStoreVersionPosts.length, 0, "no editor action emitted a Store-version POST");

  await legacyPage.close().catch(() => {});
  await candidatePage.close().catch(() => {});
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = error instanceof Error ? error.message : String(error);
} finally {
  if (admin && store) {
    try {
      const result = await api(admin, "PATCH", `/api/stores/${store.id}/archive`, {});
      evidence.cleanup.store = { id: store.id, http: result.status };
      if (result.status !== 200) {
        evidence.result = "FAIL";
        evidence.cleanupError ||= `archive Store HTTP ${result.status}`;
      }
    } catch (error) {
      evidence.result = "FAIL";
      evidence.cleanupError ||= error instanceof Error ? error.message : String(error);
    }
  }
  if (admin && region) {
    try {
      const result = await api(admin, "PATCH", `/api/regions/${region.id}/archive`, {});
      evidence.cleanup.region = { id: region.id, http: result.status };
      if (result.status !== 200) {
        evidence.result = "FAIL";
        evidence.cleanupError ||= `archive Region HTTP ${result.status}`;
      }
    } catch (error) {
      evidence.result = "FAIL";
      evidence.cleanupError ||= error instanceof Error ? error.message : String(error);
    }
  }
  if (admin) await admin.close().catch(() => {});
  await browser.close().catch(() => {});
  const requiredChecks = [
    evidence.legacy.initialLoaded,
    evidence.legacy.newAction.clearsElements,
    evidence.legacy.newAction.undoRestoresElements,
    evidence.legacy.template.clearsElements,
    evidence.legacy.template.undoRestoresGridAndElements,
    evidence.legacy.back.stayedOnEditor,
    evidence.legacy.back.navigationUrl,
    evidence.legacy.beforeUnloadStay.observed,
    evidence.candidate.initialLoaded,
    evidence.candidate.newAction.clearsElements,
    evidence.candidate.newAction.undoRestoresElements,
    evidence.candidate.template.clearsElements,
    evidence.candidate.template.undoRestoresGridAndElements,
    evidence.candidate.back.stayedOnEditor,
    evidence.candidate.back.navigationUrl,
    evidence.candidate.beforeUnloadStay.observed,
    evidence.anonymousMobileUnchanged,
    evidence.versionIdsUnchanged,
  ];
  if (requiredChecks.some((passed) => !passed)) evidence.result = "FAIL";
  console.log(JSON.stringify(evidence));
  if (evidence.result !== "PASS") process.exitCode = 1;
}
