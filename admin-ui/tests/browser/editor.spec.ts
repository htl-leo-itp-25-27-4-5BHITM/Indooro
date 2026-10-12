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
  await page.getByRole("button", { name: "Entwurf speichern" }).click();
  await expect(page.getByText("Entwurf gespeichert.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Veröffentlichen" })).toBeDisabled();
  expect(saved[0].elements).toHaveLength(4);
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
