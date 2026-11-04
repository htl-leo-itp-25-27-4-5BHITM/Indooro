import { describe, expect, it } from "vitest";
import { DEFAULT_PATH_LOSS, DEFAULT_POSITIONING_CONFIG } from "../core/defaults";
import { gaussian, mulberry32 } from "../core/random";
import type { AlgorithmParams, Beacon, Point } from "../core/types";
import { ALGORITHMS, type AlgorithmContext, type EpochInput, type Fingerprint } from "./algorithms";
import { distanceToRssi } from "./pathloss";
import { TRUE_MODEL, makeBeacon, makePlan, rssiFor, squareBeacons } from "./testutil";

function ctx(beacons: Beacon[], over: Partial<AlgorithmParams> = {}, mpu = 1, fingerprints?: Fingerprint[]): AlgorithmContext {
  return {
    beacons,
    plan: makePlan({ metersPerUnit: mpu }),
    pathLoss: TRUE_MODEL,
    params: { ...DEFAULT_POSITIONING_CONFIG.params, ...over },
    fingerprints,
  };
}
const epoch = (obs: Record<string, number>): EpochInput => ({ t: 0, observations: Object.entries(obs).map(([beaconId, rssi]) => ({ beaconId, rssi })) });
const exactEpoch = (beacons: Beacon[], pos: Point, mpu = 1): EpochInput => ({
  t: 0,
  observations: beacons.map((b) => ({ beaconId: b.id, rssi: rssiFor(b, pos, TRUE_MODEL, mpu) })),
});
const pos = (r: ReturnType<typeof ALGORITHMS["trilateration"]["estimate"]>): Point => {
  if (!r.position) throw new Error(`expected position, got failure: ${r.reason}`);
  return r.position;
};

describe("algorithm registry", () => {
  it("declares requirements", () => {
    expect(ALGORITHMS["strongest-beacon"].requires).toEqual({ calibration: false, fingerprints: false, minBeacons: 1 });
    expect(ALGORITHMS.trilateration.requires.minBeacons).toBe(3);
    expect(ALGORITHMS.trilateration.requires.calibration).toBe(true);
    expect(ALGORITHMS["knn-fingerprint"].requires.fingerprints).toBe(true);
    for (const [id, a] of Object.entries(ALGORITHMS)) expect(a.id).toBe(id);
  });
});

describe("strongest-beacon", () => {
  const a = ALGORITHMS["strongest-beacon"];
  const bs = squareBeacons();
  it("single beacon", () => {
    expect(pos(a.estimate(epoch({ B3: -70 }), ctx(bs)))).toEqual({ x: 10, y: 10 });
  });
  it("picks the max rssi", () => {
    expect(pos(a.estimate(epoch({ B1: -80, B2: -60, B3: -70 }), ctx(bs)))).toEqual({ x: 10, y: 0 });
  });
  it("tie -> lowest beaconId", () => {
    expect(pos(a.estimate(epoch({ B4: -60, B2: -60, B3: -60 }), ctx(bs)))).toEqual({ x: 10, y: 0 });
  });
  it("fails without beacons, with reason in German", () => {
    const r = a.estimate(epoch({}), ctx(bs));
    expect(r).toEqual({ position: null, reason: "zu wenige Beacons (0 < 1)" });
  });
  it("ignores disabled, unknown, below-threshold and NaN observations", () => {
    const withDisabled = bs.map((b) => (b.id === "B2" ? { ...b, enabled: false } : b));
    expect(pos(a.estimate(epoch({ B2: -50, B1: -80, X9: -40, B3: NaN }), ctx(withDisabled)))).toEqual({ x: 0, y: 0 });
    expect(a.estimate(epoch({ B1: -95 }), ctx(bs, { rssiThreshold: -90 })).position).toBeNull();
  });
  it("respects minBeacons param", () => {
    const r = a.estimate(epoch({ B1: -60 }), ctx(bs, { minBeacons: 2 }));
    expect(r).toEqual({ position: null, reason: "zu wenige Beacons (1 < 2)" });
  });
});

