import { expect, test } from "@playwright/test";
import { mockVisualApi } from "./fixtures";

const screens = [
  { name: "dashboard", path: "", ready: "Layout veröffentlicht" },
  { name: "stores", path: "stores/", ready: "Indooro Linz" },
  { name: "store-detail", path: "stores/detail/?storeId=store-1", ready: "Filiale geändert" },
  { name: "beacons", path: "beacons/", ready: "BC-1" },
  { name: "categories", path: "categories/", ready: "Obst" },
  { name: "products", path: "products/?storeId=store-1", ready: "Apfel 0" },
  { name: "recipes", path: "recipes/", ready: "Apfel-Hafer-Crumble" },
  { name: "layout-editor", path: "editor/?storeId=store-1", ready: "Entwurf speichern" }
];
const emptyScreens = [
  { name: "stores", ready: "Noch keine Stores vorhanden." },
  { name: "beacons", ready: "Noch keine Beacons vorhanden." },
  { name: "categories", ready: "Noch keine Kategorien vorhanden." },
  { name: "products", ready: "Der Produktkatalog ist leer." },
  { name: "recipes", ready: "Noch keine Rezepte vorhanden." }
];

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    for (const screen of screens) {
      test(screen.name, async ({ page }) => {
        await mockVisualApi(page);
        await page.goto(`/admin/next/${screen.path}`);
        await expect(page.getByText(screen.ready, { exact: true }).first()).toBeVisible();
        await expect(page.locator('[role="alert"]')).toHaveCount(0);
        if (screen.name === "layout-editor") await expect(page.getByText("Mobiles Layout wird geladen …", { exact: true })).toHaveCount(0);
        if (screen.name === "store-detail") await expect(page.locator(".setup-summary")).toContainText("von 7 Schritten erledigt");
        await page.evaluate(() => document.fonts.ready);
        // The editor fixture is deterministic SVG: keep it visible to catch canvas regressions.
        await expect(page).toHaveScreenshot(`${screen.name}-${viewport.width}x${viewport.height}.png`, { fullPage: true });
      });
    }

    for (const screen of emptyScreens) {
      test(`${screen.name} empty`, async ({ page }) => {
        await mockVisualApi(page, true, screen.name === "products");
        const query = screen.name === "products" ? "?storeId=store-1" : "";
        await page.goto(`/admin/next/${screen.name}/${query}`);
        await expect(page.getByText(screen.ready, { exact: true })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await expect(page).toHaveScreenshot(`${screen.name}-empty-${viewport.width}x${viewport.height}.png`, { fullPage: true });
      });
    }

    test("login session expired", async ({ page }) => {
      await mockVisualApi(page);
      await page.route("**/api/admin/me", (route) => route.fulfill({ status: 401, json: { error: "Unauthorized" } }));
      await page.goto("/admin/next/");
      await expect(page.getByRole("alert")).toContainText("Sitzung abgelaufen");
      await expect(page.getByRole("link", { name: "Erneut anmelden" })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`login-session-expired-${viewport.width}x${viewport.height}.png`, { fullPage: true });
    });
  });
}
