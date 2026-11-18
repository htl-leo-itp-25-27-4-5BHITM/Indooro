import { describe, expect, it } from "vitest";
import type { Vec3 } from "./timeline";
import { ENTRANCE, PRODUCT_AISLE, ROUTE_POINTS, SHELVES, insideShelf, rand, roundedPolyline } from "./storeLayout";

describe("store layout", () => {
  it("has five rows of shelves in two segments", () => {
    expect(SHELVES).toHaveLength(10);
  });
  it("keeps the route in the aisles, never through a shelf", () => {
    for (let i = 0; i < ROUTE_POINTS.length - 1; i++) {
      const a = ROUTE_POINTS[i]!;
      const b = ROUTE_POINTS[i + 1]!;
      for (let s = 0; s <= 10; s++) {
        const x = a[0] + ((b[0] - a[0]) * s) / 10;
        const z = a[2] + ((b[2] - a[2]) * s) / 10;
        expect(insideShelf(x, z, 0.1)).toBe(false);
      }
    }
  });
  it("starts at the entrance and ends at the product aisle", () => {
    expect(ROUTE_POINTS[0]).toEqual(ENTRANCE);
    expect(ROUTE_POINTS[ROUTE_POINTS.length - 1]).toEqual(PRODUCT_AISLE);
  });
  it("rounds corners without changing the end points", () => {
    const pts: Vec3[] = [
      [0, 0, 0],
      [10, 0, 0],
      [10, 0, 10]
    ];
    const r = roundedPolyline(pts, 2);
    expect(r[0]).toEqual([0, 0, 0]);
    expect(r[r.length - 1]).toEqual([10, 0, 10]);
    expect(r.every((p) => p[0] <= 10 + 1e-9 && p[2] >= -1e-9)).toBe(true);
    expect(r.length).toBeGreaterThan(5);
  });
  it("rand is deterministic and in range", () => {
    expect(rand(3)).toBe(rand(3));
    for (let i = 0; i < 50; i++) expect(rand(i)).toBeGreaterThanOrEqual(0);
  });
});
