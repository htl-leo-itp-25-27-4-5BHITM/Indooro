/**
 * Public routing API. OWNER: routing agent (Sonnet 2). The signatures are a contract used by
 * the store experience; implementations below are temporary stubs and will be replaced by a
 * real A* + tour planner ported from Indooro (customer/route.js, swift TourPlanner.swift).
 */
import type { Cell, LayoutElement, PlannedRoute, RouteStop, StoreLayout } from "../types";

export interface Grid {
  width: number;
  height: number;
  /** blocked[y * width + x] === true → not walkable. */
  blocked: Uint8Array;
}

/** Builds the walkable grid: everything blocks except entrance, exit and beacon. */
export function buildGrid(layout: StoreLayout): Grid {
  const { width, height } = layout.gridSize;
  return { width, height, blocked: new Uint8Array(width * height) };
}

export function isWalkable(grid: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < grid.width && y < grid.height && grid.blocked[y * grid.width + x] === 0;
}

/** Walkable cell in front of a shelf (respects `access`), nearest to the given slot fraction 0..1. */
export function accessCellFor(_grid: Grid, shelf: LayoutElement, _fraction = 0.5): Cell {
  return { x: shelf.x, y: shelf.y + shelf.height };
}

/** A* between two cells, inclusive path or null. */
export function findPath(_grid: Grid, from: Cell, to: Cell): Cell[] | null {
  return [from, to];
}

/** Orders stops (nearest neighbour + 2-opt), routes start → stops → end. */
export function planRoute(_grid: Grid, start: Cell, stops: RouteStop[], end?: Cell): PlannedRoute {
  const order = stops.slice();
  const points = [start, ...order.map((s) => s.cell), ...(end ? [end] : [])];
  const legs = points.slice(1).map((p, i) => [points[i], p]);
  return { order, legs, path: points, unreachable: [], totalMeters: 0 };
}

/** Entrance cell of the layout (first walkable cell of the entrance element). */
export function entranceCell(layout: StoreLayout): Cell {
  const e = layout.elements.find((el) => el.type === "entrance");
  return e ? { x: e.x, y: e.y } : { x: 0, y: 0 };
}

/** Cell in front of the checkouts, used as route end. */
export function checkoutCell(layout: StoreLayout): Cell | undefined {
  const c = layout.elements.find((el) => el.type === "checkout");
  return c ? { x: c.x, y: c.y - 1 } : undefined;
}
