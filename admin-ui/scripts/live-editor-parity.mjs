import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Read-only against real devices. The probe only uses the disposable local
// packaged stack and temporary admin data; it restores the global map and
// archives its Store fixture in finally.
const base = process.env.ADMIN_SMOKE_BASE_URL || "http://localhost:8080";
assert.ok(["localhost", "127.0.0.1", "host.docker.internal"].includes(new URL(base).hostname), "editor parity probe only permits the disposable local stack");
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8"));
const [adminUser, , storeUser] = realm.users;
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP host.docker.internal 127.0.0.1"] : [] });
const created = { region: null, store: null };
let admin = null;
let globalBefore = null;
let globalChanged = false;
const evidence = {
  result: "PASS",
  scope: "local packaged stack only; no real-device observation",
  legacyGlobalDirectLink: false,
  candidateGlobalDirectLink: false,
  legacyGlobalPersisted: false,
  candidateGlobalReadback: false,
  globalRestored: false,
  legacyStoreDirectLinkAndReload: false,
  storeDirectLinkAndReload: false,
  draftIsNotPublic: false,
  activationAndRollback: false,
  scopedDenial: false,
  roleDenial: false,
  keyboard: false,
  injectedLoadErrorRetry: false,
  anonymousCurrentLayout: false,
  fixtureCleanup: false,
  remainingGates: ["real iOS/Android device rendering and navigation are not exercised by this browser/API probe"],
};

async function login(user, path = "/admin/next/") {
  const page = await browser.newPage();
  await page.goto(base + path, { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill(user.username);
  await page.locator("#password").fill(user.credentials.find((item) => item.type === "password").value);
  await page.locator("#kc-login").click();
  await page.waitForURL(`**${path.split("?")[0]}*`, { timeout: 15_000 });
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
  assert.equal(result.status, 200, `${label}: HTTP ${result.status} ${JSON.stringify(result.body).slice(0, 250)}`);
  return result.body;
}

async function waitGlobalShopName(page, expected, label) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const current = ok(await api(page, "GET", "/api/layout/current"), label);
    if (current.shopName === expected) return current;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label}: global layout did not reach ${expected}`);
}

async function waitInputValue(locator, expected, label) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await locator.inputValue() === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${label}: input did not reach ${expected}`);
}

const documentFor = (name) => ({
  shopName: name,
  gridSize: { width: 20, height: 20 },
  elements: [
    { id: 1, type: "entrance", x: 2, y: 0, width: 3, height: 1, label: "Eingang" },
    { id: 2, type: "shelf", x: 5, y: 5, width: 3, height: 2, category: "310/1", meter: 1, label: "Probe-Regal" },
  ],
});

async function anonymousCurrent(storeId) {
  const response = await fetch(`${base}/api/mobile/stores/${storeId}/layout/current`);
  assert.equal(response.status, 200, "anonymous current-layout response");
  return response.json();
}

