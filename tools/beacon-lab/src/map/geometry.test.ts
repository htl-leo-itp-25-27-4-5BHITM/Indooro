import { describe, expect, it } from "vitest";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  clampPan,
  fitViewBox,
  layoutToScreen,
  meetMatrix,
  niceScaleBarLength,
  panBy,
  pointInPlan,
  pointInPolygon,
  rotatedRectCorners,
  screenToLayout,
  screenToLayoutFallback,
  zoomAt,
  zoomOf,
} from "./geometry";

const plan = { width: 40, height: 20 };

describe("fitViewBox", () => {
  it("keeps the container aspect and centres the plan", () => {
    const vb = fitViewBox(plan, 2, 0);
    expect(vb.w / vb.h).toBeCloseTo(2);
    expect(vb.x + vb.w / 2).toBeCloseTo(20);
    expect(vb.y + vb.h / 2).toBeCloseTo(10);
  });
  it("grows width for a wide container so nothing is cropped", () => {
    const vb = fitViewBox(plan, 4, 0);
    expect(vb.h).toBeCloseTo(20);
    expect(vb.w).toBeCloseTo(80);
  });
  it("grows height for a tall container", () => {
    const vb = fitViewBox(plan, 0.5, 0);
    expect(vb.w).toBeCloseTo(40);
    expect(vb.h).toBeCloseTo(80);
  });
});

describe("zoomAt", () => {
  const fit = fitViewBox(plan, 2, 0);
  it("keeps the anchor at the same relative position", () => {
    const anchor = { x: 10, y: 5 };
    const vb = zoomAt(fit, fit, 2, anchor);
    expect(zoomOf(vb, fit)).toBeCloseTo(2);
    expect((anchor.x - vb.x) / vb.w).toBeCloseTo((anchor.x - fit.x) / fit.w);
    expect((anchor.y - vb.y) / vb.h).toBeCloseTo((anchor.y - fit.y) / fit.h);
  });
  it("clamps zoom to 0.5x..20x", () => {
    let vb = fit;
    for (let i = 0; i < 20; i++) vb = zoomAt(vb, fit, 2, { x: 0, y: 0 });
    expect(zoomOf(vb, fit)).toBeCloseTo(MAX_ZOOM);
    for (let i = 0; i < 20; i++) vb = zoomAt(vb, fit, 0.5, { x: 0, y: 0 });
    expect(zoomOf(vb, fit)).toBeCloseTo(MIN_ZOOM);
  });
  it("ignores invalid factors", () => {
    expect(zoomAt(fit, fit, NaN, { x: 0, y: 0 })).toBe(fit);
  });
});

describe("pan", () => {
  it("shifts the viewBox", () => {
    expect(panBy({ x: 0, y: 0, w: 10, h: 10 }, 2, -3)).toEqual({ x: 2, y: -3, w: 10, h: 10 });
  });
  it("clamp keeps part of the plan visible", () => {
    const vb = clampPan({ x: 1000, y: -1000, w: 10, h: 10 }, plan);
    expect(vb.x).toBeLessThanOrEqual(plan.width);
    expect(vb.y + vb.h).toBeGreaterThanOrEqual(0);
  });
});

describe("coordinate conversion", () => {
  const rect = { left: 100, top: 50, width: 800, height: 400 };
  const vb = { x: -2, y: -1, w: 44, h: 22 };
  it("round-trips via the meet matrix", () => {
    const m = meetMatrix(rect, vb);
    const p = { x: 12.3, y: 7.7 };
    const back = screenToLayout(layoutToScreen(p, m), m)!;
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });
  it("maps the rect top-left to the viewBox origin when aspect matches", () => {
    const s = screenToLayoutFallback({ x: 100, y: 50 }, rect, vb)!;
    expect(s.x).toBeCloseTo(-2);
    expect(s.y).toBeCloseTo(-1);
  });
  it("letterboxes with uniform scale (no distortion)", () => {
    const m = meetMatrix({ left: 0, top: 0, width: 1000, height: 100 }, { x: 0, y: 0, w: 10, h: 10 });
    expect(m.a).toBe(m.d);
    expect(m.a).toBeCloseTo(10);
  });
  it("returns null for singular matrices", () => {
    expect(screenToLayout({ x: 0, y: 0 }, { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 })).toBeNull();
  });
});

describe("rotatedRectCorners", () => {
  it("returns the axis-aligned corners without rotation", () => {
    const c = rotatedRectCorners({ x: 1, y: 2, width: 4, height: 2, rotationDeg: 0 });
    expect(c).toEqual([
      { x: 1, y: 2 },
      { x: 5, y: 2 },
      { x: 5, y: 4 },
      { x: 1, y: 4 },
    ]);
  });
  it("rotates clockwise (y down) by 90 degrees around the centre", () => {
    const c = rotatedRectCorners({ x: 0, y: 0, width: 4, height: 2, rotationDeg: 90 });
    expect(c[0].x).toBeCloseTo(3);
    expect(c[0].y).toBeCloseTo(-1);
    expect(c[1].x).toBeCloseTo(3);
    expect(c[1].y).toBeCloseTo(3);
  });
});

describe("misc geometry", () => {
  it("pointInPlan honours tolerance", () => {
    expect(pointInPlan({ x: 40, y: 20 }, plan)).toBe(true);
    expect(pointInPlan({ x: 40.5, y: 20 }, plan)).toBe(false);
    expect(pointInPlan({ x: 40.5, y: 20 }, plan, 1)).toBe(true);
  });
  it("pointInPolygon", () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    expect(pointInPolygon({ x: 1, y: 1 }, sq)).toBe(true);
    expect(pointInPolygon({ x: 3, y: 1 }, sq)).toBe(false);
  });
  it("niceScaleBarLength picks 1/2/5 x 10^k <= target", () => {
    expect(niceScaleBarLength(7.3)).toBe(5);
    expect(niceScaleBarLength(3)).toBe(2);
    expect(niceScaleBarLength(1.9)).toBe(1);
    expect(niceScaleBarLength(0.34)).toBeCloseTo(0.2);
    expect(niceScaleBarLength(120)).toBe(100);
    expect(niceScaleBarLength(0)).toBe(1);
  });
});
