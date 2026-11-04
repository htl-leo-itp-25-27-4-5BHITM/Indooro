/**
 * Pure numeric helpers for the SVG charts. No React, no DOM – everything here is unit-tested.
 */

/** Colour-blind-friendly categorical palette (Okabe–Ito inspired, harmonised with the Indooro teal/navy). */
export const SERIES_COLORS = [
  "#167768", // Indooro teal
  "#d55e00", // vermillion
  "#0072b2", // blue
  "#cc79a7", // reddish purple
  "#e69f00", // orange-yellow
  "#56b4e9", // sky blue
  "#7a8b00", // olive
  "#6b4fa0", // violet
] as const;

export function seriesColor(i: number): string {
  return SERIES_COLORS[((i % SERIES_COLORS.length) + SERIES_COLORS.length) % SERIES_COLORS.length];
}

/** Number of decimals needed to display multiples of `step` exactly. */
export function decimalsForStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  let d = 0;
  let s = step;
  while (d < 8 && Math.abs(Math.round(s) - s) > 1e-9) {
    s *= 10;
    d++;
  }
  return d;
}

/**
 * "Nice" axis ticks covering [min, max] with roughly `count` ticks.
 * Steps are 1, 2, 5 × 10^k. The returned ticks start at or below `min` and end at or above `max`.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min > max) [min, max] = [max, min];
  if (min === max) {
    const pad = min === 0 ? 1 : Math.abs(min) * 0.1;
    min -= pad;
    max += pad;
  }
  const target = Math.max(2, Math.floor(count));
  const raw = (max - min) / (target - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const start = Math.floor(min / step + 1e-9) * step;
  const end = Math.ceil(max / step - 1e-9) * step;
  const dec = decimalsForStep(step);
  const ticks: number[] = [];
  const n = Math.round((end - start) / step);
  for (let i = 0; i <= n; i++) ticks.push(Number((start + i * step).toFixed(dec)));
  return ticks;
}

export function formatTick(v: number, step?: number): string {
  const d = step !== undefined ? decimalsForStep(step) : Number.isInteger(v) ? 0 : 2;
  const s = v.toFixed(d);
  return s === "-0" ? "0" : s;
}

/** Quantile with linear interpolation (R type 7 / NumPy default / Excel PERCENTILE.INC). `sorted` must be ascending. */
export function quantile7(sorted: number[], p: number): number | null {
  const n = sorted.length;
  if (n === 0) return null;
  if (n === 1) return sorted[0];
  const h = (n - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, n - 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

function finiteSorted(values: readonly number[]): number[] {
  return values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
}

/* ---------------- histogram ---------------- */

export interface HistogramBin {
  x0: number;
  x1: number;
  count: number;
}
export interface HistogramResult {
  bins: HistogramBin[];
  binWidth: number;
  total: number;
}
export type HistogramOptions = ({ binWidth: number; bins?: undefined } | { bins: number; binWidth?: undefined }) & {
  /** fixed range, so that several distributions share identical bins */
  range?: [number, number];
};

/**
 * Histogram with half-open bins [x0, x1); the last bin is closed on the right so the maximum is counted.
 * Non-finite values are ignored.
 */
export function histogram(values: readonly number[], opts: HistogramOptions): HistogramResult {
  const v = finiteSorted(values);
  if (v.length === 0 && !opts.range) return { bins: [], binWidth: opts.binWidth ?? 1, total: 0 };
  const lo = opts.range ? opts.range[0] : v[0];
  const hi = opts.range ? opts.range[1] : v[v.length - 1];
  let width: number;
  let n: number;
  let start: number;
  if (opts.binWidth !== undefined) {
    width = opts.binWidth;
    if (!(width > 0)) throw new Error("binWidth must be > 0");
    // an explicit range fixes the first bin edge exactly; otherwise align edges to multiples of the width
    start = opts.range ? lo : Math.floor(lo / width + 1e-9) * width;
    n = Math.max(1, Math.ceil((hi - start) / width - 1e-9));
  } else {
    n = Math.max(1, Math.floor(opts.bins));
    if (hi === lo) {
      width = 1;
      start = lo - 0.5;
      n = 1;
    } else {
      width = (hi - lo) / n;
      start = lo;
    }
  }
  const bins: HistogramBin[] = [];
  for (let i = 0; i < n; i++) bins.push({ x0: start + i * width, x1: start + (i + 1) * width, count: 0 });
  let total = 0;
  for (const x of v) {
    if (opts.range && (x < opts.range[0] || x > opts.range[1])) continue;
    const idx = Math.min(n - 1, Math.max(0, Math.floor((x - start) / width + 1e-12)));
    bins[idx].count++;
    total++;
  }
  return { bins, binWidth: width, total };
}

/* ---------------- box plot ---------------- */

export interface BoxStats {
  n: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  iqr: number;
  /** most extreme data points within 1.5 × IQR of the box */
  lowerWhisker: number;
  upperWhisker: number;
  outliers: number[];
}

/** Tukey box statistics with type-7 quartiles; outliers lie beyond 1.5 × IQR from the quartiles. */
export function boxStats(values: readonly number[]): BoxStats | null {
  const s = finiteSorted(values);
  if (s.length === 0) return null;
  const q1 = quantile7(s, 0.25) as number;
  const median = quantile7(s, 0.5) as number;
  const q3 = quantile7(s, 0.75) as number;
  const iqr = q3 - q1;
  const lowFence = q1 - 1.5 * iqr;
  const highFence = q3 + 1.5 * iqr;
  const inside = s.filter((x) => x >= lowFence && x <= highFence);
  return {
    n: s.length,
    min: s[0],
    q1,
    median,
    q3,
    max: s[s.length - 1],
    iqr,
    lowerWhisker: inside[0],
    upperWhisker: inside[inside.length - 1],
    outliers: s.filter((x) => x < lowFence || x > highFence),
  };
}

/* ---------------- ECDF ---------------- */

export interface EcdfPoint {
  x: number;
  /** cumulative probability right of (and including) x */
  p: number;
}

/**
 * Empirical CDF as step points (one per distinct value).
 * `total` is the denominator; pass the number of epochs INCLUDING failures to get an end-to-end curve
 * that plateaus below 1 when estimates failed. Default: number of finite values.
 */
export function ecdf(values: readonly number[], total?: number): EcdfPoint[] {
  const s = finiteSorted(values);
  const denom = total ?? s.length;
  if (s.length === 0 || denom <= 0) return [];
  const out: EcdfPoint[] = [];
  for (let i = 0; i < s.length; i++) {
    if (i + 1 < s.length && s[i + 1] === s[i]) continue;
    out.push({ x: s[i], p: (i + 1) / denom });
  }
  return out;
}

/** Fraction of the distribution with value <= x (right-continuous ECDF). */
export function ecdfAt(points: EcdfPoint[], x: number): number {
  let p = 0;
  for (const pt of points) {
    if (pt.x <= x) p = pt.p;
    else break;
  }
  return p;
}

/* ---------------- scales ---------------- */

export interface Scale {
  (v: number): number;
  domain: [number, number];
  range: [number, number];
  invert: (px: number) => number;
  log: boolean;
}

export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const f = ((v: number) => r0 + ((v - d0) / span) * (r1 - r0)) as Scale;
  f.domain = domain;
  f.range = range;
  f.invert = (px: number) => d0 + ((px - r0) / (r1 - r0 || 1)) * span;
  f.log = false;
  return f;
}

export function logScale(domain: [number, number], range: [number, number]): Scale {
  const l0 = Math.log10(Math.max(domain[0], 1e-9));
  const l1 = Math.log10(Math.max(domain[1], 1e-9));
  const lin = linearScale([l0, l1], range);
  const f = ((v: number) => lin(Math.log10(Math.max(v, 1e-9)))) as Scale;
  f.domain = domain;
  f.range = range;
  f.invert = (px: number) => Math.pow(10, lin.invert(px));
  f.log = true;
  return f;
}

/** Decade (1, 2, 5 × 10^k) ticks for a log axis. */
export function logTicks(min: number, max: number): number[] {
  const out: number[] = [];
  const lo = Math.floor(Math.log10(Math.max(min, 1e-9)));
  const hi = Math.ceil(Math.log10(Math.max(max, 1e-9)));
  for (let k = lo; k <= hi; k++) for (const m of [1, 2, 5]) out.push(m * Math.pow(10, k));
  return out.filter((t) => t >= min * 0.999 && t <= max * 1.001);
}

export function extent(values: Iterable<number>): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo <= hi ? [lo, hi] : null;
}

/** Index of the point in ascending `xs` nearest to `x`. */
export function nearestIndex(xs: readonly number[], x: number): number {
  if (xs.length === 0) return -1;
  let lo = 0;
  let hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(xs[lo - 1] - x) <= Math.abs(xs[lo] - x)) return lo - 1;
  return lo;
}
