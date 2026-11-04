import { describe, expect, it } from "vitest";
import { CHAPTER_IDS, scrollFraction } from "./chapters";

describe("chapters", () => {
  it("lists the seven page chapters in order", () => {
    expect(CHAPTER_IDS).toEqual(["top", "problem", "demo", "so-funktionierts", "betreiber", "projektstand", "pilot"]);
  });
  it("computes reading progress", () => {
    expect(scrollFraction(0, 3000, 1000)).toBe(0);
    expect(scrollFraction(1000, 3000, 1000)).toBe(0.5);
    expect(scrollFraction(5000, 3000, 1000)).toBe(1);
    expect(scrollFraction(10, 500, 1000)).toBe(0);
  });
});
