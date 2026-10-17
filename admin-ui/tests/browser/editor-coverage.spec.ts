import { readFileSync } from "node:fs";
import { expect, test, type Page, type Worker as PlaywrightWorker } from "@playwright/test";
import { computeCoverage, coverageRule, type CoverageInput } from "../../src/editor/coverage";
import { formatCoverageSummary, formatGapLine } from "../../src/editor/coverageView";
import type { LayoutDocument, LayoutElement } from "../../src/editor/model";

const fixture = JSON.parse(readFileSync(new URL("../../src/editor/fixtures/store-layout.json", import.meta.url), "utf8")) as LayoutDocument;
const uuid = "123e4567-e89b-12d3-a456-426614174000";
const assignedBeacons = [
  { beaconCode: "IN-001", beaconId: "beacon-db-1", identityKey: `${uuid}:1:2`, uuid, major: 1, minor: 2 },
  { beaconCode: "IN-002", beaconId: "beacon-db-2", identityKey: `${uuid}:1:3`, uuid, major: 1, minor: 3 },
  { beaconCode: "IN-003", beaconId: "beacon-db-3", identityKey: `${uuid}:1:4`, uuid, major: 1, minor: 4 },
];
const secondBeacon: LayoutElement = { id: 4, type: "beacon", x: 30, y: 40, beaconId: "IN-002", beaconDbId: "beacon-db-2", identityKey: `${uuid}:1:3`, uuid, major: 1, minor: 3 };
const twoBeacons: LayoutDocument = { ...fixture, elements: [...fixture.elements, secondBeacon] };
// Three beacons close together: some cells reach the rule's three beacons at the default radius.
const threeBeacons: LayoutDocument = {
  ...fixture,
  elements: [
    ...fixture.elements,
    { ...secondBeacon, id: 4, x: 12, y: 10 },
    { id: 5, type: "beacon", x: 14, y: 12, beaconId: "IN-003", beaconDbId: "beacon-db-3", identityKey: `${uuid}:1:4`, uuid, major: 1, minor: 4 },
  ],
};
// Two beacons on one point in a 10 x 10 grid: a third beacon there covers every cell.
const smallLayout: LayoutDocument = {
  shopName: "Kleiner Testladen",
  gridSize: { width: 10, height: 10 },
  elements: [
    { id: 1, type: "entrance", x: 4, y: 0, width: 3, height: 1, label: "Haupteingang" },
    { id: 2, type: "beacon", x: 5, y: 5, beaconId: "IN-001", beaconDbId: "beacon-db-1", identityKey: `${uuid}:1:2`, uuid, major: 1, minor: 2 },
    { id: 3, type: "beacon", x: 5, y: 5, beaconId: "IN-002", beaconDbId: "beacon-db-2", identityKey: `${uuid}:1:3`, uuid, major: 1, minor: 3 },
  ],
};

/** Expected summary texts, computed with the same shared modules as the editor. */
function expectedText(layout: LayoutDocument, radius = coverageRule.radiusMeters) {
  const result = computeCoverage(layout as CoverageInput, radius, coverageRule.minBeaconsPerCell);
  return { summary: formatCoverageSummary(result.summary, coverageRule.minBeaconsPerCell), gap: formatGapLine(result.summary, coverageRule) };
}

async function mockEditor(page: Page, options: { layout?: LayoutDocument; saved?: LayoutDocument[] } = {}) {
  const layout = options.layout ?? twoBeacons;
  const saved = options.saved ?? [];
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", email: null, role: "admin", scope: null } }));
  await page.route("**/api/categories?*", (route) => route.fulfill({ json: [{ categoryCode: 310, categoryName: "Obst & Gemüse" }] }));
  await page.route("**/api/stores/store-1/layout/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/editor-context")) {
      return route.fulfill({ json: { store: { id: "store-1", storeCode: "LINZ-1", name: "Indooro Testfiliale" }, currentLayout: { layoutId: "current-1", versionNo: 1, status: "DRAFT", layout }, assignedBeacons } });
    }
    if (path.endsWith("/versions") && route.request().method() === "GET") {
      return route.fulfill({ json: [{ layoutId: "current-1", versionNo: 1, status: "DRAFT", layoutName: layout.shopName }] });
    }
    if (path.endsWith("/versions") && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as { activate: boolean; layout: LayoutDocument };
      expect(payload.activate).toBe(false);
      saved.push(payload.layout);
      return route.fulfill({ json: { layoutId: `draft-${saved.length}`, versionNo: saved.length + 1, status: "DRAFT", layoutName: payload.layout.shopName, layout: payload.layout } });
    }
    return route.fulfill({ status: 404, json: { message: "Unexpected editor route" } });
  });
  return saved;
}

async function openEditor(page: Page, options: { layout?: LayoutDocument; saved?: LayoutDocument[] } = {}) {
  const saved = await mockEditor(page, options);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/next/editor/?storeId=store-1");
  await expect(page.getByRole("heading", { name: "Layout Editor" })).toBeVisible();
  return saved;
}

