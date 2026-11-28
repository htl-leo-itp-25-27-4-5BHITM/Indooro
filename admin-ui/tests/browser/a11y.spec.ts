import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { staffRoutes } from "../../src/routes";

// Reuse the editor JSON and the populated response shapes from the existing route specs.
const layout = JSON.parse(readFileSync(new URL("../../src/editor/fixtures/store-layout.json", import.meta.url), "utf8"));
// Include a printable anchor as in anchor-print.spec.ts.
layout.elements.push({ id: 4, type: "anchor", x: 2, y: 3, width: 1, height: 1, label: "Gang 1 – Anfang", anchorId: "A1" });
const region = { id: "region-1", code: "AT-OOE", name: "Oberösterreich", description: "Pilotregion", status: "ACTIVE", createdAt: "2026-10-11T10:00:00Z", updatedAt: "2026-10-11T10:00:00Z" };
const store = { id: "store-1", storeCode: "LINZ-01", name: "Indooro Linz", street: "Testweg 1", zipCode: "4020", city: "Linz", country: "AT", latitude: null, longitude: null, notes: null, status: "ACTIVE", readinessProfile: "testroom", region, activeLayout: { id: "layout-1", versionNo: 3 }, activeBeaconCount: 1, hasActiveLayout: true };
const beacon = { id: "beacon-db-1", beaconCode: "IN-001", uuid: "123e4567-e89b-12d3-a456-426614174000", major: 1, minor: 2, identityKey: "123e4567-e89b-12d3-a456-426614174000:1:2", status: "ACTIVE", notes: null, currentStore: store, createdAt: region.createdAt, updatedAt: region.updatedAt };
const product = { id: 42, name: "Apfel", price: 1.5, layoutCode: "310/1/1/1", storeId: store.id, storeCode: store.storeCode };
const recipe = { id: "recipe-1", slug: "apfel-hafer", title: "Apfel-Hafer-Crumble", summary: "Kurz", description: "Beschreibung", imageUrl: null, imageAlt: null, servings: 4, prepTimeMinutes: 10, cookTimeMinutes: 20, totalTimeMinutes: 30, status: "DRAFT", mappedIngredientCount: 1, totalIngredientCount: 1, stepCount: 1, tags: [], ingredients: [{ id: "ingredient-1", position: 1, displayName: "Apfel", quantityText: "2 Stück", canonicalName: "Apfel", optional: false }], steps: [{ id: "step-1", position: 1, instruction: "Backen", durationMinutes: 20 }] };
const version = { layoutId: "layout-1", storeId: store.id, versionNo: 3, status: "ACTIVE", createdAt: region.createdAt, activatedAt: region.createdAt, layout };
const readiness = { storeId: store.id, layoutId: version.layoutId, layoutVersionNo: 3, radius: 8, status: "RED", blockingCount: 1, warningCount: 0, counts: { shelves: 1, entrances: 1, products: 1, placedBeacons: 1, assignedBeacons: 1, walkableCells: 300, lowCoverageCells: 12 }, findings: [{ severity: "BLOCKING", code: "PRODUCT_WITHOUT_SHELF", message: "Produkt hat keinen passenden Regalplatz.", productId: 42, elementId: null, layoutCode: "310/1/1/1", beaconCode: null }] };
const paged = (content: unknown[]) => ({ content, page: 0, size: 20, totalElements: content.length });

