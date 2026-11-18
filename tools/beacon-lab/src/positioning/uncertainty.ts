import { mulberry32 } from "../core/random";
import type { ErrorMetrics, MapScale, PositionEstimate } from "../core/types";
import { distanceUnit, toDisplayDistance } from "../core/units";
import { computeErrorMetrics, WITHIN_THRESHOLDS } from "./metrics";
import type { Hold } from "./reference";
import { mean, median, percentile } from "./stats";

/**
 * Statistical uncertainty: Wilson intervals for proportions and BLOCK bootstrap for error statistics.
 * Pure and deterministic (seeded mulberry32); inputs are never mutated. See docs/METRICS.md.
 */

export const MIN_BLOCKS_FOR_CI = 5;
export const DEFAULT_ITERATIONS = 2000;
export const DEFAULT_LEVEL = 0.95;
export const DEFAULT_SEED = 20260101;
export const DEFAULT_BLOCK_SEC = 10;
export const TOO_FEW_BLOCKS_REASON = "zu wenige Blöcke";

/* ------------------------------------------------------------------ */
/* Wilson                                                              */
/* ------------------------------------------------------------------ */

export interface WilsonInterval {
  successes: number;
  n: number;
  /** observed proportion successes / n */
  p: number;
  lo: number;
  hi: number;
  z: number;
}

/**
 * Wilson score interval for a binomial proportion.
 *   centre = (p + z²/2n) / (1 + z²/n),  half = z·sqrt(p(1-p)/n + z²/4n²) / (1 + z²/n).
 * n = 0 (or invalid input) -> null. Example: 8/10 at z = 1.96 -> [0.490, 0.943].
 * NOTE: assumes independent trials; consecutive epochs are autocorrelated, so the interval is
 * optimistic (too narrow) when applied to epochs of one run.
 */
export function wilsonInterval(successes: number, n: number, z = 1.96): WilsonInterval | null {
  if (!Number.isFinite(successes) || !Number.isFinite(n) || n <= 0 || successes < 0 || successes > n) return null;
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { successes, n, p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half), z };
}

/** Two-sided standard normal quantile for the common levels (nearest of 80/90/95/99 %, default 95 %). */
export function zForLevel(level: number): number {
  const table: [number, number][] = [
    [0.8, 1.2816],
    [0.9, 1.6449],
    [0.95, 1.96],
    [0.99, 2.5758],
  ];
  let best = table[0];
  for (const t of table) if (Math.abs(t[0] - level) < Math.abs(best[0] - level)) best = t;
  return best[1];
}

/* ------------------------------------------------------------------ */
/* Block bootstrap                                                     */
/* ------------------------------------------------------------------ */

export interface BootstrapOptions {
  iterations?: number;
  seed?: number;
  level?: number;
}

export interface BootstrapCI {
  estimate: number | null;
  lo: number | null;
  hi: number | null;
  iterations: number;
  /** number of non-empty blocks */
  blocks: number;
  level: number;
  seed: number;
  /** why lo/hi are null (e.g. "zu wenige Blöcke"); null if the interval exists */
  reason: string | null;
}

export type Statistic = (values: number[]) => number | null;

/**
 * Block bootstrap (percentile interval) for several statistics at once, on the SAME resamples.
 * Blocks (not single epochs) are resampled with replacement because consecutive epochs are
 * autocorrelated: resampling epochs would pretend n independent observations and give intervals that are
 * far too narrow. Empty blocks are dropped. < 5 non-empty blocks -> lo/hi null, reason "zu wenige Blöcke".
 */
