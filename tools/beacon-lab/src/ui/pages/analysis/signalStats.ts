/**
 * Pure helpers for the RSSI analysis page. Nothing here mutates the raw samples.
 */
import type { MeasurementRun, RssiFilterConfig, RssiSample } from "../../../core/types";
import { filterSamplesPerBeacon, hampel } from "../../../positioning/filters";
import { runHolds } from "../../../positioning/reference";
import { mean, median, std } from "../../../positioning/stats";

/** Gap threshold in seconds above which a pause between packets counts as a gap. */
export const GAP_THRESHOLD_SEC = 2;

export interface BeaconSummary {
  beaconId: string;
  n: number;
  mean: number;
  median: number;
  /** sample std (n-1); null for n = 1 */
  std: number | null;
  min: number;
  max: number;
  /** (n-1) / (t_last - t_first); null if fewer than 2 samples or zero span */
  rateHz: number | null;
  maxGapSec: number | null;
  gapsOver: number;
  spanSec: number;
}

/** Finite samples of one beacon, ordered by t (stable). Returns a NEW array. */
export function beaconSamples(samples: readonly RssiSample[], beaconId: string): RssiSample[] {
  return samples
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.beaconId === beaconId && Number.isFinite(s.t) && Number.isFinite(s.rssi))
    .sort((a, b) => a.s.t - b.s.t || a.i - b.i)
    .map(({ s }) => s);
}

export function summarizeBeacon(beaconId: string, own: readonly RssiSample[], gapThresholdSec = GAP_THRESHOLD_SEC): BeaconSummary | null {
  if (own.length === 0) return null;
  const vals = own.map((s) => s.rssi);
  let maxGap: number | null = null;
  let gapsOver = 0;
  for (let i = 1; i < own.length; i++) {
    const dt = own[i].t - own[i - 1].t;
    if (maxGap === null || dt > maxGap) maxGap = dt;
    if (dt > gapThresholdSec) gapsOver++;
  }
  const span = own[own.length - 1].t - own[0].t;
  return {
    beaconId,
    n: own.length,
    mean: mean(vals) as number,
    median: median(vals) as number,
    std: std(vals),
    // reduce, not Math.min(...vals): a long recording can exceed the engine's argument limit
    min: vals.reduce((a, b) => (b < a ? b : a), Infinity),
    max: vals.reduce((a, b) => (b > a ? b : a), -Infinity),
    rateHz: own.length >= 2 && span > 0 ? (own.length - 1) / span : null,
    maxGapSec: maxGap,
    gapsOver,
    spanSec: span,
  };
}

/** Beacons heard in a run with their sample counts, most frequent first. */
export function heardBeacons(samples: readonly RssiSample[]): { beaconId: string; count: number }[] {
  const m = new Map<string, number>();
  for (const s of samples) if (Number.isFinite(s.rssi) && Number.isFinite(s.t)) m.set(s.beaconId, (m.get(s.beaconId) ?? 0) + 1);
  return [...m.entries()].map(([beaconId, count]) => ({ beaconId, count })).sort((a, b) => b.count - a.count || a.beaconId.localeCompare(b.beaconId));
}

export interface FilterEffect {
  meanShift: number | null;
  stdRaw: number | null;
  stdFiltered: number | null;
  maxAbsDeviation: number | null;
  /** approximate delay of the filtered series vs raw in seconds (cross-correlation lag); null = not determinable */
  delaySec: number | null;
  delaySamples: number | null;
}

const MAX_LAG_SAMPLES = 20;
const MIN_POINTS_FOR_LAG = 20;

function pearsonAtLag(raw: readonly number[], filt: readonly number[], lag: number): number | null {
  // compare filtered[i + lag] with raw[i]
  const n = raw.length - lag;
  if (n < 5) return null;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    sa += filt[i + lag];
    sb += raw[i];
  }
  const ma = sa / n;
  const mb = sb / n;
  let saa = 0;
  let sbb = 0;
  let sab = 0;
  for (let i = 0; i < n; i++) {
    const a = filt[i + lag] - ma;
    const b = raw[i] - mb;
    saa += a * a;
    sbb += b * b;
    sab += a * b;
  }
  if (!(saa > 1e-12) || !(sbb > 1e-12)) return null;
  return sab / Math.sqrt(saa * sbb);
}

