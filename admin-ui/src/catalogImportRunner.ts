/**
 * Sendet geprüfte Produkte in Blöcken an `POST /api/admin/products/bulk?storeCode=…`.
 * Reine Logik: HTTP läuft über `deps.post`, Schlüssel über `deps.newKey`.
 */
import type { SheetProduct } from "./catalogSheet";

export const BULK_PATH = "/api/admin/products/bulk";
export const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;
/** Antworten, bei denen ein weiterer Block keinen Sinn hat (Anmeldung, Markt, Konflikt). */
const ABORT_STATUSES = new Set([400, 401, 403, 409]);

export type BatchStatus = "pending" | "running" | "done" | "unknown" | "failed";
export type RowStatus = "saved" | "failed" | "unknown";

/** `row` ist die 1-basierte Position im gesendeten Block, `id` die Produkt-Id. */
export interface RowResult {
  row: number;
  id: string;
  status: RowStatus;
  reason: string | null;
}

export interface BatchState {
  index: number;
  size: number;
  status: BatchStatus;
  key: string;
  saved: number;
  failed: number;
  unknown: number;
  rows: RowResult[];
  error?: string;
}

export interface RunnerTotals {
  saved: number;
  failed: number;
  unknown: number;
  pending: number;
}

/** Block, dessen Antwort den Lauf beendet hat (400/401/403/409). Nachfolgende Blöcke bleiben `pending`. */
export interface RunnerAbort {
  batch: number;
  message: string;
}

export interface RunnerState {
  batches: BatchState[];
  totals: RunnerTotals;
  aborted?: RunnerAbort;
}

export interface PostResult {
  status: number;
  body: unknown;
}

export interface RunnerDeps {
  post(path: string, body: unknown, headers: Record<string, string>): Promise<PostResult>;
  newKey(): string;
  onProgress?(state: RunnerState): void;
}

export interface RunnerOptions {
  storeCode: string;
  batchSize?: number;
}

export interface ProductStatus {
  status: RowStatus | "pending";
  reason: string | null;
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

function withTotals(batches: BatchState[]): RunnerState {
  const copies = batches.map((batch) => ({ ...batch, rows: batch.rows.map((row) => ({ ...row })) }));
  const pendingBatches = copies.filter((batch) => batch.status === "pending" || batch.status === "running");
  return {
    batches: copies,
    totals: {
      saved: sum(copies.map((batch) => batch.saved)),
      failed: sum(copies.map((batch) => batch.failed)),
      unknown: sum(copies.map((batch) => batch.unknown)),
      pending: sum(pendingBatches.map((batch) => batch.size))
    }
  };
}

function startOffsets(batches: Pick<BatchState, "size">[]): number[] {
  const offsets: number[] = [];
  let offset = 0;
  for (const batch of batches) {
    offsets.push(offset);
    offset += batch.size;
  }
  return offsets;
}

function finishBatch(batch: BatchState, rows: RowResult[], status: BatchStatus, error?: string): BatchState {
  const count = (value: RowStatus) => rows.filter((row) => row.status === value).length;
  const base = { index: batch.index, size: batch.size, status, key: batch.key, saved: count("saved"), failed: count("failed"), unknown: count("unknown"), rows };
  return error === undefined ? base : { ...base, error };
}

function allRows(slice: SheetProduct[], status: RowStatus, reason: string | null): RowResult[] {
  return slice.map((product, index) => ({ row: index + 1, id: String(product.id), status, reason }));
}

function errorText(body: unknown, status: number): string {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string" && body.error.trim()) {
    return body.error;
  }
  return `Anfrage abgelehnt (HTTP ${status}).`;
}

/** Zeilenergebnisse einer 200-Antwort; `null`, wenn die Antwort nicht dem Vertrag entspricht. */
function parseRows(body: unknown, size: number): Map<number, RowResult> | null {
  if (!body || typeof body !== "object" || !("rows" in body) || !Array.isArray(body.rows)) return null;
  const byRow = new Map<number, RowResult>();
  for (const entry of body.rows as unknown[]) {
    if (!entry || typeof entry !== "object") return null;
    const { row, status, reason } = entry as Record<string, unknown>;
    if (!Number.isInteger(row) || (row as number) < 1 || (row as number) > size) return null;
    if (status !== "saved" && status !== "failed" && status !== "unknown") return null;
    if (reason !== undefined && reason !== null && typeof reason !== "string") return null;
    if (!byRow.has(row as number)) {
      byRow.set(row as number, { row: row as number, id: "", status, reason: (reason as string | null | undefined) ?? null });
    }
  }
  return byRow;
}

