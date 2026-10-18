import assert from "node:assert/strict";
import test from "node:test";
import type { ApiSchemas } from "./types";

// Compile-time check: `satisfies` rejects missing or unknown fields, so `tsc --noEmit` fails
// when a schema field used here is removed or renamed in the reviewed contract.
test("MobileStoreSummary literal matches the contract schema", () => {
  const summary = {
    id: "5f1c1d52-0c4a-4f4e-9d6e-2b7e1a2c3d4e",
    storeCode: "SPAR-Leonding-001",
    name: "SPAR Leonding",
    city: "Leonding",
    address: "Hauptstrasse 1, 4060 Leonding",
    latitude: 48.27,
    longitude: 14.25,
  } satisfies ApiSchemas["MobileStoreSummary"];

  assert.equal(summary.storeCode, "SPAR-Leonding-001");
});
