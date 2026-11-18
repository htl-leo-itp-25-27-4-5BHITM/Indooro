import { describe, expect, it } from "vitest";
import type { MapScale, Point, PositionEstimate, ReferencePoint } from "../core/types";
import { computeDynamicMetrics, computeErrorMetrics, errorCdf } from "./metrics";

const confirmed = (mpu = 1): MapScale => ({ metersPerUnit: mpu, confirmed: true, note: "" });
const unconfirmed = (mpu = 1): MapScale => ({ metersPerUnit: mpu, confirmed: false, note: "" });

/** error in layout units: number = valid estimate with that error, "fail" = failure with truth, "notruth" = epoch without truth */
function mk(errors: (number | "fail" | "notruth")[]): PositionEstimate[] {
  return errors.map((e, i) => {
    const truth: Point = { x: 0, y: 0 };
    if (e === "notruth") return { t: i, position: { x: 1, y: 1 }, rawPosition: { x: 1, y: 1 }, inputs: [], truth: null, errorUnits: null };
    if (e === "fail") return { t: i, position: null, rawPosition: null, failureReason: "x", inputs: [], truth, errorUnits: null };
    return { t: i, position: { x: e, y: 0 }, rawPosition: { x: e, y: 0 }, inputs: [], truth, errorUnits: e };
  });
}

describe("computeErrorMetrics", () => {
  it("errors [1,2,3,4]: hand-computed values", () => {
    const m = computeErrorMetrics(mk([1, 2, 3, 4]), confirmed());
    expect(m.unit).toBe("m");
    expect(m.epochsWithTruth).toBe(4);
    expect(m.validEstimates).toBe(4);
    expect(m.failedEstimates).toBe(0);
    expect(m.failureRate).toBe(0);
    expect(m.mean).toBe(2.5);
    expect(m.median).toBe(2.5);
    expect(m.rmse).toBeCloseTo(Math.sqrt(7.5), 12);
    expect(m.p90).toBeCloseTo(3.7, 12);
    expect(m.p95).toBeCloseTo(3.85, 12);
    expect(m.max).toBe(4);
    expect(m.within2).toBe(0.5);
    expect(m.within3).toBe(0.75);
    expect(m.within5).toBe(1);
  });

  it("failures count against within* and failureRate, not against conditional stats", () => {
    const m = computeErrorMetrics(mk([1, 2, 3, 4, "fail", "fail", "notruth"]), confirmed());
    expect(m.epochsWithTruth).toBe(6); // the epoch without truth is excluded
    expect(m.validEstimates).toBe(4);
    expect(m.failedEstimates).toBe(2);
    expect(m.failureRate).toBeCloseTo(2 / 6, 12);
    expect(m.mean).toBe(2.5); // conditional
    expect(m.within2).toBeCloseTo(2 / 6, 12); // end-to-end
    expect(m.within3).toBeCloseTo(3 / 6, 12);
    expect(m.within5).toBeCloseTo(4 / 6, 12);
  });

  it("all failures: nulls for conditional stats, within = 0", () => {
    const m = computeErrorMetrics(mk(["fail", "fail"]), confirmed());
    expect(m.failureRate).toBe(1);
    expect(m.mean).toBeNull();
    expect(m.rmse).toBeNull();
    expect(m.max).toBeNull();
    expect(m.within2).toBe(0);
  });

  it("empty / no truth -> nulls", () => {
    for (const est of [[], mk(["notruth", "notruth"])]) {
      const m = computeErrorMetrics(est, confirmed());
      expect(m.epochsWithTruth).toBe(0);
      expect(m.validEstimates).toBe(0);
      expect(m.mean).toBeNull();
      expect(m.median).toBeNull();
      expect(m.p95).toBeNull();
      expect(m.within2).toBeNull();
      expect(m.within5).toBeNull();
    }
  });

  it("unit policy: confirmed scale converts to metres, unconfirmed stays in LE", () => {
    const est = mk([2, 4, 6, 8]); // layout units
    const m = computeErrorMetrics(est, confirmed(0.5));
    expect(m.unit).toBe("m");
    expect(m.mean).toBe(2.5); // 1,2,3,4 m
    expect(m.within2).toBe(0.5);
    const le = computeErrorMetrics(est, unconfirmed(0.5));
    expect(le.unit).toBe("LE");
    expect(le.mean).toBe(5); // layout units unchanged
    expect(le.within2).toBe(0.25); // threshold 2 means 2 LE
    expect(le.within5).toBe(0.5);
  });

  it("falls back to computing the error from position and truth", () => {
    const est = mk([3]);
    est[0].errorUnits = null;
    expect(computeErrorMetrics(est, confirmed()).mean).toBe(3);
  });

  it("does not mutate input", () => {
    const est = mk([1, "fail", 3]);
    const copy = JSON.parse(JSON.stringify(est));
    computeErrorMetrics(est, confirmed());
    errorCdf(est, confirmed());
    expect(est).toEqual(copy);
  });
});

describe("errorCdf", () => {
  it("sorted, p = rank / epochsWithTruth (plateau below 1 with failures)", () => {
    const cdf = errorCdf(mk([3, 1, "fail", 2]), confirmed());
    expect(cdf).toEqual([
      { x: 1, p: 0.25 },
      { x: 2, p: 0.5 },
      { x: 3, p: 0.75 },
    ]);
    expect(errorCdf([], confirmed())).toEqual([]);
  });
});

