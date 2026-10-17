import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Live browser probe for Beacon controls in the legacy Store editor. Mutations
// are confined to random fixtures and a private Store draft on the local stack.
const base = process.env.ADMIN_SMOKE_BASE_URL || "http://localhost:8080";
assert.ok(["localhost", "127.0.0.1", "host.docker.internal"].includes(new URL(base).hostname), "legacy Beacon probe permits local hosts only");
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8").replace(/\$\{(\w+)\}/g, (match, name) => process.env[name] ?? match));
const [adminUser] = realm.users;
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP localhost 127.0.0.1,MAP host.docker.internal 127.0.0.1"] : [] });
let admin = null;
let region = null;
let store = null;
const beacons = [];
const evidence = {
  result: "PASS",
  scope: "packaged local stack; legacy Store editor UI; disposable Region/Store/two assigned Beacons only",
  fixtureIds: { beaconIds: [], beaconCodes: [] },
  observations: {},
  comparisonNotes: [],
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
  const response = await page.context().request.fetch(`${base}${path}`, { method, data, failOnStatusCode: false });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
  return { status: response.status(), body };
}

function ok(response, label) {
  assert.equal(response.status, 200, `${label}: HTTP ${response.status} ${JSON.stringify(response.body).slice(0, 260)}`);
  return response.body;
}

function record(name, observed) {
  evidence.observations[name] = { result: "PASS", observed };
}

async function anonymousCurrent(storeId) {
  const response = await fetch(`${base}/api/mobile/stores/${storeId}/layout/current`);
  assert.equal(response.status, 200, `anonymous current layout HTTP ${response.status}`);
  return response.json();
}

const stamp = randomUUID().slice(0, 8).toUpperCase();
const identities = [
  { uuid: randomUUID(), major: 37, minor: 51 },
  { uuid: randomUUID(), major: 37, minor: 52 },
];
const fixtureLayout = (name) => ({
  shopName: name,
  gridSize: { width: 20, height: 20 },
  elements: [{ id: 1, type: "entrance", x: 1, y: 0, width: 3, height: 1, label: "Eingang" }],
});

