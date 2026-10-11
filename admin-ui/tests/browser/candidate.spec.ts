import { expect, test } from "@playwright/test";

test("candidate root and nested deep link load built assets on direct refresh", async ({ page }) => {
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", email: null, role: "admin", scope: null } }));
  const failedAssets: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/admin/next/assets/") && !response.ok()) failedAssets.push(response.url());
  });

  const root = await page.goto("/admin/next/");
  expect(root?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Indooro Admin" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Admin Navigation" })).toBeVisible();

  const nested = await page.goto("/admin/next/stores/detail/?storeId=example");
  expect(nested?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Indooro Admin" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Indooro Admin" })).toBeVisible();
  expect(failedAssets).toEqual([]);
});

test("candidate navigation follows staff role and offers logout", async ({ page }) => {
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "store-1", username: "store-manager", email: null, role: "store-manager", scope: { storeId: "store-1", storeName: "Indooro Linz" } } }));
  await page.goto("/admin/next/stores/detail/?storeId=store-1");
  const navigation = page.getByRole("navigation", { name: "Admin Navigation" });
  await expect(navigation.getByRole("link", { name: "Stores" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Rezepte" })).toHaveCount(0);
  await expect(page.getByText("Indooro Linz")).toBeVisible();
  await expect(page.getByRole("link", { name: "Logout" })).toHaveAttribute("href", "/admin/logout");
  await page.goto("/admin/next/stores/detail/?storeId=store-2");
  await expect(page.getByRole("alert")).toContainText("Zugriff verweigert");
});

test("candidate displays session and role denial states", async ({ page }) => {
  await page.route("**/api/admin/me", (route) => route.fulfill({ status: 401, json: { error: "Unauthorized" } }));
  await page.goto("/admin/next/");
  await expect(page.getByRole("alert")).toContainText("Sitzung abgelaufen");
  await expect(page.getByRole("link", { name: "Erneut anmelden" })).toHaveAttribute("href", "/admin/");

  await page.unroute("**/api/admin/me");
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "viewer-1", username: "viewer", email: null, role: "viewer", scope: null } }));
  await page.goto("/admin/next/stores/detail/?storeId=store-1");
  await expect(page.getByRole("alert")).toContainText("Zugriff verweigert");
  await expect(page.getByRole("navigation", { name: "Admin Navigation" }).getByRole("link")).toHaveCount(0);
});
