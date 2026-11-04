import { describe, expect, it } from "vitest";
import { fnv1aHex, sha256Hex, stableStringify } from "./hash";
import { gaussian, mulberry32 } from "./random";
import { distanceUnit, formatDistance, toDisplayDistance } from "./units";

describe("core/hash", () => {
  it("stableStringify sorts keys and is order independent", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } })).toBe(
      '{"a":{"c":[3,{"e":0,"f":1}],"d":2},"b":1}',
    );
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });
  it("fnv1a known vector", () => {
    expect(fnv1aHex("")).toBe("811c9dc5");
    expect(fnv1aHex("a")).toBe("e40c292c");
  });
  it("sha256 known vector", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("core/random", () => {
  it("is deterministic per seed", () => {
    const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
    const sa = Array.from({ length: 5 }, a), sb = Array.from({ length: 5 }, b), sc = Array.from({ length: 5 }, c);
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
    sa.forEach((v) => expect(v).toBeGreaterThanOrEqual(0));
  });
  it("gaussian has ~zero mean and unit variance", () => {
    const rng = mulberry32(7);
    const xs = Array.from({ length: 20000 }, () => gaussian(rng));
    const m = xs.reduce((s, x) => s + x, 0) / xs.length;
    const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
    expect(Math.abs(m)).toBeLessThan(0.03);
    expect(Math.abs(v - 1)).toBeLessThan(0.05);
  });
});

describe("core/units", () => {
  const unconfirmed = { metersPerUnit: 0.5, confirmed: false, note: "" };
  const confirmed = { metersPerUnit: 0.5, confirmed: true, note: "" };
  it("never shows metres without a confirmed scale", () => {
    expect(distanceUnit(unconfirmed)).toBe("LE");
    expect(toDisplayDistance(4, unconfirmed)).toBe(4);
    expect(formatDistance(4, unconfirmed)).toBe("4.00 LE");
  });
  it("converts with a confirmed scale", () => {
    expect(distanceUnit(confirmed)).toBe("m");
    expect(formatDistance(4, confirmed)).toBe("2.00 m");
    expect(formatDistance(null, confirmed)).toBe("–");
  });
});
