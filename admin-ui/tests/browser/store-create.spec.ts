import { expect, test } from "@playwright/test";

test("region manager creates a scoped store and continues in detail", async ({ page }) => {
  let createdBody: Record<string, unknown> | null = null;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "region-1", username: "manager", role: "region-manager", scope: { regionId: "region-1", regionName: "Oberösterreich" } } }));
  await page.route("**/api/regions?status=ACTIVE", (route) => route.fulfill({ json: [{ id: "region-1", code: "AT-OOE", name: "Oberösterreich", status: "ACTIVE" }] }));
  await page.route("**/api/stores", (route) => { createdBody = route.request().postDataJSON(); return route.fulfill({ json: { id: "store-new", name: createdBody?.name } }); });
  await page.goto("/admin/next/stores/new/");
  await page.getByRole("textbox", { name: "Store-Code" }).fill("LINZ-02");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Indooro Linz Süd");
  await page.getByRole("textbox", { name: "Straße" }).fill("Bahnhofstraße 1");
  await page.getByRole("textbox", { name: "PLZ" }).fill("4020");
  await page.getByRole("textbox", { name: "Ort" }).fill("Linz");
  await page.getByRole("textbox", { name: "Land" }).fill("AT");
  await page.getByRole("button", { name: "Store anlegen" }).click();
  await expect(page.getByRole("heading", { name: "Store angelegt" })).toBeVisible();
  expect(createdBody?.regionId).toBe("region-1");
  expect(createdBody?.latitude).toBeNull();
  await expect(page.getByRole("link", { name: "Store-Detail öffnen" })).toHaveAttribute("href", "/admin/next/stores/detail/?storeId=store-new");
});

test("store manager cannot load store creation data", async ({ page }) => {
  let regionCalls = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "store-1", username: "manager", role: "store-manager", scope: { storeId: "store-1" } } }));
  await page.route("**/api/regions**", (route) => { regionCalls += 1; return route.fulfill({ json: [] }); });
  await page.goto("/admin/next/stores/new/");
  await expect(page.getByRole("alert")).toContainText("Zugriff verweigert");
  expect(regionCalls).toBe(0);
});