const toggle = (page: Page) => page.getByRole("checkbox", { name: "Beacon-Abdeckung anzeigen" });
const summary = (page: Page) => page.locator(".le-coverage-summary");
const indicator = (page: Page) => page.locator(".le-save-indicator");
const overlayLayer = (page: Page) => page.locator(".le-coverage-layer");

test("coverage overlay is off by default and renders no overlay cells", async ({ page }) => {
  await openEditor(page);
  await expect(toggle(page)).not.toBeChecked();
  await expect(overlayLayer(page)).toHaveCount(0);
  await expect(summary(page)).toHaveCount(0);
});

test("enabling the overlay shows cells, the rule's summary and a legend with text", async ({ page }) => {
  const workers: PlaywrightWorker[] = [];
  page.on("worker", (worker) => workers.push(worker));
  await openEditor(page);
  await toggle(page).check();
  await expect(overlayLayer(page)).toHaveCount(1);
  await expect(overlayLayer(page).locator("path").first()).toBeAttached();
  const expected = expectedText(twoBeacons);
  await expect(summary(page)).toContainText(expected.summary);
  await expect(summary(page)).toContainText(expected.gap);
  await expect(summary(page)).toContainText("≥ 3 Beacons");
  await expect(summary(page).locator(".le-coverage-gap")).toHaveClass(/is-warn/);
  await expect(page.locator(".le-coverage-legend")).toContainText("unter 3 Beacons");
  await expect(page.locator(".le-coverage-legend")).toContainText("genau 3");
  await expect(page.locator(".le-coverage-legend")).toContainText("mehr als 3");
  expect(workers, "small layouts are computed inline").toHaveLength(0);
});

test("radius field and slider change the percentage", async ({ page }) => {
  await openEditor(page, { layout: threeBeacons });
  await toggle(page).check();
  const radius = page.getByRole("spinbutton", { name: "Radius (m)" });
  const slider = page.getByRole("slider", { name: "Radius-Regler" });
  await expect(radius).toHaveValue("8");
  await expect(slider).toHaveValue("8");

  await radius.fill("12");
  await expect(summary(page)).toContainText(expectedText(threeBeacons, 12).summary);
  expect(expectedText(threeBeacons, 12).summary).not.toBe(expectedText(threeBeacons, 8).summary);

  await slider.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(radius).toHaveValue("11.5");
  await expect(summary(page)).toContainText(expectedText(threeBeacons, 11.5).summary);

  await radius.fill("40");
  await expect(summary(page)).toContainText(expectedText(threeBeacons, 11.5).summary);
  await radius.blur();
  await expect(radius).toHaveValue("11.5");
});

test("moving a beacon in the inspector updates the overlay live without saving", async ({ page }) => {
  await openEditor(page, { layout: threeBeacons });
  await toggle(page).check();
  await expect(indicator(page)).toHaveText("✓ Gespeichert");
  const before = expectedText(threeBeacons);
  await expect(summary(page)).toContainText(before.summary);

  await page.locator(".le-layers button").filter({ hasText: "Beacon" }).nth(2).click();
  await page.getByRole("spinbutton", { name: "X", exact: true }).fill("30");
  await page.getByRole("spinbutton", { name: "Y", exact: true }).fill("50");

  const moved = structuredClone(threeBeacons);
  moved.elements = moved.elements.map((element) => element.id === 5 ? { ...element, x: 30, y: 50 } : element);
  await expect(summary(page)).toContainText(expectedText(moved).summary);
  expect(expectedText(moved).summary).not.toBe(before.summary);
  await expect(indicator(page)).toHaveText("● Ungespeicherte Änderungen");

  // X and Y are two undo steps; after both the layout is the saved one again.
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(summary(page)).toContainText(before.summary);
  await expect(indicator(page)).toHaveText("✓ Gespeichert");
});

test("toggling the overlay does not change the dirty state and the saved draft has no overlay fields", async ({ page }) => {
  const saved = await openEditor(page);
  await toggle(page).check();
  await expect(indicator(page)).toHaveText("✓ Gespeichert");
  await toggle(page).uncheck();
  await expect(indicator(page)).toHaveText("✓ Gespeichert");
  await expect(page.getByRole("button", { name: "Entwurf speichern" })).toHaveAttribute("aria-disabled", "true");

  await toggle(page).check();
  await page.locator(".le-layers button").filter({ hasText: "Beacon" }).nth(1).click();
  await page.getByRole("spinbutton", { name: "X", exact: true }).fill("9");
  await page.getByRole("button", { name: "Entwurf speichern" }).click();
  await expect(page.getByText("Entwurf gespeichert.")).toBeVisible();

  expect(saved).toHaveLength(1);
  expect(Object.keys(saved[0]).sort()).toEqual(Object.keys(twoBeacons).sort());
  const serialized = JSON.stringify(saved[0]);
  expect(serialized).not.toMatch(/coverage|radius|Abdeckung|overlay/i);
  const beacon = saved[0].elements.find((element) => element.id === 4);
  expect(Object.keys(beacon ?? {}).sort()).toEqual(Object.keys(secondBeacon).sort());
  expect(beacon?.x).toBe(9);
});

