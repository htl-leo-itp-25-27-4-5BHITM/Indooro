import { describe, expect, it } from "vitest";
import { computeCoverage, evaluateReadiness } from "./evaluateReadiness";
import { createInitialState } from "./simModel";

describe("evaluateReadiness", () => {
  it("Ausgangszustand ist RED mit den drei erwarteten Befunden", () => {
    const r = evaluateReadiness(createInitialState());
    expect(r.status).toBe("RED");
    expect(r.label).toBe("Nicht bereit");
    expect(r.findings.map((f) => f.code).sort()).toEqual(["BEACON_MAJOR_MINOR_MISSING", "PRODUCT_NO_SHELF", "SHELF_WITHOUT_PRODUCTS"]);
    expect(r.blocking).toBe(2);
    expect(r.warnings).toBe(1);
  });

  it("verwendet die echten deutschen Sätze", () => {
    const r = evaluateReadiness(createInitialState());
    const msg = (c: string) => r.findings.find((f) => f.code === c)?.message;
    expect(msg("BEACON_MAJOR_MINOR_MISSING")).toBe("Registriertes Beacon DEMO-B3 hat kein Major/Minor (Major und Minor fehlt).");
    expect(msg("PRODUCT_NO_SHELF")).toBe("Produkt 6 hat einen layoutCode (520/9), der kein Regal trifft.");
    expect(msg("SHELF_WITHOUT_PRODUCTS")).toBe("Regal 320/1 hat keine Produkte.");
  });

  it("YELLOW, wenn nur Warnungen übrig sind", () => {
    const s = createInitialState();
    s.beacons[2] = { ...s.beacons[2], major: 10, minor: 3 };
    s.products[5] = { ...s.products[5], layoutCode: "220/1" };
    const r = evaluateReadiness(s);
    expect(r.status).toBe("YELLOW");
    expect(r.label).toBe("Bereit mit Hinweisen");
    expect(r.blocking).toBe(0);
  });

  it("GREEN ohne Befunde", () => {
    const s = createInitialState();
    s.beacons[2] = { ...s.beacons[2], major: 10, minor: 3 };
    s.products[5] = { ...s.products[5], layoutCode: "220/1" };
    s.products.push({ line: 10, id: "9", name: "Salzbrezeln", emoji: "", layoutCode: "320/1" });
    const r = evaluateReadiness(s);
    expect(r.status).toBe("GREEN");
    expect(r.findings).toHaveLength(0);
  });

  it("meldet fehlendes Major oder Minor einzeln", () => {
    const s = createInitialState();
    s.beacons[2] = { ...s.beacons[2], major: 10, minor: null };
    expect(evaluateReadiness(s).findings.find((f) => f.code === "BEACON_MAJOR_MINOR_MISSING")?.message).toContain("(Minor fehlt)");
  });

  it("erkennt doppelte Beacon-Identität als blockierend", () => {
    const s = createInitialState();
    s.beacons[2] = { ...s.beacons[2], major: 10, minor: 1 };
    const f = evaluateReadiness(s).findings.find((x) => x.code === "BEACON_IDENTITY_DUPLICATE");
    expect(f?.severity).toBe("BLOCKING");
  });

  it("ENTRANCE_COUNT und NO_ACTIVE_LAYOUT sind blockierend", () => {
    const s = createInitialState();
    s.entranceCount = 0;
    expect(evaluateReadiness(s).findings.some((f) => f.code === "ENTRANCE_COUNT" && f.severity === "BLOCKING")).toBe(true);
    s.layoutActive = false;
    const r = evaluateReadiness(s);
    expect(r.findings.map((f) => f.code)).toEqual(["NO_ACTIVE_LAYOUT"]);
    expect(r.status).toBe("RED");
  });

  it("Regal mit Produkten ohne Label ist blockierend", () => {
    const s = createInitialState();
    s.shelves[0] = { ...s.shelves[0], label: null };
    expect(evaluateReadiness(s).findings.some((f) => f.code === "TARGET_SHELF_WITHOUT_LABEL")).toBe(true);
  });

  it("Abdeckung: Demo-Plan hat >= 3 Beacons in 8 m auf allen begehbaren Zellen", () => {
    const c = computeCoverage(createInitialState());
    expect(c.walkableCells).toBe(14 * 9 - 6 * 5);
    expect(c.lowCells).toBe(0);
    expect(c.coveredShare).toBe(1);
  });

  it("LOW_BEACON_COVERAGE (Warnung), wenn mehr als 5 % schwach abgedeckt sind", () => {
    const s = createInitialState();
    s.beacons = s.beacons.slice(0, 2);
    const r = evaluateReadiness(s);
    const f = r.findings.find((x) => x.code === "LOW_BEACON_COVERAGE");
    expect(f?.severity).toBe("WARNING");
    expect(f?.message).toContain("weniger als 3 Beacons im Radius 8 m");
  });
});