describe("weighted-centroid", () => {
  const a = ALGORITHMS["weighted-centroid"];
  const bs = squareBeacons();
  it("equal RSSI at 4 square beacons -> exactly the centre", () => {
    const p = pos(a.estimate(epoch({ B1: -70, B2: -70, B3: -70, B4: -70 }), ctx(bs)));
    expect(p.x).toBeCloseTo(5, 12);
    expect(p.y).toBeCloseTo(5, 12);
  });
  it("one dominant beacon pulls the estimate next to it", () => {
    const p = pos(a.estimate(epoch({ B1: -40, B2: -90, B3: -90, B4: -90 }), ctx(bs)));
    expect(Math.hypot(p.x, p.y)).toBeLessThan(0.01);
  });
  it("g = 0 is the plain centroid regardless of rssi", () => {
    const p = pos(a.estimate(epoch({ B1: -40, B2: -90, B3: -90 }), ctx(bs, { weightExponent: 0 })));
    expect(p.x).toBeCloseTo(20 / 3, 12);
    expect(p.y).toBeCloseTo(10 / 3, 12);
  });
  it("weights follow power^g: 3 dB stronger => twice the weight for g = 1", () => {
    const two = [makeBeacon("A", 0, 0), makeBeacon("B", 9, 0)];
    const p = pos(a.estimate(epoch({ A: -67, B: -70 }), ctx(two, { weightExponent: 1 })));
    const w = 10 ** 0.3;
    expect(p.x).toBeCloseTo((9 * 1) / (w + 1), 9);
  });
  it("is order independent and handles extreme values without NaN", () => {
    const p1 = pos(a.estimate(epoch({ B1: -10, B2: -200, B3: -200 }), ctx(bs, { rssiThreshold: -300 })));
    expect(Number.isFinite(p1.x) && Number.isFinite(p1.y)).toBe(true);
    const p2 = pos(a.estimate(epoch({ B3: -70, B1: -60 }), ctx(bs)));
    const p3 = pos(a.estimate(epoch({ B1: -60, B3: -70 }), ctx(bs)));
    expect(p2).toEqual(p3);
  });
  it("topK keeps the strongest beacons only", () => {
    const p = pos(a.estimate(epoch({ B1: -50, B2: -50, B3: -90, B4: -90 }), ctx(bs, { topK: 2, weightExponent: 0 })));
    expect(p).toEqual({ x: 5, y: 0 });
  });
});

