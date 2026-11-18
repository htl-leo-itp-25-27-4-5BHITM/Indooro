import type { Point } from "../core/types";

/** Seconds -> "mm:ss.s" (relative time). */
export function formatRelTime(sec: number): string {
  if (!Number.isFinite(sec)) return "–";
  const sign = sec < 0 ? "-" : "";
  const a = Math.abs(sec);
  const m = Math.floor(a / 60);
  const s = a - m * 60;
  return `${sign}${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}

/** Epoch seconds -> ISO string; null if t looks like a relative time. */
export function formatAbsTime(t: number): string | null {
  if (!Number.isFinite(t) || t <= 1e9) return null;
  const d = new Date(t * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export interface Segment {
  points: Point[];
}

/**
 * Splits a time series of optional positions into polyline segments. A new segment starts after a
 * missing position (failed estimate) or when the time gap exceeds `maxGapSec`.
 * If `maxGapSec` is omitted, 3x the median time step is used (so regular sampling never breaks).
 */
export function splitSegments(items: { t: number; p: Point | null }[], maxGapSec?: number): Point[][] {
  const sorted = [...items].sort((a, b) => a.t - b.t);
  let gap = maxGapSec;
  if (gap === undefined) {
    const dts: number[] = [];
    for (let i = 1; i < sorted.length; i++) dts.push(sorted[i].t - sorted[i - 1].t);
    dts.sort((a, b) => a - b);
    const med = dts.length ? dts[Math.floor(dts.length / 2)] : 0;
    gap = med > 0 ? med * 3 : Infinity;
  }
  const out: Point[][] = [];
  let cur: Point[] = [];
  let lastT: number | null = null;
  for (const it of sorted) {
    if (!it.p) {
      if (cur.length) out.push(cur);
      cur = [];
      lastT = null;
      continue;
    }
    if (lastT !== null && it.t - lastT > gap) {
      if (cur.length) out.push(cur);
      cur = [];
    }
    cur.push(it.p);
    lastT = it.t;
  }
  if (cur.length) out.push(cur);
  return out;
}

export interface Hold {
  start: number;
  end: number;
  position: Point;
  count: number;
}

/** Groups consecutive reference points at the same position (within `eps` LE) into stationary holds. */
export function groupHolds(refs: { t: number; position: Point }[], eps = 0.01): Hold[] {
  const sorted = [...refs].sort((a, b) => a.t - b.t);
  const out: Hold[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && Math.hypot(last.position.x - r.position.x, last.position.y - r.position.y) <= eps) {
      last.end = r.t;
      last.count += 1;
    } else {
      out.push({ start: r.t, end: r.t, position: r.position, count: 1 });
    }
  }
  return out;
}
