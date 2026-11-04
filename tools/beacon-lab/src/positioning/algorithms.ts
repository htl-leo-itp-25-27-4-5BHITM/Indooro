import type { AlgorithmId, AlgorithmParams, Beacon, FloorPlan, PathLossModel, Point } from "../core/types";
import { rssiToDistance } from "./pathloss";

/**
 * Positioning algorithms with a common interface. All are pure functions over one epoch.
 * Coordinates are LAYOUT UNITS. Path-loss distances are METRES:
 *     distance_units = distance_m / plan.scale.metersPerUnit
 * Failure reasons are German. No algorithm throws; failures return { position: null, reason }.
 */

export interface EpochInput {
  t: number;
  observations: { beaconId: string; rssi: number }[];
}

export interface Fingerprint {
  position: Point;
  rssi: Record<string, number>;
  runId: string;
}

export interface AlgorithmContext {
  beacons: Beacon[];
  plan: FloorPlan;
  /** campaign-wide model; a beacon's own `pathLoss` takes precedence */
  pathLoss: PathLossModel;
  params: AlgorithmParams;
  /** only from calibration runs */
  fingerprints?: Fingerprint[];
}

export type AlgorithmOutput = { position: Point } | { position: null; reason: string };

export interface PositioningAlgorithm {
  id: AlgorithmId;
  name: string;
  description: string;
  requires: { calibration: boolean; fingerprints: boolean; minBeacons: number };
  estimate(input: EpochInput, ctx: AlgorithmContext): AlgorithmOutput;
}

/* ------------------------------------------------------------------ */
/* shared preparation                                                  */
/* ------------------------------------------------------------------ */

interface Obs {
  beacon: Beacon;
  rssi: number;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Selects usable observations: finite RSSI, >= rssiThreshold, known + enabled beacon with finite position,
 * one observation per beacon (first in beaconId order), then the topK strongest (0 = all).
 * Result sorted by RSSI descending, ties by beaconId ascending (deterministic).
 */
export function prepareObservations(input: EpochInput, ctx: AlgorithmContext): Obs[] {
  const byId = new Map(ctx.beacons.map((b) => [b.id, b]));
  const seen = new Set<string>();
  const thr = Number.isFinite(ctx.params.rssiThreshold) ? ctx.params.rssiThreshold : -Infinity;
  const out: Obs[] = [];
  const sorted = [...input.observations].sort((a, b) => cmp(a.beaconId, b.beaconId));
  for (const o of sorted) {
    if (!Number.isFinite(o.rssi) || o.rssi < thr || seen.has(o.beaconId)) continue;
    const b = byId.get(o.beaconId);
    if (!b || !b.enabled || !Number.isFinite(b.position.x) || !Number.isFinite(b.position.y)) continue;
    seen.add(o.beaconId);
    out.push({ beacon: b, rssi: o.rssi });
  }
  out.sort((a, b) => b.rssi - a.rssi || cmp(a.beacon.id, b.beacon.id));
  const k = ctx.params.topK;
  return Number.isFinite(k) && k > 0 ? out.slice(0, Math.floor(k)) : out;
}

function minNeeded(alg: number, ctx: AlgorithmContext): number {
  const m = Number.isFinite(ctx.params.minBeacons) ? Math.floor(ctx.params.minBeacons) : 1;
  return Math.max(alg, m, 1);
}

function tooFew(n: number, need: number): AlgorithmOutput {
  return { position: null, reason: `zu wenige Beacons (${n} < ${need})` };
}

/* ------------------------------------------------------------------ */
/* strongest beacon                                                    */
/* ------------------------------------------------------------------ */

/**
 * Position of the beacon with the highest RSSI. Ties -> the lowest beaconId (string order).
 * Needs 1 beacon.
 */
const strongestBeacon: PositioningAlgorithm = {
  id: "strongest-beacon",
  name: "Stärkster Beacon",
  description: "Position des Beacons mit dem höchsten RSSI (Nähe-Verfahren). Bei Gleichstand der Beacon mit der kleinsten ID.",
  requires: { calibration: false, fingerprints: false, minBeacons: 1 },
  estimate(input, ctx) {
    const obs = prepareObservations(input, ctx);
    const need = minNeeded(1, ctx);
    if (obs.length < need) return tooFew(obs.length, need);
    return { position: { ...obs[0].beacon.position } };
  },
};

/* ------------------------------------------------------------------ */
/* weighted centroid                                                   */
/* ------------------------------------------------------------------ */

/**
 * Weighted centroid with POWER weights:
 *   p_i = 10^(rssi_i/10) (linear received power, mW),  w_i = p_i^g,  g = params.weightExponent (>= 0)
 *   position = sum(w_i * pos_i) / sum(w_i)
 * Since p ~ d^-n, w ~ d^(-n*g): g = 1/n gives inverse-distance weighting, g = 1 power weighting (strongly
 * favours the nearest beacon), g = 0 the plain centroid. Computed as 10^(g*(rssi_i - rssi_max)/10) for
 * numerical stability (identical result after normalisation).
 */
const weightedCentroid: PositioningAlgorithm = {
  id: "weighted-centroid",
  name: "Gewichteter Schwerpunkt",
  description: "Schwerpunkt der Beacon-Positionen, gewichtet mit der linearen Empfangsleistung hoch g (g = weightExponent).",
  requires: { calibration: false, fingerprints: false, minBeacons: 1 },
  estimate(input, ctx) {
    const obs = prepareObservations(input, ctx);
    const need = minNeeded(1, ctx);
    if (obs.length < need) return tooFew(obs.length, need);
    const g = Number.isFinite(ctx.params.weightExponent) ? Math.max(0, ctx.params.weightExponent) : 1;
    return { position: centroidOf(obs.map((o) => ({ p: o.beacon.position, w: Math.pow(10, (g * (o.rssi - obs[0].rssi)) / 10) }))) };
  },
};

function centroidOf(items: { p: Point; w: number }[]): Point {
  let sw = 0;
  let sx = 0;
  let sy = 0;
  for (const it of items) {
    sw += it.w;
    sx += it.w * it.p.x;
    sy += it.w * it.p.y;
  }
  return { x: sx / sw, y: sy / sw };
}

/* ------------------------------------------------------------------ */
/* trilateration                                                       */
/* ------------------------------------------------------------------ */

/** Smallest sqrt(lambda2/lambda1) of the beacon position scatter that still counts as non-collinear. */
export const COLLINEARITY_RATIO = 0.01;
const TRILATERATION_MAX_ITER = 20;

/** Ratio of the principal standard deviations of the 2D point set (0 = collinear / coincident). */
export function geometryRatio(points: readonly Point[]): number {
  const n = points.length;
  if (n < 2) return 0;
  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p.x;
    my += p.y;
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
    syy += (p.y - my) ** 2;
  }
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc;
  const l2 = Math.max(0, tr / 2 - disc);
  if (!(l1 > 1e-12)) return 0;
  return Math.sqrt(l2 / l1);
}

