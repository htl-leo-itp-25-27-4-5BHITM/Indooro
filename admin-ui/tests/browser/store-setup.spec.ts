import { expect, test, type Page } from "@playwright/test";

const store = {
  id: "store-1", storeCode: "SPAR-2", name: "Spar HTL Leonding", street: "Limesstraße 12", zipCode: "4060", city: "Leonding", country: "AT",
  latitude: null, longitude: null, notes: null, status: "ACTIVE", readinessProfile: "testroom",
  region: { id: "region-1", code: "AT-OOE", name: "Oberösterreich" }, activeLayout: { id: "layout-1", versionNo: 3 }
};

function report(overrides: Record<string, unknown> = {}) {
  return {
    storeId: "store-1", layoutId: "layout-1", layoutVersionNo: 3, radius: 10, status: "GREEN", blockingCount: 0, warningCount: 0,
    counts: { shelves: 12, entrances: 1, products: 0, placedBeacons: 9, assignedBeacons: 9, walkableCells: 400, lowCoverageCells: 8 },
    findings: [], profile: "testroom", coverageComputed: true, minBeaconsPerCell: 3, maxLowCoverageShare: 0.05, ...overrides
  };
}

async function mockStore(page: Page, role: "admin" | "store-manager", options: { readiness: unknown; products: unknown[]; hits?: unknown[] }) {
  const scope = role === "admin" ? null : { regionId: "region-1", regionName: "Oberösterreich", storeId: "store-1", storeName: "Spar HTL Leonding" };
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "u-1", username: "user", email: null, role, scope } }));
  await page.route("**/api/regions", (route) => route.fulfill({ json: [store.region] }));
  await page.route("**/api/stores/store-1", (route) => route.fulfill({ json: store }));
  await page.route("**/api/stores/store-1/beacons", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/stores/store-1/layout/versions", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/stores/store-1/audit", (route) => route.fulfill({ json: { entries: [] } }));
  await page.route("**/api/beacons/free", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/stores/store-1/readiness*", (route) => route.fulfill({ json: options.readiness }));
  await page.route("**/api/mobile/stores/store-1/layout/current", (route) => route.fulfill({ json: { storeId: "store-1", source: "ACTIVE", fallback: false, layout: {} } }));
  await page.route("**/api/products?*", (route) => route.fulfill({ json: options.products }));
  await page.route("**/api/products/search?*", (route) => route.fulfill({ json: options.hits ?? [] }));
}

test("setup checklist shows done, problem and open steps with a link to the fixing page", async ({ page }) => {
  await mockStore(page, "admin", {
    readiness: report({
      status: "RED", blockingCount: 1,
      findings: [{ severity: "BLOCKING", code: "LAYOUT_BEACON_NOT_REGISTERED", message: "Beacon im Layout ist nicht registriert.", elementId: "9", productId: null, layoutCode: null, beaconCode: "B-9" }]
    }),
    products: []
  });
  await page.goto("/admin/next/stores/detail/?storeId=store-1");

  const section = page.getByRole("region", { name: "Einrichtung" });
  await expect(section.getByRole("listitem")).toHaveCount(7);
  await expect(section.locator(".setup-summary")).toContainText("3 von 7 Schritten erledigt. Als Nächstes: Beacons registriert und im Layout platziert.");

  const step = (id: string) => section.locator(`li[data-step="${id}"]`);
  await expect(step("store")).toHaveAttribute("data-status", "done");
  await expect(step("layout")).toHaveAttribute("data-status", "done");
  await expect(step("shelves")).toHaveAttribute("data-status", "done");
  await expect(step("beacons")).toHaveAttribute("data-status", "problem");
  await expect(step("beacons")).toContainText("Problem");
  await expect(step("beacons").getByRole("link", { name: "Beacons verwalten" })).toHaveAttribute("href", "/admin/next/beacons/?storeId=store-1");
  await expect(step("catalog")).toHaveAttribute("data-status", "open");
  await expect(step("catalog").getByRole("link", { name: "CSV-Import öffnen" })).toHaveAttribute("href", "/admin/next/products/");
  await expect(step("search")).toHaveAttribute("data-status", "open");
  await expect(step("readiness")).toHaveAttribute("data-status", "problem");
  await expect(step("readiness").getByRole("link", { name: "Pilot-Bereitschaft öffnen" })).toHaveAttribute("href", "/admin/next/stores/readiness/?storeId=store-1");
  await expect(section.getByRole("link", { name: "Anleitung: Markt einrichten" })).toHaveAttribute("href", /MARKT_EINRICHTEN\.md$/);
});

test("setup checklist is complete for a ready store and hides admin-only links from a store manager", async ({ page }) => {
  await mockStore(page, "store-manager", {
    readiness: report({ counts: { shelves: 12, entrances: 1, products: 40, placedBeacons: 9, assignedBeacons: 9, walkableCells: 400, lowCoverageCells: 8 } }),
    products: [{ id: 7, name: "Apfel" }],
    hits: [{ id: 7, name: "Apfel" }]
  });
  await page.goto("/admin/next/stores/detail/?storeId=store-1");
  const section = page.getByRole("region", { name: "Einrichtung" });
  await expect(section.locator(".setup-summary")).toContainText("Alle 7 Schritte erledigt.");
  await expect(section.locator('li[data-status="done"]')).toHaveCount(7);

  // A search that misses the product is a problem; the store manager may not open the admin-only search index.
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await mockStore(page, "store-manager", { readiness: report(), products: [{ id: 7, name: "Apfel" }], hits: [] });
  await page.reload();
  const search = page.getByRole("region", { name: "Einrichtung" }).locator('li[data-step="search"]');
  await expect(search).toHaveAttribute("data-status", "problem");
  await expect(search.getByRole("link")).toHaveCount(0);
  await expect(search).toContainText("Administrator");
});
