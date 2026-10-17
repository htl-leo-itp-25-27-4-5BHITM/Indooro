import { ApiClientError, type ApiClient } from "./api/client";
import type { CurrentUser } from "./routes";

/** Markt-Kontext für die Produktverwaltung. Jedes Produkt gehört genau zu einem Markt. */
export interface AdminStore {
  id: string;
  storeCode: string;
  name: string;
  region?: { id: string; name?: string } | null;
}

export const SELECTED_STORE_STORAGE_KEY = "indooro.admin.selectedStoreId";

const STORE_PAGE_SIZE = 100;
const MAX_STORE_PAGES = 50;

export function activeStorePath(page: number): string {
  return `/api/stores?status=ACTIVE&page=${page}&size=${STORE_PAGE_SIZE}`;
}

/** Lädt alle aktiven Märkte seitenweise, wie die Beacon-Seite es tut. */
export async function loadActiveStores(api: Pick<ApiClient, "get">, signal?: AbortSignal): Promise<AdminStore[]> {
  const stores: AdminStore[] = [];
  for (let page = 0; page < MAX_STORE_PAGES; page += 1) {
    const result = await api.get<{ content?: AdminStore[]; totalElements?: number }>(activeStorePath(page), { signal });
    if (!Array.isArray(result?.content) || !Number.isInteger(result.totalElements)) {
      throw new Error("Store-Antwort ist unvollständig.");
    }
    for (const store of result.content) {
      if (!stores.some((item) => item.id === store.id)) stores.push(store);
    }
    if (result.content.length === 0 || stores.length >= (result.totalElements as number)) break;
  }
  return stores;
}

/** Märkte, auf die die Rolle des Benutzers Zugriff hat (spiegelt das Backend; erzwungen wird dort). */
export function accessibleStores(user: Pick<CurrentUser, "role" | "scope"> | null | undefined, stores: AdminStore[]): AdminStore[] {
  if (!user) return stores;
  const scope = user.scope;
  switch (user.role) {
    case "admin":
      return stores;
    case "store-manager":
      return scope?.storeId ? stores.filter((store) => store.id === scope.storeId) : [];
    case "region-manager":
      return scope?.regionId ? stores.filter((store) => store.region?.id === scope.regionId) : [];
    default:
      return [];
  }
}

/** Genau ein zugänglicher Markt wird automatisch gewählt, sonst die letzte Auswahl, falls noch zugänglich. */
export function resolveStoreSelection(accessible: AdminStore[], rememberedId: string | null | undefined): AdminStore | null {
  if (accessible.length === 1) return accessible[0];
  if (!rememberedId) return null;
  return accessible.find((store) => store.id === rememberedId) ?? null;
}

function sessionStorageOrNull(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function readRememberedStoreId(storage: Pick<Storage, "getItem"> | null = sessionStorageOrNull()): string | null {
  try {
    return storage?.getItem(SELECTED_STORE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function rememberStoreId(storeId: string, storage: Pick<Storage, "setItem"> | null = sessionStorageOrNull()): void {
  try {
    storage?.setItem(SELECTED_STORE_STORAGE_KEY, storeId);
  } catch {
    // sessionStorage kann in privaten Fenstern gesperrt sein; die Auswahl gilt dann nur für diese Seite.
  }
}

/** Query-Parameter für Liste und Löschen: storeCode immer, storeId zusätzlich falls vorhanden. */
export function storeScopeParams(store: Pick<AdminStore, "id" | "storeCode">): URLSearchParams {
  const params = new URLSearchParams();
  params.set("storeCode", store.storeCode);
  if (store.id) params.set("storeId", store.id);
  return params;
}

/** Store-Felder für den Body von POST /api/admin/products. */
export function productStoreBody(store: Pick<AdminStore, "id" | "storeCode">): { storeId: string; storeCode: string } {
  return { storeId: store.id, storeCode: store.storeCode };
}

export function deleteProductPath(productId: number, store: Pick<AdminStore, "id" | "storeCode">): string {
  return `/api/admin/products/${productId}?${storeScopeParams(store).toString()}`;
}

export function storeLabel(store: Pick<AdminStore, "name" | "storeCode">): string {
  return `${store.name} (${store.storeCode})`;
}

export function productErrorMessage(error: unknown, fallback = "Anfrage fehlgeschlagen. Bitte erneut versuchen."): string {
  if (error instanceof ApiClientError) {
    if (error.status === 403) return "Kein Zugriff auf diesen Markt.";
    return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
