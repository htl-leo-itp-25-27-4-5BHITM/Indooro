/**
 * Pure timeline maths for the cinematic hero loop. No three.js, no DOM: everything here is
 * testable and deterministic. Time is in seconds, the loop is LOOP seconds long and seamless.
 */
export type Vec3 = readonly [number, number, number];

export const LOOP = 10;

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Progress of `t` through [a, b], clamped to 0..1 and shaped by `ease`. */
export function segment(t: number, a: number, b: number, ease: (x: number) => number = (x) => x): number {
  return ease(clamp01((t - a) / (b - a))) + 0;
}

export interface CameraKey {
  t: number;
  pos: Vec3;
  look: Vec3;
}

/**
 * Camera path. The first key is the elegant overview; the loop ends by returning to it, so the
 * wrap-around at LOOP is invisible. World: x right, y up, z towards the viewer, store ~26 x 17 m.
 */
export const CAMERA_KEYS: readonly CameraKey[] = [
  { t: 0, pos: [15, 20, 24], look: [0, 0, 0.5] },
  { t: 2.4, pos: [-7, 12, 18], look: [1.5, 0, 1.5] },
  { t: 4.4, pos: [1, 12, 12.5], look: [3.5, 0, -1] },
  { t: 6.4, pos: [11, 12, 11], look: [4.5, 0, -1.5] },
  { t: 8.1, pos: [15, 14, 19], look: [1, 0, 0] }
];

/**
 * Periodic cubic Hermite spline through the keys (non-uniform Catmull-Rom tangents), so the
 * camera never stops at a key and the velocity is continuous across the loop seam.
 */
export function sampleKeys(keys: readonly CameraKey[], time: number, period: number = LOOP): { pos: Vec3; look: Vec3 } {
  const n = keys.length;
  const t = ((time % period) + period) % period;
  let i = n - 1;
  for (let k = 0; k < n; k++) {
    const next = k + 1 < n ? keys[k + 1]!.t : keys[0]!.t + period;
    if (t >= keys[k]!.t && t < next) {
      i = k;
      break;
    }
  }
  const at = (idx: number) => {
    const wraps = Math.floor(idx / n);
    const k = keys[((idx % n) + n) % n]!;
    return { t: k.t + wraps * period, pos: k.pos, look: k.look };
  };
  const p0 = at(i - 1);
  const p1 = at(i);
  const p2 = at(i + 1);
  const p3 = at(i + 2);
  const dt = p2.t - p1.t;
  const u = (t < p1.t ? t + period : t) - p1.t;
  const s = clamp01(u / dt);
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  const k1 = dt / (p2.t - p0.t);
  const k2 = dt / (p3.t - p1.t);
  const hermite = (field: "pos" | "look"): Vec3 => {
    const a = p1[field];
    const b = p2[field];
    const out = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const m1 = (p2[field][c]! - p0[field][c]!) * k1;
      const m2 = (p3[field][c]! - p1[field][c]!) * k2;
      out[c] = h00 * a[c]! + h10 * m1 + h01 * b[c]! + h11 * m2;
    }
    return [out[0]!, out[1]!, out[2]!];
  };
  return { pos: hermite("pos"), look: hermite("look") };
}

export interface Phases {
  /** 0..1 visibility of the 3D search card (pop in, hold, out). */
  card: number;
  /** 0..1 how much of the search text is typed. */
  typing: number;
  /** 0..1 how far the route ribbon has drawn itself. */
  route: number;
  /** 0..1 height of the amber beam. */
  beam: number;
  /** 0..1 progress of the (looping) ripples at the product. */
  ripple: number;
  /** 0..1 shopper progress along the route. */
  puck: number;
  /** Multiplier for route, beam and shopper: fades out just before the loop restarts. */
  fade: number;
  /** Shopper fade-in at the start of the loop. */
  intro: number;
}

export function phasesAt(time: number, period: number = LOOP): Phases {
  const t = ((time % period) + period) % period;
  const cardIn = segment(t, 1.9, 2.45, easeOutBack);
  const cardOut = segment(t, 4.9, 5.35, easeInOutCubic);
  return {
    card: Math.max(0, cardIn) * (1 - cardOut),
    typing: segment(t, 2.15, 3.05),
    route: segment(t, 3.1, 5.5, easeInOutSine),
    beam: segment(t, 5.4, 6.3, easeOutExpo),
    ripple: segment(t, 5.4, 8.6),
    puck: segment(t, 5.6, 8.5, easeInOutCubic),
    fade: 1 - segment(t, 9.2, 9.9, easeInOutSine),
    intro: segment(t, 0, 0.9, easeOutCubic)
  };
}
