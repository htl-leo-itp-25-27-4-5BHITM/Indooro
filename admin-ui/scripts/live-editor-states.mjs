import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Disposable local Store only. This probe never writes the global layout.
const base = process.env.ADMIN_SMOKE_BASE_URL || "http://localhost:8080";
assert.ok(["localhost", "127.0.0.1", "host.docker.internal"].includes(new URL(base).hostname), "editor state probe only permits local hosts");
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8").replace(/\$\{(\w+)\}/g, (match, name) => process.env[name] ?? match));
const [adminUser] = realm.users;
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP localhost 127.0.0.1,MAP host.docker.internal 127.0.0.1"] : [] });
let admin = null;
let region = null;
let store = null;
const evidence = {
  result: "PASS",
  scope: "local packaged stack only; disposable Region/Store; candidate and legacy browser/API state checks",
  fixtureIds: {},
  httpStatuses: [],
  noActiveLayout: { candidateFallback: false, legacyFallback: false, noUnexpectedPosts: false, versionsUnchanged: false, publicFallbackUnchanged: false },
  candidateDirectRefresh: false,
  firstDraft: { saved: false, status: null, privateFromMobile: false },
  editorContext503KeyboardRetry: false,
  versionHistory503KeyboardRetry: false,
  unsavedInputSurvivesHistoryRetry: false,
  backendStateUnchangedByRetries: false,
  storeCleanup: { http: null, id: null },
  regionCleanup: { http: null, id: null },
  remainingGates: [
    "The legacy editor is checked for no-active fallback before any draft is created; its post-save workflow is not compared.",
    "The editor-context retry occurs before the editor can accept input, so unsaved input preservation is checked across the version-history retry only.",
    "No physical iOS/Android rendering or navigation is exercised.",
  ],
};

async function login(user) {
  const page = await browser.newPage();
  await page.goto(`${base}/admin/next/`, { waitUntil: "domcontentloaded" });
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
  evidence.httpStatuses.push({ method, path, status: response.status() });
  return { status: response.status(), body };
}

function ok(result, label) {
  assert.equal(result.status, 200, `${label}: HTTP ${result.status} ${JSON.stringify(result.body).slice(0, 250)}`);
  return result.body;
}

async function anonymousCurrent(storeId) {
  const path = `/api/mobile/stores/${storeId}/layout/current`;
  const response = await fetch(`${base}${path}`);
  evidence.httpStatuses.push({ method: "GET", path, status: response.status });
  assert.equal(response.status, 200, `anonymous mobile current-layout: HTTP ${response.status}`);
  return response.json();
}

async function versionSnapshot(page, path) {
  const rows = ok(await api(page, "GET", path), "Store version listing");
  assert.ok(Array.isArray(rows), "Store version listing must be an array");
  return rows.map((item) => item.layoutId).sort();
}

