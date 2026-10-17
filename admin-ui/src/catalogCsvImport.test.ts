import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ApiClientError, type ApiClient, type ApiRequestOptions } from "./api/client";
import {
  IMPORT_BATCH_SIZE,
  MAX_EXISTING_ID_PAGES,
  PRICE_MISSING_MESSAGE,
  PRODUCT_LIST_PAGE_SIZE,
  bulkRunnerDeps,
  canStartImport,
  importProgress,
  importResultRows,
  loadStoreLayout,
  loadStoreProductIds,
  newImportKey,
  reviewCsvImport,
  sanitizeIdempotencyKey
} from "./catalogCsvImport";
import { retryUnknown, runCatalogImport, type RunnerState } from "./catalogImportRunner";
import type { SheetLayout, SheetProduct } from "./catalogSheet";

const KEY_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const STORE = { id: "store-1", storeCode: "LINZ-01", name: "Indooro Linz", region: null };
const layout = JSON.parse(readFileSync(new URL("./fixtures/catalog/layout.json", import.meta.url), "utf8")) as SheetLayout;
const HEADER = "id;name;kategorie;meter;fach;reihe;preis";
const csvBytes = (...rows: string[]) => new TextEncoder().encode([HEADER, ...rows].join("\n"));
const products = (count: number): SheetProduct[] =>
  Array.from({ length: count }, (_, index) => ({ id: index + 1, name: `Produkt ${index + 1}`, price: 1, layoutCode: "310/1/1/1" }));
const okBody = (count: number) => ({
  message: "ok",
  count,
  saved: count,
  failed: 0,
  unknown: 0,
  rows: Array.from({ length: count }, (_, index) => ({ row: index + 1, id: String(index + 1), status: "saved", reason: null }))
});

type PostHandler = (path: string, json: unknown, options?: ApiRequestOptions) => Promise<unknown>;

/** Fake API mit einem Post-Handler; gibt alle Aufrufe in `calls` zurück. */
function fakePost(handler: PostHandler) {
  const calls: { path: string; json: unknown; key: string | undefined }[] = [];
  const api = {
    post: async (path: string, json: unknown, options?: ApiRequestOptions) => {
      const headers = options?.headers as Record<string, string> | undefined;
      calls.push({ path, json, key: headers?.["Idempotency-Key"] });
      return handler(path, json, options);
    }
  } as unknown as Pick<ApiClient, "post">;
  return { api, calls };
}

test("CSV review reports a product without price as a row error and counts it as invalid", () => {
  const review = reviewCsvImport(
    csvBytes("1;Apfel;310;1;1;1;1,99", "2;Birne;310;1;1;2;", "3;Käse;420;1;1;1;4,20"),
    { layout, existingIds: new Set() }
  );
  assert.deepEqual(review.errors, [{ line: 3, field: "preis", message: PRICE_MISSING_MESSAGE }]);
  assert.deepEqual(review.counts, { rows: 3, valid: 2, invalid: 1 });
  assert.equal(review.products.length, 3);
});

test("CSV review lists overwrites of existing ids and leaves a clean sheet committable", () => {
  const review = reviewCsvImport(csvBytes("1;Apfel;310;1;1;1;1,99", "2;Birne;310;1;2;1;1,49"), { layout, existingIds: new Set([2]) });
  assert.deepEqual(review.errors, []);
  assert.deepEqual(review.overwrites, [2]);
  assert.deepEqual(review.counts, { rows: 2, valid: 2, invalid: 0 });
  assert.equal(canStartImport({ hasStore: true, review, overwriteConfirmed: false, running: false, started: false }), false);
  assert.equal(canStartImport({ hasStore: true, review, overwriteConfirmed: true, running: false, started: false }), true);
});

test("invalid rows keep the commit blocked and report the file line", () => {
  const review = reviewCsvImport(csvBytes("1;Apfel;310;1;1;1;1,99", "9;Falsch;812;1;1;1;1,00"), { layout, existingIds: new Set() });
  assert.deepEqual(review.errors, [{ line: 3, field: "kategorie", message: "Kein Regal 812/1 im aktiven Layout." }]);
  assert.equal(canStartImport({ hasStore: true, review, overwriteConfirmed: true, running: false, started: false }), false);
});

