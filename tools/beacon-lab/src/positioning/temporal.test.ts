import { describe, expect, it } from "vitest";
import { DEFAULT_POSITIONING_CONFIG } from "../core/defaults";
import { gaussian, mulberry32 } from "../core/random";
import type { Point, TemporalFilterConfig } from "../core/types";
import { applyTemporalFilter } from "./temporal";

const base = DEFAULT_POSITIONING_CONFIG.temporal;
const cfg = (over: Partial<TemporalFilterConfig>): TemporalFilterConfig => ({ ...base, ...over });
const seq = (ps: (Point | null)[], dt = 1) => ps.map((position, i) => ({ t: i * dt, position }));

describe("applyTemporalFilter", () => {
  it("empty input", () => {
    expect(applyTemporalFilter([], cfg({ kind: "ema" }), 1)).toEqual([]);
  });

  it("none passes positions through (copies) and keeps nulls", () => {
    const input = seq([{ x: 1, y: 1 }, null, { x: 2, y: 2 }]);
    const out = applyTemporalFilter(input, cfg({ kind: "none", maxSpeedMps: 0 }), 1);
    expect(out).toEqual([{ x: 1, y: 1 }, null, { x: 2, y: 2 }]);
    expect(out[0]).not.toBe(input[0].position);
  });

  it("ema converges to a constant target geometrically", () => {
    const input = seq([{ x: 0, y: 0 }, ...Array.from({ length: 30 }, () => ({ x: 10, y: -10 }))]);
    const out = applyTemporalFilter(input, cfg({ kind: "ema", alpha: 0.5 }), 1);
    expect(out[1]).toEqual({ x: 5, y: -5 });
    expect(out[2]).toEqual({ x: 7.5, y: -7.5 });
    expect(Math.abs(out[30]!.x - 10)).toBeLessThan(1e-6);
  });

  it("failures stay null and reset the filter (no carry-forward)", () => {
    const input = seq([{ x: 0, y: 0 }, { x: 10, y: 0 }, null, { x: 100, y: 0 }, { x: 100, y: 0 }]);
    const out = applyTemporalFilter(input, cfg({ kind: "ema", alpha: 0.5 }), 1);
    expect(out[1]).toEqual({ x: 5, y: 0 });
    expect(out[2]).toBeNull();
    expect(out[3]).toEqual({ x: 100, y: 0 }); // fresh start, not blended with 5
    expect(out[4]).toEqual({ x: 100, y: 0 });
  });

  it("a time gap > 3 x median step resets the filter", () => {
    const input = [
      { t: 0, position: { x: 0, y: 0 } },
      { t: 1, position: { x: 0, y: 0 } },
      { t: 2, position: { x: 0, y: 0 } },
      { t: 20, position: { x: 50, y: 0 } },
    ];
    const out = applyTemporalFilter(input, cfg({ kind: "ema", alpha: 0.1 }), 1);
    expect(out[3]).toEqual({ x: 50, y: 0 });
  });

  it("kalman (constant velocity) tracks a noise-free line without lag", () => {
    const input = seq(Array.from({ length: 60 }, (_, i) => ({ x: 1.2 * i, y: 0.5 * i })));
    const out = applyTemporalFilter(input, cfg({ kind: "kalman", kalmanAccelStd: 0.5, kalmanMeasStd: 1 }), 1);
    for (let i = 20; i < 60; i++) {
      expect(Math.abs(out[i]!.x - 1.2 * i)).toBeLessThan(0.05);
      expect(Math.abs(out[i]!.y - 0.5 * i)).toBeLessThan(0.05);
    }
  });

  it("kalman reduces noise on a line", () => {
    const rng = mulberry32(3);
    const truth = (i: number): Point => ({ x: 0.8 * i, y: 5 });
    const noisy = Array.from({ length: 200 }, (_, i) => ({ x: truth(i).x + gaussian(rng) * 2, y: truth(i).y + gaussian(rng) * 2 }));
    const out = applyTemporalFilter(seq(noisy), cfg({ kind: "kalman", kalmanAccelStd: 0.1, kalmanMeasStd: 2 }), 1);
    const rmse = (ps: (Point | null)[]) => Math.sqrt(ps.slice(30).reduce((s, p, i) => s + (p!.x - truth(i + 30).x) ** 2 + (p!.y - truth(i + 30).y) ** 2, 0) / 170);
    expect(rmse(out)).toBeLessThan(rmse(noisy) * 0.8);
  });

  it("kalman works in metres: scaling the layout by 2 and metersPerUnit by 1/2 gives the scaled result", () => {
    const pts = Array.from({ length: 20 }, (_, i) => ({ x: i % 2 ? 4 : 0, y: i * 0.3 }));
    const a = applyTemporalFilter(seq(pts), cfg({ kind: "kalman" }), 1);
    const scaled = applyTemporalFilter(seq(pts.map((p) => ({ x: p.x * 2, y: p.y * 2 }))), cfg({ kind: "kalman" }), 0.5);
    expect(scaled[19]!.x).toBeCloseTo(a[19]!.x * 2, 9);
    expect(scaled[19]!.y).toBeCloseTo(a[19]!.y * 2, 9);
    // and a different metres-per-unit with the same unit data changes nothing (gain is scale invariant)
    const same = applyTemporalFilter(seq(pts), cfg({ kind: "kalman" }), 0.5);
    expect(same[19]!.x).toBeCloseTo(a[19]!.x, 9);
  });

  it("speed gate clamps (not drops) a jump to maxSpeed * dt", () => {
    const input = seq([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 30, y: 40 }, { x: 30, y: 40 }]);
    const out = applyTemporalFilter(input, cfg({ kind: "none", maxSpeedMps: 2 }), 1);
    // distance 50, allowed 2 per second along direction (0.6, 0.8)
    expect(out[2]!.x).toBeCloseTo(1.2, 12);
    expect(out[2]!.y).toBeCloseTo(1.6, 12);
    // continues towards the target at max speed
    expect(out[3]!.x).toBeCloseTo(2.4, 12);
    expect(out[3]!.y).toBeCloseTo(3.2, 12);
  });

  it("speed gate converts m/s using metersPerUnit (0.5 m/LE => 4 LE/s)", () => {
    const input = seq([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    const out = applyTemporalFilter(input, cfg({ kind: "none", maxSpeedMps: 2 }), 0.5);
    expect(out[1]!.x).toBeCloseTo(4, 12);
  });

  it("speed gate leaves plausible movement untouched", () => {
    const input = seq([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]);
    expect(applyTemporalFilter(input, cfg({ kind: "none", maxSpeedMps: 2 }), 1)).toEqual(input.map((e) => e.position));
  });

  it("NaN positions are treated as failures; invalid scale falls back to 1", () => {
    const input = seq([{ x: NaN, y: 0 }, { x: 1, y: 1 }]);
    const out = applyTemporalFilter(input, cfg({ kind: "kalman" }), NaN);
    expect(out[0]).toBeNull();
    expect(out[1]).toEqual({ x: 1, y: 1 });
  });

  it("does not mutate the input", () => {
    const input = seq([{ x: 0, y: 0 }, { x: 5, y: 5 }]);
    const copy = JSON.parse(JSON.stringify(input));
    applyTemporalFilter(input, cfg({ kind: "ema", maxSpeedMps: 1 }), 1);
    expect(input).toEqual(copy);
  });
});
