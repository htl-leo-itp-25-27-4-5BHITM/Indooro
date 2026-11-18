/**
 * Entrance and checkout anchor cells of a layout, robust against odd layouts.
 */
import type { Cell, LayoutElement, StoreLayout } from "../types";
import { buildGrid, isWalkable, rectCells, snapToWalkable, type Grid } from "./grid";

/**
 * Entrance cell: the walkable cell of the entrance element that lies closest to the store
 * interior (grid centre); snapped to the nearest walkable cell if needed. Without an entrance
 * element the nearest walkable cell to the top-left corner is used.
 */
export function entranceCell(layout: StoreLayout, grid: Grid = buildGrid(layout)): Cell {
  const e = layout.elements.find((el) => el.type === "entrance");
  if (!e) return snapToWalkable(grid, { x: 0, y: 0 }) ?? { x: 0, y: 0 };
  const { x0, y0, x1, y1 } = rectCells(e);
  const cx = layout.gridSize.width / 2;
  const cy = layout.gridSize.height / 2;
  let best: Cell | null = null;
  let bestD = Infinity;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!isWalkable(grid, x, y)) continue;
      const dd = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
      if (dd < bestD) {
        bestD = dd;
        best = { x, y };
      }
    }
  }
  return best ?? snapToWalkable(grid, { x: e.x, y: e.y }) ?? { x: 0, y: 0 };
}

/**
 * Cell in front of the checkout row on the store-interior side (the side of the checkout
 * bounding box that faces the grid centre), at the middle of the row. Undefined without checkout.
 */
export function checkoutCell(layout: StoreLayout, grid: Grid = buildGrid(layout)): Cell | undefined {
  const cos: LayoutElement[] = layout.elements.filter((el) => el.type === "checkout");
  if (cos.length === 0) return undefined;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of cos) {
    const r = rectCells(c);
    x0 = Math.min(x0, r.x0);
    y0 = Math.min(y0, r.y0);
    x1 = Math.max(x1, r.x1);
    y1 = Math.max(y1, r.y1);
  }
  const gw = layout.gridSize.width;
  const gh = layout.gridSize.height;
  const mx = (x0 + x1 + 1) / 2;
  const my = (y0 + y1 + 1) / 2;
  // dominant axis: the one where the checkout sits further from the centre (relative)
  const ox = (mx - gw / 2) / gw;
  const oy = (my - gh / 2) / gh;
  let tx: number;
  let ty: number;
  if (Math.abs(oy) >= Math.abs(ox)) {
    ty = oy > 0 ? y0 - 1 : y1 + 1; // checkout in lower half → interior is north
    tx = Math.floor(mx);
  } else {
    tx = ox > 0 ? x0 - 1 : x1 + 1;
    ty = Math.floor(my);
  }
  return snapToWalkable(grid, { x: tx, y: ty }) ?? undefined;
}
