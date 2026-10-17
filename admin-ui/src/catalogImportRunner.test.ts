import assert from "node:assert/strict";
import test from "node:test";
import {
  productStatusById,
  retryUnknown,
  runCatalogImport,
  type PostResult,
  type RunnerDeps,
  type RunnerState
} from "./catalogImportRunner";
import type { SheetProduct } from "./catalogSheet";

type Step = (body: SheetProduct[]) => PostResult | "network";

const OPTIONS = { storeCode: "SPAR-Leonding-001" };
const products = (count: number): SheetProduct[] =>
  Array.from({ length: count }, (_, index) => ({ id: index + 1, name: `Produkt ${index + 1}`, layoutCode: "310/1/1/1" }));

function okResponse(body: SheetProduct[], failures = new Map<number, string>()): PostResult {
  const rows = body.map((product, index) => {
    const reason = failures.get(index + 1);
    return reason === undefined
      ? { row: index + 1, id: String(product.id), status: "saved", reason: null }
      : { row: index + 1, id: String(product.id), status: "failed", reason };
  });
  const failed = rows.filter((row) => row.status === "failed").length;
  return { status: 200, body: { message: "ok", count: body.length, saved: body.length - failed, failed, unknown: 0, rows } };
}

const accept: Step = (body) => okResponse(body);
const withFailure = (row: number, reason: string): Step => (body) => okResponse(body, new Map([[row, reason]]));
const reply = (status: number, error?: string): Step => () => ({ status, body: error === undefined ? {} : { error } });
const network: Step = () => "network";

function fakeDeps() {
  const script: Step[] = [];
  const calls: { path: string; body: SheetProduct[]; key: string }[] = [];
  const snapshots: RunnerState[] = [];
  let counter = 0;
  const deps: RunnerDeps = {
    async post(path, body, headers) {
      const products = body as SheetProduct[];
      calls.push({ path, body: products, key: headers["Idempotency-Key"] });
      const step = script.shift();
      if (!step) throw new Error("Kein Skript für diesen Aufruf.");
      const result = step(products);
      if (result === "network") throw new TypeError("fetch failed");
      return result;
    },
    newKey() {
      counter += 1;
      return `key-${counter}`;
    },
    onProgress(state) {
      snapshots.push(state);
    }
  };
  return { deps, script, calls, snapshots };
}

test("250 products are sent as three requests with three different idempotency keys", async () => {
  const { deps, script, calls, snapshots } = fakeDeps();
  script.push(accept, accept, accept);
  const state = await runCatalogImport(products(250), deps, OPTIONS);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((call) => call.body.length), [100, 100, 50]);
  assert.equal(new Set(calls.map((call) => call.key)).size, 3);
  assert.equal(calls[0].path, "/api/admin/products/bulk?storeCode=SPAR-Leonding-001");
  assert.deepEqual(state.batches.map((batch) => batch.status), ["done", "done", "done"]);
  assert.deepEqual(state.totals, { saved: 250, failed: 0, unknown: 0, pending: 0 });
  assert.deepEqual(snapshots.at(-1), state);
  assert.ok(snapshots.some((snapshot) => snapshot.batches.some((batch) => batch.status === "running")));
});

test("a 503 block is unknown, a retry reuses its key and body and does not double count", async () => {
  const { deps, script, calls } = fakeDeps();
  const all = products(250);
  script.push(accept, reply(503, "Ausgang unbekannt"), accept);
  const first = await runCatalogImport(all, deps, OPTIONS);
  assert.deepEqual(first.batches.map((batch) => batch.status), ["done", "unknown", "done"]);
  assert.deepEqual(first.totals, { saved: 150, failed: 0, unknown: 100, pending: 0 });

  script.push(accept);
  const second = await retryUnknown(first, all, deps, OPTIONS);
  assert.equal(calls.length, 4);
  assert.equal(calls[3].key, calls[1].key);
  assert.deepEqual(calls[3].body, calls[1].body);
  assert.deepEqual(second.batches.map((batch) => batch.status), ["done", "done", "done"]);
  assert.deepEqual(second.totals, { saved: 250, failed: 0, unknown: 0, pending: 0 });
  assert.deepEqual(first.totals, { saved: 150, failed: 0, unknown: 100, pending: 0 }, "the previous state is not changed");
});

test("a network error leaves the block unknown and carries the reason per row", async () => {
  const { deps, script } = fakeDeps();
  script.push(network);
  const state = await runCatalogImport(products(3), deps, OPTIONS);
  assert.equal(state.batches[0].status, "unknown");
  assert.equal(state.batches[0].error, "Netzwerkfehler");
  assert.equal(state.totals.unknown, 3);
  assert.equal(state.batches[0].rows[0].reason, "Keine Antwort vom Server; der Ausgang ist unbekannt.");
});

test("a 403 fails its block and the third request is never sent", async () => {
  const { deps, script, calls } = fakeDeps();
  script.push(accept, reply(403, "Kein Zugriff auf diesen Markt."));
  const state = await runCatalogImport(products(250), deps, OPTIONS);
  assert.equal(calls.length, 2);
  assert.deepEqual(state.batches.map((batch) => batch.status), ["done", "failed", "pending"]);
  assert.equal(state.batches[1].error, "Kein Zugriff auf diesen Markt.");
  assert.deepEqual(state.totals, { saved: 100, failed: 100, unknown: 0, pending: 50 });

  const statuses = productStatusById(state, products(250));
  assert.deepEqual(statuses.get("1"), { status: "saved", reason: null });
  assert.deepEqual(statuses.get("150"), { status: "failed", reason: "Kein Zugriff auf diesen Markt." });
  assert.deepEqual(statuses.get("201"), { status: "pending", reason: null });
});

test("a failed row inside a 200 answer is counted and the run continues", async () => {
  const { deps, script, calls } = fakeDeps();
  script.push(withFailure(1, "Preis fehlt"), accept, accept);
  const state = await runCatalogImport(products(250), deps, OPTIONS);
  assert.equal(calls.length, 3);
  assert.equal(state.batches[0].status, "done");
  assert.deepEqual(state.batches[0].rows[0], { row: 1, id: "1", status: "failed", reason: "Preis fehlt" });
  assert.deepEqual(state.totals, { saved: 249, failed: 1, unknown: 0, pending: 0 });
  assert.deepEqual(productStatusById(state, products(250)).get("1"), { status: "failed", reason: "Preis fehlt" });
});

test("batch sizes outside 1 to 500 are rejected", async () => {
  const { deps } = fakeDeps();
  await assert.rejects(runCatalogImport(products(1), deps, { storeCode: "X", batchSize: 501 }), RangeError);
  await assert.rejects(runCatalogImport(products(1), deps, { storeCode: "X", batchSize: 0 }), RangeError);
});

test("retry refuses a product list that does not match the import state", async () => {
  const { deps, script } = fakeDeps();
  script.push(accept);
  const state = await runCatalogImport(products(5), deps, OPTIONS);
  await assert.rejects(retryUnknown(state, products(4), deps, OPTIONS), /passt nicht zum Importstand/);
});