export function blockBootstrapCIs<K extends string>(
  blocks: readonly (readonly number[])[],
  statistics: Record<K, Statistic>,
  opts: BootstrapOptions = {},
): Record<K, BootstrapCI> {
  const iterations = Math.max(1, Math.floor(opts.iterations ?? DEFAULT_ITERATIONS));
  const seed = opts.seed ?? DEFAULT_SEED;
  const level = opts.level !== undefined && opts.level > 0 && opts.level < 1 ? opts.level : DEFAULT_LEVEL;
  const data = blocks.map((b) => b.filter((x) => Number.isFinite(x))).filter((b) => b.length > 0);
  const all = data.flat();
  const keys = Object.keys(statistics) as K[];
  const out = {} as Record<K, BootstrapCI>;
  const base = (k: K): BootstrapCI => ({
    estimate: all.length === 0 ? null : statistics[k]([...all]),
    lo: null,
    hi: null,
    iterations,
    blocks: data.length,
    level,
    seed,
    reason: null,
  });
  if (data.length < MIN_BLOCKS_FOR_CI) {
    for (const k of keys) out[k] = { ...base(k), reason: TOO_FEW_BLOCKS_REASON };
    return out;
  }
  const rng = mulberry32(seed);
  const reps: Record<string, number[]> = {};
  for (const k of keys) reps[k] = [];
  const B = data.length;
  for (let it = 0; it < iterations; it++) {
    const sample: number[] = [];
    for (let j = 0; j < B; j++) {
      const blk = data[Math.floor(rng() * B)];
      for (let i = 0; i < blk.length; i++) sample.push(blk[i]);
    }
    for (const k of keys) {
      const v = statistics[k]([...sample]);
      if (v !== null && Number.isFinite(v)) reps[k].push(v);
    }
  }
  const alpha = (1 - level) / 2;
  for (const k of keys) {
    const r = reps[k];
    out[k] = { ...base(k), lo: percentile(r, alpha * 100), hi: percentile(r, (1 - alpha) * 100), reason: r.length === 0 ? "keine gültigen Wiederholungen" : null };
  }
  return out;
}

/** Single-statistic convenience wrapper around `blockBootstrapCIs`. */
export function blockBootstrapCI(blocks: readonly (readonly number[])[], statistic: Statistic, opts: BootstrapOptions = {}): BootstrapCI {
  return blockBootstrapCIs(blocks, { s: statistic }, opts).s;
}

/* ------------------------------------------------------------------ */
/* Blocks from estimates                                               */
/* ------------------------------------------------------------------ */

export interface BlockOptions {
  /** "stationary": one block per hold; "walk": fixed time segments. */
  kind: "stationary" | "walk";
  /** holds (stationary runs); epochs outside any hold fall back to time segments */
  holds?: readonly Hold[];
  /** segment length in seconds, default 10 */
  blockSec?: number;
}

/**
 * Splits the estimates of ONE run into blocks (only estimates with truth are kept).
 *  - stationary: one block per hold (device stood still at one spot = one coherent measurement); epochs
 *    outside holds go into fixed time segments.
 *  - walk: fixed time segments of `blockSec` (default 10 s) counted from the first estimate with truth.
 * Failures stay in their block (they count for the failure rate).
 */
export function makeBlocks(estimates: readonly PositionEstimate[], opts: BlockOptions): PositionEstimate[][] {
  const blockSec = opts.blockSec !== undefined && opts.blockSec > 0 ? opts.blockSec : DEFAULT_BLOCK_SEC;
  const withTruth = estimates.filter((e) => e.truth && Number.isFinite(e.t)).sort((a, b) => a.t - b.t);
  if (withTruth.length === 0) return [];
  const t0 = withTruth[0].t;
  const holds = opts.kind === "stationary" ? opts.holds ?? [] : [];
  const map = new Map<string, PositionEstimate[]>();
  for (const e of withTruth) {
    const hi = holds.findIndex((h) => e.t >= h.start && e.t <= h.end);
    const key = hi >= 0 ? `h${hi}` : `s${Math.floor((e.t - t0) / blockSec)}`;
    const arr = map.get(key);
    if (arr) arr.push(e);
    else map.set(key, [e]);
  }
  return [...map.values()];
}

