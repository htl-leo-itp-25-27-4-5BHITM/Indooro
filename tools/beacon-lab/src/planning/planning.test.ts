import { describe, expect, it } from "vitest";
import type { Beacon, FloorElement, FloorPlan } from "../core/types";
import { createDemoCampaign } from "../data/synthetic";
import { makeBeacon, makePlan, squareBeacons } from "../positioning/testutil";
import { DEFAULT_POSITIONING_CONFIG } from "../core/defaults";
import { applyEdits, beaconsToCsv, candidatePositions, compareResults, makePlannedBeacon, objectiveScore, simulate, simulateAsync, suggestBeacon, summarize, walkableGrid, type SimInput } from "./index";
import { pointInElement, segmentIntersectsElement } from "./walkable";

function el(p: Partial<FloorElement> & Pick<FloorElement, "x" | "y" | "width" | "height">): FloorElement {
  return { id: "e" + Math.random(), type: "shelf", rotationDeg: 0, ...p };
}

function input(plan: FloorPlan, beacons: Beacon[], over: Partial<SimInput["model"]> = {}, settings: Partial<SimInput["settings"]> = {}): SimInput {
  return {
    plan,
    beacons,
    algorithm: "weighted-centroid",
    algorithmParams: { ...DEFAULT_POSITIONING_CONFIG.params },
    model: { rssiAt1m: -60, pathLossExponent: 2.2, shadowingStdDb: 0, sensitivityDbm: -100, obstaclePenaltyDb: 0, ...over },
    settings: { samplesPerCell: 10, stride: 1, seed: 7, cellSize: 1, ...settings },
  };
}

describe("walkableGrid", () => {
  it("excludes cells whose centre lies in a blocking element, keeps non-blocking ones", () => {
    const plan = { ...makePlan({ width: 10, height: 10 }), elements: [el({ x: 2, y: 2, width: 3, height: 2 }), el({ x: 7, y: 7, width: 2, height: 2, type: "entrance" })] };
    const g = walkableGrid(plan, 1);
    expect(g.cells.length).toBe(100 - 6);
    expect(g.cells.some((c) => c.ix === 3 && c.iy === 2)).toBe(false);
    expect(g.cells.some((c) => c.ix === 7 && c.iy === 7)).toBe(true);
  });

  it("handles rotated elements (45 degrees, diamond)", () => {
    // 4x1 bar centred at (5,5) rotated 90 deg => vertical bar x in [4.5,5.5], y in [3,7]
    const bar = el({ x: 3, y: 4.5, width: 4, height: 1, rotationDeg: 90 });
    expect(pointInElement({ x: 5, y: 3.2 }, bar)).toBe(true);
    expect(pointInElement({ x: 3.2, y: 5 }, bar)).toBe(false);
    const plan = { ...makePlan({ width: 10, height: 10 }), elements: [bar] };
    const g = walkableGrid(plan, 1);
    // centres (4.5,y) and (5.5,y) lie on the border (inside, inclusive) for y in 3.5..6.5 => column 4 and 5, rows 3..6
    expect(g.cells.some((c) => c.ix === 4 && c.iy === 4)).toBe(false);
    expect(g.cells.some((c) => c.ix === 2 && c.iy === 5)).toBe(true);
    const diamond = el({ x: 4, y: 4, width: 4, height: 4, rotationDeg: 45 });
    expect(pointInElement({ x: 6, y: 6 }, diamond)).toBe(true);
    expect(pointInElement({ x: 4.2, y: 4.2 }, diamond)).toBe(false); // corner of unrotated square is outside
  });

  it("segment intersection with rotated rect", () => {
    const bar = el({ x: 3, y: 4.5, width: 4, height: 1, rotationDeg: 90 });
    expect(segmentIntersectsElement({ x: 1, y: 5 }, { x: 9, y: 5 }, bar)).toBe(true);
    expect(segmentIntersectsElement({ x: 1, y: 5 }, { x: 4, y: 5 }, bar)).toBe(false);
    expect(segmentIntersectsElement({ x: 1, y: 1 }, { x: 9, y: 1 }, bar)).toBe(false);
  });

  it("supports other cell sizes", () => {
    const g = walkableGrid(makePlan({ width: 10, height: 6 }), 2);
    expect(g.cells.length).toBe(15);
    expect(g.cells[0]).toMatchObject({ x: 1, y: 1 });
  });
});

