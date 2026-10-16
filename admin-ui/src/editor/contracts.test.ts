import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isLegacyLayoutDocument, isMobileCurrentLayout } from "./contracts";

const layout = JSON.parse(readFileSync(new URL("./fixtures/store-layout.json", import.meta.url), "utf8")) as unknown;

test("global layout contract accepts raw persisted JSON and rejects an envelope", () => {
  assert.equal(isLegacyLayoutDocument(layout), true);
  assert.equal(isLegacyLayoutDocument({ layout }), false);
  assert.equal(isLegacyLayoutDocument({ shopName: "X", gridSize: { width: 0, height: 60 }, elements: [] }), false);
});

test("mobile current-layout contract keeps source, fallback and layout ID distinct", () => {
  const fallback = { storeId: "store-1", layoutId: null, source: "DEFAULT", fallback: true, layout };
  const active = { ...fallback, layoutId: "layout-1", source: "ACTIVE", fallback: false };
  assert.equal(isMobileCurrentLayout(fallback), true);
  assert.equal(isMobileCurrentLayout(active), true);
  assert.equal(isMobileCurrentLayout({ ...active, layout: null }), false);
  assert.equal(isMobileCurrentLayout({ ...active, source: "DRAFT" }), false);
  assert.equal(isMobileCurrentLayout({ ...active, fallback: "false" }), false);
});
