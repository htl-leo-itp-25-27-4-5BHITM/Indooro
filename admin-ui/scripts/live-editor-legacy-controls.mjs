import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Exercise the legacy Store editor using real browser input on disposable data.
// This script never opens the global editor and never publishes a layout.
const base = process.env.ADMIN_SMOKE_BASE_URL || "http://localhost:8080";
assert.ok(["localhost", "127.0.0.1", "host.docker.internal"].includes(new URL(base).hostname), "legacy control probe permits local hosts only");
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8").replace(/\$\{(\w+)\}/g, (match, name) => process.env[name] ?? match));
const [adminUser] = realm.users;
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP localhost 127.0.0.1,MAP host.docker.internal 127.0.0.1"] : [] });
let admin = null;
let region = null;
let store = null;
const evidence = {
  result: "PASS",
  scope: "local packaged stack; disposable Store/Region; legacy Store editor UI and scoped API only",
  fixtureIds: {},
  actions: {},
  cleanup: { storeArchived: false, regionArchived: false, storeHttp: null, regionHttp: null },
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
  assert.equal(response.status, 200, `${label}: HTTP ${response.status} ${JSON.stringify(response.body).slice(0, 240)}`);
  return response.body;
}

function check(name, observed) {
  evidence.actions[name] = { result: "PASS", observed };
}

const fixtureLayout = (name) => ({
  shopName: name,
  gridSize: { width: 20, height: 20 },
  elements: [
    { id: 1, type: "entrance", x: 1, y: 0, width: 3, height: 1, label: "Eingang" },
    { id: 2, type: "shelf", x: 5, y: 5, width: 3, height: 2, category: "310/1", meter: 1, label: "Probe-Regal" },
  ],
});

