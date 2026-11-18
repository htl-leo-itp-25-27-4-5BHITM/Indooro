/** Small German number formatting helpers shared by the analysis pages. */

export function fmt(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  return v.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPct(fraction: number | null | undefined, digits = 1): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return "–";
  return `${(fraction * 100).toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
}

/** Categorical chart palette (colour-blind friendly order). */
export const SERIES_COLORS = ["#167768", "#d97706", "#3b6fb6", "#b4376b", "#6b7d12", "#7c4dbd", "#0e7490", "#a16207"];

export function seriesColor(i: number): string {
  return SERIES_COLORS[i % SERIES_COLORS.length];
}

/** Keeps at most `max` evenly spaced elements (first and last always kept). */
export function decimate<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max || max < 2) return [...items];
  const out: T[] = [];
  const step = (items.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(items[Math.round(i * step)]);
  return out;
}
