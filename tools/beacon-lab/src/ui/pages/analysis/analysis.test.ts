import { describe, expect, it } from "vitest";
import { createDemoCampaign } from "../../../data/synthetic";
import { DEFAULT_POSITIONING_CONFIG } from "../../../core/defaults";
import { compareAlgorithms } from "../../../positioning/pipeline";
import { calibrationPairs, modelCurve } from "./calibrationData";
import { decimate, fmt } from "./format";
import {
  MAX_SWEEP_VALUES,
  SWEEP_PARAMS,
  comparisonToCsv,
  comparisonToJson,
  defaultEvalOptions,
  getSweepParam,
  parseSweepValues,
  presetConfigs,
  setSweepParam,
  sweepParamHint,
} from "./presets";
import { beaconSamples, filterBeaconSeries, filterEffect, groupByHold, heardBeacons, summarizeBeacon } from "./signalStats";

const demo = createDemoCampaign();
const evalRun = demo.runs.find((r) => r.role === "evaluation" && r.kind === "stationary") as (typeof demo.runs)[number];
const calRun = demo.runs.find((r) => r.role === "calibration") as (typeof demo.runs)[number];

describe("presetConfigs", () => {
  it("offers kNN only with calibration runs and never mutates the defaults", () => {
    expect(presetConfigs(false).map((p) => p.config.algorithm)).toEqual(["strongest-beacon", "weighted-centroid", "weighted-centroid", "trilateration"]);
    expect(presetConfigs(true).at(-1)?.config.algorithm).toBe("knn-fingerprint");
    const p = presetConfigs(false)[2];
    expect(p.config.rssiFilter.kind).toBe("ema");
    expect(p.config.temporal.kind).toBe("kalman");
    expect(DEFAULT_POSITIONING_CONFIG.rssiFilter.kind).toBe("none");
  });
  it("uses interpolation for walks only", () => {
    expect(defaultEvalOptions({ kind: "walk" }).referenceMatching).toBe("interpolate");
    expect(defaultEvalOptions({ kind: "stationary" }).referenceMatching).toBe("hold-or-nearest");
  });
});

describe("sweep parsing", () => {
  const g = SWEEP_PARAMS.find((p) => p.id === "weightExponent")!;
  const topK = SWEEP_PARAMS.find((p) => p.id === "topK")!;
  it("parses separators, sorts and de-duplicates", () => {
    expect(parseSweepValues("2, 0.5; 1 1", g)).toEqual({ values: [0.5, 1, 2], errors: [] });
    // comma-only lists: comma separates values; with ; or whitespace as separator a comma between digits is a decimal comma
    expect(parseSweepValues("0,5", g).values).toEqual([0, 5]);
    expect(parseSweepValues("0,5; 1,5", g).values).toEqual([0.5, 1.5]);
  });
  it("reports invalid, out-of-range and non-integer values", () => {
    const r = parseSweepValues("abc, 9, 1", g);
    expect(r.values).toEqual([1]);
    expect(r.errors).toHaveLength(2);
    expect(parseSweepValues("2.5", topK).errors[0]).toMatch(/ganze Zahl/);
    expect(parseSweepValues("", g).errors).toEqual(["keine Werte angegeben"]);
  });
  it("caps the number of values", () => {
    const text = Array.from({ length: 30 }, (_, i) => i).join(",");
    const r = parseSweepValues(text, topK);
    expect(r.values).toHaveLength(MAX_SWEEP_VALUES);
    expect(r.errors.some((e) => e.includes("höchstens"))).toBe(true);
  });
  it("sets and gets every parameter on a copy", () => {
    const base = presetConfigs(false)[1].config;
    for (const p of SWEEP_PARAMS) {
      const v = p.integer ? 3 : 0.7;
      const c = setSweepParam(base, p.id, v);
      expect(getSweepParam(c, p.id)).toBe(v);
      expect(c).not.toBe(base);
      expect(getSweepParam(base, p.id)).not.toBe(v === getSweepParam(base, p.id) ? NaN : v);
    }
    expect(sweepParamHint(base, "rssiFilter.alpha")).toMatch(/EMA/);
    expect(sweepParamHint(base, "weightExponent")).toBeNull();
  });
});