try {
  admin = await login(adminUser);
  assert.equal(ok(await api(admin, "GET", "/api/admin/me"), "admin identity").role, "admin");
  region = ok(await api(admin, "POST", "/api/regions", { code: `LB-${stamp}`, name: `Legacy Beacon ${stamp}` }), "create disposable Region");
  store = ok(await api(admin, "POST", "/api/stores", {
    regionId: region.id, storeCode: `LB-${stamp}`, name: `Legacy Beacon ${stamp}`,
    street: "Testgasse 1", zipCode: "4020", city: "Linz", country: "AT",
  }), "create disposable Store");
  evidence.fixtureIds = { regionId: region.id, storeId: store.id, regionCode: region.code, storeCode: store.storeCode, beaconIds: [], beaconCodes: [] };

  for (const [index, identity] of identities.entries()) {
    const beacon = ok(await api(admin, "POST", "/api/beacons", {
      beaconCode: `LB-${stamp}-${index + 1}`, ...identity, notes: "Disposable legacy Beacon inspector fixture",
    }), `create fixture Beacon ${index + 1}`);
    beacons.push(beacon);
    evidence.fixtureIds.beaconIds.push(beacon.id);
    evidence.fixtureIds.beaconCodes.push(beacon.beaconCode);
    ok(await api(admin, "POST", `/api/beacons/${beacon.id}/assign`, { storeId: store.id }), `assign fixture Beacon ${index + 1}`);
  }

  const versionsPath = `/api/stores/${store.id}/layout/versions`;
  const initial = ok(await api(admin, "POST", versionsPath, {
    layoutName: `Legacy Beacon ${stamp}`, activate: true, layout: fixtureLayout(`Legacy Beacon ${stamp}`),
  }), "create disposable active Store layout");
  const mobileBefore = await anonymousCurrent(store.id);
  assert.equal(mobileBefore.layoutId, initial.layoutId);

  await admin.goto(`${base}/admin/editor/?storeId=${store.id}&layoutId=${initial.layoutId}&legacy=1`, { waitUntil: "domcontentloaded" });
  await admin.locator("#shopName").waitFor();
  const assignedList = admin.locator("#assignedBeaconsList");
  await assignedList.getByText(beacons[0].beaconCode, { exact: true }).waitFor();
  await assignedList.getByText(beacons[1].beaconCode, { exact: true }).waitFor();
  const cards = await assignedList.locator(":scope > div").count();
  assert.equal(cards, 2, "legacy Store context lists both assigned disposable Beacons");
  assert.match(await admin.locator("#storeContextBox").innerText(), /Zugewiesene Beacons: 2/);
  record("assigned_beacons_list", {
    codes: await assignedList.locator(".font-semibold").allTextContents(),
    identityKeys: await assignedList.locator(".text-xs.text-gray-500").allTextContents(),
    storeContext: (await admin.locator("#storeContextBox").innerText()).trim(),
  });

  await admin.locator("#toolDraw").click();
  await admin.locator("#elementTypes").getByRole("button", { name: /Beacon/ }).click();
  const stage = admin.locator("#canvasContainer");
  await stage.scrollIntoViewIfNeeded();
  const stageBox = await stage.boundingBox();
  assert.ok(stageBox, "legacy canvas stage is visible");
  const point = { x: stageBox.x + 8 * 20 + 5, y: stageBox.y + 8 * 20 + 5 };
  const hitTarget = await admin.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id || document.elementFromPoint(x, y)?.className || null, point);
  assert.ok(hitTarget === "canvasContainer" || String(hitTarget).includes("canvas"), `Beacon placement point is over the canvas: ${hitTarget}`);
  await admin.mouse.click(point.x, point.y);
  await admin.waitForFunction(() => document.querySelectorAll("#layersList [data-layer-id]").length === 2, null, { timeout: 5_000 });
  const placedLayer = admin.locator("#layersList [data-layer-id].active");
  const placedCode = (await placedLayer.innerText()).trim().split(/\s+/)[0];
  const placedBeacon = beacons.find((item) => item.beaconCode === placedCode);
  assert.ok(placedBeacon, `draw placement uses an assigned fixture Beacon: ${placedCode}`);
  const otherBeacon = beacons.find((item) => item.id !== placedBeacon.id);
  assert.ok(otherBeacon);
  assert.equal(await admin.locator("#propBeaconId").inputValue(), placedBeacon.beaconCode, "placement picks a free assigned Beacon");
  const firstInspectorIdentityOption = await admin.locator(`#propBeaconId option[value="${placedBeacon.beaconCode}"]`).innerText();
  assert.match(firstInspectorIdentityOption, new RegExp(placedBeacon.identityKey));
  const firstPosition = { x: await admin.locator("#propBeaconX").inputValue(), y: await admin.locator("#propBeaconY").inputValue() };
  record("beacon_placement_and_inspector", {
    assignedCode: await admin.locator("#propBeaconId").inputValue(),
    identityOption: firstInspectorIdentityOption.trim(),
    position: firstPosition,
    inspectorFields: await admin.locator("#propertiesWrapper input, #propertiesWrapper select").evaluateAll((fields) => fields.map((field) => ({ id: field.id, type: field.type, value: field.value }))),
  });

  await admin.locator("#propBeaconX").fill("11");
  await admin.locator("#propBeaconX").dispatchEvent("change");
  await admin.locator("#propBeaconY").fill("12");
  await admin.locator("#propBeaconY").dispatchEvent("change");
  const movedPosition = { x: await admin.locator("#propBeaconX").inputValue(), y: await admin.locator("#propBeaconY").inputValue() };
  assert.deepEqual(movedPosition, { x: "11", y: "12" }, "legacy Beacon inspector accepts integer X/Y changes");
  record("inspector_xy", movedPosition);

  await admin.getByTitle("Duplizieren").click();
  assert.equal(await admin.locator("#layersList [data-layer-id]").count(), 3, "legacy Beacon duplicate adds a second Beacon layer");
  const duplicateId = await admin.locator("#layersList [data-layer-id].active").getAttribute("data-layer-id");
  assert.ok(duplicateId, "duplicated Beacon is selected");
  const duplicateCode = await admin.locator("#propBeaconId").inputValue();
  assert.equal(duplicateCode, placedBeacon.beaconCode, "legacy duplicate copies its source Beacon identity");
  assert.equal(await admin.locator(`#propBeaconId option[value="${placedBeacon.beaconCode}"]`).isDisabled(), true, "the already placed Beacon cannot be selected twice");
  assert.equal(await admin.locator(`#propBeaconId option[value="${otherBeacon.beaconCode}"]`).isDisabled(), false, "the other assigned Beacon remains selectable");
  await admin.locator("#propBeaconId").selectOption(otherBeacon.beaconCode);
  assert.equal(await admin.locator("#propBeaconId").inputValue(), otherBeacon.beaconCode, "Inspector can correct the duplicate to a unique assignment");
  const legacyIdentityInputs = await admin.locator("#propertiesWrapper input, #propertiesWrapper select").evaluateAll((fields) => fields.map((field) => field.id));
  assert.ok(legacyIdentityInputs.includes("propBeaconId"));
  assert.ok(legacyIdentityInputs.includes("propBeaconX") && legacyIdentityInputs.includes("propBeaconY"));
  assert.equal(legacyIdentityInputs.some((id) => ["uuid", "major", "minor", "propBeaconUuid", "propBeaconMajor", "propBeaconMinor"].includes(id)), false, "legacy Store inspector has no editable UUID/major/minor fields");
  record("duplicate_and_unique_assignment", {
    layers: await admin.locator("#layersList [data-layer-id]").count(),
    duplicateId,
    duplicateCodeBeforeInspectorCorrection: duplicateCode,
    correctedDuplicateCode: await admin.locator("#propBeaconId").inputValue(),
    placedBeacon: placedBeacon.beaconCode,
    firstBeaconOptionDisabled: await admin.locator(`#propBeaconId option[value="${placedBeacon.beaconCode}"]`).isDisabled(),
    duplicateBeacon: duplicateCode,
    secondBeaconOptionDisabled: await admin.locator(`#propBeaconId option[value="${otherBeacon.beaconCode}"]`).isDisabled(),
    inspectorFieldIds: legacyIdentityInputs,
  });
  evidence.comparisonNotes.push("Candidate live-editor-beacon-inspector.mjs asserts duplicate Beacon identity is cleared; the legacy Inspector duplicate action initially copies the source hardware identity, creating a duplicate assignment. The legacy Inspector disables the already used option and allows manual correction to the other assigned Beacon.");
  evidence.comparisonNotes.push("Legacy Store Inspector exposes Beacon code and X/Y controls; UUID/major/minor are not editable Inspector fields. The saved legacy draft API is used below to inspect the hardware identity payload.");

  const dialogs = [];
  admin.on("dialog", async (dialog) => { dialogs.push(dialog.message()); await dialog.accept(); });
  await admin.getByTitle("Löschen").click();
  assert.equal(await admin.locator("#layersList [data-layer-id]").count(), 2, "legacy Beacon Inspector delete removes the selected duplicate");
  assert.deepEqual(dialogs, [], "legacy Inspector delete does not ask for confirmation");
  await admin.keyboard.press("Control+z");
  await admin.waitForFunction(() => document.querySelectorAll("#layersList [data-layer-id]").length === 3, null, { timeout: 5_000 });
  assert.equal(await admin.locator("#layersList [data-layer-id]").count(), 3, "Undo restores the deleted Beacon");
  record("inspector_delete_undo", { dialogs, layersAfterDeleteAndUndo: await admin.locator("#layersList [data-layer-id]").count() });

  const draftResponseWait = admin.waitForResponse((response) => response.request().method() === "POST" && response.url().includes(versionsPath));
  await admin.locator("#saveDraftBtn").click();
  await admin.getByText(/Draft gespeichert|als Draft gespeichert|Layout-Draft gespeichert/i).waitFor({ timeout: 10_000 });
  const draftResponse = await draftResponseWait;
  assert.equal(draftResponse.status(), 200, `legacy draft POST HTTP ${draftResponse.status()}`);
  const saveReceipt = await draftResponse.json();
  assert.ok(saveReceipt.layoutId, "legacy Store save returns a draft version ID");
  const draft = ok(await api(admin, "GET", `${versionsPath}/${saveReceipt.layoutId}`), "legacy Beacon draft API readback");
  assert.equal(draft.status, "DRAFT", "legacy save remains a private draft");
  const savedBeacons = draft.layout.elements.filter((item) => item.type === "beacon");
  assert.equal(savedBeacons.length, 2, "private draft contains two Beacon placements after undo");
  const savedPlaced = savedBeacons.find((item) => item.beaconId === placedBeacon.beaconCode);
  const savedDuplicate = savedBeacons.find((item) => item.beaconId === otherBeacon.beaconCode);
  assert.ok(savedPlaced && savedDuplicate, "legacy draft preserves both distinct Beacon assignments");
  assert.equal(savedPlaced.x, 11);
  assert.equal(savedPlaced.y, 12);
  for (const [saved, expected] of [[savedPlaced, placedBeacon], [savedDuplicate, otherBeacon]]) {
    assert.equal(saved.beaconDbId, expected.id);
    assert.equal(saved.uuid, expected.uuid);
    assert.equal(saved.major, expected.major);
    assert.equal(saved.minor, expected.minor);
    assert.equal(saved.identityKey, expected.identityKey);
  }
  record("private_draft_api_readback", {
    layoutId: draft.layoutId,
    status: draft.status,
    beacons: savedBeacons.map((item) => ({ beaconId: item.beaconId, beaconDbId: item.beaconDbId, uuid: item.uuid, major: item.major, minor: item.minor, identityKey: item.identityKey, x: item.x, y: item.y })),
  });

  const mobileAfter = await anonymousCurrent(store.id);
  assert.deepEqual(mobileAfter, mobileBefore, "anonymous current remains unchanged after legacy draft save");
  record("anonymous_current_unchanged", { beforeLayoutId: mobileBefore.layoutId, afterLayoutId: mobileAfter.layoutId, unchanged: JSON.stringify(mobileAfter) === JSON.stringify(mobileBefore) });
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = error instanceof Error ? error.message : String(error);
} finally {
  if (admin) {
    for (const beacon of [...beacons].reverse()) {
      try {
        const release = await api(admin, "POST", `/api/beacons/${beacon.id}/release`, {});
        const archive = await api(admin, "PATCH", `/api/beacons/${beacon.id}/archive`, {});
        evidence.cleanup.beacons.push({ id: beacon.id, releaseHttp: release.status, archiveHttp: archive.status });
        if (release.status !== 200 || archive.status !== 200) {
          evidence.result = "FAIL";
          evidence.cleanupError ||= `Beacon ${beacon.id} cleanup: release HTTP ${release.status}, archive HTTP ${archive.status}`;
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
        if (result.status !== 200) { evidence.result = "FAIL"; evidence.cleanupError ||= `Store archive HTTP ${result.status}`; }
      } catch (error) { evidence.result = "FAIL"; evidence.cleanupError ||= error instanceof Error ? error.message : String(error); }
    }
    if (region) {
      try {
        const result = await api(admin, "PATCH", `/api/regions/${region.id}/archive`, {});
        evidence.cleanup.region = { id: region.id, http: result.status };
        if (result.status !== 200) { evidence.result = "FAIL"; evidence.cleanupError ||= `Region archive HTTP ${result.status}`; }
      } catch (error) { evidence.result = "FAIL"; evidence.cleanupError ||= error instanceof Error ? error.message : String(error); }
    }
    await admin.close().catch(() => {});
  }
  await browser.close().catch(() => {});
  console.log(JSON.stringify(evidence));
  if (evidence.result !== "PASS") process.exitCode = 1;
}
