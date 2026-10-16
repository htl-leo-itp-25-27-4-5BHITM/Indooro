import type { LayoutElement } from "./model";

export interface Point { x: number; y: number }
export interface Viewport { x: number; y: number; scale: number }

export function worldToScreen(point: Point, viewport: Viewport): Point {
  return { x: point.x * viewport.scale + viewport.x, y: point.y * viewport.scale + viewport.y };
}

export function screenToWorld(point: Point, viewport: Viewport): Point {
  return { x: (point.x - viewport.x) / viewport.scale, y: (point.y - viewport.y) / viewport.scale };
}

export function zoomAt(viewport: Viewport, cursor: Point, factor: number): Viewport {
  const world = screenToWorld(cursor, viewport);
  const scale = Math.min(80, Math.max(0.2, viewport.scale * factor));
  return { x: cursor.x - world.x * scale, y: cursor.y - world.y * scale, scale };
}

export function fitViewport(content: { width: number; height: number }, surface: { width: number; height: number }, padding = 40): Viewport {
  const width = Math.max(1, content.width);
  const height = Math.max(1, content.height);
  const scale = Math.max(0.2, Math.min(40, (surface.width - padding * 2) / width, (surface.height - padding * 2) / height));
  return { scale, x: (surface.width - width * scale) / 2, y: (surface.height - height * scale) / 2 };
}

/** Axis aligned bounds of a shape rotated around its centre, in layout units. */
export function elementBounds(element: LayoutElement): { left: number; top: number; right: number; bottom: number } {
  if (element.type === "beacon") return { left: element.x, top: element.y, right: element.x, bottom: element.y };
  const width = Number(element.width) || 0;
  const height = Number(element.height) || 0;
  const radians = (Number(element.rotation) || 0) * Math.PI / 180;
  const halfWidth = (Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians))) / 2;
  const halfHeight = (Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians))) / 2;
  const cx = element.x + width / 2;
  const cy = element.y + height / 2;
  return { left: cx - halfWidth, right: cx + halfWidth, top: cy - halfHeight, bottom: cy + halfHeight };
}

export function overlaps(first: LayoutElement, second: LayoutElement): boolean {
  if (first.type === "beacon" || second.type === "beacon") return false;
  const a = elementBounds(first);
  const b = elementBounds(second);
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
