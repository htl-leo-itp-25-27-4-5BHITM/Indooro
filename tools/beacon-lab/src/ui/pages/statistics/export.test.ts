import { describe, expect, it } from "vitest";
import { DEFAULT_EVALUATION_OPTIONS, DEFAULT_POSITIONING_CONFIG } from "../../../core/defaults";
import { aggregateRuns } from "../../../positioning/aggregate";
import { makeBeacon, makeCampaign, makeRun, simulateHold } from "../../../positioning/testutil";
import { aggregationToCsv, aggregationToJson } from "./export";
import { fmtBootstrap, fmtProportion } from "./format";

const campaign = makeCampaign({ beacons: [makeBeacon("B1", 0, 0), makeBeacon("B2", 12, 0), makeBeacon("B3", 12, 10), makeBeacon("B4", 0, 10)] });
const at = { x: 5, y: 5 };
const run = makeRun({
  id: "a",
  samples: simulateHold(campaign, at, 0, 60, { seed: 1 }),
  references: [
    { t: 0, position: at },
    { t: 60, position: at },
  ],
});
const agg = aggregateRuns([run], campaign, DEFAULT_POSITIONING_CONFIG, DEFAULT_EVALUATION_OPTIONS, [], { iterations: 100, seed: 11 });

describe("statistics export and formatting", () => {
  it("JSON carries seed, iterations and config hash", () => {
    const j = JSON.parse(aggregationToJson(agg, { campaignName: "K", condition: "Markt A", generatedAt: "2026-01-01T00:00:00Z" }));
    expect(j.method.seed).toBe(11);
    expect(j.method.iterations).toBe(100);
    expect(j.method.configHash).toBe(agg.configHash);
    expect(j.condition).toBe("Markt A");
    expect(j.runs).toHaveLength(1);
  });
  it("CSV has one row per run plus two pooled rows with consistent column counts", () => {
    const lines = aggregationToCsv(agg).trim().split("\n");
    expect(lines).toHaveLength(4);
    const n = lines[0].split(",").length;
    for (const l of lines) expect(l.split(",").length).toBe(n);
    expect(lines[0]).toContain("seed,iterations");
  });
  it("formats bracketed intervals in German notation and marks missing intervals", () => {
    expect(fmtBootstrap({ estimate: 2.1, lo: 1.85, hi: 2.41, iterations: 1, blocks: 9, level: 0.95, seed: 1, reason: null }, "LE").text).toBe("2,10 [1,85 – 2,41] LE");
    const nb = fmtBootstrap({ estimate: 2.1, lo: null, hi: null, iterations: 1, blocks: 2, level: 0.95, seed: 1, reason: "zu wenige Blöcke" }, "m");
    expect(nb.text).toBe("2,10 [n. b.] m");
    expect(nb.title).toBe("zu wenige Blöcke");
    expect(fmtProportion({ p: 0.8, lo: 0.49, hi: 0.943, successes: 8, n: 10 }).text).toContain("[49,0 %");
  });
});
