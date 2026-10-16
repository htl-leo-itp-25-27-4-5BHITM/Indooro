import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Packaged local-stack probe for the candidate Store editor's Beacon inspector.
// All writes are limited to randomly named Region/Store/Beacon fixtures and a
// private Store draft; global layout and remote hosts are never written.
const base = process.env.ADMIN_SMOKE_BASE_URL || "http://localhost:8080";
assert.ok(["localhost", "127.0.0.1", "host.docker.internal"].includes(new URL(base).hostname), "probe only permits the local stack");
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8"));
const [adminUser] = realm.users;
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP host.docker.internal 127.0.0.1"] : [] });
let admin = null;
let region = null;
let store = null;
const beacons = [];
const evidence = {
  result: "PASS",
  scope: "packaged local stack; authenticated candidate Store editor; disposable Region/Store/Beacons only",
  fixtureIds: { beaconIds: [] },
  checks: {
    assignedBeaconVisibleAndPlaceable: false,
    hardwareIdentityReadback: false,
    duplicateHasNoHardwareIdentity: false,
    duplicateIdentityOptionDisabled: false,
    missingAssignmentValidationAndPublishBlock: false,
    deleteUndo: false,
    savedDraftReadback: false,
    anonymousMobileUnchanged: false,
  },
  httpStatuses: [],
  cleanup: { beacons: [], store: null, region: null },
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
  assert.equal(result.status, 200, `${label}: HTTP ${result.status} ${JSON.stringify(result.body).slice(0, 300)}`);
  return result.body;
}

async function anonymousCurrent(storeId) {
  const path = `/api/mobile/stores/${storeId}/layout/current`;
  const response = await fetch(`${base}${path}`);
  evidence.httpStatuses.push({ method: "GET (anonymous)", path, status: response.status });
  assert.equal(response.status, 200, `anonymous current layout: HTTP ${response.status}`);
  return response.json();
}

const stamp = randomUUID().slice(0, 8).toUpperCase();
const identityA = { uuid: randomUUID(), major: 17, minor: 31 };
const identityB = { uuid: randomUUID(), major: 17, minor: 32 };
const layout = (name) => ({
  shopName: name,
  gridSize: { width: 20, height: 20 },
  elements: [{ id: 1, type: "entrance", x: 1, y: 0, width: 3, height: 1, label: "Eingang" }],
});

