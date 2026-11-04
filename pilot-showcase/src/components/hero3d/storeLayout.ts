/**
 * Procedural data for the stylised supermarket used by the hero and "So funktioniert's" scenes.
 * Pure data + helpers (no three.js). World: x right, y up, z towards the viewer, metres.
 */
import type { Vec3 } from "./timeline";

export const STORE_W = 26;
export const STORE_D = 17;

/** Category tints (same family as the demo's categories). */
export const TINTS = ["#E8B86D", "#8CC8FF", "#5ED68A", "#C7A6F0", "#F08A8A", "#7FD8F0", "#F59BC4", "#F3D56B"] as const;

export interface ShelfDef {
  id: string;
  /** centre */
  x: number;
  z: number;
  length: number;
  tint: string;
}

const ROW_Z = [-6, -3, 0, 3, 6] as const;
const SEGMENTS: readonly [number, number][] = [
  [-10.5, -1.8],
  [1.8, 10.5]
];

export const SHELVES: readonly ShelfDef[] = ROW_Z.flatMap((z, r) =>
  SEGMENTS.map(([a, b], s) => ({
    id: `r${r}s${s}`,
    x: (a + b) / 2,
    z,
    length: b - a,
    tint: TINTS[(r * 2 + s) % TINTS.length]!
  }))
);

export const SHELF_HEIGHT = 2;
export const SHELF_DEPTH = 0.9;

/** The product ("Hafermilch · Regal 4 · Meter 2"), on a shelf front facing the aisle at z = -1.5. */
export const PRODUCT: Vec3 = [5.2, 1.0, -2.5];
export const PRODUCT_AISLE: Vec3 = [5.2, 0.1, -1.5];
export const ENTRANCE: Vec3 = [-12, 0.1, 7.9];

export const ROUTE_CORNERS: readonly Vec3[] = [ENTRANCE, [-12, 0.1, 4.5], [0, 0.1, 4.5], [0, 0.1, -1.5], PRODUCT_AISLE];

/** Beacon positions (x, z) on shelf tops / aisle ends. */
export const BEACONS: readonly (readonly [number, number])[] = [
  [-7.5, -6],
  [-3, -3],
  [-6.5, 0],
  [3, 0],
  [7.5, -6],
  [8, 3],
  [-4, 6],
  [4.5, 6]
];

/** Deterministic pseudo random in [0,1) so the scene looks identical on every load. */
export function rand(seed: number): number {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Replaces the corners of a polyline with quadratic arcs of (at most) `radius`. Start and end are kept.
 */
export function roundedPolyline(points: readonly Vec3[], radius: number, arcSteps = 10): Vec3[] {
  if (points.length < 3) return points.map((p) => [p[0], p[1], p[2]] as Vec3);
  const out: Vec3[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i - 1]!;
    const c = points[i]!;
    const n = points[i + 1]!;
    const lenIn = Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]);
    const lenOut = Math.hypot(n[0] - c[0], n[1] - c[1], n[2] - c[2]);
    const r = Math.min(radius, lenIn / 2, lenOut / 2);
    const a: Vec3 = [c[0] + ((p[0] - c[0]) / lenIn) * r, c[1] + ((p[1] - c[1]) / lenIn) * r, c[2] + ((p[2] - c[2]) / lenIn) * r];
    const b: Vec3 = [c[0] + ((n[0] - c[0]) / lenOut) * r, c[1] + ((n[1] - c[1]) / lenOut) * r, c[2] + ((n[2] - c[2]) / lenOut) * r];
    for (let s = 0; s <= arcSteps; s++) {
      const t = s / arcSteps;
      const u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1], u * u * a[2] + 2 * u * t * c[2] + t * t * b[2]]);
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}

export const ROUTE_POINTS: readonly Vec3[] = roundedPolyline(ROUTE_CORNERS, 1.4);

/** Axis-aligned footprint test used to prove the route never crosses a shelf. */
export function insideShelf(x: number, z: number, margin = 0): boolean {
  return SHELVES.some((s) => Math.abs(x - s.x) <= s.length / 2 + margin && Math.abs(z - s.z) <= SHELF_DEPTH / 2 + margin);
}
