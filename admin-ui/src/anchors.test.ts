import assert from "node:assert/strict";
import test from "node:test";
import { ANCHORS_PER_PAGE, anchorUrl, chunk, printableAnchors } from "./anchors.ts";
import type { LayoutDocument } from "./editor/model.ts";

test("anchor payload URL matches the customer web view contract and escapes both parameters", () => {
  assert.equal(anchorUrl("indooro.example", "SPAR-Leonding-001", "A12"), "https://indooro.example/customer/?store=SPAR-Leonding-001&a=A12");
  assert.equal(anchorUrl("indooro.example", "A&B 1", "GANG-4"), "https://indooro.example/customer/?store=A%26B%201&a=GANG-4");
});

test("chunk splits anchors into pages of six and handles edge sizes", () => {
  const eight = Array.from({ length: 8 }, (_, index) => index + 1);
  assert.deepEqual(chunk(eight).map((page) => page.length), [6, 2]);
  assert.equal(ANCHORS_PER_PAGE, 6);
  assert.deepEqual(chunk([1, 2, 3, 4, 5, 6]).map((page) => page.length), [6]);
  assert.deepEqual(chunk([] as number[]), []);
  assert.throws(() => chunk(eight, 0), RangeError);
  assert.throws(() => chunk(eight, 1.5), RangeError);
});

test("printable anchors skip non-anchors, invalid and repeated ids and fall back to the id as label", () => {
  const document: LayoutDocument = {
    shopName: "Test", gridSize: { width: 40, height: 30 },
    elements: [
      { id: 1, type: "entrance", x: 1, y: 1, width: 3, height: 1 },
      { id: 2, type: "anchor", x: 10, y: 3, width: 1, height: 1, label: "  Gang 4 – Anfang  ", anchorId: "A12" },
      { id: 3, type: "anchor", x: 12, y: 3, width: 1, height: 1, anchorId: "a13" },
      { id: 4, type: "anchor", x: 14, y: 3, width: 1, height: 1, anchorId: "A12", label: "Kopie" },
      { id: 5, type: "anchor", x: 16, y: 3, width: 1, height: 1, anchorId: "KASSE-1" },
      { id: 6, type: "shelf", x: 2, y: 5, width: 4, height: 2, anchorId: "A99" },
    ],
  };
  assert.deepEqual(printableAnchors(document, "indooro.example", "SPAR-Leonding-001"), [
    { anchorId: "A12", label: "Gang 4 – Anfang", url: "https://indooro.example/customer/?store=SPAR-Leonding-001&a=A12" },
    { anchorId: "KASSE-1", label: "KASSE-1", url: "https://indooro.example/customer/?store=SPAR-Leonding-001&a=KASSE-1" },
  ]);
});
