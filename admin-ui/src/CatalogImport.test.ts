import assert from "node:assert/strict";
import test from "node:test";
import { parseCatalogImportText, reviewCatalogImport } from "./CatalogImport";

test("parses JSON arrays and reviews category required values and duplicate codes", () => {
  const rows = parseCatalogImportText('[{"categoryCode":310,"categoryName":"Obst"},{"categoryCode":310,"categoryName":"Gemüse"},{"categoryCode":420,"categoryName":" "}]');
  const review = reviewCatalogImport("category", rows);
  assert.deepEqual([review.total, review.valid, review.invalid], [3, 1, 2]);
  assert.match(review.rows[1].errors.join(" "), /Doppelte categoryCode: 310/);
  assert.match(review.rows[2].errors.join(" "), /categoryName ist erforderlich/);
});

test("keeps NDJSON syntax failures as row-level errors and validates products and duplicate IDs", () => {
  const rows = parseCatalogImportText('{"id":7,"name":"Apfel","price":1.2,"layoutCode":"310/1/1/1"}\nnot json\n{"id":7,"name":"Birne","price":-1,"layoutCode":"310/9/1/1"}');
  const review = reviewCatalogImport("product", rows);
  assert.deepEqual(review.rows.map((row) => row.row), [1, 2, 3]);
  assert.deepEqual([review.total, review.valid, review.invalid], [3, 1, 2]);
  assert.match(review.rows[1].errors[0], /Zeile 2 ist kein gültiges JSON/);
  assert.match(review.rows[2].errors.join(" "), /Doppelte id: 7/);
  assert.match(review.rows[2].errors.join(" "), /Preis muss eine endliche Zahl ab 0 sein/);
  assert.match(review.rows[2].errors.join(" "), /Layout-Code muss dem unterstützten Format/);
});

test("rejects malformed JSON arrays and empty input", () => {
  assert.throws(() => parseCatalogImportText("[{bad json}]"), /JSON-Array ist ungültig/);
  assert.deepEqual(parseCatalogImportText(" \n "), []);
});
