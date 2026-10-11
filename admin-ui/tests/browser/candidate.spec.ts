import { expect, test } from "@playwright/test";

test("candidate root and nested deep link load built assets on direct refresh", async ({ page }) => {
  const failedAssets: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/admin/next/assets/") && !response.ok()) failedAssets.push(response.url());
  });

  const root = await page.goto("/admin/next/");
  expect(root?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Indooro Admin" })).toBeVisible();

  const nested = await page.goto("/admin/next/stores/detail/?storeId=example");
  expect(nested?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Indooro Admin" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Indooro Admin" })).toBeVisible();
  expect(failedAssets).toEqual([]);
});
