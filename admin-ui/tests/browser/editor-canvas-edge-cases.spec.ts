import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { LayoutDocument } from "../../src/editor/model";

const fixture = JSON.parse(readFileSync(new URL("../../src/editor/fixtures/store-layout.json", import.meta.url), "utf8")) as LayoutDocument;
const placedBeacon = { beaconCode: "IN-001", beaconId: "beacon-db-1", identityKey: "123e4567-e89b-12d3-a456-426614174000:1:2", uuid: "123e4567-e89b-12d3-a456-426614174000", major: 1, minor: 2 };
const freeBeacon = { beaconCode: "IN-002", beaconId: "beacon-db-2", identityKey: "123e4567-e89b-12d3-a456-426614174000:1:3", uuid: "123e4567-e89b-12d3-a456-426614174000", major: 1, minor: 3 };

interface EditorOptions {
  status?: "ACTIVE" | "DRAFT";
  saved?: LayoutDocument[];
  assignedBeacons?: unknown[];
}

async function mockEditor(page: Page, { status = "DRAFT", saved = [], assignedBeacons = [placedBeacon] }: EditorOptions = {}) {
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", email: null, role: "admin", scope: null } }));
  await page.route("**/api/categories?*", (route) => route.fulfill({ json: [{ categoryCode: 310, categoryName: "Obst & Gemüse" }, { categoryCode: 525, categoryName: "Molkerei" }] }));
  await page.route("**/api/stores/store-1/layout/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/editor-context")) {
      return route.fulfill({ json: {
        store: { id: "store-1", storeCode: "LINZ-1", name: "Indooro Testfiliale" },
        currentLayout: { layoutId: "current-1", versionNo: 1, status, layout: structuredClone(fixture) },
        assignedBeacons,
      } });
    }
    if (path.endsWith("/versions") && route.request().method() === "GET") {
      return route.fulfill({ json: [{ layoutId: "current-1", versionNo: 1, status, layoutName: "Indooro Testfiliale" }] });
    }
    if (path.endsWith("/versions") && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as { activate: boolean; layout: LayoutDocument };
      expect(payload.activate).toBe(false);
      saved.push(payload.layout);
      return route.fulfill({ json: { layoutId: `draft-${saved.length}`, versionNo: saved.length + 1, status: "DRAFT", layoutName: "Indooro Testfiliale", layout: payload.layout } });
    }
    return route.fulfill({ status: 404, json: { message: "Unexpected editor route" } });
  });
}

async function openEditor(page: Page, options: EditorOptions = {}) {
  await mockEditor(page, options);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/next/editor/?storeId=store-1");
  await expect(page.getByRole("heading", { name: "Layout Editor" })).toBeVisible();
  await expect(canvas(page)).toBeVisible();
}

const canvas = (page: Page) => page.getByRole("group", { name: "Interaktiver Grundriss" });
const layer = (page: Page, text: string) => page.locator(".le-layers button").filter({ hasText: text });
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });

