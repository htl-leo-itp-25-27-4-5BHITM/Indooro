/**
 * Picks the walkable cell where a customer stands to reach a shelf slot.
 * Idea from layout.js accessCell(): neighbours of the shelf rectangle that are walkable;
 * extended here with the `access` side and the slot fraction along the shelf face.
 */
import type { Cell, LayoutElement } from "../types";
import { isWalkable, rectCells, snapToWalkable, type Grid } from "./grid";

type Side = "north" | "south" | "east" | "west";

interface Candidate {
  cell: Cell;
  side: Side;
}

function sideCells(grid: Grid, shelf: LayoutElement, side: Side): Candidate[] {
  const { x0, y0, x1, y1 } = rectCells(shelf);
  const out: Candidate[] = [];
  if (side === "north" || side === "south") {
    const y = side === "north" ? y0 - 1 : y1 + 1;
    for (let x = x0; x <= x1; x++) if (isWalkable(grid, x, y)) out.push({ cell: { x, y }, side });
  } else {
    const x = side === "west" ? x0 - 1 : x1 + 1;
    for (let y = y0; y <= y1; y++) if (isWalkable(grid, x, y)) out.push({ cell: { x, y }, side });
  }
  return out;
}

/** Reference point on the face for a given side and fraction 0..1 (metres). */
function facePoint(shelf: LayoutElement, side: Side | undefined, fraction: number): { x: number; y: number } {
  const f = Math.min(1, Math.max(0, fraction));
  const alongX = side ? side === "north" || side === "south" : shelf.width >= shelf.height;
  if (alongX) {
    const y = side === "north" ? shelf.y : side === "south" ? shelf.y + shelf.height : shelf.y + shelf.height / 2;
    return { x: shelf.x + f * shelf.width, y };
  }
  const x = side === "west" ? shelf.x : side === "east" ? shelf.x + shelf.width : shelf.x + shelf.width / 2;
  return { x, y: shelf.y + f * shelf.height };
}

const ORDER: Side[] = ["south", "north", "east", "west"];

/**
 * Walkable cell in front of a shelf. Honours `shelf.access`; if that side has no walkable cell
 * (or no side is given) all four sides compete. Within the candidates the cell nearest to the
 * slot position (`fraction` 0..1 along the shelf face) wins; ties go to south, north, east, west.
 */
export function accessCellFor(grid: Grid, shelf: LayoutElement, fraction = 0.5): Cell {
  let pool = shelf.access ? sideCells(grid, shelf, shelf.access) : [];
  if (pool.length === 0) pool = ORDER.flatMap((s) => sideCells(grid, shelf, s));
  if (pool.length === 0) {
    // fully enclosed shelf: snap its centre
    return (
      snapToWalkable(grid, { x: shelf.x + shelf.width / 2, y: shelf.y + shelf.height / 2 }) ?? {
        x: Math.floor(shelf.x),
        y: Math.floor(shelf.y)
      }
    );
  }
  const ref = facePoint(shelf, shelf.access, fraction);
  let best = pool[0];
  let bestD = Infinity;
  for (const c of pool) {
    const dx = c.cell.x + 0.5 - ref.x;
    const dy = c.cell.y + 0.5 - ref.y;
    const d = dx * dx + dy * dy;
    if (d < bestD - 1e-9) {
      best = c;
      bestD = d;
    }
  }
  return best.cell;
}
