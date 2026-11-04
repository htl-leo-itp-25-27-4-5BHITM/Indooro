import type { Placement } from "./steps";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Size {
  w: number;
  h: number;
}
export interface Point {
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, hi < lo ? lo : v));

/** Grows a rect by `pad` on every side. */
export const inflate = (r: Rect, pad: number): Rect => ({ x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 });

/** Limits a rect to the viewport (with `inset`). */
export function clipToViewport(r: Rect, vp: Size, inset = 6): Rect {
  const x1 = clamp(r.x, inset, vp.w - inset);
  const y1 = clamp(r.y, inset, vp.h - inset);
  const x2 = clamp(r.x + r.w, inset, vp.w - inset);
  const y2 = clamp(r.y + r.h, inset, vp.h - inset);
  return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
}

export interface PlaceOptions {
  margin?: number;
  gap?: number;
  /** Space reserved at the top (site navigation). */
  topInset?: number;
}

/**
 * Positions the coach card next to the spotlight without covering it, if there is room.
 * Without a target the card is centred. When nothing fits it docks bottom-right.
 */
export function placeCard(target: Rect | null, card: Size, vp: Size, placement: Placement, opts: PlaceOptions = {}): Point {
  const { margin = 16, gap = 18, topInset = 72 } = opts;
  const maxX = vp.w - card.w - margin;
  const maxY = vp.h - card.h - margin;
  const centred: Point = { x: clamp((vp.w - card.w) / 2, margin, maxX), y: clamp((vp.h - card.h) / 2, topInset, maxY) };
  if (!target || placement === "center") return centred;

  const cx = target.x + target.w / 2;
  const cy = target.y + target.h / 2;
  const candidates: Record<"top" | "bottom" | "left" | "right", Point | null> = {
    bottom: target.y + target.h + gap + card.h <= vp.h - margin ? { x: clamp(cx - card.w / 2, margin, maxX), y: target.y + target.h + gap } : null,
    top: target.y - gap - card.h >= topInset ? { x: clamp(cx - card.w / 2, margin, maxX), y: target.y - gap - card.h } : null,
    right: target.x + target.w + gap + card.w <= vp.w - margin ? { x: target.x + target.w + gap, y: clamp(cy - card.h / 2, topInset, maxY) } : null,
    left: target.x - gap - card.w >= margin ? { x: target.x - gap - card.w, y: clamp(cy - card.h / 2, topInset, maxY) } : null
  };
  const order: ("top" | "bottom" | "left" | "right")[] =
    placement === "auto" ? ["bottom", "right", "left", "top"] : [placement, ...(["bottom", "top", "right", "left"] as const).filter((p) => p !== placement)];
  for (const p of order) {
    const c = candidates[p];
    if (c) return c;
  }
  return { x: Math.max(margin, maxX), y: Math.max(topInset, maxY) };
}

/** Scroll offset that puts `rect` (viewport coordinates) into the free area [top, bottom]. */
export function scrollTargetFor(rect: Rect, scrollY: number, freeTop: number, freeBottom: number): number {
  const free = freeBottom - freeTop;
  const desiredTop = rect.h >= free ? freeTop + 8 : freeTop + (free - rect.h) / 2;
  return Math.max(0, Math.round(scrollY + rect.y - desiredTop));
}

/** Exponential approach used for the eased spotlight (frame-rate independent). */
export const approach = (current: number, target: number, dtMs: number, halfLifeMs = 90): number =>
  target + (current - target) * Math.pow(0.5, dtMs / halfLifeMs);
