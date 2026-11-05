import { describe, expect, it } from "vitest";
import { buildReportModel, INTERPRETATION_LABEL, NO_INTERPRETATION, SYNTHETIC_BANNER } from "./reportModel";
import type { ReportModel } from "./reportModel";
import { makeCampaign, makeInput, makeMetrics, makeResult, makeRun } from "./fixtures";

const section = (m: ReportModel, id: string) => m.sections.find((s) => s.id === id)!;
const text = (m: ReportModel, id: string) => JSON.stringify(section(m, id).blocks);

describe("buildReportModel structure", () => {
  it("creates the eleven numbered sections in order", () => {
    const m = buildReportModel(makeInput());
    expect(m.sections.map((s) => s.id)).toEqual(["meta", "data", "environment", "scale", "procedure", "calibration", "results", "figures", "limitations", "interpretation", "reproducibility"]);
    expect(m.sections.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe("synthetic vs real", () => {
  it("shows the banner for synthetic data and lists it as a limitation", () => {
    const m = buildReportModel(makeInput({ runs: [makeRun("s1", "synthetic")], results: [makeResult("s1", "synthetic")] }));
    expect(m.hasSynthetic).toBe(true);
    expect(m.syntheticBanner).toBe(SYNTHETIC_BANNER);
    expect(text(m, "limitations")).toContain("synthetische");
    expect(text(m, "data")).toContain("SYNTHETISCH");
    expect(text(m, "reproducibility")).toContain("4242"); // seed documented
  });
  it("has no banner for real-only data", () => {
    const m = buildReportModel(makeInput());
    expect(m.syntheticBanner).toBeNull();
    expect(text(m, "data")).toContain("ECHTDATEN");
    expect(text(m, "limitations")).not.toContain("synthetische (simulierte)");
  });
  it("flags a mixed report", () => {
    const m = buildReportModel(makeInput({ runs: [makeRun("r1"), makeRun("s1", "synthetic")], results: [makeResult("r1"), makeResult("s1", "synthetic")] }));
    expect(m.syntheticBanner).not.toBeNull();
  });
});

describe("limitations derive from facts only", () => {
  it("reports unconfirmed scale and uncalibrated model", () => {
    const l = text(buildReportModel(makeInput()), "limitations");
    expect(l).toContain("Maßstab nicht bestätigt");
    expect(l).toContain("Unkalibriert");
  });
  it("omits those statements when scale is confirmed and the model is fitted", () => {
    const base = makeCampaign();
    const c = makeCampaign({
      floorPlan: { ...base.floorPlan, scale: { metersPerUnit: 0.5, confirmed: true, note: "gemessen" } },
      pathLoss: { rssiAt1m: -61, pathLossExponent: 2.3, source: "fitted", fittedOnRunIds: ["k1"], r2: 0.91, residualStdDb: 3.2, sampleCount: 500 },
    });
    const m = buildReportModel(
      makeInput({
        campaign: c,
        runs: [makeRun("r1"), makeRun("r2", "real", { deviceId: "dev-2" }), makeRun("r3"), makeRun("k1", "real", { role: "calibration", name: "Kalibrierlauf" })],
        results: [makeResult("r1", "real", { metrics: makeMetrics({ unit: "m", failedEstimates: 0, failureRate: 0 }) })],
      }),
    );
    const l = text(m, "limitations");
    expect(l).not.toContain("Maßstab nicht bestätigt");
    expect(l).not.toContain("Unkalibriert");
    expect(text(m, "calibration")).toContain("Kalibrierlauf");
    expect(text(m, "calibration")).toContain("0.910");
    expect(text(m, "scale")).toContain("ja");
  });
  it("flags fewer than 100 epochs as exploratory, single device and < 3 runs", () => {
    const m = buildReportModel(makeInput({ results: [makeResult("r1", "real", { metrics: makeMetrics({ epochsWithTruth: 40 }) })] }));
    const l = text(m, "limitations");
    expect(l).toContain("explorativ");
    expect(l).toContain("Nur ein Endgerät");
    expect(l).toContain("Weniger als 3 Läufe");
  });
  it("does not flag 'explorativ' for >= 100 epochs", () => {
    expect(text(buildReportModel(makeInput()), "limitations")).not.toContain("explorativ");
  });
  it("reports missing ground truth", () => {
    const m = buildReportModel(makeInput({ results: [makeResult("r1", "real", { metrics: makeMetrics({ epochsWithTruth: 0, validEstimates: 0, failedEstimates: 0, failureRate: 0, mean: null }) })] }));
    expect(text(m, "limitations")).toContain("Keine Referenzposition");
  });
  it("includes every warning of the results and quality verdicts", () => {
    const m = buildReportModel(
      makeInput({
        results: [makeResult("r1", "real", { warnings: ["Sonderwarnung ABC"] })],
        qualityByRun: { r1: { issues: [], evaluable: false, reasons: ["zu wenige Beacons"], perBeacon: [{ beaconId: "X9", count: 12, rateHz: 1, maxGapSec: 3, known: false }] } },
      }),
    );
    const l = text(m, "limitations");
    expect(l).toContain("Sonderwarnung ABC");
    expect(l).toContain("Keine belastbare Auswertung möglich");
    expect(l).toContain("zu wenige Beacons");
    expect(l).toContain("X9");
  });
  it("flags evaluation on calibration runs", () => {
    const m = buildReportModel(makeInput({ runs: [makeRun("r1", "real", { role: "calibration" })] }));
    expect(text(m, "limitations")).toContain("Datenleckage");
  });
});

describe("interpretation is never invented", () => {
  it("says nothing was recorded when empty", () => {
    const t = text(buildReportModel(makeInput({ interpretationNotes: "   " })), "interpretation");
    expect(t).toContain(NO_INTERPRETATION);
    expect(t).toContain(INTERPRETATION_LABEL);
  });
  it("copies only the user's text", () => {
    const t = text(buildReportModel(makeInput({ interpretationNotes: "Wir vermuten Mehrwegeausbreitung am Kühlregal." })), "interpretation");
    expect(t).toContain("Mehrwegeausbreitung");
    expect(t).not.toContain(NO_INTERPRETATION);
  });
  it("never uses ranking language anywhere in the model", () => {
    const m = buildReportModel(makeInput({ runs: [makeRun("r1"), makeRun("s1", "synthetic")], results: [makeResult("r1"), makeResult("s1", "synthetic", { warnings: ["x"] })], commonComparison: { commonEpochs: 100, common: [makeMetrics(), makeMetrics()] } }));
    const all = JSON.stringify(m).toLowerCase();
    for (const w of ["bester", "beste ", "besten", "best ", "gewinner", "überlegen", "empfehl"]) expect(all).not.toContain(w);
  });
});

describe("content from input", () => {
  it("renders metric values with units and sort-key label", () => {
    const m = buildReportModel(makeInput());
    const t = text(m, "results");
    expect(t).toContain("2.35 LE"); // mean 2.3456
    expect(t).toContain("2.78 LE"); // rmse
    expect(t).toContain("5.0 %"); // failure rate
    expect(t).toContain("keine Rangfolge");
  });
  it("lists all config parameters and the config hash", () => {
    const t = text(buildReportModel(makeInput()), "procedure");
    expect(t).toContain("params.huberDeltaM");
    expect(t).toContain("rssiFilter.outlier.k");
    expect(t).toContain("evaluation.toleranceSec");
    expect(t).toContain("deadbeef");
  });
  it("shows metre positions only with confirmed scale", () => {
    const unconfirmed = text(buildReportModel(makeInput()), "environment");
    expect(unconfirmed).toContain("Maßstab unbestätigt");
    const base = makeCampaign();
    const confirmed = text(buildReportModel(makeInput({ campaign: makeCampaign({ floorPlan: { ...base.floorPlan, scale: { metersPerUnit: 2, confirmed: true, note: "" } } }) })), "environment");
    expect(confirmed).toContain("4.00, 6.00");
  });
  it("adds provenance: hashes and file names", () => {
    const m = buildReportModel(makeInput());
    expect(text(m, "data")).toContain("ab".repeat(32));
    expect(text(m, "reproducibility")).toContain("r1.csv");
  });
  it("passes figures through", () => {
    const m = buildReportModel(makeInput({ figures: [{ id: "f1", title: "CDF", svg: "<svg></svg>", caption: "Abb. 1" }] }));
    expect(section(m, "figures").blocks[0]).toMatchObject({ type: "figure", title: "CDF" });
  });
});