test("an empty file and an unclosed quote are reported, not committed", () => {
  const empty = reviewCsvImport(new Uint8Array(), { layout, existingIds: new Set() });
  assert.deepEqual(empty.errors, [{ line: null, field: null, message: "Die Datei enthält keine Kopfzeile." }]);
  assert.equal(canStartImport({ hasStore: true, review: empty, overwriteConfirmed: true, running: false, started: false }), false);
  assert.throws(() => reviewCsvImport(csvBytes('1;"Apfel;310;1;1;1;1,99'), { layout, existingIds: new Set() }), /nicht geschlossen/);
});

test("commit gate requires a store, no running or finished import, and a fresh review", () => {
  const review = reviewCsvImport(csvBytes("1;Apfel;310;1;1;1;1,99"), { layout, existingIds: new Set() });
  const open = { hasStore: true, review, overwriteConfirmed: false, running: false, started: false };
  assert.equal(canStartImport(open), true);
  assert.equal(canStartImport({ ...open, hasStore: false }), false);
  assert.equal(canStartImport({ ...open, running: true }), false);
  assert.equal(canStartImport({ ...open, started: true }), false);
  assert.equal(canStartImport({ ...open, review: null }), false);
});

test("the bulk adapter sends the Idempotency-Key header and reports HTTP errors as results", async () => {
  const { api, calls } = fakePost(async () => okBody(1));
  const deps = bulkRunnerDeps(api, () => "key-1");
  assert.deepEqual(await deps.post("/api/admin/products/bulk?storeCode=LINZ-01", [], { "Idempotency-Key": "key-1" }), { status: 200, body: okBody(1) });
  assert.equal(calls[0].key, "key-1");

  const conflict = fakePost(async () => { throw new ApiClientError("conflict", 409, "Idempotency-Key wurde bereits verwendet."); });
  assert.deepEqual(await bulkRunnerDeps(conflict.api).post("/p", [], {}), { status: 409, body: { error: "Idempotency-Key wurde bereits verwendet." } });

  const network = fakePost(async () => { throw new ApiClientError("network", null, "Verbindung fehlgeschlagen."); });
  await assert.rejects(bulkRunnerDeps(network.api).post("/p", [], {}), ApiClientError);
});

test("a 503 keeps the batch unknown and the retry resends it with the same key and body", async () => {
  const batch = products(3);
  let attempt = 0;
  const { api, calls } = fakePost(async () => {
    attempt += 1;
    if (attempt === 1) throw new ApiClientError("server", 503, "Serverfehler. Bitte später erneut versuchen.");
    return okBody(3);
  });
  const deps = bulkRunnerDeps(api, () => "import-key-1");
  const first = await runCatalogImport(batch, deps, { storeCode: "LINZ-01" });
  assert.equal(importProgress(first).unknownBatches, 1);
  assert.equal(importProgress(first).abortMessage, null);

  const second = await retryUnknown(first, batch, deps, { storeCode: "LINZ-01" });
  assert.deepEqual(calls.map((call) => call.key), ["import-key-1", "import-key-1"]);
  assert.deepEqual(calls[0].json, calls[1].json);
  assert.equal(calls[1].path, "/api/admin/products/bulk?storeCode=LINZ-01");
  assert.deepEqual(importProgress(second), {
    total: 3, processed: 3, batchCount: 1, batchesFinished: 1, runningBatch: null,
    saved: 3, failed: 0, unknown: 0, unknownBatches: 0, notSent: 0, abortMessage: null
  });
});

test("a 409 on the first batch aborts the run, shows its message and leaves the rest unsent", async () => {
  const batch = products(150);
  const { api, calls } = fakePost(async () => { throw new ApiClientError("conflict", 409, "Markt widerspricht dem Parameter."); });
  const state = await runCatalogImport(batch, bulkRunnerDeps(api, () => "k"), { storeCode: "LINZ-01" });
  assert.equal(calls.length, 1);
  const progress = importProgress(state);
  assert.equal(progress.abortMessage, "Markt widerspricht dem Parameter.");
  assert.equal(progress.notSent, 50);
  assert.equal(progress.failed, 100);
  assert.equal(progress.processed, 100);
  assert.equal(progress.batchCount, 2);
});

test("a 403 without a body uses the access message and stops the run", async () => {
  const { api, calls } = fakePost(async () => { throw new ApiClientError("forbidden", 403, "Für diese Aktion fehlen die Berechtigungen."); });
  const state = await runCatalogImport(products(2), bulkRunnerDeps(api, () => "k"), { storeCode: "LINZ-01" });
  assert.equal(calls.length, 1);
  assert.equal(importProgress(state).abortMessage, "Für diese Aktion fehlen die Berechtigungen.");
  assert.equal(importProgress(state).notSent, 0);
});

