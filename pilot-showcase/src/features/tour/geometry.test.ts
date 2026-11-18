import { describe, expect, it } from "vitest";
import { approach, clipToViewport, inflate, placeCard, scrollTargetFor } from "./geometry";

const vp = { w: 1440, h: 900 };
const card = { w: 380, h: 260 };

describe("placeCard", () => {
  it("centres without a target", () => {
    expect(placeCard(null, card, vp, "auto")).toEqual({ x: 530, y: 320 });
  });
  it("prefers below the target when there is room", () => {
    const p = placeCard({ x: 500, y: 150, w: 300, h: 100 }, card, vp, "auto");
    expect(p.y).toBe(150 + 100 + 18);
    expect(p.x).toBeCloseTo(650 - 190);
  });
  it("falls back to the side when below does not fit", () => {
    const p = placeCard({ x: 100, y: 120, w: 400, h: 700 }, card, vp, "auto");
    expect(p.x).toBe(100 + 400 + 18);
  });
  it("respects an explicit top placement", () => {
    const p = placeCard({ x: 500, y: 600, w: 300, h: 100 }, card, vp, "top");
    expect(p.y).toBe(600 - 18 - 260);
  });
  it("keeps the card inside the viewport", () => {
    const p = placeCard({ x: 0, y: 120, w: 100, h: 60 }, card, vp, "bottom");
    expect(p.x).toBeGreaterThanOrEqual(16);
  });
  it("docks bottom-right when the target fills the screen", () => {
    expect(placeCard({ x: 0, y: 0, w: 1440, h: 900 }, card, vp, "auto")).toEqual({ x: 1440 - 380 - 16, y: 900 - 260 - 16 });
  });
});

describe("geometry helpers", () => {
  it("inflates a rect", () => expect(inflate({ x: 10, y: 10, w: 20, h: 20 }, 5)).toEqual({ x: 5, y: 5, w: 30, h: 30 }));
  it("clips to the viewport", () => {
    expect(clipToViewport({ x: -50, y: -20, w: 2000, h: 3000 }, vp, 6)).toEqual({ x: 6, y: 6, w: 1428, h: 888 });
  });
  it("centres a small target in the free area when scrolling", () => {
    // target at y=700 (h=100); free area 80..800 => desired top 80 + (720-100)/2 = 390
    expect(scrollTargetFor({ x: 0, y: 700, w: 100, h: 100 }, 1000, 80, 800)).toBe(1310);
  });
  it("aligns tall targets to the top of the free area", () => {
    expect(scrollTargetFor({ x: 0, y: 500, w: 100, h: 2000 }, 0, 80, 800)).toBe(412);
  });
  it("never scrolls above the page", () => expect(scrollTargetFor({ x: 0, y: 10, w: 10, h: 10 }, 0, 80, 800)).toBe(0));
  it("approach converges to the target", () => {
    let v = 0;
    for (let i = 0; i < 60; i++) v = approach(v, 100, 16);
    expect(v).toBeGreaterThan(99);
    expect(approach(50, 100, 0)).toBe(50);
  });
});
