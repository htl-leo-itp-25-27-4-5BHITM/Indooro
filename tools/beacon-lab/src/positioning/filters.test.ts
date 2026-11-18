import { describe, expect, it } from "vitest";
import { DEFAULT_POSITIONING_CONFIG } from "../core/defaults";
import type { RssiFilterConfig, RssiSample } from "../core/types";
import { filterSamplesPerBeacon, filterSeries, hampel } from "./filters";

const base = DEFAULT_POSITIONING_CONFIG.rssiFilter;
const cfg = (over: Partial<RssiFilterConfig>): RssiFilterConfig => ({ ...base, ...over });

describe("filterSeries", () => {
  it("none returns a copy", () => {
    const xs = [-60, -61, -62];
    const out = filterSeries(xs, cfg({ kind: "none" }));
    expect(out).toEqual(xs);
    expect(out).not.toBe(xs);
  });

  it("moving average is trailing", () => {
    const out = filterSeries([0, 10, 20, 30], cfg({ kind: "moving-average", window: 2 }));
    expect(out).toEqual([0, 5, 15, 25]);
  });

  it("ema with alpha 0.5", () => {
    const out = filterSeries([0, 10, 10], cfg({ kind: "ema", alpha: 0.5 }));
    expect(out).toEqual([0, 5, 7.5]);
  });

  it("trailing median rejects a spike", () => {
    const out = filterSeries([-60, -60, -90, -60, -60], cfg({ kind: "median", window: 3 }));
    expect(out).toEqual([-60, -60, -60, -60, -60]);
  });

  it("trimmed mean drops min and max when >= 5 samples (iOS-like)", () => {
    const out = filterSeries([-60, -62, -64, -66, -100], cfg({ kind: "trimmed-mean", window: 12 }));
    // 4 samples: plain mean of first four; 5th: drop -100 and -62..: sorted -100,-66,-64,-62,-60 -> mean(-66,-64,-62)
    expect(out[3]).toBeCloseTo(-63, 12);
    expect(out[4]).toBeCloseTo(-64, 12);
  });

  it("trimmed mean window limits history", () => {
    const out = filterSeries([0, 0, 0, 0, 0, 100, 100, 100], cfg({ kind: "trimmed-mean", window: 5 }));
    // last 5 = [0,0,100,100,100] -> drop 0 and 100 -> mean(0,100,100)
    expect(out[7]).toBeCloseTo(200 / 3, 12);
  });

  it("kalman: first sample initialises; converges to a constant", () => {
    const out = filterSeries([-70, -70, -70, -70], cfg({ kind: "kalman", kalmanQ: 1, kalmanR: 16 }));
    expect(out).toEqual([-70, -70, -70, -70]);
    const step = filterSeries([-80, -60, -60, -60, -60, -60, -60, -60, -60, -60], cfg({ kind: "kalman", kalmanQ: 1, kalmanR: 4 }));
    expect(step[1]).toBeGreaterThan(-80);
    expect(step[1]).toBeLessThan(-60);
    expect(Math.abs(step[9] + 60)).toBeLessThan(0.5);
  });

  it("kalman gain by hand (q=1, r=1)", () => {
    // init x=0,P=1. z=2: P=2, K=2/3, x=4/3, P=2/3
    const out = filterSeries([0, 2], cfg({ kind: "kalman", kalmanQ: 1, kalmanR: 1 }));
    expect(out[1]).toBeCloseTo(4 / 3, 12);
  });

  it.each(["moving-average", "ema", "median", "trimmed-mean", "kalman"] as const)("%s is causal", (kind) => {
    const a = [-60, -65, -70, -62, -61, -80, -59, -60];
    const b = [...a.slice(0, 5), -30, -120, -10];
    const c = cfg({ kind, window: 4 });
    const fa = filterSeries(a, c);
    const fb = filterSeries(b, c);
    expect(fa.slice(0, 5)).toEqual(fb.slice(0, 5));
  });

  it("skips NaN without fabricating values and does not throw", () => {
    const out = filterSeries([-60, NaN, -62], cfg({ kind: "moving-average", window: 3 }));
    expect(out[0]).toBe(-60);
    expect(Number.isNaN(out[1])).toBe(true);
    expect(out[2]).toBe(-61);
    expect(filterSeries([], cfg({ kind: "kalman" }))).toEqual([]);
  });
});

describe("hampel", () => {
  it("flags and replaces a spike with the window median", () => {
    const xs = [-60, -61, -60, -95, -60, -61, -60];
    const r = hampel(xs, 5, 3);
    expect(r.outlierIdx).toEqual([3]);
    expect(r.values[3]).toBe(-61);
    expect(xs[3]).toBe(-95);
  });
  it("does not flag normal jitter in quantised data", () => {
    const xs = [-60, -60, -61, -60, -60, -61, -60, -60];
    expect(hampel(xs, 5, 3).outlierIdx).toEqual([]);
  });
  it("handles short and empty input", () => {
    expect(hampel([], 5, 3).values).toEqual([]);
    expect(hampel([-60, -90], 5, 3).outlierIdx).toEqual([]);
  });
});

describe("filterSamplesPerBeacon", () => {
  const samples: RssiSample[] = [
    { t: 2, beaconId: "B", rssi: -70, sourceRow: 5 },
    { t: 0, beaconId: "A", rssi: -50 },
    { t: 1, beaconId: "A", rssi: -60 },
    { t: 0, beaconId: "B", rssi: -80 },
    { t: 2, beaconId: "A", rssi: NaN },
  ];
  it("groups, sorts, returns new objects and keeps metadata", () => {
    const frozen = samples.map((s) => Object.freeze({ ...s }));
    const out = filterSamplesPerBeacon(frozen, cfg({ kind: "moving-average", window: 2 }));
    expect(out.map((s) => `${s.t}${s.beaconId}`)).toEqual(["0A", "0B", "1A", "2B"]);
    expect(out.find((s) => s.t === 1 && s.beaconId === "A")!.rssi).toBe(-55);
    const b2 = out.find((s) => s.t === 2 && s.beaconId === "B")!;
    expect(b2.rssi).toBe(-75);
    expect(b2.sourceRow).toBe(5);
    expect(out[0]).not.toBe(frozen[1]);
  });
  it("applies hampel before the filter", () => {
    const sp: RssiSample[] = [-60, -60, -60, -95, -60, -60, -60].map((rssi, i) => ({ t: i, beaconId: "A", rssi }));
    const out = filterSamplesPerBeacon(sp, cfg({ kind: "none", outlier: { enabled: true, window: 5, k: 3 } }));
    expect(out.map((s) => s.rssi)).toEqual([-60, -60, -60, -60, -60, -60, -60]);
    expect(sp[3].rssi).toBe(-95);
  });
  it("empty input", () => {
    expect(filterSamplesPerBeacon([], base)).toEqual([]);
  });
});