describe("trilateration", () => {
  const a = ALGORITHMS.trilateration;
  const bs = [makeBeacon("B1", 0, 0), makeBeacon("B2", 12, 0), makeBeacon("B3", 12, 10), makeBeacon("B4", 0, 10)];

  it("noise-free exact distances recover the position within 1e-3 (4 beacons)", () => {
    for (const truth of [{ x: 4, y: 3 }, { x: 8.5, y: 6.25 }, { x: 5, y: 7 }]) {
      const p = pos(a.estimate(exactEpoch(bs, truth), ctx(bs)));
      expect(Math.hypot(p.x - truth.x, p.y - truth.y)).toBeLessThan(1e-3);
    }
  });
  it("works with exactly 3 non-collinear beacons", () => {
    const three = bs.slice(0, 3);
    const truth = { x: 5, y: 4 };
    const p = pos(a.estimate(exactEpoch(three, truth), ctx(three)));
    expect(Math.hypot(p.x - truth.x, p.y - truth.y)).toBeLessThan(1e-3);
  });
  it("plain least squares (huber 0) also recovers", () => {
    const truth = { x: 6, y: 5 };
    const p = pos(a.estimate(exactEpoch(bs, truth), ctx(bs, { huberDeltaM: 0 })));
    expect(Math.hypot(p.x - truth.x, p.y - truth.y)).toBeLessThan(1e-3);
  });
  it("converts metres to layout units: metersPerUnit = 0.5", () => {
    // 1 LE = 0.5 m. Beacons in LE; distances (m) are halved relative to LE.
    const small = [makeBeacon("B1", 0, 0), makeBeacon("B2", 12, 0), makeBeacon("B3", 12, 10), makeBeacon("B4", 0, 10)];
    const truth = { x: 7, y: 4 };
    const p = pos(a.estimate(exactEpoch(small, truth, 0.5), ctx(small, {}, 0.5)));
    expect(Math.hypot(p.x - truth.x, p.y - truth.y)).toBeLessThan(1e-3);
    // Treating the same signals with mpu = 1 gives a different (wrong) answer => conversion matters
    const wrong = a.estimate(exactEpoch(small, truth, 0.5), ctx(small, {}, 1)).position;
    if (wrong) expect(Math.hypot(wrong.x - truth.x, wrong.y - truth.y)).toBeGreaterThan(0.5);
  });
  it("uses a beacon's own path-loss model", () => {
    const own = { rssiAt1m: -50, pathLossExponent: 3, source: "manual" as const };
    const custom = bs.map((b, i) => (i === 0 ? { ...b, pathLoss: own } : b));
    const truth = { x: 5, y: 5 };
    const e = exactEpoch(bs, truth);
    e.observations[0].rssi = distanceToRssi(Math.hypot(5, 5), own);
    const p = pos(a.estimate(e, ctx(custom)));
    expect(Math.hypot(p.x - truth.x, p.y - truth.y)).toBeLessThan(1e-3);
  });
  it("collinear beacons -> failure with German reason", () => {
    const line = [makeBeacon("B1", 0, 0), makeBeacon("B2", 5, 0), makeBeacon("B3", 10, 0)];
    const r = a.estimate(exactEpoch(line, { x: 3, y: 2 }), ctx(line));
    expect(r).toEqual({ position: null, reason: "degenerierte Geometrie (Beacons kollinear)" });
  });
  it("coincident beacons -> collinear failure", () => {
    const same = [makeBeacon("B1", 1, 1), makeBeacon("B2", 1, 1), makeBeacon("B3", 1, 1)];
    expect(a.estimate(exactEpoch(same, { x: 3, y: 2 }), ctx(same)).position).toBeNull();
  });
  it("fewer than 3 beacons -> failure", () => {
    const r = a.estimate(exactEpoch(bs.slice(0, 2), { x: 3, y: 2 }), ctx(bs));
    expect(r).toEqual({ position: null, reason: "zu wenige Beacons (2 < 3)" });
  });
  it("missing beacons: 4 -> 3 still works, disabled beacon is dropped", () => {
    const truth = { x: 4, y: 6 };
    const dis = bs.map((b) => (b.id === "B4" ? { ...b, enabled: false } : b));
    const p = pos(a.estimate(exactEpoch(bs, truth), ctx(dis)));
    expect(Math.hypot(p.x - truth.x, p.y - truth.y)).toBeLessThan(1e-3);
  });
  it("very weak RSSI -> huge raw distances are clamped, no NaN", () => {
    const e = epoch({ B1: -140, B2: -150, B3: -160, B4: -130 });
    const r = a.estimate(e, ctx(bs, { rssiThreshold: -200 }));
    const p = pos(r);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    // all distances clamped to 11 m: estimate stays within a plausible area around the beacons
    expect(Math.abs(p.x - 6)).toBeLessThan(20);
  });
  it("very strong RSSI (> 0 dBm) -> tiny distances clamped to min", () => {
    const e = epoch({ B1: 10, B2: 10, B3: 10 });
    // inconsistent data (all ranges 0.35 m over a >10 m baseline): a failure with reason is acceptable, NaN is not
    const r = a.estimate(e, ctx(bs.slice(0, 3), { rssiThreshold: -200 }));
    if (r.position) expect(Number.isFinite(r.position.x) && Number.isFinite(r.position.y)).toBe(true);
    else expect(r.reason.length).toBeGreaterThan(0);
  });
  it("extreme noise never throws or yields NaN", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const e: EpochInput = { t: i, observations: bs.map((b) => ({ beaconId: b.id, rssi: -70 + gaussian(rng) * 40 })) };
      const r = a.estimate(e, ctx(bs, { rssiThreshold: -400 }));
      if (r.position) expect(Number.isFinite(r.position.x) && Number.isFinite(r.position.y)).toBe(true);
      else expect(typeof r.reason).toBe("string");
    }
  });
  it("invalid scale and invalid model give failures", () => {
    expect(a.estimate(exactEpoch(bs, { x: 3, y: 3 }), ctx(bs, {}, 0)).position).toBeNull();
    const bad = { ...ctx(bs), pathLoss: { ...DEFAULT_PATH_LOSS, pathLossExponent: -1 } };
    const r = a.estimate(exactEpoch(bs, { x: 3, y: 3 }), bad);
    expect(r.position).toBeNull();
  });
  it("Huber limits the influence of one gross outlier", () => {
    const truth = { x: 6, y: 5 };
    const e = exactEpoch(bs, truth);
    e.observations[0].rssi -= 25; // B1 reports it as much further away
    const robust = pos(a.estimate(e, ctx(bs, { huberDeltaM: 0.85 })));
    const plain = pos(a.estimate(e, ctx(bs, { huberDeltaM: 0 })));
    const err = (p: Point) => Math.hypot(p.x - truth.x, p.y - truth.y);
    expect(err(robust)).toBeLessThanOrEqual(err(plain) + 1e-9);
  });
});

