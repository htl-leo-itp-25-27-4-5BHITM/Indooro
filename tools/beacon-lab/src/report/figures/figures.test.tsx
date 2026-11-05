// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { PositionEstimate } from "../../core/types";
import { renderReportHtml, sanitizeSvg } from "../renderHtml";
import { buildReportModel } from "../reportModel";
import { makeCampaign, makeInput, makeMetrics, makeResult, makeRun } from "../fixtures";
import { buildReportFigures } from "./buildFigures";
import { decimate, renderErrorHeatmapSvg, renderFloorPlanSvg } from "./floorPlanSvg";

function est(i: number, over: Partial<PositionEstimate> = {}): PositionEstimate {
  const truth = { x: 1 + (i % 10) * 3, y: 1 + Math.floor(i / 10) * 3 };
  return { t: i, position: { x: truth.x + 0.5, y: truth.y + 0.25 }, rawPosition: null, inputs: [], truth, errorUnits: Math.hypot(0.5, 0.25), ...over };
}
const failure = (i: number): PositionEstimate => est(i, { position: null, errorUnits: null, failureReason: "zu wenige Beacons" });

function base(estimates: PositionEstimate[], scaleConfirmed = false, origin: "real" | "synthetic" = "real") {
  const campaign = makeCampaign();
  campaign.floorPlan.scale = { metersPerUnit: 0.5, confirmed: scaleConfirmed, note: scaleConfirmed ? "gemessen" : "" };
  const input = {
    plan: campaign.floorPlan,
    beacons: campaign.beacons,
    estimates,
    unit: (scaleConfirmed ? "m" : "LE") as "m" | "LE",
    metersPerUnit: 0.5,
    synthetic: origin === "synthetic",
    title: "T",
    idPrefix: "x",
  };
  return { campaign, input };
}

const count = (svg: string, re: RegExp) => (svg.match(re) ?? []).length;

describe("renderFloorPlanSvg", () => {
  it("draws one circle per valid estimate, none for failures; viewBox equals plan size", () => {
    const ests = [...Array.from({ length: 12 }, (_, i) => est(i)), failure(12), failure(13)];
    const { input, campaign } = base(ests);
    const { svg, counts } = renderFloorPlanSvg({ ...input, references: [{ x: 1, y: 1 }] });
    expect(count(svg, /class="est"/g)).toBe(12);
    expect(counts).toMatchObject({ valid: 12, failed: 2 });
    expect(count(svg, /<line /g)).toBe(12 + 1); // 12 error vectors + 1 legend sample line
    expect(svg).toContain(`viewBox="0 0 ${campaign.floorPlan.width} ${campaign.floorPlan.height}"`);
    expect(count(svg, /class="beacon"/g)).toBe(campaign.beacons.length);
    // nested plan viewport keeps the plan's aspect ratio
    const m = svg.match(/<svg class="plan"[^>]*width="([\d.]+)" height="([\d.]+)"/);
    expect(Number(m?.[1]) / Number(m?.[2])).toBeCloseTo(campaign.floorPlan.width / campaign.floorPlan.height, 3);
    expect(sanitizeSvg(svg)).toBe(svg);
  });
  it("uses LE without confirmed scale and m with it; tags synthetic data", () => {
    const ests = [est(0), est(1)];
    const le = renderFloorPlanSvg({ ...base(ests).input, references: [] }).svg;
    expect(le).toContain("LE");
    expect(le).not.toMatch(/ m</);
    expect(le).not.toContain("SYNTHETISCH");
    const m = renderFloorPlanSvg({ ...base(ests, true, "synthetic").input, references: [] }).svg;
    expect(m).toMatch(/ m</);
    expect(m).toContain("SYNTHETISCH");
  });
  it("decimates deterministically above the point limit", () => {
    const d = decimate(Array.from({ length: 7001 }, (_, i) => i), 3000);
    expect(d.step).toBe(3);
    expect(d.items.length).toBeLessThanOrEqual(3000);
    expect(d.items.slice(0, 3)).toEqual([0, 3, 6]);
    const ests = Array.from({ length: 50 }, (_, i) => est(i));
    const a = renderFloorPlanSvg({ ...base(ests).input, references: [], maxPoints: 10 });
    const b = renderFloorPlanSvg({ ...base(ests).input, references: [], maxPoints: 10 });
    expect(a.svg).toBe(b.svg);
    expect(a.counts).toMatchObject({ valid: 50, drawn: 10, decimationStep: 5 });
    expect(count(a.svg, /class="est"/g)).toBe(10);
  });
});

