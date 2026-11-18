import type { PositionEstimate, Point, ReferencePoint, RssiSample } from "../core/types";

/** One aggregated measurement at a real position. `n` = number of raw observations behind the value. */
export interface HeatPoint {
  position: Point;
  value: number;
  n?: number;
}

export type HeatmapMode = "points" | "binned" | "idw";
export type ColorScaleKind = "sequential" | "error";

/* ------------------------------------------------------------------ */
/* colour ramps (own implementation, colour-blind friendly)            */
/* ------------------------------------------------------------------ */

type RGB = [number, number, number];

/** Viridis-like 9-stop ramp (dark purple -> teal -> yellow). Perceptually ordered, safe for CVD. */
const VIRIDIS: RGB[] = [
  [68, 1, 84],
  [72, 40, 120],
  [62, 74, 137],
  [49, 104, 142],
  [38, 130, 142],
  [31, 158, 137],
  [53, 183, 121],
  [110, 206, 88],
  [181, 222, 43],
  [253, 231, 37],
];

/** Error ramp: low = teal/green, mid = sand/amber, high = red. Lightness decreases towards high errors. */
const ERROR_RAMP: RGB[] = [
  [39, 185, 171],
  [120, 205, 160],
  [226, 213, 130],
  [232, 184, 109],
  [222, 130, 70],
  [180, 35, 24],
];

function lerpStops(stops: RGB[], t: number): RGB {
  const c = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  const pos = c * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(pos));
  const f = pos - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

function hex(rgb: RGB): string {
  return "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

/** t in [0,1] -> "#rrggbb". `kind` "sequential" (viridis-like) or "error" (teal -> amber -> red). */
export function colorRamp(t: number, kind: ColorScaleKind = "sequential"): string {
  return hex(lerpStops(kind === "error" ? ERROR_RAMP : VIRIDIS, t));
}

/** CSS linear-gradient stops for legends. */
export function rampGradientCss(kind: ColorScaleKind, steps = 12): string {
  const parts: string[] = [];
  for (let i = 0; i <= steps; i++) parts.push(`${colorRamp(i / steps, kind)} ${((i / steps) * 100).toFixed(1)}%`);
  return `linear-gradient(90deg, ${parts.join(", ")})`;
}

export function normalize(value: number, min: number, max: number): number {
  if (!(max > min)) return 0.5;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

export function valueRange(values: number[]): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min <= max ? { min, max } : null;
}

/* ------------------------------------------------------------------ */
/* aggregation                                                          */
/* ------------------------------------------------------------------ */

export interface BinnedCell {
  ix: number;
  iy: number;
  /** top-left corner (layout units) */
  x: number;
  y: number;
  size: number;
  /** n-weighted mean of the values in the cell */
  value: number;
  /** number of HeatPoints in the cell */
  points: number;
  /** total raw observations (sum of n) */
  n: number;
}

/** Aggregates points into square cells. Only cells that contain at least one measurement are returned. */
export function binValues(points: HeatPoint[], cellSize: number): BinnedCell[] {
  if (!(cellSize > 0)) return [];
  const map = new Map<string, { ix: number; iy: number; sum: number; w: number; points: number; n: number }>();
  for (const p of points) {
    if (!Number.isFinite(p.value) || !Number.isFinite(p.position.x) || !Number.isFinite(p.position.y)) continue;
    const ix = Math.floor(p.position.x / cellSize + 1e-9);
    const iy = Math.floor(p.position.y / cellSize + 1e-9);
    const key = `${ix}|${iy}`;
    const w = p.n && p.n > 0 ? p.n : 1;
    const cur = map.get(key) ?? { ix, iy, sum: 0, w: 0, points: 0, n: 0 };
    cur.sum += p.value * w;
    cur.w += w;
    cur.points += 1;
    cur.n += w;
    map.set(key, cur);
  }
  return [...map.values()]
    .map((c) => ({ ix: c.ix, iy: c.iy, x: c.ix * cellSize, y: c.iy * cellSize, size: cellSize, value: c.sum / c.w, points: c.points, n: c.n }))
    .sort((a, b) => a.iy - b.iy || a.ix - b.ix);
}

export interface IdwOptions {
  power: number;
  /** only interpolate when at least one real measurement lies within this distance (layout units) */
  maxDistance: number;
}

/**
 * Inverse-distance-weighted value at `p`, using ONLY measurements within `maxDistance`.
 * Returns null if there is none ("keine Daten"). Exactly the sample value if p coincides with a sample.
 */
export function idwAt(points: HeatPoint[], p: Point, opts: IdwOptions): number | null {
  let num = 0;
  let den = 0;
  let any = false;
  for (const s of points) {
    const d = Math.hypot(s.position.x - p.x, s.position.y - p.y);
    if (d > opts.maxDistance) continue;
    if (d < 1e-9) return s.value;
    const w = 1 / Math.pow(d, opts.power);
    num += w * s.value;
    den += w;
    any = true;
  }
  return any ? num / den : null;
}

export interface IdwCell {
  ix: number;
  iy: number;
  x: number;
  y: number;
  size: number;
  /** null = no real measurement within maxDistance of the cell centre -> "keine Daten" */
  value: number | null;
}

export interface IdwGridOptions extends IdwOptions {
  cellSize: number;
  width: number;
  height: number;
}

/** IDW interpolation sampled at cell centres. Cells farther than maxDistance from any measurement are null. */
export function idwGrid(points: HeatPoint[], opts: IdwGridOptions): IdwCell[] {
  const cells: IdwCell[] = [];
  const { cellSize, width, height } = opts;
  if (!(cellSize > 0)) return cells;
  const nx = Math.ceil(width / cellSize);
  const ny = Math.ceil(height / cellSize);
  const valid = points.filter((p) => Number.isFinite(p.value));
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const c = { x: (ix + 0.5) * cellSize, y: (iy + 0.5) * cellSize };
      cells.push({ ix, iy, x: ix * cellSize, y: iy * cellSize, size: cellSize, value: idwAt(valid, c, opts) });
    }
  }
  return cells;
}

