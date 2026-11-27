import { expect, test, type Page } from "@playwright/test";
import { mockVisualApi } from "./visual/fixtures";

const lists = [
  { path: "regions/", api: "/api/regions", ready: "Oberösterreich", empty: "Keine Regionen in diesem Status." },
  { path: "access/", api: "/api/admin/access-assignments", ready: "team-member", empty: "Keine Zugänge in diesem Status." },
  { path: "stores/", api: "/api/stores", ready: "Indooro Linz", empty: "Noch keine Stores vorhanden." },
  { path: "beacons/", api: "/api/beacons", ready: "BC-1", empty: "Noch keine Beacons vorhanden." },
  { path: "categories/", api: "/api/categories", ready: "Obst", empty: "Noch keine Kategorien vorhanden." },
  { path: "products/?storeId=store-1", api: "/api/admin/products", ready: "Apfel 0", empty: "Der Produktkatalog ist leer." },
  { path: "recipes/", api: "/api/admin/recipes", ready: "Apfel-Hafer-Crumble", empty: "Noch keine Rezepte vorhanden." }
];

async function mockListApi(page: Page, list: typeof lists[number], empty = false) {
  await mockVisualApi(page, empty, list.api === "/api/admin/products");
  if (list.api === "/api/regions" && empty) {
    await page.route("**/api/regions?*", (route) => route.fulfill({ json: [] }));
  }
  if (list.api === "/api/admin/access-assignments") {
    await page.route("**/api/admin/access-assignments?*", (route) => route.fulfill({ json: empty ? [] : [{
      id: "access-1", keycloakSubject: "member-1", username: "team-member", email: null,
      role: "admin", regionId: null, regionName: null, storeId: null, storeCode: null,
      storeName: null, status: "ACTIVE", createdAt: "2026-11-01T08:00:00Z", updatedAt: "2026-11-01T08:00:00Z"
    }] }));
  }
}

for (const list of lists) {
  test(`${list.path} delayed loading and empty action`, async ({ page }) => {
    await mockListApi(page, list, true);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    await page.route(`**${list.api}?*`, async (route) => { await pending; await route.fallback(); });
    await page.goto(`/admin/next/${list.path}`);
    await expect(page.locator(".loading-state")).toBeVisible();
    const headingBefore = await page.getByRole("heading", { level: 1 }).boundingBox();
    release();
    await expect(page.getByText(list.empty, { exact: true })).toBeVisible();
    await expect(page.locator(".empty-state").getByRole("button").or(page.locator(".empty-state").getByRole("link"))).toBeVisible();
    await expect(page.locator(".loading-state")).toHaveCount(0);
    const headingAfter = await page.getByRole("heading", { level: 1 }).boundingBox();
    expect(headingAfter?.y).toBe(headingBefore?.y);
  });

  for (const failure of [500, 403, 404, "network"] as const) {
    test(`${list.path} ${failure} retry recovers`, async ({ page }) => {
      await mockListApi(page, list);
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

for (const path of ["search-index/", "stores/readiness/?storeId=store-1"]) {
  test(`${path} expired session keeps the sign-in action`, async ({ page }) => {
    await mockVisualApi(page);
    const endpoint = path.startsWith("search") ? "**/api/admin/index" : "**/api/stores/store-1/readiness*";
    await page.route(endpoint, (route) => route.fulfill({ status: 401, json: { error: "SECRET_EXCEPTION" } }));
    await page.goto(`/admin/next/${path}`);
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("Sitzung abgelaufen");
    await expect(alert.getByRole("link", { name: "Erneut anmelden" })).toHaveAttribute("href", "/admin/");
    await expect(alert.getByRole("button", { name: "Erneut versuchen" })).toBeVisible();
    await expect(alert).not.toContainText("SECRET_EXCEPTION");
  });
}
