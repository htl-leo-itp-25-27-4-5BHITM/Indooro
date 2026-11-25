import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Layout contract of the platform polish: no document scrolling where the page has its own scroll areas.
test.use({ viewport: { width: 1280, height: 800 } });

const long = "Indooro Verkaufsfläche Linz Hauptplatz mit Nahversorgung und Abholstation";
const uuid = "fda50693a4e24fb1afcfc6eb07647825";
const store = {
  id: "store-1", storeCode: "AT-OOE-LINZ-HAUPTPLATZ-0001", name: long, status: "ACTIVE", city: "Linz-Urfahr an der Donau",
  region: { id: "region-1", code: "AT-OOE", name: "Oberösterreich und Salzkammergut" }, activeBeaconCount: 12,
  activeLayout: { versionNo: 14, status: "ACTIVE" }, updatedAt: "2026-10-11T09:00:00Z"
};
const beacon = {
  id: "beacon-1", beaconCode: "BEACON-LINZ-HAUPTPLATZ-EINGANG-0001", uuid, major: 65535, minor: 65535, identityKey: `${uuid}:65535:65535`,
  status: "ACTIVE", notes: long, currentStore: store, createdAt: "2026-10-11T09:00:00Z", updatedAt: "2026-10-11T09:00:00Z"
};
const product = { id: 2147483000, name: long, price: 12345.99, layoutCode: "9999/5/7/3", storeId: store.id, storeCode: store.storeCode };

async function mockInventory(page: Page) {
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/regions**", (route) => route.fulfill({ json: [store.region] }));
  await page.route("**/api/stores?*", (route) => route.fulfill({ json: { content: [store], page: 0, size: 100, totalElements: 1 } }));
  await page.route("**/api/beacons**", (route) => route.fulfill({ json: [beacon] }));
  await page.route("**/api/categories?*", (route) => route.fulfill({ json: [{ categoryCode: 9999, categoryName: long }] }));
  await page.route("**/api/admin/products?*", (route) => route.fulfill({ json: { content: [product], page: 0, size: 20, totalElements: 1 } }));
}

for (const [path, rowText] of [["stores", store.storeCode], ["beacons", beacon.beaconCode], ["products", String(product.id)]] as const) {
  test(`${path} page has no horizontal document scroll at 1280 px`, async ({ page }) => {
    await mockInventory(page);
    await page.goto(`/admin/next/${path}/`);
    await expect(page.locator(".data-table tbody tr").filter({ hasText: rowText })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  });
}

test("layout editor fits the 1280x800 viewport without document scrolling", async ({ page }) => {
  const layout = JSON.parse(readFileSync(new URL("../../src/editor/fixtures/store-layout.json", import.meta.url), "utf8")) as unknown;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/categories?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/stores/store-1/layout/editor-context", (route) => route.fulfill({ json: { store: { id: "store-1", storeCode: "LINZ-1", name: long }, currentLayout: { layoutId: "current-1", versionNo: 1, status: "DRAFT", layout }, assignedBeacons: [] } }));
  await page.route("**/api/stores/store-1/layout/versions", (route) => route.fulfill({ json: [{ layoutId: "current-1", versionNo: 1, status: "DRAFT", layoutName: long }] }));
  await page.goto("/admin/next/editor/?storeId=store-1");
  await expect(page.getByRole("button", { name: "Entwurf speichern" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBe(0);
});