/**
 * Effect of a filter on one beacon's series. `delay` is the lag (in samples, converted with the median sample interval)
 * at which the correlation between filtered[i + lag] and raw[i] is highest. It is an APPROXIMATION that assumes roughly
 * regular sampling; for too short or flat series it is reported as null instead of guessing.
 */
export function filterEffect(times: readonly number[], raw: readonly number[], filtered: readonly number[]): FilterEffect {
  const n = Math.min(raw.length, filtered.length);
  if (n === 0) return { meanShift: null, stdRaw: null, stdFiltered: null, maxAbsDeviation: null, delaySec: null, delaySamples: null };
  const r = raw.slice(0, n);
  const f = filtered.slice(0, n);
  let maxDev = 0;
  for (let i = 0; i < n; i++) maxDev = Math.max(maxDev, Math.abs(f[i] - r[i]));
  const mr = mean(r) as number;
  const mf = mean(f) as number;

  let delaySamples: number | null = null;
  let delaySec: number | null = null;
  if (n >= MIN_POINTS_FOR_LAG) {
    let best = -Infinity;
    let bestLag: number | null = null;
    const maxLag = Math.min(MAX_LAG_SAMPLES, Math.floor(n / 4));
    for (let lag = 0; lag <= maxLag; lag++) {
      const c = pearsonAtLag(r, f, lag);
      if (c !== null && c > best + 1e-9) {
        best = c;
        bestLag = lag;
      }
    }
    if (bestLag !== null) {
      const dts: number[] = [];
      for (let i = 1; i < Math.min(n, times.length); i++) dts.push(times[i] - times[i - 1]);
      const dt = median(dts);
      delaySamples = bestLag;
      delaySec = dt !== null && dt > 0 ? bestLag * dt : null;
    }
  }
  return { meanShift: mf - mr, stdRaw: std(r), stdFiltered: std(f), maxAbsDeviation: maxDev, delaySec, delaySamples };
}

export interface FilteredSeries {
  t: number[];
  raw: number[];
  filtered: number[];
}

/** Filters one beacon's samples on a COPY (filterSamplesPerBeacon never mutates). */
export function filterBeaconSeries(own: readonly RssiSample[], cfg: RssiFilterConfig): FilteredSeries {
  const filtered = filterSamplesPerBeacon(own, cfg);
  // `own` is already sanitised and sorted, so lengths and order match.
  return { t: own.map((s) => s.t), raw: own.map((s) => s.rssi), filtered: filtered.map((s) => s.rssi) };
}

/** Number of samples the Hampel filter flags with the given parameters (independent of the on/off toggle). */
export function countHampelOutliers(values: readonly number[], window: number, k: number): number {
  return hampel(values, window, k).outlierIdx.length;
}

export interface PositionGroup {
  key: string;
  label: string;
  values: number[];
}

/** RSSI of one beacon grouped by stationary hold (reference position). Empty if the run has no holds. */
export function groupByHold(run: Pick<MeasurementRun, "kind" | "references" | "samples">, beaconId: string): PositionGroup[] {
  const holds = runHolds(run);
  const own = run.samples.filter((s) => s.beaconId === beaconId && Number.isFinite(s.rssi) && Number.isFinite(s.t));
  const groups = new Map<string, PositionGroup>();
  for (const h of holds) {
    const key = `${h.position.x.toFixed(2)}|${h.position.y.toFixed(2)}`;
    const label = `(${(Math.round(h.position.x * 10) / 10).toLocaleString("de-DE")}; ${(Math.round(h.position.y * 10) / 10).toLocaleString("de-DE")})`;
    const g = groups.get(key) ?? { key, label, values: [] };
    for (const s of own) if (s.t >= h.start && s.t <= h.end) g.values.push(s.rssi);
    groups.set(key, g);
  }
  return [...groups.values()].filter((g) => g.values.length > 0);
}
