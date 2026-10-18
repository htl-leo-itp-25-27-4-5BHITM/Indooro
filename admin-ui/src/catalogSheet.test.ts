import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { decodeCsvBytes, parseCsv } from "./catalogCsv";
import { reviewSheet, type SheetLayout } from "./catalogSheet";

const loadLayout = (): SheetLayout =>
  JSON.parse(readFileSync(new URL("./fixtures/catalog/layout.json", import.meta.url), "utf8")) as SheetLayout;
const loadSheet = (name: string) =>
  parseCsv(decodeCsvBytes(readFileSync(new URL(`./fixtures/catalog/${name}`, import.meta.url))));
const HEADER = "id;name;marke;menge;regal_label;kategorie;meter;fach;reihe;preis";
const errorsOf = (review: ReturnType<typeof reviewSheet>) => review.errors.map((error) => [error.line, error.field]);

test("a valid 12 row sheet becomes 12 products without errors", () => {
  const review = reviewSheet(loadSheet("valid.csv"), loadLayout());
  assert.deepEqual(review.errors, []);
  assert.equal(review.products.length, 12);
  assert.deepEqual(review.summary, { rows: 12, valid: 12, excluded: 0, shelvesUsed: 3, shelvesWithoutProducts: 1 });
  assert.deepEqual(review.overwrites, []);
  assert.deepEqual(review.products.map((product) => product.id), [101, 1, 2, 3, 5, 6, 7, 8, 4, 120, 9, 10]);
  assert.deepEqual(review.products[0], { id: 101, name: "Gala Apfel 1 kg", price: 1.99, layoutCode: "310/1/1/1" });
  assert.deepEqual(review.products[2], { id: 2, name: "Mandarine", layoutCode: "310/1/2/1" });
  assert.equal(review.products[3].price, 4.2);
  assert.equal(review.products[3].layoutCode, "420/1/1/1");
});

test("umlauts and collapsed spaces survive into product names", () => {
  const review = reviewSheet(loadSheet("valid.csv"), loadLayout());
  const names = review.products.map((product) => product.name);
  assert.ok(names.includes("Bergkäse Käse 200 g"));
  assert.ok(names.includes("Natur Hof Joghurt 150 g"));
  assert.ok(names.includes("Bäckerei Groß Brötchen 6 Stück"));
  assert.ok(names.includes("Kürbiskern Öl 250 ml"));
});

test("a row without a matching shelf is reported with its file line number", () => {
  const review = reviewSheet(loadSheet("errors.csv"), loadLayout());
  const unknown = review.rows.find((row) => row.line === 2);
  assert.deepEqual(unknown?.errors, [{ line: 2, field: "kategorie", message: "Kein Regal 812/3 im aktiven Layout." }]);
  assert.deepEqual(errorsOf(review), [
    [2, "kategorie"], [3, "regal_label"], [4, "reihe"], [5, "name"], [6, "id"], [7, "id"],
    [8, "id"], [9, "preis"], [10, "preis"], [11, "kategorie"], [12, "meter"], [13, "fach"]
  ]);
  assert.equal(review.summary.valid, 1);
  assert.deepEqual(review.products, [{ id: 1, name: "Ok", price: 2.5, layoutCode: "310/1/1/10" }]);
});

test("excluding a row removes its errors and frees its duplicate id", () => {
  const review = reviewSheet(loadSheet("errors.csv"), loadLayout(), { excludedRows: new Set([2, 6]) });
  assert.deepEqual(errorsOf(review), [
    [3, "regal_label"], [4, "reihe"], [5, "name"], [8, "id"], [9, "preis"], [10, "preis"], [11, "kategorie"], [12, "meter"], [13, "fach"]
  ]);
  assert.deepEqual(review.rows.find((row) => row.line === 2)?.status, "excluded");
  assert.deepEqual(review.summary, { rows: 13, valid: 2, excluded: 2, shelvesUsed: 1, shelvesWithoutProducts: 3 });
  assert.deepEqual(review.products.map((product) => product.id), [7, 1]);
});

test("duplicate ids are reported on both rows", () => {
  const review = reviewSheet(loadSheet("errors.csv"), loadLayout());
  const duplicates = review.errors.filter((error) => error.field === "id" && error.message.includes("mehrfach"));
  assert.deepEqual(duplicates.map((error) => error.line), [6, 7]);
});

test("overwrites list valid products whose ids already exist and automatic ids skip them", () => {
  const review = reviewSheet(loadSheet("valid.csv"), loadLayout(), { existingIds: new Set([2, 3, 101]) });
  assert.deepEqual(review.overwrites, [101]);
  assert.deepEqual(review.products.map((product) => product.id), [101, 1, 5, 6, 7, 8, 9, 10, 4, 120, 11, 12]);
});

test("existing ids that are explicit in the file are listed as overwrites in file order", () => {
  const review = reviewSheet(loadSheet("valid.csv"), loadLayout(), { existingIds: new Set([4, 101]) });
  assert.deepEqual(review.overwrites, [101, 4]);
});

