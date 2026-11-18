/**
 * Begehbares Raster für die Platzierungssimulation (MODELLPROGNOSE).
 *
 * Eine Rasterzelle gilt als begehbar, wenn ihr MITTELPUNKT innerhalb des Plans liegt und in keinem blockierenden
 * Element (Regal, Kasse, Wand, Kühlregal, Tiefkühler, Theke) liegt. Elemente dürfen gedreht sein
 * (Drehung im Uhrzeigersinn um den Mittelpunkt, y zeigt nach unten – wie map/geometry.ts rotatedRectCorners).
 * Vereinfachung: Zellen, die nur teilweise von einem Element überdeckt sind, zählen nach ihrem Mittelpunkt.
 */
import type { FloorElement, FloorElementType, FloorPlan, Point } from "../core/types";

/** Elementtypen, die man nicht betreten kann (und die im optionalen Dämpfungsmodell als Hindernis gelten). */
export const BLOCKING_TYPES: readonly FloorElementType[] = ["shelf", "checkout", "wall", "cooler", "freezer", "counter"];

export function isBlocking(el: Pick<FloorElement, "type">): boolean {
  return BLOCKING_TYPES.includes(el.type);
}

type Rect = Pick<FloorElement, "x" | "y" | "width" | "height" | "rotationDeg">;

/** Punkt in das lokale (unrotierte) Koordinatensystem des Elements, Ursprung = Elementmittelpunkt. */
function toLocal(p: Point, el: Rect): Point {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const rad = (-(el.rotationDeg || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - cx;
  const dy = p.y - cy;
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

/** Punkt (Rand zählt als innen) in gedrehtem Rechteck. */
export function pointInElement(p: Point, el: Rect): boolean {
  const l = toLocal(p, el);
  const eps = 1e-9;
  return Math.abs(l.x) <= el.width / 2 + eps && Math.abs(l.y) <= el.height / 2 + eps;
}

/** Schneidet die Strecke a-b das (gedrehte) Rechteck? (Liang-Barsky im lokalen Rahmen.) */
export function segmentIntersectsElement(a: Point, b: Point, el: Rect): boolean {
  const la = toLocal(a, el);
  const lb = toLocal(b, el);
  const hw = el.width / 2;
  const hh = el.height / 2;
  let t0 = 0;
  let t1 = 1;
  const dx = lb.x - la.x;
  const dy = lb.y - la.y;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, la.x + hw) && clip(dx, hw - la.x) && clip(-dy, la.y + hh) && clip(dy, hh - la.y) && t0 <= t1;
}

export interface WalkableCell {
  ix: number;
  iy: number;
  /** Zellmittelpunkt in Layout-Einheiten (LE) */
  x: number;
  y: number;
}

export interface WalkableGrid {
  cellSize: number;
  cols: number;
  rows: number;
  cells: WalkableCell[];
}

export function walkableGrid(plan: Pick<FloorPlan, "width" | "height" | "elements">, cellSize = 1): WalkableGrid {
  const size = Number.isFinite(cellSize) && cellSize > 0 ? cellSize : 1;
  const cols = Math.max(0, Math.ceil(plan.width / size - 1e-9));
  const rows = Math.max(0, Math.ceil(plan.height / size - 1e-9));
  const blockers = plan.elements.filter(isBlocking);
  const cells: WalkableCell[] = [];
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const p = { x: (ix + 0.5) * size, y: (iy + 0.5) * size };
      if (p.x >= plan.width || p.y >= plan.height) continue;
      if (blockers.some((el) => pointInElement(p, el))) continue;
      cells.push({ ix, iy, x: p.x, y: p.y });
    }
  }
  return { cellSize: size, cols, rows, cells };
}
