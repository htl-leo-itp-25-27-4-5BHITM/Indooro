import { describe, expect, it } from "vitest";
import { chaptersOf } from "./machine";
import { STEPS } from "./steps";

describe("tour script", () => {
  it("has unique step ids", () => {
    expect(new Set(STEPS.map((s) => s.id)).size).toBe(STEPS.length);
  });
  it("covers the seven chapters in page order", () => {
    expect(chaptersOf(STEPS)).toEqual(["Willkommen", "Problem", "Demo", "So funktioniert’s", "Betreiber", "Projektstand", "Pilot"]);
  });
  it("keeps chapters contiguous", () => {
    const seen: string[] = [];
    for (const s of STEPS) {
      if (seen[seen.length - 1] !== s.chapter) {
        expect(seen).not.toContain(s.chapter);
        seen.push(s.chapter);
      }
    }
  });
  it("uses short body copy and no emojis", () => {
    for (const s of STEPS) {
      expect(s.body.length).toBeGreaterThan(20);
      expect(s.body.length).toBeLessThan(260);
      expect(s.body.split(/[.!?]\s/).length).toBeLessThanOrEqual(3);
      expect(`${s.title}${s.body}`).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
  it("ends with the contact call to action", () => {
    const last = STEPS[STEPS.length - 1];
    expect(last.target).toBeNull();
    expect(last.cta).toEqual({ label: "Erstgespräch vereinbaren", href: "#kontakt" });
  });
  it("only the final step has no target", () => {
    expect(STEPS.filter((s) => s.target === null).map((s) => s.id)).toEqual(["ende"]);
  });
  it("never claims measured results", () => {
    for (const s of STEPS) expect(s.body).not.toMatch(/\d\s?(%|cm)|Genauigkeit/i);
  });
});
