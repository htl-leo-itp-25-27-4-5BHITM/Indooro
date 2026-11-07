import { describe, expect, it } from "vitest";
import { CAMERA_KEYS, LOOP, easeInOutCubic, easeOutBack, easeOutExpo, phasesAt, sampleKeys, segment } from "./timeline";

const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

describe("easing", () => {
  it("hits its end points", () => {
    for (const f of [easeInOutCubic, easeOutExpo, easeOutBack]) {
      expect(f(0)).toBeCloseTo(0, 5);
      expect(f(1)).toBeCloseTo(1, 5);
    }
  });
  it("segment clamps outside the window", () => {
    expect(segment(0, 1, 2)).toBe(0);
    expect(segment(3, 1, 2)).toBe(1);
    expect(segment(1.5, 1, 2)).toBeCloseTo(0.5);
  });
});

describe("camera path", () => {
  it("passes through every key", () => {
    for (const k of CAMERA_KEYS) {
      const s = sampleKeys(CAMERA_KEYS, k.t);
      expect(dist(s.pos, k.pos)).toBeLessThan(1e-6);
      expect(dist(s.look, k.look)).toBeLessThan(1e-6);
    }
  });
  it("is seamless across the loop boundary", () => {
    const a = sampleKeys(CAMERA_KEYS, 0);
    const b = sampleKeys(CAMERA_KEYS, LOOP);
    expect(dist(a.pos, b.pos)).toBeLessThan(1e-6);
    const before = sampleKeys(CAMERA_KEYS, LOOP - 0.01);
    const after = sampleKeys(CAMERA_KEYS, 0.01);
    expect(dist(before.pos, after.pos)).toBeLessThan(0.6);
  });
  it("never jumps between frames (60 fps)", () => {
    let prev = sampleKeys(CAMERA_KEYS, 0).pos;
    for (let f = 1; f <= LOOP * 60; f++) {
      const cur = sampleKeys(CAMERA_KEYS, f / 60).pos;
      expect(dist(prev, cur)).toBeLessThan(0.5);
      prev = cur;
    }
  });
});

describe("phases", () => {
  it("run in story order", () => {
    const at = (t: number) => phasesAt(t);
    expect(at(0).route).toBe(0);
    expect(at(2.7).card).toBeGreaterThan(0.9);
    expect(at(4.0).route).toBeGreaterThan(0);
    expect(at(4.0).route).toBeLessThan(1);
    expect(at(5.6).route).toBe(1);
    expect(at(6.4).beam).toBe(1);
    expect(at(7).puck).toBeGreaterThan(0);
    expect(at(8.6).puck).toBe(1);
  });
  it("is reset at loop start and wraps cleanly", () => {
    const a = phasesAt(0);
    const b = phasesAt(LOOP);
    expect(a).toEqual(b);
    expect(a.route).toBe(0);
    expect(a.beam).toBe(0);
    expect(a.puck).toBe(0);
    expect(phasesAt(9.95).fade).toBeCloseTo(0, 3);
  });
});
