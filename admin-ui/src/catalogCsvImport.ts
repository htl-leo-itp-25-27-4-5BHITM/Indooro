/**
 * Logik des CSV-Produktimports: Prüfung gegen Layout und vorhandene IDs, Adapter für den Bulk-Endpunkt
 * und Fortschrittsableitung aus dem Runner-Zustand. Ohne React, damit die Regeln einzeln testbar sind.
 */
import { ApiClientError, type ApiClient } from "./api/client";
import { decodeCsvBytes, parseCsv } from "./catalogCsv";
import {
  DEFAULT_BATCH_SIZE,
  type BatchState,
  type BatchStatus,
  type PostResult,
  type RowStatus,
  type RunnerDeps,
  type RunnerState
} from "./catalogImportRunner";
import { reviewSheet, type RowError, type SheetLayout, type SheetProduct } from "./catalogSheet";
import { storeScopeParams, type AdminStore } from "./productStore";

export const PRODUCT_LIST_PAGE_SIZE = 100;
/** Obergrenze für das Einlesen vorhandener IDs (100 Seiten à 100 = 10.000 Produkte). Darüber wird der Import blockiert. */
export const MAX_EXISTING_ID_PAGES = 100;
export const PRICE_MISSING_MESSAGE = "Preis fehlt. Für den Import ist für jedes Produkt ein Preis erforderlich.";

export const IMPORT_BATCH_SIZE = DEFAULT_BATCH_SIZE;

/** Ein zufälliger Idempotency-Key im Format des Backends ([A-Za-z0-9._-], 1 bis 100 Zeichen). */
export function sanitizeIdempotencyKey(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 100);
  if (!cleaned) throw new Error("Idempotency-Key konnte nicht erzeugt werden.");
  return cleaned;
}

