import { describe, expect, it } from "vitest";
import { DEFAULT_EVALUATION_OPTIONS, DEFAULT_POSITIONING_CONFIG } from "../core/defaults";
import type { Campaign, MeasurementRun, PositioningConfig } from "../core/types";
import { aggregateRuns } from "./aggregate";
import { LeakageError } from "./pipeline";
import { makeBeacon, makeCampaign, makeRun, simulateHold, simulatePath } from "./testutil";

const campaign: Campaign = makeCampaign({ beacons: [makeBeacon("B1", 0, 0), makeBeacon("B2", 12, 0), makeBeacon("B3", 12, 10), makeBeacon("B4", 0, 10)] });
const config: PositioningConfig = { ...DEFAULT_POSITIONING_CONFIG, algorithm: "weighted-centroid" };

function hold(id: string, at: { x: number; y: number }, seconds: number, seed: number): MeasurementRun {
  return makeRun({
    id,
    kind: "stationary",
    samples: simulateHold(campaign, at, 0, seconds, { seed }),
    references: [
      { t: 0, position: at },
      { t: seconds, position: at },
    ],
  });
}
function walkRun(id: string): MeasurementRun {
  const pos = (t: number) => ({ x: 2 + 0.2 * t, y: 5 });
  return makeRun({
    id,
    kind: "walk",
    samples: simulatePath(campaign, pos, 0, 40, { seed: 3 }),
    references: [
      { t: 0, position: pos(0) },
      { t: 40, position: pos(40) },
    ],
  });
}
const opts = (run: MeasurementRun) => ({ ...DEFAULT_EVALUATION_OPTIONS, referenceMatching: run.kind === "walk" ? ("interpolate" as const) : ("hold-or-nearest" as const) });

describe("aggregateRuns", () => {
  const runs = [hold("a", { x: 4, y: 4 }, 60, 1), hold("b", { x: 8, y: 6 }, 60, 2), walkRun("w")];
  const agg = aggregateRuns(runs, campaign, config, opts, [], { iterations: 200 });

  it("pooled counts equal the sum of the per-run counts", () => {
    const sum = (k: "epochsWithTruth" | "validEstimates" | "failedEstimates") => agg.perRun.reduce((s, r) => s + r.result.metrics[k], 0);
    for (const k of ["epochsWithTruth", "validEstimates", "failedEstimates"] as const) {
      expect(agg.pooledRunLevel.metrics[k]).toBe(sum(k));
      expect(agg.pooledBlockLevel.metrics[k]).toBe(sum(k));
    }
    expect(agg.totalEpochsWithTruth).toBe(sum("epochsWithTruth"));
    expect(agg.pooledRunLevel.failureRate.n).toBe(sum("epochsWithTruth"));
  });
  it("uses run-level blocks (null CI < 5 runs) and falls back to time blocks as primary", () => {
    expect(agg.pooledRunLevel.blocks).toBe(3);
    expect(agg.pooledRunLevel.median.lo).toBeNull();
    expect(agg.primary).toBe("block");
    expect(agg.pooledBlockLevel.median.lo).not.toBeNull();
  });
  it("computes spread, track error for walk runs only, and is deterministic", () => {
    expect(agg.spread.runs).toBe(3);
    expect(agg.spread.min!).toBeLessThanOrEqual(agg.spread.max!);
    expect(agg.perRun.map((r) => r.trackError !== null)).toEqual([false, false, true]);
    const again = aggregateRuns(runs, campaign, config, opts, [], { iterations: 200 });
    expect(again.pooledBlockLevel.median).toEqual(agg.pooledBlockLevel.median);
    expect(again.configHash).toBe(agg.configHash);
  });
  it("flags exploratory for < 3 runs or < 100 epochs", () => {
    expect(agg.exploratory).toBe(false);
    const two = aggregateRuns(runs.slice(0, 2), campaign, config, opts, [], { iterations: 50 });
    expect(two.exploratory).toBe(true);
    expect(two.exploratoryReasons.join(" ")).toContain("2 Lauf");
    const tiny = aggregateRuns([hold("t", { x: 4, y: 4 }, 10, 1)], campaign, config, opts, [], { iterations: 50 });
    expect(tiny.exploratoryReasons.join(" ")).toContain("Epochen");
  });
  it("propagates LeakageError", () => {
    const cal = makeRun({ id: "cal", role: "calibration" });
    expect(() => aggregateRuns([cal], campaign, config, opts)).toThrow(LeakageError);
    expect(() => aggregateRuns([runs[0]], campaign, config, opts, [makeRun({ id: "evx", role: "evaluation" })])).toThrow(LeakageError);
  });
});
