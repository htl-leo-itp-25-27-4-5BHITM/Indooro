import type { PlannedRoute } from "../../domain/types";
import type { NavigationSimulation } from "./useNavigationSimulation";

export interface NavigationPanelProps {
  route: PlannedRoute | null;
  sim: NavigationSimulation;
  /** Lookup for display data of a stop id (product name, emoji, shelf text). */
  describeStop: (stopId: string) => { title: string; subtitle: string; emoji: string } | undefined;
}

/** Stub: turn-by-turn style panel with start/pause/next controls and a "Simulation" badge. */
export function NavigationPanel({ sim }: NavigationPanelProps) {
  return (
    <div>
      <button type="button" onClick={sim.start}>Route starten (Simulation)</button>
    </div>
  );
}
