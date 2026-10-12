import { expect, test } from "@playwright/test";

test("category create keeps input after conflict and reloads confirmed list", async ({ page }) => {
  const categories: Array<{ categoryCode: number; categoryName: string }> = [];
  let conflict = true;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/categories?size=500", (route) => route.fulfill({ json: categories }));
  await page.route("**/api/categories", (route) => {
    if (conflict) return route.fulfill({ status: 409, json: { error: "Code existiert bereits" } });
    const created = route.request().postDataJSON() as { categoryCode: number; categoryName: string };
    categories.push(created);
    return route.fulfill({ json: created });
  });
  await page.goto("/admin/next/categories/");
  await page.getByRole("button", { name: "Kategorie anlegen" }).click();
  await page.getByRole("spinbutton", { name: "Kategorie-Code" }).fill("310");
  await page.getByRole("textbox", { name: "Name" }).fill("Obst & Gemüse");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("alert")).toContainText("Code existiert bereits");
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("Obst & Gemüse");
  conflict = false;
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("cell", { name: "Obst & Gemüse" })).toBeVisible();
});

test("scoped user cannot load category candidate", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "store-1", username: "manager", role: "store-manager", scope: { storeId: "store-1" } } }));
  await page.route("**/api/categories?*", (route) => { calls += 1; return route.fulfill({ json: [] }); });
  await page.goto("/admin/next/categories/");
  await expect(page.getByRole("alert")).toContainText("Zugriff verweigert");
  expect(calls).toBe(0);
});

test("category import reports duplicate codes and does not call the bulk endpoint", async ({ page }) => {
  let bulkCalls = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/categories?size=500", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/categories/bulk", (route) => { bulkCalls += 1; return route.fulfill({ json: {} }); });
  await page.goto("/admin/next/categories/");
  await page.getByLabel("JSON-Array oder NDJSON").fill('[{"categoryCode":310,"categoryName":"Obst"},{"categoryCode":310,"categoryName":"Gemüse"},{"categoryCode":420,"categoryName":" "}]');
  await page.getByRole("button", { name: "Parsen und prüfen" }).click();
  await expect(page.getByRole("status")).toContainText("3 Zeilen · 1 gültig · 2 ungültig");
  await expect(page.getByText("Doppelte categoryCode: 310.")).toBeVisible();
  await expect(page.getByText("categoryName ist erforderlich.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Commit nicht verfügbar" })).toBeDisabled();
  expect(bulkCalls).toBe(0);
});
