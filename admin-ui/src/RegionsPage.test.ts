import assert from "node:assert/strict";
import test from "node:test";
import {
  canManageRegions,
  canReadRegions,
  regionListPath,
  regionPayload,
  validateRegionDraft,
  type RegionDraft
} from "./RegionsPage";

test("region access is read-only for region managers and unavailable to store managers", () => {
  assert.equal(canReadRegions("admin"), true);
  assert.equal(canManageRegions("admin"), true);
  assert.equal(canReadRegions("region-manager"), true);
  assert.equal(canManageRegions("region-manager"), false);
  assert.equal(canReadRegions("store-manager"), false);
  assert.equal(canManageRegions("store-manager"), false);
});

test("region status is requested from the scoped API", () => {
  assert.equal(regionListPath("ACTIVE"), "/api/regions?status=ACTIVE");
  assert.equal(regionListPath("ARCHIVED"), "/api/regions?status=ARCHIVED");
});

test("region validation uses backend limits and rejects whitespace-only required fields", () => {
  const blank: RegionDraft = { code: "   ", name: "  ", description: "" };
  assert.deepEqual(validateRegionDraft(blank), {
    code: "Code ist erforderlich.",
    name: "Name ist erforderlich."
  });

  assert.deepEqual(validateRegionDraft({
    code: "c".repeat(51),
    name: "n".repeat(121),
    description: "d".repeat(2001)
  }), {
    code: "Der Code darf höchstens 50 Zeichen enthalten.",
    name: "Der Name darf höchstens 120 Zeichen enthalten.",
    description: "Die Beschreibung darf höchstens 2000 Zeichen enthalten."
  });
});

test("region payload trims entered values while keeping optional description", () => {
  assert.deepEqual(regionPayload({ code: " AT-OO ", name: " Oberösterreich ", description: " Gebiet " }), {
    code: "AT-OO",
    name: "Oberösterreich",
    description: "Gebiet"
  });
  assert.deepEqual(regionPayload({ code: "AT", name: "Tirol", description: "  " }), {
    code: "AT",
    name: "Tirol",
    description: ""
  });
});
