import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Compare the legacy global editor's side effects with the candidate global
// editor without persisting any global layout mutation. Global POSTs are
// intercepted in the browser and receive a plausible successful API response.
const base = process.env.ADMIN_SMOKE_BASE_URL || "http://localhost:8080";
assert.ok(["localhost", "127.0.0.1", "host.docker.internal"].includes(new URL(base).hostname), "probe only permits local hosts");
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8"));
const [adminUser] = realm.users;
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP localhost 127.0.0.1,MAP host.docker.internal 127.0.0.1"] : [] });
const evidence = {
  result: "PASS",
  scope: "local packaged stack only; legacy and candidate global editor UI; global POSTs intercepted before backend",
  interpretation: "PASS verifies UI request semantics with successful response stubs; it does not verify backend persistence for intercepted POSTs",
  evidenceClassification: {
    observed: ["real UI clicks and download/popup events", "intercepted POST method, URL, and payload", "authenticated and anonymous current plus history readbacks"],
    inferred: ["successful stub response is sufficient for the legacy handler to continue after its awaited save"],
  },
  initial: { authenticated: null, anonymous: null, unchanged: null },
  legacy: {
    preview: { posts: [], popupUrl: null, localStorageBefore: null, localStorageAfter: null, localStorageRestored: false },
    saveDraft: { posts: [], statusText: null },
    export: { posts: [], filename: null, document: null },
  },
  candidate: {
    separatePreviewAction: false,
    canvasLoaded: false,
    export: { posts: [], popupCount: 0, filename: null, document: null },
    localStorageBefore: null,
    localStorageAfter: null,
  },
  interceptedPosts: [],
  readbacks: [],
  cleanup: { browserContextsClosed: false, persistentGlobalUnchanged: false },
  limits: ["No global POST reached the backend; publication persistence is not tested."],
};

async function login() {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(`${base}/admin/next/`, { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill(adminUser.username);
  await page.locator("#password").fill(adminUser.credentials.find((item) => item.type === "password").value);
  await page.locator("#kc-login").click();
  await page.waitForURL("**/admin/next/**", { timeout: 15_000 });
  return { context, page };
}

async function readCurrent(page, label) {
  const authenticated = await page.context().request.get(`${base}/api/layout/current`);
  assert.equal(authenticated.status(), 200, `${label}: authenticated GET /api/layout/current`);
  const authenticatedBody = await authenticated.json();
  const anonymous = await fetch(`${base}/api/layout/current`);
  assert.equal(anonymous.status, 200, `${label}: anonymous GET /api/layout/current`);
  const anonymousBody = await anonymous.json();
  const historyResponse = await page.context().request.get(`${base}/api/layout/history?limit=100`);
  assert.equal(historyResponse.status(), 200, `${label}: authenticated GET /api/layout/history`);
  const historyBody = await historyResponse.json();
  assert.ok(Array.isArray(historyBody), `${label}: layout history is an array`);
  const historyIds = historyBody.map((item) => item.layoutId);
  evidence.readbacks.push({ label, authenticatedStatus: authenticated.status(), anonymousStatus: anonymous.status, historyStatus: historyResponse.status() });
  return { authenticated: authenticatedBody, anonymous: anonymousBody, historyIds };
}

function equalReadbacks(actual, expected, label) {
  assert.deepEqual(actual.authenticated, expected.authenticated, `${label}: authenticated current remains exact`);
  assert.deepEqual(actual.anonymous, expected.anonymous, `${label}: anonymous current remains exact`);
  assert.deepEqual(actual.authenticated, actual.anonymous, `${label}: authenticated and anonymous current agree`);
  assert.deepEqual(actual.historyIds, expected.historyIds, `${label}: global history versions remain unchanged`);
}

async function installGlobalPostStub(context, action, target) {
  await context.route(`${base}/api/layout/current`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    let payload;
    try { payload = route.request().postDataJSON(); } catch { payload = route.request().postData(); }
    const post = { action, method: "POST", url: route.request().url(), payload, disposition: "intercepted; backend not reached" };
    evidence.interceptedPosts.push(post);
    target.push(post);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "Layout saved successfully (probe stub)", layoutId: "probe-intercepted", savedAt: "2026-10-16T00:00:00Z" }),
    });
  });
}

