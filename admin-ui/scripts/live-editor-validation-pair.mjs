import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Compare both real editor routes using the same imported document. The Store
// fixture is disposable; no editor save or publication action is activated.
const base = process.env.ADMIN_SMOKE_BASE_URL || "http://localhost:8080";
assert.ok(["localhost", "127.0.0.1", "host.docker.internal"].includes(new URL(base).hostname), "validation pair only permits local hosts");
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8").replace(/\$\{(\w+)\}/g, (match, name) => process.env[name] ?? match));
const [adminUser] = realm.users;
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP localhost 127.0.0.1,MAP host.docker.internal 127.0.0.1"] : [] });
let fixtureBytes;
let admin = null;
let region = null;
let store = null;
const evidence = {
  result: "PASS",
  scope: "localhost:8080 packaged stack; same imported validation document in candidate and legacy Store editors",
  fixtureIds: {},
  ui: { candidateEntranceIssue: false, legacyEntranceIssue: false, candidateShelfIssueSelectable: false, legacyShelfIssueSelectable: false, controls: false },
  publication: { candidateDraftSaveAvailableWithErrors: false, candidatePublishDisabled: false, legacyPublishButtonEnabledWithErrors: false, legacyWarningConfirmationDismissed: false, legacyPublishConfirmation: null },
  state: { storeVersionsUnchanged: false, storeMobileCurrentUnchanged: false },
  cleanup: { storeArchived: false, regionArchived: false },
  httpStatuses: [],
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

async function api(method, path, data) {
  const response = await admin.context().request.fetch(`${base}${path}`, { method, data, failOnStatusCode: false });
  const raw = await response.text();
  let body;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
  evidence.httpStatuses.push({ method, path, status: response.status() });
  assert.equal(response.status(), 200, `${method} ${path}: HTTP ${response.status()} ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

async function snapshotStore(storeId) {
  const versions = await api("GET", `/api/stores/${storeId}/layout/versions`);
  const mobileResponse = await fetch(`${base}/api/mobile/stores/${storeId}/layout/current`);
  evidence.httpStatuses.push({ method: "GET", path: `/api/mobile/stores/${storeId}/layout/current`, status: mobileResponse.status });
  assert.equal(mobileResponse.status, 200);
  return { versions: versions.map((row) => row.layoutId).sort(), mobile: await mobileResponse.json() };
}

async function importCandidateFixture(page, storeId) {
  await page.goto(`${base}/admin/next/editor/?storeId=${storeId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Layout Editor" }).waitFor({ timeout: 15_000 });
  const editor = page.getByRole("region", { name: "Layout-Editor" });
  await editor.getByRole("button", { name: "JSON importieren" }).click();
  await editor.getByLabel("Grundrissdatei importieren").setInputFiles({ name: "validation.json", mimeType: "application/json", buffer: fixtureBytes });
  await editor.getByText(/Grundriss importiert/).waitFor();
  const validation = editor.locator(".le-validation");
  const entranceIssue = validation.getByRole("button", { name: "Ein Eingang ist für die Navigation erforderlich." });
  await entranceIssue.waitFor();
  assert.equal(await entranceIssue.isDisabled(), true, "document-level missing-entrance issue has no element to select");
  const shelfIssue = validation.getByRole("button", { name: /Probe Regal.*keine Kategorie oder Layoutkennung/ });
  await shelfIssue.waitFor();
  assert.equal(await shelfIssue.isEnabled(), true, "element-linked issue is selectable");
  await shelfIssue.click();
  await editor.getByLabel("Eigenschaften und Prüfung").getByLabel("Kategoriecode").waitFor();
  assert.equal(await editor.getByLabel("Eigenschaften und Prüfung").getByLabel("Kategoriecode").inputValue(), "");
  const errorCount = await validation.locator("li.le-error").count();
  assert.ok(errorCount >= 1);
  const draftButton = editor.getByRole("button", { name: "Entwurf speichern" });
  const publishButton = editor.getByRole("button", { name: "Veröffentlichen" });
  return { editor, validation, errorCount, draftButton, publishButton };
}

async function importLegacyFixture(page, storeId, activeLayoutId) {
  await page.goto(`${base}/admin/editor/?storeId=${storeId}&layoutId=${activeLayoutId}`, { waitUntil: "domcontentloaded" });
  await page.locator("#storeContextBox").waitFor();
  await page.locator("#shopName").waitFor();
  await page.locator("#fileInput").setInputFiles({ name: "validation.json", mimeType: "application/json", buffer: fixtureBytes });
  await page.waitForFunction(() => document.querySelector("#shopName")?.value?.startsWith("Validation Pair "));
  await page.locator("#validateBtn").click();
  const validation = page.locator("#validationPanel");
  await validation.getByText("Kein Eingang platziert.").waitFor();
  const shelfIssue = validation.locator("[data-validation-element='1']");
  await shelfIssue.waitFor();
  await shelfIssue.click();
  assert.equal(await page.locator("#propLabel").inputValue(), "Probe Regal", "legacy element-linked issue selects its shelf");
  return { validation, publishButton: page.locator("#publishBtn") };
}

try {
  const stamp = randomUUID().slice(0, 8).toUpperCase();
  const document = {
    shopName: `Validation Pair ${stamp}`,
    gridSize: { width: 20, height: 20 },
    elements: [{ id: 1, type: "shelf", x: 5, y: 5, width: 3, height: 2, label: "Probe Regal" }],
  };
  fixtureBytes = Buffer.from(JSON.stringify(document));
  admin = await login();
  assert.equal((await api("GET", "/api/admin/me")).role, "admin");
  region = await api("POST", "/api/regions", { code: `VP-${stamp}`, name: `Validation Pair ${stamp}` });
  store = await api("POST", "/api/stores", {
    regionId: region.id, storeCode: `VP-${stamp}`, name: `Validation Pair ${stamp}`,
    street: "Probeweg 1", zipCode: "4020", city: "Linz", country: "AT",
  });
  evidence.fixtureIds = { regionId: region.id, storeId: store.id, storeCode: store.storeCode };
  const seeded = await api("POST", `/api/stores/${store.id}/layout/versions`, {
    layoutName: `Validation seed ${stamp}`, activate: true,
    layout: { shopName: `Validation seed ${stamp}`, gridSize: { width: 20, height: 20 }, elements: [{ id: 1, type: "entrance", x: 2, y: 0, width: 3, height: 1, label: "Eingang" }] },
  });
  assert.equal(seeded.status, "ACTIVE");
  const storeBefore = await snapshotStore(store.id);
  assert.equal(storeBefore.mobile.layoutId, seeded.layoutId);

  const candidate = await importCandidateFixture(admin, store.id);
  evidence.ui.candidateEntranceIssue = true;
  evidence.ui.candidateShelfIssueSelectable = true;
  evidence.publication.candidateDraftSaveAvailableWithErrors = await candidate.draftButton.isEnabled();
  assert.equal(evidence.publication.candidateDraftSaveAvailableWithErrors, true);
  evidence.publication.candidatePublishDisabled = await candidate.publishButton.isDisabled();
  assert.equal(evidence.publication.candidatePublishDisabled, true);
  evidence.ui.controls = (await candidate.editor.getByRole("button", { name: "JSON importieren" }).isEnabled())
    && (await candidate.editor.getByLabel("Eigenschaften und Prüfung").getByLabel("Kategoriecode").inputValue()) === "";
  const legacy = await importLegacyFixture(admin, store.id, seeded.layoutId);
  evidence.ui.legacyEntranceIssue = true;
  evidence.ui.legacyShelfIssueSelectable = true;
  evidence.publication.legacyPublishButtonEnabledWithErrors = await legacy.publishButton.isEnabled();
  assert.equal(evidence.publication.legacyPublishButtonEnabledWithErrors, true, "legacy Store UI leaves Publish clickable with validation warnings");
  let publishDialog = null;
  admin.once("dialog", async (dialog) => { publishDialog = dialog.message(); await dialog.dismiss(); });
  await legacy.publishButton.click();
  assert.match(publishDialog || "", /Warnung\(en\).*Trotzdem publizieren/);
  evidence.publication.legacyPublishConfirmation = publishDialog;
  evidence.publication.legacyWarningConfirmationDismissed = true;

  const storeAfter = await snapshotStore(store.id);
  assert.deepEqual(storeAfter, storeBefore, "importing and inspecting candidate/legacy editors leaves Store publication untouched");
  evidence.state.storeVersionsUnchanged = true;
  evidence.state.storeMobileCurrentUnchanged = true;
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = error instanceof Error ? error.message : String(error);
} finally {
  if (admin && store) {
    try {
      const archived = await api("PATCH", `/api/stores/${store.id}/archive`, {});
      evidence.cleanup.storeArchived = !!archived;
    } catch (error) { evidence.result = "FAIL"; evidence.cleanupError = error instanceof Error ? error.message : String(error); }
  }
  if (admin && region) {
    try {
      const archived = await api("PATCH", `/api/regions/${region.id}/archive`, {});
      evidence.cleanup.regionArchived = !!archived;
    } catch (error) { evidence.result = "FAIL"; evidence.cleanupError ||= error instanceof Error ? error.message : String(error); }
  }
  await admin?.close().catch(() => {});
  await browser.close().catch(() => {});
  if (store && !evidence.cleanup.storeArchived) evidence.result = "FAIL";
  if (region && !evidence.cleanup.regionArchived) evidence.result = "FAIL";
  console.log(JSON.stringify(evidence));
  if (evidence.result !== "PASS") process.exitCode = 1;
}
