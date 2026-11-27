import { expect, test } from "@playwright/test";
import { mockVisualApi } from "./visual/fixtures";

const lists = [
  { path: "stores/", api: "/api/stores", ready: "Indooro Linz", empty: "Noch keine Stores vorhanden." },
  { path: "beacons/", api: "/api/beacons", ready: "BC-1", empty: "Noch keine Beacons vorhanden." },
  { path: "categories/", api: "/api/categories", ready: "Obst", empty: "Noch keine Kategorien vorhanden." },
  { path: "products/?storeId=store-1", api: "/api/admin/products", ready: "Apfel 0", empty: "Der Produktkatalog ist leer." },
  { path: "recipes/", api: "/api/admin/recipes", ready: "Apfel-Hafer-Crumble", empty: "Noch keine Rezepte vorhanden." }
];

for (const list of lists) {
  test(`${list.path} delayed loading and empty action`, async ({ page }) => {
    await mockVisualApi(page, true, list.api === "/api/admin/products");
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    await page.route(`**${list.api}?*`, async (route) => { await pending; await route.fallback(); });
    await page.goto(`/admin/next/${list.path}`);
    await expect(page.locator(".loading-state")).toBeVisible();
    await expect(page.locator(".loading-state")).toHaveCSS("min-height", "224px");
    release();
    await expect(page.getByText(list.empty, { exact: true })).toBeVisible();
    await expect(page.locator(".empty-state").getByRole("button").or(page.locator(".empty-state").getByRole("link"))).toBeVisible();
    await expect(page.locator(".loading-state")).toHaveCount(0);
  });

  for (const failure of [500, 403, 404, "network"] as const) {
    test(`${list.path} ${failure} retry recovers`, async ({ page }) => {
      await mockVisualApi(page);
      let failing = true;
      let requests = 0;
      await page.route(`**${list.api}?*`, async (route) => {
        requests++;
        if (!failing) return route.fallback();
        if (failure === "network") return route.abort("failed");
        return route.fulfill({ status: failure, json: { message: "SECRET_EXCEPTION: stack trace" } });
      });
      await page.goto(`/admin/next/${list.path}`);
      const alert = page.getByRole("alert").filter({ has: page.getByRole("button", { name: "Erneut versuchen" }) }).first();
      await expect(alert).toContainText(failure === 403 ? /Zugriff|Berechtigung/ : failure === 404 ? /nicht gefunden/ : failure === "network" ? /Verbindung/ : /Server/);
      await expect(page.locator("body")).not.toContainText("SECRET_EXCEPTION");
      const before = requests;
      failing = false;
      await alert.getByRole("button", { name: "Erneut versuchen" }).click();
      await expect(page.getByText(list.ready, { exact: true }).first()).toBeVisible();
      expect(requests).toBeGreaterThan(before);
      await expect(page.getByRole("alert")).toHaveCount(0);
    });
  }
}
