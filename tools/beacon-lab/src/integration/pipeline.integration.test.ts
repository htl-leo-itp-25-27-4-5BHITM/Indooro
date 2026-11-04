/**
 * Cross-module integration tests: data (synthetic generator, demo campaign) -> positioning (calibration,
 * algorithms, metrics). All data here are SYNTHETIC; the assertions check method behaviour, never real accuracy.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_EVALUATION_OPTIONS, DEFAULT_POSITIONING_CONFIG } from "../core/defaults";
import type { AlgorithmId } from "../core/types";
import { createDemoCampaign, defaultScenarioConfig } from "../data/synthetic";
import { calibrateFromRuns, detectCensoring } from "../positioning/pathloss";
import { LeakageError, compareAlgorithms, runPositioning } from "../positioning/pipeline";

const { campaign, runs } = createDemoCampaign();
const calibration = runs.filter((r) => r.role === "calibration");
const evaluation = runs.filter((r) => r.role === "evaluation");
const truth = defaultScenarioConfig("good-coverage");

describe("calibration on the synthetic demo campaign", () => {
  it("unbounded fit is biased by receiver-sensitivity censoring and warns about it", () => {
    const c = calibrateFromRuns(calibration, campaign, DEFAULT_POSITIONING_CONFIG);
    expect(c.model).toBeDefined();
    expect(c.model!.pathLossExponent).toBeLessThan(truth.truePathLossExponent - 0.3);
    expect(c.warnings.some((w) => w.includes("Zensierung"))).toBe(true);
  });

  it("distance-limited fit recovers the simulated model", () => {
    const c = calibrateFromRuns(calibration, campaign, DEFAULT_POSITIONING_CONFIG, { maxDistanceM: 8 });
    expect(c.model!.source).toBe("fitted");
    expect(Math.abs(c.model!.rssiAt1m - truth.trueRssiAt1m)).toBeLessThan(1.5);
    expect(Math.abs(c.model!.pathLossExponent - truth.truePathLossExponent)).toBeLessThan(0.2);
    expect(c.warnings.some((w) => w.includes("Zensierung"))).toBe(false);
  });

  it("detectCensoring returns null for uniformly received pairs", () => {
    const cells = Array.from({ length: 20 }, (_, i) => ({ distanceM: i + 1, count: 100, durationSec: 50 }));
    expect(detectCensoring(cells)).toBeNull();
  });

  it("refuses evaluation runs as calibration input (leakage)", () => {
    expect(() => calibrateFromRuns(evaluation, campaign, DEFAULT_POSITIONING_CONFIG)).toThrow(LeakageError);
  });
});

describe("positioning on the synthetic demo campaign", () => {
  const model = calibrateFromRuns(calibration, campaign, DEFAULT_POSITIONING_CONFIG, { maxDistanceM: 8 }).model!;
  const calibrated = { ...campaign, pathLoss: model };
  const algorithms: AlgorithmId[] = ["strongest-beacon", "weighted-centroid", "trilateration", "knn-fingerprint"];

  it("every algorithm yields finite metrics on every evaluation run, failures accounted for", () => {
    for (const run of evaluation) {
      for (const algorithm of algorithms) {
        const res = runPositioning({
          run,
          campaign: calibrated,
          config: { ...DEFAULT_POSITIONING_CONFIG, algorithm },
          options: { ...DEFAULT_EVALUATION_OPTIONS, referenceMatching: run.kind === "walk" ? "interpolate" : "hold-or-nearest" },
          calibrationRuns: calibration,
        });
        const m = res.metrics;
        expect(m.epochsWithTruth).toBeGreaterThan(0);
        expect(m.validEstimates + m.failedEstimates).toBe(m.epochsWithTruth);
        expect(Number.isFinite(m.median!)).toBe(true);
        expect(m.unit).toBe("LE"); // demo scale is not confirmed -> never metres
        expect(res.warnings.some((w) => /synthetisch/i.test(w))).toBe(true);
      }
    }
  });

  it("trilateration converges with good coverage (regression: over-strict LM tolerance)", () => {
    const res = runPositioning({
      run: evaluation[0],
      campaign: calibrated,
      config: { ...DEFAULT_POSITIONING_CONFIG, algorithm: "trilateration" },
      options: DEFAULT_EVALUATION_OPTIONS,
    });
    const notConverged = res.estimates.filter((e) => e.failureReason?.includes("konvergiert")).length;
    expect(notConverged).toBe(0);
    expect(res.metrics.failureRate).toBeLessThan(0.1);
  });

  it("comparison metrics are computed on the common epoch subset", () => {
    const cmp = compareAlgorithms({
      run: evaluation[0],
      campaign: calibrated,
      options: DEFAULT_EVALUATION_OPTIONS,
      calibrationRuns: calibration,
      configs: algorithms.map((algorithm) => ({ ...DEFAULT_POSITIONING_CONFIG, algorithm })),
    });
    expect(cmp.results).toHaveLength(4);
    for (const c of cmp.common) {
      expect(c.epochsWithTruth).toBe(cmp.commonEpochs);
      expect(c.failedEstimates).toBe(0);
    }
  });

  it("is deterministic: same inputs give the same configHash and metrics", () => {
    const args = { run: evaluation[0], campaign: calibrated, config: DEFAULT_POSITIONING_CONFIG, options: DEFAULT_EVALUATION_OPTIONS };
    const a = runPositioning(args), b = runPositioning(args);
    expect(a.configHash).toBe(b.configHash);
    expect(a.metrics).toEqual(b.metrics);
  });
});
