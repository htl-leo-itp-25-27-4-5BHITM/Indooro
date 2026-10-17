import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { cutoverTarget, ROUTE_CUTOVER } from "../../main/resources/META-INF/resources/admin/route-cutover.js";

const paths = ["/admin/", "/admin/regions/", "/admin/stores/", "/admin/stores/detail/", "/admin/beacons/", "/admin/products/", "/admin/categories/", "/admin/recipes/", "/admin/editor/", "/admin/server-logs/"];

test("approved dashboard, regions, stores, store detail, beacons, products, categories, recipes, and diagnostics entries redirect independently", () => {
  assert.deepEqual(ROUTE_CUTOVER, {
    dashboard: true, regions: true, stores: true, storeDetail: true,
    beacons: true, products: true, categories: true, recipes: true,
    editor: false, diagnostics: true
  });
  const expectedTargets = {
    "/admin/": "/admin/next/",
    "/admin/regions/": "/admin/next/regions/",
    "/admin/stores/": "/admin/next/stores/",
    "/admin/stores/detail/": "/admin/next/stores/detail/",
    "/admin/beacons/": "/admin/next/beacons/",
    "/admin/products/": "/admin/next/products/",
    "/admin/categories/": "/admin/next/categories/",
    "/admin/recipes/": "/admin/next/recipes/",
    "/admin/server-logs/": "/admin/next/server-logs/"
  };
  for (const path of paths) {
    assert.equal(cutoverTarget(path), expectedTargets[path] ?? null, path);
    const page = readFileSync(new URL(`../../main/resources/META-INF/resources${path}index.html`, import.meta.url), "utf8");
    assert.match(page, /<script type="module" src="\/admin\/route-cutover\.js"><\/script>/, path);
  }
});

test("the editor entry covers store and global links, keeps query and fragment, and falls back with legacy=1", () => {
  const on = { ...ROUTE_CUTOVER, editor: true };
  assert.equal(cutoverTarget("/admin/editor/", "?storeId=abc&layoutId=def", "#x", on), "/admin/next/editor/?storeId=abc&layoutId=def#x");
  assert.equal(cutoverTarget("/admin/editor/", "", "", on), "/admin/next/editor/");
  assert.equal(cutoverTarget("/admin/editor", "?layoutId=def", "", on), "/admin/next/editor/?layoutId=def");
  assert.equal(cutoverTarget("/admin/editor/", "?storeId=abc&legacy=1", "", on), null);
  assert.equal(cutoverTarget("/admin/editor/", "", "", { ...ROUTE_CUTOVER, editor: false }), null);
});

test("legacy=1 keeps one visit on the original page even when the route is switched", () => {
  const allOn = Object.fromEntries(Object.keys(ROUTE_CUTOVER).map((key) => [key, true]));
  for (const path of paths) {
    assert.ok(cutoverTarget(path, "?storeId=abc", "", allOn), `${path} redirects without the fallback`);
    assert.equal(cutoverTarget(path, "?storeId=abc&legacy=1", "", allOn), null, path);
    assert.equal(cutoverTarget(path, "?legacy=1", "#panel", allOn), null, path);
    assert.ok(cutoverTarget(path, "?legacy=0", "", allOn), `${path} ignores other legacy values`);
  }
});

test("each route can switch and roll back independently without losing a deep link", () => {
  const disabledFlags = Object.fromEntries(Object.keys(ROUTE_CUTOVER).map((key) => [key, false]));
  for (const path of paths) {
    const keys = Object.keys(ROUTE_CUTOVER);
    const matching = keys.filter((key) => cutoverTarget(path, "?storeId=abc&layoutId=def", "#panel", { ...disabledFlags, [key]: true }));
    assert.equal(matching.length, 1, path);
    const flags = { ...disabledFlags, [matching[0]]: true };
    const target = cutoverTarget(path, "?storeId=abc&layoutId=def", "#panel", flags);
    assert.equal(target, path.replace("/admin/", "/admin/next/") + "?storeId=abc&layoutId=def#panel");
    assert.equal(cutoverTarget(path, "?storeId=abc", "", { ...flags, [matching[0]]: false }), null);
  }
  assert.equal(cutoverTarget("/admin/unknown/", "", "", { dashboard: true }), null);
});
