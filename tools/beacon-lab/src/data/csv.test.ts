import { describe, expect, it } from "vitest";
import { csvEscape, detectDelimiter, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("parses a simple comma CSV", () => {
    const r = parseCsv("t,beacon,rssi\n1,A,-70\n2,B,-71\n");
    expect(r.delimiter).toBe(",");
    expect(r.header).toEqual(["t", "beacon", "rssi"]);
    expect(r.rows).toEqual([
      ["1", "A", "-70"],
      ["2", "B", "-71"],
    ]);
    expect(r.lineNumbers).toEqual([2, 3]);
  });

  it("handles CRLF, CR, BOM and a missing final newline", () => {
    const r = parseCsv("﻿t;b;r\r\n1;A;-70\r\n2;B;-71");
    expect(r.header).toEqual(["t", "b", "r"]);
    expect(r.rows).toHaveLength(2);
    expect(r.delimiter).toBe(";");
    expect(parseCsv("a,b\r1,2\r3,4").rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("handles quoted fields, escaped quotes, embedded delimiters and newlines", () => {
    const r = parseCsv('a,b,c\n"x,1","he said ""hi""","line1\nline2"\n5,6,7\n');
    expect(r.rows[0]).toEqual(["x,1", 'he said "hi"', "line1\nline2"]);
    expect(r.rows[1]).toEqual(["5", "6", "7"]);
    expect(r.lineNumbers).toEqual([2, 4]);
  });

  it("detects semicolon, tab and comma delimiters", () => {
    expect(detectDelimiter("a;b;c\n1,5;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter('"a;b",c,d\n')).toBe(",");
    expect(detectDelimiter("single\n1")).toBe(",");
  });

  it("skips empty lines but keeps quoted empty values", () => {
    const r = parseCsv('a,b\n\n1,""\n\n');
    expect(r.rows).toEqual([["1", ""]]);
    expect(r.lineNumbers).toEqual([3]);
  });

  it("does not convert decimal commas", () => {
    const r = parseCsv("t;rssi\n1;−72,5\n");
    expect(r.rows[0][1]).toBe("−72,5");
  });

  it("returns empty header for empty input", () => {
    const r = parseCsv("");
    expect(r.header).toEqual([]);
    expect(r.rows).toEqual([]);
  });
});

describe("csvEscape", () => {
  it("quotes only when necessary", () => {
    expect(csvEscape("abc")).toBe("abc");
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('a"b')).toBe('"a""b"');
    expect(csvEscape("a;b", ";")).toBe('"a;b"');
  });
});
