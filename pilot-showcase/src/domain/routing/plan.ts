/**
 * Route planning: reachability, distance matrix, tour order and the concatenated path.
 * Orchestrates astar.ts (legs) and tour.ts (order). Algorithms follow the Indooro web app
 * (route.js) and the iOS app (TourPlanner.swift).
 */
import type { Cell, PlannedRoute, RouteStop } from "../types";
import { distancesFrom, findPath, type PathOptions } from "./astar";
import { isWalkable, snapToWalkable, type Grid } from "./grid";
import { optimiseOrder } from "./tour";

export interface PlanOptions extends PathOptions {
  /** false → keep the given stop order (only legs are computed). Default true. */
  optimise?: boolean;
}

function same(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Orders stops (nearest neighbour + 2-opt, end fixed), routes start → stops → end. */
export function planRoute(grid: Grid, startIn: Cell, stops: RouteStop[], endIn?: Cell, options: PlanOptions = {}): PlannedRoute {
  const start = isWalkable(grid, startIn.x, startIn.y) ? startIn : snapToWalkable(grid, startIn);
  if (!start) return { order: [], legs: [], path: [], unreachable: stops.slice(), totalMeters: 0 };

  const fromStart = distancesFrom(grid, start);
  const idx = (c: Cell) => c.y * grid.width + c.x;
  const reachable = (c: Cell) => isWalkable(grid, c.x, c.y) && Number.isFinite(fromStart[idx(c)]);

  const ok: RouteStop[] = [];
  const unreachable: RouteStop[] = [];
  for (const s of stops) (reachable(s.cell) ? ok : unreachable).push(s);
  const end = endIn && reachable(endIn) ? endIn : undefined;

  // distance matrix: 0 = start, 1..n = stops, n+1 = end (BFS per node, symmetric)
  const nodes: Cell[] = [start, ...ok.map((s) => s.cell)];
  if (end) nodes.push(end);
  const d: number[][] = nodes.map((c) => {
    const dist = distancesFrom(grid, c);
    return nodes.map((t) => dist[idx(t)]);
  });

  const n = ok.length;
  const optimise = options.optimise ?? true;
  const nodeOrder = optimise ? optimiseOrder(d, n, end ? n + 1 : undefined) : ok.map((_, i) => i + 1);
  const order = nodeOrder.map((i) => ok[i - 1]);

  const waypoints: Cell[] = [start, ...order.map((s) => s.cell), ...(end ? [end] : [])];
  const legs: Cell[][] = [];
  const path: Cell[] = [{ x: start.x, y: start.y }];
  for (let i = 1; i < waypoints.length; i++) {
    const leg = same(waypoints[i - 1], waypoints[i])
      ? [{ x: waypoints[i].x, y: waypoints[i].y }]
      : (findPath(grid, waypoints[i - 1], waypoints[i], options) ?? [waypoints[i - 1], waypoints[i]]);
    legs.push(leg);
    for (let k = 1; k < leg.length; k++) path.push(leg[k]);
  }
  return { order, legs, path, unreachable, totalMeters: Math.max(0, path.length - 1) };
}
