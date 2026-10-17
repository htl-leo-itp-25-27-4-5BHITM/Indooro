import assert from "node:assert/strict";
import test from "node:test";
import {
  accessCell,
  anchorPoint,
  buildGrid,
  cellOf,
  entrancePoint,
  rectCells
} from "../../main/resources/META-INF/resources/customer/layout.js";
import { fixtureLayout } from "./customer-fixture.mjs";

const keysOf = (cells) => [...cells].sort();
const cellKeys = (xs, ys) => {
  const keys = [];
  for (const x of xs) for (const y of ys) keys.push(`${x},${y}`);
  return keys.sort();
};

test("rectCells covers the plain rectangle when unrotated", () => {
  const cells = rectCells({ x: 10, y: 20, width: 2, height: 4 });
  assert.equal(cells.size, 8);
  assert.deepEqual(keysOf(cells), cellKeys([10, 11], [20, 21, 22, 23]));
  assert.deepEqual(keysOf(rectCells({ x: 10, y: 20, width: 2, height: 4, rotation: 360 })), keysOf(cells));
  assert.deepEqual(keysOf(rectCells({ x: 10, y: 20, width: 2, height: 4, rotation: 180 })), keysOf(cells));
});

test("rectCells defaults width and height to 1", () => {
  assert.deepEqual([...rectCells({ x: 3, y: 4 })], ["3,4"]);
});

test("rectCells rotated 90 degrees covers the 4x2 region around the centre", () => {
  const cells = rectCells({ x: 10, y: 20, width: 2, height: 4, rotation: 90 });
  assert.deepEqual(keysOf(cells), cellKeys([9, 10, 11, 12], [21, 22]));
});

test("rectCells rotated 45 degrees is a diamond that keeps the centre cells", () => {
  const rotated = rectCells({ x: 10, y: 20, width: 2, height: 4, rotation: 45 });
  const plain = rectCells({ x: 10, y: 20, width: 2, height: 4 });
  for (const key of ["10,21", "11,21", "10,22", "11,22"]) assert.ok(rotated.has(key), `${key} covered`);
  assert.notDeepEqual(keysOf(rotated), keysOf(plain));
  assert.equal(rotated.has("10,20"), false, "corner cell drops out of the diamond");
});

test("buildGrid blocks shelf and wall cells only, clipped to the grid", () => {
  const grid = buildGrid(fixtureLayout);
  assert.equal(grid.width, 20);
  assert.equal(grid.height, 20);
  assert.ok(grid.blocked.has("2,4"), "shelf s1 blocked");
  assert.ok(grid.blocked.has("7,4"), "shelf s1 blocked at far end");
  assert.ok(grid.blocked.has("12,15"), "shelf s2 blocked");
  assert.ok(grid.blocked.has("0,8"), "wall blocked");
  assert.equal(grid.blocked.has("0,19"), false, "entrance stays walkable");
  assert.equal(grid.blocked.has("10,2"), false, "anchor stays walkable");

  const clipped = buildGrid({
    gridSize: { width: 20, height: 20 },
    elements: [{ type: "wall", x: 18, y: 0, width: 5, height: 1 }]
  });
  assert.ok(clipped.blocked.has("19,0"));
  assert.equal(clipped.blocked.has("20,0"), false);
});

test("entrancePoint and anchorPoint return element centres", () => {
  assert.deepEqual(entrancePoint(fixtureLayout.elements), { x: 1, y: 19.5 });
  assert.equal(entrancePoint([]), null);
  assert.deepEqual(anchorPoint(fixtureLayout.elements, "e1"), { x: 10.5, y: 2.5 }, "case-insensitive");
  assert.deepEqual(anchorPoint(fixtureLayout.elements, "E1"), { x: 10.5, y: 2.5 });
  assert.equal(anchorPoint(fixtureLayout.elements, "X9"), null);
  assert.equal(anchorPoint(fixtureLayout.elements, ""), null);
});

test("accessCell picks a walkable neighbour of the shelf", () => {
  const grid = buildGrid(fixtureLayout);
  const shelf = fixtureLayout.elements[2];
  const cell = accessCell(grid, shelf);
  assert.ok(cell, "found a cell");
  assert.equal(grid.blocked.has(`${cell.x},${cell.y}`), false);
  const adjacent = [...rectCells(shelf)].some((key) => {
    const [x, y] = key.split(",").map(Number);
    return Math.abs(x - cell.x) + Math.abs(y - cell.y) === 1;
  });
  assert.ok(adjacent, "next to the shelf");
});

test("accessCell skips blocked neighbours", () => {
  const grid = { width: 10, height: 10, blocked: new Set(["4,5", "5,4", "5,6"]) };
  assert.deepEqual(accessCell(grid, { x: 5, y: 5, width: 1, height: 1 }), { x: 6, y: 5 });
});

test("accessCell returns null when the shelf is fully enclosed", () => {
  const grid = { width: 3, height: 3, blocked: new Set(["0,1", "2,1", "1,0", "1,2"]) };
  assert.equal(accessCell(grid, { x: 1, y: 1, width: 1, height: 1 }), null);
  assert.equal(accessCell(grid, null), null);
});

test("cellOf clamps points into the grid", () => {
  const grid = buildGrid(fixtureLayout);
  assert.deepEqual(cellOf({ x: -5, y: 100 }, grid), { x: 0, y: 19 });
  assert.deepEqual(cellOf({ x: 1, y: 19.5 }, grid), { x: 1, y: 19 });
  assert.equal(cellOf({ x: NaN, y: 1 }, grid), null);
  assert.equal(cellOf({ x: 1, y: 1 }, { width: 0, height: 0, blocked: new Set() }), null);
});

test("cellOf moves a blocked point to the nearest walkable cell", () => {
  const grid = buildGrid(fixtureLayout);
  const cell = cellOf({ x: 12.5, y: 12.5 }, grid);
  assert.equal(grid.blocked.has(`${cell.x},${cell.y}`), false);
  assert.equal(Math.abs(cell.x - 12) + Math.abs(cell.y - 12), 1, "one step from the shelf cell");

  const wall = cellOf({ x: 3.2, y: 8.7 }, grid);
  assert.equal(grid.blocked.has(`${wall.x},${wall.y}`), false);
  assert.equal(Math.abs(wall.x - 3) + Math.abs(wall.y - 8), 1);
});
