import assert from "node:assert/strict";
import { test } from "node:test";
import { accessListPath, accessPayload, blankAccessDraft, canManageAccess, scopeLabel, validateAccessDraft, type AccessAssignment } from "./accessAssignments.ts";

test("only admins manage access assignments", () => {
  assert.equal(canManageAccess("admin"), true);
  assert.equal(canManageAccess("region-manager"), false);
  assert.equal(canManageAccess("store-manager"), false);
  assert.equal(canManageAccess(""), false);
});

test("list path carries the status filter except for all rows", () => {
  assert.equal(accessListPath("ACTIVE"), "/api/admin/access-assignments?status=ACTIVE");
  assert.equal(accessListPath("DISABLED"), "/api/admin/access-assignments?status=DISABLED");
  assert.equal(accessListPath("ALL"), "/api/admin/access-assignments");
});

test("validation follows the backend scope rules", () => {
  const draft = { ...blankAccessDraft(), keycloakSubject: "sub-1", username: "marta" };
  assert.deepEqual(Object.keys(validateAccessDraft(draft)), ["storeId"]);
  assert.deepEqual(validateAccessDraft({ ...draft, storeId: "store-1" }), {});
  assert.deepEqual(Object.keys(validateAccessDraft({ ...draft, role: "region-manager" })), ["regionId"]);
  assert.deepEqual(validateAccessDraft({ ...draft, role: "admin" }), {});
  assert.ok(validateAccessDraft({ ...draft, keycloakSubject: "a b", storeId: "s" }).keycloakSubject);
  assert.ok(validateAccessDraft({ ...draft, keycloakSubject: "  ", storeId: "s" }).keycloakSubject);
  assert.ok(validateAccessDraft({ ...draft, username: " ", storeId: "s" }).username);
  assert.ok(validateAccessDraft({ ...draft, email: "kein-mail", storeId: "s" }).email);
  assert.equal(validateAccessDraft({ ...draft, email: "marta@example.test", storeId: "s" }).email, undefined);
});

test("payload trims input and sends only the scope of the chosen role", () => {
  const draft = { keycloakSubject: " sub-1 ", username: " marta ", email: " ", role: "store-manager" as const, regionId: "region-1", storeId: "store-1" };
  assert.deepEqual(accessPayload(draft), { keycloakSubject: "sub-1", username: "marta", email: null, role: "store-manager", regionId: null, storeId: "store-1" });
  assert.deepEqual(accessPayload({ ...draft, role: "region-manager" }), { keycloakSubject: "sub-1", username: "marta", email: null, role: "region-manager", regionId: "region-1", storeId: null });
  assert.deepEqual(accessPayload({ ...draft, role: "admin" }).regionId, null);
  assert.deepEqual(accessPayload({ ...draft, role: "admin" }).storeId, null);
});

test("scope label names the store, the region or all stores", () => {
  const base: AccessAssignment = { id: "a", keycloakSubject: "s", username: "u", email: null, role: "store-manager", regionId: null, regionName: null, storeId: "store-1", storeCode: "SPAR-1", storeName: "Leonding", status: "ACTIVE", createdAt: "", updatedAt: "" };
  assert.equal(scopeLabel(base), "Leonding (SPAR-1)");
  assert.equal(scopeLabel({ ...base, role: "region-manager", storeId: null, regionId: "r", regionName: "Oberösterreich" }), "Oberösterreich");
  assert.equal(scopeLabel({ ...base, role: "admin", storeId: null }), "Alle Märkte");
});
