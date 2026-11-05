import { describe, expect, it } from "vitest";
import { defaultScale } from "../core/defaults";
import type { PositionEstimate } from "../core/types";
import { computeTrackError } from "./trackError";

const SPEED = 1.5;
function walk(offset: (t: number) => { x: number; y: number }, n = 40): PositionEstimate[] {
  return Array.from({ length: n }, (_, t) => {
    const truth = { x: SPEED * t, y: 5 };
    const o = offset(t);
    return { t, position: { x: truth.x + o.x, y: truth.y + o.y }, rawPosition: null, inputs: [], truth, errorUnits: Math.hypot(o.x, o.y) };
  });
}

describe("computeTrackError", () => {
  it("lateral offset is pure cross-track (right of the walking direction = +)", () => {
    const r = computeTrackError(walk(() => ({ x: 0, y: 2 })), defaultScale());
    expect(r.n).toBe(40);
    expect(r.cross.mean!).toBeCloseTo(2, 9);
    expect(r.cross.medianAbs!).toBeCloseTo(2, 9);
    expect(Math.abs(r.along.mean!)).toBeLessThan(1e-9);
  });
  it("a lag appears as negative along-track error of lag * speed", () => {
    const lag = 2;
    const e = walk(() => ({ x: -SPEED * lag, y: 0 }));
    const r = computeTrackError(e, defaultScale());
    expect(r.along.mean!).toBeCloseTo(-lag * SPEED, 9);
    expect(r.along.p95Abs!).toBeCloseTo(lag * SPEED, 9);
    expect(Math.abs(r.cross.mean!)).toBeLessThan(1e-9);
  });
  it("skips stationary segments", () => {
    const moving = walk(() => ({ x: 0, y: 1 }), 20);
    const still: PositionEstimate[] = Array.from({ length: 20 }, (_, i) => ({
      t: 100 + i,
      position: { x: 31, y: 6 },
      rawPosition: null,
      inputs: [],
      truth: { x: 30, y: 5 },
      errorUnits: 1.4,
    }));
    const r = computeTrackError([...moving, ...still], defaultScale());
    expect(r.skippedStationary).toBeGreaterThanOrEqual(18); // the two transition epochs have a time gap and count as "no direction"
    expect(r.n).toBeGreaterThanOrEqual(18);
    expect(r.n + r.skippedStationary + r.skippedNoDirection).toBe(40);
  });
  it("counts failures and handles empty input", () => {
    const e = walk(() => ({ x: 0, y: 0 }), 10);
    e[4] = { ...e[4], position: null, errorUnits: null };
    expect(computeTrackError(e, defaultScale()).skippedNoEstimate).toBe(1);
    const r = computeTrackError([], defaultScale());
    expect(r.n).toBe(0);
    expect(r.along.mean).toBeNull();
  });
  it("does not mutate the input", () => {
    const e = walk(() => ({ x: 0, y: 1 }));
    const copy = JSON.stringify(e);
    computeTrackError(e, defaultScale());
    expect(JSON.stringify(e)).toBe(copy);
  });
});
