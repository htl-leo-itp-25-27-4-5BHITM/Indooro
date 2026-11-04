import { describe, expect, it } from "vitest";
import { DEFAULT_EVALUATION_OPTIONS, DEFAULT_PATH_LOSS, DEFAULT_POSITIONING_CONFIG } from "../core/defaults";
import type { Campaign, EvaluationOptions, MeasurementRun, PositioningConfig } from "../core/types";
import { LeakageError, compareAlgorithms, runPositioning } from "./pipeline";
import { TRUE_MODEL, makeBeacon, makeCampaign, makeRun, simulateHold, simulatePath } from "./testutil";

const cfgOf = (algorithm: PositioningConfig["algorithm"], over: Partial<PositioningConfig> = {}): PositioningConfig => ({
  ...DEFAULT_POSITIONING_CONFIG,
  algorithm,
  ...over,
});
const opts: EvaluationOptions = DEFAULT_EVALUATION_OPTIONS;

const beacons = [makeBeacon("B1", 0, 0), makeBeacon("B2", 12, 0), makeBeacon("B3", 12, 10), makeBeacon("B4", 0, 10)];

function holdRun(campaign: Campaign, id = "ev", at = { x: 6, y: 5 }, seconds = 120, extra: Partial<MeasurementRun> = {}): MeasurementRun {
  return {
    ...makeRun({
      id,
      role: "evaluation",
      kind: "stationary",
      samples: simulateHold(campaign, at, 0, seconds),
      references: [{ t: 0, position: at }, { t: seconds, position: at }],
    }),
    ...extra,
  };
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

describe("runPositioning – leakage", () => {
  const campaign = makeCampaign({ beacons });
  it("refuses to evaluate a calibration run", () => {
    const run = makeRun({ role: "calibration" });
    expect(() => runPositioning({ run, campaign, config: cfgOf("weighted-centroid"), options: opts })).toThrow(LeakageError);
  });
  it("refuses an evaluation run among the calibration runs", () => {
    const run = holdRun(campaign);
    const bad = makeRun({ id: "other", role: "evaluation" });
    expect(() => runPositioning({ run, campaign, config: cfgOf("knn-fingerprint"), options: opts, calibrationRuns: [bad] })).toThrow(LeakageError);
    // also when the algorithm would not use them
    expect(() => runPositioning({ run, campaign, config: cfgOf("weighted-centroid"), options: opts, calibrationRuns: [bad] })).toThrow(LeakageError);
  });
  it("refuses the same run id as calibration data", () => {
    const run = holdRun(campaign);
    const same = makeRun({ id: run.id, role: "calibration" });
    expect(() => runPositioning({ run, campaign, config: cfgOf("knn-fingerprint"), options: opts, calibrationRuns: [same] })).toThrow(LeakageError);
  });
});

describe("runPositioning – end to end", () => {
  it("noise-free stationary hold with trilateration: error ~ 0, one estimate per second", () => {
    const campaign = makeCampaign({ beacons });
    const run = holdRun(campaign);
    const res = runPositioning({ run, campaign, config: cfgOf("trilateration", { windowSec: 1, staleSec: 2 }), options: opts });
    expect(res.estimates.length).toBe(121);
    expect(res.metrics.unit).toBe("m");
    expect(res.metrics.validEstimates).toBe(121);
    expect(res.metrics.failureRate).toBe(0);
    expect(res.metrics.max!).toBeLessThan(1e-3);
    expect(res.metrics.within2).toBe(1);
    expect(res.runId).toBe("ev");
    expect(res.configHash).toMatch(/^[0-9a-f]{8}$/);
    expect(res.estimates[0].inputs.length).toBe(4);
    expect(res.estimates[0].rawPosition).not.toBeNull();
    // manual model: no "unkalibriert" warning but a "manuell" note; no explorative warning with 121 epochs
    expect(res.warnings.some((w) => w.includes("unkalibriertes Pfadverlustmodell"))).toBe(false);
    expect(res.warnings.some((w) => w.includes("manuell"))).toBe(true);
    expect(res.warnings.some((w) => w.includes("explorativ"))).toBe(false);
  });

  it("default path-loss model + trilateration -> uncalibrated warning; not for weighted centroid", () => {
    const campaign = makeCampaign({ beacons, pathLoss: DEFAULT_PATH_LOSS });
    const run = holdRun(campaign, "ev", { x: 6, y: 5 }, 10);
    const tri = runPositioning({ run, campaign, config: cfgOf("trilateration"), options: opts });
    expect(tri.warnings.some((w) => w.includes("unkalibriertes Pfadverlustmodell"))).toBe(true);
    const wc = runPositioning({ run, campaign, config: cfgOf("weighted-centroid"), options: opts });
    expect(wc.warnings.some((w) => w.includes("unkalibriertes Pfadverlustmodell"))).toBe(false);
  });

  it("beacon's own calibrated model counts as calibrated", () => {
    const fitted = { ...TRUE_MODEL, source: "fitted" as const };
    const bs = beacons.map((b) => ({ ...b, pathLoss: fitted }));
    const campaign = makeCampaign({ beacons: bs, pathLoss: DEFAULT_PATH_LOSS });
    const res = runPositioning({ run: holdRun(campaign, "ev", { x: 6, y: 5 }, 10), campaign, config: cfgOf("trilateration"), options: opts });
    expect(res.warnings.some((w) => w.includes("unkalibriertes Pfadverlustmodell"))).toBe(false);
    expect(res.metrics.max!).toBeLessThan(1e-3);
  });

  it("unconfirmed scale -> LE and warning", () => {
    const campaign = makeCampaign({ beacons, confirmed: false });
    const res = runPositioning({ run: holdRun(campaign, "ev", { x: 6, y: 5 }, 10), campaign, config: cfgOf("weighted-centroid"), options: opts });
    expect(res.metrics.unit).toBe("LE");
    expect(res.warnings.some((w) => w.includes("Maßstab nicht bestätigt"))).toBe(true);
    expect(res.warnings.some((w) => w.includes("explorativ"))).toBe(true); // 11 epochs
  });

  it("metersPerUnit = 0.5 handled end to end (trilateration recovers layout position)", () => {
    const campaign = makeCampaign({ beacons, metersPerUnit: 0.5 });
    const run = holdRun(campaign, "ev", { x: 7, y: 4 }, 20);
    const res = runPositioning({ run, campaign, config: cfgOf("trilateration"), options: opts });
    expect(res.metrics.validEstimates).toBe(21);
    expect(res.estimates[5].errorUnits!).toBeLessThan(1e-3);
    expect(res.metrics.max!).toBeLessThan(1e-3 * 0.5 + 1e-9); // metres
  });

  it("empty run: zero epochs, metrics null, warning", () => {
    const campaign = makeCampaign({ beacons });
    const run = makeRun({ role: "evaluation" });
    const res = runPositioning({ run, campaign, config: cfgOf("trilateration"), options: opts });
    expect(res.estimates).toEqual([]);
    expect(res.metrics.epochsWithTruth).toBe(0);
    expect(res.metrics.mean).toBeNull();
    expect(res.metrics.within2).toBeNull();
    expect(res.dynamic.pairs).toBe(0);
    expect(res.warnings.some((w) => w.includes("keine Messwerte"))).toBe(true);
    expect(res.warnings.some((w) => w.includes("Keine Referenzpunkte"))).toBe(true);
  });

  it("no references: estimates exist, no truth, warning", () => {
    const campaign = makeCampaign({ beacons });
    const run = holdRun(campaign, "ev", { x: 6, y: 5 }, 10, { references: [] });
    const res = runPositioning({ run, campaign, config: cfgOf("weighted-centroid"), options: opts });
    expect(res.estimates.length).toBe(11);
    expect(res.estimates.every((e) => e.truth === null && e.errorUnits === null)).toBe(true);
    expect(res.metrics.epochsWithTruth).toBe(0);
    expect(res.warnings.some((w) => w.includes("Keine Referenzpunkte"))).toBe(true);
  });

  it("synthetic origin is flagged and propagated", () => {
    const campaign = makeCampaign({ beacons });
    const res = runPositioning({ run: holdRun(campaign, "ev", { x: 6, y: 5 }, 10, { origin: "synthetic" }), campaign, config: cfgOf("weighted-centroid"), options: opts });
    expect(res.origin).toBe("synthetic");
    expect(res.warnings.some((w) => w.includes("Synthetische Daten"))).toBe(true);
  });

  it("single-reference stationary run is evaluated over its whole duration (with warning)", () => {
    const campaign = makeCampaign({ beacons });
    const at = { x: 6, y: 5 };
    const run = makeRun({ kind: "stationary", role: "evaluation", samples: simulateHold(campaign, at, 0, 30), references: [{ t: 0, position: at }] });
    const res = runPositioning({ run, campaign, config: cfgOf("weighted-centroid"), options: opts });
    expect(res.metrics.epochsWithTruth).toBe(31);
    expect(res.warnings.some((w) => w.includes("nur einem Referenzpunkt"))).toBe(true);
    expect(res.dynamic.stationaryPrecision).not.toBeNull();
  });

  it("failures are kept as null positions with a German reason and counted", () => {
    const campaign = makeCampaign({ beacons });
    // only two beacons present -> trilateration fails everywhere
    const samples = simulateHold(campaign, { x: 6, y: 5 }, 0, 20).filter((s) => s.beaconId === "B1" || s.beaconId === "B2");
    const run = makeRun({ kind: "stationary", samples, references: [{ t: 0, position: { x: 6, y: 5 } }, { t: 20, position: { x: 6, y: 5 } }] });
    const res = runPositioning({ run, campaign, config: cfgOf("trilateration"), options: opts });
    expect(res.metrics.failureRate).toBe(1);
    expect(res.metrics.within5).toBe(0);
    expect(res.estimates[0].position).toBeNull();
    expect(res.estimates[0].failureReason).toContain("zu wenige Beacons");
  });

  it("unknown beacon ids are ignored and reported", () => {
    const campaign = makeCampaign({ beacons });
    const run = holdRun(campaign, "ev", { x: 6, y: 5 }, 5);
    run.samples = [...run.samples, { t: 1, beaconId: "GHOST", rssi: -40 }];
    const res = runPositioning({ run, campaign, config: cfgOf("strongest-beacon"), options: opts });
    expect(res.warnings.some((w) => w.includes("GHOST"))).toBe(true);
    expect(res.estimates[1].position).not.toEqual(null);
  });

  it("does not mutate (deep-frozen inputs)", () => {
    const campaign = deepFreeze(makeCampaign({ beacons }));
    const run = deepFreeze(holdRun(campaign, "ev", { x: 6, y: 5 }, 10));
    const cfg = deepFreeze(cfgOf("trilateration", { rssiFilter: { ...DEFAULT_POSITIONING_CONFIG.rssiFilter, kind: "kalman" }, temporal: { ...DEFAULT_POSITIONING_CONFIG.temporal, kind: "kalman", maxSpeedMps: 2 } }));
    expect(() => runPositioning({ run, campaign, config: cfg, options: deepFreeze({ ...opts }) })).not.toThrow();
  });

  it("temporal speed gate and smoothing show up in dynamic metrics and warnings", () => {
    const campaign = makeCampaign({ beacons });
    const run = holdRun(campaign, "ev", { x: 6, y: 5 }, 30);
    const res = runPositioning({ run, campaign, config: cfgOf("weighted-centroid", { temporal: { ...DEFAULT_POSITIONING_CONFIG.temporal, kind: "ema", alpha: 0.3 } }), options: opts });
    expect(res.warnings.some((w) => w.includes("Glättung"))).toBe(true);
    expect(res.dynamic.stationaryPrecision).not.toBeNull();
  });
});

describe("configHash", () => {
  const campaign = makeCampaign({ beacons });
  const run = holdRun(campaign, "ev", { x: 6, y: 5 }, 10);
  const h = (config: PositioningConfig, c = campaign, r = run, o = opts) => runPositioning({ run: r, campaign: c, config, options: o }).configHash;
  it("stable for identical input, sensitive to config/options/run/beacons/path loss", () => {
    const base = h(cfgOf("weighted-centroid"));
    expect(h(cfgOf("weighted-centroid"))).toBe(base);
    expect(h(cfgOf("strongest-beacon"))).not.toBe(base);
    expect(h(cfgOf("weighted-centroid"), campaign, run, { ...opts, toleranceSec: 2 })).not.toBe(base);
    expect(h(cfgOf("weighted-centroid"), campaign, { ...run, provenance: { ...run.provenance, sha256: "other" } })).not.toBe(base);
    expect(h(cfgOf("weighted-centroid"), { ...campaign, pathLoss: DEFAULT_PATH_LOSS })).not.toBe(base);
    expect(h(cfgOf("weighted-centroid"), { ...campaign, beacons: [...beacons.slice(1), makeBeacon("B1", 1, 1)] })).not.toBe(base);
  });
});

describe("kNN fingerprint end to end", () => {
  const campaign = makeCampaign({ beacons });
  const calPts = [{ x: 2, y: 2 }, { x: 10, y: 2 }, { x: 10, y: 8 }, { x: 2, y: 8 }, { x: 6, y: 5 }];
  const cal = makeRun({
    id: "cal",
    role: "calibration",
    kind: "stationary",
    samples: calPts.flatMap((p, i) => simulateHold(campaign, p, i * 30, 20)),
    references: calPts.flatMap((p, i) => [{ t: i * 30, position: p }, { t: i * 30 + 20, position: p }]),
  });
  it("locates a hold at a calibration point", () => {
    const run = holdRun(campaign, "ev", { x: 10, y: 8 }, 20);
    const res = runPositioning({ run, campaign, config: cfgOf("knn-fingerprint", { params: { ...DEFAULT_POSITIONING_CONFIG.params, knnK: 1 } }), options: opts, calibrationRuns: [cal] });
    expect(res.metrics.max!).toBeLessThan(1e-6);
  });
  it("without calibration runs: all epochs fail, warning", () => {
    const res = runPositioning({ run: holdRun(campaign, "ev", { x: 10, y: 8 }, 10), campaign, config: cfgOf("knn-fingerprint"), options: opts });
    expect(res.metrics.failureRate).toBe(1);
    expect(res.warnings.some((w) => w.includes("Keine Fingerprints"))).toBe(true);
  });
  it("calibration sha is part of the hash", () => {
    const run = holdRun(campaign, "ev", { x: 10, y: 8 }, 10);
    const a = runPositioning({ run, campaign, config: cfgOf("knn-fingerprint"), options: opts, calibrationRuns: [cal] }).configHash;
    const b = runPositioning({ run, campaign, config: cfgOf("knn-fingerprint"), options: opts, calibrationRuns: [{ ...cal, provenance: { ...cal.provenance, sha256: "zzz" } }] }).configHash;
    expect(a).not.toBe(b);
  });
});

describe("walk run with interpolated truth", () => {
  it("lag is computed for walk + interpolate and is near zero for a noise-free track", () => {
    const campaign = makeCampaign({ beacons });
    const posAt = (t: number) => ({ x: 3 + 0.1 * t, y: 5 });
    const run = makeRun({
      kind: "walk",
      role: "evaluation",
      samples: simulatePath(campaign, posAt, 0, 60),
      references: [{ t: 0, position: posAt(0) }, { t: 60, position: posAt(60) }],
    });
    const res = runPositioning({ run, campaign, config: cfgOf("trilateration", { windowSec: 0.5 }), options: { referenceMatching: "interpolate", toleranceSec: 1 } });
    expect(res.metrics.validEstimates).toBe(61);
    expect(res.metrics.max!).toBeLessThan(1e-3);
    expect(res.dynamic.lagSec).toBeCloseTo(0, 9);
    expect(res.warnings.some((w) => w.includes("Interpolation"))).toBe(true);
  });
  it("a trailing moving average on RSSI causes a positive lag", () => {
    const campaign = makeCampaign({ beacons });
    const posAt = (t: number) => ({ x: 1 + 0.3 * t, y: 5 });
    const run = makeRun({
      kind: "walk",
      role: "evaluation",
      samples: simulatePath(campaign, posAt, 0, 30, { rateHz: 5 }),
      references: [{ t: 0, position: posAt(0) }, { t: 30, position: posAt(30) }],
    });
    const config = cfgOf("weighted-centroid", { rssiFilter: { ...DEFAULT_POSITIONING_CONFIG.rssiFilter, kind: "moving-average", window: 40 } });
    const res = runPositioning({ run, campaign, config, options: { referenceMatching: "interpolate", toleranceSec: 1 } });
    expect(res.dynamic.lagSec!).toBeGreaterThan(0.5);
  });
});

describe("compareAlgorithms", () => {
  const campaign = makeCampaign({ beacons });
  const at = { x: 6, y: 5 };
  it("common metrics only cover epochs where all configs were valid", () => {
    // beacons B3/B4 vanish after t = 10 -> trilateration fails later, strongest-beacon keeps working
    const samples = simulateHold(campaign, at, 0, 30).filter((s) => !(s.t >= 10 && (s.beaconId === "B3" || s.beaconId === "B4")));
    const run = makeRun({ kind: "stationary", samples, references: [{ t: 0, position: at }, { t: 30, position: at }] });
    const cmp = compareAlgorithms({
      run,
      campaign,
      options: opts,
      configs: [cfgOf("strongest-beacon"), cfgOf("trilateration", { staleSec: 2 })],
    });
    expect(cmp.results).toHaveLength(2);
    const [sb, tri] = cmp.results;
    expect(sb.metrics.failureRate).toBe(0);
    expect(tri.metrics.failureRate).toBeGreaterThan(0.3);
    expect(cmp.commonEpochs).toBe(tri.metrics.validEstimates);
    expect(cmp.commonEpochs).toBeLessThan(sb.metrics.validEstimates);
    expect(cmp.common[0].epochsWithTruth).toBe(cmp.commonEpochs);
    expect(cmp.common[1].epochsWithTruth).toBe(cmp.commonEpochs);
    expect(cmp.common[0].failureRate).toBe(0);
    expect(cmp.common[1].failureRate).toBe(0);
    expect(cmp.common[1].max!).toBeLessThan(1e-3);
  });
  it("empty config list and empty run", () => {
    const run = holdRun(campaign);
    expect(compareAlgorithms({ run, campaign, options: opts, configs: [] })).toEqual({ results: [], commonEpochs: 0, common: [] });
    const empty = compareAlgorithms({ run: makeRun({}), campaign, options: opts, configs: [cfgOf("strongest-beacon"), cfgOf("trilateration")] });
    expect(empty.commonEpochs).toBe(0);
    expect(empty.common[0].mean).toBeNull();
  });
  it("propagates LeakageError", () => {
    expect(() => compareAlgorithms({ run: makeRun({ role: "calibration" }), campaign, options: opts, configs: [cfgOf("strongest-beacon")] })).toThrow(LeakageError);
  });
});

describe("performance", () => {
  it("30 min x 5 Hz x 10 beacons with step 1 s evaluates in < 2 s (order-of-magnitude check, ~0.5 s standalone; parallel test load varies)", () => {
    const ten = Array.from({ length: 10 }, (_, i) => makeBeacon(`B${i}`, (i % 5) * 4, Math.floor(i / 5) * 12));
    const campaign = makeCampaign({ beacons: ten, width: 30, height: 30 });
    const posAt = (t: number) => ({ x: 2 + 16 * (0.5 + 0.5 * Math.sin(t / 60)), y: 6 });
    const samples = simulatePath(campaign, posAt, 0, 1800, { rateHz: 5, noiseStdDb: 3, seed: 5 });
    expect(samples.length).toBe(9001 * 10);
    const refs = Array.from({ length: 61 }, (_, i) => ({ t: i * 30, position: posAt(i * 30) }));
    const run = makeRun({ kind: "walk", role: "evaluation", samples, references: refs });
    const config = cfgOf("trilateration", {
      rssiFilter: { ...DEFAULT_POSITIONING_CONFIG.rssiFilter, kind: "kalman", outlier: { enabled: true, window: 7, k: 3 } },
      temporal: { ...DEFAULT_POSITIONING_CONFIG.temporal, kind: "kalman", maxSpeedMps: 2.5 },
    });
    const t0 = performance.now();
    const res = runPositioning({ run, campaign, config, options: { referenceMatching: "interpolate", toleranceSec: 1 } });
    const ms = performance.now() - t0;
    expect(res.estimates.length).toBe(1801);
    expect(ms).toBeLessThan(2000);
  });
});
