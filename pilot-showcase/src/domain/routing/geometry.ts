/**
 * Path presentation helpers: corner simplification, rounded-corner smoothing (quadratic corners)
 * and arc-length parameterisation for animation. All coordinates in metres; a cell (x, y) is
 * represented by its centre (x + 0.5, y + 0.5). Heading is in degrees, 0 = east, 90 = south
 * (screen coordinates, y down).
 */
import type { Cell } from "../types";

export interface Point {
  x: number;
  y: number;
}

export interface Pose extends Point {
  /** degrees, 0 = east, y down */
  heading: number;
}

export interface RouteGeometry {
  /** SVG path data of the smoothed route. */
  d: string;
  /** Flattened polyline (dense enough for arc-length work). */
  points: Point[];
  /** cumulative[i] = arc length at points[i]. */
  cumulative: number[];
  length: number;
  /** Position and heading after walking `distance` metres (clamped to 0..length). */
  pointAt(distance: number): Pose;
  /**
   * Arc length of the polyline point nearest to `p`, searching only at or after `fromDistance`
   * (useful for routes that cross themselves).
   */
  distanceOf(p: Point, fromDistance?: number): number;
}

const centre = (c: Cell): Point => ({ x: c.x + 0.5, y: c.y + 0.5 });

/** Reduces a 4-connected cell path to its corner points (cell centres): start, turns, end. */
export function simplifyPath(path: readonly Cell[]): Point[] {
  const pts: Point[] = [];
  for (const c of path) {
    const p = centre(c);
    const last = pts[pts.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    pts.push(p);
  }
  if (pts.length <= 2) return pts;
  const out: Point[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
    if (cross === 0 && dot > 0) continue; // collinear, same direction
    out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

interface Corner {
  p: Point;
  /** entry / exit points of the rounded corner, null = sharp vertex */
  from: Point | null;
  to: Point | null;
}

function cornersOf(points: readonly Point[], radius: number): Corner[] {
  return points.map((p, i) => {
    if (i === 0 || i === points.length - 1) return { p, from: null, to: null };
    const a = points[i - 1];
    const c = points[i + 1];
    const la = Math.hypot(a.x - p.x, a.y - p.y);
    const lc = Math.hypot(c.x - p.x, c.y - p.y);
    const ux = (a.x - p.x) / la;
    const uy = (a.y - p.y) / la;
    const vx = (c.x - p.x) / lc;
    const vy = (c.y - p.y) / lc;
    if (ux * vx + uy * vy < -0.999 || ux * vx + uy * vy > 0.999) return { p, from: null, to: null }; // straight or U-turn
    // an adjacent corner may use the other half of a shared segment
    const r = Math.min(radius, la / 2, lc / 2);
    return { p, from: { x: p.x + ux * r, y: p.y + uy * r }, to: { x: p.x + vx * r, y: p.y + vy * r } };
  });
}

const f = (n: number) => Math.round(n * 1000) / 1000;

/** SVG path `d` through the corner points with quadratic rounded corners (radius in metres). */
export function roundedPathD(points: readonly Point[], radius = 0.9): string {
  if (points.length === 0) return "";
  const cs = cornersOf(points, Math.min(radius, 0.9));
  let d = `M${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 1; i < cs.length; i++) {
    const c = cs[i];
    if (c.from && c.to) d += ` L${f(c.from.x)} ${f(c.from.y)} Q${f(c.p.x)} ${f(c.p.y)} ${f(c.to.x)} ${f(c.to.y)}`;
    else d += ` L${f(c.p.x)} ${f(c.p.y)}`;
  }
  if (points.length === 1) d += ` L${f(points[0].x)} ${f(points[0].y)}`;
  return d;
}

const CURVE_STEPS = 10;

function flatten(points: readonly Point[], radius: number): Point[] {
  const cs = cornersOf(points, Math.min(radius, 0.9));
  const out: Point[] = [];
  for (const c of cs) {
    if (c.from && c.to) {
      out.push(c.from);
      for (let s = 1; s < CURVE_STEPS; s++) {
        const t = s / CURVE_STEPS;
        const u = 1 - t;
        out.push({
          x: u * u * c.from.x + 2 * u * t * c.p.x + t * t * c.to.x,
          y: u * u * c.from.y + 2 * u * t * c.p.y + t * t * c.to.y
        });
      }
      out.push(c.to);
    } else out.push(c.p);
  }
  return out;
}

/** Builds smoothed geometry with arc-length parameterisation from a cell path. */
export function buildRouteGeometry(path: readonly Cell[], radius = 0.9): RouteGeometry {
  const corners = simplifyPath(path);
  const points = flatten(corners, radius);
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const length = cumulative[cumulative.length - 1] ?? 0;

  const headingOf = (i: number): number => {
    // segment i → i+1; skip zero-length segments
    for (let k = Math.min(i, points.length - 2); k >= 0; k--) {
      const dx = points[k + 1].x - points[k].x;
      const dy = points[k + 1].y - points[k].y;
      if (dx !== 0 || dy !== 0) return (Math.atan2(dy, dx) * 180) / Math.PI;
    }
    for (let k = i; k < points.length - 1; k++) {
      const dx = points[k + 1].x - points[k].x;
      const dy = points[k + 1].y - points[k].y;
      if (dx !== 0 || dy !== 0) return (Math.atan2(dy, dx) * 180) / Math.PI;
    }
    return 0;
  };

  const pointAt = (distance: number): Pose => {
    if (points.length === 0) return { x: 0, y: 0, heading: 0 };
    const dist = Math.min(length, Math.max(0, distance));
    let lo = 0;
    let hi = points.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] <= dist) lo = mid;
      else hi = mid;
    }
    if (points.length === 1) return { ...points[0], heading: 0 };
    const seg = cumulative[hi] - cumulative[lo];
    const t = seg > 0 ? (dist - cumulative[lo]) / seg : 0;
    return {
      x: points[lo].x + (points[hi].x - points[lo].x) * t,
      y: points[lo].y + (points[hi].y - points[lo].y) * t,
      heading: headingOf(lo)
    };
  };

  const distanceOf = (p: Point, fromDistance = 0): number => {
    if (points.length < 2) return 0;
    let best = fromDistance;
    let bestD = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
      if (cumulative[i + 1] < fromDistance) continue;
      const ax = points[i].x;
      const ay = points[i].y;
      const dx = points[i + 1].x - ax;
      const dy = points[i + 1].y - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? ((p.x - ax) * dx + (p.y - ay) * dy) / len2 : 0;
      t = Math.min(1, Math.max(0, t));
      const at = cumulative[i] + t * Math.sqrt(len2);
      if (at < fromDistance) continue;
      const dd = (ax + dx * t - p.x) ** 2 + (ay + dy * t - p.y) ** 2;
      if (dd < bestD - 1e-9) {
        bestD = dd;
        best = at;
      }
    }
    return best;
  };

  return { d: roundedPathD(corners, radius), points, cumulative, length, pointAt, distanceOf };
}
