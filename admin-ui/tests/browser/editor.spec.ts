import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { LayoutDocument } from "../../src/editor/model";

const layout = JSON.parse(readFileSync(new URL("../../src/editor/fixtures/store-layout.json", import.meta.url), "utf8")) as LayoutDocument;
const assignedBeacons = [{ beaconCode: "IN-001", beaconId: "beacon-db-1", identityKey: "123e4567-e89b-12d3-a456-426614174000:1:2", uuid: "123e4567-e89b-12d3-a456-426614174000", major: 1, minor: 2 }];

async function mockEditor(page: Page, status: "ACTIVE" | "DRAFT", saved: LayoutDocument[]) {
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", email: null, role: "admin", scope: null } }));
  await page.route("**/api/stores/store-1/layout/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith("/editor-context")) return route.fulfill({ json: { store: { id: "store-1", storeCode: "LINZ-1", name: "Indooro Testfiliale" }, currentLayout: { layoutId: "current-1", versionNo: 1, status, layout }, assignedBeacons } });
    if (path.endsWith("/versions") && route.request().method() === "GET") return route.fulfill({ json: [{ layoutId: "current-1", versionNo: 1, status, layoutName: "Indooro Testfiliale" }] });
    if (path.endsWith("/versions") && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as { activate: boolean; layout: LayoutDocument };
      expect(payload.activate).toBe(false);
      saved.push(payload.layout);
      return route.fulfill({ json: { layoutId: `draft-${saved.length}`, versionNo: saved.length + 1, status: "DRAFT", layoutName: "Indooro Testfiliale", layout: payload.layout } });
    }
    if (path.endsWith("/activate")) return route.fulfill({ json: { layoutId: `draft-${saved.length}`, versionNo: saved.length + 1, status: "ACTIVE", layout: saved.at(-1) } });
    return route.fulfill({ status: 404, json: { message: "Unexpected editor route" } });
  });
}

test("store editor edits metadata, undoes a move and publishes only the saved draft", async ({ page }) => {
  const saved: LayoutDocument[] = [];
  await mockEditor(page, "ACTIVE", saved);
  const activated: string[] = [];
  page.on("request", (request) => { if (request.url().endsWith("/activate")) activated.push(request.url()); });
  await page.goto("/admin/next/editor/?storeId=store-1");
  await expect(page.getByRole("heading", { name: "Indooro Testfiliale" })).toBeVisible();
  await page.locator(".le-layers button").filter({ hasText: "Obst & Gemüse" }).click();
  const handleStroke = await page.locator(".le-handle").first().evaluate((handle) => parseFloat(getComputedStyle(handle).strokeWidth));
  expect(handleStroke).toBeLessThan(0.5);
  await expect(page.getByLabel("Kategoriecode")).toHaveValue("310");
  await expect(page.getByLabel("Abschnitt")).toHaveValue("1");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel("X", { exact: true })).toHaveValue("10");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByLabel("X", { exact: true })).toHaveValue("9");
  await page.getByLabel("Bezeichnung").fill("Frisches Obst");
  await expect(page.getByText("Ungespeicherte Änderungen")).toBeVisible();
  await page.getByRole("button", { name: "Entwurf speichern" }).click();
  await expect(page.getByText("Entwurf gespeichert.")).toBeVisible();
  expect(saved).toHaveLength(1);
  expect(saved[0].elements[1].label).toBe("Frisches Obst");
  expect(saved[0].elements[1].category).toBe("310/1");
  expect(saved[0].elements[1].meter).toBe(1);
  expect(saved[0].elements[2].identityKey).toBe(layout.elements[2].identityKey);
  expect(saved[0].navigationMetadata).toEqual(layout.navigationMetadata);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Veröffentlichen" }).click();
  await expect(page.getByText("Layout veröffentlicht.")).toBeVisible();
  expect(activated).toHaveLength(1);
});

test("store editor links an unassigned beacon error and blocks publishing after saving", async ({ page }) => {
  const saved: LayoutDocument[] = [];
  await mockEditor(page, "DRAFT", saved);
  await page.goto("/admin/next/editor/?storeId=store-1");
  await page.locator(".le-layers button").filter({ hasText: "Beacon" }).click();
  await page.getByRole("button", { name: "Duplizieren" }).click();
  await expect(page.locator(".le-validation")).toContainText("keinem Beacon zugeordnet");
  await expect(page.getByRole("option", { name: /IN-001.*bereits platziert/ })).toHaveAttribute("disabled", "");
  await page.getByRole("button", { name: "Entwurf speichern" }).click();
  await expect(page.getByText("Entwurf gespeichert.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Veröffentlichen" })).toBeDisabled();
  expect(saved[0].elements).toHaveLength(4);
});

