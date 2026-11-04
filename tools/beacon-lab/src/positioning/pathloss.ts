import type { Campaign, MeasurementRun, PathLossModel, PositioningConfig } from "../core/types";
import { LeakageError } from "./errors";
import { runHolds } from "./reference";

/**
 * Log-distance path-loss model:  RSSI(d) = A - 10 * n * log10(d / 1 m)
 *   A = rssiAt1m (dBm at 1 m), n = pathLossExponent, d in METRES.
 *
 * UNIT NOTE: all distances in this file are METRES. Layout coordinates are in layout units (LE);
 * convert with  distance_units = distance_m / plan.scale.metersPerUnit  (and the inverse
 * distance_m = distance_units * metersPerUnit).
 */

/** d = 10^((A - rssi) / (10 n)) in metres. Returns NaN for non-finite input or n <= 0. */
export function rssiToDistance(rssi: number, m: PathLossModel): number {
  if (!Number.isFinite(rssi) || !Number.isFinite(m.rssiAt1m) || !(m.pathLossExponent > 0)) return NaN;
  return Math.pow(10, (m.rssiAt1m - rssi) / (10 * m.pathLossExponent));
}

/** RSSI(d) in dBm for a distance in metres. NaN for d <= 0 or invalid model. */
export function distanceToRssi(d: number, m: PathLossModel): number {
  if (!Number.isFinite(d) || d <= 0 || !Number.isFinite(m.rssiAt1m) || !Number.isFinite(m.pathLossExponent)) return NaN;
  return m.rssiAt1m - 10 * m.pathLossExponent * Math.log10(d);
}

export const FIT_MIN_DISTANCE_M = 0.1;
export const FIT_MIN_PAIRS = 10;

/**
 * Ordinary least squares of  rssi = A - 10 n log10(d)  (y = a + b x with x = log10 d, b = -10 n).
 * Requirements: pairs with d >= 0.1 m, at least 10 pairs and at least 2 distinct distances
 * (distinct = differ after rounding to mm). Returns an error object for degenerate data or n <= 0.
 * The result has source "fitted" and r2 / residualStdDb (sqrt(SSE/(N-2))) / sampleCount.
 *
 * Caveat: OLS on RSSI vs log-distance assumes homoscedastic Gaussian shadowing and an exact reference
 * distance. Both are approximations; r2 and residualStdDb quantify the misfit, not the truth.
 */
