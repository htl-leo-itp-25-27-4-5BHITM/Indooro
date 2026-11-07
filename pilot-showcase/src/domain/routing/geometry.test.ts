import { describe, expect, it } from "vitest";
import type { Cell } from "../types";
import { buildRouteGeometry, roundedPathD, simplifyPath } from "./index";

const L: Cell[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 2, y: 0 },
  { x: 3, y: 0 },
  { x: 3, y: 1 },
  { x: 3, y: 2 },
  { x: 3, y: 3 }
];

describe("simplifyPath", () => {
  it("keeps only start, corners and end (cell centres)", () => {
    expect(simplifyPath(L)).toEqual([
      { x: 0.5, y: 0.5 },
      { x: 3.5, y: 0.5 },
      { x: 3.5, y: 3.5 }
    ]);
  });
  it("handles tiny paths", () => {
    expect(simplifyPath([])).toEqual([]);
    expect(simplifyPath([{ x: 2, y: 2 }])).toEqual([{ x: 2.5, y: 2.5 }]);
  });
});

describe("roundedPathD", () => {
  it("emits quadratic corners with radius <= 0.9", () => {
    const d = roundedPathD(simplifyPath(L), 5);
    expect(d).toMatch(/^M0\.5 0\.5 L2\.6 0\.5 Q3\.5 0\.5 3\.5 1\.4 L3\.5 3\.5$/);
  });
});

describe("buildRouteGeometry", () => {
  it("has total length slightly below the cell path length (corners cut) and above the straight lines minus cuts", () => {
    const g = buildRouteGeometry(L);
    const manhattan = 6;
    expect(g.length).toBeLessThan(manhattan);
    expect(g.length).toBeGreaterThan(manhattan - 0.9 * (2 - Math.PI / 2) - 0.05);
    expect(g.cumulative[g.cumulative.length - 1]).toBeCloseTo(g.length, 9);
  });

  it("pointAt returns the endpoints and headings", () => {
    const g = buildRouteGeometry(L);
    expect(g.pointAt(0)).toMatchObject({ x: 0.5, y: 0.5, heading: 0 });
    const end = g.pointAt(g.length);
    expect(end.x).toBeCloseTo(3.5, 6);
    expect(end.y).toBeCloseTo(3.5, 6);
    expect(end.heading).toBeCloseTo(90, 6);
    expect(g.pointAt(-5)).toEqual(g.pointAt(0));
    expect(g.pointAt(1e9)).toEqual(g.pointAt(g.length));
    const mid = g.pointAt(1);
    expect(mid.x).toBeCloseTo(1.5, 6);
    expect(mid.heading).toBe(0);
  });

  it("distance advances monotonically along the path", () => {
    const g = buildRouteGeometry(L);
    let last = -1;
    for (let s = 0; s <= 20; s++) {
      const p = g.pointAt((g.length * s) / 20);
      const d = g.distanceOf(p);
      expect(d).toBeGreaterThanOrEqual(last - 1e-6);
      last = d;
    }
    expect(g.distanceOf({ x: 3.5, y: 3.5 })).toBeCloseTo(g.length, 6);
  });

  it("handles a single cell and a U-turn", () => {
    const one = buildRouteGeometry([{ x: 1, y: 1 }]);
    expect(one.length).toBe(0);
    expect(one.pointAt(3)).toMatchObject({ x: 1.5, y: 1.5 });
    const u = buildRouteGeometry([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 0 }
    ]);
    expect(u.length).toBeCloseTo(4, 6);
    expect(u.pointAt(3).heading).toBeCloseTo(180, 6);
  });
});
