import { distanceUnit, toDisplayDistance } from "../core/units";
import type { DynamicMetrics, ErrorMetrics, MapScale, PositionEstimate, ReferencePoint } from "../core/types";
import { makeTruthResolver, stationaryHolds, type Hold } from "./reference";
import { mean, median, percentile } from "./stats";

/**
 * Error metrics. See docs/METRICS.md for the full definitions.
 *
 * Unit policy: all distances are converted with `toDisplayDistance` (metres only if scale.confirmed, else
 * layout units "LE"). The `within*` thresholds 2 / 3 / 5 are expressed in that SAME display unit: with an
 * unconfirmed scale "within2" means "error <= 2 LE", not 2 m.
 */
export const WITHIN_THRESHOLDS = [2, 3, 5] as const;

function errorUnitsOf(e: PositionEstimate): number | null {
  if (!e.position || !e.truth) return null;
  if (e.errorUnits !== null && Number.isFinite(e.errorUnits)) return e.errorUnits;
  const d = Math.hypot(e.position.x - e.truth.x, e.position.y - e.truth.y);
  return Number.isFinite(d) ? d : null;
}

/**
 * Denominators (end-to-end vs conditional view):
 *  - epochsWithTruth = estimates with truth !== null.
 *  - validEstimates  = of those, estimates with a position (and finite error).
 *  - failedEstimates = epochsWithTruth - validEstimates; failureRate = failed / epochsWithTruth.
 *  - mean/median/rmse/p90/p95/max: over valid estimates only (conditional on success).
 *  - within2/3/5: valid-and-within / epochsWithTruth (failures count as NOT within).
 * With epochsWithTruth = 0: counts are 0, failureRate = 0 (check epochsWithTruth!), all others null.
 */
export function computeErrorMetrics(est: readonly PositionEstimate[], scale: MapScale): ErrorMetrics {
  const unit = distanceUnit(scale);
  let withTruth = 0;
  const errs: number[] = [];
  for (const e of est) {
    if (!e.truth) continue;
    withTruth++;
    const u = errorUnitsOf(e);
    if (u !== null) errs.push(toDisplayDistance(u, scale));
  }
  const valid = errs.length;
  const failed = withTruth - valid;
  const within = (thr: number): number | null => (withTruth === 0 ? null : errs.filter((x) => x <= thr).length / withTruth);
  return {
    unit,
    epochsWithTruth: withTruth,
    validEstimates: valid,
    failedEstimates: failed,
    failureRate: withTruth === 0 ? 0 : failed / withTruth,
    mean: mean(errs),
    median: median(errs),
    rmse: valid === 0 ? null : Math.sqrt(errs.reduce((s, x) => s + x * x, 0) / valid),
    p90: percentile(errs, 90),
    p95: percentile(errs, 95),
    max: valid === 0 ? null : errs.reduce((a, b) => (b > a ? b : a), -Infinity),
    within2: within(WITHIN_THRESHOLDS[0]),
    within3: within(WITHIN_THRESHOLDS[1]),
    within5: within(WITHIN_THRESHOLDS[2]),
  };
}

/**
 * Empirical CDF of the error in the display unit. p = rank / epochsWithTruth, i.e. the same denominator
 * as within*: failures never reach the curve, so it plateaus at (1 - failureRate).
 * Points: one per valid estimate, sorted by error.
 */
export function errorCdf(est: readonly PositionEstimate[], scale: MapScale): { x: number; p: number }[] {
  let withTruth = 0;
  const errs: number[] = [];
  for (const e of est) {
    if (!e.truth) continue;
    withTruth++;
    const u = errorUnitsOf(e);
    if (u !== null) errs.push(toDisplayDistance(u, scale));
  }
  errs.sort((a, b) => a - b);
  return errs.map((x, i) => ({ x, p: (i + 1) / withTruth }));
}

export const LAG_RANGE_SEC = 3;
export const LAG_STEP_SEC = 0.1;
export const LAG_MIN_POINTS = 10;

export interface DynamicOptions {
  /** speed above which a step counts as a jump, in display unit per second (m/s if scale confirmed, else LE/s). Default 2. */
  jumpSpeedMps?: number;
  /** maximum time between two consecutive valid estimates for a step to count. Default 2 s. */
  maxGapSec?: number;
  /** compute lag (walk runs with interpolated truth only). Default false. */
  lag?: boolean;
  /** holds to use for stationary precision/bias; default: derived from refs (identical consecutive refs). */
  holds?: Hold[];
}

