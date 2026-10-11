import assert from "node:assert/strict";
import { test } from "node:test";
import { candidateAccess, visibleRoutes } from "./routes.ts";

test("navigation follows current staff roles", () => {
  assert.equal(visibleRoutes("admin").length, 9);
  assert.deepEqual(visibleRoutes("region-manager").map((route) => route.label), ["Dashboard", "Regionen", "Stores", "Beacons", "Layout Editor"]);
  assert.deepEqual(visibleRoutes("store-manager").map((route) => route.label), ["Dashboard", "Stores", "Beacons", "Layout Editor"]);
  assert.deepEqual(visibleRoutes("unknown"), []);
});

test("candidate direct links deny unknown roles and unknown paths", () => {
  assert.equal(candidateAccess("/admin/next/stores/detail/", "store-manager", "store-1", "store-1"), "allowed");
  assert.equal(candidateAccess("/admin/next/stores/detail/", "store-manager", "store-2", "store-1"), "forbidden");
  assert.equal(candidateAccess("/admin/next/stores/detail/", "viewer"), "forbidden");
  assert.equal(candidateAccess("/admin/next/stores/", "region-manager"), "allowed");
  assert.equal(candidateAccess("/admin/next/regions/", "region-manager"), "allowed");
  assert.equal(candidateAccess("/admin/next/regions/", "store-manager"), "forbidden");
  assert.equal(candidateAccess("/admin/next/beacons/", "store-manager"), "allowed");
  assert.equal(candidateAccess("/admin/next/recipes/", "region-manager"), "forbidden");
  assert.equal(candidateAccess("/admin/next/server-logs/", "store-manager"), "forbidden");
  assert.equal(candidateAccess("/admin/next/editor/", "store-manager", "store-2", "store-1"), "forbidden");
  assert.equal(candidateAccess("/admin/next/other/", "admin"), "missing");
});
