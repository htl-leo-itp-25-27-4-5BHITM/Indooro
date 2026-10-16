import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

// Screenshot evidence for both editor generations. All created data is disposable
// and scoped to a Store. This script never writes /api/layout/current.
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const evidenceDir = resolve(repoRoot, "docs/admin-rebuild/evidence/editor");
const base = process.env.ADMIN_SMOKE_BASE_URL || "http://localhost:8080";
assert.ok(["localhost", "127.0.0.1", "host.docker.internal"].includes(new URL(base).hostname), "editor evidence only permits the local packaged stack");

const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8"));
const [adminUser, regionUser, storeUser] = realm.users;
assert.ok(adminUser && regionUser && storeUser, "realm must provide admin, region-manager, and store-manager fixtures");
const browser = await chromium.launch({
  args: process.env.ADMIN_SMOKE_HOST_ALIAS
    ? ["--host-resolver-rules=MAP localhost 127.0.0.1,MAP host.docker.internal 127.0.0.1"]
    : [],
});

const stamp = randomUUID().slice(0, 8).toUpperCase();
const evidence = {
  result: "PASS",
  baseUrl: base,
  generatedAt: new Date().toISOString(),
  outputDirectory: evidenceDir,
  fixtureIds: {},
  screenshots: [],
  cleanup: {},
  globalWrites: 0,
  notes: [
    "Publication-confirmation screenshots use a page-level window.confirm shim that renders the exact prompt as a visible overlay and returns false; no publication is confirmed.",
    "Candidate global mode uses the new /admin/next shell around the shared LegacyEditorRoute. The legacy global mode is /admin/editor/.",
    "A private Store draft is disposable fixture data. Stores and their Region are archived in finally.",
  ],
  remainingGates: [
    "No real iOS/Android device rendering or navigation is captured.",
    "Global publication confirmation is represented by a screenshot shim; the browser-native confirmation UI is not part of page screenshots.",
  ],
};

let admin = null;
let regionManager = null;
let storeManager = null;
let scopedStore = null;
let foreignRegion = null;
let foreignStore = null;

