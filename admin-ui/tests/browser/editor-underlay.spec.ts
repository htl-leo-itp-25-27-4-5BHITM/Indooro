import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const layout = JSON.parse(readFileSync(new URL("../../src/editor/fixtures/store-layout.json", import.meta.url), "utf8"));
const fixture = new URL("../fixtures/underlay-grid.png", import.meta.url);

test("store underlay upload, calibration, alignment and reload", async ({ page }) => {
  let underlay: Record<string, unknown> | null = null;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/categories?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/stores/store-1/layout/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/editor-context")) return route.fulfill({ json: { store: { id: "store-1", storeCode: "LINZ-1", name: "Testfiliale" }, currentLayout: { layoutId: "active-1", versionNo: 1, status: "ACTIVE", layout }, assignedBeacons: [] } });
    if (path.endsWith("/versions")) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { error: "not found" } });
  });
  await page.route("**/api/stores/store-1/layout/underlay", (route) => {
    if (route.request().method() === "GET") return underlay ? route.fulfill({ json: underlay }) : route.fulfill({ status: 404, json: { error: "not found" } });
    if (route.request().method() === "PUT") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      underlay = { storeId: "store-1", contentType: "image/png", imageBase64: "", widthPx: 100, heightPx: 60,
        scaleMPerPx: null, offsetXM: 0, offsetYM: 0, rotationDeg: 0, opacity: 0.5, locked: false,
        updatedAt: "2026-10-16T00:00:00Z", ...underlay, ...payload };
      return route.fulfill({ json: underlay });
    }
    if (route.request().method() === "DELETE") { underlay = null; return route.fulfill({ status: 204 }); }
    return route.fulfill({ status: 405 });
  });

  await page.goto("/admin/next/editor/?storeId=store-1");
  const panel = page.getByRole("region", { name: "Grundrissbild" });
  await expect(panel.getByText("Grundrissbild wird geladen …")).toBeHidden();
  await panel.getByLabel("Grundrissbild auswählen").setInputFiles({ name: "plan.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF") });
  await expect(panel.getByRole("alert")).toContainText("Nur PNG oder JPEG");
  await panel.getByLabel("Grundrissbild auswählen").setInputFiles(fixture.pathname);
  await expect(panel.getByText("100 × 60 Pixel")).toBeVisible();
  await expect(page.locator(".le-canvas image")).toHaveAttribute("width", "40");
  await panel.getByRole("button", { name: "Mit zwei Punkten kalibrieren" }).click();
  const dialog = page.getByRole("dialog", { name: "Bild kalibrieren" });
  await dialog.getByLabel("X (px)").nth(0).fill("10");
  await dialog.getByLabel("Y (px)").nth(0).fill("10");
  await dialog.getByLabel("X (px)").nth(1).fill("60");
  await dialog.getByLabel("Y (px)").nth(1).fill("10");
  await dialog.getByLabel("Entfernung (m)").fill("5");
  await dialog.getByRole("button", { name: "Maßstab speichern" }).click();
  await expect(dialog).toBeHidden();
  expect(underlay?.scaleMPerPx).toBe(0.1);
  await panel.getByLabel("X-Versatz (m)").fill("2");
  await panel.getByLabel("Y-Versatz (m)").click();
  await expect(page.locator(".le-canvas image")).toHaveAttribute("x", "2");
  await page.reload();
  await expect(page.locator(".le-canvas image")).toHaveAttribute("width", "10");
  await expect(page.locator(".le-canvas image")).toHaveAttribute("x", "2");
  await panel.getByLabel("Ausrichtung sperren").check();
  await expect(panel.getByLabel("Drehung (°)")).toBeDisabled();
});