async function mockRoutes(page: Page) {
  const unexpected: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/stores/store-1/layout/underlay" && route.request().method() === "GET") {
      return route.fulfill({ status: 404, json: { error: "No underlay" } });
    }
    const responses: Record<string, unknown> = {
      "/api/admin/me": { subject: "admin-1", username: "admin", email: null, role: "admin", scope: null },
      "/api/regions": [region], "/api/regions/region-1": region,
      "/api/stores": paged([store]), "/api/stores/store-1": store,
      "/api/beacons": [beacon], "/api/beacons/free": [beacon],
      "/api/categories": [{ categoryCode: 310, categoryName: "Obst" }],
      "/api/admin/products": paged([product]), "/api/products": [product], "/api/products/search": [product],
      "/api/admin/recipes": paged([recipe]), "/api/admin/recipes/recipe-1": recipe, "/api/admin/recipe-tags": [],
      "/api/layout/current": layout, "/api/layout/history": [],
      "/api/stores/store-1/beacons": [{ beaconId: beacon.id, beaconCode: beacon.beaconCode, identityKey: beacon.identityKey, assignedAt: region.createdAt }],
      "/api/stores/store-1/layout/current": version, "/api/stores/store-1/layout/versions": [version],
      "/api/stores/store-1/layout/editor-context": { store, currentLayout: version, assignedBeacons: [beacon] },
      "/api/mobile/stores/store-1/layout/current": { storeId: store.id, layoutId: version.layoutId, source: "ACTIVE", fallback: false, layout },
      "/api/stores/store-1/readiness": readiness,
      "/api/stores/store-1/audit": { entries: [] },
      "/api/admin/logs": { entries: [{ id: "a1", entityType: "STORE", action: "UPDATE", summary: "Filiale geändert", actorLabel: "Admin", createdAt: region.createdAt }] },
      "/api/admin/error-logs": { entries: [{ id: "e1", statusCode: 500, method: "GET", path: "/api/stores", message: "Serverfehler", stackTrace: "Trace line", createdAt: region.createdAt }] },
      "/api/admin/index": { alias: "products_live", sourceIndex: "products_live", sourceCount: 153, activeIndices: ["products_v1"], versions: [{ name: "products_v1", docCount: 153, active: true }, { name: "products_v2", docCount: 150, active: false }] },
      "/api/admin/access-assignments": [{ id: "assignment-1", keycloakSubject: "sub-1", username: "marta", email: null, role: "store-manager", storeId: store.id, storeCode: store.storeCode, storeName: store.name, regionId: null, regionName: null, status: "ACTIVE", createdAt: region.createdAt, updatedAt: region.updatedAt }]
    };
    if (route.request().method() !== "GET" || !(path in responses)) {
      unexpected.push(`${route.request().method()} ${path}`);
      return route.fulfill({ status: 500, json: { error: "Unexpected accessibility fixture request" } });
    }
    return route.fulfill({ json: responses[path] });
  });
  return { unexpected, errors };
}

async function audit(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const violations = results.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
  expect(violations.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }))).toEqual([]);
}

const routes = [
  ...staffRoutes.map(({ path }) => path.replace("/admin/", "/admin/next/")),
  "/admin/next/stores/new/", "/admin/next/stores/detail/?storeId=store-1",
  "/admin/next/stores/readiness/?storeId=store-1", "/admin/next/stores/anchors/?storeId=store-1",
  "/admin/next/editor/?storeId=store-1"
];

for (const colorScheme of ["light", "dark"] as const) for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`${colorScheme} ${viewport.width}x${viewport.height}`, () => {
    test.use({ colorScheme, viewport, reducedMotion: "reduce" });
    for (const path of routes) {
      test(`WCAG 2.1 AA ${path}`, async ({ page }) => {
        const { unexpected, errors } = await mockRoutes(page);
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeAttached();
        // All API calls are local fixtures; wait for nested setup/editor requests as well.
        await page.waitForLoadState("networkidle");
        await expect(page.getByRole("alert")).toHaveCount(0);
        await audit(page);
        if (viewport.width === 390) {
          await page.getByRole("button", { name: "Menü", exact: true }).click();
          await expect(page.getByRole("navigation", { name: "Admin Navigation" })).toBeVisible();
          await audit(page);
          await page.getByRole("button", { name: "Menü", exact: true }).click();
        }
        const openers: Record<string, string[]> = {
          "/admin/next/regions/": ["Region anlegen"],
          "/admin/next/beacons/": ["Bearbeiten", "Mehrere anlegen"],
          "/admin/next/products/": ["Bearbeiten"],
          "/admin/next/categories/": ["Kategorie anlegen"],
          "/admin/next/recipes/": ["Vorschau", "Bearbeiten"],
          "/admin/next/stores/detail/?storeId=store-1": ["Bearbeiten"]
        };
        for (const name of openers[path] ?? []) {
          await page.getByRole("button", { name, exact: true }).first().click();
          await page.waitForLoadState("networkidle");
          await audit(page);
          const dialog = page.getByRole("dialog");
          if (await dialog.count()) await dialog.getByRole("button", { name: "Schließen", exact: true }).click();
        }
        if (path === "/admin/next/beacons/") {
          await page.getByRole("button", { name: `Weitere Aktionen für ${beacon.beaconCode}` }).click();
          await expect(page.locator(".row-menu:popover-open")).toBeVisible();
          await audit(page);
        }
        if (path.includes("/editor/")) {
          await page.locator(".le-layers button").filter({ hasText: "Obst & Gemüse" }).click();
          await expect(page.getByLabel("Bezeichnung")).toBeVisible();
          await audit(page);
          await page.getByRole("checkbox", { name: "Beacon-Abdeckung anzeigen" }).check();
          await audit(page);
          if (path.includes("storeId=")) {
            await page.getByRole("region", { name: "Aktuell mobiles Layout" }).scrollIntoViewIfNeeded();
            await audit(page);
          }
        }
        if (path === "/admin/next/server-logs/") {
          await page.getByText("Stacktrace", { exact: true }).click();
          await expect(page.getByText("Trace line", { exact: true })).toBeVisible();
          await audit(page);
        }
        expect(unexpected).toEqual([]);
        expect(errors).toEqual([]);
      });
    }
  });
}