const at = (t: number, x: number, y = 0): PositionEstimate => ({
  t,
  position: { x, y },
  rawPosition: { x, y },
  inputs: [],
  truth: null,
  errorUnits: null,
});
const ref = (t: number, x: number, y: number): ReferencePoint => ({ t, position: { x, y } });

describe("computeDynamicMetrics", () => {
  it("jumps, pairs and mean step by hand", () => {
    const est = [at(0, 0), at(1, 1), at(2, 2), at(3, 10)];
    const d = computeDynamicMetrics(est, [], confirmed());
    expect(d.pairs).toBe(3);
    expect(d.jumps).toBe(1); // 8 m/s > 2 m/s
    expect(d.jumpRate).toBeCloseTo(1 / 3, 12);
    expect(d.meanStepDistance).toBeCloseTo(10 / 3, 12);
    expect(d.jumpSpeedThreshold).toBe(2);
    expect(d.unit).toBe("m");
    expect(d.lagSec).toBeNull();
  });
  it("pairs with dt > maxGapSec are not counted; failures in between are skipped", () => {
    const est = [at(0, 0), at(5, 100), at(6, 101)];
    const d = computeDynamicMetrics(est, [], confirmed());
    expect(d.pairs).toBe(1);
    expect(d.jumps).toBe(0);
    const withFail: PositionEstimate[] = [at(0, 0), { ...at(1, 0), position: null }, at(2, 1)];
    expect(computeDynamicMetrics(withFail, [], confirmed()).pairs).toBe(1); // dt = 2 <= 2
  });
  it("speed threshold uses display unit; mpu converts", () => {
    const est = [at(0, 0), at(1, 3)]; // 3 LE in 1 s
    expect(computeDynamicMetrics(est, [], confirmed(0.5)).jumps).toBe(0); // 1.5 m/s
    expect(computeDynamicMetrics(est, [], confirmed(1)).jumps).toBe(1);
    const le = computeDynamicMetrics(est, [], unconfirmed(0.5));
    expect(le.unit).toBe("LE");
    expect(le.jumps).toBe(1); // 3 LE/s > 2
    expect(computeDynamicMetrics(est, [], confirmed(1), { jumpSpeedMps: 5 }).jumps).toBe(0);
  });
  it("empty -> nulls", () => {
    const d = computeDynamicMetrics([], [], confirmed());
    expect(d).toMatchObject({ pairs: 0, jumps: 0, jumpRate: null, meanStepDistance: null, lagSec: null, stationaryPrecision: null, stationaryBias: null });
  });

  it("stationary precision and bias", () => {
    const refs = [ref(0, 5, 5), ref(10, 5, 5)];
    // offsets +-1 around (6,5): precision 1, bias 1
    const est = [at(0, 7, 5), at(1, 5, 5), at(2, 7, 5), at(3, 5, 5)];
    const d = computeDynamicMetrics(est, refs, confirmed());
    expect(d.stationaryPrecision).toBeCloseTo(1, 12);
    expect(d.stationaryBias).toBeCloseTo(1, 12);
    // precision is independent of bias: identical points => 0 precision, bias 2
    const d2 = computeDynamicMetrics([at(0, 7, 5), at(1, 7, 5)], refs, confirmed());
    expect(d2.stationaryPrecision).toBe(0);
    expect(d2.stationaryBias).toBe(2);
    // a single estimate in the hold is not enough
    expect(computeDynamicMetrics([at(0, 7, 5)], refs, confirmed()).stationaryPrecision).toBeNull();
  });

  describe("lag", () => {
    const refs = [ref(0, 0, 0), ref(60, 60, 0)]; // 1 LE/s along x
    const shifted = (shift: number) => Array.from({ length: 121 }, (_, i) => at(i * 0.5, i * 0.5 - shift));
    it("detects a lag of +1.0 s (estimate shows where the device was 1 s ago)", () => {
      const d = computeDynamicMetrics(shifted(1.0), refs, confirmed(), { lag: true });
      expect(d.lagSec).toBeCloseTo(1.0, 9);
    });
    it("detects a lead of -0.5 s", () => {
      const d = computeDynamicMetrics(shifted(-0.5), refs, confirmed(), { lag: true });
      expect(d.lagSec).toBeCloseTo(-0.5, 9);
    });
    it("zero lag for a perfect track", () => {
      expect(computeDynamicMetrics(shifted(0), refs, confirmed(), { lag: true }).lagSec).toBeCloseTo(0, 9);
    });
    it("null if disabled, too few points or stationary references", () => {
      expect(computeDynamicMetrics(shifted(1), refs, confirmed()).lagSec).toBeNull();
      expect(computeDynamicMetrics(shifted(1).slice(0, 15), refs, confirmed(), { lag: true }).lagSec).toBeNull();
      expect(computeDynamicMetrics(shifted(1), [ref(0, 1, 1), ref(60, 1, 1)], confirmed(), { lag: true }).lagSec).toBeNull();
      expect(computeDynamicMetrics(shifted(1), [], confirmed(), { lag: true }).lagSec).toBeNull();
    });
  });
});