describe("simulate", () => {
  const plan = makePlan({ width: 10, height: 10 });

  it("is deterministic for the same seed and differs for another", () => {
    const inp = input(plan, squareBeacons(10), { shadowingStdDb: 4 });
    const a = simulate(inp);
    const b = simulate(inp);
    expect(b.cells).toEqual(a.cells);
    const c = simulate({ ...inp, settings: { ...inp.settings, seed: 8 } });
    expect(c.cells).not.toEqual(a.cells);
  });

  it("async (chunked) equals sync", async () => {
    const inp = input(plan, squareBeacons(10), { shadowingStdDb: 3 });
    const a = simulate(inp);
    const b = await simulateAsync(inp, { chunkCells: 7 });
    expect(b!.cells).toEqual(a.cells);
  });

  it("stride gives the same values for the sampled cells", () => {
    const inp = input(plan, squareBeacons(10), { shadowingStdDb: 3 });
    const full = simulate(inp);
    const sub = simulate({ ...inp, settings: { ...inp.settings, stride: 2 } });
    expect(sub.cells.length).toBe(25);
    expect(sub.displayCellSize).toBe(2);
    for (const c of sub.cells) expect(c).toEqual(full.cells.find((f) => f.ix === c.ix && f.iy === c.iy));
  });

  it("noise-free model with 4 square beacons: ~0 error in the centre", () => {
    const res = simulate(input(plan, squareBeacons(10), {}, { samplesPerCell: 3 }));
    const centre = res.cells.filter((c) => (c.ix === 4 || c.ix === 5) && (c.iy === 4 || c.iy === 5));
    expect(centre.length).toBe(4);
    for (const c of centre) expect(c.medianError!).toBeLessThan(0.8); // cell centre (4.5,4.5) is 0.7 LE off the exact centre
    const exact = simulate(input({ ...plan, width: 11, height: 11 }, squareBeacons(11).map((b) => ({ ...b, position: { x: b.position.x, y: b.position.y } })), {}, { samplesPerCell: 2 }));
    const mid = exact.cells.find((c) => c.ix === 5 && c.iy === 5)!;
    expect(mid.x).toBe(5.5);
    expect(mid.medianError!).toBeLessThan(1e-6 + 0.8);
    expect(mid.failureRate).toBe(0);
    expect(mid.meanAudible).toBe(4);
    expect(mid.hdop!).toBeGreaterThan(0.99); // 4 Einheitsvektoren im 90°-Abstand => HDOP = 1
    expect(mid.hdop!).toBeLessThan(1.1);
  });

  it("trilateration without noise is exact", () => {
    const inp = { ...input(plan, squareBeacons(10), {}, { samplesPerCell: 2 }), algorithm: "trilateration" as const };
    const res = simulate(inp);
    const mid = res.cells.find((c) => c.ix === 5 && c.iy === 5)!;
    expect(mid.medianError!).toBeLessThan(0.05);
  });

  it("removing beacons increases failures and HDOP in a corner", () => {
    const full = simulate(input(plan, squareBeacons(10), { sensitivityDbm: -80 }, { samplesPerCell: 3 }));
    const reduced = simulate(input(plan, squareBeacons(10).slice(0, 2), { sensitivityDbm: -80 }, { samplesPerCell: 3 }));
    const fullWide = simulate(input(plan, squareBeacons(10), { sensitivityDbm: -90 }, { samplesPerCell: 3 }));
    const reducedWide = simulate(input(plan, squareBeacons(10).slice(0, 2), { sensitivityDbm: -90 }, { samplesPerCell: 3 }));
    const far = (r: typeof full) => r.cells.find((c) => c.ix === 9 && c.iy === 9)!;
    expect(far(reduced).failureRate).toBeGreaterThan(far(full).failureRate);
    expect(far(reduced).meanAudible).toBeLessThan(far(full).meanAudible);
    const mid = (r: typeof full) => r.cells.find((c) => c.ix === 5 && c.iy === 5)!;
    expect(mid(fullWide).hdop).not.toBeNull();
    expect(mid(reducedWide).hdop).toBeNull(); // < 3 audible beacons
  });

  it("obstacle penalty reduces audible beacons behind a wall", () => {
    const wall = el({ x: 4.5, y: 0, width: 1, height: 10, type: "wall" });
    const withWall = { ...plan, elements: [wall] };
    const beacons = [makeBeacon("a", 1, 5)];
    const off = simulate(input(withWall, beacons, { sensitivityDbm: -80, obstaclePenaltyDb: 0 }, { samplesPerCell: 2 }));
    const on = simulate(input(withWall, beacons, { sensitivityDbm: -80, obstaclePenaltyDb: 20 }, { samplesPerCell: 2 }));
    const at = (r: typeof off) => r.cells.find((c) => c.ix === 7 && c.iy === 5)!;
    expect(at(off).meanAudible).toBe(1);
    expect(at(on).meanAudible).toBe(0);
    expect(on.warnings.join()).toMatch(/Hindernisdämpfung/);
  });

  it("warns for unconfirmed scale and reports LE", () => {
    const res = simulate(input(makePlan({ confirmed: false, width: 4, height: 4 }), squareBeacons(3)));
    expect(res.unit).toBe("LE");
    expect(res.warnings.join()).toMatch(/Maßstab nicht bestätigt/);
  });

  it("performance: 30x20 plan, 1 LE cells, K=30 well below 2 s (weighted centroid)", () => {
    const p = makePlan({ width: 30, height: 20 });
    const beacons: Beacon[] = [];
    for (let x = 5; x < 30; x += 10) for (let y = 5; y < 20; y += 10) beacons.push(makeBeacon(`b${x}-${y}`, x, y));
    const inp = input(p, beacons, { shadowingStdDb: 3 }, { samplesPerCell: 30 });
    const t0 = Date.now();
    const res = simulate(inp);
    const ms = Date.now() - t0;
    expect(res.cells.length).toBe(600);
    expect(ms).toBeLessThan(2000);
    console.info(`[perf] weighted-centroid 600 cells x K30: ${ms} ms`);
  });
});

