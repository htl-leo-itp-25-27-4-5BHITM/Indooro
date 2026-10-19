import { ApiClientError, type ApiClient } from "./client";
import type { ApiSchemas } from "./types";

// GET /api/admin/index, POST /api/admin/index/reindex and POST /api/admin/index/activate?index= (admin only).
// The UI never sends force=true: a count mismatch has to be fixed with a new reindex.
export type IndexVersion = { name: string; docCount: number | null; active: boolean };
export type IndexOverview = {
  alias: string;
  sourceIndex: string;
  sourceCount: number | null;
  activeIndices: string[];
  versions: IndexVersion[];
};
export type ReindexResult = ApiSchemas["ReindexResult"];
export type ActivateResult = ApiSchemas["ActivateResult"];

export const INDEX_PATH = "/api/admin/index";
export const REINDEX_PATH = "/api/admin/index/reindex";

export function activatePath(index: string): string {
  return `/api/admin/index/activate?index=${encodeURIComponent(index)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

const invalid = () => new ApiClientError("invalid-response", null, "Ungültige Antwort der Suchindex-Verwaltung.");

/** Shape check. A missing or unreadable count stays null; it is never turned into 0. */
export function parseIndexOverview(value: unknown): IndexOverview {
  if (!isRecord(value) || typeof value.alias !== "string" || typeof value.sourceIndex !== "string"
    || !Array.isArray(value.activeIndices) || !value.activeIndices.every((name) => typeof name === "string")
    || !Array.isArray(value.versions)) {
    throw invalid();
  }
  const versions = value.versions.map((item): IndexVersion => {
    if (!isRecord(item) || typeof item.name !== "string" || typeof item.active !== "boolean") throw invalid();
    return { name: item.name, docCount: count(item.docCount), active: item.active };
  });
  return {
    alias: value.alias,
    sourceIndex: value.sourceIndex,
    sourceCount: count(value.sourceCount),
    activeIndices: value.activeIndices as string[],
    versions
  };
}

export function parseReindexResult(value: unknown): ReindexResult {
  if (!isRecord(value) || typeof value.source !== "string" || typeof value.target !== "string"
    || count(value.sourceCount) === null || count(value.targetCount) === null || value.status !== "OK") {
    throw invalid();
  }
  return { source: value.source, target: value.target, sourceCount: value.sourceCount as number, targetCount: value.targetCount as number, status: "OK" };
}

export function parseActivateResult(value: unknown): ActivateResult {
  if (!isRecord(value) || typeof value.alias !== "string" || typeof value.index !== "string"
    || !Array.isArray(value.previous) || !value.previous.every((name) => typeof name === "string")) {
    throw invalid();
  }
  return { alias: value.alias, index: value.index, previous: value.previous as string[] };
}

export async function fetchIndexOverview(api: ApiClient, options: { signal?: AbortSignal } = {}): Promise<IndexOverview> {
  return parseIndexOverview(await api.get<unknown>(INDEX_PATH, { signal: options.signal }));
}

export async function reindexProducts(api: ApiClient): Promise<ReindexResult> {
  return parseReindexResult(await api.post<unknown>(REINDEX_PATH, {}));
}

export async function activateIndex(api: ApiClient, index: string): Promise<ActivateResult> {
  return parseActivateResult(await api.post<unknown>(activatePath(index), {}));
}
