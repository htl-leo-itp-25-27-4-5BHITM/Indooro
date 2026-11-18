import { describe, expect, it } from "vitest";
import { donauparkMarket as A, poestlingbergMarket as B, editDistance, normalize, searchProducts } from "./index";

const names = (m: typeof A, q: string) => searchProducts(m, q).map((r) => r.product.name);

describe("normalize", () => {
  it("folds case, diacritics and ß", () => {
    expect(normalize("Äpfel")).toBe(normalize("apfel"));
    expect(normalize("Aepfel")).toBe(normalize("Äpfel"));
    expect(normalize("Straße")).toBe("strasse");
    expect(normalize("Grüner  Veltliner")).toBe("gruner veltliner");
  });
});

describe("editDistance", () => {
  it("counts transpositions as one edit", () => {
    expect(editDistance("joghurt", "joghurd")).toBe(1);
    expect(editDistance("tomaten", "tomaetn")).toBe(1);
    expect(editDistance("abc", "xyz")).toBe(3);
  });
});

describe("searchProducts", () => {
  it("returns [] for empty queries", () => {
    expect(searchProducts(A, "")).toEqual([]);
    expect(searchProducts(A, "   ")).toEqual([]);
  });

  it("finds Tomaten via the Austrian synonym Paradeiser", () => {
    expect(names(A, "Paradeiser")).toContain("Tomaten");
    expect(names(A, "paradeiser")[0]).toBe("Tomaten");
  });

  it("finds Erdäpfel, Topfen, Karfiol, Marillen, Faschiertes via synonyms", () => {
    expect(names(A, "Kartoffeln")[0]).toMatch(/Erdäpfel/);
    expect(names(A, "Quark")[0]).toMatch(/Topfen/);
    expect(names(A, "Blumenkohl")[0]).toBe("Karfiol");
    expect(names(A, "Aprikose")).toContain("Marillen");
    expect(names(A, "Hackfleisch")[0]).toMatch(/Faschiertes/);
    expect(names(A, "Sahne")[0]).toBe("Schlagobers");
    expect(names(A, "Brötchen")[0]).toMatch(/Semmeln/);
  });

  it("'milch' finds milk products first", () => {
    const r = names(A, "milch");
    expect(r[0]).toMatch(/milch/i);
    expect(r).toEqual(expect.arrayContaining(["Frischmilch 3,5 %", "Haltbarmilch 1,5 %", "Hafermilch"]));
  });

  it("is diacritics insensitive in both directions", () => {
    expect(names(A, "apfel")).toContain("Äpfel Gala");
    expect(names(A, "Äpfel")).toContain("Äpfel Gala");
    expect(names(A, "gruner veltliner")).toContain("Grüner Veltliner");
    expect(names(A, "OLIVENOL")).toContain("Olivenöl nativ extra");
  });

  it("tolerates one typo for terms of 4+ characters", () => {
    expect(names(A, "Joghurd")).toEqual(expect.arrayContaining(["Naturjoghurt"]));
    expect(names(A, "Tomaetn")).toContain("Tomaten");
    expect(names(A, "Bananne")).toContain("Bananen");
    expect(searchProducts(A, "xyl")).toEqual([]);
  });

  it("matches brand and category names", () => {
    expect(names(A, "Bio Regional").length).toBeGreaterThan(3);
    expect(names(A, "Tiefkühl")).toContain("Tiefkühlpizza Salami");
  });

  it("combines several tokens with AND", () => {
    const r = names(A, "milch bio");
    expect(r).toContain("Hafermilch");
    expect(r).not.toContain("Frischmilch 3,5 %");
  });

  it("is scoped to the given market", () => {
    expect(names(A, "Hafermilch")).toContain("Hafermilch");
    expect(names(B, "Hafermilch")).not.toContain("Hafermilch");
    expect(names(B, "Zahnpasta")).toEqual([]);
    expect(names(A, "Kürbiskernöl")).toEqual([]);
    expect(names(B, "Kürbiskernöl")).toContain("Steirisches Kürbiskernöl");
  });

  it("respects the limit and ranks exact word matches high", () => {
    expect(searchProducts(A, "a", 3).length).toBeLessThanOrEqual(3);
    expect(names(A, "Salz").slice(0, 2)).toContain("Speisesalz");
    expect(names(A, "Wiener Würstel")[0]).toBe("Wiener Würstel 4er");
  });
});