test("placing a third beacon raises the percentage and flips the gap status", async ({ page }) => {
  await openEditor(page, { layout: smallLayout });
  await toggle(page).check();
  await expect(summary(page)).toContainText("0,0 % der Fläche");
  await expect(summary(page).locator(".le-coverage-gap")).toHaveClass(/is-warn/);

  await page.getByRole("button", { name: "Beacon", exact: true }).click();
  await page.locator(".le-canvas").focus();
  await page.keyboard.press("Enter");

  const placed = structuredClone(smallLayout);
  placed.elements.push({ id: 900_000_001, type: "beacon", x: 5, y: 5, beaconId: "IN-003", beaconDbId: "beacon-db-3", identityKey: `${uuid}:1:4`, uuid, major: 1, minor: 4 });
  const after = expectedText(placed);
  expect(after.summary).toBe("100,0 % der Fläche mit ≥ 3 Beacons");
  await expect(summary(page)).toContainText(after.summary);
  await expect(summary(page).locator(".le-coverage-gap")).toHaveClass(/is-ok/);
  await expect(indicator(page)).toHaveText("● Ungespeicherte Änderungen");
});

test("a layout without beacons shows the hint instead of a percentage", async ({ page }) => {
  const noBeacons: LayoutDocument = { ...fixture, elements: fixture.elements.filter((element) => element.type !== "beacon") };
  await openEditor(page, { layout: noBeacons });
  await toggle(page).check();
  await expect(summary(page)).toHaveText("Noch keine Beacons platziert.");
});

test("keyboard: the overlay checkbox toggles with the space bar", async ({ page }) => {
  await openEditor(page);
  await toggle(page).focus();
  await page.keyboard.press("Space");
  await expect(toggle(page)).toBeChecked();
  await expect(overlayLayer(page)).toHaveCount(1);
  await page.keyboard.press("Space");
  await expect(toggle(page)).not.toBeChecked();
  await expect(overlayLayer(page)).toHaveCount(0);
});

test("a layout with more than 5000 walkable cells is computed in the coverage worker", async ({ page }) => {
  const workers: PlaywrightWorker[] = [];
  page.on("worker", (worker) => workers.push(worker));
  const large: LayoutDocument = {
    shopName: "Großer Testladen",
    gridSize: { width: 80, height: 75 },
    elements: [
      { id: 1, type: "entrance", x: 4, y: 0, width: 3, height: 1, label: "Haupteingang" },
      { id: 2, type: "shelf", x: 9, y: 8, width: 4, height: 8, category: "310/1", label: "Obst & Gemüse" },
      { id: 3, type: "beacon", x: 6, y: 6, beaconId: "IN-001", beaconDbId: "beacon-db-1", identityKey: `${uuid}:1:2`, uuid, major: 1, minor: 2 },
      { id: 4, type: "beacon", x: 60, y: 50, beaconId: "IN-002", beaconDbId: "beacon-db-2", identityKey: `${uuid}:1:3`, uuid, major: 1, minor: 3 },
    ],
  };
  await openEditor(page, { layout: large });
  await toggle(page).check();
  const expected = expectedText(large);
  await expect(summary(page)).toContainText(expected.summary, { timeout: 15_000 });
  await expect(summary(page)).toContainText(expected.gap);
  expect(workers.length, "large layouts use the coverage worker").toBeGreaterThan(0);
  expect(workers[0].url()).toContain("/admin/next/assets/coverage.worker-");
});

test("a large layout falls back to inline computation when the worker cannot be created", async ({ page }) => {
  await page.addInitScript(() => {
    class BrokenWorker {
      constructor() { throw new Error("Worker blocked in this test"); }
    }
    Object.defineProperty(window, "Worker", { value: BrokenWorker, configurable: true, writable: true });
  });
  const large: LayoutDocument = {
    shopName: "Großer Testladen",
    gridSize: { width: 80, height: 75 },
    elements: [
      { id: 1, type: "entrance", x: 4, y: 0, width: 3, height: 1, label: "Haupteingang" },
      { id: 2, type: "beacon", x: 6, y: 6, beaconId: "IN-001", beaconDbId: "beacon-db-1", identityKey: `${uuid}:1:2`, uuid, major: 1, minor: 2 },
      { id: 3, type: "beacon", x: 60, y: 50, beaconId: "IN-002", beaconDbId: "beacon-db-2", identityKey: `${uuid}:1:3`, uuid, major: 1, minor: 3 },
    ],
  };
  await openEditor(page, { layout: large });
  await toggle(page).check();
  const expected = expectedText(large);
  await expect(summary(page)).toContainText(expected.summary, { timeout: 15_000 });
  await expect(overlayLayer(page)).toHaveCount(1);
});
