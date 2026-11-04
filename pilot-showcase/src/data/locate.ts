import type { Cell, LayoutElement, Market, Product, ProductLocation } from "../domain/types";

/** Number of product slots we assume per shelf level when positioning a pin by slot. */
export const SLOTS_PER_LEVEL = 4;

export const SHELF_TYPES: ReadonlyArray<LayoutElement["type"]> = ["shelf", "fresh", "cooler"];

export interface ParsedLayoutCode {
  category: string;
  meter: number;
  level: number;
  slot: number;
}

/** "<category>/<meter>/<level>/<slot>" → parts. Missing level/slot default to 1. */
export function parseLayoutCode(code: string): ParsedLayoutCode | null {
  const parts = code.split("/");
  if (parts.length < 2 || !parts[0]) return null;
  const meter = Number(parts[1]);
  if (!Number.isFinite(meter)) return null;
  const level = Math.max(1, Math.round(Number(parts[2] ?? 1)) || 1);
  const slot = Math.max(1, Math.round(Number(parts[3] ?? 1)) || 1);
  return { category: parts[0], meter, level, slot };
}

/** Exactly like the backend: category base + meter identify a shelf. */
export function findShelf(market: Market, category: string, meter: number): LayoutElement | undefined {
  return market.layout.elements.find((el) => SHELF_TYPES.includes(el.type) && el.category === category && el.meter === meter);
}

/** Resolves a product's layoutCode to its shelf, pin on the shelf face and the cell in front of it. */
export function locateProduct(market: Market, product: Product): ProductLocation | undefined {
  const parsed = parseLayoutCode(product.layoutCode);
  if (!parsed) return undefined;
  const shelf = findShelf(market, parsed.category, parsed.meter);
  if (!shelf) return undefined;

  const fraction = (Math.min(parsed.slot, SLOTS_PER_LEVEL) - 0.5) / SLOTS_PER_LEVEL;
  const access = shelf.access ?? "south";
  const horizontal = access === "north" || access === "south";
  const along = (start: number, size: number) => start + fraction * size;
  const cellAlong = (start: number, size: number) => Math.min(start + size - 1, Math.max(start, Math.floor(along(start, size))));

  let accessCell: Cell;
  let pin: { x: number; y: number };
  if (horizontal) {
    const x = cellAlong(shelf.x, shelf.width);
    const y = access === "south" ? shelf.y + shelf.height : shelf.y - 1;
    accessCell = { x, y };
    pin = { x: along(shelf.x, shelf.width), y: access === "south" ? shelf.y + shelf.height : shelf.y };
  } else {
    const y = cellAlong(shelf.y, shelf.height);
    const x = access === "east" ? shelf.x + shelf.width : shelf.x - 1;
    accessCell = { x, y };
    pin = { x: access === "east" ? shelf.x + shelf.width : shelf.x, y: along(shelf.y, shelf.height) };
  }
  return { product, shelf, level: parsed.level, slot: parsed.slot, accessCell, pin };
}

export function locateAll(market: Market, products: Product[] = market.products): ProductLocation[] {
  return products.map((p) => locateProduct(market, p)).filter((l): l is ProductLocation => Boolean(l));
}

export function categoryName(market: Market, categoryId: string | undefined): string {
  return market.categories.find((c) => c.id === categoryId)?.name ?? "Regal";
}

export function categoryColor(market: Market, categoryId: string | undefined): string {
  return market.categories.find((c) => c.id === categoryId)?.color ?? "#9db0b2";
}

/** Short shelf name, e.g. "Regal Milchprodukte · Meter 2". */
export function shelfName(market: Market, shelf: LayoutElement): string {
  return `Regal ${categoryName(market, shelf.category)} · Meter ${shelf.meter ?? 1}`;
}

/** Full text for a product, e.g. "Regal Milchprodukte · Meter 2 · Boden 3 von unten". */
export function describeLocation(market: Market, loc: ProductLocation): string {
  return `${shelfName(market, loc.shelf)} · Boden ${loc.level} von unten`;
}

export function productsOnShelf(market: Market, shelf: LayoutElement): Product[] {
  return market.products.filter((p) => {
    const parsed = parseLayoutCode(p.layoutCode);
    return parsed && parsed.category === shelf.category && parsed.meter === shelf.meter;
  });
}
