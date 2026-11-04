/**
 * Pure layout → 3D helpers. Layout metres (x → right, y → down) map to world (x, height, z):
 * the store is centred on the origin, so world x = x - W/2 and world z = y - H/2.
 */
import type { LayoutElement } from "../../domain/types";

export interface GridSize {
  width: number;
  height: number;
}

export interface WorldXZ {
  x: number;
  z: number;
}

export function toWorld(x: number, y: number, grid: GridSize): WorldXZ {
  return { x: x - grid.width / 2, z: y - grid.height / 2 };
}

/** Centre of a layout element in world space. */
export function elementCentre(el: Pick<LayoutElement, "x" | "y" | "width" | "height">, grid: GridSize): WorldXZ {
  return toWorld(el.x + el.width / 2, el.y + el.height / 2, grid);
}

/** Shelf body height in metres by element type. */
export function shelfHeight(el: Pick<LayoutElement, "type" | "width" | "height">): number {
  switch (el.type) {
    case "cooler":
      return 2.0;
    case "fresh":
      // low display tables (1 m deep) vs. tall fresh walls
      return Math.min(el.width, el.height) <= 1 ? 1.15 : 1.7;
    default:
      return 1.8;
  }
}

/** Number of product levels drawn on a shelf face. */
export function levelCount(height: number): number {
  return height >= 1.7 ? 4 : 3;
}

/** Vertical centres of the product levels (metres above the floor). */
export function levelCentres(height: number, levels = levelCount(height)): number[] {
  const bottom = 0.22;
  const top = height - 0.22;
  return Array.from({ length: levels }, (_, i) => (levels === 1 ? (bottom + top) / 2 : bottom + ((top - bottom) * i) / (levels - 1)));
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ProductBlock {
  /** world position of the block centre */
  x: number;
  y: number;
  z: number;
  /** size along world x / y / z */
  sx: number;
  sy: number;
  sz: number;
  /** 0..1 random value for colour variation */
  r: number;
}

const BLOCK_PITCH = 0.34;
const BLOCK_DEPTH = 0.16;
/** How far the product blocks protrude beyond the shelf footprint. */
const PROTRUDE = 0.07;

/** Small product blocks on the customer-facing face of a shelf, on several levels. */
export function productBlocks(shelf: LayoutElement, grid: GridSize): ProductBlock[] {
  const access = shelf.access ?? "south";
  const horizontal = access === "north" || access === "south";
  const length = horizontal ? shelf.width : shelf.height;
  const h = shelfHeight(shelf);
  const levels = levelCentres(h);
  const per = Math.max(1, Math.floor(length / BLOCK_PITCH));
  const pitch = length / per;
  const rand = mulberry32(shelf.id * 7919 + 13);
  const c = elementCentre(shelf, grid);
  const out: ProductBlock[] = [];
  const levelGap = levels.length > 1 ? levels[1] - levels[0] : 0.5;
  const out2 = BLOCK_DEPTH / 2 - (BLOCK_DEPTH - PROTRUDE);
  for (const ly of levels) {
    for (let i = 0; i < per; i++) {
      const along = -length / 2 + pitch * (i + 0.5);
      const r = rand();
      const sh = levelGap * (0.5 + rand() * 0.22);
      const sAlong = pitch * (0.62 + rand() * 0.2);
      let x = c.x;
      let z = c.z;
      let sx = sAlong;
      let sz = BLOCK_DEPTH;
      if (horizontal) {
        x += along;
        const half = shelf.height / 2 + out2;
        z += access === "south" ? half : -half;
      } else {
        z += along;
        const half = shelf.width / 2 + out2;
        x += access === "east" ? half : -half;
        sx = BLOCK_DEPTH;
        sz = sAlong;
      }
      out.push({ x, y: ly, z, sx, sy: sh, sz, r });
    }
  }
  return out;
}
