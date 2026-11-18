import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePositionComparison, POSITION_COMPARISON_SCHEMA } from "./positionComparison";

/** Output of `compare-positioning` on the SYNTHETIC test-room recording (not a measurement). */
const sample = readFileSync(new URL("../../samples/synthetic-position-comparison.json", import.meta.url), "utf8");

function mini(overrides: Record<string, unknown> = {}): string {
  const epoch = (t: number, truth: unknown, a: unknown, b: unknown) => ({
    t,
    truth,
    current: { position: a, raw: a, confidence: 0.9, beacons: 3, trusted: true },
    engine: { position: b, raw: b, confidence: 0.9, beacons: 3, trusted: true },
  });
  return JSON.stringify({
    schema: POSITION_COMPARISON_SCHEMA,
    origin: "field",
    unit: "m",
    methods: [
      { id: "current", label: "Aktuell" },
      { id: "engine", label: "Engine" },
    ],
    epochs: [
      epoch(100, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 0 }),
      epoch(100.35, { x: 0, y: 0 }, { x: 2, y: 0 }, null),
      epoch(100.7, null, { x: 9, y: 9 }, { x: 9, y: 9 }),
    ],
    ...overrides,
  });
}

describe("parsePositionComparison", () => {
  it("reads the tool output as two methods on the same epochs", () => {
    const result = parsePositionComparison(sample);
    expect(result.ok).toBe(true);
    const c = result.comparison!;
    expect(c.origin).toBe("synthetic");
    expect(c.methods.map((m) => m.id)).toEqual(["current", "engine"]);
    expect(c.methods[0].estimates).toHaveLength(c.epochCount);
    expect(c.methods[1].estimates).toHaveLength(c.epochCount);
    expect(c.methods[0].estimates.map((e) => e.t)).toEqual(c.methods[1].estimates.map((e) => e.t));
  });

  it("gets the same figures as the Swift tool (both implement docs/METRICS.md)", () => {
    const c = parsePositionComparison(sample).comparison!;
    expect(c.summaryMismatches).toEqual([]);
    for (const method of c.methods) {
      expect(method.toolSummary).not.toBeNull();
      expect(method.metrics.median).toBeCloseTo(method.toolSummary!.median as number, 4);
      expect(method.metrics.p90).toBeCloseTo(method.toolSummary!.p90 as number, 4);
      expect(method.metrics.p95).toBeCloseTo(method.toolSummary!.p95 as number, 4);
      expect(method.metrics.within3).toBeCloseTo(method.toolSummary!.within3 as number, 6);
      expect(method.dynamic.jumpRate).toBeCloseTo(method.toolSummary!.jumpRate as number, 6);
      expect(method.metrics.unit).toBe("m");
    }
  });

  it("marks a synthetic file with a warning", () => {
    const result = parsePositionComparison(sample);
    expect(result.issues.map((i) => i.code)).toContain("synthetic-origin");
    expect(result.comparison!.warnings.some((w) => w.startsWith("SYNTHETISCH"))).toBe(true);
  });

  it("counts a missing position as an outage and keeps it out of the error figures", () => {
    const c = parsePositionComparison(mini()).comparison!;
    const engine = c.methods[1];
    expect(engine.metrics.epochsWithTruth).toBe(2);
    expect(engine.metrics.failedEstimates).toBe(1);
    expect(engine.metrics.failureRate).toBe(0.5);
    expect(engine.metrics.median).toBe(3);
    expect(engine.metrics.within3).toBe(0.5);
    const current = c.methods[0];
    expect(current.metrics.failureRate).toBe(0);
    expect(current.metrics.median).toBe(1.5);
  });

  it("does not count epochs without truth", () => {
    const c = parsePositionComparison(mini()).comparison!;
    expect(c.methods[0].metrics.epochsWithTruth).toBe(2);
    expect(c.epochCount).toBe(3);
  });

  it("rejects a wrong schema, a wrong unit and broken JSON with a code", () => {
    expect(parsePositionComparison("{").issues[0].code).toBe("json-parse-error");
    expect(parsePositionComparison("[]").issues[0].code).toBe("json-shape");
    expect(parsePositionComparison(mini({ schema: "other/1" })).issues[0].code).toBe("schema-mismatch");
    expect(parsePositionComparison(mini({ unit: "LE" })).issues[0].code).toBe("unit-unsupported");
    expect(parsePositionComparison(mini({ methods: [] })).issues[0].code).toBe("methods-missing");
    expect(parsePositionComparison(mini({ epochs: [] })).issues[0].code).toBe("epochs-missing");
    expect(parsePositionComparison(mini({ methods: [{ id: "a", label: "A" }, { id: "a", label: "B" }] })).issues[0].code).toBe("methods-duplicate");
  });

  it("drops invalid epochs and says so instead of repairing them", () => {
    const parsed = JSON.parse(mini());
    parsed.epochs.push({ t: "x", truth: null, current: {}, engine: {} });
    parsed.epochs.push({ t: 101, truth: { x: 0, y: 0 }, current: { position: { x: "a", y: 0 } }, engine: { position: null } });
    const result = parsePositionComparison(JSON.stringify(parsed));
    expect(result.ok).toBe(true);
    expect(result.comparison!.epochCount).toBe(3);
    const issue = result.issues.find((i) => i.code === "epochs-invalid")!;
    expect(issue.count).toBe(2);
    expect(issue.rows).toEqual([4, 5]);
  });

  it("reports a difference between the Lab figures and the tool summary", () => {
    const parsed = JSON.parse(sample);
    parsed.summary.engine.median = parsed.summary.engine.median + 1;
    const result = parsePositionComparison(JSON.stringify(parsed));
    expect(result.comparison!.summaryMismatches.some((m) => m.startsWith("engine.median"))).toBe(true);
    expect(result.issues.map((i) => i.code)).toContain("summary-mismatch");
  });

  it("is blocked when no epoch is valid", () => {
    const result = parsePositionComparison(mini({ epochs: [{ t: 1, truth: { x: "a" } }] }));
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain("no-valid-epochs");
  });
});
