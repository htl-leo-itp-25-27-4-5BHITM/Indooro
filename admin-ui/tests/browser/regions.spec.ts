import { expect, test } from "@playwright/test";

test("admin region create retains input after conflict and reloads confirmed detail", async ({ page }) => {
  const regions: Array<Record<string, unknown>> = [];
  let fail = true;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/regions?status=ACTIVE", (route) => route.fulfill({ json: regions }));
  await page.route("**/api/regions", (route) => {
    if (fail) return route.fulfill({ status: 409, json: { error: "Code existiert bereits" } });
    const region = { id: "region-1", status: "ACTIVE", ...route.request().postDataJSON() };
    regions.push(region);
    return route.fulfill({ json: region });
  });
  await page.route("**/api/regions/region-1", (route) => route.fulfill({ json: regions[0] }));
  await page.goto("/admin/next/regions/");
  await page.getByRole("button", { name: "Region anlegen" }).click();
  await page.getByRole("textbox", { name: "Code" }).fill("AT-OOE");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Oberösterreich");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("alert")).toContainText("Code existiert bereits");
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Oberösterreich");
  fail = false;
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Oberösterreich" })).toBeVisible();
});

test("store manager is denied region route without region API calls", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "store-1", username: "store-manager", role: "store-manager", scope: { storeId: "store-1" } } }));
  await page.route("**/api/regions**", (route) => { requests += 1; return route.fulfill({ json: [] }); });
  await page.goto("/admin/next/regions/");
  await expect(page.getByRole("alert")).toContainText("Zugriff verweigert");
  expect(requests).toBe(0);
});