interface Range {
  p: Point;
  d: number; // layout units
  w: number; // static weight
}

function huberCost(r: number, delta: number): number {
  const a = Math.abs(r);
  return delta > 0 && a > delta ? delta * (a - delta / 2) : 0.5 * r * r;
}

function totalCost(x: Point, rs: readonly Range[], delta: number): number {
  let c = 0;
  for (const r of rs) c += r.w * huberCost(Math.hypot(x.x - r.p.x, x.y - r.p.y) - r.d, delta);
  return c;
}

const LS_WARMUP_ITER = 6;

interface LmResult {
  x: Point;
  converged: boolean;
  nan: boolean;
}

/**
 * Levenberg-Marquardt / IRLS for  min_x sum_i w_i rho(|x - a_i| - d_i), rho = Huber(delta) (delta = 0: squared loss).
 * Only cost-reducing steps are accepted. Converged = step < tol, negligible cost gain, or no improving step exists.
 */
function levenbergMarquardt(x0: Point, rs: readonly Range[], delta: number, maxIter: number, tol: number): LmResult {
  let x = x0;
  let cost = totalCost(x, rs, delta);
  let lambda = 1e-3;
  let converged = false;
  for (let iter = 0; iter < maxIter && !converged; iter++) {
    let h00 = 0;
    let h01 = 0;
    let h11 = 0;
    let g0 = 0;
    let g1 = 0;
    for (const r of rs) {
      const dx = x.x - r.p.x;
      const dy = x.y - r.p.y;
      const dist = Math.max(Math.hypot(dx, dy), 1e-9);
      const res = dist - r.d;
      const hw = delta > 0 && Math.abs(res) > delta ? delta / Math.abs(res) : 1;
      const w = r.w * hw;
      const ux = dx / dist;
      const uy = dy / dist;
      h00 += w * ux * ux;
      h01 += w * ux * uy;
      h11 += w * uy * uy;
      g0 += w * ux * res;
      g1 += w * uy * res;
    }
    if (![h00, h01, h11, g0, g1].every(Number.isFinite)) return { x, converged: false, nan: true };
    let accepted = false;
    for (let tries = 0; tries < 12; tries++) {
      const a = h00 + lambda * Math.max(h00, 1e-12);
      const d = h11 + lambda * Math.max(h11, 1e-12);
      const det = a * d - h01 * h01;
      if (!(Math.abs(det) > 1e-18)) {
        lambda *= 10;
        continue;
      }
      const sx = (d * g0 - h01 * g1) / det;
      const sy = (-h01 * g0 + a * g1) / det;
      const cand = { x: x.x - sx, y: x.y - sy };
      const c = totalCost(cand, rs, delta);
      if (Number.isFinite(c) && c <= cost) {
        const gain = cost - c;
        x = cand;
        cost = c;
        lambda = Math.max(1e-9, lambda / 3);
        accepted = true;
        if (Math.hypot(sx, sy) < tol || gain < 1e-14 * Math.max(1, cost)) converged = true;
        break;
      }
      lambda *= 4;
    }
    // no cost-reducing step exists => (numerical) minimum reached
    if (!accepted) converged = true;
  }
  return { x, converged, nan: false };
}

