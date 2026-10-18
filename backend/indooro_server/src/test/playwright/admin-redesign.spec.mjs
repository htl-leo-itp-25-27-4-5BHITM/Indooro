import { expect, test } from "@playwright/test";

async function useLegacyRoute(page, routeKey) {
  await page.route("**/admin/route-cutover.js", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      new RegExp(`(${routeKey}: )true\\b`),
      "$1false"
    );
    await route.fulfill({ response, body });
  });
}

const routes = [
  ["/admin/", "Dashboard", "dashboard"],
  ["/admin/regions/", "Regionen", "regions"],
  ["/admin/stores/", "Stores", "stores"],
  ["/admin/stores/detail/?storeId=store-1", "Store Detail", "storeDetail"],
  ["/admin/beacons/", "Beacons", "beacons"],
  ["/admin/products/", "Produkte", "products"],
  ["/admin/categories/", "Kategorien", "categories"],
  ["/admin/recipes/", "Rezepte", "recipes"],
  ["/admin/server-logs/", "Diagnose", "diagnostics"]
];

for (const [path, title, routeKey] of routes) {
  test(`renders ${path}`, async ({ page }) => {
    await useLegacyRoute(page, routeKey);
    await page.goto(path);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Admin Navigation" })).toBeVisible();
  });
}

test("logout uses the configured OIDC path", async ({ page }) => {
  await useLegacyRoute(page, "dashboard");
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/admin\/logout$/);
});

test("store layout version badges use status", async ({ page }) => {
  await useLegacyRoute(page, "storeDetail");
  await page.route("**/api/stores/store-1/layout/versions", (route) => route.fulfill({
    json: [
      { layoutId: "layout-1", versionNo: 1, status: "ARCHIVED" },
      { layoutId: "layout-2", versionNo: 2, status: "ACTIVE" }
    ]
  }));
  await page.goto("/admin/stores/detail/?storeId=store-1");
  await expect(page.getByText("Version 2").locator("..")).toContainText("Aktiv");
  await expect(page.getByText("Version 1").locator("..")).not.toContainText("Aktiv");
});

test("recipe list shows missing steps from summary stepCount", async ({ page }) => {
  await useLegacyRoute(page, "recipes");
  await page.route("**/api/admin/recipes", (route) => route.fulfill({
    json: [{ id: "recipe-1", slug: "apfelkuchen", title: "Apfelkuchen", status: "DRAFT", totalIngredientCount: 1, mappedIngredientCount: 1, stepCount: 0, tags: [] }]
  }));
  await page.goto("/admin/recipes/");
  await expect(page.getByRole("row", { name: /Apfelkuchen/ })).toContainText("Keine Schritte");
});

test("product form shows the documented layout code", async ({ page }) => {
  await useLegacyRoute(page, "products");
  await page.goto("/admin/products/");
  await page.getByRole("button", { name: "Produkt anlegen" }).click();
  await expect(page.getByPlaceholder("310/1/1/1")).toBeVisible();
});

test("bulk beacons send null for an empty major", async ({ page }) => {
  await useLegacyRoute(page, "beacons");
  let requestBody;
  await page.route("**/api/beacons/bulk", (route) => {
    requestBody = route.request().postDataJSON();
    return route.fulfill({ json: [] });
  });
  await page.goto("/admin/beacons/");
  await page.getByRole("button", { name: "Bulk anlegen" }).click();
  await page.getByPlaceholder("fda50693-a4e2-4fb1-afcf-c6eb07647825").fill("fda50693-a4e2-4fb1-afcf-c6eb07647825");
  await page.getByPlaceholder("B-001,1\nB-002,2\nB-003,3").fill("B-002,2");
  await page.getByRole("button", { name: "Review & Commit" }).click();
  await expect.poll(() => requestBody?.major).toBeNull();
});

test("renders layout editor canvas and professional tool panels", async ({ page }) => {
  await page.goto("/admin/editor/?storeId=store-1&legacy=1");
  await expect(page.getByRole("heading", { name: "Layout Editor" })).toBeVisible();
  await expect(page.locator("#canvasContainer")).toBeVisible();
  await expect(page.locator("#propertiesWrapper")).toBeVisible();
  await expect(page.locator("#layersList")).toBeVisible();
  await expect(page.locator("#validationPanel")).toBeVisible();
  await page.getByRole("button", { name: "Validate" }).click();
  await expect(page.locator("#validationPanel")).toContainText(/Layout|Warnung|Fehler|bereit/i);
});

test("renders recipe list controls and edit entry points", async ({ page }) => {
  await useLegacyRoute(page, "recipes");
  await page.goto("/admin/recipes/");
  await expect(page.getByRole("heading", { name: "Rezepte" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rezept anlegen" })).toBeVisible();
  await expect(page.getByText("Rezepte suchen")).toBeVisible();
  await expect(page.locator('[data-filter="query"]')).toBeVisible();
  await expect(page.locator(".filters label", { hasText: "Status" })).toBeVisible();
  await expect(page.locator('[data-filter="status"]')).toBeVisible();
  await expect(page.locator(".filters label", { hasText: "Sortierung" })).toBeVisible();
  await expect(page.locator('[data-filter="sort"]')).toBeVisible();
  await expect(page.locator("strong", { hasText: "Apfelkuchen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bearbeiten" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mapping" })).toBeVisible();
  await page.getByRole("button", { name: "Mapping" }).click();
  await expect(page.getByRole("heading", { name: "Zutaten-Mapping" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Produkt suchen" })).toBeVisible();
  await expect(page.getByRole("option", { name: /Apfel/ })).toBeVisible();
});

test("recipe create form offers product dropdown for ingredients", async ({ page }) => {
  await useLegacyRoute(page, "recipes");
  await page.goto("/admin/recipes/");
  await page.getByRole("button", { name: "Rezept anlegen" }).click();
  await expect(page.getByRole("heading", { name: "Rezept anlegen" })).toBeVisible();
  const productSearch = page.getByRole("combobox", { name: "Produkt aus Katalog" });
  await expect(productSearch).toBeVisible();
  await productSearch.fill("Ap");
  await expect(page.getByRole("option", { name: /Apfel/ })).toBeVisible();
});