try {
  admin = await login(adminUser);
  assert.equal(ok(await api(admin, "GET", "/api/admin/me"), "admin identity").role, "admin");
  const stamp = randomUUID().slice(0, 8).toUpperCase();
  region = ok(await api(admin, "POST", "/api/regions", { code: `LC-${stamp}`, name: `Legacy Controls ${stamp}` }), "create disposable Region");
  store = ok(await api(admin, "POST", "/api/stores", {
    regionId: region.id, storeCode: `LC-${stamp}`, name: `Legacy Controls ${stamp}`,
    street: "Testgasse 1", zipCode: "4020", city: "Linz", country: "AT",
  }), "create disposable Store");
  evidence.fixtureIds = { regionId: region.id, storeId: store.id, regionCode: region.code, storeCode: store.storeCode };
  const versionsPath = `/api/stores/${store.id}/layout/versions`;
  const initial = ok(await api(admin, "POST", versionsPath, { layoutName: `Legacy controls ${stamp}`, activate: true, layout: fixtureLayout(`Legacy controls ${stamp}`) }), "seed disposable active layout");
  const mobileBeforeResponse = await fetch(`${base}/api/mobile/stores/${store.id}/layout/current`);
  assert.equal(mobileBeforeResponse.status, 200);
  const mobileBefore = await mobileBeforeResponse.json();
  assert.equal(mobileBefore.layoutId, initial.layoutId);

  await admin.goto(`${base}/admin/editor/?storeId=${store.id}&layoutId=${initial.layoutId}&legacy=1`, { waitUntil: "domcontentloaded" });
  await admin.locator("#shopName").waitFor();
  const modeButtons = [
    ["select", "#toolSelect", "Auswahlmodus"], ["move", "#toolMove", "Verschieben"],
    ["draw", "#toolDraw", "Zeichnen/Add"], ["edit", "#toolEdit", "Inspector Edit"], ["delete", "#toolDelete", "Loeschmodus"],
  ];
  for (const [key, selector, label] of modeButtons) {
    await admin.locator(selector).click();
    assert.equal(await admin.locator("#modeLabel").innerText(), label, `${key} mode label`);
    assert.equal(await admin.locator(selector).evaluate((el) => el.classList.contains("active")), true, `${key} active button`);
    check(`mode_${key}`, { modeLabel: label, activeButton: selector });
  }

  await admin.locator("#toolSelect").click();
  const shelfLayer = admin.locator('#layersList [data-layer-id="2"]');
  await shelfLayer.click();
  assert.equal(await admin.locator("#propLabel").inputValue(), "Probe-Regal");
  check("select_layer", { selectedLayerId: await shelfLayer.getAttribute("data-layer-id"), label: await admin.locator("#propLabel").inputValue() });

  await admin.locator("#toolEdit").click();
  await admin.locator("#propLabel").fill(`Edited ${stamp}`);
  const labelAfterInput = await admin.locator("#propLabel").inputValue();
  assert.equal(labelAfterInput, `Edited ${stamp}`);
  const categoryButtons = admin.locator("#categoriesList button");
  assert.ok(await categoryButtons.count(), "legacy category controls are rendered");
  await categoryButtons.first().click();
  const categoryLabel = await admin.locator("#propLabel").inputValue();
  assert.notEqual(categoryLabel, `Edited ${stamp}`, "category action updates the legacy label");
  check("inspector_category", { typedLabel: labelAfterInput, categoryLabel, categoryButtonCount: await categoryButtons.count() });

  await admin.locator("#rotateBtn").click();
  const rotated = { width: Number(await admin.locator("#propW").inputValue()), height: Number(await admin.locator("#propH").inputValue()) };
  assert.deepEqual(rotated, { width: 2, height: 3 }, "legacy 90 degree inspector action swaps dimensions");
  check("inspector_rotate_90", rotated);

  await admin.getByTitle("Duplizieren").click();
  assert.equal(await admin.locator("#countElements").innerText(), "3");
  const duplicateLayerCount = await admin.locator("#layersList [data-layer-id]").count();
  assert.equal(duplicateLayerCount, 3);
  check("inspector_duplicate", { layerCount: duplicateLayerCount, countLabel: await admin.locator("#countElements").innerText() });

  const dialogs = [];
  admin.on("dialog", async (dialog) => { dialogs.push(dialog.message()); await dialog.accept(); });
  await admin.locator("#toolDelete").click();
  // The duplicate is selected by the legacy duplicate handler. Click its rendered canvas node in Delete mode.
  const selectedId = await admin.locator("#layersList [data-layer-id].active").getAttribute("data-layer-id");
  assert.ok(selectedId, "legacy duplicate remains selected in the layer list");
  const selectedCanvasElement = admin.locator(`#canvasContainer [data-id="${selectedId}"]`);
  const selectedBox = await selectedCanvasElement.boundingBox();
  assert.ok(selectedBox, "selected duplicate is visible on the canvas");
  const deletePoint = { x: selectedBox.x + Math.min(12, selectedBox.width / 4), y: selectedBox.y + selectedBox.height * 0.75 };
  const hitTarget = await admin.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-id]")?.getAttribute("data-id") ?? null, deletePoint);
  assert.equal(hitTarget, selectedId, "chosen pointer location hits the selected canvas element");
  await admin.mouse.click(deletePoint.x, deletePoint.y);
  await admin.waitForFunction(() => document.querySelectorAll("#layersList [data-layer-id]").length === 2, null, { timeout: 5_000 });
  assert.ok(dialogs.some((message) => message.includes("wirklich entfernen")), "legacy canvas delete requested confirmation");
  check("mode_delete_element", { dialogs, remainingLayerCount: await admin.locator("#layersList [data-layer-id]").count(), deletedLayerId: selectedId });

  await admin.keyboard.press("Control+z");
  await admin.waitForFunction(() => document.querySelectorAll("#layersList [data-layer-id]").length === 3);
  const afterUndo = await admin.locator("#layersList [data-layer-id]").count();
  assert.equal(afterUndo, 3);
  await admin.keyboard.press("Control+y");
  await admin.waitForFunction(() => document.querySelectorAll("#layersList [data-layer-id]").length === 2);
  const afterRedo = await admin.locator("#layersList [data-layer-id]").count();
  assert.equal(afterRedo, 2);
  check("undo_redo", { afterUndo, afterRedo });

  await admin.locator("#toolDraw").click();
  await admin.getByRole("button", { name: /Regal/ }).click();
  const stage = admin.locator("#canvasContainer");
  await stage.scrollIntoViewIfNeeded();
  const box = await stage.boundingBox();
  assert.ok(box, "legacy canvas stage is visible");
  const drawStart = { x: box.x + 10 * 20 + 5, y: box.y + 8 * 20 + 5 };
  const drawHit = await admin.evaluate(({ x, y }) => ({
    target: document.elementFromPoint(x, y)?.id || document.elementFromPoint(x, y)?.className || null,
    viewport: { width: innerWidth, height: innerHeight },
  }), drawStart);
  await admin.mouse.move(drawStart.x, drawStart.y);
  await admin.mouse.down();
  await admin.mouse.move(drawStart.x + 40, drawStart.y + 40, { steps: 3 });
  await admin.mouse.up();
  const afterDraw = await admin.locator("#layersList [data-layer-id]").count();
  evidence.actions.draw_add = { result: afterDraw === 3 ? "PASS" : "FAIL", observed: { layerCount: afterDraw, modeLabel: await admin.locator("#modeLabel").innerText(), drawHit } };
  assert.equal(afterDraw, 3);

  await admin.locator("#toolMove").click();
  const moveTarget = admin.locator('#canvasContainer [data-id="1"]');
  const beforeMove = await moveTarget.evaluate((el) => ({ left: el.style.left, top: el.style.top }));
  const moveBox = await moveTarget.boundingBox();
  assert.ok(moveBox, "entrance element is visible for move gesture");
  await admin.mouse.move(moveBox.x + 12, moveBox.y + 12);
  await admin.mouse.down();
  await admin.mouse.move(moveBox.x + 52, moveBox.y + 52, { steps: 4 });
  await admin.mouse.up();
  const afterMoveNode = admin.locator('#canvasContainer [data-id="1"]');
  const afterMove = await afterMoveNode.evaluate((el) => ({ left: el.style.left, top: el.style.top }));
  assert.notDeepEqual(afterMove, beforeMove, "legacy Move pointer gesture changes the canvas element position");
  check("move_pointer", { beforeMove, afterMove });

  const zoomBefore = await admin.locator("#zoomLabel").innerText();
  await admin.locator("#zoomIn").click();
  const zoomAfter = await admin.locator("#zoomLabel").innerText();
  assert.notEqual(zoomAfter, zoomBefore);
  const gridBefore = await admin.locator("#showGrid").isChecked();
  await admin.locator("#showGrid").uncheck();
  const gridAfter = await admin.locator("#showGrid").isChecked();
  assert.equal(gridAfter, false);
  await admin.locator("#showGrid").check();
  check("grid_zoom", { zoomBefore, zoomAfter, gridBefore, gridAfter, gridRestored: await admin.locator("#showGrid").isChecked() });

  await admin.locator("#gridWidth").fill("22");
  await admin.locator("#gridWidth").dispatchEvent("change");
  assert.equal(await admin.locator("#areaSize").innerText(), "22");
  await admin.locator("#validateBtn").click();
  const validationText = (await admin.locator("#validationPanel").innerText()).trim();
  assert.match(validationText, /Warnung/, "legacy explicit Validate shows a warning for an uncategorized element");
  check("grid_validation", { gridWidth: await admin.locator("#gridWidth").inputValue(), areaWidth: await admin.locator("#areaSize").innerText(), validationText });

  const draftResponseWait = admin.waitForResponse((response) => response.request().method() === "POST" && response.url().includes(versionsPath));
  await admin.locator("#saveDraftBtn").click();
  await admin.getByText(/Draft gespeichert|als Draft gespeichert|Layout-Draft gespeichert/i).waitFor({ timeout: 10_000 });
  const draftResponse = await draftResponseWait;
  assert.equal(draftResponse.status(), 200, `legacy draft POST status: ${draftResponse.status()}`);
  const saveReceipt = await draftResponse.json();
  const savedLayoutId = saveReceipt.layoutId;
  assert.ok(savedLayoutId, "legacy Store save response contains a layout version ID");
  const saved = ok(await api(admin, "GET", `${versionsPath}/${savedLayoutId}`), "legacy draft API readback");
  assert.equal(saved.status, "DRAFT", "legacy save action creates private draft status");
  assert.equal(saved.layout.gridSize.width, 22);
  assert.ok(saved.layout.elements.length >= 3);
  const savedShelf = saved.layout.elements.find((element) => element.type === "shelf" && element.label === categoryLabel);
  assert.ok(savedShelf, "category, rotation, and label state is represented in scoped draft API");
  assert.deepEqual([savedShelf.width, savedShelf.height], [2, 3], "legacy 90 degree Inspector action persists swapped dimensions");
  const mobileAfterResponse = await fetch(`${base}/api/mobile/stores/${store.id}/layout/current`);
  assert.equal(mobileAfterResponse.status, 200);
  assert.deepEqual(await mobileAfterResponse.json(), mobileBefore, "legacy draft leaves anonymous current layout unchanged");
  check("draft_api_readback", {
    status: saved.status,
    gridWidth: saved.layout.gridSize.width,
    elementCount: saved.layout.elements.length,
    shelf: { label: savedShelf.label, category: savedShelf.category, width: savedShelf.width, height: savedShelf.height },
  });
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = error instanceof Error ? error.message : String(error);
} finally {
  if (admin && store) {
    try {
      const response = await api(admin, "PATCH", `/api/stores/${store.id}/archive`, {});
      evidence.cleanup.storeHttp = response.status;
      evidence.cleanup.storeArchived = response.status === 200;
      if (!evidence.cleanup.storeArchived) { evidence.result = "FAIL"; evidence.cleanupError = `Store archive HTTP ${response.status}`; }
    } catch (error) { evidence.result = "FAIL"; evidence.cleanupError = error instanceof Error ? error.message : String(error); }
  }
  if (admin && region) {
    try {
      const response = await api(admin, "PATCH", `/api/regions/${region.id}/archive`, {});
      evidence.cleanup.regionHttp = response.status;
      evidence.cleanup.regionArchived = response.status === 200;
      if (!evidence.cleanup.regionArchived) { evidence.result = "FAIL"; evidence.cleanupError ||= `Region archive HTTP ${response.status}`; }
    } catch (error) { evidence.result = "FAIL"; evidence.cleanupError ||= error instanceof Error ? error.message : String(error); }
  }
  if (admin) await admin.close().catch(() => {});
  await browser.close().catch(() => {});
  console.log(JSON.stringify(evidence));
  if (evidence.result !== "PASS") process.exitCode = 1;
}
