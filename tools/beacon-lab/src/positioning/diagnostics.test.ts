import { describe, expect, it } from "vitest";
import { DEFAULT_EVALUATION_OPTIONS, DEFAULT_POSITIONING_CONFIG } from "../core/defaults";
import type { Campaign, MeasurementRun, Point, ReferencePoint, RssiSample } from "../core/types";
import { createDemoCampaign } from "../data/synthetic";
import { beaconLeaveOneOut, beaconReception, beaconResiduals, summarizeBeaconHealth } from "./diagnostics";
import { LeakageError } from "./errors";
import { TRUE_MODEL, makeBeacon, makeCampaign, makeRun, simulateHold } from "./testutil";

const POINTS: Point[] = [
  { x: 2, y: 2 },
  { x: 8, y: 2 },
  { x: 8, y: 8 },
  { x: 2, y: 8 },
  { x: 5, y: 5 },
  { x: 5, y: 1 },
];

/** Stationary run: one 20 s hold per point; samples simulated against `truthCampaign` (true beacon positions). */
function holdRun(truthCampaign: Campaign, id: string, role: "evaluation" | "calibration" = "evaluation", seed = 3): MeasurementRun {
  const samples: RssiSample[] = [];
  const references: ReferencePoint[] = [];
  POINTS.forEach((p, i) => {
    const t0 = i * 25;
    samples.push(...simulateHold(truthCampaign, p, t0, 20, { rateHz: 2, noiseStdDb: 2, seed: seed + i, model: TRUE_MODEL }));
    references.push({ t: t0, position: p }, { t: t0 + 20, position: p });
  });
  return makeRun({ id, role, samples, references });
}

describe("beaconResiduals", () => {
  const camp = makeCampaign();
  it("has ~0 bias when campaign matches the simulation and nothing is flagged", () => {
    const res = beaconResiduals([holdRun(camp, "r1")], camp);
    for (const b of res.beacons) {
      expect(b.enoughData).toBe(true);
      expect(Math.abs(b.biasDb!)).toBeLessThan(1);
      expect(b.flaggedBias).toBe(false);
      expect(b.flaggedHoldInconsistent).toBe(false);
    }
  });

  it("flags a beacon whose campaign position is 5 m off", () => {
    const wrong = makeCampaign({ beacons: [makeBeacon("B1", 5, 5), makeBeacon("B2", 10, 0), makeBeacon("B3", 10, 10), makeBeacon("B4", 0, 10)] });
    const res = beaconResiduals([holdRun(camp, "r1")], wrong);
    const b1 = res.beacons.find((b) => b.beaconId === "B1")!;
    expect(b1.flaggedBias || b1.flaggedHoldInconsistent).toBe(true);
    for (const id of ["B2", "B3", "B4"]) {
      const o = res.beacons.find((b) => b.beaconId === id)!;
      expect(o.flaggedBias).toBe(false);
      expect(o.flaggedHoldInconsistent).toBe(false);
    }
    const health = summarizeBeaconHealth({ campaign: wrong, residuals: res, reception: beaconReception(holdRun(camp, "r1"), wrong) });
    const h1 = health.beacons.find((b) => b.beaconId === "B1")!;
    expect(h1.severity).toBe("warning");
    expect(h1.findings.map((f) => f.text).join(" ")).toContain("Abschattung");
    expect(health.beacons.find((b) => b.beaconId === "B2")!.severity).toBeNull();
  });

  it("treats a common model offset as model problem, not a single-beacon verdict", () => {
    const off = makeCampaign({ pathLoss: { ...TRUE_MODEL, rssiAt1m: TRUE_MODEL.rssiAt1m + 10 } });
    const run = holdRun(camp, "r1");
    const res = beaconResiduals([run], off);
    expect(res.beacons.every((b) => b.flaggedBias)).toBe(true);
    expect(res.warnings.join(" ")).toContain("Pfadverlustmodell");
    const health = summarizeBeaconHealth({ campaign: off, residuals: res, reception: beaconReception(run, off) });
    for (const b of health.beacons) {
      expect(b.findings.some((f) => f.code === "residual-common-offset")).toBe(true);
      expect(b.severity).toBe("info");
    }
  });

  it("reports too few data instead of a judgement", () => {
    const run = makeRun({
      samples: simulateHold(camp, { x: 5, y: 5 }, 0, 4, { rateHz: 2, model: TRUE_MODEL }),
      references: [
        { t: 0, position: { x: 5, y: 5 } },
        { t: 4, position: { x: 5, y: 5 } },
      ],
    });
    const res = beaconResiduals([run], camp);
    expect(res.beacons.every((b) => !b.enoughData && !b.flaggedBias)).toBe(true);
    const health = summarizeBeaconHealth({ campaign: camp, residuals: res, reception: beaconReception(run, camp) });
    expect(health.beacons.every((b) => !b.dataSufficient && b.findings.some((f) => f.code === "insufficient-data"))).toBe(true);
    expect(health.beacons.every((b) => b.severity === null)).toBe(true);
  });

  it("is deterministic and does not mutate inputs", () => {
    const run = holdRun(camp, "r1");
    const snap = JSON.stringify([run, camp]);
    const a = beaconResiduals([run], camp);
    const b = beaconResiduals([run], camp);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify([run, camp])).toBe(snap);
  });
});

