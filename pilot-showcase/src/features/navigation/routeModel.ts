/**
 * Presentation model of a planned route: smoothed geometry plus the arc-length position of
 * every stop. Shared by RouteLayer and the simulation so both agree on distances.
 */
import { buildRouteGeometry, type RouteGeometry } from "../../domain/routing";
import type { PlannedRoute } from "../../domain/types";

export interface RouteModel {
  geometry: RouteGeometry;
  /** Arc length (metres along the smoothed route) at which stop i is reached; non-decreasing. */
  stopDistances: number[];
  length: number;
}

/** Content signature: equal for equal plans, different when stops or path change. */
export function routeSignature(route: PlannedRoute | null): string {
  if (!route) return "none";
  const first = route.path[0];
  const last = route.path[route.path.length - 1];
  return [
    route.order.map((s) => `${s.id}@${s.cell.x},${s.cell.y}`).join("|"),
    route.path.length,
    route.totalMeters,
    first ? `${first.x},${first.y}` : "-",
    last ? `${last.x},${last.y}` : "-"
  ].join("#");
}

export function buildRouteModel(route: PlannedRoute): RouteModel {
  const geometry = buildRouteGeometry(route.path);
  const stopDistances: number[] = [];
  let prev = 0;
  // cell index in route.path where each leg ends (legs share their joint cell)
  let cellIdx = 0;
  route.order.forEach((stop, i) => {
    const leg = route.legs[i];
    cellIdx += leg ? Math.max(0, leg.length - 1) : 0;
    const isLastCell = cellIdx >= route.path.length - 1;
    const d = isLastCell
      ? geometry.length
      : Math.max(prev, geometry.distanceOf({ x: stop.cell.x + 0.5, y: stop.cell.y + 0.5 }, prev));
    stopDistances.push(d);
    prev = d;
  });
  return { geometry, stopDistances, length: geometry.length };
}