test("shelf inspector persists routing metadata and confirms critical deletion", async ({ page }) => {
  const saved: LayoutDocument[] = [];
  await mockEditor(page, "DRAFT", saved);
  await page.goto("/admin/next/editor/?storeId=store-1");
  await page.locator(".le-layers button").filter({ hasText: "Obst & Gemüse" }).click();
  await expect(page.getByText("Elementtyp: Regal")).toBeVisible();
  await page.getByLabel("Zugriffswinkel").fill("135");
  await page.getByLabel("Layout-Code").fill("310/1/1/1");
  await page.getByLabel("Produktposition hinzufügen").fill("310-43");
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(page.getByText("310-43", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Entwurf speichern" }).click();
  await expect(page.locator(".le-message")).toContainText("Entwurf gespeichert");
  expect(saved.at(-1)?.elements[1]).toMatchObject({ accessAngle: 135, layoutCode: "310/1/1/1", productPositions: ["310-42", "310-43"] });

  await page.getByLabel("Layout-Code").fill("310/1");
  await expect(page.locator(".le-validation")).toContainText("Layout-Code im Format");
  await expect(page.getByRole("button", { name: "Veröffentlichen" })).toBeDisabled();
  await page.getByLabel("Layout-Code").fill("310/1/1/1");
  await page.getByRole("button", { name: "Produktposition 310-43 entfernen" }).click();
  await expect(page.getByText("310-43", { exact: true })).toHaveCount(0);

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Löschen", exact: true }).click();
  await expect(page.locator(".le-layers button").filter({ hasText: "Obst & Gemüse" })).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Löschen", exact: true }).click();
  await expect(page.locator(".le-layers button").filter({ hasText: "Obst & Gemüse" })).toHaveCount(0);
});

test("legacy cashier deletion is confirmed and publication names remaining warnings", async ({ page }) => {
  const saved: LayoutDocument[] = [];
  await mockEditor(page, "DRAFT", saved);
  await page.goto("/admin/next/editor/?storeId=store-1");
  const imported: LayoutDocument = structuredClone(layout);
  imported.elements[1].category = "";
  imported.elements.push({ id: "legacy-cashier", type: "cashier", x: 20, y: 20, width: 3, height: 2, label: "Zusatzkasse" });
  await page.locator(".le-file-input").setInputFiles({ name: "legacy.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(imported)) });
  await page.locator(".le-layers button").filter({ hasText: "Zusatzkasse" }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Löschen", exact: true }).click();
  await expect(page.locator(".le-layers button").filter({ hasText: "Zusatzkasse" })).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Löschen", exact: true }).click();
  await page.getByRole("button", { name: "Entwurf speichern" }).click();
  await expect(page.locator(".le-message")).toContainText("Entwurf gespeichert");
  page.once("dialog", (dialog) => { expect(dialog.message()).toContain("hat keine Kategorie oder Layoutkennung"); return dialog.dismiss(); });
  await page.getByRole("button", { name: "Veröffentlichen" }).click();
});

test("mobile editor keeps the canvas in the first viewport and exposes compact placement controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockEditor(page, "DRAFT", []);
  await page.goto("/admin/next/editor/?storeId=store-1");

  const canvas = page.getByRole("img", { name: "Interaktiver Grundriss" });
  await expect(canvas).toBeVisible();
  expect((await canvas.boundingBox())?.y).toBeLessThan(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const typeChooser = page.getByRole("combobox", { name: "Elementtyp" });
  await typeChooser.selectOption("shelf");
  await expect(canvas).toHaveClass(/le-tool-create/);
  await expect(page.locator(".le-canvas-footer")).toContainText("Regal platzieren");
  await expect(page.getByRole("button", { name: "Auswählen", exact: true }).first()).toHaveAttribute("aria-pressed", "false");
});

test("desktop editor keeps its palette controls and hides mobile controls", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockEditor(page, "DRAFT", []);
  await page.goto("/admin/next/editor/?storeId=store-1");
  await expect(page.locator(".le-left .le-library")).toBeVisible();
  await expect(page.locator(".le-mobile-controls")).toBeHidden();
  await expect(page.locator(".le-left .le-tool-row button", { hasText: "Verschieben" })).toBeVisible();
});

test("keyboard can place an element inside the grid and move the selected element", async ({ page }) => {
  await mockEditor(page, "DRAFT", []);
  await page.goto("/admin/next/editor/?storeId=store-1");
  const canvas = page.getByRole("img", { name: "Interaktiver Grundriss" });
  await page.getByRole("button", { name: "Theke" }).click();
  await expect(page.locator(".le-canvas-footer")).toContainText("Theke platzieren");
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  const layer = page.locator(".le-layers button").filter({ hasText: "Theke" });
  await expect(layer).toHaveAttribute("aria-current", "true");
  const x = page.getByLabel("X", { exact: true });
  const y = page.getByLabel("Y", { exact: true });
  const placedX = Number(await x.inputValue());
  const placedY = Number(await y.inputValue());
  expect(placedX).toBeGreaterThanOrEqual(0);
  expect(placedY).toBeGreaterThanOrEqual(0);
  expect(placedX + 4).toBeLessThanOrEqual(layout.gridSize.width);
  expect(placedY + 2).toBeLessThanOrEqual(layout.gridSize.height);

  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await expect(x).toHaveValue(String(placedX + 1));
});

test("pointer gestures move, resize, rotate and undo a shelf without losing metadata", async ({ page }) => {
  await mockEditor(page, "DRAFT", []);
  await page.goto("/admin/next/editor/?storeId=store-1");
  await page.locator(".le-layers button").filter({ hasText: "Obst & Gemüse" }).click();
  const shelf = page.locator('.le-canvas rect[stroke="#123f40"]');
  const start = await shelf.boundingBox();
  expect(start).not.toBeNull();
  const unit = start!.width / 4;
  await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2);
  await page.mouse.down();
  await page.mouse.move(start!.x + start!.width / 2 + unit * 2, start!.y + start!.height / 2 + unit, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByLabel("X", { exact: true })).toHaveValue("11");
  await expect(page.getByLabel("Y", { exact: true })).toHaveValue("9");

  const resize = await page.locator(".le-handle:not(.le-rotate)").boundingBox();
  expect(resize).not.toBeNull();
  await page.mouse.move(resize!.x + resize!.width / 2, resize!.y + resize!.height / 2);
  await page.mouse.down();
  await page.mouse.move(resize!.x + resize!.width / 2 + unit * 2, resize!.y + resize!.height / 2 + unit, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByLabel("Breite", { exact: true })).toHaveValue("6");
  await expect(page.getByLabel("Höhe", { exact: true })).toHaveValue("9");

  const rotatedShelf = await shelf.boundingBox();
  const rotate = await page.locator(".le-handle.le-rotate").boundingBox();
  expect(rotatedShelf).not.toBeNull();
  expect(rotate).not.toBeNull();
  await page.mouse.move(rotate!.x + rotate!.width / 2, rotate!.y + rotate!.height / 2);
  await page.mouse.down();
  await page.mouse.move(rotatedShelf!.x + rotatedShelf!.width / 2 + 18, rotatedShelf!.y + rotatedShelf!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByLabel("Winkel", { exact: true })).toHaveValue("90");
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(page.getByLabel("Winkel", { exact: true })).toHaveValue("0");
  await expect(page.getByLabel("Kategoriecode")).toHaveValue("310");
});

test("JSON import validates, remains undoable, and export downloads the current document without saving", async ({ page }) => {
  const saved: LayoutDocument[] = [];
  await mockEditor(page, "DRAFT", saved);
  await page.goto("/admin/next/editor/?storeId=store-1");
  const file = page.locator(".le-file-input");
  await file.setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from('{"shopName":"broken"}') });
  await expect(page.getByRole("status")).toContainText("Import fehlgeschlagen");
  await expect(page.locator(".le-save-indicator")).toContainText("Gespeichert");

  const imported = { ...layout, shopName: "Importierte Filiale", navigationMetadata: { source: "fixture" } };
  await file.setInputFiles({ name: "layout.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(imported)) });
  await expect(page.getByRole("heading", { name: "Indooro Testfiliale" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Grundriss importiert");
  await expect(page.getByText("Ungespeicherte Änderungen")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON exportieren" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Importierte_Filiale_layout.json");
  const exported = JSON.parse(readFileSync(await download.path(), "utf8")) as LayoutDocument;
  expect(exported.shopName).toBe("Importierte Filiale");
  expect(exported.navigationMetadata).toEqual({ source: "fixture" });
  expect(saved).toHaveLength(0);
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(page.getByText("Ungespeicherte Änderungen")).toHaveCount(0);
  await file.setInputFiles({ name: "layout.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(imported)) });
  await page.getByRole("button", { name: "Entwurf speichern" }).click();
  await expect(page.getByRole("status")).toContainText("Entwurf gespeichert");
  expect(saved[0].navigationMetadata).toEqual({ source: "fixture" });
});

test("new layout confirms before clearing elements and remains undoable", async ({ page }) => {
  const saved: LayoutDocument[] = [];
  await mockEditor(page, "ACTIVE", saved);
  await page.goto("/admin/next/editor/?storeId=store-1");
  const layers = page.locator(".le-layers button");
  await expect(layers).toHaveCount(layout.elements.length);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Neues Layout" }).click();
  await expect(layers).toHaveCount(layout.elements.length);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Neues Layout" }).click();
  await expect(page.getByText("Noch keine Elemente")).toBeVisible();
  await expect(page.getByText("Ungespeicherte Änderungen")).toBeVisible();
  expect(saved).toHaveLength(0);
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(layers).toHaveCount(layout.elements.length);
  await expect(page.getByText("Ungespeicherte Änderungen")).toHaveCount(0);
});
