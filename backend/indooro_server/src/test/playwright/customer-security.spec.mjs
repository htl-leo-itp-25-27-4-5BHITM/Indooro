import { expect, test } from "@playwright/test";

test("customer map and search treat layout and product text as data", async ({ page }) => {
  const attack = '<img src=x onerror="window.__indooroXss=1">';
  await page.route("**/api/layout/current", (route) => route.fulfill({
    json: {
      shopName: attack,
      gridSize: { width: 20, height: 20 },
      elements: [
        { id: "shelf-1", type: "shelf", x: 2, y: 2, width: 4, height: 2, category: "310/1", label: attack },
        { id: "beacon-1", type: "beacon", x: 10, y: 10, beaconId: attack }
      ]
    }
  }));
  await page.route("**/api/products/search?*", (route) => route.fulfill({
    json: [{ id: 1, name: attack, price: 1.99, layoutCode: "310/1/1/1" }]
  }));

  await page.goto("/customer/");
  await expect(page.locator("#shopNameDisplay")).toHaveText(attack);
  await expect(page.locator("#mapCanvas")).toContainText(attack);
  await page.locator("#search-input").fill("Apfel");
  await expect(page.locator("#search-results-panel .product-name")).toHaveText(attack);
  await expect(page.locator("img[src=x]")).toHaveCount(0);
  expect(await page.evaluate(() => window.__indooroXss)).toBeUndefined();
});
