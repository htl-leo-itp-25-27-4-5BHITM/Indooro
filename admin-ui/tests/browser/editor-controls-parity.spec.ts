import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { LayoutDocument } from "../../src/editor/model";

const layout = JSON.parse(readFileSync(new URL("../../src/editor/fixtures/store-layout.json", import.meta.url), "utf8")) as LayoutDocument;

async function mockEditor(page: Page, saved: LayoutDocument[] = []) {
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: {
    subject: "admin-1", username: "admin", email: null, role: "admin", scope: null,
  } }));
  await page.route("**/api/categories?*", (route) => route.fulfill({ json: [
    { categoryCode: 310, categoryName: "Obst & Gemüse" },
    { categoryCode: 525, categoryName: "Molkerei" },
  ] }));
  await page.route("**/api/stores/store-1/layout/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith("/editor-context")) {
      return route.fulfill({ json: {
        store: { id: "store-1", storeCode: "LINZ-1", name: "Indooro Testfiliale" },
        currentLayout: { layoutId: "current-1", versionNo: 1, status: "ACTIVE", layout },
        assignedBeacons: [],
      } });
    }
    if (path.endsWith("/versions") && route.request().method() === "GET") {
      return route.fulfill({ json: [{ layoutId: "current-1", versionNo: 1, status: "ACTIVE", layoutName: layout.shopName }] });
    }
    if (path.endsWith("/versions") && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as { activate: boolean; layout: LayoutDocument };
      expect(payload.activate).toBe(false);
      saved.push(payload.layout);
      return route.fulfill({ json: {
        layoutId: `draft-${saved.length}`, versionNo: saved.length + 1, status: "DRAFT",
        layoutName: payload.layout.shopName, layout: payload.layout,
      } });
    }
    return route.fulfill({ status: 404, json: { message: "Unexpected editor route" } });
  });
}

async function openEditor(page: Page, saved?: LayoutDocument[]) {
  await mockEditor(page, saved);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/next/editor/?storeId=store-1");
  await expect(page.getByRole("heading", { name: "Layout Editor" })).toBeVisible();
}

async function scaleValue(page: Page) {
  const text = await page.locator(".le-canvas-toolbar > span").nth(1).textContent();
  const value = Number.parseFloat(text ?? "");
  expect(Number.isFinite(value), `visible canvas scale: ${text}`).toBe(true);
  return value;
}

test("grid visibility and manual grid dimensions affect the canvas and saved draft", async ({ page }) => {
  const saved: LayoutDocument[] = [];
  await openEditor(page, saved);

  const gridOverlay = page.locator('.le-canvas > g > rect[fill="url(#le-grid)"]');
  const gridCheckbox = page.getByRole("checkbox", { name: "Raster" });
  await expect(gridCheckbox).toBeChecked();
  await expect(gridOverlay).toHaveCount(1);
  await expect(gridOverlay).toBeVisible();
  await gridCheckbox.uncheck();
  await expect(gridCheckbox).not.toBeChecked();
  await expect(gridOverlay).toHaveCount(0);
  await gridCheckbox.check();
  await expect(gridOverlay).toBeVisible();

  const width = page.getByRole("spinbutton", { name: "Breite" });
  const height = page.getByRole("spinbutton", { name: "Höhe" });
  await width.fill("32");
  await height.fill("48");
  await expect(page.locator(".le-canvas-toolbar")).toContainText("32 × 48 Rastereinheiten");
  await expect(page.locator(".le-canvas > g > rect").first()).toHaveAttribute("width", "32");
  await expect(page.locator(".le-canvas > g > rect").first()).toHaveAttribute("height", "48");

  await page.getByRole("button", { name: "Entwurf speichern" }).click();
  await expect(page.getByText("Entwurf gespeichert.")).toBeVisible();
  expect(saved).toHaveLength(1);
  expect(saved[0].gridSize).toEqual({ width: 32, height: 48 });
});

test("zoom controls and Einpassen visibly change the canvas scale", async ({ page }) => {
  await openEditor(page);
  const group = page.locator(".le-canvas > g");
  const initialTransform = await group.getAttribute("transform");
  const initialScale = await scaleValue(page);

  await page.getByRole("button", { name: "Vergrößern" }).click();
  const zoomedScale = await scaleValue(page);
  expect(zoomedScale).toBeGreaterThan(initialScale);
  expect(await group.getAttribute("transform")).not.toBe(initialTransform);

  await page.getByRole("button", { name: "Verkleinern" }).click();
  const reducedScale = await scaleValue(page);
  expect(reducedScale).toBeLessThan(zoomedScale);
  expect(reducedScale).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Vergrößern" }).click();
  const beforeFit = await scaleValue(page);
  await page.getByRole("button", { name: "Einpassen" }).click();
  const fittedScale = await scaleValue(page);
  expect(fittedScale).toBeLessThan(beforeFit);
  expect(await group.getAttribute("transform")).not.toBeNull();
});

test("snap setting changes numeric movement and the inspector step", async ({ page }) => {
  await openEditor(page);
  const shelfLayer = page.locator(".le-layers button").filter({ hasText: "Obst & Gemüse" });
  await shelfLayer.click();
  const x = page.getByRole("spinbutton", { name: "X", exact: true });
  const snapCheckbox = page.getByRole("checkbox", { name: "Einrasten" });
  await expect(snapCheckbox).toBeChecked();
  await expect(x).toHaveAttribute("step", "1");
  await x.fill("9.4");
  await expect(x).toHaveValue("9");

  await snapCheckbox.uncheck();
  await expect(x).toHaveAttribute("step", "0.1");
  await x.fill("9.4");
  await expect(x).toHaveValue("9.4");
});

test("90 degree turn swaps the inspector footprint and is disabled for locked shelves", async ({ page }) => {
  await openEditor(page);
  await page.locator(".le-layers button").filter({ hasText: "Obst & Gemüse" }).click();
  const width = page.getByRole("spinbutton", { name: "Breite", exact: true });
  const height = page.getByRole("spinbutton", { name: "Höhe", exact: true });
  await expect(width).toHaveValue("4");
  await expect(height).toHaveValue("8");

  const turn = page.getByRole("button", { name: "90° drehen" });
  await turn.click();
  await expect(width).toHaveValue("8");
  await expect(height).toHaveValue("4");

  await page.getByRole("checkbox", { name: "Gesperrt" }).check();
  await expect(turn).toBeDisabled();
});