/* ------------------------------------------------------------------ */
/* builders from core types                                             */
/* ------------------------------------------------------------------ */

export type TruthAt = (t: number) => Point | null;

const ROUND_STEP = 0.01;

function roundPos(p: Point): Point {
  return { x: Math.round(p.x / ROUND_STEP) * ROUND_STEP, y: Math.round(p.y / ROUND_STEP) * ROUND_STEP };
}

function posKey(p: Point): string {
  return `${p.x.toFixed(2)}|${p.y.toFixed(2)}`;
}

/** Mean RSSI of `beaconId` per distinct (0.01 LE rounded) truth position. */
export function rssiPointsForBeacon(
  samples: RssiSample[],
  _references: ReferencePoint[],
  beaconId: string,
  truthAt: TruthAt,
): HeatPoint[] {
  const acc = new Map<string, { position: Point; sum: number; n: number }>();
  for (const s of samples) {
    if (s.beaconId !== beaconId || !Number.isFinite(s.rssi)) continue;
    const truth = truthAt(s.t);
    if (!truth) continue;
    const position = roundPos(truth);
    const key = posKey(position);
    const cur = acc.get(key) ?? { position, sum: 0, n: 0 };
    cur.sum += s.rssi;
    cur.n += 1;
    acc.set(key, cur);
  }
  return [...acc.values()].map((a) => ({ position: a.position, value: a.sum / a.n, n: a.n }));
}

/** Mean localisation error (layout units) at each distinct truth position. Failed epochs are skipped. */
export function errorPointsFromEstimates(estimates: PositionEstimate[]): HeatPoint[] {
  const acc = new Map<string, { position: Point; sum: number; n: number }>();
  for (const e of estimates) {
    if (!e.truth || e.errorUnits === null || !Number.isFinite(e.errorUnits)) continue;
    const position = roundPos(e.truth);
    const key = posKey(position);
    const cur = acc.get(key) ?? { position, sum: 0, n: 0 };
    cur.sum += e.errorUnits;
    cur.n += 1;
    acc.set(key, cur);
  }
  return [...acc.values()].map((a) => ({ position: a.position, value: a.sum / a.n, n: a.n }));
}

/** Number of distinct beacons (from `beaconIds`) heard at each truth position. */
export function coveragePoints(samples: RssiSample[], truthAt: TruthAt, beaconIds: string[]): HeatPoint[] {
  const allowed = new Set(beaconIds);
  const acc = new Map<string, { position: Point; beacons: Set<string>; n: number }>();
  for (const s of samples) {
    if (!allowed.has(s.beaconId)) continue;
    const truth = truthAt(s.t);
    if (!truth) continue;
    const position = roundPos(truth);
    const key = posKey(position);
    const cur = acc.get(key) ?? { position, beacons: new Set<string>(), n: 0 };
    cur.beacons.add(s.beaconId);
    cur.n += 1;
    acc.set(key, cur);
  }
  return [...acc.values()].map((a) => ({ position: a.position, value: a.beacons.size, n: a.n }));
}

/** Raw sample count at each truth position. */
export function measurementDensity(samples: RssiSample[], truthAt: TruthAt): HeatPoint[] {
  const acc = new Map<string, { position: Point; n: number }>();
  for (const s of samples) {
    const truth = truthAt(s.t);
    if (!truth) continue;
    const position = roundPos(truth);
    const key = posKey(position);
    const cur = acc.get(key) ?? { position, n: 0 };
    cur.n += 1;
    acc.set(key, cur);
  }
  return [...acc.values()].map((a) => ({ position: a.position, value: a.n, n: a.n }));
}
