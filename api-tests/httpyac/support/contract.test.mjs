import assert from "node:assert/strict";
import test from "node:test";
import { validateResponse } from "./contract.mjs";

const validStores = [
  { id: "5d1b4b7e-3a4f-4c52-9d11-0f0a6b2c9e01", storeCode: "demo-store", name: "Demo Filiale", city: "Leonding" }
];

test("listMobileStores accepts the documented array of store summaries", () => {
  assert.doesNotThrow(() => validateResponse("listMobileStores", 200, validStores));
  assert.doesNotThrow(() => validateResponse("listMobileStores", 200, []));
});

test("listMobileStores rejects the wrapped shape with an items property", () => {
  const wrapped = { items: validStores };
  assert.throws(
    () => validateResponse("listMobileStores", 200, wrapped),
    (error) => {
      assert.match(error.message, /^validateResponse: listMobileStores 200 does not match openapi\.yaml/);
      assert.match(error.message, /must be array/);
      return true;
    }
  );
});

test("listMobileStores rejects a store summary without the required storeCode", () => {
  const missingCode = [{ id: validStores[0].id, name: "Demo Filiale" }];
  assert.throws(
    () => validateResponse("listMobileStores", 200, missingCode),
    /\/0 must have required property 'storeCode'/
  );
});

test("an undocumented status fails with the documented alternatives", () => {
  assert.throws(
    () => validateResponse("listMobileStores", 500, validStores),
    /does not document status 500; documented: 200/
  );
});

test("a documented response without a JSON schema passes without a body check", () => {
  // postUpsellEvent documents 202 with no content.
  assert.doesNotThrow(() => validateResponse("postUpsellEvent", 202, undefined));
});

test("an unknown operationId fails loudly", () => {
  assert.throws(
    () => validateResponse("noSuchOperation", 200, {}),
    /operationId "noSuchOperation" does not exist/
  );
});

test("component references resolve for nested schemas", () => {
  const byBeacon = {
    store: { id: validStores[0].id, storeCode: "demo-store", name: "Demo Filiale" },
    matchedBeacon: { beaconId: validStores[0].id, beaconCode: "B-1", identityKey: "x" }
  };
  assert.doesNotThrow(() => validateResponse("findMobileStoreByBeacon", 200, byBeacon));
  assert.throws(
    () => validateResponse("findMobileStoreByBeacon", 200, { ...byBeacon, store: { name: "no id" } }),
    /\/store must have required property 'id'/
  );
});
