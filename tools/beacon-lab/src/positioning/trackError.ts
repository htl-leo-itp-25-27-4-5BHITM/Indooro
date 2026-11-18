import type { MapScale, PositionEstimate } from "../core/types";
import { distanceUnit, toDisplayDistance } from "../core/units";
import { mean, median, percentile } from "./stats";

/**
 * Along-track / cross-track decomposition of the position error for WALK runs with (interpolated) truth.
 *
 * Local direction u at epoch i = unit vector from the truth of the previous to the truth of the next epoch
 * with truth (central difference; one-sided at the ends). error vector e = estimate - truth.
 *   along = e · u          signed; > 0: estimate AHEAD of the truth (in walking direction), < 0: lagging behind
 *   cross = e · n, n = (-uy, ux)   signed; > 0: to the RIGHT of the walking direction (layout y points down)
 * Epochs are skipped (and counted) if the truth hardly moves (local speed < minSpeed, i.e. stationary
 * segments, where a direction is undefined), the neighbours are further apart than maxGapSec, or there is
 * no estimate. Values are in the display unit (metres only if the scale is confirmed, otherwise LE).
 */
export interface TrackErrorOptions {
  /** minimal local truth speed in layout units per second; default 0.2 */
  minSpeedUnitsPerSec?: number;
  /** maximal time between the two neighbouring truth points; default 5 s */
  maxGapSec?: number;
}

export interface TrackErrorPoint {
  t: number;
  along: number;
  cross: number;
}

export interface TrackErrorStat {
  mean: number | null;
  medianAbs: number | null;
  p95Abs: number | null;
}

export interface TrackErrorSummary {
  unit: "m" | "LE";
  /** epochs used */
  n: number;
  skippedStationary: number;
  skippedNoDirection: number;
  skippedNoEstimate: number;
  along: TrackErrorStat;
  cross: TrackErrorStat;
  points: TrackErrorPoint[];
}

const stat = (xs: number[]): TrackErrorStat => {
  const abs = xs.map(Math.abs);
  return { mean: mean(xs), medianAbs: median(abs), p95Abs: percentile(abs, 95) };
};

export function computeTrackError(estimates: readonly PositionEstimate[], scale: MapScale, opts: TrackErrorOptions = {}): TrackErrorSummary {
  const minSpeed = opts.minSpeedUnitsPerSec ?? 0.2;
  const maxGap = opts.maxGapSec ?? 5;
  const withTruth = estimates.filter((e) => e.truth && Number.isFinite(e.t)).sort((a, b) => a.t - b.t);
  const points: TrackErrorPoint[] = [];
  let skippedStationary = 0;
  let skippedNoDirection = 0;
  let skippedNoEstimate = 0;
  for (let i = 0; i < withTruth.length; i++) {
    const e = withTruth[i];
    if (!e.position) {
      skippedNoEstimate++;
      continue;
    }
    const prev = withTruth[Math.max(0, i - 1)];
    const next = withTruth[Math.min(withTruth.length - 1, i + 1)];
    const dt = next.t - prev.t;
    if (!(dt > 0) || dt > maxGap) {
      skippedNoDirection++;
      continue;
    }
    const dx = next.truth!.x - prev.truth!.x;
    const dy = next.truth!.y - prev.truth!.y;
    const len = Math.hypot(dx, dy);
    if (!(len / dt >= minSpeed)) {
      skippedStationary++;
      continue;
    }
    const ux = dx / len;
    const uy = dy / len;
    const ex = e.position.x - e.truth!.x;
    const ey = e.position.y - e.truth!.y;
    const along = toDisplayDistance(ex * ux + ey * uy, scale);
    const cross = toDisplayDistance(-ex * uy + ey * ux, scale);
    if (Number.isFinite(along) && Number.isFinite(cross)) points.push({ t: e.t, along, cross });
    else skippedNoDirection++;
  }
  return {
    unit: distanceUnit(scale),
    n: points.length,
    skippedStationary,
    skippedNoDirection,
    skippedNoEstimate,
    along: stat(points.map((p) => p.along)),
    cross: stat(points.map((p) => p.cross)),
    points,
  };
}
