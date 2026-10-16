import assert from "node:assert/strict";
import { test } from "node:test";
import { readStoreQuery, storeApiPath, storeQueryString } from "./StoresPage.tsx";

test("store filters map to server query before pagination", () => {
  const query = readStoreQuery("?query=Linz&regionId=region-1&status=ARCHIVED&layout=missing&sort=city&page=2");
  assert.deepEqual(query, { query: "Linz", regionId: "region-1", status: "ARCHIVED", layout: "missing", sort: "city", page: 2 });
  assert.equal(storeApiPath(query), "/api/stores?page=2&size=20&status=ARCHIVED&query=Linz&regionId=region-1&hasActiveLayout=false&sort=city");
  assert.equal(storeQueryString({ ...query, page: 0 }), "query=Linz&regionId=region-1&status=ARCHIVED&layout=missing&sort=city");
});

test("invalid URL state falls back to safe active first page", () => {
  const query = readStoreQuery("?page=-2&status=UNKNOWN&layout=invalid&sort=unsafe");
  assert.deepEqual(query, { query: "", regionId: "", status: "ACTIVE", layout: "", sort: "name", page: 0 });
});