/**
 * Trilateration from path-loss distances.
 *  1. d_m = rssiToDistance (beacon's own model, else ctx.pathLoss), clamped to [distanceClampMinM, distanceClampMaxM];
 *     d_units = d_m / metersPerUnit.
 *  2. Seed: inverse-distance weighted centroid (like BeaconPositionSolver.swift).
 *  3. Levenberg-Marquardt on  sum_i w_i * rho(|x - a_i| - d_i)  with Huber rho (delta = huberDeltaM / metersPerUnit;
 *     0 = plain least squares), static weight w_i = 1/max(d_i, 0.4 m) (distance error grows with distance),
 *     iteratively reweighted. Max 20 iterations in total (first 6 as plain least squares warm-up when Huber is on).
 *     Only cost-reducing steps are accepted.
 *  4. Requires >= 3 beacons AND non-collinear geometry (sqrt(lambda2/lambda1) of the position scatter >= 0.01).
 * Fails with a reason on degenerate geometry, invalid scale / model, NaN or non-convergence.
 * Position is NOT clamped to the plan (an outside position is a visible symptom, not hidden).
 */
const trilateration: PositioningAlgorithm = {
  id: "trilateration",
  name: "Trilateration (Pfadverlust)",
  description:
    "Distanzen aus dem Pfadverlustmodell, robuste (Huber) nichtlineare Ausgleichsrechnung per Levenberg-Marquardt, Startwert gewichteter Schwerpunkt. Braucht ≥ 3 Beacons in nicht-kollinearer Anordnung.",
  requires: { calibration: true, fingerprints: false, minBeacons: 3 },
  estimate(input, ctx) {
    const obs = prepareObservations(input, ctx);
    const need = minNeeded(3, ctx);
    if (obs.length < need) return tooFew(obs.length, need);
    const mpu = ctx.plan.scale.metersPerUnit;
    if (!(Number.isFinite(mpu) && mpu > 0)) return { position: null, reason: "ungültiger Maßstab (metersPerUnit <= 0)" };
    const dMin = Number.isFinite(ctx.params.distanceClampMinM) && ctx.params.distanceClampMinM > 0 ? ctx.params.distanceClampMinM : 0.35;
    const dMax = Number.isFinite(ctx.params.distanceClampMaxM) && ctx.params.distanceClampMaxM >= dMin ? ctx.params.distanceClampMaxM : Math.max(dMin, 11);

    const ranges: Range[] = [];
    for (const o of obs) {
      const dm = rssiToDistance(o.rssi, o.beacon.pathLoss ?? ctx.pathLoss);
      if (!Number.isFinite(dm)) return { position: null, reason: `ungültiges Pfadverlustmodell (Beacon ${o.beacon.id})` };
      const clamped = Math.min(dMax, Math.max(dMin, dm));
      ranges.push({ p: o.beacon.position, d: clamped / mpu, w: 1 / Math.max(clamped, 0.4) });
    }
    if (geometryRatio(ranges.map((r) => r.p)) < COLLINEARITY_RATIO) {
      return { position: null, reason: "degenerierte Geometrie (Beacons kollinear)" };
    }

    const delta = Number.isFinite(ctx.params.huberDeltaM) && ctx.params.huberDeltaM > 0 ? ctx.params.huberDeltaM / mpu : 0;
    const seed = centroidOf(ranges.map((r) => ({ p: r.p, w: 1 / Math.max(r.d, 1e-9) })));
    const tol = 1e-5 * Math.max(1, ...ranges.map((r) => r.d));

    // Stage 1: plain least squares (a few iterations) brings the estimate close to the data;
    // stage 2: Huber IRLS from there converges quickly when most residuals are small (and at once for
    // consistent data). Starting Huber directly from the centroid can crawl (Weiszfeld-like) on large residuals.
    let sol: LmResult;
    if (delta > 0) {
      const warm = levenbergMarquardt(seed, ranges, 0, LS_WARMUP_ITER, tol);
      if (warm.nan) return { position: null, reason: "numerisch instabil (NaN in der Ausgleichsrechnung)" };
      sol = levenbergMarquardt(warm.x, ranges, delta, TRILATERATION_MAX_ITER - LS_WARMUP_ITER, tol);
    } else {
      sol = levenbergMarquardt(seed, ranges, 0, TRILATERATION_MAX_ITER, tol);
    }
    if (sol.nan || !Number.isFinite(sol.x.x) || !Number.isFinite(sol.x.y)) {
      return { position: null, reason: "numerisch instabil (NaN in der Ausgleichsrechnung)" };
    }
    if (!sol.converged) return { position: null, reason: "Ausgleichsrechnung nicht konvergiert (20 Iterationen)" };
    return { position: sol.x };
  },
};

