import assert from "node:assert/strict";
import test from "node:test";
import { ApiClientError, type ApiClient } from "./api/client";
import type { ReadinessFinding, ReadinessReport } from "./api/readiness";
import { deriveSetupSteps, loadSetupInput, setupSummary, type SetupInput, type SetupStepStatus } from "./storeSetup";

function finding(code: string, severity: "BLOCKING" | "WARNING" = "BLOCKING"): ReadinessFinding {
  return { severity, code, message: code, elementId: null, productId: null, layoutCode: null, beaconCode: null };
}

function report(overrides: Partial<ReadinessReport> = {}): ReadinessReport {
  return {
    storeId: "store-1", layoutId: "layout-1", layoutVersionNo: 3, radius: 8, status: "GREEN", blockingCount: 0, warningCount: 0,
    counts: { shelves: 12, entrances: 1, products: 40, placedBeacons: 6, assignedBeacons: 6, walkableCells: 300, lowCoverageCells: 0 },
    findings: [], profile: "market", coverageComputed: true, minBeaconsPerCell: 3, maxLowCoverageShare: 0.05,
    ...overrides
  };
}

const readyInput: SetupInput = {
  store: { id: "store-1", status: "ACTIVE", activeLayout: { id: "layout-1", versionNo: 3 } },
  mobileLayoutFallback: false,
  readiness: report(),
  storeProductCount: 1,
  search: { query: "Apfel", found: true }
};

const emptyInput: SetupInput = {
  store: { id: "store-1", status: "ACTIVE", activeLayout: null },
  mobileLayoutFallback: true,
  readiness: report({ layoutId: null, layoutVersionNo: null, status: "RED", blockingCount: 1, findings: [finding("NO_ACTIVE_LAYOUT")], counts: { shelves: 0, entrances: 0, products: 0, placedBeacons: 0, assignedBeacons: 0, walkableCells: 0, lowCoverageCells: 0 } }),
  storeProductCount: 0,
  search: "no-products"
};

function statuses(input: SetupInput): Record<string, SetupStepStatus> {
  return Object.fromEntries(deriveSetupSteps(input).map((step) => [step.id, step.status]));
}

test("the seven steps come in the order of the operator guide", () => {
  assert.deepEqual(deriveSetupSteps(readyInput).map((step) => step.id), ["store", "layout", "shelves", "beacons", "catalog", "search", "readiness"]);
});

test("a fully set up store has every step done and no next step", () => {
  const steps = deriveSetupSteps(readyInput);
  assert.ok(steps.every((step) => step.status === "done"));
  assert.deepEqual(setupSummary(steps), { done: 7, total: 7, next: null });
});

test("a new store has only the first step done and the layout as next step", () => {
  assert.deepEqual(statuses(emptyInput), {
    store: "done", layout: "open", shelves: "open", beacons: "open", catalog: "open", search: "open", readiness: "open"
  });
  const summary = setupSummary(deriveSetupSteps(emptyInput));
  assert.equal(summary.done, 1);
  assert.equal(summary.next?.id, "layout");
});

test("open steps point at the page where the operator fixes them", () => {
  const byId = Object.fromEntries(deriveSetupSteps(emptyInput).map((step) => [step.id, step]));
  assert.equal(byId.layout.link?.href, "/admin/next/editor/?storeId=store-1");
  assert.equal(byId.catalog.link?.href, "/admin/next/products/");
  assert.equal(byId.readiness.link?.href, "/admin/next/stores/readiness/?storeId=store-1");
  const withShelves = deriveSetupSteps({ ...emptyInput, store: readyInput.store, readiness: report({ counts: { ...report().counts, shelves: 0, assignedBeacons: 0, placedBeacons: 0 } }) });
  const beacons = withShelves.find((step) => step.id === "beacons");
  assert.equal(beacons?.status, "open");
  assert.equal(beacons?.link?.href, "/admin/next/beacons/?storeId=store-1");
  assert.equal(withShelves.find((step) => step.id === "shelves")?.link?.href, "/admin/next/editor/?storeId=store-1");
  assert.equal(byId.search.link, null, "search waits for the catalog and has nothing to open yet");
});

