/** Small handcrafted layouts for tests (and for the navigation tests). Not used at runtime. */
import type { ElementType, LayoutElement, StoreLayout } from "../types";

let nextId = 1;
export function el(type: ElementType, x: number, y: number, width: number, height: number, extra: Partial<LayoutElement> = {}): LayoutElement {
  return { id: nextId++, type, x, y, width, height, ...extra };
}

export function layoutOf(width: number, height: number, elements: LayoutElement[]): StoreLayout {
  return { shopName: "Testmarkt", gridSize: { width, height }, elements };
}

/** 12×8 open floor with a 6×1 shelf in the middle and entrance bottom-left, checkout bottom-right. */
export function shelfLayout(): StoreLayout {
  return layoutOf(12, 8, [
    el("entrance", 1, 7, 2, 1),
    el("checkout", 8, 7, 3, 1, { label: "Kasse" }),
    el("shelf", 3, 3, 6, 1, { category: "100", meter: 1, access: "south" })
  ]);
}
