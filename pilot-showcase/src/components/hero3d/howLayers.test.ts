import { describe, expect, it } from "vitest";
import { activeStep, explodeAmount, layerOpacity, layerVisibility, layerY } from "./howLayers";

describe("how layers", () => {
  it("maps progress to the four steps", () => {
    expect([0, 0.24, 0.26, 0.51, 0.76, 1].map(activeStep)).toEqual([0, 0, 1, 2, 3, 3]);
  });
  it("starts assembled, explodes, and closes a little at the end", () => {
    expect(explodeAmount(0)).toBe(0);
    expect(explodeAmount(0.4)).toBeCloseTo(1, 5);
    expect(explodeAmount(1)).toBeLessThan(0.7);
    expect(explodeAmount(1)).toBeGreaterThan(0.5);
  });
  it("reveals layers in order", () => {
    expect(layerVisibility(0, 0)).toBe(1);
    expect(layerVisibility(0.1, 1)).toBe(0);
    expect(layerVisibility(0.3, 1)).toBe(1);
    expect(layerVisibility(0.3, 2)).toBe(0);
    expect(layerVisibility(0.8, 3)).toBe(1);
  });
  it("dims inactive layers", () => {
    expect(layerOpacity(0.3, 1)).toBe(1);
    expect(layerOpacity(0.3, 0)).toBeLessThan(0.5);
  });
  it("stacks layers upward", () => {
    expect(layerY(3, 1)).toBeGreaterThan(layerY(2, 1));
    expect(layerY(2, 0)).toBeLessThan(layerY(2, 1));
  });
});
