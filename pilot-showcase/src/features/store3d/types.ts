import type { LayoutElement, Market, PlannedRoute, ProductLocation } from "../../domain/types";
import type { NavigationSimulation } from "../navigation";
import type { ListPin } from "../store/StoreMap";

export interface Store3DViewProps {
  market: Market;
  route: PlannedRoute | null;
  sim: NavigationSimulation;
  /** Currently selected (searched) product location, highlighted with an amber pin. */
  selected: ProductLocation | null;
  /** Shopping list pins with visit numbers. */
  listPins: ListPin[];
  activeShelfId: number | null;
  showBeacons: boolean;
  onShelfClick(shelf: LayoutElement): void;
}