async function sendBatch(
  batch: BatchState,
  slice: SheetProduct[],
  deps: RunnerDeps,
  options: RunnerOptions
): Promise<{ batch: BatchState; abort: boolean }> {
  const path = `${BULK_PATH}?storeCode=${encodeURIComponent(options.storeCode)}`;
  let response: PostResult;
  try {
    response = await deps.post(path, slice, { "Idempotency-Key": batch.key });
  } catch {
    return { batch: finishBatch(batch, allRows(slice, "unknown", "Keine Antwort vom Server; der Ausgang ist unbekannt."), "unknown", "Netzwerkfehler"), abort: false };
  }

  const { status, body } = response;
  if (status === 200) {
    const byRow = parseRows(body, slice.length);
    if (!byRow) {
      return { batch: finishBatch(batch, allRows(slice, "unknown", "Unerwartete Antwort; der Ausgang ist unbekannt."), "unknown", "Unerwartete Antwort des Servers."), abort: false };
    }
    const rows = slice.map((product, index) => {
      const found = byRow.get(index + 1);
      if (!found) return { row: index + 1, id: String(product.id), status: "unknown" as const, reason: "Keine Antwort für diese Zeile." };
      return { ...found, id: String(product.id) };
    });
    const hasUnknown = rows.some((row) => row.status === "unknown");
    return {
      batch: finishBatch(batch, rows, hasUnknown ? "unknown" : "done", hasUnknown ? "Ausgang einzelner Zeilen unbekannt." : undefined),
      abort: false
    };
  }
  if (status === 503) {
    return { batch: finishBatch(batch, allRows(slice, "unknown", "Der Server hat den Ausgang nicht bestätigt."), "unknown", "HTTP 503"), abort: false };
  }
  if (status >= 400 && status < 500) {
    const message = errorText(body, status);
    return { batch: finishBatch(batch, allRows(slice, "failed", message), "failed", message), abort: ABORT_STATUSES.has(status) };
  }
  return { batch: finishBatch(batch, allRows(slice, "unknown", `Unerwartete Antwort (HTTP ${status}).`), "unknown", `HTTP ${status}`), abort: false };
}

function validateBatchSize(size: number | undefined): number {
  const value = size ?? DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(value) || value < 1 || value > MAX_BATCH_SIZE) {
    throw new RangeError(`batchSize muss eine ganze Zahl von 1 bis ${MAX_BATCH_SIZE} sein.`);
  }
  return value;
}

async function drive(
  batches: BatchState[],
  products: SheetProduct[],
  deps: RunnerDeps,
  options: RunnerOptions,
  shouldSend: (batch: BatchState) => boolean,
  previousAbort?: RunnerAbort
): Promise<RunnerState> {
  const working = batches.map((batch) => ({ ...batch }));
  const offsets = startOffsets(working);
  const report = () => deps.onProgress?.(withTotals(working));
  let aborted = previousAbort;
  report();
  for (let index = 0; index < working.length; index += 1) {
    const batch = working[index];
    if (!shouldSend(batch)) continue;
    const slice = products.slice(offsets[index], offsets[index] + batch.size);
    working[index] = { ...batch, status: "running" };
    report();
    const result = await sendBatch(batch, slice, deps, options);
    working[index] = result.batch;
    report();
    if (result.abort) {
      aborted = { batch: batch.index + 1, message: result.batch.error ?? "Anfrage abgelehnt." };
      break;
    }
  }
  const state = withTotals(working);
  return aborted ? { ...state, aborted } : state;
}

/**
 * Teilt die Produkte in Blöcke (Standard 100), sendet sie nacheinander. Jeder Block bekommt einen eigenen
 * Idempotency-Key. Ein 503 oder Netzwerkfehler macht den Block `unknown`; 400/401/403/409 bricht den Lauf ab.
 */
export async function runCatalogImport(products: SheetProduct[], deps: RunnerDeps, options: RunnerOptions): Promise<RunnerState> {
  const size = validateBatchSize(options.batchSize);
  const batches: BatchState[] = [];
  for (let start = 0; start < products.length; start += size) {
    const count = Math.min(size, products.length - start);
    batches.push({ index: batches.length, size: count, status: "pending", key: deps.newKey(), saved: 0, failed: 0, unknown: 0, rows: [] });
  }
  return drive(batches, products, deps, options, (batch) => batch.status === "pending");
}

/**
 * Sendet jeden `unknown`-Block erneut mit DEMSELBEN Schlüssel und DEMSELBEN Body. `products` ist die Liste,
 * mit der `runCatalogImport` gestartet wurde.
 */
export async function retryUnknown(state: RunnerState, products: SheetProduct[], deps: RunnerDeps, options: RunnerOptions): Promise<RunnerState> {
  const planned = sum(state.batches.map((batch) => batch.size));
  if (planned !== products.length) {
    throw new Error("Die Produktliste passt nicht zum Importstand.");
  }
  const batches = state.batches.map((batch) => ({ ...batch, rows: batch.rows.map((row) => ({ ...row })) }));
  return drive(batches, products, deps, options, (batch) => batch.status === "unknown", state.aborted);
}

/** Status je Produkt-Id, damit die Oberfläche pro Zeile anzeigen kann. Wartende Blöcke zeigen `pending`. */
export function productStatusById(state: RunnerState, products: SheetProduct[]): Map<string, ProductStatus> {
  const result = new Map<string, ProductStatus>();
  const offsets = startOffsets(state.batches);
  state.batches.forEach((batch, batchIndex) => {
    const byRow = new Map(batch.rows.map((row) => [row.row, row] as const));
    for (let position = 0; position < batch.size; position += 1) {
      const product = products[offsets[batchIndex] + position];
      if (!product) continue;
      const row = byRow.get(position + 1);
      const status: ProductStatus = row
        ? { status: row.status, reason: row.reason }
        : { status: "pending", reason: null };
      result.set(String(product.id), status);
    }
  });
  return result;
}
