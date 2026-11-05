import { describe, expect, it } from "vitest";
import { DEFAULT_POSITIONING_CONFIG } from "../core/defaults";
import type { PositioningConfig, RssiSample } from "../core/types";
import { buildEpochs } from "./epochs";
import { buildFingerprints } from "./fingerprint";
import { LeakageError } from "./errors";
import { makeBeacon, makeCampaign, makeRun, simulateHold } from "./testutil";

const cfg = (over: Partial<PositioningConfig> = {}): PositioningConfig => ({ ...DEFAULT_POSITIONING_CONFIG, ...over });
const s = (t: number, beaconId: string, rssi: number): RssiSample => ({ t, beaconId, rssi });

describe("buildEpochs", () => {
  it("empty / invalid input -> no epochs", () => {
    expect(buildEpochs([], cfg())).toEqual([]);
    expect(buildEpochs([s(0, "A", -60)], cfg({ stepSec: 0 }))).toEqual([]);
    expect(buildEpochs([s(0, "A", -60)], cfg({ stepSec: NaN }))).toEqual([]);
    expect(buildEpochs([s(NaN, "A", -60), s(1, "A", NaN)], cfg())).toEqual([]);
  });

  it("epochs at t0 + k*step up to the last sample", () => {
    const samples = [s(10, "A", -60), s(11.5, "A", -60), s(13, "A", -60)];
    const e = buildEpochs(samples, cfg({ stepSec: 1, windowSec: 2, staleSec: 5 }));
    expect(e.map((x) => x.t)).toEqual([10, 11, 12, 13]);
  });

  it("filter none: mean over (t - window, t]", () => {
    const samples = [s(0, "A", -60), s(0.5, "A", -70), s(1, "A", -80), s(1.5, "A", -90), s(2, "A", -100)];
    const e = buildEpochs(samples, cfg({ stepSec: 1, windowSec: 1, staleSec: 5 }));
    // epoch t=1: window (0,1] -> samples 0.5, 1 -> mean -75 ; t=2: (1,2] -> 1.5, 2 -> -95
    expect(e[1].observations[0].rssi).toBeCloseTo(-75, 12);
    expect(e[2].observations[0].rssi).toBeCloseTo(-95, 12);
    // t=0: window (-1,0] -> only sample at 0
    expect(e[0].observations[0].rssi).toBe(-60);
  });

  it("filter != none: last (filtered) value", () => {
    const samples = [s(0, "A", -60), s(0.5, "A", -70), s(1, "A", -80)];
    const kalman = { ...DEFAULT_POSITIONING_CONFIG.rssiFilter, kind: "ema" as const };
    const e = buildEpochs(samples, cfg({ stepSec: 1, windowSec: 5, staleSec: 5, rssiFilter: kalman }));
    expect(e[1].observations[0].rssi).toBe(-80);
  });

  it("stale beacons are absent, fresh ones present, sorted by id", () => {
    const samples = [s(0, "B", -60), s(0, "A", -61), s(1, "A", -61), s(2, "A", -61), s(3, "A", -61), s(4, "A", -61), s(5, "A", -61)];
    const e = buildEpochs(samples, cfg({ stepSec: 1, windowSec: 1, staleSec: 3 }));
    expect(e[0].observations.map((o) => o.beaconId)).toEqual(["A", "B"]);
    expect(e[3].observations.map((o) => o.beaconId)).toEqual(["A", "B"]); // age 3 <= stale 3
    expect(e[4].observations.map((o) => o.beaconId)).toEqual(["A"]); // B age 4 > 3
  });

  it("holds the last value when the window is empty but the beacon is not stale", () => {
    const samples = [s(0, "A", -60), s(0, "B", -70), s(4, "B", -70)];
    const e = buildEpochs(samples, cfg({ stepSec: 1, windowSec: 1, staleSec: 3 }));
    expect(e[2].observations.find((o) => o.beaconId === "A")!.rssi).toBe(-60);
  });

  it("beacon without any sample before t is absent; does not look into the future", () => {
    const samples = [s(0, "A", -60), s(2, "B", -50), s(3, "A", -60)];
    const e = buildEpochs(samples, cfg({ stepSec: 1, windowSec: 1, staleSec: 5 }));
    expect(e[0].observations.map((o) => o.beaconId)).toEqual(["A"]);
    expect(e[1].observations.map((o) => o.beaconId)).toEqual(["A"]);
    expect(e[2].observations.map((o) => o.beaconId)).toEqual(["A", "B"]);
  });

  it("emits empty epochs when everything is stale (gaps are visible)", () => {
    const samples = [s(0, "A", -60), s(10, "A", -60)];
    const e = buildEpochs(samples, cfg({ stepSec: 1, windowSec: 1, staleSec: 2 }));
    expect(e).toHaveLength(11);
    expect(e[5].observations).toEqual([]);
  });

  it("does not mutate input and tolerates unsorted samples", () => {
    const samples = [s(2, "A", -62), s(0, "A", -60), s(1, "A", -61)];
    const copy = JSON.parse(JSON.stringify(samples));
    const e = buildEpochs(samples, cfg({ stepSec: 1, windowSec: 1, staleSec: 5 }));
    expect(samples).toEqual(copy);
    expect(e.map((x) => x.observations[0].rssi)).toEqual([-60, -61, -62]);
  });

  it("is fast: 30 min x 5 Hz x 10 beacons, step 1 s", () => {
    const samples: RssiSample[] = [];
    for (let k = 0; k < 9000; k++) for (let b = 0; b < 10; b++) samples.push(s(k / 5, `B${b}`, -60 - (k % 7)));
    const t = performance.now();
    const e = buildEpochs(samples, cfg());
    expect(e.length).toBe(1800);
    expect(performance.now() - t).toBeLessThan(500);
  });
});

