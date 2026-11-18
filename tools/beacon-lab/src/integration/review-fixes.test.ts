/**
 * Regression tests for the findings of the independent math/data review (Phase E).
 * Each test reproduces the originally failing input.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_EVALUATION_OPTIONS, DEFAULT_POSITIONING_CONFIG } from "../core/defaults";
import type { PositionEstimate } from "../core/types";
import { samplesToCsv } from "../data/export";
import { isoFieldsValid, relativeTimeLooksLikeMilliseconds, runImport } from "../data/import";
import { createDemoCampaign } from "../data/synthetic";
import { computeErrorMetrics } from "../positioning/metrics";
import { LeakageError, runPositioning } from "../positioning/pipeline";
import { applyTemporalFilter } from "../positioning/temporal";

const { campaign, runs } = createDemoCampaign();
const evalRun = runs.find((r) => r.role === "evaluation")!;
const calRun = runs.find((r) => r.role === "calibration")!;

describe("leakage guards", () => {
  it("rejects a calibration run with the same raw data under another id/role", () => {
    const clone = { ...evalRun, id: "other-id", role: "calibration" as const };
    expect(() =>
      runPositioning({
        run: evalRun,
        campaign,
        config: { ...DEFAULT_POSITIONING_CONFIG, algorithm: "knn-fingerprint" },
        options: DEFAULT_EVALUATION_OPTIONS,
        calibrationRuns: [calRun, clone],
      }),
    ).toThrow(LeakageError);
  });

  it("rejects evaluating with a path-loss model fitted on the evaluated run", () => {
    const leaky = { ...campaign, pathLoss: { ...campaign.pathLoss, source: "fitted" as const, fittedOnRunIds: [evalRun.id] } };
    expect(() =>
      runPositioning({ run: evalRun, campaign: leaky, config: { ...DEFAULT_POSITIONING_CONFIG, algorithm: "trilateration" }, options: DEFAULT_EVALUATION_OPTIONS }),
    ).toThrow(LeakageError);
    // algorithms that do not use the path-loss model are unaffected
    expect(() =>
      runPositioning({ run: evalRun, campaign: leaky, config: { ...DEFAULT_POSITIONING_CONFIG, algorithm: "weighted-centroid" }, options: DEFAULT_EVALUATION_OPTIONS }),
    ).not.toThrow();
  });
});

describe("robustness", () => {
  it("computeErrorMetrics handles 200k estimates (no spread into Math.max)", () => {
    const est: PositionEstimate[] = Array.from({ length: 200_000 }, (_, i) => ({
      t: i,
      position: { x: 1, y: 0 },
      rawPosition: { x: 1, y: 0 },
      inputs: [],
      truth: { x: 0, y: 0 },
      errorUnits: (i % 7) + 1,
    }));
    const m = computeErrorMetrics(est, campaign.floorPlan.scale);
    expect(m.max).toBe(7);
  });

  it("warns when the epoch cap truncates a run", () => {
    const run = { ...evalRun, samples: [evalRun.samples[0], { ...evalRun.samples[0], t: evalRun.samples[0].t + 1000 }] };
    const res = runPositioning({ run, campaign, config: { ...DEFAULT_POSITIONING_CONFIG, stepSec: 0.001 }, options: DEFAULT_EVALUATION_OPTIONS });
    expect(res.warnings.some((w) => w.includes("ABGESCHNITTEN"))).toBe(true);
  });

  it("warns that Hampel uses future samples", () => {
    const cfg = { ...DEFAULT_POSITIONING_CONFIG, rssiFilter: { ...DEFAULT_POSITIONING_CONFIG.rssiFilter, outlier: { enabled: true, window: 7, k: 3 } } };
    const res = runPositioning({ run: evalRun, campaign, config: cfg, options: DEFAULT_EVALUATION_OPTIONS });
    expect(res.warnings.some((w) => w.includes("nicht kausal"))).toBe(true);
  });

  it("speed gate does not freeze positions with identical timestamps", () => {
    const out = applyTemporalFilter(
      [
        { t: 0, position: { x: 0, y: 0 } },
        { t: 0, position: { x: 5, y: 0 } },
      ],
      { ...DEFAULT_POSITIONING_CONFIG.temporal, kind: "none", maxSpeedMps: 1 },
      1,
    );
    expect(out[1]).toEqual({ x: 5, y: 0 });
  });
});

describe("import honesty", () => {
  it("flags relative timestamps that look like milliseconds, without converting them", async () => {
    const out = await runImport({ fileName: "x.csv", text: "t,beaconId,rssi\n1000,a,-60\n2000,a,-61\n3000,a,-62\n", knownBeaconIds: ["a"] });
    expect(out.samples.map((s) => s.t)).toEqual([1000, 2000, 3000]);
    expect(out.provenance.issues.some((i) => i.code === "possible-milliseconds")).toBe(true);
    expect(relativeTimeLooksLikeMilliseconds([{ t: 0, beaconId: "a" }, { t: 0.5, beaconId: "a" }, { t: 1, beaconId: "a" }])).toBeNull();
  });

  it("rejects impossible ISO dates instead of rolling them over", async () => {
    expect(isoFieldsValid("2024-02-31", "10:00:00")).toBe(false);
    expect(isoFieldsValid("2024-02-29", "10:00:00")).toBe(true);
    expect(isoFieldsValid("2023-02-29", undefined)).toBe(false);
    expect(isoFieldsValid("2024-01-01", "24:00")).toBe(false);
    const out = await runImport({
      fileName: "x.csv",
      text: "t,beaconId,rssi\n2024-02-31T10:00:00Z,a,-60\n2024-03-01T10:00:00Z,a,-61\n2024-03-01T10:00:01Z,a,-62\n",
      knownBeaconIds: ["a"],
    });
    expect(out.samples).toHaveLength(2);
    expect(out.samples.every((s) => s.t >= Date.parse("2024-03-01T10:00:00Z") / 1000)).toBe(true);
  });

  it("re-imported synthetic CSV export keeps its synthetic origin", async () => {
    const csv = samplesToCsv(evalRun);
    const out = await runImport({ fileName: "export.csv", text: csv, knownBeaconIds: campaign.beacons.map((b) => b.id) });
    expect(out.suggested?.origin).toBe("synthetic");
    expect(out.provenance.issues.some((i) => i.code === "synthetic-origin-column")).toBe(true);
  });

  it("warns when many exact duplicates are removed", async () => {
    const out = await runImport({ fileName: "x.csv", text: "t,beaconId,rssi\n1,a,-60\n1,a,-60\n2,a,-61\n", knownBeaconIds: ["a"] });
    expect(out.samples).toHaveLength(2);
    expect(out.provenance.issues.some((i) => i.code === "many-duplicates")).toBe(true);
  });
});

describe("indooro-recording/2 import", () => {
  const v2 = [
    '{"type":"session","t":1792000000.0,"schema":"indooro-recording/2","app":"1.4.0 (123)","deviceModel":"iPhone15,3","os":"iOS 18.1","scenario":"S2","role":"calibration"}',
    '{"revision":1,"t":1792000000.0,"type":"layout"}',
    '{"t":1792000000.0,"type":"truth","x":1.0,"y":5.0,"marker":"M1"}',
    '{"beacon":"Indooro1","rssi":-70,"source":"ranging","t":1792000000.5,"type":"measurement"}',
    '{"beacon":"Indooro1","rssi":-71,"source":"ranging","t":1792000001.5,"type":"measurement"}',
    '{"t":1792000002.0,"type":"sync","label":"sync-1"}',
    '{"t":1792000003.0,"type":"truth","x":3.0,"y":5.0,"marker":"bogus name"}',
    '{"beacon":"Indooro1","rssi":-72,"source":"ranging","t":1792000003.5,"type":"measurement"}',
  ].join("\n");

  it("reads session suggestions, marker labels and sync lines", async () => {
    const out = await runImport({ fileName: "rec.jsonl", text: v2, knownBeaconIds: ["Indooro1"] });
    expect(out.ok).toBe(true);
    expect(out.samples).toHaveLength(3);
    expect(out.suggested).toMatchObject({ role: "calibration", kind: "walk", deviceId: "iPhone15,3 · iOS 18.1" });
    expect(out.references.map((r) => r.label)).toEqual(["M1", undefined]);
    const codes = out.provenance.issues.map((i) => i.code);
    expect(codes).toContain("recording-session");
    expect(codes).toContain("sync-markers");
    expect(codes).toContain("invalid-marker");
  });

  it("old recordings without session still import unchanged", async () => {
    const v1 = v2.split("\n").filter((l) => !l.includes('"session"') && !l.includes('"sync"')).map((l) => l.replace(/,"marker":"[^"]*"/, "")).join("\n");
    const out = await runImport({ fileName: "rec.jsonl", text: v1, knownBeaconIds: ["Indooro1"] });
    expect(out.ok).toBe(true);
    expect(out.suggested).toBeUndefined();
    expect(out.references.every((r) => r.label === undefined)).toBe(true);
  });
});
