import type { EvaluationOptions, MeasurementRun, Point, ReferencePoint } from "../core/types";

/** Two reference positions closer than this (layout units) count as "identical" (device did not move). */
export const HOLD_EPS_UNITS = 1e-6;

export interface Hold {
  start: number;
  end: number;
  position: Point;
}

function validRefs(refs: readonly ReferencePoint[]): ReferencePoint[] {
  return refs
    .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.position?.x) && Number.isFinite(r.position?.y))
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.t - b.r.t || a.i - b.i)
    .map((e) => e.r);
}

/**
 * Stationary holds: >= 2 CONSECUTIVE reference points with identical position (|delta| < 1e-6)
 * form a hold [t_first, t_last]. Convention: identical consecutive references mean "the device stood
 * still in between" (this is how stationary measurement protocols are recorded). Holds are never merged
 * across different positions.
 */
export function stationaryHolds(refs: readonly ReferencePoint[]): Hold[] {
  const sorted = validRefs(refs);
  const holds: Hold[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (
      j + 1 < sorted.length &&
      Math.abs(sorted[j + 1].position.x - sorted[i].position.x) < HOLD_EPS_UNITS &&
      Math.abs(sorted[j + 1].position.y - sorted[i].position.y) < HOLD_EPS_UNITS
    ) {
      j++;
    }
    if (j > i) {
      holds.push({ start: sorted[i].t, end: sorted[j].t, position: { ...sorted[i].position } });
    }
    i = j + 1;
  }
  return holds;
}

/**
 * Holds of a run. Like `stationaryHolds`, plus one ASSUMPTION: a run of kind "stationary" with exactly one
 * reference point (or only one distinct t) is treated as a single hold over the whole sample time range,
 * because a stationary run by definition never moves.
 */
export function runHolds(run: Pick<MeasurementRun, "kind" | "references" | "samples">): Hold[] {
  const holds = stationaryHolds(run.references);
  if (holds.length > 0) return holds;
  const refs = validRefs(run.references);
  if (run.kind === "stationary" && refs.length === 1) {
    const ts = run.samples.map((s) => s.t).filter(Number.isFinite);
    if (ts.length === 0) return [];
    let lo = Infinity;
    let hi = -Infinity;
    for (const t of ts) {
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
    return [{ start: Math.min(lo, refs[0].t), end: Math.max(hi, refs[0].t), position: { ...refs[0].position } }];
  }
  return [];
}

export type TruthResolver = (t: number) => Point | null;

/** Precomputes holds/sorted refs once; use this when resolving many epochs. */
export function makeTruthResolver(refs: readonly ReferencePoint[], opts: EvaluationOptions, holdsOverride?: Hold[]): TruthResolver {
  const sorted = validRefs(refs);
  const holds = holdsOverride ?? stationaryHolds(sorted);
  const tol = Number.isFinite(opts.toleranceSec) ? Math.max(0, opts.toleranceSec) : 0;

  const inHold = (t: number): Point | null => {
    for (const h of holds) if (t >= h.start && t <= h.end) return { ...h.position };
    return null;
  };

  // index of first ref with ref.t >= t
  const lowerBound = (t: number): number => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid].t < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  return (t: number): Point | null => {
    if (!Number.isFinite(t) || sorted.length === 0) return null;
    const h = inHold(t);
    if (h) return h;
    const idx = lowerBound(t);
    if (opts.referenceMatching === "interpolate") {
      if (idx >= sorted.length) return null; // after last reference
      const next = sorted[idx];
      if (next.t === t) return { ...next.position };
      if (idx === 0) return null; // before first reference
      const prev = sorted[idx - 1];
      const span = next.t - prev.t;
      if (!(span > 0)) return null;
      const f = (t - prev.t) / span;
      return {
        x: prev.position.x + f * (next.position.x - prev.position.x),
        y: prev.position.y + f * (next.position.y - prev.position.y),
      };
    }
    // hold-or-nearest
    let best: ReferencePoint | null = null;
    let bestD = Infinity;
    for (const c of [sorted[idx - 1], sorted[idx]]) {
      if (!c) continue;
      const d = Math.abs(c.t - t);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best && bestD <= tol ? { ...best.position } : null;
  };
}

/**
 * Ground truth at time t.
 *  - "hold-or-nearest": inside a stationary hold -> hold position; otherwise the nearest reference
 *    within `toleranceSec` -> its position; else null.
 *  - "interpolate": inside a hold -> hold position; between two consecutive references -> LINEAR
 *    interpolation; before the first / after the last reference -> null.
 *    ASSUMPTION: constant walking speed along the straight segment between two references. The real
 *    path may deviate (turns, stops); interpolated truth is therefore itself uncertain.
 */
export function truthAt(t: number, refs: readonly ReferencePoint[], opts: EvaluationOptions): Point | null {
  return makeTruthResolver(refs, opts)(t);
}
