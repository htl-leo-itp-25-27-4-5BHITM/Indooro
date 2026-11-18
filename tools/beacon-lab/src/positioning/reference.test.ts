import { describe, expect, it } from "vitest";
import type { EvaluationOptions, ReferencePoint } from "../core/types";
import { runHolds, stationaryHolds, truthAt } from "./reference";
import { makeRun } from "./testutil";

const ref = (t: number, x: number, y: number): ReferencePoint => ({ t, position: { x, y } });
const nearest: EvaluationOptions = { referenceMatching: "hold-or-nearest", toleranceSec: 1 };
const interp: EvaluationOptions = { referenceMatching: "interpolate", toleranceSec: 1 };

describe("stationaryHolds", () => {
  it("empty / single reference -> none", () => {
    expect(stationaryHolds([])).toEqual([]);
    expect(stationaryHolds([ref(0, 1, 1)])).toEqual([]);
  });
  it("consecutive identical positions form holds", () => {
    const holds = stationaryHolds([ref(0, 1, 1), ref(10, 1, 1), ref(20, 5, 5), ref(25, 5, 5), ref(30, 5, 5), ref(40, 9, 9)]);
    expect(holds).toEqual([
      { start: 0, end: 10, position: { x: 1, y: 1 } },
      { start: 20, end: 30, position: { x: 5, y: 5 } },
    ]);
  });
  it("tolerance 1e-6, different positions do not merge, same position non-consecutive stays separate", () => {
    expect(stationaryHolds([ref(0, 1, 1), ref(1, 1 + 5e-7, 1)])).toHaveLength(1);
    expect(stationaryHolds([ref(0, 1, 1), ref(1, 1 + 1e-5, 1)])).toHaveLength(0);
    expect(stationaryHolds([ref(0, 1, 1), ref(1, 1, 1), ref(2, 4, 4), ref(3, 1, 1), ref(4, 1, 1)])).toHaveLength(2);
  });
  it("sorts unsorted input and ignores invalid refs", () => {
    const holds = stationaryHolds([ref(10, 1, 1), ref(0, 1, 1), ref(NaN, 1, 1)]);
    expect(holds).toEqual([{ start: 0, end: 10, position: { x: 1, y: 1 } }]);
  });
});

describe("runHolds", () => {
  it("stationary run with a single reference spans the sample range", () => {
    const run = makeRun({ kind: "stationary", references: [ref(2, 3, 3)], samples: [{ t: 0, beaconId: "A", rssi: -60 }, { t: 30, beaconId: "A", rssi: -60 }] });
    expect(runHolds(run)).toEqual([{ start: 0, end: 30, position: { x: 3, y: 3 } }]);
    expect(runHolds({ ...run, kind: "walk" })).toEqual([]);
  });
});

describe("truthAt hold-or-nearest", () => {
  const refs = [ref(0, 0, 0), ref(10, 0, 0), ref(20, 10, 0), ref(30, 20, 0)];
  it("inside a hold -> hold position", () => {
    expect(truthAt(5, refs, nearest)).toEqual({ x: 0, y: 0 });
    expect(truthAt(10, refs, nearest)).toEqual({ x: 0, y: 0 });
  });
  it("outside holds: nearest reference within tolerance", () => {
    expect(truthAt(20.5, refs, nearest)).toEqual({ x: 10, y: 0 });
    expect(truthAt(29.2, refs, nearest)).toEqual({ x: 20, y: 0 });
  });
  it("outside tolerance -> null (no interpolation)", () => {
    expect(truthAt(15, refs, nearest)).toBeNull();
    expect(truthAt(-5, refs, nearest)).toBeNull();
    expect(truthAt(40, refs, nearest)).toBeNull();
  });
  it("no refs / NaN t -> null", () => {
    expect(truthAt(1, [], nearest)).toBeNull();
    expect(truthAt(NaN, refs, nearest)).toBeNull();
  });
});

describe("truthAt interpolate", () => {
  const refs = [ref(0, 0, 0), ref(10, 0, 0), ref(20, 10, 20), ref(30, 20, 20)];
  it("inside a hold -> hold position", () => {
    expect(truthAt(4, refs, interp)).toEqual({ x: 0, y: 0 });
  });
  it("between references -> linear interpolation", () => {
    expect(truthAt(15, refs, interp)).toEqual({ x: 5, y: 10 });
    expect(truthAt(25, refs, interp)).toEqual({ x: 15, y: 20 });
    expect(truthAt(20, refs, interp)).toEqual({ x: 10, y: 20 });
  });
  it("outside the reference range -> null", () => {
    expect(truthAt(-0.1, refs, interp)).toBeNull();
    expect(truthAt(30.1, refs, interp)).toBeNull();
    expect(truthAt(30, refs, interp)).toEqual({ x: 20, y: 20 });
  });
  it("duplicate timestamps do not divide by zero", () => {
    const r = [ref(0, 0, 0), ref(5, 1, 1), ref(5, 2, 2), ref(10, 3, 3)];
    const p = truthAt(7.5, r, interp)!;
    expect(Number.isFinite(p.x)).toBe(true);
  });
  it("does not mutate refs and returns copies", () => {
    const copy = JSON.parse(JSON.stringify(refs));
    const p = truthAt(0, refs, interp)!;
    p.x = 99;
    expect(refs).toEqual(copy);
  });
});
