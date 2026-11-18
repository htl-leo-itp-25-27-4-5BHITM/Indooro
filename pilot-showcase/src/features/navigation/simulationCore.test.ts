import { describe, expect, it } from "vitest";
import { buildGrid, entranceCell, planRoute } from "../../domain/routing";
import { el, layoutOf } from "../../domain/routing/fixtures";
import { buildRouteModel, routeSignature } from "./routeModel";
import {
  DWELL_MS,
  initialSim,
  nextStopSim,
  pauseSim,
  progressOf,
  resumeSim,
  seekSim,
  startSim,
  stepSim,
  type SimModel,
  type SimState
} from "./simulationCore";

const model: SimModel = { length: 20, stopDistances: [6, 14] };

function run(s: SimState, ms: number, speed = 1, step = 50): SimState {
  let cur = s;
  for (let t = 0; t < ms; t += step) cur = stepSim(cur, model, step, speed);
  return cur;
}

describe("simulation core", () => {
  it("stays idle until started and walks at 1.2 m/s", () => {
    expect(stepSim(initialSim(), model, 1000, 1)).toEqual(initialSim());
    const s = run(startSim(initialSim()), 2000);
    expect(s.phase).toBe("running");
    expect(s.distance).toBeCloseTo(2.4, 6);
  });

  it("scales with speed", () => {
    const s = run(startSim(initialSim()), 1250, 4); // 6 m reached
    expect(s.distance).toBe(6);
    expect(s.phase).toBe("arrived-at-stop");
    const t = run(startSim(initialSim()), 1000, 2);
    expect(t.distance).toBeCloseTo(2.4, 6);
  });

  it("pauses ~1.2 s at each stop, marks it reached and resumes automatically", () => {
    let s = run(startSim(initialSim()), 5000); // 6 m / 1.2 = 5 s
    expect(s.phase).toBe("arrived-at-stop");
    expect(s.reached).toBe(1);
    expect(s.distance).toBe(6);
    s = run(s, DWELL_MS - 100);
    expect(s.phase).toBe("arrived-at-stop");
    s = run(s, 200);
    expect(s.phase).toBe("running");
    expect(s.reached).toBe(1);
  });

  it("finishes at the end after the last stop", () => {
    let s = startSim(initialSim());
    s = run(s, 60_000);
    expect(s.phase).toBe("finished");
    expect(s.reached).toBe(2);
    expect(s.distance).toBe(20);
    expect(progressOf(s, model)).toBe(1);
  });

  it("finishes at a last stop that lies on the very end", () => {
    const m: SimModel = { length: 10, stopDistances: [10] };
    let s = startSim(initialSim());
    for (let i = 0; i < 400; i++) s = stepSim(s, m, 50, 1);
    expect(s.phase).toBe("finished");
    expect(s.reached).toBe(1);
  });

  it("pause and resume keep position and dwell", () => {
    let s = run(startSim(initialSim()), 1000);
    const d = s.distance;
    s = pauseSim(s);
    expect(run(s, 3000).distance).toBe(d);
    expect(resumeSim(s).phase).toBe("running");
    let a = run(startSim(initialSim()), 5000);
    a = run(a, 600);
    const paused = pauseSim(a);
    expect(paused.phase).toBe("paused");
    expect(resumeSim(paused).phase).toBe("arrived-at-stop");
  });

  it("nextStop jumps to the next stop, then to the end", () => {
    let s = nextStopSim(initialSim(), model);
    expect(s).toMatchObject({ phase: "arrived-at-stop", distance: 6, reached: 1 });
    s = nextStopSim(s, model);
    expect(s).toMatchObject({ distance: 14, reached: 2 });
    s = nextStopSim(s, model);
    expect(s).toMatchObject({ phase: "finished", distance: 20 });
  });

  it("seek sets distance and derives reached stops", () => {
    const s = seekSim(initialSim(), model, 0.75);
    expect(s).toMatchObject({ phase: "paused", distance: 15, reached: 2 });
    expect(seekSim(s, model, 0.2)).toMatchObject({ distance: 4, reached: 0 });
    expect(seekSim(s, model, 1).phase).toBe("finished");
    expect(seekSim(startSim(initialSim()), model, 0.5).phase).toBe("running");
  });

  it("a route without stops walks start → end", () => {
    const m: SimModel = { length: 3, stopDistances: [] };
    let s = startSim(initialSim());
    for (let i = 0; i < 100; i++) s = stepSim(s, m, 50, 1);
    expect(s.phase).toBe("finished");
  });

  it("restarts from the beginning after finishing", () => {
    const f = run(startSim(initialSim()), 60_000);
    expect(startSim(f)).toMatchObject({ phase: "running", distance: 0, reached: 0 });
  });
});

describe("route model", () => {
  const layout = layoutOf(12, 8, [el("entrance", 1, 7, 2, 1), el("shelf", 3, 3, 6, 1)]);
  const grid = buildGrid(layout);
  const route = planRoute(grid, entranceCell(layout), [
    { id: "a", cell: { x: 10, y: 2 }, label: "a" },
    { id: "b", cell: { x: 2, y: 2 }, label: "b" }
  ]);

  it("derives non-decreasing stop distances within the route length", () => {
    const m = buildRouteModel(route);
    expect(m.stopDistances).toHaveLength(2);
    expect(m.stopDistances[0]).toBeLessThanOrEqual(m.stopDistances[1]);
    expect(m.stopDistances[1]).toBeLessThanOrEqual(m.length + 1e-9);
    expect(m.stopDistances[0]).toBeGreaterThan(0);
    // last stop is the end of the path
    expect(m.stopDistances[1]).toBeCloseTo(m.length, 6);
  });

  it("signature changes when stops change", () => {
    const other = planRoute(grid, entranceCell(layout), [{ id: "a", cell: { x: 10, y: 2 }, label: "a" }]);
    expect(routeSignature(route)).not.toBe(routeSignature(other));
    expect(routeSignature(route)).toBe(routeSignature(route));
    expect(routeSignature(null)).toBe("none");
  });
});