describe("beaconReception", () => {
  const camp = makeCampaign();
  it("flags a silent beacon that is near several holds and lists unknown ids", () => {
    const run = holdRun(camp, "r1");
    const samples = run.samples.filter((s) => s.beaconId !== "B2").concat({ t: 1, beaconId: "GHOST", rssi: -70 });
    const res = beaconReception({ ...run, samples }, camp, { nearDistanceM: 8.5 });
    const b2 = res.beacons.find((b) => b.beaconId === "B2")!;
    expect(b2.silentWhileNear).toBe(true);
    expect(res.beacons.filter((b) => b.silentWhileNear).map((b) => b.beaconId)).toEqual(["B2"]);
    expect(res.unknown).toEqual([{ id: "GHOST", samples: 1 }]);
    const health = summarizeBeaconHealth({ campaign: camp, residuals: beaconResiduals([{ ...run, samples }], camp), reception: res });
    const f = health.beacons.find((b) => b.beaconId === "B2")!.findings.find((x) => x.code === "silent-while-near")!;
    expect(f.text).toContain("Nicht empfangen obwohl nah");
    expect(health.warnings.join(" ")).toContain("GHOST");
  });

  it("does not flag healthy beacons", () => {
    const res = beaconReception(holdRun(camp, "r1"), camp);
    expect(res.beacons.some((b) => b.silentWhileNear)).toBe(false);
    expect(res.medianNearRate).toBeGreaterThan(0);
  });
});

describe("beaconLeaveOneOut", () => {
  const camp = makeCampaign();
  const run = holdRun(camp, "r1");
  const cfg = DEFAULT_POSITIONING_CONFIG;

  it("computes deltas per enabled beacon without mutating the campaign", () => {
    const snap = JSON.stringify(camp);
    const res = beaconLeaveOneOut(run, camp, cfg, DEFAULT_EVALUATION_OPTIONS);
    expect(JSON.stringify(camp)).toBe(snap);
    expect(camp.beacons.every((b) => b.enabled)).toBe(true);
    expect(res.rows.map((r) => r.beaconId)).toEqual(["B1", "B2", "B3", "B4"]);
    for (const r of res.rows) {
      expect(r.deltaMedian).not.toBeNull();
      expect(r.deltaEpochsHeard).toBeGreaterThan(0);
      expect(r.medianWithout! - res.baseline.median!).toBeCloseTo(r.deltaMedian!, 10);
    }
    expect(res.note).toContain("Algorithmus");
  });

  it("is deterministic and skips disabled beacons", () => {
    const c2 = { ...camp, beacons: camp.beacons.map((b) => (b.id === "B4" ? { ...b, enabled: false } : b)) };
    const a = beaconLeaveOneOut(run, c2, cfg, DEFAULT_EVALUATION_OPTIONS);
    const b = beaconLeaveOneOut(run, c2, cfg, DEFAULT_EVALUATION_OPTIONS);
    expect(a).toEqual(b);
    expect(a.rows.map((r) => r.beaconId)).toEqual(["B1", "B2", "B3"]);
  });

  it("refuses calibration runs (leakage rules)", () => {
    expect(() => beaconLeaveOneOut(holdRun(camp, "c", "calibration"), camp, cfg, DEFAULT_EVALUATION_OPTIONS)).toThrow(LeakageError);
  });

  it("works on the demo campaign", () => {
    const { campaign, runs } = createDemoCampaign();
    const ev = runs.find((r) => r.role === "evaluation" && r.kind === "stationary")!;
    const res = beaconLeaveOneOut(ev, campaign, cfg, DEFAULT_EVALUATION_OPTIONS);
    expect(res.rows.length).toBe(campaign.beacons.filter((b) => b.enabled).length);
    expect(res.rows.some((r) => r.deltaMedian !== null)).toBe(true);
    const residuals = beaconResiduals(runs.filter((r) => r.role === "calibration"), campaign);
    expect(residuals.beacons.length).toBe(campaign.beacons.length);
  }, 30000);
});
