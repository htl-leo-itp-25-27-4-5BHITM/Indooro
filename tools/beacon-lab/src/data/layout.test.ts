import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demoFloorPlan, floorPlanFromIndooroLayout } from "./layout";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("floorPlanFromIndooroLayout", () => {
  it("parses the synthetic test room (beacons with beaconId, synthetic origin)", () => {
    const { plan, beacons, issues } = floorPlanFromIndooroLayout(fixture("synthetic-layout-testraum.json"), "layout.json");
    expect(plan.origin).toBe("synthetic");
    expect(plan.width).toBe(12);
    expect(plan.height).toBe(10);
    expect(plan.scale.confirmed).toBe(false);
    expect(plan.scale.metersPerUnit).toBe(1);
    expect(plan.elements.filter((e) => e.type === "shelf")).toHaveLength(8);
    expect(plan.elements.find((e) => e.type === "entrance")?.label).toBe("Eingang");
    expect(plan.elements.every((e) => typeof e.id === "string")).toBe(true);
    expect(beacons.map((b) => b.id)).toEqual(["Indooro1", "Indooro2", "Indooro3", "Indooro4"]);
    expect(beacons[0]).toMatchObject({ position: { x: 2, y: 1.5 }, major: 1, minor: 1, enabled: true });
    expect(beacons[0].uuid).toBeTruthy();
    expect(issues.some((i) => i.severity === "error")).toBe(false);
    expect(issues.some((i) => i.code === "scale-unconfirmed")).toBe(true);
  });

  it("parses the demo layout (real origin) and derives beacon ids from major/minor when needed", () => {
    const { plan, beacons } = floorPlanFromIndooroLayout(fixture("demo-layout.json"), "demo-layout.json");
    expect(plan.origin).toBe("real");
    expect(plan.name).toBe("Demo-Markt Sprint-Review");
    expect(plan.width).toBe(6);
    expect(beacons).toHaveLength(4);
    const raw = fixture("demo-layout.json") as { elements: Record<string, unknown>[] };
    const noId = {
      shopName: "X",
      gridSize: { width: 5, height: 5 },
      elements: [{ id: 1, type: "beacon", x: 1.5, y: 2.5, beaconMajor: 7, beaconMinor: 9, beaconUUID: "U" }, ...raw.elements.slice(0, 1)],
    };
    const r = floorPlanFromIndooroLayout(noId, "x.json");
    expect(r.beacons[0].id).toBe("7-9");
    expect(r.beacons[0].position).toEqual({ x: 1.5, y: 2.5 });
  });

  it("accepts the { layout: {...} } wrapper", () => {
    const inner = fixture("demo-layout.json");
    const a = floorPlanFromIndooroLayout({ layout: inner, revision: 4 }, "w.json");
    expect(a.plan.width).toBe(6);
    expect(a.plan.elements.length).toBeGreaterThan(0);
  });

  it("keeps rotation and maps unknown types to other with an info issue", () => {
    const json = {
      shopName: "Test",
      gridSize: { width: 10, height: 10 },
      elements: [
        { id: "a", type: "shelf", x: 1, y: 1, width: 3, height: 1, rotation: 90, label: "R" },
        { id: "b", type: "pillar", x: 5, y: 5, width: 1, height: 1 },
        { id: "c", type: "wall", x: 0, y: 0, width: 10, height: 0.2 },
        { id: "d", type: "freezer", x: 2, y: 2, width: 1, height: 1 },
        { id: "e", type: "shelf", x: "bad", y: 1, width: 1, height: 1 },
      ],
    };
    const { plan, issues } = floorPlanFromIndooroLayout(json, "t.json");
    expect(plan.origin).toBe("real");
    expect(plan.elements.find((e) => e.id === "a")?.rotationDeg).toBe(90);
    expect(plan.elements.find((e) => e.id === "b")?.type).toBe("other");
    expect(plan.elements.find((e) => e.id === "c")?.type).toBe("wall");
    expect(plan.elements.find((e) => e.id === "d")?.type).toBe("freezer");
    expect(plan.elements).toHaveLength(4);
    expect(issues.find((i) => i.code === "unknown-element-type")?.message).toContain("pillar");
    expect(issues.find((i) => i.code === "element-invalid")?.count).toBe(1);
    expect(issues.find((i) => i.code === "no-beacons")).toBeDefined();
  });

  it("derives a grid size when missing and reports invalid input", () => {
    const { plan, issues } = floorPlanFromIndooroLayout(
      { elements: [{ id: 1, type: "shelf", x: 2, y: 3, width: 4, height: 2 }] },
      "n.json",
    );
    expect(plan.width).toBe(6);
    expect(plan.height).toBe(5);
    expect(issues.some((i) => i.code === "missing-grid-size")).toBe(true);
    const bad = floorPlanFromIndooroLayout("nope", "b.json");
    expect(bad.issues[0].severity).toBe("error");
  });
});

describe("demoFloorPlan", () => {
  const { plan, beacons } = demoFloorPlan();

  it("is a fictional synthetic market", () => {
    expect(plan.origin).toBe("synthetic");
    expect(plan.name).toBe("Fiktiver Demo-Markt (synthetisch)");
    expect(plan.width).toBe(30);
    expect(plan.height).toBe(20);
    expect(plan.scale.confirmed).toBe(false);
  });

  it("has entrance bottom-left, 3-4 checkouts, 5 shelf rows, cooler and walls", () => {
    const by = (t: string) => plan.elements.filter((e) => e.type === t);
    const ent = by("entrance")[0];
    expect(ent.x).toBeLessThan(5);
    expect(ent.y).toBeGreaterThan(15);
    expect(by("checkout").length).toBeGreaterThanOrEqual(3);
    expect(by("checkout").length).toBeLessThanOrEqual(4);
    expect(by("shelf")).toHaveLength(5);
    expect(by("cooler")).toHaveLength(1);
    expect(by("wall").length).toBeGreaterThanOrEqual(4);
    expect(by("wall").every((w) => Math.min(w.width, w.height) <= 0.5)).toBe(true);
  });

  it("has 8-10 beacons inside the plan with ids LAB-B01..", () => {
    expect(beacons.length).toBeGreaterThanOrEqual(8);
    expect(beacons.length).toBeLessThanOrEqual(10);
    expect(beacons[0].id).toBe("LAB-B01");
    for (const b of beacons) {
      expect(b.position.x).toBeGreaterThanOrEqual(0);
      expect(b.position.x).toBeLessThanOrEqual(30);
      expect(b.position.y).toBeGreaterThanOrEqual(0);
      expect(b.position.y).toBeLessThanOrEqual(20);
    }
    expect(new Set(beacons.map((b) => b.id)).size).toBe(beacons.length);
  });

  it("keeps aisles at least 2 units wide between shelf rows", () => {
    const rows = plan.elements.filter((e) => e.type === "shelf").sort((a, b) => a.y - b.y);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].y - (rows[i - 1].y + rows[i - 1].height)).toBeGreaterThanOrEqual(2);
    }
    const cooler = plan.elements.find((e) => e.type === "cooler")!;
    expect(rows[0].y - (cooler.y + cooler.height)).toBeGreaterThanOrEqual(2);
  });

  it("is deterministic", () => {
    expect(demoFloorPlan()).toEqual(demoFloorPlan());
  });
});