describe("renderErrorHeatmapSvg", () => {
  it("colours only cells with truth positions and hatches the rest; no interpolation", () => {
    const ests = [est(0, { truth: { x: 1, y: 1 } }), est(1, { truth: { x: 1.5, y: 1.5 }, errorUnits: 3 }), est(2, { truth: { x: 9, y: 9 } }), failure(3)];
    const { input, campaign } = base(ests);
    const r = renderErrorHeatmapSvg({ ...input, cellSize: 2 });
    expect(r.cellsWithData).toBe(2);
    const total = Math.ceil(campaign.floorPlan.width / 2) * Math.ceil(campaign.floorPlan.height / 2);
    expect(r.cellsWithoutData).toBe(total - 2);
    expect(count(r.svg, /class="cell data"/g)).toBe(2);
    expect(count(r.svg, /class="cell nodata"/g)).toBe(total - 2);
    expect(r.svg).toContain("<pattern");
    expect(r.svg).toContain('fill="url(#x-hatch)"');
    const mean = (Math.hypot(0.5, 0.25) + 3) / 2;
    expect(r.svg).toContain(mean.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 2, useGrouping: false }));
    expect(r.svg).toContain(`viewBox="0 0 ${campaign.floorPlan.width} ${campaign.floorPlan.height}"`);
  });
  it("sanitizeSvg keeps pattern, gradient and nested svg of the figures", () => {
    const { input } = base([est(0), est(1)]);
    const svg = renderErrorHeatmapSvg(input).svg;
    const clean = sanitizeSvg(svg);
    expect(clean).toBe(svg);
    for (const tag of ["<pattern", "<linearGradient", '<svg class="plan"', "<defs>"]) expect(clean).toContain(tag);
    expect(sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg"><defs><pattern id="p"><path d="M0 0"/></pattern></defs><rect fill="url(#p)" onclick="x()"/></svg>`)).toContain('<pattern id="p">');
  });
});

describe("buildReportFigures + report", () => {
  const campaign = makeCampaign();
  const r1 = makeResult("r1", "synthetic", {
    estimates: [...Array.from({ length: 8 }, (_, i) => est(i)), failure(8), failure(9)],
    metrics: makeMetrics({ epochsWithTruth: 10, validEstimates: 8, failedEstimates: 2, failureRate: 0.2 }),
  });
  const r2 = makeResult("r2", "synthetic", {
    configHash: "cafebabe".repeat(8),
    estimates: Array.from({ length: 5 }, (_, i) => est(i, { errorUnits: 2 + i })),
    metrics: makeMetrics({ epochsWithTruth: 5, validEstimates: 5, failedEstimates: 0, failureRate: 0 }),
  });
  const figs = buildReportFigures({
    campaign,
    results: [
      { id: "a", result: r1 },
      { id: "b", result: r2 },
    ],
  });

  it("creates per-result and comparison figures with complete captions", () => {
    expect(figs.map((f) => f.id)).toEqual(["cdf-a", "floorplan-a", "heatmap-a", "cdf-b", "floorplan-b", "heatmap-b", "box-compare", "bar-failure"]);
    const fp = figs.find((f) => f.id === "floorplan-a");
    expect(fp?.caption).toContain("Lauf „Lauf r1“");
    expect(fp?.caption).toContain(r1.configHash);
    expect(fp?.caption).toContain("n gültig = 8, n Fehlschläge = 2");
    expect(fp?.caption).toContain("2 Fehlschläge ohne Position werden nicht gezeichnet");
    expect(fp?.caption).toContain("Einheit: LE");
    expect(fp?.caption).toContain("SYNTHETISCH");
    expect(figs.find((f) => f.id === "heatmap-a")?.caption).toContain("Mittelwert je Zelle, keine Interpolation");
    const box = figs.find((f) => f.id === "box-compare");
    expect(box?.caption).toContain("n gültig = 5, n Fehlschläge = 0");
    expect(box?.svg).toContain("Lauf r1 · ");
    expect(figs.find((f) => f.id === "bar-failure")?.svg).toContain("Ausfallrate");
  });
  it("respects the selected figure kinds and skips comparisons for a single result", () => {
    const only = buildReportFigures({ campaign, results: [{ id: "a", result: r1 }], kinds: ["floorplan", "box"] });
    expect(only.map((f) => f.id)).toEqual(["floorplan-a"]);
  });
  it("states decimation in the caption", () => {
    const many = makeResult("r3", "real", { estimates: Array.from({ length: 40 }, (_, i) => est(i)), metrics: makeMetrics({ epochsWithTruth: 40, validEstimates: 40, failedEstimates: 0, failureRate: 0 }) });
    const f = buildReportFigures({ campaign, results: [{ id: "c", result: many }], kinds: ["floorplan"], maxPoints: 10 });
    expect(f[0].caption).toContain("ausgedünnt: jede 4. gültige Schätzung, 10 von 40 gezeichnet");
  });
  it("report HTML numbers the figures and embeds them sanitised; unit m with confirmed scale", () => {
    const html = renderReportHtml(buildReportModel(makeInput({ campaign, runs: [makeRun("r1", "synthetic"), makeRun("r2", "synthetic")], results: [r1, r2], figures: figs })));
    for (let n = 1; n <= figs.length; n++) expect(html).toContain(`Abbildung ${n}: `);
    expect(html).toContain('data-figure="2"');
    expect(html).toContain("<pattern");
    expect(html).not.toContain("<script");
    const c2 = makeCampaign();
    c2.floorPlan.scale = { metersPerUnit: 1, confirmed: true, note: "gemessen" };
    const m = buildReportFigures({ campaign: c2, results: [{ id: "a", result: r1 }], kinds: ["floorplan"] });
    expect(m[0].caption).toContain("Einheit: m");
    expect(m[0].caption).not.toContain("Einheit: LE");
  });
});