async function downloadJson(page, button) {
  const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
  await button.click();
  const download = await downloadPromise;
  const path = await download.path();
  assert.ok(path, "browser produced a downloaded file");
  return { filename: download.suggestedFilename(), document: JSON.parse(readFileSync(path, "utf8")) };
}

let contextRefs = [];
let baseline = null;
try {
  const legacySession = await login();
  contextRefs.push(legacySession.context);
  const legacy = legacySession.page;
  await installGlobalPostStub(legacySession.context, "legacy #launchBtn", evidence.legacy.preview.posts);
  assert.equal((await (await legacySession.context.request.get(`${base}/api/admin/me`)).json()).role, "admin");
  baseline = await readCurrent(legacy, "before actions");
  evidence.initial.authenticated = baseline.authenticated;
  evidence.initial.anonymous = baseline.anonymous;
  evidence.initial.unchanged = true;

  await legacy.goto(`${base}/admin/editor/`, { waitUntil: "domcontentloaded" });
  await legacy.locator("#launchBtn").waitFor();
  const initialStorage = await legacy.evaluate(() => localStorage.getItem("indooro_live_layout"));
  evidence.legacy.preview.localStorageBefore = initialStorage;
  const popupPromise = legacy.waitForEvent("popup", { timeout: 8_000 }).catch(() => null);
  await legacy.locator("#launchBtn").click();
  const popup = await popupPromise;
  assert.equal(evidence.legacy.preview.posts.length, 1, "legacy Launch makes one global POST request");
  assert.deepEqual(evidence.legacy.preview.posts[0].payload, await legacy.evaluate(() => JSON.parse(localStorage.getItem("indooro_live_layout"))), "Launch POST matches localStorage layout");
  assert.ok(popup, "legacy Launch opens the customer popup after its stubbed save succeeds");
  await popup.waitForLoadState("domcontentloaded").catch(() => {});
  evidence.legacy.preview.popupUrl = popup.url();
  assert.equal(new URL(evidence.legacy.preview.popupUrl).pathname, "/customer/", "legacy Launch opens the customer route");
  evidence.legacy.preview.localStorageAfter = await legacy.evaluate(() => localStorage.getItem("indooro_live_layout"));
  await popup.close().catch(() => {});
  await legacy.evaluate((value) => value == null ? localStorage.removeItem("indooro_live_layout") : localStorage.setItem("indooro_live_layout", value), initialStorage);
  evidence.legacy.preview.localStorageRestored = (await legacy.evaluate(() => localStorage.getItem("indooro_live_layout"))) === initialStorage;
  assert.equal(evidence.legacy.preview.localStorageRestored, true, "temporary localStorage side effect is restored exactly");
  equalReadbacks(await readCurrent(legacy, "after legacy preview"), baseline, "legacy preview");

  await legacy.locator("#shopName").fill("Global Draft Side Effect Probe");
  await installGlobalPostStub(legacySession.context, "legacy #saveDraftBtn", evidence.legacy.saveDraft.posts);
  await legacy.locator("#saveDraftBtn").click();
  await legacy.locator("#saveStatus").getByText(/Layout am Server gespeichert/i).waitFor({ timeout: 8_000 });
  evidence.legacy.saveDraft.statusText = await legacy.locator("#saveStatus").textContent();
  assert.equal(evidence.legacy.saveDraft.posts.length, 1, "legacy Save Draft makes one global POST request");
  assert.equal(evidence.legacy.saveDraft.posts[0].payload.shopName, "Global Draft Side Effect Probe");
  equalReadbacks(await readCurrent(legacy, "after legacy Save Draft"), baseline, "legacy Save Draft");

  await legacy.locator("#shopName").fill("Global Export Side Effect Probe");
  await installGlobalPostStub(legacySession.context, "legacy #exportBtn", evidence.legacy.export.posts);
  const legacyDownload = await downloadJson(legacy, legacy.locator("#exportBtn"));
  evidence.legacy.export.filename = legacyDownload.filename;
  evidence.legacy.export.document = legacyDownload.document;
  await legacy.locator("#saveStatus").getByText(/Layout am Server gespeichert/i).waitFor({ timeout: 8_000 });
  assert.equal(evidence.legacy.export.posts.length, 1, "legacy Export makes one global POST request");
  assert.deepEqual(evidence.legacy.export.posts[0].payload, legacyDownload.document, "legacy Export POST payload matches downloaded JSON");
  equalReadbacks(await readCurrent(legacy, "after legacy Export"), baseline, "legacy Export");
  await legacySession.context.close();

  const candidateSession = await login();
  contextRefs.push(candidateSession.context);
  const candidate = candidateSession.page;
  evidence.candidate.export.posts = [];
  await installGlobalPostStub(candidateSession.context, "candidate global publish (unexpected during export)", evidence.candidate.export.posts);
  await candidate.goto(`${base}/admin/next/editor/`, { waitUntil: "domcontentloaded" });
  await candidate.getByRole("heading", { name: "Globales Layout", exact: true }).waitFor();
  evidence.candidate.canvasLoaded = true;
  evidence.candidate.localStorageBefore = await candidate.evaluate(() => localStorage.getItem("indooro_live_layout"));
  evidence.candidate.separatePreviewAction = await candidate.getByRole("button", { name: /Vorschau|Preview/i }).count() > 0;
  assert.equal(evidence.candidate.separatePreviewAction, false, "candidate global editor has no separate Preview button");
  candidate.on("popup", () => { evidence.candidate.export.popupCount += 1; });
  const candidateDownload = await downloadJson(candidate, candidate.getByRole("button", { name: "JSON exportieren" }));
  evidence.candidate.export.filename = candidateDownload.filename;
  evidence.candidate.export.document = candidateDownload.document;
  evidence.candidate.export.posts = evidence.candidate.export.posts.slice();
  evidence.candidate.localStorageAfter = await candidate.evaluate(() => localStorage.getItem("indooro_live_layout"));
  assert.deepEqual(evidence.candidate.export.posts, [], "candidate JSON export sends no global POST");
  assert.equal(evidence.candidate.export.popupCount, 0, "candidate export opens no popup");
  assert.equal(evidence.candidate.localStorageAfter, evidence.candidate.localStorageBefore, "candidate export leaves localStorage unchanged");
  equalReadbacks(await readCurrent(candidate, "after candidate export"), baseline, "candidate export");
  await candidateSession.context.close();

  evidence.cleanup.persistentGlobalUnchanged = true;
  evidence.cleanup.browserContextsClosed = true;
  evidence.initial.unchanged = true;
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = error instanceof Error ? error.message : String(error);
} finally {
  for (const context of contextRefs) await context.close().catch(() => {});
  if (baseline) {
    try {
      const verifySession = await login();
      const final = await readCurrent(verifySession.page, "post-cleanup verification");
      equalReadbacks(final, baseline, "post-cleanup current readback");
      evidence.cleanup.persistentGlobalUnchanged = true;
      evidence.cleanup.browserContextsClosed = true;
      await verifySession.context.close();
    } catch (error) {
      evidence.result = "FAIL";
      evidence.cleanup.persistentGlobalUnchanged = false;
      evidence.cleanup.error = error instanceof Error ? error.message : String(error);
    }
  }
  await browser.close().catch(() => {});
  if (!evidence.cleanup.persistentGlobalUnchanged || !evidence.cleanup.browserContextsClosed) evidence.result = "FAIL";
  console.log(JSON.stringify(evidence));
  if (evidence.result !== "PASS") process.exitCode = 1;
}