/**
 * Dynamic metrics on the FINAL (temporally filtered) positions.
 *  - pairs: consecutive valid estimates (failures in between are skipped) with 0 < dt <= maxGapSec.
 *  - speed = displayDistance(step) / dt; a jump if speed > jumpSpeedMps. jumpRate = jumps / pairs.
 *  - meanStepDistance: mean step length of those pairs (display unit).
 *  - lagSec: tau in [-3, 3] s (step 0.1 s) minimising mean |est(t) - truth(t - tau)| with LINEAR-INTERPOLATED
 *    truth; positive tau = the estimate lags behind reality. Evaluated on one fixed set of estimates (those whose
 *    t - tau stays inside the reference time range for every tau); null if fewer than 10 such points or the
 *    references do not move. ASSUMPTION: constant speed between references.
 *  - stationaryPrecision: pooled RMS distance of estimates to their own hold centroid (holds with >= 2 estimates).
 *    stationaryBias: mean distance centroid -> hold truth over those holds. Both in display unit.
 */
export function computeDynamicMetrics(
  est: readonly PositionEstimate[],
  refs: readonly ReferencePoint[],
  scale: MapScale,
  opts: DynamicOptions = {},
): DynamicMetrics {
  const unit = distanceUnit(scale);
  const jumpThr = opts.jumpSpeedMps !== undefined && Number.isFinite(opts.jumpSpeedMps) ? opts.jumpSpeedMps : 2;
  const maxGap = opts.maxGapSec !== undefined && Number.isFinite(opts.maxGapSec) ? opts.maxGapSec : 2;

  const valid = est
    .filter((e) => e.position && Number.isFinite(e.position.x) && Number.isFinite(e.position.y) && Number.isFinite(e.t))
    .sort((a, b) => a.t - b.t);

  let pairs = 0;
  let jumps = 0;
  const steps: number[] = [];
  for (let i = 1; i < valid.length; i++) {
    const a = valid[i - 1];
    const b = valid[i];
    const dt = b.t - a.t;
    if (!(dt > 0) || dt > maxGap) continue;
    const dist = toDisplayDistance(Math.hypot(b.position!.x - a.position!.x, b.position!.y - a.position!.y), scale);
    pairs++;
    steps.push(dist);
    if (dist / dt > jumpThr) jumps++;
  }

  // stationary precision / bias
  const holds = opts.holds ?? stationaryHolds(refs);
  let sumSq = 0;
  let nPooled = 0;
  const biases: number[] = [];
  for (const h of holds) {
    const pts = valid.filter((e) => e.t >= h.start && e.t <= h.end).map((e) => e.position!);
    if (pts.length < 2) continue;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    for (const p of pts) {
      const d = toDisplayDistance(Math.hypot(p.x - cx, p.y - cy), scale);
      sumSq += d * d;
      nPooled++;
    }
    biases.push(toDisplayDistance(Math.hypot(cx - h.position.x, cy - h.position.y), scale));
  }

  return {
    unit,
    pairs,
    jumps,
    jumpRate: pairs === 0 ? null : jumps / pairs,
    jumpSpeedThreshold: jumpThr,
    meanStepDistance: mean(steps),
    lagSec: opts.lag ? estimateLag(valid, refs) : null,
    stationaryPrecision: nPooled === 0 ? null : Math.sqrt(sumSq / nPooled),
    stationaryBias: mean(biases),
  };
}

function estimateLag(valid: readonly PositionEstimate[], refs: readonly ReferencePoint[]): number | null {
  const truth = makeTruthResolver(refs, { referenceMatching: "interpolate", toleranceSec: 0 });
  const rs = refs.filter((r) => Number.isFinite(r.t)).sort((a, b) => a.t - b.t);
  if (rs.length < 2) return null;
  // references must actually move
  let path = 0;
  for (let i = 1; i < rs.length; i++) path += Math.hypot(rs[i].position.x - rs[i - 1].position.x, rs[i].position.y - rs[i - 1].position.y);
  if (!(path > 0)) return null;
  const lo = rs[0].t + LAG_RANGE_SEC;
  const hi = rs[rs.length - 1].t - LAG_RANGE_SEC;
  const pts = valid.filter((e) => e.t >= lo && e.t <= hi);
  if (pts.length < LAG_MIN_POINTS) return null;
  let best = Infinity;
  let bestTau: number | null = null;
  const nSteps = Math.round(LAG_RANGE_SEC / LAG_STEP_SEC);
  for (let k = -nSteps; k <= nSteps; k++) {
    const tau = k * LAG_STEP_SEC;
    let sum = 0;
    let n = 0;
    for (const e of pts) {
      const tr = truth(e.t - tau);
      if (!tr) continue;
      sum += Math.hypot(e.position!.x - tr.x, e.position!.y - tr.y);
      n++;
    }
    if (n < LAG_MIN_POINTS) continue;
    const m = sum / n;
    if (m < best - 1e-12) {
      best = m;
      bestTau = Math.round(tau * 10) / 10;
    }
  }
  return bestTau;
}
