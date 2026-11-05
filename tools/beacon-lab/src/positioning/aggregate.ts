import { fnv1aHex } from "../core/hash";
import type { Campaign, DataOrigin, EvaluationOptions, EvaluationResult, MeasurementRun, PositioningConfig } from "../core/types";
import { runPositioning, MIN_EPOCHS_FOR_CONFIDENCE } from "./pipeline";
import { runHolds } from "./reference";
import { mean, median, std } from "./stats";
import { computeTrackError, type TrackErrorSummary } from "./trackError";
import {
  blockDefinition,
  DEFAULT_BLOCK_SEC,
  DEFAULT_ITERATIONS,
  DEFAULT_LEVEL,
  DEFAULT_SEED,
  makeBlocks,
  metricsWithCI,
  MIN_BLOCKS_FOR_CI,
  type MetricsWithCI,
} from "./uncertainty";

export const MIN_RUNS_FOR_CONFIDENCE = 3;

export interface AggregateOptions {
  seed?: number;
  iterations?: number;
  level?: number;
  blockSec?: number;
}

export interface RunAggregate {
  run: Pick<MeasurementRun, "id" | "name" | "kind" | "origin">;
  result: EvaluationResult;
  /** CI by time blocks WITHIN the run (stationary holds / fixed segments) */
  uncertainty: MetricsWithCI;
  /** only for walk runs with interpolated truth */
  trackError: TrackErrorSummary | null;
}

export interface BetweenRunSpread {
  runs: number;
  /** per-run medians (display unit) and their spread */
  medians: (number | null)[];
  meanOfMedians: number | null;
  medianOfMedians: number | null;
  stdOfMedians: number | null;
  min: number | null;
  max: number | null;
}

export interface Aggregation {
  unit: "m" | "LE";
  perRun: RunAggregate[];
  /** Pooled over ALL epochs of all runs; CI blocks = runs (needs >= 5 runs, else the CI is null). */
  pooledRunLevel: MetricsWithCI;
  /** Pooled over all epochs; CI blocks = time blocks within runs (variability within runs only). */
  pooledBlockLevel: MetricsWithCI;
  /** Which of the two the UI/report shows: run level if >= 5 runs, otherwise block level. */
  primary: "run" | "block";
  spread: BetweenRunSpread;
  exploratory: boolean;
  exploratoryReasons: string[];
  synthetic: boolean;
  origins: DataOrigin[];
  totalEpochsWithTruth: number;
  seed: number;
  iterations: number;
  level: number;
  blockSec: number;
  /** fnv1a over the per-run configHashes + CI options */
  configHash: string;
  config: PositioningConfig;
  warnings: string[];
}

/**
 * Multi-run evaluation: per-run metrics (+ within-run block CI), pooled metrics over all epochs, run-level CI
 * (block = run), between-run spread. Leakage rules are enforced by runPositioning (LeakageError propagates).
 * `options` may be a function to choose reference matching per run kind.
 * "explorativ" if < 3 runs or < 100 epochs with truth in total.
 */
export function aggregateRuns(
  runs: readonly MeasurementRun[],
  campaign: Campaign,
  config: PositioningConfig,
  options: EvaluationOptions | ((run: MeasurementRun) => EvaluationOptions),
  calibrationRuns: readonly MeasurementRun[] = [],
  agg: AggregateOptions = {},
): Aggregation {
  const seed = agg.seed ?? DEFAULT_SEED;
  const iterations = agg.iterations ?? DEFAULT_ITERATIONS;
  const level = agg.level ?? DEFAULT_LEVEL;
  const blockSec = agg.blockSec ?? DEFAULT_BLOCK_SEC;
  const scale = campaign.floorPlan.scale;
  const ciOpts = { seed, iterations, level };

  const blocksOf = (run: MeasurementRun, result: EvaluationResult) => makeBlocks(result.estimates, { kind: run.kind, holds: runHolds(run), blockSec });

  const perRun: RunAggregate[] = [];
  const pooledBlocks: ReturnType<typeof makeBlocks> = [];
  for (const run of runs) {
    const opts = typeof options === "function" ? options(run) : options;
    const result = runPositioning({ run, campaign, config, options: opts, calibrationRuns: [...calibrationRuns] });
    const blocks = blocksOf(run, result);
    pooledBlocks.push(...blocks);
    perRun.push({
      run: { id: run.id, name: run.name, kind: run.kind, origin: run.origin },
      result,
      uncertainty: metricsWithCI(blocks, scale, { ...ciOpts, blockDefinition: blockDefinition(run.kind, blockSec) }),
      trackError: run.kind === "walk" && opts.referenceMatching === "interpolate" ? computeTrackError(result.estimates, scale) : null,
    });
  }

  const pooledRunLevel = metricsWithCI(
    perRun.map((r) => r.result.estimates.filter((e) => e.truth)),
    scale,
    { ...ciOpts, blockDefinition: blockDefinition("run") },
  );
  const pooledBlockLevel = metricsWithCI(pooledBlocks, scale, {
    ...ciOpts,
    blockDefinition: `Blöcke innerhalb der Läufe über alle Läufe gepoolt (stationär: ein Halt; Gehversuch: ${blockSec}-s-Segment)`,
  });
  const primary = perRun.length >= MIN_BLOCKS_FOR_CI ? "run" : "block";

  const medians = perRun.map((r) => r.result.metrics.median);
  const finiteMed = medians.filter((m): m is number => m !== null);
  const spread: BetweenRunSpread = {
    runs: perRun.length,
    medians,
    meanOfMedians: mean(finiteMed),
    medianOfMedians: median(finiteMed),
    stdOfMedians: std(finiteMed),
    min: finiteMed.length ? Math.min(...finiteMed) : null,
    max: finiteMed.length ? Math.max(...finiteMed) : null,
  };

  const total = perRun.reduce((s, r) => s + r.result.metrics.epochsWithTruth, 0);
  const exploratoryReasons: string[] = [];
  if (perRun.length < MIN_RUNS_FOR_CONFIDENCE) exploratoryReasons.push(`nur ${perRun.length} Lauf/Läufe (< ${MIN_RUNS_FOR_CONFIDENCE})`);
  if (total < MIN_EPOCHS_FOR_CONFIDENCE) exploratoryReasons.push(`nur ${total} Epochen mit Referenz (< ${MIN_EPOCHS_FOR_CONFIDENCE})`);
  const origins: DataOrigin[] = [...new Set(perRun.map((r) => r.run.origin))];

  return {
    unit: pooledRunLevel.unit,
    perRun,
    pooledRunLevel,
    pooledBlockLevel,
    primary,
    spread,
    exploratory: exploratoryReasons.length > 0,
    exploratoryReasons,
    synthetic: origins.includes("synthetic"),
    origins,
    totalEpochsWithTruth: total,
    seed,
    iterations,
    level,
    blockSec,
    configHash: fnv1aHex(JSON.stringify({ h: perRun.map((r) => r.result.configHash), seed, iterations, level, blockSec })),
    config,
    warnings: [...new Set(perRun.flatMap((r) => r.result.warnings))],
  };
}
