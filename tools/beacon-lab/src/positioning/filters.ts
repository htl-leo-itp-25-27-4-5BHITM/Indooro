import type { RssiFilterConfig, RssiSample } from "../core/types";
import { median } from "./stats";

/**
 * RSSI filters.
 *
 * ALL smoothing filters are CAUSAL: output[i] depends only on input[0..i]. This mirrors a real-time
 * app and guarantees that a filtered value never contains information from the future (no leakage
 * of later samples into earlier epochs).
 *
 * Non-finite input values (NaN/Infinity) are skipped by the filter state: output at such an index is
 * NaN (nothing is fabricated) and the next finite value continues from the previous state.
 */

function windowSize(w: number): number {
  return Number.isFinite(w) ? Math.max(1, Math.floor(w)) : 1;
}

/** Trailing mean of the last `window` finite values. */
function movingAverage(values: readonly number[], window: number): number[] {
  const w = windowSize(window);
  const buf: number[] = [];
  return values.map((v) => {
    if (!Number.isFinite(v)) return NaN;
    buf.push(v);
    if (buf.length > w) buf.shift();
    let s = 0;
    for (const x of buf) s += x;
    return s / buf.length;
  });
}

/** Trailing median of the last `window` finite values. */
function trailingMedian(values: readonly number[], window: number): number[] {
  const w = windowSize(window);
  const buf: number[] = [];
  return values.map((v) => {
    if (!Number.isFinite(v)) return NaN;
    buf.push(v);
    if (buf.length > w) buf.shift();
    return median(buf) as number;
  });
}

/**
 * iOS-like trimmed mean (PositioningPipeline.swift): last `window` values; with >= 5 values the single
 * minimum and single maximum are dropped, the rest averaged.
 */
function trimmedMean(values: readonly number[], window: number): number[] {
  const w = windowSize(window);
  const buf: number[] = [];
  return values.map((v) => {
    if (!Number.isFinite(v)) return NaN;
    buf.push(v);
    if (buf.length > w) buf.shift();
    const sorted = [...buf].sort((a, b) => a - b);
    const used = sorted.length >= 5 ? sorted.slice(1, -1) : sorted;
    let s = 0;
    for (const x of used) s += x;
    return s / used.length;
  });
}

/** Exponential moving average, initialised with the first finite value. alpha clamped to (0,1]. */
function ema(values: readonly number[], alpha: number): number[] {
  const a = Number.isFinite(alpha) ? Math.min(1, Math.max(1e-6, alpha)) : 1;
  let state: number | null = null;
  return values.map((v) => {
    if (!Number.isFinite(v)) return NaN;
    state = state === null ? v : state + a * (v - state);
    return state;
  });
}

/**
 * Scalar random-walk Kalman filter.
 *   predict: x_pred = x,  P_pred = P + q
 *   update : K = P_pred / (P_pred + r);  x = x_pred + K (z - x_pred);  P = (1 - K) P_pred
 * Initialised with the first sample (x = z, P = r). q, r are variances in dB^2.
 */
function kalman(values: readonly number[], q: number, r: number): number[] {
  const qq = Number.isFinite(q) ? Math.max(0, q) : 0;
  const rr = Number.isFinite(r) && r > 0 ? r : 1e-6;
  let x: number | null = null;
  let p = rr;
  return values.map((z) => {
    if (!Number.isFinite(z)) return NaN;
    if (x === null) {
      x = z;
      p = rr;
      return x;
    }
    p += qq;
    const k = p / (p + rr);
    x += k * (z - x);
    p = (1 - k) * p;
    return x;
  });
}

/** Applies the configured causal filter to a value series. Returns a NEW array of the same length. */
export function filterSeries(values: readonly number[], cfg: RssiFilterConfig): number[] {
  switch (cfg.kind) {
    case "none":
      return [...values];
    case "moving-average":
      return movingAverage(values, cfg.window);
    case "ema":
      return ema(values, cfg.alpha);
    case "median":
      return trailingMedian(values, cfg.window);
    case "trimmed-mean":
      return trimmedMean(values, cfg.window);
    case "kalman":
      return kalman(values, cfg.kalmanQ, cfg.kalmanR);
    default:
      return [...values];
  }
}

/** Minimum robust sigma (dB). RSSI is quantised to 1 dB, so MAD is often 0; this floor avoids flagging every wobble. */
export const HAMPEL_MIN_SIGMA_DB = 1;

/**
 * Hampel outlier filter.
 *
 * NOTE: uses a CENTERED window (uses past AND future samples). It is meant for OFFLINE outlier flagging
 * of recorded data. It is therefore not strictly real-time-causal; documented in docs/ALGORITHMS.md.
 * Pipelines that want strict causality should leave it disabled (default).
 *
 * `window` = total window length in samples (half-width = floor(window/2) on each side).
 * A value is an outlier if |x - median(window)| > k * max(1.4826 * MAD, HAMPEL_MIN_SIGMA_DB).
 * Outliers are replaced by the window median; flagged indices are returned.
 */
export function hampel(
  values: readonly number[],
  window: number,
  k: number,
): { values: number[]; outlierIdx: number[] } {
  const out = [...values];
  const outlierIdx: number[] = [];
  const half = Math.max(1, Math.floor(windowSize(window) / 2));
  const kk = Number.isFinite(k) && k > 0 ? k : 3;
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) continue;
    const lo = Math.max(0, i - half);
    const hi = Math.min(values.length - 1, i + half);
    const win: number[] = [];
    for (let j = lo; j <= hi; j++) if (Number.isFinite(values[j])) win.push(values[j]);
    if (win.length < 3) continue;
    const med = median(win) as number;
    const mad = median(win.map((x) => Math.abs(x - med))) as number;
    const sigma = Math.max(1.4826 * mad, HAMPEL_MIN_SIGMA_DB);
    if (Math.abs(values[i] - med) > kk * sigma) {
      out[i] = med;
      outlierIdx.push(i);
    }
  }
  return { values: out, outlierIdx };
}

/**
 * Groups samples by beaconId (ordered by t), optionally applies Hampel first, then the causal filter.
 * Returns NEW sample objects (same t, beaconId, other metadata; filtered rssi), ordered by t then beaconId.
 * Samples with non-finite t or rssi are dropped (they cannot be filtered meaningfully).
 * The input array and its objects are never mutated.
 */
export function filterSamplesPerBeacon(samples: readonly RssiSample[], cfg: RssiFilterConfig): RssiSample[] {
  const groups = new Map<string, RssiSample[]>();
  for (const s of samples) {
    if (!Number.isFinite(s.t) || !Number.isFinite(s.rssi)) continue;
    const g = groups.get(s.beaconId);
    if (g) g.push(s);
    else groups.set(s.beaconId, [s]);
  }
  const out: RssiSample[] = [];
  for (const group of groups.values()) {
    const sorted = group.map((s, idx) => ({ s, idx })).sort((a, b) => a.s.t - b.s.t || a.idx - b.idx).map((e) => e.s);
    let vals = sorted.map((s) => s.rssi);
    if (cfg.outlier?.enabled) vals = hampel(vals, cfg.outlier.window, cfg.outlier.k).values;
    const filtered = filterSeries(vals, cfg);
    for (let i = 0; i < sorted.length; i++) out.push({ ...sorted[i], rssi: filtered[i] });
  }
  out.sort((a, b) => a.t - b.t || (a.beaconId < b.beaconId ? -1 : a.beaconId > b.beaconId ? 1 : 0));
  return out;
}