try {
  admin = await login(adminUser);
  assert.equal(ok(await api(admin, "GET", "/api/admin/me"), "admin identity").role, "admin");
  region = ok(await api(admin, "POST", "/api/regions", { code: `BI-${stamp}`, name: `Beacon Inspector ${stamp}` }), "create fixture Region");
  store = ok(await api(admin, "POST", "/api/stores", {
    regionId: region.id, storeCode: `BI-${stamp}`, name: `Beacon Inspector ${stamp}`,
    street: "Testgasse 1", zipCode: "4020", city: "Linz", country: "AT",
  }), "create fixture Store");
  evidence.fixtureIds.regionId = region.id;
  evidence.fixtureIds.storeId = store.id;

  for (const [index, identity] of [identityA, identityB].entries()) {
    const beacon = ok(await api(admin, "POST", "/api/beacons", {
      beaconCode: `BI-${stamp}-${index + 1}`, ...identity, notes: "Disposable editor inspector fixture",
    }), `create fixture Beacon ${index + 1}`);
    beacons.push(beacon);
    evidence.fixtureIds.beaconIds.push(beacon.id);
    ok(await api(admin, "POST", `/api/beacons/${beacon.id}/assign`, { storeId: store.id }), `assign fixture Beacon ${index + 1}`);
  }

  const versionsPath = `/api/stores/${store.id}/layout/versions`;
  const initial = ok(await api(admin, "POST", versionsPath, {
    layoutName: `Initial ${stamp}`, activate: true, layout: layout(`Initial ${stamp}`),
  }), "create initial active Store version");
  const mobileBefore = await anonymousCurrent(store.id);
  assert.equal(mobileBefore.layoutId, initial.layoutId);

  await admin.goto(`${base}/admin/next/editor/?storeId=${store.id}&layoutId=${initial.layoutId}`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("heading", { name: "Layout Editor" }).waitFor();
  await admin.getByRole("button", { name: "Beacon", exact: true }).click();
  const canvas = admin.getByRole("group", { name: "Interaktiver Grundriss" });
  await canvas.focus();
  await admin.keyboard.press("ArrowRight");
  await admin.keyboard.press("ArrowDown");
  await admin.keyboard.press("Enter");
  let beaconLayers = admin.locator(".le-layers button").filter({ hasText: "Beacon" });
  await beaconLayers.waitFor();
  await beaconLayers.last().click();
  const assignment = admin.getByLabel("Zugeordneter Beacon");
  const placedCode = await assignment.inputValue();
  const placedBeacon = beacons.find((beacon) => beacon.beaconCode === placedCode);
  assert.ok(placedBeacon, `placed Beacon must reference one assigned fixture: ${placedCode}`);
  const otherBeacon = beacons.find((beacon) => beacon.id !== placedBeacon.id);
  assert.ok(otherBeacon);
  assert.equal(await assignment.locator(`option[value="${placedBeacon.beaconCode}"]`).isDisabled(), false);
  evidence.checks.assignedBeaconVisibleAndPlaceable = true;
  evidence.checks.hardwareIdentityReadback = true; // verified below against persisted version JSON

  await admin.getByRole("button", { name: "Duplizieren" }).click();
  const layers = admin.locator(".le-layers button");
  assert.equal(await layers.count(), 3, "duplicate adds exactly one Beacon layer");
  const duplicatedLayer = layers.filter({ hasText: "Beacon" }).last();
  await duplicatedLayer.click();
  assert.equal(await assignment.inputValue(), "", "duplicate must clear assigned hardware identity");
  assert.equal(await assignment.locator(`option[value="${placedBeacon.beaconCode}"]`).evaluate((option) => option.disabled), true, "already placed identity cannot be selected twice");
  assert.equal(await assignment.locator(`option[value="${otherBeacon.beaconCode}"]`).isDisabled(), false, "other assigned Beacon remains selectable");
  await assignment.selectOption(otherBeacon.beaconCode);
  assert.equal(await assignment.inputValue(), otherBeacon.beaconCode);
  evidence.checks.duplicateHasNoHardwareIdentity = true;
  evidence.checks.duplicateIdentityOptionDisabled = true;

  await assignment.selectOption("");
  await admin.locator(".le-validation").getByText(/keinem Beacon zugeordnet|nicht zugeordnet/, { exact: false }).waitFor();
  assert.equal(await admin.getByRole("button", { name: "Veröffentlichen" }).isDisabled(), true, "missing Beacon assignment blocks publication");
  evidence.checks.missingAssignmentValidationAndPublishBlock = true;
  await assignment.selectOption(otherBeacon.beaconCode);

  admin.once("dialog", (dialog) => dialog.accept());
  await admin.getByRole("button", { name: "Löschen" }).click();
  assert.equal(await layers.count(), 2, "Beacon inspector delete removes the selected duplicate");
  await admin.getByRole("button", { name: "Rückgängig" }).click();
  assert.equal(await layers.count(), 3, "undo restores deleted Beacon draft element");
  evidence.checks.deleteUndo = true;

  await admin.getByRole("button", { name: "Entwurf speichern" }).click();
  await admin.getByText("Entwurf gespeichert.").waitFor();
  const draftId = new URL(admin.url()).searchParams.get("layoutId");
  assert.ok(draftId && draftId !== initial.layoutId, "save creates a separate private draft version");
  const draft = ok(await api(admin, "GET", `${versionsPath}/${draftId}`), "Beacon draft API readback");
  assert.equal(draft.status, "DRAFT");
  const savedBeacons = draft.layout.elements.filter((item) => item.type === "beacon");
  assert.equal(savedBeacons.length, 2, "both Beacon positions persist");
  const savedA = savedBeacons.find((item) => item.beaconId === placedBeacon.beaconCode);
  const savedB = savedBeacons.find((item) => item.beaconId === otherBeacon.beaconCode);
  assert.ok(savedA && savedB, "each draft Beacon maps to its selected assigned record");
  for (const [saved, beacon] of [[savedA, placedBeacon], [savedB, otherBeacon]]) {
    assert.equal(saved.beaconDbId, beacon.id);
    assert.equal(saved.uuid, beacon.uuid);
    assert.equal(saved.major, beacon.major);
    assert.equal(saved.minor, beacon.minor);
    assert.equal(saved.identityKey, beacon.identityKey, "identity key matches the Beacon record canonical value");
  }
  assert.ok(savedBeacons.every((item) => item.beaconId), "deleted duplicate is absent; no unassigned duplicate was persisted");
  evidence.checks.savedDraftReadback = true;
  evidence.checks.hardwareIdentityReadback = true;

  const mobileAfter = await anonymousCurrent(store.id);
  assert.deepEqual(mobileAfter, mobileBefore, "anonymous mobile current remains byte-equivalent in its JSON data after private draft save");
  evidence.checks.anonymousMobileUnchanged = true;
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = error instanceof Error ? error.message : String(error);
} finally {
  if (admin) {
    for (const beacon of [...beacons].reverse()) {
      try {
        const release = await api(admin, "POST", `/api/beacons/${beacon.id}/release`);
        const archived = await api(admin, "PATCH", `/api/beacons/${beacon.id}/archive`, {});
        evidence.cleanup.beacons.push({ id: beacon.id, releaseHttp: release.status, archiveHttp: archived.status });
        if (release.status !== 200 || archived.status !== 200) {
          evidence.result = "FAIL";
          evidence.cleanupError ||= `Beacon ${beacon.id} cleanup: release HTTP ${release.status}, archive HTTP ${archived.status}`;
        }
      } catch (error) {
        evidence.result = "FAIL";
        evidence.cleanupError ||= error instanceof Error ? error.message : String(error);
      }
    }
    if (store) {
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
    if (region) {
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
    await admin.close().catch(() => {});
  }
  await browser.close().catch(() => {});
  if (Object.values(evidence.checks).some((passed) => !passed)) evidence.result = "FAIL";
  console.log(JSON.stringify(evidence));
  if (evidence.result !== "PASS") process.exitCode = 1;
}