export function blockDefinition(kind: "stationary" | "walk" | "run", blockSec = DEFAULT_BLOCK_SEC): string {
  if (kind === "run") return "Block = ein Messlauf";
  if (kind === "stationary") return `Block = ein stationärer Halt (Epochen außerhalb von Halten: feste ${blockSec}-s-Segmente)`;
  return `Block = festes ${blockSec}-s-Zeitsegment des Laufs`;
}

/* ------------------------------------------------------------------ */
/* Metrics with CI                                                     */
/* ------------------------------------------------------------------ */

export interface ProportionCI {
  /** observed proportion (null if n = 0) */
  p: number | null;
  lo: number | null;
  hi: number | null;
  successes: number;
  n: number;
}

export interface MetricsWithCI {
  unit: "m" | "LE";
  /** point metrics over all epochs of all blocks (identical to computeErrorMetrics on the flattened estimates) */
  metrics: ErrorMetrics;
  mean: BootstrapCI;
  median: BootstrapCI;
  p90: BootstrapCI;
  p95: BootstrapCI;
  within2: ProportionCI;
  within3: ProportionCI;
  within5: ProportionCI;
  failureRate: ProportionCI;
  blocks: number;
  blockDefinition: string;
  iterations: number;
  seed: number;
  level: number;
}

export interface MetricsCIOptions extends BootstrapOptions {
  blockDefinition?: string;
}

function errUnits(e: PositionEstimate): number | null {
  if (!e.position || !e.truth) return null;
  if (e.errorUnits !== null && Number.isFinite(e.errorUnits)) return e.errorUnits;
  const d = Math.hypot(e.position.x - e.truth.x, e.position.y - e.truth.y);
  return Number.isFinite(d) ? d : null;
}

function prop(successes: number, n: number, z: number): ProportionCI {
  const w = wilsonInterval(successes, n, z);
  return { p: n === 0 ? null : successes / n, lo: w?.lo ?? null, hi: w?.hi ?? null, successes, n };
}

/**
 * Bootstrap CIs (mean/median/P90/P95, conditional on a valid estimate, like computeErrorMetrics) and Wilson
 * CIs (within 2/3/5 and failureRate; failures count as "not within", denominators = epochs with truth).
 * `blocks`: estimates grouped into blocks (see `makeBlocks`, or one block per run). Display unit follows the
 * scale (metres only if confirmed, otherwise LE); the within thresholds are in that same unit.
 */
export function metricsWithCI(blocks: readonly (readonly PositionEstimate[])[], scale: MapScale, opts: MetricsCIOptions = {}): MetricsWithCI {
  const level = opts.level !== undefined && opts.level > 0 && opts.level < 1 ? opts.level : DEFAULT_LEVEL;
  const z = zForLevel(level);
  const flat = blocks.flat();
  const metrics = computeErrorMetrics(flat, scale);
  const errBlocks = blocks.map((b) => {
    const out: number[] = [];
    for (const e of b) {
      if (!e.truth) continue;
      const u = errUnits(e);
      if (u !== null) out.push(toDisplayDistance(u, scale));
    }
    return out;
  });
  const all = errBlocks.flat();
  const ci = blockBootstrapCIs(
    errBlocks,
    { mean: (v) => mean(v), median: (v) => median(v), p90: (v) => percentile(v, 90), p95: (v) => percentile(v, 95) },
    opts,
  );
  const n = metrics.epochsWithTruth;
  const cnt = (thr: number) => all.filter((x) => x <= thr).length;
  return {
    unit: distanceUnit(scale),
    metrics,
    ...ci,
    within2: prop(cnt(WITHIN_THRESHOLDS[0]), n, z),
    within3: prop(cnt(WITHIN_THRESHOLDS[1]), n, z),
    within5: prop(cnt(WITHIN_THRESHOLDS[2]), n, z),
    failureRate: prop(metrics.failedEstimates, n, z),
    blocks: ci.median.blocks,
    blockDefinition: opts.blockDefinition ?? "Block = vorgegebene Gruppe",
    iterations: ci.median.iterations,
    seed: ci.median.seed,
    level,
  };
}
