import { describe, expect, it } from "vitest";
import { mulberry32 } from "../core/random";
import type { PositionEstimate } from "../core/types";
import { makeInput, makeResult, makeRun } from "./fixtures";
import { buildReportModel, resultUncertainty } from "./reportModel";
import type { ReportModel } from "./reportModel";

const rng = mulberry32(5);
const estimates: PositionEstimate[] = Array.from({ length: 120 }, (_, t) => {
  const err = 1 + rng() * 4;
  return { t, position: { x: err, y: 0 }, rawPosition: null, inputs: [], truth: { x: 0, y: 0 }, errorUnits: err };
});

function results(m: ReportModel) {
  return m.sections.find((s) => s.id === "results")!.blocks;
}

describe("report: uncertainty table", () => {
  const input = makeInput({
    runs: [makeRun("r1", "real", { kind: "walk" })],
    results: [makeResult("r1", "real", { estimates })],
  });

  it("adds a CI table with bracketed intervals and the method note (seed, iterations, blocks)", () => {
    const blocks = results(buildReportModel(input));
    const idx = blocks.findIndex((b) => b.type === "heading" && b.text.startsWith("Unsicherheit"));
    expect(idx).toBeGreaterThan(0);
    const tb = blocks[idx + 1];
    expect(tb.type).toBe("table");
    if (tb.type !== "table") return;
    const row = tb.table.rows[0];
    expect(row[3]).toBe("12"); // 120 s / 10 s segments
    expect(row[4]).toMatch(/^\d+\.\d{2} \[\d+\.\d{2} – \d+\.\d{2}\]$/);
    expect(row[6]).toMatch(/%\s\[.*%\s–\s.*%\]$/);
    expect(tb.table.note).toContain("Seed 20260101");
    expect(tb.table.note).toContain("2000 Wiederholungen");
    expect(tb.table.note).toContain("Block-Bootstrap");
  });

  it("is deterministic, memoised per result and reports n. b. below five blocks", () => {
    const r = makeResult("r1", "real", { estimates: estimates.slice(0, 30) });
    const a = resultUncertainty(r, input.campaign, input.runs);
    expect(resultUncertainty(r, input.campaign, input.runs)).toBe(a);
    expect(a.median.lo).toBeNull();
    const m = buildReportModel({ ...input, results: [r] });
    expect(JSON.stringify(results(m))).toContain("[n. b.]");
  });

  it("states that synthetic intervals describe only the simulation", () => {
    const m = buildReportModel(makeInput({ runs: [makeRun("s1", "synthetic")], results: [makeResult("s1", "synthetic", { estimates })] }));
    expect(JSON.stringify(results(m))).toContain("nur die Simulation");
  });
});
