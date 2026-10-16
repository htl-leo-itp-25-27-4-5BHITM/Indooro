import assert from "node:assert/strict";
import { test } from "node:test";
import { candidateAccess, candidateNavigationPath, visibleRoutes } from "./routes.ts";

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
  assert.equal(candidateAccess("/admin/next/stores/readiness/", "store-manager", "store-1", "store-1"), "allowed");
  assert.equal(candidateAccess("/admin/next/stores/readiness/", "store-manager", "store-2", "store-1"), "forbidden");
  assert.equal(candidateAccess("/admin/next/stores/readiness/", "store-manager"), "forbidden");
  assert.equal(candidateAccess("/admin/next/stores/readiness/", "region-manager", "store-2", null), "allowed");
  assert.equal(candidateAccess("/admin/next/stores/readiness/", "viewer", "store-1", "store-1"), "forbidden");
  assert.equal(candidateAccess("/admin/next/stores/", "region-manager"), "allowed");
  assert.equal(candidateAccess("/admin/next/regions/", "region-manager"), "allowed");
  assert.equal(candidateAccess("/admin/next/regions/", "store-manager"), "forbidden");
  assert.equal(candidateAccess("/admin/next/beacons/", "store-manager"), "allowed");
  assert.equal(candidateAccess("/admin/next/recipes/", "region-manager"), "forbidden");
  assert.equal(candidateAccess("/admin/next/server-logs/", "store-manager"), "forbidden");
  assert.equal(candidateAccess("/admin/next/products/", "admin"), "allowed");
  assert.equal(candidateAccess("/admin/next/products/", "region-manager"), "forbidden");
  assert.equal(candidateAccess("/admin/next/categories/", "admin"), "allowed");
  assert.equal(candidateAccess("/admin/next/editor/", "store-manager", "store-2", "store-1"), "forbidden");
  assert.equal(candidateAccess("/admin/next/editor/", "admin"), "allowed");
  assert.equal(candidateAccess("/admin/next/editor/", "region-manager"), "forbidden");
  assert.equal(candidateAccess("/admin/next/other/", "admin"), "missing");
});

test("candidate navigation keeps staff inside the new shell and scopes editor links", () => {
  const editor = visibleRoutes("store-manager").find((route) => route.label === "Layout Editor")!;
  assert.equal(candidateNavigationPath(editor, { subject: "store-1", username: "manager", email: null, role: "store-manager", scope: { regionId: null, regionName: null, storeId: "store-1", storeName: "Linz" } }), "/admin/next/editor/?storeId=store-1");
  const products = visibleRoutes("admin").find((route) => route.label === "Produkte")!;
  assert.equal(candidateNavigationPath(products, { subject: "admin-1", username: "admin", email: null, role: "admin", scope: null }), "/admin/next/products/");
});

test("QR anchor print page follows the store detail access rules", () => {
  assert.equal(candidateAccess("/admin/next/stores/anchors/", "store-manager", "store-1", "store-1"), "allowed");
  assert.equal(candidateAccess("/admin/next/stores/anchors/", "store-manager", "store-2", "store-1"), "forbidden");
  assert.equal(candidateAccess("/admin/next/stores/anchors/", "store-manager"), "forbidden");
  assert.equal(candidateAccess("/admin/next/stores/anchors/", "region-manager", "store-2"), "allowed");
  assert.equal(candidateAccess("/admin/next/stores/anchors", "admin"), "allowed");
  assert.equal(candidateAccess("/admin/next/stores/anchors/", "viewer"), "forbidden");
});
