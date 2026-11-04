import { describe, expect, it } from "vitest";
import { SERIES_COLORS, boxStats, ecdf, ecdfAt, histogram, linearScale, logScale, nearestIndex, niceTicks, quantile7, formatTick } from "./math";

describe("niceTicks", () => {
  it("returns 1-2-5 steps covering the range", () => {
    expect(niceTicks(0, 10, 6)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(0, 1, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(niceTicks(-93, -41, 6)).toEqual([-100, -90, -80, -70, -60, -50, -40]);
  });
  it("covers the data range", () => {
    for (const [a, b] of [[0.13, 4.87], [3, 3.4], [-7.2, 12.9], [1000, 25000]] as const) {
      const t = niceTicks(a, b, 5);
      expect(t[0]).toBeLessThanOrEqual(a);
      expect(t[t.length - 1]).toBeGreaterThanOrEqual(b);
      expect(t.length).toBeGreaterThanOrEqual(2);
    }
  });
  it("avoids float noise", () => {
    expect(niceTicks(0, 0.3, 4)).toEqual([0, 0.1, 0.2, 0.3]);
  });
  it("handles degenerate input", () => {
    expect(niceTicks(5, 5).length).toBeGreaterThanOrEqual(2);
    expect(niceTicks(0, 0).length).toBeGreaterThanOrEqual(2);
    expect(niceTicks(NaN, 1)).toEqual([]);
    expect(niceTicks(10, 0, 6)).toEqual([0, 2, 4, 6, 8, 10]);
  });
  it("formats ticks with step-appropriate decimals", () => {
    expect(formatTick(0.2, 0.2)).toBe("0.2");
    expect(formatTick(20, 10)).toBe("20");
  });
});

describe("quantile7", () => {
  it("matches linear interpolation", () => {
    expect(quantile7([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile7([1, 2, 3, 4, 5], 0.9)).toBeCloseTo(4.6, 12);
    expect(quantile7([7], 0.95)).toBe(7);
    expect(quantile7([], 0.5)).toBeNull();
  });
});

describe("histogram", () => {
  it("counts with binWidth, last bin right-closed", () => {
    const h = histogram([0, 0.5, 1, 1.5, 2, 2], { binWidth: 1 });
    // [0,1): 0, 0.5 ; [1,2]: 1, 1.5, 2, 2 (maximum on the edge belongs to the last, right-closed bin)
    expect(h.bins.map((b) => b.count)).toEqual([2, 4]);
    expect(h.total).toBe(6);
    expect(h.bins[0].x0).toBe(0);
    expect(h.bins[1].x1).toBe(2);
  });
  it("counts with bin count", () => {
    const h = histogram([0, 1, 2, 3, 4, 10], { bins: 5 });
    expect(h.binWidth).toBe(2);
    expect(h.bins.map((b) => b.count)).toEqual([2, 2, 1, 0, 1]);
  });
  it("ignores non-finite values, handles constant and empty input", () => {
    expect(histogram([NaN, Infinity, 1], { binWidth: 1 }).total).toBe(1);
    expect(histogram([4, 4, 4], { bins: 3 }).bins.length).toBe(1);
    expect(histogram([], { bins: 3 }).bins).toEqual([]);
    expect(() => histogram([1], { binWidth: 0 })).toThrow();
  });
  it("shared range yields identical bins", () => {
    const a = histogram([1, 2], { binWidth: 1, range: [0, 5] });
    const b = histogram([4], { binWidth: 1, range: [0, 5] });
    expect(a.bins.length).toBe(b.bins.length);
    expect(a.bins.length).toBe(5);
  });
  it("conserves total count", () => {
    const vals = Array.from({ length: 101 }, (_, i) => Math.sin(i) * 7);
    const h = histogram(vals, { bins: 12 });
    expect(h.bins.reduce((s, b) => s + b.count, 0)).toBe(101);
  });
});

describe("boxStats", () => {
  it("computes type-7 quartiles and 1.5 IQR outliers", () => {
    const b = boxStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 100]);
    expect(b).not.toBeNull();
    expect(b!.q1).toBe(3.25);
    expect(b!.median).toBe(5.5);
    expect(b!.q3).toBe(7.75);
    expect(b!.iqr).toBe(4.5);
    expect(b!.outliers).toEqual([100]);
    expect(b!.upperWhisker).toBe(9);
    expect(b!.lowerWhisker).toBe(1);
    expect(b!.min).toBe(1);
    expect(b!.max).toBe(100);
    expect(b!.n).toBe(10);
  });
  it("handles single and empty", () => {
    expect(boxStats([])).toBeNull();
    const s = boxStats([3])!;
    expect([s.q1, s.median, s.q3, s.lowerWhisker, s.upperWhisker]).toEqual([3, 3, 3, 3, 3]);
    expect(s.outliers).toEqual([]);
  });
});

describe("ecdf", () => {
  it("builds step points with merged ties", () => {
    expect(ecdf([3, 1, 2, 2])).toEqual([
      { x: 1, p: 0.25 },
      { x: 2, p: 0.75 },
      { x: 3, p: 1 },
    ]);
  });
  it("plateaus below 1 when failures are in the denominator", () => {
    const pts = ecdf([1, 2], 4);
    expect(pts[pts.length - 1].p).toBe(0.5);
  });
  it("ecdfAt is right-continuous", () => {
    const pts = ecdf([1, 2, 3, 4]);
    expect(ecdfAt(pts, 0.5)).toBe(0);
    expect(ecdfAt(pts, 2)).toBe(0.5);
    expect(ecdfAt(pts, 2.5)).toBe(0.5);
    expect(ecdfAt(pts, 99)).toBe(1);
  });
  it("empty", () => {
    expect(ecdf([])).toEqual([]);
  });
});

describe("scales & misc", () => {
  it("linear scale maps and inverts", () => {
    const s = linearScale([0, 10], [100, 0]);
    expect(s(0)).toBe(100);
    expect(s(10)).toBe(0);
    expect(s.invert(50)).toBe(5);
  });
  it("log scale maps decades evenly", () => {
    const s = logScale([1, 100], [0, 200]);
    expect(s(10)).toBeCloseTo(100, 9);
    expect(s.invert(100)).toBeCloseTo(10, 9);
  });
  it("nearestIndex", () => {
    expect(nearestIndex([0, 1, 2, 10], 1.4)).toBe(1);
    expect(nearestIndex([0, 1, 2, 10], 7)).toBe(3);
    expect(nearestIndex([], 1)).toBe(-1);
  });
  it("palette has 8 distinct colours", () => {
    expect(new Set(SERIES_COLORS).size).toBe(8);
  });
});