test("a beacon inconsistency is a problem, not an open step", () => {
  for (const code of ["BEACON_UUID_ALL_ZERO", "BEACON_MAJOR_MINOR_MISSING", "BEACON_IDENTITY_DUPLICATE", "BEACON_IDENTITY_MISMATCH", "LAYOUT_BEACON_NOT_REGISTERED"]) {
    const input = { ...readyInput, readiness: report({ status: "RED", blockingCount: 1, findings: [finding(code)] }) };
    const steps = deriveSetupSteps(input);
    const beacons = steps.find((step) => step.id === "beacons");
    assert.equal(beacons?.status, "problem", code);
    assert.match(beacons?.detail ?? "", /1 Abweichung/);
    assert.equal(beacons?.link?.href, "/admin/next/beacons/?storeId=store-1");
    assert.equal(steps.find((step) => step.id === "readiness")?.status, "problem", `${code} also blocks readiness`);
  }
});

test("a placed beacon without a complete identity is a problem even as a warning", () => {
  const input = { ...readyInput, readiness: report({ status: "YELLOW", warningCount: 1, findings: [finding("BEACON_WITHOUT_IDENTITY", "WARNING")] }) };
  assert.equal(statuses(input).beacons, "problem");
});

test("an assigned beacon that is not in the layout keeps the step open and links to the editor", () => {
  const input = { ...readyInput, readiness: report({ status: "YELLOW", warningCount: 1, findings: [finding("BEACON_ASSIGNED_NOT_PLACED", "WARNING")], counts: { ...report().counts, placedBeacons: 5 } }) };
  const beacons = deriveSetupSteps(input).find((step) => step.id === "beacons");
  assert.equal(beacons?.status, "open");
  assert.equal(beacons?.link?.href, "/admin/next/editor/?storeId=store-1");
});

test("an empty catalog is open, and the search step waits for it", () => {
  const input: SetupInput = { ...readyInput, storeProductCount: 0, search: "no-products", readiness: report({ counts: { ...report().counts, products: 0 } }) };
  const steps = deriveSetupSteps(input);
  assert.equal(steps.find((step) => step.id === "catalog")?.status, "open");
  assert.equal(steps.find((step) => step.id === "search")?.status, "open");
  assert.equal(setupSummary(steps).next?.id, "catalog");
});

test("products without a market do not count as the market's catalog", () => {
  const input: SetupInput = { ...readyInput, storeProductCount: 0, search: "no-products" };
  const catalog = deriveSetupSteps(input).find((step) => step.id === "catalog");
  assert.equal(catalog?.status, "problem");
  assert.match(catalog?.detail ?? "", /gemeinsamer Katalog/);
});

test("a product that the search does not find is a problem that points at the search index", () => {
  const search = deriveSetupSteps({ ...readyInput, search: { query: "Apfel", found: false } }).find((step) => step.id === "search");
  assert.equal(search?.status, "problem");
  assert.equal(search?.link?.href, "/admin/next/search-index/");
  assert.equal(search?.link?.adminOnly, true);
});

test("blocking findings and warnings are told apart in the readiness step", () => {
  const blocked = report({ status: "RED", blockingCount: 2, findings: [finding("PRODUCT_NO_SHELF"), finding("PRODUCT_NO_SHELF")] });
  assert.equal(statuses({ ...readyInput, readiness: blocked }).readiness, "problem");
  const warned = deriveSetupSteps({ ...readyInput, readiness: report({ status: "YELLOW", warningCount: 3, findings: [finding("LOW_BEACON_COVERAGE", "WARNING")] }) }).find((step) => step.id === "readiness");
  assert.equal(warned?.status, "done");
  assert.match(warned?.detail ?? "", /3 Warnungen/);
});