describe("variants", () => {
  const plan = makePlan({ width: 20, height: 12 });
  const base: Beacon[] = [makeBeacon("a", 2, 2), makeBeacon("b", 18, 2), makeBeacon("c", 2, 10), makeBeacon("d", 18, 10)];

  it("applyEdits does not mutate the input", () => {
    const edited = applyEdits(base, [
      { kind: "move", id: "a", position: { x: 5, y: 5 } },
      { kind: "toggle", id: "b" },
      { kind: "remove", id: "c" },
      { kind: "add", beacon: makePlannedBeacon(base, { x: 10, y: 6 }) },
    ]);
    expect(edited.map((b) => b.id)).toEqual(["a", "b", "d", "PLAN-1"]);
    expect(edited[0].position).toEqual({ x: 5, y: 5 });
    expect(edited[1].enabled).toBe(false);
    expect(base[0].position).toEqual({ x: 2, y: 2 });
    expect(base[1].enabled).toBe(true);
  });

  it("delta sign: removing beacons worsens, adding improves", () => {
    const sm = (b: Beacon[]) => simulate(input(plan, b, { shadowingStdDb: 3, sensitivityDbm: -80 }, { samplesPerCell: 12 }));
    const a = sm(base);
    const worse = compareResults(a, sm(base.slice(0, 2)));
    expect(worse.worsened).toBeGreaterThan(worse.improved);
    expect(worse.summaryB.cellsUnder3).toBeGreaterThanOrEqual(worse.summaryA.cellsUnder3);
    expect(worse.summaryB.within[1].share).toBeLessThanOrEqual(worse.summaryA.within[1].share);
    const sparse = sm(base.slice(0, 3));
    const better = compareResults(sparse, a);
    expect(better.improved).toBeGreaterThan(better.worsened);
    // identical variants => zero delta everywhere
    const same = compareResults(a, a);
    expect(same.cells.every((c) => c.delta === 0)).toBe(true);
  });

  it("summarize: shares, worst 10 %", () => {
    const r = simulate(input(plan, base.slice(0, 3), { shadowingStdDb: 3, sensitivityDbm: -80 }, { samplesPerCell: 8 }));
    const s = summarize(r);
    expect(s.cells).toBe(r.cells.length);
    expect(s.within[0].share).toBeLessThanOrEqual(s.within[2].share);
    expect(s.worst10.length).toBe(Math.ceil(r.cells.length * 0.1));
    expect(s.unit).toBe("m");
  });

  it("suggestion improves the objective on a plan with an uncovered corner", async () => {
    const big = makePlan({ width: 24, height: 12 });
    const three = [makeBeacon("a", 2, 2), makeBeacon("b", 2, 10), makeBeacon("c", 10, 6)];
    const inp = input(big, three, { shadowingStdDb: 2, sensitivityDbm: -80 }, { samplesPerCell: 8 });
    const sug = await suggestBeacon(inp, { objective: { kind: "share-within", thresholdLE: 3 }, topN: 5, maxCandidates: 16 });
    expect(sug).not.toBeNull();
    expect(sug!.length).toBeGreaterThan(0);
    expect(sug![0].improvement).toBeGreaterThan(0);
    expect(sug![0].position.x).toBeGreaterThan(14); // far (uncovered) side
    for (let i = 1; i < sug!.length; i++) expect(sug![i - 1].improvement).toBeGreaterThanOrEqual(sug![i].improvement);
    // candidate set is next to the border / blockers
    const cands = candidatePositions(inp, { max: 10 });
    expect(cands.length).toBeLessThanOrEqual(10);
    expect(objectiveScore(simulate(inp), { kind: "worst10" })).toBeLessThanOrEqual(0);
  });

  it("CSV export lists active beacons in LE", () => {
    const csv = beaconsToCsv([...base.slice(0, 1), { ...base[1], enabled: false }, makePlannedBeacon(base, { x: 3.456, y: 4 })]);
    expect(csv.split("\n")[0]).toBe("minor,x_le,y_le,mount,notes");
    expect(csv).toContain("2,3.46,4,,geplant (PLAN-1)");
    expect(csv.trim().split("\n").length).toBe(3);
  });
});

describe("demo campaign", () => {
  it("simulates the demo plan with its beacons, trilateration included", () => {
    const { campaign } = createDemoCampaign();
    for (const algorithm of ["weighted-centroid", "trilateration", "strongest-beacon"] as const) {
      const inp = { ...input(campaign.floorPlan, campaign.beacons, { shadowingStdDb: 3 }), algorithm };
      inp.model.rssiAt1m = campaign.pathLoss.rssiAt1m;
      inp.model.pathLossExponent = campaign.pathLoss.pathLossExponent;
      inp.settings.samplesPerCell = 30;
      const t0 = Date.now();
      const r = simulate(inp);
      console.info(`[perf] demo ${algorithm}: ${r.cells.length} cells, ${Date.now() - t0} ms`);
      expect(r.cells.length).toBeGreaterThan(50);
    }
  });
});
