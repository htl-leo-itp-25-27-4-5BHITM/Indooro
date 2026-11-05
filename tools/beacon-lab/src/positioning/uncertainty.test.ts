import { describe, expect, it } from "vitest";
import { defaultScale } from "../core/defaults";
import { mulberry32 } from "../core/random";
import type { PositionEstimate } from "../core/types";
import { computeErrorMetrics } from "./metrics";
import { median } from "./stats";
import { blockBootstrapCI, makeBlocks, metricsWithCI, wilsonInterval } from "./uncertainty";

function blocksOf(nBlocks: number, size: number, seed: number): number[][] {
  const rng = mulberry32(seed);
  return Array.from({ length: nBlocks }, () => {
    const offset = rng() * 2; // block-level variation
    return Array.from({ length: size }, () => 1 + offset + rng());
  });
}
const est = (t: number, err: number | null, truth = true): PositionEstimate => ({
  t,
  position: err === null ? null : { x: err, y: 0 },
  rawPosition: null,
  inputs: [],
  truth: truth ? { x: 0, y: 0 } : null,
  errorUnits: err,
});

describe("wilsonInterval", () => {
  it("matches the known value 8/10", () => {
    const w = wilsonInterval(8, 10)!;
    expect(w.lo).toBeCloseTo(0.49, 2);
    expect(w.hi).toBeCloseTo(0.943, 3);
    expect(w.p).toBe(0.8);
  });
  it("handles n = 0, extremes and invalid input", () => {
    expect(wilsonInterval(0, 0)).toBeNull();
    expect(wilsonInterval(5, 3)).toBeNull();
    const zero = wilsonInterval(0, 20)!;
    expect(zero.lo).toBe(0);
    expect(zero.hi).toBeGreaterThan(0);
    const all = wilsonInterval(20, 20)!;
    expect(all.hi).toBe(1);
    expect(all.lo).toBeLessThan(1);
  });
});

describe("blockBootstrapCI", () => {
  const stat = (v: number[]) => median(v);
  it("is deterministic for a seed and differs for another", () => {
    const b = blocksOf(12, 20, 1);
    const a1 = blockBootstrapCI(b, stat, { seed: 7, iterations: 300 });
    const a2 = blockBootstrapCI(b, stat, { seed: 7, iterations: 300 });
    const a3 = blockBootstrapCI(b, stat, { seed: 8, iterations: 300 });
    expect(a1).toEqual(a2);
    expect(a3.lo).not.toBe(a1.lo);
  });
  it("contains the estimate, reports blocks/iterations and does not mutate the input", () => {
    const b = blocksOf(12, 20, 2);
    const copy = JSON.stringify(b);
    const r = blockBootstrapCI(b, stat, { iterations: 500 });
    expect(r.lo!).toBeLessThanOrEqual(r.estimate!);
    expect(r.hi!).toBeGreaterThanOrEqual(r.estimate!);
    expect(r.blocks).toBe(12);
    expect(r.iterations).toBe(500);
    expect(r.reason).toBeNull();
    expect(JSON.stringify(b)).toBe(copy);
  });
  it("narrows with more blocks", () => {
    const small = blockBootstrapCI(blocksOf(8, 20, 3), stat, { seed: 1, iterations: 500 });
    const large = blockBootstrapCI(blocksOf(120, 20, 3), stat, { seed: 1, iterations: 500 });
    expect(large.hi! - large.lo!).toBeLessThan(small.hi! - small.lo!);
  });
  it("returns no interval for fewer than 5 blocks", () => {
    const r = blockBootstrapCI(blocksOf(4, 50, 4), stat);
    expect(r.lo).toBeNull();
    expect(r.hi).toBeNull();
    expect(r.reason).toBe("zu wenige Blöcke");
    expect(r.estimate).not.toBeNull();
    expect(r.blocks).toBe(4);
  });
  it("ignores empty blocks when counting", () => {
    const r = blockBootstrapCI([...blocksOf(4, 10, 5), [], []], stat);
    expect(r.blocks).toBe(4);
    expect(r.lo).toBeNull();
  });
});

describe("makeBlocks / metricsWithCI", () => {
  it("builds 10 s segments for walk runs and drops epochs without truth", () => {
    const e = Array.from({ length: 60 }, (_, i) => est(i, 1, i !== 3));
    const blocks = makeBlocks(e, { kind: "walk" });
    expect(blocks).toHaveLength(6);
    expect(blocks.flat()).toHaveLength(59);
  });
  it("uses one block per hold for stationary runs", () => {
    const e = Array.from({ length: 40 }, (_, i) => est(i, 1));
    const blocks = makeBlocks(e, {
      kind: "stationary",
      holds: [
        { start: 0, end: 19, position: { x: 0, y: 0 } },
        { start: 20, end: 39, position: { x: 0, y: 0 } },
      ],
    });
    expect(blocks.map((b) => b.length)).toEqual([20, 20]);
  });
  it("counts failures as not within and keeps point metrics identical to computeErrorMetrics", () => {
    const rng = mulberry32(9);
    const e: PositionEstimate[] = Array.from({ length: 120 }, (_, i) => est(i, i % 10 === 0 ? null : rng() * 6));
    const blocks = makeBlocks(e, { kind: "walk" });
    const m = metricsWithCI(blocks, defaultScale(), { iterations: 200 });
    const direct = computeErrorMetrics(e, defaultScale());
    expect(m.metrics).toEqual(direct);
    expect(m.failureRate.successes).toBe(12);
    expect(m.failureRate.n).toBe(120);
    expect(m.within3.p).toBeCloseTo(direct.within3!, 12);
    expect(m.within3.lo!).toBeLessThan(m.within3.p!);
    expect(m.median.lo!).toBeLessThanOrEqual(m.median.estimate!);
    expect(m.unit).toBe("LE");
  });
  it("handles empty input", () => {
    const m = metricsWithCI([], defaultScale());
    expect(m.within2.lo).toBeNull();
    expect(m.median.estimate).toBeNull();
    expect(m.blocks).toBe(0);
  });
});
