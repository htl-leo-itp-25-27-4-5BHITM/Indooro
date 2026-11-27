import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

// Same deterministic API records as store-detail, products, recipes and polish-contract specs.
const region = { id: "region-1", code: "AT-OOE", name: "Oberösterreich" };
const store = { id: "store-1", storeCode: "LINZ-01", name: "Indooro Linz", street: "Hauptstraße 1", zipCode: "4020", city: "Linz", country: "AT", latitude: null, longitude: null, notes: "Alt", status: "ACTIVE", region, activeLayout: null, activeBeaconCount: 1 };
const beacon = { id: "beacon-1", beaconCode: "BC-1", uuid: "fda50693a4e24fb1afcfc6eb07647825", major: 1, minor: 1, identityKey: "uuid:1:1", status: "ACTIVE", notes: null, currentStore: store, createdAt: "2026-10-11T09:00:00Z", updatedAt: "2026-10-11T09:00:00Z" };
const tag = { id: "tag-1", code: "VEGAN", name: "Vegan" };
const recipe = { id: "recipe-1", slug: "apfel-hafer", title: "Apfel-Hafer-Crumble", summary: "Kurz", servings: 4, status: "DRAFT", mappedIngredientCount: 1, totalIngredientCount: 1, stepCount: 1, tags: [tag] };
const layout = JSON.parse(readFileSync(new URL("../../../src/editor/fixtures/store-layout.json", import.meta.url), "utf8")) as unknown;

export async function mockVisualApi(page: Page, empty = false, keepStore = false) {
  const records = (items: unknown[]) => empty ? [] : items;
  const collection = (items: unknown[], size = 20) => ({ content: records(items), page: 0, size, totalElements: empty ? 0 : items.length });
  const responses: Record<string, unknown> = {
    "/api/admin/me": { subject: "admin-1", username: "admin", role: "admin", scope: null },
    "/api/regions": [region],
    "/api/stores": keepStore ? { content: [store], page: 0, size: 100, totalElements: 1 } : collection([store], 100),
    "/api/stores/store-1": store,
    "/api/stores/store-1/beacons": [{ beaconId: "beacon-1", beaconCode: "BC-1", identityKey: "uuid:1:1", assignedAt: "2026-10-11T10:00:00Z" }],
    "/api/stores/store-1/layout/versions": [{ layoutId: "layout-1", versionNo: 2, status: "DRAFT", layoutName: "Verkaufsfläche", createdAt: "2026-10-10T08:00:00Z" }],
    "/api/stores/store-1/layout/editor-context": { store, currentLayout: { layoutId: "layout-1", versionNo: 2, status: "DRAFT", layout }, assignedBeacons: [] },
    "/api/stores/store-1/audit": { entries: [{ id: "audit-1", entityType: "STORE", action: "UPDATED", summary: "Filiale geändert", actorLabel: "Admin", createdAt: "2026-10-11T10:00:00Z" }] },
    "/api/stores/store-1/readiness": { storeId: "store-1", layoutId: null, layoutVersionNo: null, radius: 10, status: "RED", blockingCount: 0, warningCount: 0, counts: { shelves: 0, entrances: 0, products: 0, placedBeacons: 0, assignedBeacons: 1, walkableCells: 0, lowCoverageCells: 0 }, findings: [], profile: "testroom", coverageComputed: false, minBeaconsPerCell: 3, maxLowCoverageShare: 0.05 },
    "/api/mobile/stores/store-1/layout/current": { storeId: "store-1", source: "DEFAULT", layoutId: null, versionNo: null, fallback: true, layout },
    "/api/products": [],
    "/api/beacons": records([beacon]),
    "/api/beacons/free": [],
    "/api/categories": records([{ categoryCode: 310, categoryName: "Obst" }]),
    "/api/admin/products": collection([{ id: 100, name: "Apfel 0", price: 1.5, layoutCode: "310/1/1/1", storeId: store.id, storeCode: store.storeCode }]),
    "/api/admin/recipe-tags": [tag],
    "/api/admin/recipes": collection([recipe]),
    "/api/admin/logs": { entries: [{ id: "event-1", action: "UPDATE", summary: "Layout veröffentlicht", createdAt: "2026-10-11T12:00:00Z" }] }
  };
  // Unexpected API calls fail explicitly instead of leaking through to a live service.
  await page.route("**/api/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/stores/store-1/layout/underlay") return route.fulfill({ status: 404, json: { error: "not found" } });
    if (!(pathname in responses)) throw new Error(`Missing visual API fixture: ${pathname}`);
    return route.fulfill({ json: responses[pathname] });
  });
  await page.clock.setFixedTime(new Date("2026-10-12T10:00:00Z"));
}
