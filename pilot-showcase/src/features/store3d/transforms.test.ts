import { describe, expect, it } from "vitest";
import type { LayoutElement } from "../../domain/types";
import { MARKETS, SHELF_TYPES } from "../../data";
import { levelCentres, productBlocks, shelfHeight, toWorld } from "./transforms";
import { routeToWorld, thinPoints, tubeSegments } from "./curve";

const grid = { width: 40, height: 26 };

describe("toWorld", () => {
  it("centres the layout on the origin", () => {
    expect(toWorld(20, 13, grid)).toEqual({ x: 0, z: 0 });
    expect(toWorld(0, 0, grid)).toEqual({ x: -20, z: -13 });
  });
});

describe("shelves", () => {
  it("heights by type", () => {
    expect(shelfHeight({ type: "cooler", width: 4, height: 2 })).toBeGreaterThan(shelfHeight({ type: "shelf", width: 4, height: 2 }));
    expect(shelfHeight({ type: "fresh", width: 5, height: 1 })).toBeLessThan(1.5);
  });

  it("level centres are ascending and below the shelf top", () => {
    const l = levelCentres(1.8);
    expect(l).toHaveLength(4);
    expect([...l].sort((a, b) => a - b)).toEqual(l);
    expect(l[l.length - 1]).toBeLessThan(1.8);
  });

  it("produces blocks for every shelf of every market, below the shelf top", () => {
    for (const m of MARKETS) {
      for (const el of m.layout.elements.filter((e) => SHELF_TYPES.includes(e.type))) {
        const blocks = productBlocks(el, m.layout.gridSize);
        expect(blocks.length).toBeGreaterThan(0);
        for (const b of blocks) expect(b.y).toBeLessThan(shelfHeight(el));
      }
    }
  });

  it("blocks sit on the south side for access south", () => {
    const el: LayoutElement = { id: 1, type: "shelf", x: 10, y: 10, width: 4, height: 2, access: "south" };
    const blocks = productBlocks(el, grid);
    const centreZ = toWorld(12, 11, grid).z;
    expect(blocks.every((b) => b.z > centreZ + 0.9)).toBe(true);
  });
});

describe("curve", () => {
  it("thinPoints keeps first and last", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 0.01, y: 0 },
      { x: 0.02, y: 0 },
      { x: 5, y: 0 }
    ];
    const out = thinPoints(pts);
    expect(out[0]).toEqual(pts[0]);
    expect(out[out.length - 1]).toEqual(pts[3]);
    expect(out.length).toBe(2);
  });

  it("routeToWorld maps to x/z with height", () => {
    const w = routeToWorld(
      [
        { x: 20, y: 13 },
        { x: 22, y: 13 }
      ],
      grid,
      0.1
    );
    expect(w[0]).toEqual([0, 0.1, 0]);
    expect(w[1]).toEqual([2, 0.1, 0]);
  });

  it("tubeSegments is bounded", () => {
    expect(tubeSegments(1)).toBe(64);
    expect(tubeSegments(10000)).toBe(900);
  });
});