describe("knn-fingerprint", () => {
  const a = ALGORITHMS["knn-fingerprint"];
  const bs = squareBeacons();
  const fpAt = (p: Point, runId = "cal"): Fingerprint => ({
    position: p,
    runId,
    rssi: Object.fromEntries(bs.map((b) => [b.id, rssiFor(b, p, TRUE_MODEL, 1)])),
  });
  const fps = [fpAt({ x: 1, y: 1 }), fpAt({ x: 9, y: 1 }), fpAt({ x: 9, y: 9 }), fpAt({ x: 1, y: 9 }), fpAt({ x: 5, y: 5 })];

  it("fails without fingerprints", () => {
    const r = a.estimate(epoch({ B1: -60 }), ctx(bs));
    expect(r.position).toBeNull();
    expect((r as { reason: string }).reason).toContain("Fingerprints");
  });
  it("exact match returns (almost exactly) the fingerprint position", () => {
    const e = exactEpoch(bs, { x: 9, y: 9 });
    const p = pos(a.estimate(e, ctx(bs, { knnK: 3 }, 1, fps)));
    expect(Math.hypot(p.x - 9, p.y - 9)).toBeLessThan(0.01);
  });
  it("k = 1 returns the nearest fingerprint", () => {
    const e = exactEpoch(bs, { x: 2, y: 2 });
    expect(pos(a.estimate(e, ctx(bs, { knnK: 1 }, 1, fps)))).toEqual({ x: 1, y: 1 });
  });
  it("interpolates between fingerprints for k > 1", () => {
    const e = exactEpoch(bs, { x: 5, y: 3 });
    const p = pos(a.estimate(e, ctx(bs, { knnK: 3 }, 1, fps)));
    expect(p.x).toBeGreaterThan(1);
    expect(p.x).toBeLessThan(9);
  });
  it("missing beacons are replaced by knnMissingRssi (no throw, finite result)", () => {
    const e = epoch({ B1: -60 });
    const p = pos(a.estimate(e, ctx(bs, { knnK: 2 }, 1, fps)));
    expect(Number.isFinite(p.x)).toBe(true);
  });
  it("no observations -> failure", () => {
    expect(a.estimate(epoch({}), ctx(bs, {}, 1, fps)).position).toBeNull();
  });
});

describe("determinism / purity", () => {
  it("does not mutate input", () => {
    const bs = squareBeacons();
    const e = exactEpoch(bs, { x: 3, y: 4 });
    const copy = JSON.parse(JSON.stringify(e));
    const c = ctx(bs);
    const cc = JSON.parse(JSON.stringify(c));
    for (const alg of Object.values(ALGORITHMS)) alg.estimate(e, c);
    expect(e).toEqual(copy);
    expect(c).toEqual(cc);
  });
});
