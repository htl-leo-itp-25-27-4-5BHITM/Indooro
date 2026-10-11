import assert from "node:assert/strict";
import test from "node:test";
import {
  assignableStores,
  beaconListPath,
  canManageBeacon,
  normalizeBeaconUuid,
  parseBulkBeacons,
  validateBeaconDraft,
  type Beacon,
  type BeaconDraft,
  type BeaconStore
} from "./BeaconsPage";
import type { CurrentUser } from "./routes";

const store: BeaconStore = { id: "store-1", storeCode: "LINZ-01", name: "Linz", status: "ACTIVE", region: { id: "region-1", name: "Oberösterreich" } };
const otherStore: BeaconStore = { id: "store-2", storeCode: "WIEN-01", name: "Wien", status: "ACTIVE", region: { id: "region-2", name: "Wien" } };
const assignedBeacon: Beacon = {
  id: "beacon-1", beaconCode: "B-001", uuid: "fda50693a4e24fb1afcfc6eb07647825", major: 1, minor: 2,
  identityKey: "fda50693a4e24fb1afcfc6eb07647825:1:2", status: "ACTIVE", notes: null,
  currentStore: { id: store.id, storeCode: store.storeCode, name: store.name }, createdAt: "", updatedAt: ""
};

function user(role: string, regionId: string | null = null, storeId: string | null = null): CurrentUser {
  return { subject: "subject", username: "staff", email: null, role, scope: { regionId, regionName: null, storeId, storeName: null } };
}

test("beacon inventory query encodes search, status, assignment, and store filters", () => {
  assert.equal(beaconListPath({ query: " B-01 ", status: "ARCHIVED", assigned: "free", storeId: "store 1" }),
    "/api/beacons?status=ARCHIVED&assigned=false&storeId=store+1&query=B-01");
  assert.equal(beaconListPath({ query: "", status: "ACTIVE", assigned: "all", storeId: "" }), "/api/beacons?status=ACTIVE");
});

test("normalizes dashed beacon UUIDs and validates a complete bounded identity", () => {
  const uuid = "FDA50693-A4E2-4FB1-AFCF-C6EB07647825";
  const normalized = "fda50693a4e24fb1afcfc6eb07647825";
  assert.equal(normalizeBeaconUuid(uuid), normalized);
  const draft: BeaconDraft = { beaconCode: " B-002 ", uuid, major: "65535", minor: "0", notes: "" };
  assert.deepEqual(validateBeaconDraft(draft, []), {});
});

test("rejects malformed or half-specified beacon identities and duplicate identities", () => {
  const half: BeaconDraft = { beaconCode: "B-002", uuid: "fda50693-a4e2-4fb1-afcf-c6eb07647825", major: "1", minor: "", notes: "" };
  assert.match(validateBeaconDraft(half, []).identity, /gemeinsam/);
  const outOfRange: BeaconDraft = { ...half, major: "65536", minor: "2" };
  assert.match(validateBeaconDraft(outOfRange, []).major, /0 und 65535/);
  const duplicate: BeaconDraft = { ...half, major: "1", minor: "2" };
  assert.match(validateBeaconDraft(duplicate, [assignedBeacon]).identity, /bereits vergeben/);
  assert.match(validateBeaconDraft({ ...duplicate, uuid: "bad" }, []).uuid, /32 hexadezimale/);
});

test("bulk review identifies row, duplicate code, and shared identity errors before commit", () => {
  const parsed = parseBulkBeacons("fda50693-a4e2-4fb1-afcf-c6eb07647825", "1", "B-002,3\nB-002,4\nB-004,3\nB-003,nope\n,5", [assignedBeacon]);
  assert.equal(parsed.uuid, "fda50693a4e24fb1afcfc6eb07647825");
  assert.deepEqual(parsed.rows.map((row) => row.line), [1, 2, 3, 4, 5]);
  assert.equal(parsed.rows[0].error, "");
  assert.match(parsed.rows[1].error, /Code kommt/);
  assert.match(parsed.rows[2].error, /mehrfach/);
  assert.match(parsed.rows[3].error, /Minor muss/);
  assert.match(parsed.rows[4].error, /Beacon-Code ist erforderlich/);
});

test("bulk review validates paired Major/Minor values and malformed UUID", () => {
  const halfIdentity = parseBulkBeacons("fda50693a4e24fb1afcfc6eb07647825", "1", "B-001,", []);
  assert.match(halfIdentity.rows[0].error, /Major und Minor müssen gemeinsam/);
  const badUuid = parseBulkBeacons("invalid", "1", "B-001,1", []);
  assert.equal(badUuid.uuid, null);
  assert.match(badUuid.rows[0].error, /gemeinsame UUID/i);
  const uuidOnly = parseBulkBeacons("fda50693a4e24fb1afcfc6eb07647825", "", "B-001,", []);
  assert.equal(uuidOnly.rows[0].error, "");
  assert.equal(uuidOnly.rows[0].minor, null);
});

test("store and region managers only see mutation targets in their backend scope", () => {
  assert.equal(canManageBeacon(user("admin"), assignedBeacon, [store]), true);
  assert.equal(canManageBeacon(user("region-manager", "region-1"), assignedBeacon, [store]), true);
  assert.equal(canManageBeacon(user("region-manager", "region-2"), assignedBeacon, [store]), false);
  assert.equal(canManageBeacon(user("store-manager", null, "store-1"), assignedBeacon, [store]), true);
  assert.equal(canManageBeacon(user("store-manager", null, "store-2"), assignedBeacon, [store]), false);
  assert.equal(canManageBeacon(user("admin"), { ...assignedBeacon, currentStore: null }, [store]), true);
  assert.deepEqual(assignableStores(user("region-manager", "region-1"), [store, otherStore]), [store]);
  assert.deepEqual(assignableStores(user("store-manager", null, "store-2"), [store, otherStore]), [otherStore]);
});
