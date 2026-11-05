/**
 * Basic descriptive statistics. All functions ignore non-finite values (NaN, +-Infinity) and
 * return `null` when nothing is left. Inputs are never mutated.
 */

function finite(xs: readonly number[]): number[] {
  const out: number[] = [];
  for (const x of xs) if (Number.isFinite(x)) out.push(x);
  return out;
}

export function mean(xs: readonly number[]): number | null {
  const v = finite(xs);
  if (v.length === 0) return null;
  let s = 0;
  for (const x of v) s += x;
  return s / v.length;
}

export function median(xs: readonly number[]): number | null {
  return percentile(xs, 50);
}

/** Sample standard deviation (divisor n-1). `null` for fewer than 2 values. */
export function std(xs: readonly number[]): number | null {
  const v = finite(xs);
  if (v.length < 2) return null;
  const m = mean(v) as number;
  let s = 0;
  for (const x of v) s += (x - m) * (x - m);
  return Math.sqrt(s / (v.length - 1));
}

/**
 * Percentile with linear interpolation between order statistics
 * (Hyndman & Fan type 7 = NumPy `percentile` default = Excel PERCENTILE.INC).
 * h = (n-1) * p/100;  result = x[floor(h)] + (h - floor(h)) * (x[floor(h)+1] - x[floor(h)]).
 * p is clamped to 0..100. Example: [1,2,3,4] -> P90 = 3.7, P95 = 3.85.
 */
export function percentile(xs: readonly number[], p: number): number | null {
  const v = finite(xs).sort((a, b) => a - b);
  if (v.length === 0 || !Number.isFinite(p)) return null;
  const q = Math.min(100, Math.max(0, p)) / 100;
  const h = (v.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.min(v.length - 1, lo + 1);
  return v[lo] + (h - lo) * (v[hi] - v[lo]);
}

export interface Summary {
  n: number;
  mean: number;
  median: number;
  /** sample std; null for n = 1 */
  std: number | null;
  min: number;
  max: number;
  p5: number;
  p95: number;
}

export function summarize(xs: readonly number[]): Summary | null {
  const v = finite(xs);
  if (v.length === 0) return null;
  const sorted = [...v].sort((a, b) => a - b);
  return {
    n: v.length,
    mean: mean(v) as number,
    median: percentile(sorted, 50) as number,
    std: std(v),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p5: percentile(sorted, 5) as number,
    p95: percentile(sorted, 95) as number,
  };
}
