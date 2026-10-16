import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
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
      saved.push(payload.layout);
      return route.fulfill({ json: { layoutId: `draft-${saved.length}`, versionNo: saved.length + 1, status: "DRAFT", layoutName: "Indooro Testfiliale", layout: payload.layout } });
    }
    if (path.endsWith("/activate")) return route.fulfill({ json: { layoutId: `draft-${saved.length}`, versionNo: saved.length + 1, status: "ACTIVE", layout: saved.at(-1) } });
    return route.fulfill({ status: 404, json: { message: "Unexpected editor route" } });
  });
}

/** Presses Tab until `target` is focused, failing with a clear assertion if it never is. */
async function tabUntilFocused(page: Page, target: Locator, maxPresses = 80) {
  for (let presses = 0; presses < maxPresses; presses += 1) {
    if (await target.evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

test("Tab reaches the tool palette, canvas and layout actions from page load", async ({ page }) => {
  await mockEditor(page, "DRAFT", []);
  await page.goto("/admin/next/editor/?storeId=store-1");
  await expect(page.getByRole("heading", { name: "Indooro Testfiliale" })).toBeVisible();

  expect(await page.evaluate(() => document.activeElement === document.body || document.activeElement === null)).toBe(true);

  const selectTool = page.getByRole("button", { name: "Auswählen", exact: false });
  await tabUntilFocused(page, selectTool.first());

  const shelfTool = page.getByRole("button", { name: "Regal", exact: true });
  await tabUntilFocused(page, shelfTool);

  const canvas = page.getByRole("group", { name: "Interaktiver Grundriss" });
  await tabUntilFocused(page, canvas);
  await expect(canvas).toHaveAccessibleDescription(/Pfeile positionieren.*Bei ausgewählter Ebene bewegen Pfeile das Element/);

  const newLayout = page.getByRole("button", { name: "Neues Layout" });
  await tabUntilFocused(page, newLayout);
});

test("Enter on a focused layer selects it and Tab moves focus into the inspector form", async ({ page }) => {
  await mockEditor(page, "DRAFT", []);
  await page.goto("/admin/next/editor/?storeId=store-1");

  const layers = page.locator(".le-layers");
  await expect(layers.getByRole("listitem")).toHaveCount(layout.elements.length);
  const shelfLayer = layers.getByRole("button", { name: /Obst & Gemüse/ });
  await tabUntilFocused(page, shelfLayer);
  await expect(shelfLayer).toHaveAttribute("aria-current", "false");

  await page.keyboard.press("Enter");
  await expect(shelfLayer).toHaveAttribute("aria-current", "true");
  await expect(page.getByText("Elementtyp: Regal")).toBeVisible();

  const labelField = page.getByLabel("Bezeichnung");
  await tabUntilFocused(page, labelField);
});

test("focused controls keep native Space and arrow behavior while canvas arrows move elements", async ({ page }) => {
  await mockEditor(page, "DRAFT", []);
  await page.goto("/admin/next/editor/?storeId=store-1");

  const shelfLayer = page.locator(".le-layers button").filter({ hasText: "Obst & Gemüse" });
  await shelfLayer.focus();
  await page.keyboard.press("Space");
  await expect(shelfLayer).toHaveAttribute("aria-current", "true");

  const x = page.getByLabel("X", { exact: true });
  const initialX = await x.inputValue();
  await page.keyboard.press("ArrowRight");
  await expect(x).toHaveValue(initialX);

  await page.getByRole("group", { name: "Interaktiver Grundriss" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(x).toHaveValue(String(Number(initialX) + 1));
});

test("Escape cancels an active create tool from the keyboard without adding an element", async ({ page }) => {
  await mockEditor(page, "DRAFT", []);
  await page.goto("/admin/next/editor/?storeId=store-1");
  const layers = page.locator(".le-layers button");
  await expect(layers).toHaveCount(layout.elements.length);
  const initialCount = await layers.count();

  const shelfTool = page.getByRole("button", { name: "Regal", exact: true });
  await tabUntilFocused(page, shelfTool);
  await page.keyboard.press("Enter");
  await expect(shelfTool).toHaveAttribute("aria-pressed", "true");

  const canvas = page.getByRole("group", { name: "Interaktiver Grundriss" });
  await canvas.focus();
  await page.keyboard.press("Escape");

  await expect(shelfTool).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Auswählen", exact: false }).first()).toHaveAttribute("aria-pressed", "true");
  await expect(layers).toHaveCount(initialCount);
});

test("keyboard duplicate respects the selected element lock", async ({ page }) => {
  await mockEditor(page, "DRAFT", []);
  await page.goto("/admin/next/editor/?storeId=store-1");
  const layers = page.locator(".le-layers button");
  await expect(layers).toHaveCount(layout.elements.length);
  await layers.filter({ hasText: "Obst & Gemüse" }).click();
  await page.getByRole("checkbox", { name: "Gesperrt" }).check();
  await expect(page.getByRole("button", { name: "Duplizieren" })).toBeDisabled();
  await page.getByRole("group", { name: "Interaktiver Grundriss" }).focus();
  await page.keyboard.press("ControlOrMeta+D");
  await expect(layers).toHaveCount(layout.elements.length);
  await page.getByRole("checkbox", { name: "Gesperrt" }).uncheck();
  await page.getByRole("group", { name: "Interaktiver Grundriss" }).focus();
  await page.keyboard.press("ControlOrMeta+D");
  await expect(layers).toHaveCount(layout.elements.length + 1);
});

test("named history controls and global undo/redo shortcuts restore the selected layer", async ({ page }) => {
  await mockEditor(page, "DRAFT", []);
  await page.goto("/admin/next/editor/?storeId=store-1");

  const canvas = page.getByRole("group", { name: "Interaktiver Grundriss" });
  const layer = page.locator(".le-layers").getByRole("button", { name: /Obst & Gemüse/ });
  await expect(page.getByRole("button", { name: "Rückgängig" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Wiederholen" })).toBeDisabled();

  await layer.click();
  const x = page.getByLabel("X", { exact: true });
  const initialX = Number(await x.inputValue());
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await expect(x).toHaveValue(String(initialX + 1));
  await expect(page.getByRole("button", { name: "Rückgängig" })).toBeEnabled();

  await page.keyboard.press("ControlOrMeta+z");
  await expect(x).toHaveValue(String(initialX));
  await expect(page.getByRole("button", { name: "Wiederholen" })).toBeEnabled();
  await page.keyboard.press("ControlOrMeta+y");
  await expect(x).toHaveValue(String(initialX + 1));
  await expect(page.getByRole("button", { name: "Wiederholen" })).toBeDisabled();
});

test("cancelling a critical delete dialog preserves focus and the selected layer", async ({ page }) => {
  await mockEditor(page, "DRAFT", []);
  await page.goto("/admin/next/editor/?storeId=store-1");
  const layer = page.locator(".le-layers").getByRole("button", { name: /Obst & Gemüse/ });
  await layer.click();

  const remove = page.getByRole("button", { name: "Löschen" });
  await remove.focus();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.keyboard.press("Enter");

  await expect(remove).toBeFocused();
  await expect(layer).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".le-layers").getByRole("listitem")).toHaveCount(layout.elements.length);
});

test("save failure is announced, retains edits, and announces a successful retry", async ({ page }) => {
  const saved: LayoutDocument[] = [];
  let saveAttempts = 0;
  await mockEditor(page, "DRAFT", saved);
  await page.route("**/api/stores/store-1/layout/versions", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    saveAttempts += 1;
    if (saveAttempts === 1) return route.fulfill({ status: 503, json: { message: "Vorübergehend nicht verfügbar" } });
    const payload = route.request().postDataJSON() as { layout: LayoutDocument };
    saved.push(payload.layout);
    return route.fulfill({ json: { layoutId: "draft-retry", versionNo: 2, status: "DRAFT", layoutName: payload.layout.shopName, layout: payload.layout } });
  });
  await page.goto("/admin/next/editor/?storeId=store-1");

  const shopName = page.getByLabel("Filialname");
  await shopName.fill("Linz Test geändert");
  await page.getByRole("button", { name: "Entwurf speichern" }).click();
  await expect(page.getByRole("status")).toHaveText("Serverfehler. Bitte später erneut versuchen.");
  await expect(page.getByRole("button", { name: "Entwurf speichern" })).toBeFocused();
  await expect(shopName).toHaveValue("Linz Test geändert");
  await expect(page.getByText("Ungespeicherte Änderungen")).toBeVisible();

  await page.getByRole("button", { name: "Entwurf speichern" }).click();
  await expect(page.getByRole("status")).toHaveText("Entwurf gespeichert.");
  await expect(page.getByRole("button", { name: "Entwurf speichern" })).toBeFocused();
  await expect(page.locator(".le-save-indicator")).toContainText("Gespeichert");
  expect(saveAttempts).toBe(2);
  expect(saved.at(-1)?.shopName).toBe("Linz Test geändert");
});
