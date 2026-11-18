import { describe, expect, it } from "vitest";
import type { Cell, Market } from "../domain/types";
import { MARKETS, SHELF_TYPES, findShelf, locateProduct, parseLayoutCode, productsOnShelf } from "./index";

/** Local walkability model: every element blocks except entrance, exit and beacon. */
function blockedGrid(market: Market): Uint8Array {
  const { width, height } = market.layout.gridSize;
  const g = new Uint8Array(width * height);
  for (const el of market.layout.elements) {
    if (el.type === "entrance" || el.type === "exit" || el.type === "beacon") continue;
    for (let y = el.y; y < el.y + el.height; y++) for (let x = el.x; x < el.x + el.width; x++) g[y * width + x] = 1;
  }
  return g;
}

function reachable(market: Market, from: Cell): Set<string> {
  const { width, height } = market.layout.gridSize;
  const g = blockedGrid(market);
  const seen = new Set<string>([`${from.x},${from.y}`]);
  const queue = [from];
  while (queue.length) {
    const c = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = c.x + dx;
      const y = c.y + dy;
      if (x < 0 || y < 0 || x >= width || y >= height || g[y * width + x] || seen.has(`${x},${y}`)) continue;
      seen.add(`${x},${y}`);
      queue.push({ x, y });
    }
  }
  return seen;
}

describe.each(MARKETS.map((m) => [m.code, m] as const))("Demomarkt %s", (_code, market) => {
  const { width, height } = market.layout.gridSize;
  const grid = blockedGrid(market);
  const entrance = market.layout.elements.find((e) => e.type === "entrance")!;
  const reach = reachable(market, { x: entrance.x, y: entrance.y });

  it("elements stay inside the grid and shelves do not overlap", () => {
    const owner = new Map<string, number>();
    for (const el of market.layout.elements) {
      expect(el.x).toBeGreaterThanOrEqual(0);
      expect(el.y).toBeGreaterThanOrEqual(0);
      expect(el.x + el.width).toBeLessThanOrEqual(width);
      expect(el.y + el.height).toBeLessThanOrEqual(height);
      if (el.type === "beacon") continue;
      for (let y = el.y; y < el.y + el.height; y++)
        for (let x = el.x; x < el.x + el.width; x++) {
          const key = `${x},${y}`;
          expect(owner.has(key), `Überlappung bei ${key} (Element ${el.id} / ${owner.get(key)})`).toBe(false);
          owner.set(key, el.id);
        }
    }
  });

  it("has exactly one entrance, an exit, checkouts and 8–12 beacons with unique codes", () => {
    const count = (t: string) => market.layout.elements.filter((e) => e.type === t).length;
    expect(count("entrance")).toBe(1);
    expect(count("exit")).toBeGreaterThanOrEqual(1);
    expect(count("checkout")).toBeGreaterThanOrEqual(2);
    expect(count("beacon")).toBeGreaterThanOrEqual(8);
    expect(count("beacon")).toBeLessThanOrEqual(12);
    const codes = market.layout.elements.filter((e) => e.type === "beacon").map((e) => e.beaconCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("shelf (category + meter) pairs are unique", () => {
    const keys = market.layout.elements.filter((e) => SHELF_TYPES.includes(e.type)).map((e) => `${e.category}/${e.meter}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every product layoutCode matches exactly one shelf of this market", () => {
    for (const p of market.products) {
      const parsed = parseLayoutCode(p.layoutCode);
      expect(parsed, p.id).not.toBeNull();
      const matches = market.layout.elements.filter(
        (e) => SHELF_TYPES.includes(e.type) && e.category === parsed!.category && e.meter === parsed!.meter
      );
      expect(matches.length, `${p.name} (${p.layoutCode})`).toBe(1);
      expect(findShelf(market, parsed!.category, parsed!.meter)).toBe(matches[0]);
      expect(p.categoryId).toBe(parsed!.category);
      expect(market.categories.some((c) => c.id === p.categoryId)).toBe(true);
    }
    expect(new Set(market.products.map((p) => p.id)).size).toBe(market.products.length);
  });

  it("every shelf holds at least one product", () => {
    for (const el of market.layout.elements.filter((e) => SHELF_TYPES.includes(e.type))) {
      expect(productsOnShelf(market, el).length, `${el.label} Meter ${el.meter}`).toBeGreaterThan(0);
    }
  });

  it("every product access cell is walkable and reachable from the entrance", () => {
    for (const p of market.products) {
      const loc = locateProduct(market, p)!;
      expect(loc, p.name).toBeDefined();
      const { x, y } = loc.accessCell;
      expect(grid[y * width + x], `${p.name}: Zugangszelle ${x},${y} blockiert`).toBe(0);
      expect(reach.has(`${x},${y}`), `${p.name}: Zugangszelle ${x},${y} nicht erreichbar`).toBe(true);
      // the pin lies on the shelf face, next to the access cell
      expect(Math.abs(loc.pin.x - (x + 0.5)) + Math.abs(loc.pin.y - (y + 0.5))).toBeLessThanOrEqual(1.5);
    }
  });

  it("beacons, exit and the cell above the first checkout are reachable", () => {
    for (const el of market.layout.elements.filter((e) => e.type === "beacon" || e.type === "exit")) {
      expect(reach.has(`${el.x},${el.y}`), `${el.type} ${el.beaconCode ?? ""}`).toBe(true);
    }
    const checkout = market.layout.elements.find((e) => e.type === "checkout")!;
    expect(reach.has(`${checkout.x},${checkout.y - 1}`)).toBe(true);
  });

  it("uses fictional data only", () => {
    expect(market.tagline).toContain("Fiktiver Demomarkt");
    expect(JSON.stringify(market)).not.toMatch(/spar|billa|hofer|lidl|penny|merkur/i);
  });
});

describe("Marktumfang", () => {
  it("market A is ~1000 m² with ~70 products, market B is smaller with ~45", () => {
    const [a, b] = MARKETS;
    expect(a.layout.gridSize.width * a.layout.gridSize.height).toBeGreaterThanOrEqual(1000);
    expect(a.products.length).toBeGreaterThanOrEqual(65);
    expect(b.layout.gridSize.width * b.layout.gridSize.height).toBeLessThan(500);
    expect(b.products.length).toBeGreaterThanOrEqual(40);
    expect(b.products.length).toBeLessThan(a.products.length);
  });
});

describe("locateProduct", () => {
  it("parses level and slot and puts the pin on the access face", () => {
    const market = MARKETS[0];
    const milk = market.products.find((p) => p.id === "frischmilch")!;
    const loc = locateProduct(market, milk)!;
    expect(loc.shelf.category).toBe("410");
    expect(loc.shelf.meter).toBe(1);
    expect(loc.level).toBe(1);
    expect(loc.slot).toBe(1);
    expect(loc.shelf.access).toBe("south");
    expect(loc.pin.y).toBe(loc.shelf.y + loc.shelf.height);
    expect(loc.accessCell.y).toBe(loc.shelf.y + loc.shelf.height);
    expect(loc.accessCell.x).toBeGreaterThanOrEqual(loc.shelf.x);
    expect(loc.accessCell.x).toBeLessThan(loc.shelf.x + loc.shelf.width);
  });

  it("moves along the shelf with the slot", () => {
    const market = MARKETS[0];
    const a = locateProduct(market, market.products.find((p) => p.id === "frischmilch")!)!;
    const b = locateProduct(market, market.products.find((p) => p.id === "haltbarmilch")!)!;
    expect(b.pin.x).toBeGreaterThan(a.pin.x);
  });
});
