/** Route → 3D curve helpers. */
import type { Point } from "../../domain/routing/geometry";
import { toWorld, type GridSize } from "./transforms";

export const ROUTE_HEIGHT = 0.08;

/** Drops consecutive points closer than `minDist`, always keeping the last point. */
export function thinPoints(points: readonly Point[], minDist = 0.12): Point[] {
  if (points.length <= 2) return points.slice();
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const last = out[out.length - 1];
    if (Math.hypot(points[i].x - last.x, points[i].y - last.y) >= minDist) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Layout polyline → world [x, y, z] points at the given height. */
export function routeToWorld(points: readonly Point[], grid: GridSize, height = ROUTE_HEIGHT): Array<[number, number, number]> {
  return thinPoints(points).map((p) => {
    const w = toWorld(p.x, p.y, grid);
    return [w.x, height, w.z] as [number, number, number];
  });
}

/** Number of tube segments for a route: dense enough for smooth corners, bounded for perf. */
export function tubeSegments(lengthMetres: number): number {
  return Math.min(900, Math.max(64, Math.round(lengthMetres * 8)));
}
