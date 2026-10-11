import { expect, test } from "@playwright/test";

test("editor renders malicious layout and store values literally", async ({ page }) => {
  const attack = '<img src=x onerror="window.__indooroXss=1">';
  await page.route("**/api/stores/store-1/layout/editor-context", (route) => route.fulfill({
    json: {
      store: { id: "store-1", name: attack, storeCode: attack },
      assignedBeacons: [{ beaconId: "beacon-1", beaconCode: attack, identityKey: attack }],
      currentLayout: {
        layoutId: "layout-1",
        layout: {
          shopName: "Test",
          gridSize: { width: 20, height: 20 },
          elements: [
            { id: "entrance-1", type: "entrance", x: 1, y: 1, width: 2, height: 2, label: "Eingang" },
            { id: "shelf-1", type: "shelf", x: 4, y: 4, width: 4, height: 2, label: attack }
          ]
        }
      }
    }
  }));

  await page.goto("/admin/editor/?storeId=store-1");
  await expect(page.locator("#storeContextBox")).toContainText(attack);
  await expect(page.locator("#assignedBeaconsList")).toContainText(attack);
  await expect(page.locator("#canvasContainer")).toContainText(attack);
  await expect(page.locator("#layersList")).toContainText(attack);
  await expect(page.locator("img[src=x]")).toHaveCount(0);
  expect(await page.evaluate(() => window.__indooroXss)).toBeUndefined();
});