test("automatic ids start at startId and skip ids used in the file", () => {
  const csv = parseCsv(`${HEADER}\n;A;;;;310;1;1;1;\n5;B;;;;310;1;1;2;\n;C;;;;310;1;1;3;`);
  const review = reviewSheet(csv, loadLayout(), { startId: 4 });
  assert.deepEqual(review.products.map((product) => product.id), [4, 5, 6]);
});

test("a missing required column is a file error that names the column", () => {
  const csv = parseCsv("id;name;marke;menge;regal_label;kategorie;meter;reihe;preis\n;A;;;;310;1;1;");
  const review = reviewSheet(csv, loadLayout());
  assert.deepEqual(review.errors, [{ line: null, field: "fach", message: "Spalte „fach“ fehlt in der Kopfzeile." }]);
  assert.deepEqual(review.products, []);
  assert.deepEqual(review.rows, []);
  assert.deepEqual(review.overwrites, []);
});

test("a sheet without product rows is a file error", () => {
  const review = reviewSheet(parseCsv(HEADER), loadLayout());
  assert.deepEqual(review.errors.map((error) => error.line), [null]);
  assert.deepEqual(review.products, []);
});

test("German header variants are accepted case-insensitively", () => {
  const csv = parseCsv("ID;Produktname;Marke;Menge;Regal Label;Kategorie;Meter;Fach;Reihe;Preis (€)\n;Apfel;Gala;1 kg;Gang 1 · links · obst & gemüse;310;1;1;1;1,99");
  const review = reviewSheet(csv, loadLayout());
  assert.deepEqual(review.errors, []);
  assert.deepEqual(review.products, [{ id: 1, name: "Gala Apfel 1 kg", price: 1.99, layoutCode: "310/1/1/1" }]);
});

test("name must not be empty and at most 180 characters long", () => {
  const long = "x".repeat(180);
  const tooLong = "x".repeat(181);
  const csv = parseCsv(`${HEADER}\n;${long};;;;310;1;1;1;\n;${tooLong};;;;310;1;1;2;\n;;;;;310;1;1;3;`);
  const review = reviewSheet(csv, loadLayout());
  assert.deepEqual(errorsOf(review), [[3, "name"], [4, "name"]]);
  assert.match(review.errors[0].message, /180 Zeichen/);
});

test("numbers must be whole numbers in the allowed digit ranges, leading zeros are dropped", () => {
  const csv = parseCsv([
    HEADER,
    ";A;;;;0310;1;1;1;",
    ";B;;;;310;1.5;1;1;",
    ";C;;;;310;1;abc;1;",
    ";D;;;;310;1;1;123;",
    ";E;;;;12345;1;1;1;"
  ].join("\n"));
  const review = reviewSheet(csv, loadLayout());
  assert.deepEqual(errorsOf(review), [[3, "meter"], [4, "fach"], [5, "reihe"], [6, "kategorie"]]);
  assert.deepEqual(review.products, [{ id: 1, name: "A", layoutCode: "310/1/1/1" }]);
});

test("prices accept comma or dot and must be non-negative with at most two decimals", () => {
  const csv = parseCsv([
    HEADER,
    ";A;;;;310;1;1;1;1,5",
    ";B;;;;310;1;1;2;1.5",
    ";C;;;;310;1;1;3;0",
    ";D;;;;310;1;1;4;-1",
    ";E;;;;310;1;1;5;1.234,50",
    ";F;;;;310;1;1;6;abc",
    ";G;;;;310;1;1;7;1,555"
  ].join("\n"));
  const review = reviewSheet(csv, loadLayout());
  assert.deepEqual(errorsOf(review), [[5, "preis"], [6, "preis"], [7, "preis"], [8, "preis"]]);
  assert.deepEqual(review.products.map((product) => product.price), [1.5, 1.5, 0]);
});

test("ids must be whole numbers from 1; invalid ids do not block automatic ids", () => {
  const csv = parseCsv([
    HEADER,
    "x;A;;;;310;1;1;1;",
    "1.5;B;;;;310;1;1;2;",
    "-3;C;;;;310;1;1;3;",
    ";D;;;;310;1;1;4;"
  ].join("\n"));
  const review = reviewSheet(csv, loadLayout());
  assert.deepEqual(errorsOf(review), [[2, "id"], [3, "id"], [4, "id"]]);
  assert.deepEqual(review.products, [{ id: 1, name: "D", layoutCode: "310/1/1/4" }]);
});

test("the regal label must match a shelf of that category, case and spacing aside", () => {
  const csv = parseCsv([
    HEADER,
    ";A;;;Gang 2 · links · Milchprodukte;310;1;1;1;",
    ";B;;;  gang 1 ·  LINKS · Obst & Gemüse ;310;1;1;2;"
  ].join("\n"));
  const review = reviewSheet(csv, loadLayout());
  assert.deepEqual(errorsOf(review), [[2, "regal_label"]]);
  assert.match(review.errors[0].message, /Regal-Bezeichnung passt nicht \(Layout: Gang 1 · links · Obst & Gemüse\)/);
  assert.deepEqual(review.products.map((product) => product.name), ["B"]);
});
