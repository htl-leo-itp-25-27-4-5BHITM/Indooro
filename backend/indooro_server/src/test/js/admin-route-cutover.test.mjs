import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { cutoverTarget, ROUTE_CUTOVER } from "../../main/resources/META-INF/resources/admin/route-cutover.js";

const paths = ["/admin/", "/admin/regions/", "/admin/stores/", "/admin/stores/detail/", "/admin/beacons/", "/admin/products/", "/admin/categories/", "/admin/recipes/", "/admin/editor/", "/admin/server-logs/"];

test("current admin entries remain on the legacy pages before parity approval", () => {
  assert.ok(Object.values(ROUTE_CUTOVER).every((enabled) => enabled === false));
  for (const path of paths) {
    assert.equal(cutoverTarget(path), null, path);
    const page = readFileSync(new URL(`../../main/resources/META-INF/resources${path}index.html`, import.meta.url), "utf8");
    assert.match(page, /<script type="module" src="\/admin\/route-cutover\.js"><\/script>/, path);
  }
});

test("each route can switch and roll back independently without losing a deep link", () => {
  for (const path of paths) {
    const keys = Object.keys(ROUTE_CUTOVER);
    const matching = keys.filter((key) => cutoverTarget(path, "?storeId=abc&layoutId=def", "#panel", { ...ROUTE_CUTOVER, [key]: true }));
    assert.equal(matching.length, 1, path);
    const flags = { ...ROUTE_CUTOVER, [matching[0]]: true };
    const target = cutoverTarget(path, "?storeId=abc&layoutId=def", "#panel", flags);
    assert.equal(target, path.replace("/admin/", "/admin/next/") + "?storeId=abc&layoutId=def#panel");
    assert.equal(cutoverTarget(path, "?storeId=abc", "", { ...flags, [matching[0]]: false }), null);
  }
  assert.equal(cutoverTarget("/admin/unknown/", "", "", { dashboard: true }), null);
});