const posts = [];
try {
  admin = await login(adminUser);
  assert.equal(ok(await api(admin, "GET", "/api/admin/me"), "admin identity").role, "admin");
  const stamp = randomUUID().slice(0, 8).toUpperCase();
  region = ok(await api(admin, "POST", "/api/regions", { code: `ES-${stamp}`, name: `Editor States ${stamp}` }), "create disposable Region");
  store = ok(await api(admin, "POST", "/api/stores", {
    regionId: region.id, storeCode: `ES-${stamp}`, name: `Editor States ${stamp}`,
    street: "Testgasse 1", zipCode: "4020", city: "Linz", country: "AT",
  }), "create disposable Store");
  evidence.fixtureIds = { regionId: region.id, regionCode: region.code, storeId: store.id, storeCode: store.storeCode };
  evidence.storeCleanup.id = store.id;
  evidence.regionCleanup.id = region.id;
  const versionsPath = `/api/stores/${store.id}/layout/versions`;
  const contextPath = `/api/stores/${store.id}/layout/editor-context`;
  const publicBefore = await anonymousCurrent(store.id);
  assert.equal(publicBefore.layoutId, null);
  assert.equal(publicBefore.source, "DEFAULT");
  assert.equal(publicBefore.fallback, true);
  const contextBefore = ok(await api(admin, "GET", contextPath), "no-active editor context");
  assert.equal(contextBefore.currentLayout.status, "DEFAULT");
  const defaultName = contextBefore.currentLayout.layout.shopName;
  const versionsBefore = await versionSnapshot(admin, versionsPath);
  assert.deepEqual(versionsBefore, []);
  const storePosts = (request) => {
    if (request.method() === "POST" && request.url().includes(versionsPath)) posts.push({ method: request.method(), url: request.url() });
  };
  admin.on("request", storePosts);

  await admin.goto(`${base}/admin/next/editor/?storeId=${store.id}`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("heading", { name: "Layout Editor" }).waitFor();
  assert.match(await admin.getByRole("textbox", { name: "Filialname" }).inputValue(), new RegExp(defaultName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(await admin.locator(".editor-route-header").innerText(), /Vorlage/);
  evidence.noActiveLayout.candidateFallback = true;
  await admin.reload({ waitUntil: "domcontentloaded" });
  await admin.getByRole("heading", { name: "Layout Editor" }).waitFor();
  assert.equal(await admin.getByRole("textbox", { name: "Filialname" }).inputValue(), defaultName);
  evidence.candidateDirectRefresh = true;

  await admin.goto(`${base}/admin/editor/?storeId=${store.id}`, { waitUntil: "domcontentloaded" });
  await admin.locator("#storeContextBox").waitFor();
  await admin.locator("#shopName").waitFor();
  assert.equal(await admin.locator("#shopName").inputValue(), defaultName);
  assert.match(await admin.locator("#storeContextBox").innerText(), new RegExp(store.storeCode));
  evidence.noActiveLayout.legacyFallback = true;
  const legacyVersions = await versionSnapshot(admin, versionsPath);
  const publicAfterLegacy = await anonymousCurrent(store.id);
  assert.deepEqual(legacyVersions, []);
  assert.equal(publicAfterLegacy.layoutId, null);
  assert.deepEqual(posts, [], "loading candidate and legacy no-active editors must not save a version");
  evidence.noActiveLayout.noUnexpectedPosts = true;
  evidence.noActiveLayout.versionsUnchanged = true;
  evidence.noActiveLayout.publicFallbackUnchanged = true;

  // First save is explicitly a draft. Confirm the real backend row and anonymous fallback.
  await admin.goto(`${base}/admin/next/editor/?storeId=${store.id}`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("heading", { name: "Layout Editor" }).waitFor();
  const firstDraftName = `Private first draft ${stamp}`;
  await admin.getByRole("textbox", { name: "Filialname" }).fill(firstDraftName);
  await admin.getByRole("button", { name: "Entwurf speichern" }).click();
  await admin.getByText("Entwurf gespeichert.").waitFor();
  const draftId = new URL(admin.url()).searchParams.get("layoutId");
  assert.ok(draftId, "first draft URL contains a version ID");
  const draft = ok(await api(admin, "GET", `${versionsPath}/${draftId}`), "first draft backend readback");
  assert.equal(draft.status, "DRAFT");
  assert.equal(draft.layout.shopName, firstDraftName);
  evidence.firstDraft.saved = true;
  evidence.firstDraft.status = draft.status;
  const publicAfterDraft = await anonymousCurrent(store.id);
  assert.equal(publicAfterDraft.layoutId, null);
  assert.equal(publicAfterDraft.source, "DEFAULT");
  assert.equal(publicAfterDraft.fallback, true);
  assert.equal(publicAfterDraft.layout.shopName, defaultName);
  evidence.firstDraft.privateFromMobile = true;

  // Reopen by URL and reload to prove a saved private first draft remains addressable.
  const draftUrl = `${base}/admin/next/editor/?storeId=${store.id}&layoutId=${draftId}`;
  await admin.goto(draftUrl, { waitUntil: "domcontentloaded" });
  await admin.getByRole("textbox", { name: "Filialname" }).waitFor();
  await admin.reload({ waitUntil: "domcontentloaded" });
  await admin.getByRole("textbox", { name: "Filialname" }).waitFor();
  assert.equal(await admin.getByRole("textbox", { name: "Filialname" }).inputValue(), firstDraftName);

  // A single browser-only 503 exercises editor-context recovery with keyboard activation.
  const contextFault = (route) => {
    if (route.request().method() === "GET") {
      evidence.httpStatuses.push({ method: "GET (route injected)", path: contextPath, status: 503 });
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Injected editor-context probe failure" }) });
    }
    return route.continue();
  };
  await admin.route(`**${contextPath}`, contextFault, { times: 1 });
  await admin.goto(`${base}/admin/next/editor/?storeId=${store.id}`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("heading", { name: "Editor konnte nicht geladen werden" }).waitFor();
  await admin.getByRole("button", { name: "Erneut versuchen" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("heading", { name: "Layout Editor" }).waitFor();
  assert.equal(await admin.getByRole("textbox", { name: "Filialname" }).inputValue(), firstDraftName);
  evidence.editorContext503KeyboardRetry = true;

  // Inject one history-list failure. Retry via Enter while a local unsaved name is present.
  let failHistoryOnce = true;
  const historyFault = (route) => {
    if (route.request().method() === "GET" && failHistoryOnce) {
      failHistoryOnce = false;
      evidence.httpStatuses.push({ method: "GET (route injected)", path: versionsPath, status: 503 });
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Injected version-history probe failure" }) });
    }
    return route.continue();
  };
  await admin.route(`**${versionsPath}`, historyFault);
  await admin.reload({ waitUntil: "domcontentloaded" });
  await admin.getByRole("heading", { name: "Layout Editor" }).waitFor();
  await admin.getByRole("alert").getByText(/Versionsliste nicht verfügbar/).waitFor();
  const unsavedName = `Unsaved survives retry ${stamp}`;
  await admin.getByRole("textbox", { name: "Filialname" }).fill(unsavedName);
  const backendBeforeRetry = await versionSnapshot(admin, versionsPath);
  const publicBeforeRetry = await anonymousCurrent(store.id);
  await admin.getByRole("button", { name: "Versionen erneut laden" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByText(/Versionen erneut laden/).waitFor({ state: "detached" });
  assert.equal(await admin.getByRole("textbox", { name: "Filialname" }).inputValue(), unsavedName);
  assert.equal(failHistoryOnce, false);
  evidence.versionHistory503KeyboardRetry = true;
  evidence.unsavedInputSurvivesHistoryRetry = true;
  await admin.unroute(`**${versionsPath}`, historyFault);
  const backendAfterRetry = await versionSnapshot(admin, versionsPath);
  const publicAfterRetry = await anonymousCurrent(store.id);
  assert.deepEqual(backendAfterRetry, backendBeforeRetry);
  assert.deepEqual(publicAfterRetry, publicBeforeRetry);
  assert.deepEqual(posts, [{ method: "POST", url: `${base}${versionsPath}` }], "only the explicit first-draft save may POST");
  evidence.backendStateUnchangedByRetries = true;
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = error instanceof Error ? error.message : String(error);
} finally {
  if (admin && store) {
    try {
      const result = await api(admin, "PATCH", `/api/stores/${store.id}/archive`, {});
      evidence.storeCleanup.http = result.status;
      if (result.status !== 200) { evidence.result = "FAIL"; evidence.cleanupError = `Store ${store.id} archive HTTP ${result.status}`; }
    } catch (error) { evidence.result = "FAIL"; evidence.cleanupError = error instanceof Error ? error.message : String(error); }
  }
  if (admin && region) {
    try {
      const result = await api(admin, "PATCH", `/api/regions/${region.id}/archive`, {});
      evidence.regionCleanup.http = result.status;
      if (result.status !== 200) { evidence.result = "FAIL"; evidence.cleanupError ||= `Region ${region.id} archive HTTP ${result.status}`; }
    } catch (error) { evidence.result = "FAIL"; evidence.cleanupError ||= error instanceof Error ? error.message : String(error); }
  }
  if (admin) await admin.close().catch(() => {});
  await browser.close().catch(() => {});
  console.log(JSON.stringify(evidence));
  if (evidence.result !== "PASS") process.exitCode = 1;
}
