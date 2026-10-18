import assert from "node:assert/strict";
import test from "node:test";
import {
  describe as describeText,
  describeProduct,
  findShelf,
  matchesLayoutCode,
  NOT_IN_TEST_AREA
} from "../../main/resources/META-INF/resources/customer/shelf-text.js";
import { fixtureLayout } from "./customer-fixture.mjs";

const elements = fixtureLayout.elements;

test("NOT_IN_TEST_AREA is the customer-facing fallback text", () => {
  assert.equal(NOT_IN_TEST_AREA, "Nicht im Testbereich – bitte Personal fragen");
});

test("matchesLayoutCode compares base and meter parts exactly", () => {
  const shelf = { type: "shelf", category: "310/1" };
  assert.equal(matchesLayoutCode(shelf, "310/1/3/2"), true);
  assert.equal(matchesLayoutCode(shelf, "310//1/1"), false);
  assert.equal(matchesLayoutCode(shelf, "310/x/1/1"), false);
  assert.equal(matchesLayoutCode(shelf, "310"), false);
  assert.equal(matchesLayoutCode(shelf, "31/1/1/1"), false);
  assert.equal(matchesLayoutCode({ category: "310" }, "310/1/1/1"), false, "category without meter never matches");
  assert.equal(matchesLayoutCode({ category: "310" }, "310/7/1/1"), false, "stricter rule: no meter, no match");
  assert.equal(matchesLayoutCode({ category: "520/1" }, "520/2/3/1"), false);
  assert.equal(matchesLayoutCode(null, "310/1/1/1"), false);
});

test("findShelf returns the first matching shelf or null", () => {
  assert.equal(findShelf("800/1/3/2", elements).id, "s1");
  assert.equal(findShelf("310/2/1/1", elements).id, "s2");
  assert.equal(findShelf("999/9/1/1", elements), null);
  assert.equal(findShelf("310/x/1/1", elements), null);
  assert.equal(findShelf("310/2/1/1", []), null);
  assert.equal(findShelf("310/2/1/1", null), null);
});

test("findShelf ignores non-shelf elements and picks the right shelf of several", () => {
  const twoShelves = [
    { id: 1, type: "shelf", category: "520/1" },
    { id: 2, type: "shelf", category: "520/2" },
    { id: 3, type: "wall", category: "520/2" }
  ];
  assert.equal(findShelf("520/2/3/1", twoShelves).id, 2);
  assert.equal(findShelf("520/1/1/1", twoShelves).id, 1);
});

test("describe builds primary and detail text from the layout code", () => {
  const labelled = { type: "shelf", category: "800/1", label: "Gang 4 · links · Backzutaten" };
  const plain = { type: "shelf", category: "310/2" };

  const withLabel = describeText("800/1/3/2", labelled);
  assert.deepEqual(withLabel, {
    primary: "Gang 4 · links · Backzutaten",
    detail: "3. Boden von unten · Position 2",
    debugCode: "800/1/3/2"
  });
  assert.equal(withLabel.primary.includes("800"), false);
  assert.equal(withLabel.detail.includes("800"), false);

  assert.deepEqual(describeText("310/2/1/1", plain), {
    primary: "Regal 2",
    detail: "1. Boden von unten · Position 1",
    debugCode: "310/2/1/1"
  });
  assert.equal(describeText("310/2/oben/1", plain).detail, null);
  assert.equal(describeText("310/2/1/x", plain).detail, null);
  assert.equal(describeText("310/2", plain).detail, null);
  assert.equal(describeText("310/2/1/1/extra/parts", plain).detail, "1. Boden von unten · Position 1");
  assert.equal(describeText("310/2/1/1", { ...plain, label: "   " }).primary, "Regal 2");
});

test("describe returns null for unusable codes or missing shelves", () => {
  const plain = { type: "shelf", category: "310" };
  assert.equal(describeText("abc", plain), null);
  assert.equal(describeText("310", plain), null);
  assert.equal(describeText("/1/1/1", { type: "shelf", category: "/1" }), null);
  assert.equal(describeText("310/1/1/1", null), null);
  assert.equal(describeText(undefined, plain), null);
});

test("describeProduct resolves the shelf from the elements first", () => {
  const shelves = [{ id: "a", type: "shelf", category: "520/1", label: "Gang 5" }];
  assert.equal(describeProduct("310/1/1/1", shelves), null);
  assert.equal(describeProduct("310/1/1/1", []), null);
  assert.equal(describeProduct("520/1/1/1", shelves).primary, "Gang 5");

  const named = [{ type: "shelf", category: "310/1", label: "Gang 3" }];
  assert.equal(describeProduct("31/1/3/2", named), null);
  assert.equal(describeProduct("310/1/3/2", named).primary, "Gang 3");
  assert.equal(describeProduct("310/x/1/1", named), null);
  assert.equal(describeProduct("310//1/1", named), null);

  const noMeter = [{ type: "shelf", category: "310" }];
  assert.equal(describeProduct("310/7/1/1", noMeter), null, "shelf without meter is not matched");
});

test("describeProduct uses the fixture shelves", () => {
  assert.deepEqual(describeProduct("800/1/3/2", elements), {
    primary: "Gang 4 · links · Backzutaten",
    detail: "3. Boden von unten · Position 2",
    debugCode: "800/1/3/2"
  });
  assert.equal(describeProduct("310/2/1/1", elements).primary, "Regal 2");
});