async function login(user, startPath = "/admin/next/") {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${base}${startPath}`, { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill(user.username);
  await page.locator("#password").fill(user.credentials.find((item) => item.type === "password").value);
  await page.locator("#kc-login").click();
  await page.waitForURL((url) => url.pathname.startsWith("/admin/"), { timeout: 15_000 });
  return page;
}

async function api(page, method, path, data) {
  const response = await page.context().request.fetch(base + path, { method, data, failOnStatusCode: false });
  const raw = await response.text();
  let body;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
  return { status: response.status(), body };
}

function ok(result, label) {
  assert.equal(result.status, 200, `${label}: HTTP ${result.status} ${JSON.stringify(result.body).slice(0, 300)}`);
  return result.body;
}

async function capture(page, name, state, details = {}) {
  const file = `${name}.png`;
  const path = resolve(evidenceDir, file);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  evidence.screenshots.push({ name, file, state, url: page.url(), ...details });
}

async function waitCandidateStore(page) {
  await page.getByRole("heading", { name: "Layout Editor" }).waitFor({ timeout: 15_000 });
  await page.getByRole("textbox", { name: "Filialname" }).waitFor();
}

async function waitLegacyStore(page) {
  await page.locator("#storeContextBox").waitFor({ timeout: 15_000 });
  await page.locator("#shopName").waitFor();
}

async function showConfirmationPrompt(page, button, promptPattern) {
  // The UI calls window.confirm before any request. Replace it just for this
  // interaction so the confirmation copy can be reviewed in a page screenshot.
  await page.evaluate(() => {
    window.__evidenceConfirm = window.confirm;
    window.confirm = (message) => {
      const overlay = document.createElement("div");
      overlay.dataset.evidenceConfirmation = "true";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      Object.assign(overlay.style, {
        position: "fixed", inset: "0", zIndex: "2147483647", background: "rgba(0,0,0,.58)",
        display: "grid", placeItems: "center", padding: "24px", font: "16px system-ui, sans-serif",
      });
      const card = document.createElement("div");
      Object.assign(card.style, { maxWidth: "560px", width: "100%", background: "white", color: "#17202a", padding: "28px", borderRadius: "12px", boxShadow: "0 20px 80px #0008" });
      const title = document.createElement("h2");
      title.textContent = "Bestätigung vor Veröffentlichung";
      const copy = document.createElement("p");
      copy.textContent = String(message);
      const note = document.createElement("small");
      note.textContent = "Screenshot-Modus · keine Bestätigung gesendet";
      card.append(title, copy, note);
      overlay.append(card);
      document.body.append(overlay);
      return false;
    };
  });
  await button.click();
  const dialog = page.locator('[data-evidence-confirmation="true"]');
  await dialog.waitFor();
  const text = await dialog.innerText();
  assert.match(text, promptPattern, "confirmation overlay contains the expected prompt");
  return text;
}

const documentFor = (name) => ({
  shopName: name,
  gridSize: { width: 20, height: 20 },
  elements: [
    { id: 1, type: "entrance", x: 2, y: 0, width: 3, height: 1, label: "Eingang" },
    { id: 2, type: "shelf", x: 5, y: 5, width: 3, height: 2, category: "310/1", meter: 1, label: "Evidence-Regal" },
  ],
});

try {
  await mkdir(evidenceDir, { recursive: true });
  admin = await login(adminUser);
  assert.equal(ok(await api(admin, "GET", "/api/admin/me"), "admin identity").role, "admin");
  await admin.context().route("**/api/layout/current", (route) => {
    if (route.request().method() === "POST") {
      evidence.globalWrites += 1;
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });

  // A region-manager's assigned Region gives us a legitimate scoped fixture.
  regionManager = await login(regionUser);
  const regionMe = ok(await api(regionManager, "GET", "/api/admin/me"), "region-manager identity");
  assert.equal(regionMe.role, "region-manager");
  const assignedRegionId = regionMe.scope?.regionId;
  assert.ok(assignedRegionId, "region-manager realm fixture needs an assigned Region");
  await regionManager.close();
  regionManager = null;

  const scopedStoreCode = `EC-${stamp}`;
  scopedStore = ok(await api(admin, "POST", "/api/stores", {
    regionId: assignedRegionId, storeCode: scopedStoreCode, name: `Editor Capture ${stamp}`,
    street: "Testgasse 1", zipCode: "4020", city: "Linz", country: "AT",
  }), "create disposable scoped Store");
  foreignRegion = ok(await api(admin, "POST", "/api/regions", { code: `EF-${stamp}`, name: `Editor Evidence Foreign ${stamp}` }), "create disposable foreign Region");
  foreignStore = ok(await api(admin, "POST", "/api/stores", {
    regionId: foreignRegion.id, storeCode: `EF-${stamp}`, name: `Foreign Evidence ${stamp}`,
    street: "Testgasse 2", zipCode: "4020", city: "Linz", country: "AT",
  }), "create disposable foreign Store");
  evidence.fixtureIds = {
    scopedRegionId: assignedRegionId,
    scopedStoreId: scopedStore.id,
    scopedStoreCode: scopedStore.storeCode,
    foreignRegionId: foreignRegion.id,
    foreignStoreId: foreignStore.id,
    foreignStoreCode: foreignStore.storeCode,
  };

  // Seed one active version so both editors display the same disposable map.
  const versionsPath = `/api/stores/${scopedStore.id}/layout/versions`;
  const initial = ok(await api(admin, "POST", versionsPath, {
    layoutName: `Evidence Initial ${stamp}`, activate: true, layout: documentFor(`Evidence Initial ${stamp}`),
  }), "seed disposable Store layout");
  assert.equal(initial.status, "ACTIVE");
  evidence.fixtureIds.initialLayoutId = initial.layoutId;

  // Candidate Store editor: initial state, local dirty state, saved private
  // draft, then a visible confirmation prompt that is explicitly dismissed.
  const candidateStore = await admin.context().newPage();
  await candidateStore.goto(`${base}/admin/next/editor/?storeId=${scopedStore.id}&layoutId=${initial.layoutId}`, { waitUntil: "domcontentloaded" });
  await waitCandidateStore(candidateStore);
  await capture(candidateStore, "candidate-store-initial", "initial", { storeId: scopedStore.id, layoutId: initial.layoutId });
  const draftName = `Evidence Draft ${stamp}`;
  await candidateStore.getByRole("textbox", { name: "Filialname" }).fill(draftName);
  await capture(candidateStore, "candidate-store-draft", "unsaved-draft", { storeId: scopedStore.id, draftName });
  await candidateStore.getByRole("button", { name: "Entwurf speichern" }).click();
  await candidateStore.getByText("Entwurf gespeichert.").waitFor({ timeout: 15_000 });
  const draftId = new URL(candidateStore.url()).searchParams.get("layoutId");
  assert.ok(draftId, "saved fixture draft should have a URL layoutId");
  const draft = ok(await api(admin, "GET", `${versionsPath}/${draftId}`), "saved fixture draft readback");
  assert.equal(draft.status, "DRAFT");
  evidence.fixtureIds.draftLayoutId = draftId;
  await capture(candidateStore, "candidate-store-saved-draft", "saved-draft", { storeId: scopedStore.id, layoutId: draftId });
  const confirmationText = await showConfirmationPrompt(candidateStore, candidateStore.getByRole("button", { name: "Veröffentlichen" }), /Diesen gespeicherten Entwurf veröffentlichen/);
  await capture(candidateStore, "candidate-store-publication-confirmation", "publication-confirmation-dismissed", { storeId: scopedStore.id, layoutId: draftId, confirmationText });
  assert.equal(ok(await api(admin, "GET", `${versionsPath}/${draftId}`), "draft remains private after confirmation screenshot").status, "DRAFT");
  await candidateStore.close();

  // Legacy Store editor at the direct link. Keep the changes local; capture the
  // initial state and an edited draft without invoking legacy save behavior.
  const legacyStore = await admin.context().newPage();
  await legacyStore.goto(`${base}/admin/editor/?storeId=${scopedStore.id}&layoutId=${initial.layoutId}`, { waitUntil: "domcontentloaded" });
  await waitLegacyStore(legacyStore);
  await capture(legacyStore, "legacy-store-initial", "initial", { storeId: scopedStore.id, layoutId: initial.layoutId });
  await legacyStore.locator("#shopName").fill(`Legacy Evidence Draft ${stamp}`);
  await capture(legacyStore, "legacy-store-draft", "unsaved-draft", { storeId: scopedStore.id });
  await legacyStore.close();

  // Candidate and legacy global editor initial states. Legacy only confirms
  // publication when warnings remain, so capture its unsaved state without
  // invoking its immediate-publication action.
  const candidateGlobal = await admin.context().newPage();
  await candidateGlobal.goto(`${base}/admin/next/editor/`, { waitUntil: "domcontentloaded" });
  await candidateGlobal.getByRole("heading", { name: "Globales Layout", exact: true }).waitFor({ timeout: 15_000 });
  await candidateGlobal.getByRole("textbox", { name: "Filialname" }).waitFor();
  await capture(candidateGlobal, "candidate-global-initial", "initial");
  await candidateGlobal.getByRole("textbox", { name: "Filialname" }).fill(`Global Screenshot Only ${stamp}`);
  const globalConfirmation = await showConfirmationPrompt(candidateGlobal, candidateGlobal.getByRole("button", { name: "Global veröffentlichen" }), /globale Layout jetzt für alle Kunden veröffentlichen/i);
  await capture(candidateGlobal, "candidate-global-publication-confirmation", "publication-confirmation-dismissed", { confirmationText: globalConfirmation });
  await candidateGlobal.close();

  const legacyGlobal = await admin.context().newPage();
  await legacyGlobal.goto(`${base}/admin/editor/`, { waitUntil: "domcontentloaded" });
  await legacyGlobal.locator("#shopName").waitFor({ timeout: 15_000 });
  await legacyGlobal.locator("#publishBtn").waitFor();
  await capture(legacyGlobal, "legacy-global-initial", "initial");
  await legacyGlobal.locator("#shopName").fill(`Global Screenshot Only ${stamp}`);
  await capture(legacyGlobal, "legacy-global-unsaved", "unsaved-global", { publicationGuard: "Global POST blocked by capture context" });
  await legacyGlobal.close();

  // Region manager: permitted scoped direct link and a foreign Store direct
  // link. The foreign Region/Store remain unrelated to the manager's scope.
  regionManager = await login(regionUser);
  const ownScoped = await regionManager.context().newPage();
  await ownScoped.goto(`${base}/admin/next/editor/?storeId=${scopedStore.id}`, { waitUntil: "domcontentloaded" });
  await waitCandidateStore(ownScoped);
  await capture(ownScoped, "candidate-store-scoped-direct-link", "scoped-direct-link", { storeId: scopedStore.id, role: "region-manager", regionId: assignedRegionId });
  await ownScoped.close();
  const denied = await regionManager.context().newPage();
  await denied.goto(`${base}/admin/next/editor/?storeId=${foreignStore.id}`, { waitUntil: "domcontentloaded" });
  await denied.getByRole("heading", { name: "Zugriff verweigert" }).waitFor({ timeout: 15_000 });
  await capture(denied, "candidate-store-denied-direct-link", "denied-direct-link", { storeId: foreignStore.id, role: "region-manager", assignedRegionId });
  await denied.close();

  // Deterministic load-error rendering via one intercepted context request.
  const errored = await admin.context().newPage();
  await errored.route(`**/api/stores/${scopedStore.id}/layout/editor-context`, (route) => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ error: "Injected screenshot-only editor load failure" }),
  }), { times: 1 });
  await errored.goto(`${base}/admin/next/editor/?storeId=${scopedStore.id}`, { waitUntil: "domcontentloaded" });
  await errored.getByRole("heading", { name: "Editor konnte nicht geladen werden" }).waitFor({ timeout: 15_000 });
  await capture(errored, "candidate-store-load-error", "injected-load-error", { storeId: scopedStore.id, injectedStatus: 503 });
  await errored.close();

  storeManager = await login(storeUser);
  const storeMe = ok(await api(storeManager, "GET", "/api/admin/me"), "store-manager identity");
  assert.equal(storeMe.role, "store-manager");
  const storeDenied = await storeManager.context().newPage();
  await storeDenied.goto(`${base}/admin/next/editor/?storeId=${scopedStore.id}`, { waitUntil: "domcontentloaded" });
  await storeDenied.getByRole("heading", { name: "Zugriff verweigert" }).waitFor({ timeout: 15_000 });
  await capture(storeDenied, "candidate-store-store-manager-denied-direct-link", "denied-direct-link", { storeId: scopedStore.id, role: "store-manager", ownStoreId: storeMe.scope?.storeId ?? null });
  await storeDenied.close();

  assert.equal(evidence.globalWrites, 0, "screenshot capture must not write the global layout");
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = error instanceof Error ? error.message : String(error);
} finally {
  // Archive only fixture Stores/Region; do not touch global layout state.
  for (const [name, fixture, path] of [
    ["scopedStore", scopedStore, scopedStore && `/api/stores/${scopedStore.id}/archive`],
    ["foreignStore", foreignStore, foreignStore && `/api/stores/${foreignStore.id}/archive`],
    ["foreignRegion", foreignRegion, foreignRegion && `/api/regions/${foreignRegion.id}/archive`],
  ]) {
    if (!fixture || !path || !admin) continue;
    try {
      const result = await api(admin, "PATCH", path, {});
      evidence.cleanup[name] = { id: fixture.id, status: result.status };
      if (result.status !== 200) {
        evidence.result = "FAIL";
        evidence.cleanupError = `${name} archive HTTP ${result.status}`;
      }
    } catch (error) {
      evidence.result = "FAIL";
      evidence.cleanupError ||= error instanceof Error ? error.message : String(error);
    }
  }
  for (const page of [storeManager, regionManager, admin]) await page?.close().catch(() => {});
  await browser.close().catch(() => {});
  if (evidenceDir) {
    await mkdir(evidenceDir, { recursive: true }).catch(() => {});
    await writeFile(resolve(evidenceDir, "metadata.json"), `${JSON.stringify(evidence, null, 2)}\n`).catch((error) => {
      evidence.result = "FAIL";
      evidence.metadataWriteError = error instanceof Error ? error.message : String(error);
    });
  }
  console.log(JSON.stringify(evidence));
  if (evidence.result !== "PASS") process.exitCode = 1;
}
