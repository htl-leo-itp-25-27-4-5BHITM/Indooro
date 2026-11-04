import type { Cell, PlannedRoute } from "../../domain/types";

export interface RouteLayerProps {
  route: PlannedRoute | null;
  /** Simulated customer position in metres (fractional), or null if hidden. */
  position: { x: number; y: number; heading: number } | null;
  /** Index into route.order of the stop the customer is heading to; -1 = finished/none. */
  activeStopIndex: number;
  /** Ids of stops already reached. */
  reachedStopIds: ReadonlySet<string>;
  /** Start cell (entrance). */
  start: Cell;
}

/**
 * Rendered INSIDE the store map <svg>, whose user units are metres (1 unit = 1 m).
 * Cell centres are at (x + 0.5, y + 0.5).
 */
export function RouteLayer({ route }: RouteLayerProps) {
  if (!route) return null;
  const d = route.path.map((c, i) => `${i ? "L" : "M"}${c.x + 0.5} ${c.y + 0.5}`).join(" ");
  return <path d={d} fill="none" stroke="#63E6B4" strokeWidth={0.4} />;
}