try {
  admin = await login(adminUser);
  admin.on("dialog", (dialog) => void dialog.accept().catch(() => {}));
  assert.equal(ok(await api(admin, "GET", "/api/admin/me"), "admin identity").role, "admin");
  globalBefore = ok(await api(admin, "GET", "/api/layout/current"), "global layout snapshot");
  const stamp = randomUUID().slice(0, 8).toUpperCase();
  // Existing demo layouts can contain legacy validation blockers. Start from a
  // valid disposable map so a blocked publish cannot masquerade as UI drift.
  globalChanged = true;
  ok(await api(admin, "POST", "/api/layout/current", documentFor(`Seed ${stamp}`)), "seed valid global layout");
  created.region = ok(await api(admin, "POST", "/api/regions", { code: `ED-${stamp}`, name: `Editor Probe ${stamp}` }), "create fixture region");
  created.store = ok(await api(admin, "POST", "/api/stores", {
    regionId: created.region.id, storeCode: `ED-${stamp}`, name: `Editor Probe ${stamp}`,
    street: "Testgasse 1", zipCode: "4020", city: "Linz", country: "AT",
  }), "create fixture Store");

  const suffix = `Probe ${stamp}`;
  await admin.goto(`${base}/admin/editor/?probe=${stamp}`, { waitUntil: "domcontentloaded" });
  await admin.locator("#toolSelect").waitFor();
  await admin.locator("#shopName").fill(`Legacy ${suffix}`);
  await admin.locator("#publishBtn").focus();
  await admin.keyboard.press("Enter");
  await admin.locator("#saveStatus").getByText(/gespeichert|published|erfolgreich/i).waitFor({ timeout: 15_000 });
  const globalLegacyRead = await waitGlobalShopName(admin, `Legacy ${suffix}`, "legacy global write readback");
  assert.equal(globalLegacyRead.shopName, `Legacy ${suffix}`, "legacy direct-link save reaches the persisted global layout");
  evidence.legacyGlobalDirectLink = true;
  evidence.legacyGlobalPersisted = true;

  await admin.goto(`${base}/admin/next/editor/?probe=${stamp}`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("heading", { name: "Globales Layout", exact: true }).waitFor();
  await admin.getByRole("textbox", { name: "Filialname" }).waitFor();
  assert.equal(await admin.getByRole("textbox", { name: "Filialname" }).inputValue(), `Legacy ${suffix}`, "candidate global direct link reads the same persisted document");
  evidence.candidateGlobalDirectLink = true;
  evidence.candidateGlobalReadback = true;
  await admin.getByRole("textbox", { name: "Filialname" }).fill(globalBefore.shopName);
  await admin.getByRole("button", { name: "Global veröffentlichen" }).click();
  await admin.getByText("Globales Layout veröffentlicht.").waitFor();
  await waitGlobalShopName(admin, globalBefore.shopName, "candidate global restore readback");
  globalChanged = false;
  evidence.globalRestored = true;

  const path = `/api/stores/${created.store.id}/layout/versions`;
  const initial = ok(await api(admin, "POST", path, { layoutName: `Initial ${suffix}`, activate: true, layout: documentFor(`Initial ${suffix}`) }), "activate initial fixture version");
  assert.equal(initial.status, "ACTIVE");
  const initialPublic = await anonymousCurrent(created.store.id);
  assert.equal(initialPublic.layoutId, initial.layoutId);
  evidence.anonymousCurrentLayout = true;
  const draft = ok(await api(admin, "POST", path, { layoutName: `Draft ${suffix}`, activate: false, layout: documentFor(`Draft ${suffix}`) }), "save fixture draft");
  assert.equal(draft.status, "DRAFT");
  const stillInitial = await anonymousCurrent(created.store.id);
  assert.equal(stillInitial.layoutId, initial.layoutId, "draft must not replace the public active version");
  assert.equal(stillInitial.layout.shopName, `Initial ${suffix}`);
  evidence.draftIsNotPublic = true;
  await admin.goto(`${base}/admin/editor/?storeId=${created.store.id}&layoutId=${draft.layoutId}`, { waitUntil: "domcontentloaded" });
  await admin.locator("#storeContextBox").waitFor();
  await admin.locator("#shopName").waitFor();
  await waitInputValue(admin.locator("#shopName"), `Draft ${suffix}`, "legacy store direct link opens the selected draft");
  await admin.reload({ waitUntil: "domcontentloaded" });
  await waitInputValue(admin.locator("#shopName"), `Draft ${suffix}`, "legacy store direct link survives refresh");
  evidence.legacyStoreDirectLinkAndReload = true;
  const opened = `${base}/admin/next/editor/?storeId=${created.store.id}&layoutId=${draft.layoutId}`;
  await admin.goto(opened, { waitUntil: "domcontentloaded" });
  await admin.getByRole("heading", { name: "Layout Editor" }).waitFor();
  await admin.reload({ waitUntil: "domcontentloaded" });
  await admin.getByRole("textbox", { name: "Filialname" }).waitFor();
  await waitInputValue(admin.getByRole("textbox", { name: "Filialname" }), `Draft ${suffix}`, "store version deep link survives refresh");
  evidence.storeDirectLinkAndReload = true;

  await admin.locator(".le-layers button").filter({ hasText: "Probe-Regal" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("group", { name: "Interaktiver Grundriss" }).focus();
  await admin.keyboard.press("ArrowRight");
  await admin.getByLabel("X", { exact: true }).waitFor();
  assert.equal(await admin.getByLabel("X", { exact: true }).inputValue(), "6", "keyboard arrow moves the focused element");
  evidence.keyboard = true;
  // Discard the local keyboard edit by navigating to the persisted draft before activation.
  await admin.goto(opened, { waitUntil: "domcontentloaded" });
  await admin.getByRole("textbox", { name: "Filialname" }).waitFor();

  const activeDraft = ok(await api(admin, "POST", `${path}/${draft.layoutId}/activate`, {}), "activate saved draft");
  assert.equal(activeDraft.status, "ACTIVE");
  assert.equal((await anonymousCurrent(created.store.id)).layoutId, draft.layoutId);
  const rolledBack = ok(await api(admin, "POST", `${path}/${initial.layoutId}/activate`, {}), "rollback to prior version");
  assert.equal(rolledBack.status, "ACTIVE");
  const afterRollback = await anonymousCurrent(created.store.id);
  assert.equal(afterRollback.layoutId, initial.layoutId);
  assert.equal(afterRollback.layout.shopName, `Initial ${suffix}`);
  evidence.activationAndRollback = true;

  let failOnce = true;
  const fault = (route) => {
    if (route.request().method() === "GET" && failOnce) {
      failOnce = false;
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Injected editor probe failure" }) });
    }
    return route.continue();
  };
  await admin.route(`**/api/stores/${created.store.id}/layout/editor-context`, fault);
  await admin.goto(`${base}/admin/next/editor/?storeId=${created.store.id}`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("heading", { name: "Editor konnte nicht geladen werden" }).waitFor();
  await admin.getByRole("button", { name: "Erneut versuchen" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("heading", { name: "Layout Editor" }).waitFor();
  assert.equal(failOnce, false);
  evidence.injectedLoadErrorRetry = true;
  await admin.unroute(`**/api/stores/${created.store.id}/layout/editor-context`, fault);

  const manager = await login(storeUser);
  const me = ok(await api(manager, "GET", "/api/admin/me"), "store manager identity");
  assert.equal(me.role, "store-manager");
  assert.notEqual(me.scope?.storeId, created.store.id);
  assert.equal((await api(manager, "GET", `/api/stores/${created.store.id}/layout/editor-context`)).status, 403);
  await manager.goto(`${base}/admin/next/editor/?storeId=${created.store.id}`, { waitUntil: "domcontentloaded" });
  await manager.getByRole("heading", { name: "Zugriff verweigert" }).waitFor();
  await manager.goto(`${base}/admin/next/editor/`, { waitUntil: "domcontentloaded" });
  await manager.getByRole("heading", { name: "Zugriff verweigert" }).waitFor();
  evidence.scopedDenial = true;
  evidence.roleDenial = true;
  await manager.close();
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = error instanceof Error ? error.message : String(error);
  if (admin) {
    evidence.legacySaveStatus = await admin.locator("#saveStatus").textContent().catch(() => null);
    evidence.legacyValidation = (await admin.locator("#validationPanel").textContent().catch(() => null))?.slice(0, 500);
  }
} finally {
  if (admin && globalChanged && globalBefore) {
    try {
      const restored = await api(admin, "POST", "/api/layout/current", globalBefore);
      evidence.globalRestored = restored.status === 200;
      if (!evidence.globalRestored) { evidence.result = "FAIL"; evidence.cleanupError = `global restore HTTP ${restored.status}`; }
    } catch (error) {
      evidence.result = "FAIL";
      evidence.globalRestored = false;
      evidence.cleanupError = error instanceof Error ? error.message : String(error);
    }
  }
  if (admin && created.store) {
    try {
      const archived = await api(admin, "PATCH", `/api/stores/${created.store.id}/archive`, {});
      evidence.fixtureCleanup = archived.status === 200;
      if (!evidence.fixtureCleanup) { evidence.result = "FAIL"; evidence.cleanupError = `fixture archive HTTP ${archived.status}`; }
    } catch (error) {
      evidence.result = "FAIL";
      evidence.fixtureCleanup = false;
      evidence.cleanupError = error instanceof Error ? error.message : String(error);
    }
  }
  if (admin && created.region) {
    try {
      const archived = await api(admin, "PATCH", `/api/regions/${created.region.id}/archive`, {});
      if (archived.status !== 200) { evidence.result = "FAIL"; evidence.cleanupError ||= `fixture region archive HTTP ${archived.status}`; }
    } catch (error) {
      evidence.result = "FAIL";
      evidence.cleanupError ||= error instanceof Error ? error.message : String(error);
    }
  }
  if (admin) await admin.close();
  await browser.close();
  console.log(JSON.stringify(evidence));
  if (evidence.result !== "PASS") process.exitCode = 1;
}