describe("buildFingerprints", () => {
  const beacons = [makeBeacon("B1", 0, 0), makeBeacon("B2", 10, 0), makeBeacon("B3", 10, 10)];
  const campaign = makeCampaign({ beacons });
  const calRun = () => {
    const pts = [{ x: 2, y: 2 }, { x: 7, y: 6 }];
    return makeRun({
      id: "cal",
      role: "calibration",
      kind: "stationary",
      samples: pts.flatMap((p, i) => simulateHold(campaign, p, i * 20, 10)),
      references: pts.flatMap((p, i) => [{ t: i * 20, position: p }, { t: i * 20 + 10, position: p }]),
    });
  };

  it("one fingerprint per hold with median RSSI per beacon", () => {
    const fps = buildFingerprints([calRun()], cfg());
    expect(fps).toHaveLength(2);
    expect(fps[0].position).toEqual({ x: 2, y: 2 });
    expect(fps[0].runId).toBe("cal");
    expect(Object.keys(fps[0].rssi).sort()).toEqual(["B1", "B2", "B3"]);
    // noise-free: median equals the exact value
    const d = Math.hypot(2 - 0, 2 - 0);
    expect(fps[0].rssi.B1).toBeCloseTo(-60 - 10 * 2.2 * Math.log10(d), 9);
  });
  it("uses the median (robust to a spike)", () => {
    const run = calRun();
    run.samples = run.samples.map((x, i) => (i === 3 ? { ...x, rssi: -10 } : x));
    const fps = buildFingerprints([run], cfg());
    const clean = buildFingerprints([calRun()], cfg());
    expect(fps[0].rssi.B1).toBeCloseTo(clean[0].rssi.B1, 6);
  });
  it("throws LeakageError for non-calibration runs", () => {
    expect(() => buildFingerprints([makeRun({ role: "evaluation" })], cfg())).toThrow(LeakageError);
  });
  it("empty runs / runs without holds -> no fingerprints", () => {
    expect(buildFingerprints([], cfg())).toEqual([]);
    expect(buildFingerprints([makeRun({ role: "calibration", kind: "walk" })], cfg())).toEqual([]);
  });
});
