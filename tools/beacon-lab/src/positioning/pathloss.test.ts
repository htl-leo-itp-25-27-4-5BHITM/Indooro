import { describe, expect, it } from "vitest";
import { DEFAULT_PATH_LOSS, DEFAULT_POSITIONING_CONFIG } from "../core/defaults";
import { LeakageError } from "./errors";
import { calibrateFromRuns, distanceToRssi, fitPathLoss, rssiToDistance } from "./pathloss";
import { TRUE_MODEL, makeBeacon, makeCampaign, makeRun, simulateHold } from "./testutil";

describe("path-loss model", () => {
  it("round trip distance <-> rssi", () => {
    for (const d of [0.35, 1, 2.5, 8, 11]) {
      expect(rssiToDistance(distanceToRssi(d, DEFAULT_PATH_LOSS), DEFAULT_PATH_LOSS)).toBeCloseTo(d, 9);
    }
  });
  it("1 m <-> rssiAt1m", () => {
    expect(distanceToRssi(1, DEFAULT_PATH_LOSS)).toBeCloseTo(-72, 12);
    expect(rssiToDistance(-72, DEFAULT_PATH_LOSS)).toBeCloseTo(1, 12);
    // -72 - 28 = -100 => 10 m for n = 2.8
    expect(rssiToDistance(-100, DEFAULT_PATH_LOSS)).toBeCloseTo(10, 9);
  });
  it("invalid input gives NaN, no throw", () => {
    expect(rssiToDistance(NaN, DEFAULT_PATH_LOSS)).toBeNaN();
    expect(rssiToDistance(-60, { ...DEFAULT_PATH_LOSS, pathLossExponent: 0 })).toBeNaN();
    expect(distanceToRssi(0, DEFAULT_PATH_LOSS)).toBeNaN();
    expect(distanceToRssi(-1, DEFAULT_PATH_LOSS)).toBeNaN();
  });
});

describe("fitPathLoss", () => {
  const pairs = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12].map((d) => ({ distanceM: d, rssi: distanceToRssi(d, TRUE_MODEL) }));
  it("recovers A and n from noise-free pairs", () => {
    const m = fitPathLoss(pairs);
    expect("error" in m).toBe(false);
    if ("error" in m) return;
    expect(m.rssiAt1m).toBeCloseTo(-60, 9);
    expect(m.pathLossExponent).toBeCloseTo(2.2, 9);
    expect(m.source).toBe("fitted");
    expect(m.r2).toBeCloseTo(1, 9);
    expect(m.residualStdDb).toBeCloseTo(0, 9);
    expect(m.sampleCount).toBe(pairs.length);
  });
  it("rejects too few pairs, single distance, d < 0.1, positive slope", () => {
    expect(fitPathLoss(pairs.slice(0, 5))).toHaveProperty("error");
    const same = Array.from({ length: 20 }, () => ({ distanceM: 2, rssi: -70 }));
    expect(fitPathLoss(same)).toHaveProperty("error");
    const tiny = Array.from({ length: 20 }, (_, i) => ({ distanceM: 0.01 + i * 0.001, rssi: -50 }));
    expect(fitPathLoss(tiny)).toHaveProperty("error");
    const rising = pairs.map((p) => ({ distanceM: p.distanceM, rssi: -90 + 3 * Math.log10(p.distanceM) }));
    const e = fitPathLoss(rising);
    expect(e).toHaveProperty("error");
    expect(fitPathLoss([])).toHaveProperty("error");
    expect(fitPathLoss([{ distanceM: NaN, rssi: NaN }])).toHaveProperty("error");
  });
  it("noisy data gives r2 < 1 and positive residual std", () => {
    const noisy = pairs.map((p, i) => ({ ...p, rssi: p.rssi + (i % 2 ? 2 : -2) }));
    const m = fitPathLoss(noisy);
    if ("error" in m) throw new Error(m.error);
    expect(m.r2!).toBeLessThan(1);
    expect(m.residualStdDb!).toBeGreaterThan(0.5);
  });
});

