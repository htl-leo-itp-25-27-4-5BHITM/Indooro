import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { easeOutExpo, followPose, homePose, introPose, shortestAngle } from "./camera";

describe("camera math", () => {
  it("easeOutExpo goes from 0 to 1, fast at first", () => {
    expect(easeOutExpo(0)).toBe(0);
    expect(easeOutExpo(1)).toBe(1);
    expect(easeOutExpo(0.5)).toBeGreaterThan(0.9);
  });

  it("shortestAngle wraps", () => {
    expect(shortestAngle(0, Math.PI * 1.5)).toBeCloseTo(-Math.PI / 2);
    expect(shortestAngle(3, -3)).toBeCloseTo(Math.PI * 2 - 6);
  });

  it("homePose is farther for narrower aspect and looks down", () => {
    const wide = homePose(40, 26, { fovDeg: 38, aspect: 1.6 });
    const tall = homePose(40, 26, { fovDeg: 38, aspect: 0.8 });
    const dist = (p: typeof wide) => new Vector3(...p.position).distanceTo(new Vector3(...p.target));
    expect(dist(tall)).toBeGreaterThan(dist(wide));
    expect(wide.position[1]).toBeGreaterThan(wide.target[1]);
  });

  it("introPose is higher and farther than home", () => {
    const home = homePose(24, 18, { fovDeg: 38, aspect: 1.6 });
    expect(introPose(home).position[1]).toBeGreaterThan(home.position[1]);
  });

  it("followPose sits behind the walker and looks ahead", () => {
    const p = followPose({ x: 0, z: 0 }, 0); // heading east (+x)
    expect(p.target[0]).toBeGreaterThan(0);
    expect(p.position[0]).toBeLessThan(p.target[0]);
    expect(p.position[1]).toBeGreaterThan(2);
    const s = followPose({ x: 0, z: 0 }, 90); // south (+z)
    expect(s.position[2]).toBeLessThan(s.target[2]);
  });
});
