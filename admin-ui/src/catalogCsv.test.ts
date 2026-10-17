import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { decodeCsvBytes, parseCsv } from "./catalogCsv";

const fixture = (name: string): Uint8Array => readFileSync(new URL(`./fixtures/catalog/${name}`, import.meta.url));

test("decodes UTF-8 with and without BOM and strips the BOM", () => {
  const withBom = decodeCsvBytes(fixture("excel-utf8-bom.csv"));
  assert.equal(withBom.startsWith("﻿"), false);
  assert.match(withBom, /^id;name;marke/);
  assert.match(withBom, /Äpfel/);
  assert.equal(decodeCsvBytes(new TextEncoder().encode("id;name\n1;Müsli")), "id;name\n1;Müsli");
});

test("falls back to windows-1252 for Excel files that are not valid UTF-8", () => {
  const ansi = decodeCsvBytes(fixture("excel-windows-1252.csv"));
  const utf8 = decodeCsvBytes(fixture("excel-utf8-bom.csv"));
  assert.equal(ansi, utf8);
  assert.equal(decodeCsvBytes(new Uint8Array([0x4b, 0xe4])), "Kä");
});

test("detects the separator from the header and keeps umlauts", () => {
  const parsed = parseCsv(decodeCsvBytes(fixture("excel-utf8-bom.csv")));
  assert.equal(parsed.separator, ";");
  assert.equal(parsed.headers.length, 10);
  assert.equal(parsed.rows[0][1], "Äpfel");
  assert.equal(parsed.rows[0][2], "Südtiroler");
  assert.equal(parsed.rows[1][2], "Groß");
  assert.deepEqual(parsed.lineNumbers, [2, 3, 4]);
});

test("detects comma separated files and RFC 4180 quotes", () => {
  const parsed = parseCsv(decodeCsvBytes(fixture("comma.csv")));
  assert.equal(parsed.separator, ",");
  assert.equal(parsed.rows[0][1], "Apfel, rot");
  assert.equal(parsed.rows[1][1], 'Käse "Bergkäse"');
});

test("keeps line breaks inside quoted fields and reports the record start line", () => {
  const parsed = parseCsv(decodeCsvBytes(fixture("quoted-multiline.csv")));
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0][1], "Käse\nmit Loch");
  assert.equal(parsed.rows[1][2], 'Hof "Zum Stein"');
  assert.deepEqual(parsed.lineNumbers, [2, 4]);
});

test("handles CRLF, LF, tabs, blank lines and trims values", () => {
  const parsed = parseCsv("﻿ id\tname \r\n\r\n 1 \tApfel  \r\n  \r\n2\tBirne\n");
  assert.equal(parsed.separator, "\t");
  assert.deepEqual(parsed.headers, ["id", "name"]);
  assert.deepEqual(parsed.rows, [["1", "Apfel"], ["2", "Birne"]]);
  assert.deepEqual(parsed.lineNumbers, [3, 5]);
});

test("ignores separators inside quotes when detecting the separator", () => {
  const parsed = parseCsv('"a,b,c,d";x;y\n1;2;3');
  assert.equal(parsed.separator, ";");
  assert.deepEqual(parsed.headers, ["a,b,c,d", "x", "y"]);
});

test("defaults to semicolon and returns empty results for empty input", () => {
  assert.equal(parseCsv("abc").separator, ";");
  assert.deepEqual(parseCsv(" \n\n "), { separator: ";", headers: [], rows: [], lineNumbers: [] });
});

test("rejects an unclosed quote with the line where it starts", () => {
  assert.throws(() => parseCsv('id;name\n1;"offen\n2;x'), /ab Zeile 2 sind nicht geschlossen/);
});