test("a target shelf without label is a problem, a layout without shelves is open", () => {
  assert.equal(statuses({ ...readyInput, readiness: report({ status: "RED", blockingCount: 1, findings: [finding("TARGET_SHELF_WITHOUT_LABEL")] }) }).shelves, "problem");
  assert.equal(statuses({ ...readyInput, readiness: report({ counts: { ...report().counts, shelves: 0 } }) }).shelves, "open");
});

test("an active layout that the app still serves as default is a problem", () => {
  const layout = deriveSetupSteps({ ...readyInput, mobileLayoutFallback: true }).find((step) => step.id === "layout");
  assert.equal(layout?.status, "problem");
});

test("an archived store is a problem on the first step", () => {
  assert.equal(statuses({ ...readyInput, store: { ...readyInput.store, status: "ARCHIVED" } }).store, "problem");
});

test("sources that failed to load give 'unknown' and never 'done'", () => {
  const input: SetupInput = { ...readyInput, mobileLayoutFallback: null, readiness: null, storeProductCount: null, search: null };
  assert.deepEqual(statuses(input), {
    store: "done", layout: "done", shelves: "unknown", beacons: "unknown", catalog: "unknown", search: "unknown", readiness: "unknown"
  });
});

function fakeApi(routes: Record<string, unknown>): { api: ApiClient; calls: string[] } {
  const calls: string[] = [];
  const get = async (path: string) => {
    calls.push(path);
    const key = Object.keys(routes).find((prefix) => path.startsWith(prefix));
    if (!key) throw new ApiClientError("server", 500, "boom");
    const value = routes[key];
    if (value instanceof Error) throw value;
    return value;
  };
  return { api: { get, request: get, post: get, put: get, delete: get } as unknown as ApiClient, calls };
}

const readinessJson = { ...report(), findings: [] };

test("loadSetupInput reads the existing endpoints and searches for the first product of the store", async () => {
  const { api, calls } = fakeApi({
    "/api/stores/store-1/readiness": readinessJson,
    "/api/mobile/stores/store-1/layout/current": { fallback: false },
    "/api/products/search": [null, { id: 7, name: "Apfel" }],
    "/api/products?storeCode=SPAR-2": [{ id: 7, name: "Apfel" }]
  });
  const input = await loadSetupInput(api, { id: "store-1", storeCode: "SPAR-2", status: "ACTIVE", activeLayout: { id: "layout-1", versionNo: 3 } });
  assert.equal(input.mobileLayoutFallback, false);
  assert.equal(input.storeProductCount, 1);
  assert.deepEqual(input.search, { query: "Apfel", found: true });
  assert.ok(calls.includes("/api/products/search?q=Apfel&storeCode=SPAR-2&size=10"));
  assert.ok(calls.every((call) => !/^\/api\/admin/.test(call)), "read-only public and store endpoints only");
});

test("loadSetupInput reports a store without products and does not search", async () => {
  const { api, calls } = fakeApi({
    "/api/stores/store-1/readiness": readinessJson,
    "/api/mobile/stores/store-1/layout/current": { fallback: false },
    "/api/products?storeCode=SPAR-2": []
  });
  const input = await loadSetupInput(api, { id: "store-1", storeCode: "SPAR-2", status: "ACTIVE", activeLayout: null });
  assert.equal(input.storeProductCount, 0);
  assert.equal(input.search, "no-products");
  assert.ok(!calls.some((call) => call.startsWith("/api/products/search")));
});

test("loadSetupInput keeps working when single calls fail", async () => {
  const { api } = fakeApi({ "/api/products?storeCode=SPAR-2": [{ id: 7, name: "Apfel" }] });
  const input = await loadSetupInput(api, { id: "store-1", storeCode: "SPAR-2", status: "ACTIVE", activeLayout: null });
  assert.equal(input.readiness, null);
  assert.equal(input.mobileLayoutFallback, null);
  assert.equal(input.storeProductCount, 1);
  assert.equal(input.search, null, "search call failed");
});
