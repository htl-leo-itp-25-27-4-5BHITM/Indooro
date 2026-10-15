import { expect, test } from "@playwright/test";

test("category create keeps input after conflict and reloads confirmed list", async ({ page }) => {
  const categories: Array<{ categoryCode: number; categoryName: string }> = [];
  let conflict = true;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/categories?size=500", (route) => route.fulfill({ json: categories }));
  await page.route("**/api/categories/310", (route) => route.fulfill({ status: 404, json: { error: "Category not found" } }));
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

test("category create checks the exact code before a legacy upsert can overwrite it", async ({ page }) => {
  const categories: Array<{ categoryCode: number; categoryName: string }> = [];
  let lookupStatus = 200;
  let writes = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/categories?size=500", (route) => route.fulfill({ json: categories }));
  await page.route("**/api/categories/310", (route) => route.fulfill({ status: lookupStatus, json: lookupStatus === 200 ? { categoryCode: 310, categoryName: "Bestehend" } : { error: "Lookup failed" } }));
  await page.route("**/api/categories", (route) => {
    writes += 1;
    const created = route.request().postDataJSON() as { categoryCode: number; categoryName: string };
    categories.push(created);
    return route.fulfill({ json: created });
  });
  await page.goto("/admin/next/categories/");
  await page.getByRole("button", { name: "Kategorie anlegen" }).click();
  await page.getByRole("spinbutton", { name: "Kategorie-Code" }).fill("310");
  await page.getByRole("textbox", { name: "Name" }).fill("Neuer Name");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("alert")).toContainText("existiert bereits");
  expect(writes).toBe(0);
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("Neuer Name");
  lookupStatus = 503;
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("alert")).toContainText("Serverfehler");
  expect(writes).toBe(0);
  lookupStatus = 404;
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("cell", { name: "Neuer Name" })).toBeVisible();
  expect(writes).toBe(1);
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

test("empty categories can be searched and category form is keyboard operable", async ({ page }) => {
  let categoryCalls = 0;
  let unexpectedApiCalls = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/**", (route) => {
    if (route.request().url().endsWith("/api/admin/me")) return route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } });
    if (route.request().url().endsWith("/api/categories?size=500")) { categoryCalls += 1; return route.fulfill({ json: [] }); }
    unexpectedApiCalls += 1;
    return route.fulfill({ status: 500, json: { error: "Unexpected API request" } });
  });
  await page.goto("/admin/next/categories/");
  const results = page.getByRole("region", { name: "Kategorie-Ergebnisse" });
  await expect(results).toContainText("0 Kategorien");
  await expect(results).toContainText("Keine Kategorie passt zur Suche.");
  const create = page.getByRole("button", { name: "Kategorie anlegen" });
  await page.locator("body").focus();
  for (let step = 0; step < 20 && !(await create.evaluate((element) => element === document.activeElement)); step += 1) await page.keyboard.press("Tab");
  await expect(create).toBeFocused();
  await page.keyboard.press("Enter");
  const code = page.getByRole("spinbutton", { name: "Kategorie-Code" });
  for (let step = 0; step < 5 && !(await code.evaluate((element) => element === document.activeElement)); step += 1) await page.keyboard.press("Tab");
  await expect(code).toBeFocused();
  await page.keyboard.press("Tab");
  const name = page.getByRole("textbox", { name: "Name" });
  await expect(name).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Speichern" })).toBeFocused();
  expect(categoryCalls).toBe(1);
  expect(unexpectedApiCalls).toBe(0);
});

test("category load error offers a working retry and makes no unrelated API calls", async ({ page }) => {
  let categoryCalls = 0;
  let unexpectedApiCalls = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/**", (route) => {
    if (route.request().url().endsWith("/api/admin/me")) return route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } });
    if (route.request().url().endsWith("/api/categories?size=500")) {
      categoryCalls += 1;
      return categoryCalls === 1 ? route.fulfill({ status: 503, json: { error: "Katalog nicht verfügbar" } }) : route.fulfill({ json: [{ categoryCode: 310, categoryName: "Obst" }] });
    }
    unexpectedApiCalls += 1;
    return route.fulfill({ status: 500, json: { error: "Unexpected API request" } });
  });
  await page.goto("/admin/next/categories/");
  await expect(page.getByRole("alert")).toContainText("Kategorien konnten nicht geladen werden");
  await page.getByRole("button", { name: "Erneut versuchen" }).click();
  await expect(page.getByRole("cell", { name: "Obst" })).toBeVisible();
  expect(categoryCalls).toBe(2);
  expect(unexpectedApiCalls).toBe(0);
});
