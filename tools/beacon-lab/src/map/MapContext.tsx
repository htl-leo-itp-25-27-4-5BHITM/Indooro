import { createContext, useContext } from "react";
import type { MouseEvent, PointerEvent } from "react";
import type { FloorPlan, MapScale } from "../core/types";
import type { ViewBox } from "./geometry";
import type { LayerId, MapDetail } from "./layers";

export interface MapContextValue {
  plan: FloorPlan;
  scale: MapScale;
  viewBox: ViewBox;
  /** current zoom relative to "fit" (1 = whole plan visible) */
  zoom: number;
  /** screen pixels per layout unit – use to keep markers at constant on-screen size */
  pxPerUnit: number;
  layers: Record<LayerId, boolean>;
  selectedId?: string;
  /** Pointer/click handlers that wire an SVG element to the map's tooltip + selection. */
  interactive: (detail: MapDetail) => {
    onPointerEnter: (e: PointerEvent<SVGElement>) => void;
    onPointerMove: (e: PointerEvent<SVGElement>) => void;
    onPointerLeave: () => void;
    onClick: (e: MouseEvent<SVGElement>) => void;
  };
}

export const MapContext = createContext<MapContextValue | null>(null);

export function useMap(): MapContextValue {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error("Map overlay must be rendered inside <FloorPlanMap>");
  return ctx;
}