/* ------------------------------------------------------------------ */
/* kNN fingerprinting                                                  */
/* ------------------------------------------------------------------ */

const KNN_EPS = 1e-3;

/**
 * k-nearest-neighbour fingerprinting in signal space (dBm).
 * Distance between the observed vector and a fingerprint = Euclidean over the union of beacon ids
 * (observed after thresholding/topK, plus the fingerprint's own beacons that are known and enabled);
 * a beacon missing on one side counts as `knnMissingRssi`.
 * Estimate = sum(w_j * pos_j) / sum(w_j) over the k nearest fingerprints, w_j = 1/(dist_j + 1e-3).
 * Needs fingerprints from CALIBRATION runs only (ctx.fingerprints).
 */
const knnFingerprint: PositioningAlgorithm = {
  id: "knn-fingerprint",
  name: "kNN-Fingerprinting",
  description: "Vergleicht den gemessenen RSSI-Vektor mit Kalibrier-Fingerprints (euklidisch in dBm) und mittelt die k ähnlichsten Orte.",
  requires: { calibration: false, fingerprints: true, minBeacons: 1 },
  estimate(input, ctx) {
    const fps = ctx.fingerprints ?? [];
    if (fps.length === 0) return { position: null, reason: "keine Fingerprints (Kalibrierungsläufe mit Haltepunkten nötig)" };
    const obs = prepareObservations(input, ctx);
    const need = minNeeded(1, ctx);
    if (obs.length < need) return tooFew(obs.length, need);
    const missing = Number.isFinite(ctx.params.knnMissingRssi) ? ctx.params.knnMissingRssi : -105;
    const observed = new Map(obs.map((o) => [o.beacon.id, o.rssi]));
    const usable = new Set(ctx.beacons.filter((b) => b.enabled).map((b) => b.id));
    const scored: { d: number; fp: Fingerprint }[] = [];
    for (const fp of fps) {
      if (!Number.isFinite(fp.position.x) || !Number.isFinite(fp.position.y)) continue;
      const ids = new Set<string>(observed.keys());
      for (const id of Object.keys(fp.rssi)) if (usable.has(id)) ids.add(id);
      let s = 0;
      for (const id of ids) {
        const a = observed.get(id) ?? missing;
        const rawF = usable.has(id) ? fp.rssi[id] : undefined;
        const f = Number.isFinite(rawF) ? (rawF as number) : missing;
        s += (a - f) * (a - f);
      }
      scored.push({ d: Math.sqrt(s), fp });
    }
    if (scored.length === 0) return { position: null, reason: "keine gültigen Fingerprints" };
    scored.sort((a, b) => a.d - b.d || cmp(a.fp.runId, b.fp.runId));
    const k = Math.max(1, Math.floor(Number.isFinite(ctx.params.knnK) ? ctx.params.knnK : 3));
    const top = scored.slice(0, k);
    return { position: centroidOf(top.map((t) => ({ p: t.fp.position, w: 1 / (t.d + KNN_EPS) }))) };
  },
};

export const ALGORITHMS: Record<AlgorithmId, PositioningAlgorithm> = {
  "strongest-beacon": strongestBeacon,
  "weighted-centroid": weightedCentroid,
  trilateration,
  "knn-fingerprint": knnFingerprint,
};