/** Screen position of a world point, derived from the grid background rect (world width = 40 units in the fixture). */
async function worldToPage(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const grid = await page.locator(".le-canvas > g > rect").first().boundingBox();
  expect(grid).not.toBeNull();
  const scale = grid!.width / fixture.gridSize.width;
  return { x: grid!.x + x * scale, y: grid!.y + y * scale };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

async function clickWorld(page: Page, x: number, y: number) {
  const point = await worldToPage(page, x, y);
  await page.mouse.click(point.x, point.y);
}

async function scaleValue(page: Page): Promise<number> {
  const text = await page.locator(".le-canvas-toolbar > span").nth(1).textContent();
  return Number.parseFloat(text ?? "");
}

test("dragging a shelf from the lower right to the upper left creates it at the minimum corner", async ({ page }) => {
  await openEditor(page);
  await page.getByRole("button", { name: "Regal", exact: true }).click();
  await drag(page, await worldToPage(page, 30, 40), await worldToPage(page, 24, 34));
  await expect(field(page, "X")).toHaveValue("24");
  await expect(field(page, "Y")).toHaveValue("34");
  await expect(field(page, "Breite")).toHaveValue("6");
  await expect(field(page, "Höhe")).toHaveValue("6");
  await expect(page.locator(".le-layers button")).toHaveCount(fixture.elements.length + 1);
});

test("a single click places a shelf at its default size and a beacon as a point", async ({ page }) => {
  await openEditor(page, { assignedBeacons: [placedBeacon, freeBeacon] });
  await page.getByRole("button", { name: "Regal", exact: true }).click();
  await clickWorld(page, 20, 45);
  await expect(field(page, "Breite")).toHaveValue("4");
  await expect(field(page, "Höhe")).toHaveValue("2");
  await expect(field(page, "X")).toHaveValue("18");
  await expect(field(page, "Y")).toHaveValue("44");

  await page.getByRole("button", { name: "Beacon", exact: true }).click();
  await clickWorld(page, 20, 25);
  await expect(page.getByLabel("Zugeordneter Beacon")).toHaveValue("IN-002");
  await expect(field(page, "X")).toHaveValue("20");
  await expect(field(page, "Y")).toHaveValue("25");
  await expect(page.getByRole("spinbutton", { name: "Breite", exact: true })).toHaveCount(0);
  await expect(page.getByRole("spinbutton", { name: "Höhe", exact: true })).toHaveCount(0);
  await expect(page.locator(".le-layers button")).toHaveCount(fixture.elements.length + 2);
});

test("dragging a shelf past the grid edges keeps X and Y inside the grid", async ({ page }) => {
  await openEditor(page);
  await layer(page, "Obst & Gemüse").click();
  const svg = (await canvas(page).boundingBox())!;

  // Beyond the bottom right corner: still inside the SVG padding, outside the grid.
  await drag(page, await worldToPage(page, 11, 12), { x: svg.x + svg.width - 4, y: svg.y + svg.height - 4 });
  await expect(field(page, "X")).toHaveValue("36");
  await expect(field(page, "Y")).toHaveValue("52");

  // Beyond the top left corner.
  await drag(page, await worldToPage(page, 38, 56), { x: svg.x + 4, y: svg.y + 4 });
  await expect(field(page, "X")).toHaveValue("0");
  await expect(field(page, "Y")).toHaveValue("0");
});

test("a locked shelf does not move under a pointer drag but stays selectable", async ({ page }) => {
  await openEditor(page);
  const shelfLayer = layer(page, "Obst & Gemüse");
  await shelfLayer.click();
  await page.getByRole("checkbox", { name: "Gesperrt" }).check();
  await clickWorld(page, 30, 50);
  await expect(shelfLayer).not.toHaveAttribute("aria-current", "true");

  const center = await worldToPage(page, 11, 12);
  await drag(page, center, { x: center.x + 80, y: center.y + 40 });
  await expect(shelfLayer).toHaveAttribute("aria-current", "true");
  await expect(field(page, "X")).toHaveValue("9");
  await expect(field(page, "Y")).toHaveValue("8");
  await expect(field(page, "X")).toBeDisabled();
});

test("snapping rounds a pointer move to whole units, and turning it off keeps decimals", async ({ page }) => {
  await openEditor(page);
  await layer(page, "Obst & Gemüse").click();
  const x = field(page, "X");
  await drag(page, await worldToPage(page, 11, 12), await worldToPage(page, 12.3, 12));
  // 9 + 1.3 = 10.3 rounds to 10 while snapping is on.
  await expect(x).toHaveValue("10");

  await page.getByRole("checkbox", { name: "Einrasten" }).uncheck();
  await drag(page, await worldToPage(page, 12, 12), await worldToPage(page, 13.3, 12));
  // 10 + 1.3 = 11.3 stays fractional while snapping is off.
  const value = Number(await x.inputValue());
  expect(Number.isInteger(value)).toBe(false);
  expect(Math.abs(value - 11.3)).toBeLessThan(0.1);
});

test("the pan tool and Space-drag move the view without changing element positions", async ({ page }) => {
  await openEditor(page);
  await layer(page, "Obst & Gemüse").click();
  const group = page.locator(".le-canvas > g");
  // Measure fresh before every gesture: toolbar clicks can move the page under a stale box.
  const emptyCorner = async () => {
    const box = (await canvas(page).boundingBox())!;
    return { x: box.x + 20, y: box.y + 20 };
  };

  const beforePan = await group.getAttribute("transform");
  await page.locator(".le-left .le-tool-row button", { hasText: "Verschieben" }).click();
  await expect(page.locator(".le-left .le-tool-row button", { hasText: "Verschieben" })).toHaveAttribute("aria-pressed", "true");
  const panStart = await emptyCorner();
  await drag(page, panStart, { x: panStart.x + 90, y: panStart.y + 40 });
  await expect(group).not.toHaveAttribute("transform", beforePan!);
  await expect(field(page, "X")).toHaveValue("9");
  await expect(field(page, "Y")).toHaveValue("8");

  await page.locator(".le-left .le-tool-row button", { hasText: "Auswählen" }).click();
  const beforeSpace = await group.getAttribute("transform");
  await canvas(page).focus();
  await page.keyboard.down("Space");
  const spaceStart = await emptyCorner();
  await drag(page, spaceStart, { x: spaceStart.x - 30, y: spaceStart.y + 30 });
  await page.keyboard.up("Space");
  await expect(group).not.toHaveAttribute("transform", beforeSpace!);
  await expect(field(page, "X")).toHaveValue("9");
  await expect(field(page, "Y")).toHaveValue("8");
});

test("mouse wheel zoom is clamped, never produces NaN, and Einpassen restores the fitted scale", async ({ page }) => {
  await openEditor(page);
  const center = (await canvas(page).boundingBox())!;
  await page.mouse.move(center.x + center.width / 2, center.y + center.height / 2);
  for (let step = 0; step < 25; step++) await page.mouse.wheel(0, -400);
  await expect.poll(() => scaleValue(page)).toBe(80);
  await expect(page.locator(".le-canvas > g")).not.toHaveAttribute("transform", /NaN|Infinity/);

  for (let step = 0; step < 60; step++) await page.mouse.wheel(0, 400);
  await expect.poll(() => scaleValue(page)).toBe(0.2);
  await expect(page.locator(".le-canvas > g")).not.toHaveAttribute("transform", /NaN|Infinity/);

  // The canvas height can still change while side panels settle, so check Einpassen against the fit for the current size.
  await page.getByRole("button", { name: "Einpassen" }).click();
  await expect.poll(async () => {
    const size = (await canvas(page).boundingBox())!;
    const expected = Math.max(0.2, Math.min(40, (size.width - 80) / 40, (size.height - 80) / 60));
    return (await scaleValue(page)) === Number(expected.toFixed(1));
  }).toBe(true);
});

test("shrinking the grid below an element is flagged, and the saved draft cannot be published", async ({ page }) => {
  const saved: LayoutDocument[] = [];
  await openEditor(page, { saved });
  await page.getByRole("spinbutton", { name: "Höhe", exact: true }).fill("10");
  await expect(page.locator(".le-canvas-toolbar")).toContainText("40 × 10 Rastereinheiten");
  await expect(page.locator(".le-validation")).toContainText("Obst & Gemüse liegt außerhalb des Grundrisses");
  await expect(page.locator(".le-validation h2")).toContainText("Fehler");

  await page.getByRole("button", { name: "Entwurf speichern" }).click();
  await expect(page.getByText("Entwurf gespeichert.")).toBeVisible();
  expect(saved).toHaveLength(1);
  expect(saved[0].gridSize).toEqual({ width: 40, height: 10 });
  await expect(page.getByRole("button", { name: "Veröffentlichen" })).toBeDisabled();
});

test("the beacon picker disables placed beacons, and a duplicate starts unassigned with a warning", async ({ page }) => {
  await openEditor(page, { assignedBeacons: [placedBeacon, freeBeacon] });
  await layer(page, "Beacon").click();
  const picker = page.getByLabel("Zugeordneter Beacon");
  await expect(picker).toHaveValue("IN-001");
  await expect(page.getByRole("option", { name: "IN-002", exact: true })).toBeEnabled();

  await page.getByRole("button", { name: "Duplizieren", exact: true }).click();
  await expect(picker).toHaveValue("");
  await expect(page.getByRole("option", { name: /IN-001.*bereits platziert/ })).toHaveAttribute("disabled", "");
  await expect(page.getByRole("option", { name: "IN-002", exact: true })).toBeEnabled();
  await expect(page.locator(".le-validation")).toContainText("keinem Beacon zugeordnet");

  await picker.selectOption("IN-002");
  await expect(picker).toHaveValue("IN-002");
  await expect(page.locator(".le-validation")).not.toContainText("keinem Beacon zugeordnet");
});

test("Delete removes a plain POI without asking", async ({ page }) => {
  const dialogs: string[] = [];
  // A dialog would be dismissed here, so the POI would survive and the count assertion below would fail.
  page.on("dialog", (dialog) => { dialogs.push(dialog.message()); void dialog.dismiss(); });
  await openEditor(page);
  await page.getByRole("button", { name: "POI", exact: true }).click();
  await clickWorld(page, 25, 45);
  await expect(page.locator(".le-layers button")).toHaveCount(fixture.elements.length + 1);

  await canvas(page).focus();
  await page.keyboard.press("Delete");
  await expect(page.locator(".le-layers button")).toHaveCount(fixture.elements.length);
  expect(dialogs).toEqual([]);
});

test("Delete asks before removing a shelf, and cancelling the dialog keeps it", async ({ page }) => {
  const messages: string[] = [];
  let answer: "accept" | "dismiss" = "dismiss";
  page.on("dialog", (dialog) => {
    messages.push(dialog.message());
    if (answer === "accept") void dialog.accept();
    else void dialog.dismiss();
  });
  await openEditor(page);
  await layer(page, "Obst & Gemüse").click();
  await canvas(page).focus();
  await page.keyboard.press("Delete");
  await expect.poll(() => messages.length).toBe(1);
  expect(messages[0]).toContain("Obst & Gemüse");
  await expect(page.locator(".le-layers button")).toHaveCount(fixture.elements.length);

  answer = "accept";
  await canvas(page).focus();
  await page.keyboard.press("Delete");
  await expect(page.locator(".le-layers button")).toHaveCount(fixture.elements.length - 1);
  expect(messages).toHaveLength(2);
});

test("Delete asks before removing a POI that carries a layout code", async ({ page }) => {
  const messages: string[] = [];
  let answer: "accept" | "dismiss" = "dismiss";
  page.on("dialog", (dialog) => {
    messages.push(dialog.message());
    if (answer === "accept") void dialog.accept();
    else void dialog.dismiss();
  });
  await openEditor(page);
  await page.getByRole("button", { name: "POI", exact: true }).click();
  await clickWorld(page, 25, 45);
  await page.getByLabel("Layout-Code").fill("310/1/1/1");
  await canvas(page).focus();
  await page.keyboard.press("Delete");
  await expect.poll(() => messages.length).toBe(1);
  expect(messages[0]).toContain("POI");
  await expect(page.locator(".le-layers button")).toHaveCount(fixture.elements.length + 1);

  answer = "accept";
  await canvas(page).focus();
  await page.keyboard.press("Delete");
  await expect(page.locator(".le-layers button")).toHaveCount(fixture.elements.length);
});

test("keyboard undo works when no element of the editor has focus", async ({ page }) => {
  await openEditor(page);
  await layer(page, "Obst & Gemüse").click();
  await canvas(page).focus();
  await page.keyboard.press("ArrowRight");
  await expect(field(page, "X")).toHaveValue("10");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("ControlOrMeta+z");
  await expect(field(page, "X")).toHaveValue("9");
});
