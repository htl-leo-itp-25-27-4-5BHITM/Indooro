import type { FloorElement, FloorPlan, Point } from "../core/types";

/** SVG viewBox in layout units. */
export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Affine matrix as in DOMMatrix / SVGMatrix: x' = a*x + c*y + e, y' = b*x + d*y + f. */
export interface Matrix2D {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 20;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Viewbox that shows the whole plan (plus margin in layout units) for a container of the given
 * aspect ratio (width/height). Equal x/y scale is preserved; the extra dimension is centred.
 */
export function fitViewBox(plan: { width: number; height: number }, aspect: number, margin = 1.5): ViewBox {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : plan.width / Math.max(plan.height, 1e-9);
  const cw = plan.width + 2 * margin;
  const ch = plan.height + 2 * margin;
  let w = cw;
  let h = cw / a;
  if (h < ch) {
    h = ch;
    w = ch * a;
  }
  return { x: plan.width / 2 - w / 2, y: plan.height / 2 - h / 2, w, h };
}

/** Zoom factor of `vb` relative to `fit` (1 = fitted, 2 = twice as close). */
export function zoomOf(vb: ViewBox, fit: ViewBox): number {
  return fit.w / vb.w;
}

/** Zoom by `factor` keeping the layout point `anchor` at the same screen position. Zoom is clamped. */
export function zoomAt(vb: ViewBox, fit: ViewBox, factor: number, anchor: Point): ViewBox {
  if (!(factor > 0) || !Number.isFinite(factor)) return vb;
  const current = zoomOf(vb, fit);
  const target = clamp(current * factor, MIN_ZOOM, MAX_ZOOM);
  const f = target / current;
  if (f === 1) return vb;
  return {
    x: anchor.x - (anchor.x - vb.x) / f,
    y: anchor.y - (anchor.y - vb.y) / f,
    w: vb.w / f,
    h: vb.h / f,
  };
}

/** Zoom around the centre of the view. */
export function zoomCentered(vb: ViewBox, fit: ViewBox, factor: number): ViewBox {
  return zoomAt(vb, fit, factor, { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 });
}

/** Pan by a delta given in layout units (positive dx moves the view to the right). */
export function panBy(vb: ViewBox, dx: number, dy: number): ViewBox {
  return { ...vb, x: vb.x + dx, y: vb.y + dy };
}

/** Keeps at least `keep` (fraction of the view) of the plan overlapping the view so it cannot be lost. */
export function clampPan(vb: ViewBox, plan: { width: number; height: number }, keep = 0.15): ViewBox {
  const minX = -vb.w * (1 - keep);
  const maxX = plan.width + vb.w * (1 - keep) - vb.w;
  const minY = -vb.h * (1 - keep);
  const maxY = plan.height + vb.h * (1 - keep) - vb.h;
  return { ...vb, x: clamp(vb.x, minX, Math.max(minX, maxX)), y: clamp(vb.y, minY, Math.max(minY, maxY)) };
}

export function invertMatrix(m: Matrix2D): Matrix2D | null {
  const det = m.a * m.d - m.b * m.c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

export function applyMatrix(m: Matrix2D, p: Point): Point {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

/** Screen (client) -> layout using the inverse of getScreenCTM(). Returns null for singular matrices. */
export function screenToLayout(client: Point, ctm: Matrix2D): Point | null {
  const inv = invertMatrix(ctm);
  return inv ? applyMatrix(inv, client) : null;
}

export function layoutToScreen(p: Point, ctm: Matrix2D): Point {
  return applyMatrix(ctm, p);
}

/**
 * Pure fallback for tests / environments without getScreenCTM: reproduces the matrix of an `<svg>`
 * with preserveAspectRatio="xMidYMid meet" (uniform scale, centred).
 */
export function meetMatrix(rect: { left: number; top: number; width: number; height: number }, vb: ViewBox): Matrix2D {
  const s = Math.min(rect.width / vb.w, rect.height / vb.h);
  const offX = rect.left + (rect.width - vb.w * s) / 2;
  const offY = rect.top + (rect.height - vb.h * s) / 2;
  return { a: s, b: 0, c: 0, d: s, e: offX - vb.x * s, f: offY - vb.y * s };
}

export function screenToLayoutFallback(
  client: Point,
  rect: { left: number; top: number; width: number; height: number },
  vb: ViewBox,
): Point | null {
  return screenToLayout(client, meetMatrix(rect, vb));
}

/**
 * Corners of a (possibly rotated) element in order TL, TR, BR, BL.
 * Rotation is in degrees, clockwise (y points down) around the element centre – IndoorGraph.swift corners().
 */
export function rotatedRectCorners(el: Pick<FloorElement, "x" | "y" | "width" | "height" | "rotationDeg">): Point[] {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const rad = (el.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = el.width / 2;
  const hh = el.height / 2;
  const local: [number, number][] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];
  return local.map(([dx, dy]) => ({ x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }));
}

export function elementCentre(el: Pick<FloorElement, "x" | "y" | "width" | "height">): Point {
  return { x: el.x + el.width / 2, y: el.y + el.height / 2 };
}

/** True if the point lies inside the plan grid (optionally enlarged by `tolerance` layout units). */
export function pointInPlan(p: Point, plan: Pick<FloorPlan, "width" | "height">, tolerance = 0): boolean {
  return p.x >= -tolerance && p.y >= -tolerance && p.x <= plan.width + tolerance && p.y <= plan.height + tolerance;
}

/** Ray casting point-in-polygon (used for hit tests on rotated elements). */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Largest "nice" length (1, 2, 5 x 10^k) that is <= target. */
export function niceScaleBarLength(target: number): number {
  if (!(target > 0) || !Number.isFinite(target)) return 1;
  const exp = Math.floor(Math.log10(target));
  const base = Math.pow(10, exp);
  const m = target / base;
  const nice = m >= 5 ? 5 : m >= 2 ? 2 : 1;
  return nice * base;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function roundTo(v: number, step: number): number {
  return Math.round(v / step) * step;
}