export function newImportKey(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") return sanitizeIdempotencyKey(cryptoApi.randomUUID());
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return sanitizeIdempotencyKey(Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""));
  }
  return sanitizeIdempotencyKey(`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
}

/**
 * Verbindet den Runner mit dem authentifizierten API-Client. Antworten mit HTTP-Status werden als
 * `PostResult` zurückgegeben (der Runner entscheidet); Netzwerkfehler werden weitergereicht.
 * Der Client liefert bei Erfolg keinen Status; erfolgreiche Antworten werden deshalb als 200 gemeldet.
 */
export function bulkRunnerDeps(api: Pick<ApiClient, "post">, newKey: () => string = newImportKey): RunnerDeps {
  return {
    newKey,
    async post(path: string, body: unknown, headers: Record<string, string>): Promise<PostResult> {
      try {
        const payload = await api.post<unknown>(path, body, { headers });
        return { status: 200, body: payload };
      } catch (error) {
        if (error instanceof ApiClientError && error.status !== null) {
          return { status: error.status, body: { error: error.message } };
        }
        throw error;
      }
    }
  };
}

interface LayoutContextResponse {
  currentLayout?: { layout?: { elements?: unknown } } | null;
}

/** Aktives Layout des Marktes (Regale und Bezeichnungen) aus dem Editor-Kontext. */
export async function loadStoreLayout(api: Pick<ApiClient, "get">, store: Pick<AdminStore, "id">): Promise<SheetLayout> {
  const context = await api.get<LayoutContextResponse>(`/api/stores/${encodeURIComponent(store.id)}/layout/editor-context`);
  const elements = context?.currentLayout?.layout?.elements;
  if (!Array.isArray(elements)) throw new Error("Das Layout des Marktes ist unvollständig. Import nicht möglich.");
  return { elements: elements as SheetLayout["elements"] };
}

interface ProductListResponse {
  content: Array<{ id?: unknown }>;
  totalElements: number;
}

/**
 * Alle Produkt-IDs des Marktes, seitenweise. Gelingt das Einlesen nicht vollständig, wird der Import blockiert,
 * weil sonst Überschreibungen unbemerkt blieben.
 */
export async function loadStoreProductIds(api: Pick<ApiClient, "get">, store: Pick<AdminStore, "id" | "storeCode">): Promise<Set<number>> {
  const ids = new Set<number>();
  for (let page = 0; page < MAX_EXISTING_ID_PAGES; page += 1) {
    const params = new URLSearchParams({ page: String(page), size: String(PRODUCT_LIST_PAGE_SIZE), sort: "id" });
    storeScopeParams(store).forEach((value, key) => params.set(key, value));
    const result = await api.get<ProductListResponse>(`/api/admin/products?${params.toString()}`);
    if (!result || !Array.isArray(result.content) || !Number.isInteger(result.totalElements)) {
      throw new Error("Die Produktliste ist unvollständig. Import nicht möglich.");
    }
    for (const item of result.content) {
      if (!item || !Number.isInteger(item.id)) throw new Error("Die Produktliste enthält eine Zeile ohne ID. Import nicht möglich.");
      ids.add(item.id as number);
    }
    const pageCount = Math.ceil(result.totalElements / PRODUCT_LIST_PAGE_SIZE);
    if (page + 1 >= pageCount || result.content.length === 0) return ids;
  }
  throw new Error(`Überschreibungsprüfung nicht möglich: Der Markt hat mehr als ${MAX_EXISTING_ID_PAGES * PRODUCT_LIST_PAGE_SIZE} Produkte.`);
}

export interface CsvImportContext {
  layout: SheetLayout;
  existingIds: ReadonlySet<number>;
}

export interface CsvImportReview {
  /** Produkte in Dateireihenfolge; gesendet wird nur, wenn `errors` leer ist. */
  products: SheetProduct[];
  /** Datei- und Zeilenfehler inklusive fehlender Preise (Zeile null = Datei). */
  errors: RowError[];
  counts: { rows: number; valid: number; invalid: number };
  /** Ids gültiger Produkte, die im Markt bereits vorhanden sind. */
  overwrites: number[];
}

/** Bytes einer CSV-Datei prüfen. Wirft bei nicht geschlossenen Anführungszeichen. */
export function reviewCsvImport(bytes: Uint8Array, context: CsvImportContext): CsvImportReview {
  const parsed = parseCsv(decodeCsvBytes(bytes));
  const sheet = reviewSheet(parsed, context.layout, { existingIds: new Set(context.existingIds) });
  // Der Server verlangt einen Preis; die Prüfung erlaubt ihn leer. Solche Zeilen sind hier Fehler.
  const withoutPrice = sheet.products.filter((product) => product.price === undefined);
  const priceErrors: RowError[] = withoutPrice.map((product) => ({
    line: sheet.rows.find((row) => row.status === "valid" && row.id === product.id)?.line ?? null,
    field: "preis",
    message: PRICE_MISSING_MESSAGE
  }));
  const errors = [...sheet.errors, ...priceErrors].sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  const rows = sheet.summary.rows;
  const valid = sheet.products.length - withoutPrice.length;
  return {
    products: sheet.products,
    errors,
    counts: { rows, valid, invalid: rows - valid - sheet.summary.excluded },
    overwrites: sheet.overwrites
  };
}

export interface ImportGate {
  hasStore: boolean;
  review: CsvImportReview | null;
  overwriteConfirmed: boolean;
  running: boolean;
  /** true, sobald ein Lauf gestartet wurde; ein erneuter Import braucht eine neue Datei. */
  started: boolean;
}

/** Freigabe des Commit-Buttons: Markt, fehlerfreie Prüfung, bestätigtes Überschreiben, kein Lauf. */
export function canStartImport(gate: ImportGate): boolean {
  const { review } = gate;
  if (!gate.hasStore || gate.running || gate.started || !review) return false;
  if (review.errors.length > 0 || review.products.length === 0) return false;
  return review.overwrites.length === 0 || gate.overwriteConfirmed;
}

const FINISHED: ReadonlySet<BatchStatus> = new Set<BatchStatus>(["done", "unknown", "failed"]);

export interface ImportProgress {
  total: number;
  processed: number;
  batchCount: number;
  batchesFinished: number;
  /** 1-basierte Nummer des gerade gesendeten Blocks. */
  runningBatch: number | null;
  saved: number;
  failed: number;
  unknown: number;
  unknownBatches: number;
  /** Produkte in Blöcken, die nach einem Abbruch nicht gesendet wurden. */
  notSent: number;
  /** Meldung des Blocks, der den Lauf beendet hat (400/401/403/409). */
  abortMessage: string | null;
}

/** Ableitung aus dem Runner-Zustand; nach einem Abbruch bleiben die übrigen Blöcke `pending` (notSent). */
export function importProgress(state: RunnerState): ImportProgress {
  const { batches, totals } = state;
  const sizeOf = (list: BatchState[]) => list.reduce((sum, batch) => sum + batch.size, 0);
  const running = batches.find((batch) => batch.status === "running");
  return {
    total: sizeOf(batches),
    processed: sizeOf(batches.filter((batch) => FINISHED.has(batch.status))),
    batchCount: batches.length,
    batchesFinished: batches.filter((batch) => FINISHED.has(batch.status)).length,
    runningBatch: running ? running.index + 1 : null,
    saved: totals.saved,
    failed: totals.failed,
    unknown: totals.unknown,
    unknownBatches: batches.filter((batch) => batch.status === "unknown").length,
    notSent: sizeOf(batches.filter((batch) => batch.status === "pending")),
    abortMessage: state.aborted ? state.aborted.message : null
  };
}

export interface ImportResultRow {
  /** Zeile in der Datei: Produkt-Position im gesamten Import, 1-basiert. */
  position: number;
  id: string;
  status: RowStatus;
  reason: string | null;
}

/** Zeilenergebnisse aller bereits beantworteten Blöcke in Importreihenfolge. */
export function importResultRows(state: RunnerState): ImportResultRow[] {
  const rows: ImportResultRow[] = [];
  let offset = 0;
  for (const batch of state.batches) {
    for (const row of batch.rows) {
      rows.push({ position: offset + row.row, id: row.id, status: row.status, reason: row.reason });
    }
    offset += batch.size;
  }
  return rows;
}
