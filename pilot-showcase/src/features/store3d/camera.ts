/** Pure camera math: framing, easing and follow poses. No React. */
import { PerspectiveCamera, Vector3 } from "three";

export interface Pose3 {
  position: [number, number, number];
  target: [number, number, number];
}

export const DEG = Math.PI / 180;

export function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * Math.max(0, t));
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Frame-rate independent exponential smoothing factor (0..1) for a given rate (1/s). */
export function dampFactor(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/** Smallest signed angle difference b - a in radians, in (-PI, PI]. */
export function shortestAngle(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export interface FrameOptions {
  fovDeg: number;
  aspect: number;
  pitchDeg?: number;
  yawDeg?: number;
  /** NDC extent the box may occupy (0..1), lower = more margin */
  fill?: number;
  /** box height in metres (walls/shelves) */
  boxHeight?: number;
}

/**
 * Camera pose that frames the whole store (a W x D floor box, centred on the origin) from a
 * pitched, slightly yawed viewpoint. Solves the distance by projecting the box corners.
 */
export function homePose(width: number, depth: number, o: FrameOptions): Pose3 {
  const pitch = (o.pitchDeg ?? 40) * DEG;
  const yaw = (o.yawDeg ?? 10) * DEG;
  const fill = o.fill ?? 0.9;
  const bh = o.boxHeight ?? 2;
  const dir = new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const target = new Vector3(0, bh * 0.2, depth * 0.03);
  const cam = new PerspectiveCamera(o.fovDeg, o.aspect, 0.1, 500);
  const corners: Vector3[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, bh]) corners.push(new Vector3((sx * width) / 2, y, (sz * depth) / 2));
  const fits = (dist: number) => {
    cam.position.copy(dir).multiplyScalar(dist).add(target);
    cam.lookAt(target);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    return corners.every((c) => {
      const p = c.clone().project(cam);
      return Math.abs(p.x) <= fill && Math.abs(p.y) <= fill;
    });
  };
  let lo = 2;
  let hi = 400;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  const p = dir.clone().multiplyScalar(hi).add(target);
  return { position: [p.x, p.y, p.z], target: [target.x, target.y, target.z] };
}

/** Starting pose of the intro fly-in: same direction as home, higher and farther. */
export function introPose(home: Pose3, factor = 1.9, lift = 1.5): Pose3 {
  const t = new Vector3(...home.target);
  const p = new Vector3(...home.position).sub(t);
  p.multiplyScalar(factor);
  p.y *= lift;
  p.add(t);
  return { position: [p.x, p.y, p.z], target: home.target };
}

/**
 * Chase camera behind/above a walker. Heading is in layout degrees (0 = east, 90 = south,
 * y down), which equals world degrees on the x/z plane.
 */
export function followPose(pos: { x: number; z: number }, headingDeg: number, distance = 7.5, pitchDeg = 42, lookAhead = 3.2): Pose3 {
  const h = headingDeg * DEG;
  const fx = Math.cos(h);
  const fz = Math.sin(h);
  const target: [number, number, number] = [pos.x + fx * lookAhead, 0.9, pos.z + fz * lookAhead];
  const pitch = pitchDeg * DEG;
  const horiz = Math.cos(pitch) * distance;
  const position: [number, number, number] = [target[0] - fx * horiz, 0.9 + Math.sin(pitch) * distance, target[2] - fz * horiz];
  return { position, target };
}
