import { describe, expect, it } from "vitest";
import { mean, median, percentile, std, summarize } from "./stats";

describe("positioning/stats", () => {
  it("returns null for empty input", () => {
    expect(mean([])).toBeNull();
    expect(median([])).toBeNull();
    expect(std([])).toBeNull();
    expect(std([5])).toBeNull();
    expect(percentile([], 50)).toBeNull();
    expect(summarize([])).toBeNull();
  });
  it("mean/median/std by hand", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([3, 1, 2])).toBe(2);
    // sample std of [2,4,4,4,5,5,7,9] = sqrt(32/7)
    expect(std([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(Math.sqrt(32 / 7), 12);
  });
  it("percentile is type 7 (linear interpolation)", () => {
    expect(percentile([1, 2, 3, 4], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4], 100)).toBe(4);
    expect(percentile([1, 2, 3, 4], 90)).toBeCloseTo(3.7, 12);
    expect(percentile([1, 2, 3, 4], 95)).toBeCloseTo(3.85, 12);
    expect(percentile([4, 1, 3, 2], 25)).toBeCloseTo(1.75, 12);
    expect(percentile([7], 95)).toBe(7);
  });
  it("ignores non-finite values and does not mutate", () => {
    const xs = [3, NaN, 1, Infinity, 2];
    expect(mean(xs)).toBe(2);
    expect(xs).toEqual([3, NaN, 1, Infinity, 2]);
    expect(percentile([NaN], 50)).toBeNull();
  });
  it("summarize", () => {
    const s = summarize([1, 2, 3, 4, 5])!;
    expect(s).toMatchObject({ n: 5, mean: 3, median: 3, min: 1, max: 5 });
    expect(s.p5).toBeCloseTo(1.2, 12);
    expect(s.p95).toBeCloseTo(4.8, 12);
    expect(summarize([2])!.std).toBeNull();
  });
});