describe("calibrateFromRuns", () => {
  const beacons = [makeBeacon("B1", 0, 0), makeBeacon("B2", 10, 0), makeBeacon("B3", 10, 10), makeBeacon("B4", 0, 10)];
  const campaign = makeCampaign({ beacons });
  const mkCalRun = (positions: { x: number; y: number }[]) => {
    const samples = positions.flatMap((p, i) => simulateHold(campaign, p, i * 20, 10, { rateHz: 2 }));
    const references = positions.flatMap((p, i) => [
      { t: i * 20, position: p },
      { t: i * 20 + 10, position: p },
    ]);
    return makeRun({ id: "cal", role: "calibration", kind: "stationary", samples, references });
  };

  it("fits global and per-beacon models from holds", () => {
    const run = mkCalRun([{ x: 1, y: 1 }, { x: 5, y: 5 }, { x: 8, y: 2 }, { x: 3, y: 9 }]);
    const res = calibrateFromRuns([run], campaign, DEFAULT_POSITIONING_CONFIG);
    expect(res.error).toBeUndefined();
    expect(res.model!.rssiAt1m).toBeCloseTo(-60, 6);
    expect(res.model!.pathLossExponent).toBeCloseTo(2.2, 6);
    expect(res.model!.fittedOnRunIds).toEqual(["cal"]);
    for (const b of beacons) {
      const pm = res.perBeacon[b.id];
      expect("error" in pm).toBe(false);
    }
    expect(res.warnings.join(" ")).not.toContain("Maßstab");
  });

  it("scale: metersPerUnit=0.5 is applied", () => {
    const c = makeCampaign({ beacons, metersPerUnit: 0.5 });
    const samples = [{ x: 1, y: 1 }, { x: 5, y: 5 }, { x: 8, y: 2 }].flatMap((p, i) => simulateHold(c, p, i * 20, 10));
    const refs = [{ x: 1, y: 1 }, { x: 5, y: 5 }, { x: 8, y: 2 }].flatMap((p, i) => [
      { t: i * 20, position: p },
      { t: i * 20 + 10, position: p },
    ]);
    const run = makeRun({ role: "calibration", samples, references: refs });
    const res = calibrateFromRuns([run], c, DEFAULT_POSITIONING_CONFIG);
    expect(res.model!.pathLossExponent).toBeCloseTo(2.2, 6);
  });

  it("warns on unconfirmed scale", () => {
    const c = makeCampaign({ beacons, confirmed: false });
    const run = mkCalRun([{ x: 1, y: 1 }, { x: 5, y: 5 }, { x: 8, y: 2 }]);
    const res = calibrateFromRuns([run], c, DEFAULT_POSITIONING_CONFIG);
    expect(res.warnings.some((w) => w.includes("Maßstab"))).toBe(true);
  });

  it("throws LeakageError for evaluation runs", () => {
    const run = makeRun({ role: "evaluation" });
    expect(() => calibrateFromRuns([run], campaign, DEFAULT_POSITIONING_CONFIG)).toThrow(LeakageError);
  });

  it("returns errors (no throw) for empty, no-hold and too-little data", () => {
    expect(calibrateFromRuns([], campaign, DEFAULT_POSITIONING_CONFIG).error).toBeDefined();
    const noHold = makeRun({ role: "calibration", kind: "walk", samples: simulateHold(campaign, { x: 1, y: 1 }, 0, 5), references: [{ t: 0, position: { x: 1, y: 1 } }, { t: 5, position: { x: 2, y: 2 } }] });
    expect(calibrateFromRuns([noHold], campaign, DEFAULT_POSITIONING_CONFIG).error).toContain("Haltepunkte");
    const tiny = makeRun({ role: "calibration", samples: simulateHold(campaign, { x: 1, y: 1 }, 0, 1, { rateHz: 1 }), references: [{ t: 0, position: { x: 1, y: 1 } }, { t: 1, position: { x: 1, y: 1 } }] });
    const r = calibrateFromRuns([tiny], campaign, DEFAULT_POSITIONING_CONFIG);
    expect(r.error).toBeDefined();
    expect(r.model).toBeUndefined();
  });

  it("stationary run with one reference is treated as a single hold", () => {
    const samples = simulateHold(campaign, { x: 3, y: 4 }, 0, 20);
    const run = makeRun({ role: "calibration", kind: "stationary", samples, references: [{ t: 0, position: { x: 3, y: 4 } }] });
    // single position => all four beacons have distinct distances => pooled fit works
    const res = calibrateFromRuns([run], campaign, DEFAULT_POSITIONING_CONFIG);
    expect(res.error).toBeUndefined();
    expect(res.model!.pathLossExponent).toBeCloseTo(2.2, 6);
  });
});
