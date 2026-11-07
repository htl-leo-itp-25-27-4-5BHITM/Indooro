import { describe, expect, it } from "vitest";
import { autoplayAction, canNext, createFlow, currentReport, flowReducer, maxReachable, STEP_COUNT, type FlowAction, type FlowState } from "./operatorFlow";

function run(state: FlowState, ...actions: FlowAction[]): FlowState {
  return actions.reduce(flowReducer, state);
}

describe("operatorFlow", () => {
  it("startet bei Schritt 1 und blockiert Weiter, bis der Markt angelegt ist", () => {
    const s = createFlow();
    expect(s.step).toBe(0);
    expect(canNext(s)).toBe(false);
    expect(run(s, { type: "next" }).step).toBe(0);
    expect(run(s, { type: "create" }, { type: "next" }).step).toBe(1);
  });

  it("übernimmt Namen beim Anlegen", () => {
    const s = run(createFlow(), { type: "create", market: { name: "Testmarkt" } });
    expect(s.sim.market.name).toBe("Testmarkt");
    expect(s.sim.market.code).toBe("DEMO-LZ-001");
  });

  it("Zurück geht nie unter Schritt 1", () => {
    expect(run(createFlow(), { type: "prev" }).step).toBe(0);
  });

  it("Schritte 2 und 3 sind frei, Produkte brauchen den Import", () => {
    let s = run(createFlow(), { type: "create" }, { type: "next" }, { type: "next" }, { type: "next" });
    expect(s.step).toBe(3);
    expect(canNext(s)).toBe(false);
    s = run(s, { type: "importCsv" }, { type: "next" });
    expect(s.step).toBe(4);
  });

  it("Prüfung muss gelaufen sein; Fehler beheben verlangt keine blockierenden Befunde", () => {
    let s = run(createFlow(), { type: "create" }, { type: "goto", step: 1 }, { type: "next" }, { type: "next" }, { type: "importCsv" }, { type: "next" });
    expect(s.step).toBe(4);
    expect(canNext(s)).toBe(false);
    s = run(s, { type: "runCheck" }, { type: "next" });
    expect(s.step).toBe(5);
    expect(currentReport(s).status).toBe("RED");
    expect(canNext(s)).toBe(false);
    s = run(s, { type: "fix", code: "BEACON_MAJOR_MINOR_MISSING" });
    expect(canNext(s)).toBe(false);
    s = run(s, { type: "fix", code: "PRODUCT_NO_SHELF" });
    expect(currentReport(s).status).toBe("YELLOW");
    expect(canNext(s)).toBe(true);
  });

  it("goto springt nur zu erreichbaren Schritten", () => {
    const s = createFlow();
    expect(maxReachable(s)).toBe(0);
    expect(run(s, { type: "goto", step: 3 }).step).toBe(0);
    const t = run(s, { type: "create" });
    expect(maxReachable(t)).toBe(3);
    expect(run(t, { type: "goto", step: 3 }).step).toBe(3);
    expect(run(t, { type: "goto", step: 5 }).step).toBe(0);
  });

  it("Fix wirkt nur, wenn der Befund wirklich offen ist", () => {
    const s = run(createFlow(), { type: "create" });
    expect(run(s, { type: "fix", code: "PRODUCT_NO_SHELF" })).toBe(s);
  });

  it("runCheck ohne Import ändert nichts", () => {
    const s = createFlow();
    expect(run(s, { type: "runCheck" })).toBe(s);
  });

  it("Autoplay führt von Anfang bis GREEN und stoppt am Ende", () => {
    let s = createFlow();
    let guard = 0;
    for (let a = autoplayAction(s); a && guard < 50; a = autoplayAction(s), guard++) s = flowReducer(s, a);
    expect(s.step).toBe(STEP_COUNT - 1);
    expect(currentReport(s).status).toBe("GREEN");
    expect(s.applied).toHaveLength(3);
    expect(autoplayAction(s)).toBeNull();
  });

  it("reset stellt den Anfangszustand wieder her", () => {
    let s = createFlow();
    s = run(s, { type: "create" }, { type: "importCsv" });
    const r = run(s, { type: "reset" });
    expect(r.created).toBe(false);
    expect(r.imported).toBe(false);
    expect(r.step).toBe(0);
  });
});