test("progress counters combine unknown and saved batches and rows map to import positions", async () => {
  const batch = products(IMPORT_BATCH_SIZE + 50);
  let attempt = 0;
  const { api } = fakePost(async (_path, json) => {
    attempt += 1;
    if (attempt === 1) throw new ApiClientError("server", 503, "Serverfehler.");
    return okBody((json as SheetProduct[]).length);
  });
  const state = await runCatalogImport(batch, bulkRunnerDeps(api, () => "k"), { storeCode: "LINZ-01" });
  const progress = importProgress(state);
  assert.deepEqual([progress.total, progress.processed, progress.batchCount], [150, 150, 2]);
  assert.deepEqual([progress.saved, progress.unknown, progress.unknownBatches], [50, 100, 1]);
  const rows = importResultRows(state);
  assert.equal(rows.length, 150);
  assert.deepEqual(rows[100], { position: 101, id: "101", status: "saved", reason: null });
  assert.equal(rows[0].status, "unknown");
});

test("the product id scan follows pages for the store and fails closed when incomplete", async () => {
  const requested: string[] = [];
  const pages = [PRODUCT_LIST_PAGE_SIZE, PRODUCT_LIST_PAGE_SIZE, 50];
  const api = {
    get: async (path: string) => {
      requested.push(path);
      const page = Number(new URL(path, "http://x").searchParams.get("page"));
      const count = pages[page];
      return { content: Array.from({ length: count }, (_, index) => ({ id: page * PRODUCT_LIST_PAGE_SIZE + index + 1 })), page, size: PRODUCT_LIST_PAGE_SIZE, totalElements: 250 };
    }
  } as unknown as Pick<ApiClient, "get">;
  const ids = await loadStoreProductIds(api, STORE);
  assert.equal(ids.size, 250);
  assert.equal(requested.length, 3);
  const params = new URL(requested[0], "http://x").searchParams;
  assert.equal(params.get("storeCode"), "LINZ-01");
  assert.equal(params.get("storeId"), "store-1");
  assert.equal(params.get("sort"), "id");

  const broken = { get: async () => ({ content: [{}], page: 0, size: 100, totalElements: 1 }) } as unknown as Pick<ApiClient, "get">;
  await assert.rejects(loadStoreProductIds(broken, STORE), /ohne ID/);

  const huge = {
    get: async (path: string) => {
      const page = Number(new URL(path, "http://x").searchParams.get("page"));
      return { content: Array.from({ length: PRODUCT_LIST_PAGE_SIZE }, (_, index) => ({ id: page * PRODUCT_LIST_PAGE_SIZE + index + 1 })), page, size: PRODUCT_LIST_PAGE_SIZE, totalElements: MAX_EXISTING_ID_PAGES * PRODUCT_LIST_PAGE_SIZE + 1 };
    }
  } as unknown as Pick<ApiClient, "get">;
  await assert.rejects(loadStoreProductIds(huge, STORE), /mehr als 10000 Produkte/);
});

test("the store layout comes from the editor context and must contain elements", async () => {
  const api = { get: async () => ({ currentLayout: { layout } }) } as unknown as Pick<ApiClient, "get">;
  const loaded = await loadStoreLayout(api, STORE);
  assert.equal(loaded.elements.filter((element) => element.type === "shelf").length, 4);
  const missing = { get: async () => ({ currentLayout: {} }) } as unknown as Pick<ApiClient, "get">;
  await assert.rejects(loadStoreLayout(missing, STORE), /unvollständig/);
});

test("idempotency keys match the backend pattern", () => {
  assert.equal(sanitizeIdempotencyKey("a b/c:d.e_f-9"), "abcd.e_f-9");
  assert.equal(sanitizeIdempotencyKey("x".repeat(150)).length, 100);
  assert.throws(() => sanitizeIdempotencyKey("äöü /:"), /konnte nicht erzeugt werden/);
  const first = newImportKey();
  assert.match(first, KEY_PATTERN);
  assert.notEqual(newImportKey(), first);
});

test("an empty state reports nothing to show and no abort", () => {
  const state: RunnerState = { batches: [], totals: { saved: 0, failed: 0, unknown: 0, pending: 0 } };
  assert.deepEqual(importProgress(state), {
    total: 0, processed: 0, batchCount: 0, batchesFinished: 0, runningBatch: null,
    saved: 0, failed: 0, unknown: 0, unknownBatches: 0, notSent: 0, abortMessage: null
  });
});
