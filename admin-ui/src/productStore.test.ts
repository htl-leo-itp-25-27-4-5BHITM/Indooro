import assert from "node:assert/strict";
import test from "node:test";
import { ApiClientError } from "./api/client";
import {
  accessibleStores,
  activeStorePath,
  deleteProductPath,
  loadActiveStores,
  productErrorMessage,
  productStoreBody,
  readRememberedStoreId,
  rememberStoreId,
  resolveStoreSelection,
  SELECTED_STORE_STORAGE_KEY,
  storeScopeParams,
  type AdminStore
} from "./productStore";

const linz: AdminStore = { id: "store-linz", storeCode: "LINZ-01", name: "Linz Mitte", region: { id: "region-1", name: "Oberösterreich" } };
const wien: AdminStore = { id: "store-wien", storeCode: "WIEN-01", name: "Wien Nord", region: { id: "region-2", name: "Wien" } };
const stores = [linz, wien];

test("list and delete paths carry the selected store as storeCode plus storeId", () => {
  assert.equal(storeScopeParams(linz).toString(), "storeCode=LINZ-01&storeId=store-linz");
  assert.equal(storeScopeParams({ id: "", storeCode: "LINZ-01" }).toString(), "storeCode=LINZ-01");
  assert.equal(deleteProductPath(42, linz), "/api/admin/products/42?storeCode=LINZ-01&storeId=store-linz");
  assert.deepEqual(productStoreBody(wien), { storeId: "store-wien", storeCode: "WIEN-01" });
  assert.equal(activeStorePath(2), "/api/stores?status=ACTIVE&page=2&size=100");
});

test("admin sees all stores, region manager only the region, store manager only the own store", () => {
  assert.deepEqual(accessibleStores({ role: "admin", scope: null }, stores), stores);
  assert.deepEqual(accessibleStores({ role: "region-manager", scope: { regionId: "region-2", regionName: "Wien", storeId: null, storeName: null } }, stores), [wien]);
  assert.deepEqual(accessibleStores({ role: "store-manager", scope: { regionId: "region-1", regionName: null, storeId: "store-linz", storeName: "Linz Mitte" } }, stores), [linz]);
  assert.deepEqual(accessibleStores({ role: "store-manager", scope: null }, stores), []);
  assert.deepEqual(accessibleStores(undefined, stores), stores);
});

test("exactly one accessible store is selected automatically, otherwise only a remembered accessible store is used", () => {
  assert.equal(resolveStoreSelection([linz], null), linz);
  assert.equal(resolveStoreSelection([linz], "store-wien"), linz);
  assert.equal(resolveStoreSelection(stores, null), null);
  assert.equal(resolveStoreSelection(stores, "store-wien"), wien);
  assert.equal(resolveStoreSelection([linz], undefined), linz);
  assert.equal(resolveStoreSelection([linz], "unknown-store"), linz);
  assert.equal(resolveStoreSelection([], "store-linz"), null);
});

test("remembered store survives reads and writes but tolerates blocked sessionStorage", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }
  };
  assert.equal(readRememberedStoreId(storage), null);
  rememberStoreId("store-wien", storage);
  assert.equal(values.get(SELECTED_STORE_STORAGE_KEY), "store-wien");
  assert.equal(readRememberedStoreId(storage), "store-wien");

  const blocked = {
    getItem: () => { throw new DOMException("blocked", "SecurityError"); },
    setItem: () => { throw new DOMException("blocked", "SecurityError"); }
  };
  assert.equal(readRememberedStoreId(blocked), null);
  assert.doesNotThrow(() => rememberStoreId("store-wien", blocked));
  assert.equal(readRememberedStoreId(null), null);
});

test("loads all active store pages and removes duplicates", async () => {
  const requested: string[] = [];
  const pages: Record<number, { content: AdminStore[]; totalElements: number }> = {
    0: { content: [linz], totalElements: 3 },
    1: { content: [wien, linz], totalElements: 3 },
    2: { content: [{ id: "store-graz", storeCode: "GRAZ-01", name: "Graz" }], totalElements: 3 }
  };
  const api = {
    get: async <T>(path: string): Promise<T> => {
      requested.push(path);
      const page = Number(new URL(path, "http://local").searchParams.get("page"));
      return pages[page] as T;
    }
  };
  const result = await loadActiveStores(api);
  assert.deepEqual(result.map((store) => store.storeCode), ["LINZ-01", "WIEN-01", "GRAZ-01"]);
  assert.equal(requested.length, 3);
});

test("rejects incomplete store responses instead of silently showing no stores", async () => {
  const api = { get: async <T>() => ({ content: "nope" }) as T };
  await assert.rejects(loadActiveStores(api), /Store-Antwort ist unvollständig/);
});

test("forbidden store access gets the explicit German message, other errors keep their text", () => {
  assert.equal(productErrorMessage(new ApiClientError("forbidden", 403, "Für diese Aktion fehlen die Berechtigungen.")), "Kein Zugriff auf diesen Markt.");
  assert.equal(productErrorMessage(new ApiClientError("validation", 400, "storeCode ist ungültig.")), "storeCode ist ungültig.");
  assert.equal(productErrorMessage("boom", "Fallback"), "Fallback");
});
