import { expect, test } from "@playwright/test";

test("admin product list pages through server results and opens a validated edit", async ({ page }) => {
  const requests: string[] = [];
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/categories?*", (route) => route.fulfill({ json: [{ categoryCode: 310, categoryName: "Obst" }] }));
  await page.route("**/api/admin/products?*", (route) => {
    const url = new URL(route.request().url());
    requests.push(url.search);
    const pageNo = Number(url.searchParams.get("page"));
    return route.fulfill({ json: { content: [{ id: 100 + pageNo, name: `Apfel ${pageNo}`, price: 1.5, layoutCode: "310/1/1/1", storeId: null, storeCode: null }], page: pageNo, size: 20, totalElements: 21 } });
  });
  await page.goto("/admin/next/products/?q=Apfel");
  await expect(page.getByRole("heading", { name: "Produkte", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "21 Produkte" })).toBeVisible();
  await expect(page.getByText("Apfel 0")).toBeVisible();
  await page.getByRole("link", { name: "Weiter" }).click();
  await expect(page).toHaveURL(/page=1/);
  await expect(page.getByText("Apfel 1")).toBeVisible();
  expect(requests.at(-1)).toContain("page=1");
  await page.getByRole("button", { name: "Bearbeiten" }).click();
  await expect(page.getByRole("heading", { name: "Produkt bearbeiten" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("Apfel 1");
});

test("product search submits with the keyboard and list failures can be retried", async ({ page }) => {
  const queries: string[] = [];
  let listCalls = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/categories?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/admin/products?*", (route) => {
    listCalls += 1;
    const url = new URL(route.request().url());
    queries.push(url.searchParams.get("q") ?? "");
    if (listCalls === 1) return route.fulfill({ status: 503, json: { message: "Katalog vorübergehend nicht verfügbar." } });
    return route.fulfill({ json: { content: [], page: 0, size: 20, totalElements: 0 } });
  });

  await page.goto("/admin/next/products/");
  await expect(page.getByRole("alert")).toContainText("Serverfehler. Bitte später erneut versuchen.");
  await page.getByRole("button", { name: "Erneut laden" }).click();
  await expect(page.getByText("Der Produktkatalog ist leer.")).toBeVisible();
  expect(listCalls).toBe(2);

  const search = page.getByRole("searchbox", { name: "Suche" });
  await search.fill("Birne");
  await search.press("Enter");
  await expect(page).toHaveURL(/q=Birne/);
  await expect(page.getByText("Keine Produkte zur Suche gefunden.")).toBeVisible();
  expect(queries.at(-1)).toBe("Birne");
});

test("region manager product direct link calls no product API", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "region-1", username: "manager", role: "region-manager", scope: { regionId: "region-1" } } }));
  await page.route("**/api/admin/products?*", (route) => { calls += 1; return route.fulfill({ json: { content: [], page: 0, size: 20, totalElements: 0 } }); });
  await page.goto("/admin/next/products/");
  await expect(page.getByRole("alert")).toContainText("Zugriff verweigert");
  expect(calls).toBe(0);
});

test("admin validates and creates a product with the documented layout code", async ({ page }) => {
  const products: Array<Record<string, unknown>> = [];
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/categories?*", (route) => route.fulfill({ json: [{ categoryCode: 310, categoryName: "Obst & Gemüse" }] }));
  await page.route("**/api/admin/products?*", (route) => route.fulfill({ json: { content: products, page: 0, size: 20, totalElements: products.length } }));
  await page.route("**/api/admin/products", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    writes.push(payload);
    products.push(payload);
    return route.fulfill({ json: payload });
  });

  await page.goto("/admin/next/products/");
  await page.getByRole("button", { name: "Produkt anlegen" }).click();
  await expect(page.getByText("Layout-Code: 310/1/1/1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Produkt-ID muss eine positive ganze Zahl sein.")).toBeVisible();
  await expect(page.getByText("Name ist erforderlich.")).toBeVisible();
  expect(writes).toHaveLength(0);

  await page.getByLabel("Produkt-ID").fill("7310");
  await page.getByRole("textbox", { name: "Name Name ist erforderlich." }).fill("  Tomaten  ");
  await page.getByLabel("Preis (EUR)").fill("1,99");
  await page.getByLabel("Kategorie").selectOption("310");
  await page.getByLabel("Meter (1–5)").selectOption("5");
  await page.getByLabel("Fach (1–7)").selectOption("7");
  await page.getByLabel("Reihe (1–3)").selectOption("3");
  await expect(page.getByText("Layout-Code: 310/5/7/3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Speichern" }).click();

  await expect(page.getByText("Produkt wurde angelegt.", { exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Tomaten" })).toBeVisible();
  expect(writes).toEqual([{ id: 7310, name: "Tomaten", price: 1.99, layoutCode: "310/5/7/3", storeId: null, storeCode: null }]);
});

test("admin can cancel product deletion or confirm it and sees the empty post-action state", async ({ page }) => {
  let product: Record<string, unknown> | null = { id: 42, name: "Tomaten", price: 1.99, layoutCode: "310/1/1/1", storeId: null, storeCode: null };
  let deleteCalls = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/categories?*", (route) => route.fulfill({ json: [{ categoryCode: 310, categoryName: "Obst & Gemüse" }] }));
  await page.route("**/api/admin/products?*", (route) => route.fulfill({ json: { content: product ? [product] : [], page: 0, size: 20, totalElements: product ? 1 : 0 } }));
  await page.route("**/api/admin/products/42", async (route) => {
    expect(route.request().method()).toBe("DELETE");
    deleteCalls += 1;
    product = null;
    return route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/admin/next/products/");
  await expect(page.getByRole("cell", { name: "Tomaten" })).toBeVisible();
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("Produkt Tomaten (#42) löschen?");
    void dialog.dismiss();
  });
  await page.getByRole("button", { name: "Löschen" }).click();
  expect(deleteCalls).toBe(0);
  await expect(page.getByRole("cell", { name: "Tomaten" })).toBeVisible();

  page.once("dialog", (dialog) => { void dialog.accept(); });
  await page.getByRole("button", { name: "Löschen" }).click();
  await expect(page.getByText("Produkt Tomaten wurde gelöscht.", { exact: true })).toBeVisible();
  await expect(page.getByText("Der Produktkatalog ist leer.")).toBeVisible();
  expect(deleteCalls).toBe(1);
});

test("product import reviews each NDJSON row and leaves bulk commit blocked", async ({ page }) => {
  let bulkCalls = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/categories?*", (route) => route.fulfill({ json: [{ categoryCode: 310, categoryName: "Obst" }] }));
  await page.route("**/api/admin/products?*", (route) => route.fulfill({ json: { content: [], page: 0, size: 20, totalElements: 0 } }));
  await page.route("**/api/products/bulk", (route) => { bulkCalls += 1; return route.fulfill({ json: {} }); });
  await page.goto("/admin/next/products/");
  await page.getByLabel("JSON-Array oder NDJSON").fill('{"id":4,"name":"Apfel","price":1.2,"layoutCode":"310/1/1/1"}\nnot json\n{"id":4,"name":"Birne","price":-1,"layoutCode":"310/9/1/1"}');
  await page.getByRole("button", { name: "Parsen und prüfen" }).click();
  await expect(page.getByRole("status")).toContainText("3 Zeilen · 1 gültig · 2 ungültig");
  await expect(page.getByText("Zeile 2 ist kein gültiges JSON")).toBeVisible();
  await expect(page.getByText("Doppelte id: 4.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Commit nicht verfügbar" })).toBeDisabled();
  expect(bulkCalls).toBe(0);
});
