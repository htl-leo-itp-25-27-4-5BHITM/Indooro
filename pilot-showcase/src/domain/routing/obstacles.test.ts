import { describe, expect, it } from "vitest";
import { MARKETS, locateProduct } from "../../data";
import type { Market, RouteStop } from "../types";
import { buildGrid, checkoutCell, entranceCell, isWalkable, planRoute } from "./index";

/** Deterministic PRNG so failures are reproducible. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stopsOf(market: Market): RouteStop[] {
  return market.products.flatMap((p) => {
    const loc = locateProduct(market, p);
    return loc ? [{ id: p.id, cell: loc.accessCell, label: p.name }] : [];
  });
}

describe.each(MARKETS.map((m) => [m.code, m] as const))("Routing-Geometrie %s", (_code, market) => {
  const grid = buildGrid(market.layout);
  const start = entranceCell(market.layout, grid);
  const end = checkoutCell(market.layout, grid);
  const all = stopsOf(market);

  it("jedes Produkt hat ein Regal und eine begehbare Zugangszelle", () => {
    expect(all.length).toBe(market.products.length);
    for (const s of all) expect(isWalkable(grid, s.cell.x, s.cell.y), `${s.label} @ ${s.cell.x},${s.cell.y}`).toBe(true);
  });

  it("Eingang und Kasse sind begehbar", () => {
    expect(isWalkable(grid, start.x, start.y)).toBe(true);
    expect(end).toBeDefined();
    expect(isWalkable(grid, end!.x, end!.y)).toBe(true);
  });

  it("alle Produkte sind vom Eingang aus erreichbar (auch alle gleichzeitig)", () => {
    const r = planRoute(grid, start, all, end);
    expect(r.unreachable).toEqual([]);
    expect(r.order).toHaveLength(all.length);
  });

  it("Pfade betreten nie blockierte Zellen, sind 4-zusammenhängend und laufen Eingang → Kasse", () => {
    const rnd = mulberry32(market.code.length * 7919 + 13);
    const combos: RouteStop[][] = [all, ...all.map((s) => [s])];
    for (let i = 0; i < 120; i++) {
      const n = 1 + Math.floor(rnd() * 12);
      const pool = all.slice();
      const pick: RouteStop[] = [];
      while (pick.length < n && pool.length) pick.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
      combos.push(pick);
    }
    for (const stops of combos) {
      const r = planRoute(grid, start, stops, end);
      const ids = stops.map((s) => s.label).join(", ");
      expect(r.unreachable, ids).toEqual([]);
      expect(r.path[0]).toEqual(start);
      expect(r.path[r.path.length - 1]).toEqual(end);
      for (let k = 0; k < r.path.length; k++) {
        const c = r.path[k];
        expect(isWalkable(grid, c.x, c.y), `blockiert bei ${c.x},${c.y} (${ids})`).toBe(true);
        if (k > 0) expect(Math.abs(c.x - r.path[k - 1].x) + Math.abs(c.y - r.path[k - 1].y), `Sprung bei Index ${k} (${ids})`).toBe(1);
      }
      // jeder Halt liegt auf dem Pfad
      for (const s of r.order) expect(r.path.some((c) => c.x === s.cell.x && c.y === s.cell.y), s.label).toBe(true);
      expect(r.totalMeters).toBe(r.path.length - 1);
    }
  });
});
