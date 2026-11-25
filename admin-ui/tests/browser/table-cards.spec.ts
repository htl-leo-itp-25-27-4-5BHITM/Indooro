import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

const store = { id: "store-1", storeCode: "AT-OOE-LINZ-HAUPTPLATZ-0001", name: "Indooro Linz Hauptplatz", status: "ACTIVE", region: null };
const beacon = {
  id: "beacon-1", beaconCode: "BEACON-LINZ-HAUPTPLATZ-EINGANG-0001", uuid: "fda50693a4e24fb1afcfc6eb07647825", major: 1, minor: 1,
  identityKey: "fda50693a4e24fb1afcfc6eb07647825:1:1", status: "ACTIVE", notes: null, currentStore: store, createdAt: "", updatedAt: ""
};

test("tables show one card per row on phones, without sideways scrolling", async ({ page }) => {
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/stores?*", (route) => route.fulfill({ json: { content: [store], page: 0, size: 100, totalElements: 1 } }));
  await page.route("**/api/beacons**", (route) => route.fulfill({ json: [beacon] }));
  await page.goto("/admin/next/beacons/");

  const row = page.locator(".data-table tbody tr");
  await expect(row.locator('td[data-label="Status"]')).toBeVisible();
  await expect(row.getByRole("button", { name: "Bearbeiten" })).toBeVisible();
  await expect(page.getByText("Tabelle seitlich scrollen")).toHaveCount(0);
  expect(await page.locator(".table-scroll").evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
  // The select-all checkbox of the hidden table head stays usable.
  await page.getByRole("checkbox", { name: "Alle zuweisbaren Beacons auswählen" }).check();
  await expect(page.getByText("1 ausgewählt")).toBeVisible();

  const card = await row.boundingBox();
  const actions = await row.locator("td[data-actions]").boundingBox();
  expect(actions!.width).toBeGreaterThan(card!.width * 0.85);
});
