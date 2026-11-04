/**
 * Walkable grid. Ported from Indooro's customer web app (backend/.../customer/layout.js:
 * buildGrid / isWalkable / cellOf) to TypeScript.
 *
 * 1 cell = 1 m. Every layout element blocks the cells its rectangle overlaps, except
 * entrance, exit and beacon (they are walkable markers). Walls block as well.
 */
import type { Cell, ElementType, LayoutElement, StoreLayout } from "../types";

export interface Grid {
  width: number;
  height: number;
  /** blocked[y * width + x] === 1 → not walkable. */
  blocked: Uint8Array;
}

const WALKABLE_TYPES: ReadonlySet<ElementType> = new Set<ElementType>(["entrance", "exit", "beacon"]);
const EPS = 1e-6;

/** Integer cell ranges (inclusive) that the element rectangle overlaps. Fractional edges count. */
export function rectCells(el: Pick<LayoutElement, "x" | "y" | "width" | "height">): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} {
  const x0 = Math.floor(el.x + EPS);
  const y0 = Math.floor(el.y + EPS);
  const x1 = Math.max(x0, Math.ceil(el.x + el.width - EPS) - 1);
  const y1 = Math.max(y0, Math.ceil(el.y + el.height - EPS) - 1);
  return { x0, y0, x1, y1 };
}

/** Builds the walkable grid: everything blocks except entrance, exit and beacon. */
export function buildGrid(layout: StoreLayout): Grid {
  const { width, height } = layout.gridSize;
  const blocked = new Uint8Array(width * height);
  for (const el of layout.elements) {
    if (WALKABLE_TYPES.has(el.type)) continue;
    const { x0, y0, x1, y1 } = rectCells(el);
    for (let y = Math.max(0, y0); y <= Math.min(height - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(width - 1, x1); x++) {
        blocked[y * width + x] = 1;
      }
    }
  }
  return { width, height, blocked };
}

export function isWalkable(grid: Grid, x: number, y: number): boolean {
  return (
    Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < grid.width && y < grid.height && grid.blocked[y * grid.width + x] === 0
  );
}

/**
 * Nearest walkable cell to `cell` (BFS over the whole grid, deterministic neighbour order),
 * like cellOf() in layout.js. Returns the cell itself if it is walkable, null if the grid has
 * no walkable cell at all.
 */
export function snapToWalkable(grid: Grid, cell: { x: number; y: number }): Cell | null {
  if (grid.width <= 0 || grid.height <= 0) return null;
  const sx = Math.min(grid.width - 1, Math.max(0, Math.floor(cell.x)));
  const sy = Math.min(grid.height - 1, Math.max(0, Math.floor(cell.y)));
  const seen = new Uint8Array(grid.width * grid.height);
  const queue: number[] = [sy * grid.width + sx];
  seen[queue[0]] = 1;
  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head];
    const x = idx % grid.width;
    const y = (idx - x) / grid.width;
    if (grid.blocked[idx] === 0) return { x, y };
    // fixed order: east, west, south, north
    const nbs: [number, number][] = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1]
    ];
    for (const [nx, ny] of nbs) {
      if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) continue;
      const ni = ny * grid.width + nx;
      if (seen[ni]) continue;
      seen[ni] = 1;
      queue.push(ni);
    }
  }
  return null;
}