describe("signal statistics", () => {
  it("summarises one beacon with sample std and gap counting", () => {
    const own = [0, 1, 2, 5, 6].map((t, i) => ({ t, beaconId: "b", rssi: [-60, -62, -64, -66, -68][i] }));
    const s = summarizeBeacon("b", own)!;
    expect(s.n).toBe(5);
    expect(s.mean).toBeCloseTo(-64, 10);
    expect(s.median).toBe(-64);
    expect(s.std).toBeCloseTo(Math.sqrt(10), 10); // n-1 divisor: sum sq = 40, /4 = 10
    expect(s.maxGapSec).toBe(3);
    expect(s.gapsOver).toBe(1);
    expect(s.rateHz).toBeCloseTo(4 / 6, 10);
    expect(summarizeBeacon("b", [])).toBeNull();
  });
  it("lists heard beacons of the demo run with counts", () => {
    const heard = heardBeacons(evalRun.samples);
    expect(heard.length).toBeGreaterThan(0);
    expect(heard.reduce((s, h) => s + h.count, 0)).toBe(evalRun.samples.length);
  });
  it("filtering works on a copy and shows an honest filter effect", () => {
    const id = heardBeacons(evalRun.samples)[0].beaconId;
    const before = JSON.stringify(evalRun.samples);
    const own = beaconSamples(evalRun.samples, id);
    const f = filterBeaconSeries(own, { ...DEFAULT_POSITIONING_CONFIG.rssiFilter, kind: "ema", alpha: 0.2 });
    expect(JSON.stringify(evalRun.samples)).toBe(before);
    expect(f.filtered).toHaveLength(f.raw.length);
    const eff = filterEffect(f.t, f.raw, f.filtered);
    expect((eff.stdFiltered as number) < (eff.stdRaw as number)).toBe(true);
    expect(eff.delaySamples).not.toBeNull();
    expect(eff.maxAbsDeviation).toBeGreaterThan(0);
    const none = filterBeaconSeries(own, DEFAULT_POSITIONING_CONFIG.rssiFilter);
    const e0 = filterEffect(none.t, none.raw, none.filtered);
    expect(e0.meanShift).toBeCloseTo(0, 10);
    expect(e0.delaySamples).toBe(0);
  });
  it("reports no delay for too short series", () => {
    const e = filterEffect([0, 1, 2], [-60, -61, -62], [-60, -60.5, -61]);
    expect(e.delaySec).toBeNull();
    expect(e.delaySamples).toBeNull();
  });
  it("groups RSSI per stationary hold", () => {
    const id = heardBeacons(evalRun.samples)[0].beaconId;
    const groups = groupByHold(evalRun, id);
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((g) => g.values.length > 0 && g.label.startsWith("("))).toBe(true);
    expect(groupByHold({ ...evalRun, references: [] }, id)).toEqual([]);
  });
});

describe("calibration data", () => {
  it("builds pairs within holds and respects the distance limit", () => {
    const all = calibrationPairs([calRun], demo.campaign, -100);
    const near = calibrationPairs([calRun], demo.campaign, -100, 4);
    expect(all.length).toBeGreaterThan(0);
    expect(near.length).toBeLessThan(all.length);
    expect(near.every((p) => p.distanceM <= 4)).toBe(true);
  });
  it("model curve is monotonically falling", () => {
    const c = modelCurve({ rssiAt1m: -60, pathLossExponent: 2, source: "manual" }, 0.5, 20);
    for (let i = 1; i < c.length; i++) expect(c[i].y).toBeLessThan(c[i - 1].y);
    expect(c[0].x).toBeCloseTo(0.5, 10);
  });
});

describe("comparison export", () => {
  const configs = presetConfigs(false).slice(0, 2);
  const comparison = compareAlgorithms({ run: evalRun, campaign: demo.campaign, options: defaultEvalOptions(evalRun), configs: configs.map((c) => c.config) });
  const input = { run: evalRun, names: configs.map((c) => c.name), options: defaultEvalOptions(evalRun), comparison, generatedAt: "2026-01-01T00:00:00.000Z" };
  it("JSON carries configs, metrics, common epochs and the run hash", () => {
    const j = JSON.parse(comparisonToJson(input));
    expect(j.run.sha256).toBe(evalRun.provenance.sha256);
    expect(j.commonEpochs).toBe(comparison.commonEpochs);
    expect(j.configurations).toHaveLength(2);
    expect(j.configurations[0].configHash).toBe(comparison.results[0].configHash);
    expect(j.configurations[0].metricsOnCommonEpochs).toBeTruthy();
  });
  it("CSV has two rows per configuration (all + common) and keeps failures", () => {
    const lines = comparisonToCsv(input).trim().split("\n");
    expect(lines).toHaveLength(1 + 2 * 2);
    expect(lines[1]).toContain(",all,");
    expect(lines[2]).toContain("common(n=");
    expect(lines[0]).toContain("failed");
  });
});

describe("format helpers", () => {
  it("formats numbers German and handles null", () => {
    expect(fmt(1.5, 1)).toBe("1,5");
    expect(fmt(null)).toBe("–");
  });
  it("decimates keeping the endpoints", () => {
    const d = decimate(Array.from({ length: 1000 }, (_, i) => i), 10);
    expect(d).toHaveLength(10);
    expect(d[0]).toBe(0);
    expect(d[9]).toBe(999);
  });
});
