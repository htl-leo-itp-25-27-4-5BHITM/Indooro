import type { MapScale, Point } from "../core/types";
import { formatDistance } from "../core/units";

export type LayerId =
  | "grid"
  | "elements"
  | "labels"
  | "beacons"
  | "references"
  | "estimates"
  | "trajectories"
  | "heatmap"
  | "errors";

export const ALL_LAYERS: { id: LayerId; label: string }[] = [
  { id: "grid", label: "Raster" },
  { id: "elements", label: "Elemente" },
  { id: "labels", label: "Beschriftung" },
  { id: "beacons", label: "Beacons" },
  { id: "references", label: "Referenzpunkte" },
  { id: "estimates", label: "Schätzungen" },
  { id: "trajectories", label: "Trajektorien" },
  { id: "heatmap", label: "Heatmap" },
  { id: "errors", label: "Fehlervektoren" },
];

export const DEFAULT_LAYERS: Record<LayerId, boolean> = {
  grid: true,
  elements: true,
  labels: true,
  beacons: true,
  references: true,
  estimates: true,
  trajectories: true,
  heatmap: true,
  errors: false,
};

export type SelectionKind = "beacon" | "reference" | "estimate" | "element" | "cell";

export interface MapSelection {
  kind: SelectionKind;
  id: string;
  position?: Point;
}

/** Content of the hover tooltip / pinned detail card. */
export interface MapDetail {
  kind: SelectionKind;
  id: string;
  title: string;
  lines: string[];
  position?: Point;
}

/** "x 12.30 · y 5.60 LE" (+ metres in parentheses only if the scale is confirmed). */
export function formatPosition(p: Point, scale: MapScale): string {
  const le = `x ${p.x.toFixed(2)} · y ${p.y.toFixed(2)} LE`;
  if (!scale.confirmed) return le;
  return `${le} (${formatDistance(p.x, scale, 1)}, ${formatDistance(p.y, scale, 1)})`;
}
