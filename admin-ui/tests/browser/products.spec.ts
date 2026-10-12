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
  await expect(page.getByRole("heading", { name: "Produkte" })).toBeVisible();
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

test("region manager product direct link calls no product API", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "region-1", username: "manager", role: "region-manager", scope: { regionId: "region-1" } } }));
  await page.route("**/api/admin/products?*", (route) => { calls += 1; return route.fulfill({ json: { content: [], page: 0, size: 20, totalElements: 0 } }); });
  await page.goto("/admin/next/products/");
  await expect(page.getByRole("alert")).toContainText("Zugriff verweigert");
  expect(calls).toBe(0);
});
