import { describe, expect, it } from "vitest";
import type { PositionEstimate, RssiSample } from "../core/types";
import {
  binValues,
  colorRamp,
  coveragePoints,
  errorPointsFromEstimates,
  idwAt,
  idwGrid,
  measurementDensity,
  normalize,
  rssiPointsForBeacon,
  valueRange,
  type HeatPoint,
} from "./heatmap";

const pts: HeatPoint[] = [
  { position: { x: 1, y: 1 }, value: -60, n: 4 },
  { position: { x: 1.4, y: 1.2 }, value: -70, n: 1 },
  { position: { x: 8, y: 8 }, value: -80, n: 2 },
];

describe("colorRamp", () => {
  it("returns hex colours and clamps", () => {
    expect(colorRamp(0)).toMatch(/^#[0-9a-f]{6}$/);
    expect(colorRamp(-5)).toBe(colorRamp(0));
    expect(colorRamp(7)).toBe(colorRamp(1));
    expect(colorRamp(NaN)).toBe(colorRamp(0));
  });
  it("sequential ramp starts dark and ends bright", () => {
    const lum = (h: string) => parseInt(h.slice(1, 3), 16) * 0.3 + parseInt(h.slice(3, 5), 16) * 0.59 + parseInt(h.slice(5, 7), 16) * 0.11;
    expect(lum(colorRamp(0))).toBeLessThan(lum(colorRamp(1)));
  });
  it("error ramp goes from teal to red", () => {
    expect(colorRamp(0, "error")).toBe("#27b9ab");
    expect(colorRamp(1, "error")).toBe("#b42318");
  });
  it("normalize handles degenerate range", () => {
    expect(normalize(5, 5, 5)).toBe(0.5);
    expect(normalize(15, 0, 10)).toBe(1);
  });
  it("valueRange ignores non-finite", () => {
    expect(valueRange([3, NaN, 1, 2])).toEqual({ min: 1, max: 3 });
    expect(valueRange([])).toBeNull();
  });
});

describe("binValues", () => {
  it("returns only cells that contain data, with n-weighted mean", () => {
    const cells = binValues(pts, 2);
    expect(cells).toHaveLength(2);
    const c = cells.find((x) => x.ix === 0 && x.iy === 0)!;
    expect(c.value).toBeCloseTo((-60 * 4 + -70 * 1) / 5);
    expect(c.n).toBe(5);
    expect(c.points).toBe(2);
    expect(cells.find((x) => x.ix === 4 && x.iy === 4)).toBeDefined();
  });
  it("handles invalid cell size and values", () => {
    expect(binValues(pts, 0)).toEqual([]);
    expect(binValues([{ position: { x: 1, y: 1 }, value: NaN }], 1)).toEqual([]);
  });
});

describe("idw", () => {
  it("is exact at sample points", () => {
    for (const p of pts) expect(idwAt(pts, p.position, { power: 2, maxDistance: 3 })).toBe(p.value);
  });
  it("interpolates between samples within maxDistance", () => {
    const v = idwAt(pts, { x: 1.2, y: 1.1 }, { power: 2, maxDistance: 3 })!;
    expect(v).toBeLessThan(-60);
    expect(v).toBeGreaterThan(-70);
  });
  it("returns null beyond maxDistance", () => {
    expect(idwAt(pts, { x: 5, y: 5 }, { power: 2, maxDistance: 3 })).toBeNull();
  });
  it("ignores samples beyond maxDistance when weighting", () => {
    const v = idwAt(pts, { x: 7, y: 7 }, { power: 2, maxDistance: 3 });
    expect(v).toBe(-80);
  });
  it("grid has no values farther than maxDistance from a real sample", () => {
    const opts = { cellSize: 1, width: 12, height: 12, power: 2, maxDistance: 2 };
    const cells = idwGrid(pts, opts);
    expect(cells).toHaveLength(144);
    for (const c of cells) {
      const cx = c.x + 0.5;
      const cy = c.y + 0.5;
      const near = pts.some((p) => Math.hypot(p.position.x - cx, p.position.y - cy) <= 2);
      if (c.value === null) expect(near).toBe(false);
      else expect(near).toBe(true);
    }
    expect(cells.some((c) => c.value === null)).toBe(true);
  });
  it("interpolated values stay within the sample range", () => {
    const cells = idwGrid(pts, { cellSize: 0.5, width: 10, height: 10, power: 2, maxDistance: 4 });
    for (const c of cells) if (c.value !== null) {
      expect(c.value).toBeGreaterThanOrEqual(-80 - 1e-9);
      expect(c.value).toBeLessThanOrEqual(-60 + 1e-9);
    }
  });
});

describe("builders", () => {
  const truthAt = (t: number) => (t < 10 ? { x: 1.001, y: 2 } : t < 20 ? { x: 5, y: 2 } : null);
  const samples: RssiSample[] = [
    { t: 1, beaconId: "A", rssi: -60 },
    { t: 2, beaconId: "A", rssi: -70 },
    { t: 3, beaconId: "B", rssi: -80 },
    { t: 12, beaconId: "A", rssi: -50 },
    { t: 13, beaconId: "C", rssi: -90 },
    { t: 25, beaconId: "A", rssi: -40 },
  ];
  it("rssiPointsForBeacon averages per rounded position and skips unknown truth", () => {
    const r = rssiPointsForBeacon(samples, [], "A", truthAt);
    expect(r).toHaveLength(2);
    const p1 = r.find((x) => x.position.x === 1)!;
    expect(p1.value).toBe(-65);
    expect(p1.n).toBe(2);
    expect(r.find((x) => x.position.x === 5)!.value).toBe(-50);
  });
  it("coveragePoints counts distinct beacons per position", () => {
    const r = coveragePoints(samples, truthAt, ["A", "B"]);
    expect(r.find((x) => x.position.x === 1)!.value).toBe(2);
    expect(r.find((x) => x.position.x === 5)!.value).toBe(1);
  });
  it("measurementDensity counts samples per position", () => {
    const r = measurementDensity(samples, truthAt);
    expect(r.find((x) => x.position.x === 1)!.value).toBe(3);
    expect(r.find((x) => x.position.x === 5)!.value).toBe(2);
  });
  it("errorPointsFromEstimates ignores failures and missing truth", () => {
    const mk = (t: number, truth: PositionEstimate["truth"], err: number | null): PositionEstimate => ({
      t,
      position: err === null ? null : { x: 0, y: 0 },
      rawPosition: null,
      inputs: [],
      truth,
      errorUnits: err,
    });
    const r = errorPointsFromEstimates([
      mk(1, { x: 1, y: 1 }, 2),
      mk(2, { x: 1, y: 1 }, 4),
      mk(3, { x: 2, y: 2 }, null),
      mk(4, null, 3),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].value).toBe(3);
    expect(r[0].n).toBe(2);
  });
});