export function fitPathLoss(
  pairs: readonly { distanceM: number; rssi: number }[],
): PathLossModel | { error: string } {
  const valid = pairs.filter((p) => Number.isFinite(p.distanceM) && Number.isFinite(p.rssi) && p.distanceM >= FIT_MIN_DISTANCE_M);
  if (valid.length < FIT_MIN_PAIRS) {
    return { error: `zu wenige Messpaare (${valid.length} < ${FIT_MIN_PAIRS}, Distanz >= ${FIT_MIN_DISTANCE_M} m)` };
  }
  const distinct = new Set(valid.map((p) => Math.round(p.distanceM * 1000)));
  if (distinct.size < 2) return { error: "mindestens 2 verschiedene Distanzen nötig" };

  const n = valid.length;
  let sx = 0;
  let sy = 0;
  for (const p of valid) {
    sx += Math.log10(p.distanceM);
    sy += p.rssi;
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of valid) {
    const dx = Math.log10(p.distanceM) - mx;
    const dy = p.rssi - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (!(sxx > 1e-12)) return { error: "degenerierte Daten (keine Streuung der Distanzen)" };
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const exponent = -slope / 10;
  if (!Number.isFinite(exponent) || !Number.isFinite(intercept)) return { error: "Anpassung numerisch instabil" };
  if (!(exponent > 0)) return { error: `unplausibler Pfadverlustexponent (n = ${exponent.toFixed(2)} <= 0): RSSI nimmt nicht mit der Distanz ab` };

  let sse = 0;
  for (const p of valid) {
    const e = p.rssi - (intercept + slope * Math.log10(p.distanceM));
    sse += e * e;
  }
  const r2 = syy > 1e-12 ? Math.max(0, 1 - sse / syy) : sse < 1e-9 ? 1 : 0;
  const residualStdDb = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
  return {
    rssiAt1m: intercept,
    pathLossExponent: exponent,
    source: "fitted",
    sampleCount: n,
    r2,
    residualStdDb,
  };
}

export interface CalibrationResult {
  model?: PathLossModel;
  perBeacon: Record<string, PathLossModel | { error: string }>;
  error?: string;
  /** German warnings, e.g. unconfirmed scale */
  warnings: string[];
}

/**
 * Fits the path-loss model from CALIBRATION runs with stationary holds.
 *
 * - Throws LeakageError if any run has role !== "calibration" (evaluation data must never calibrate).
 * - For every sample inside a hold (see reference.runHolds) the reference distance is
 *   d_m = |beacon.position - hold.position| * metersPerUnit.
 * - Raw (unfiltered) RSSI is used so that the fit does not depend on the chosen filter / its warm-up;
 *   only samples >= params.rssiThreshold are used.
 * - A global model (all beacons pooled) plus one model per beacon (needs enough own data, else an error entry).
 * - If the scale is not confirmed, metres rely on the "1 cell = 1 m" convention: a warning is added.
 */
export function calibrateFromRuns(
  runs: readonly MeasurementRun[],
  campaign: Campaign,
  cfg: PositioningConfig,
): CalibrationResult {
  for (const r of runs) {
    if (r.role !== "calibration") {
      throw new LeakageError(`Lauf „${r.name}“ (${r.id}) hat die Rolle „${r.role}“ und darf nicht zur Kalibrierung verwendet werden.`);
    }
  }
  const warnings: string[] = [];
  const scale = campaign.floorPlan.scale;
  const mpu = scale.metersPerUnit;
  if (!scale.confirmed) {
    warnings.push(
      "Maßstab nicht bestätigt: Referenzdistanzen in Metern beruhen auf der Konvention „1 Zelle = 1 m“ bzw. dem eingetragenen Wert. Das Modell ist nur so gut wie dieser Maßstab.",
    );
  }
  if (!(Number.isFinite(mpu) && mpu > 0)) {
    return { perBeacon: {}, error: "ungültiger Maßstab (metersPerUnit <= 0)", warnings };
  }
  if (runs.length === 0) return { perBeacon: {}, error: "keine Kalibrierungsläufe", warnings };

  const beaconById = new Map(campaign.beacons.map((b) => [b.id, b]));
  const global: { distanceM: number; rssi: number }[] = [];
  const per = new Map<string, { distanceM: number; rssi: number }[]>();
  let holdCount = 0;
  for (const run of runs) {
    const holds = runHolds(run);
    holdCount += holds.length;
    for (const s of run.samples) {
      if (!Number.isFinite(s.t) || !Number.isFinite(s.rssi) || s.rssi < cfg.params.rssiThreshold) continue;
      const b = beaconById.get(s.beaconId);
      if (!b || !Number.isFinite(b.position.x) || !Number.isFinite(b.position.y)) continue;
      const hold = holds.find((h) => s.t >= h.start && s.t <= h.end);
      if (!hold) continue;
      const d = Math.hypot(b.position.x - hold.position.x, b.position.y - hold.position.y) * mpu;
      const pair = { distanceM: d, rssi: s.rssi };
      global.push(pair);
      const arr = per.get(b.id);
      if (arr) arr.push(pair);
      else per.set(b.id, [pair]);
    }
  }
  if (holdCount === 0) {
    return { perBeacon: {}, error: "keine stationären Haltepunkte (identische aufeinanderfolgende Referenzpunkte) gefunden", warnings };
  }
  const runIds = runs.map((r) => r.id);
  const perBeacon: Record<string, PathLossModel | { error: string }> = {};
  for (const b of campaign.beacons) {
    const pairs = per.get(b.id) ?? [];
    const fit = fitPathLoss(pairs);
    perBeacon[b.id] = "error" in fit ? fit : { ...fit, fittedOnRunIds: runIds };
  }
  const g = fitPathLoss(global);
  if ("error" in g) return { perBeacon, error: g.error, warnings };
  return { model: { ...g, fittedOnRunIds: runIds }, perBeacon, warnings };
}
