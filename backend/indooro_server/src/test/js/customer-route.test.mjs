import assert from "node:assert/strict";
import test from "node:test";
import { buildGrid, rectCells } from "../../main/resources/META-INF/resources/customer/layout.js";
import { findPath, orderStops, pathLength } from "../../main/resources/META-INF/resources/customer/route.js";

const open = (width, height, blocked = []) => ({ width, height, blocked: new Set(blocked) });

test("findPath walks a straight line inclusive of both ends", () => {
  const path = findPath(open(5, 1), { x: 0, y: 0 }, { x: 4, y: 0 });
  assert.deepEqual(path, [0, 1, 2, 3, 4].map((x) => ({ x, y: 0 })));
  assert.equal(pathLength(path), 4);
});

test("findPath returns the single cell when from equals to", () => {
  assert.deepEqual(findPath(open(3, 3), { x: 1, y: 1 }, { x: 1, y: 1 }), [{ x: 1, y: 1 }]);
  assert.equal(pathLength([{ x: 1, y: 1 }]), 0);
});

test("findPath goes around a blocked wall", () => {
  const grid = open(5, 3, ["2,0", "2,1"]);
  const path = findPath(grid, { x: 0, y: 0 }, { x: 4, y: 0 });
  assert.equal(pathLength(path), 8, "down two, across four, up two");
  assert.equal(path.some((cell) => grid.blocked.has(`${cell.x},${cell.y}`)), false);
  assert.deepEqual(path[0], { x: 0, y: 0 });
  assert.deepEqual(path.at(-1), { x: 4, y: 0 });
});

test("findPath returns null when the target is walled off", () => {
  const grid = open(5, 3, ["2,0", "2,1", "2,2"]);
  const path = findPath(grid, { x: 0, y: 0 }, { x: 4, y: 0 });
  assert.equal(path, null);
  assert.equal(pathLength(path), Infinity);
});

test("findPath refuses blocked or out-of-grid endpoints", () => {
  const grid = open(3, 3, ["1,1"]);
  assert.equal(findPath(grid, { x: 0, y: 0 }, { x: 1, y: 1 }), null);
  assert.equal(findPath(grid, { x: 0, y: 0 }, { x: 5, y: 5 }), null);
});

test("orderStops visits stops in nearest-neighbour order from the start", () => {
  const grid = open(12, 1);
  const stops = [
    { id: "A", cell: { x: 10, y: 0 } },
    { id: "B", cell: { x: 2, y: 0 } },
    { id: "C", cell: { x: 5, y: 0 } }
  ];
  const { order, legs, unreachable } = orderStops(grid, { x: 0, y: 0 }, stops);
  assert.deepEqual(order.map((stop) => stop.id), ["B", "C", "A"]);
  assert.deepEqual(unreachable, []);
  assert.equal(legs.length, 3);
  assert.deepEqual(legs[0][0], { x: 0, y: 0 });
  assert.deepEqual(legs[0].at(-1), { x: 2, y: 0 });
  assert.deepEqual(legs[1].at(-1), { x: 5, y: 0 });
  assert.deepEqual(legs[2].at(-1), { x: 10, y: 0 });
  assert.equal(order[0], stops[1], "returns the same stop objects");
});

test("orderStops breaks distance ties by input order", () => {
  const grid = open(12, 1);
  const stops = [
    { id: "B", cell: { x: 6, y: 0 } },
    { id: "A", cell: { x: 4, y: 0 } }
  ];
  const { order } = orderStops(grid, { x: 5, y: 0 }, stops);
  assert.deepEqual(order.map((stop) => stop.id), ["B", "A"]);
});

test("orderStops puts unreachable stops last in input order", () => {
  const grid = open(6, 1, ["3,0"]);
  const stops = [
    { id: "X", cell: { x: 5, y: 0 } },
    { id: "Y", cell: { x: 1, y: 0 } }
  ];
  const { order, legs, unreachable } = orderStops(grid, { x: 0, y: 0 }, stops);
  assert.deepEqual(order.map((stop) => stop.id), ["Y"]);
  assert.equal(legs.length, 1);
  assert.deepEqual(unreachable.map((stop) => stop.id), ["X"]);
});

test("orderStops treats stops without a cell as unreachable", () => {
  const grid = open(4, 1);
  const { order, unreachable } = orderStops(grid, { x: 0, y: 0 }, [{ id: "N" }, { id: "Y", cell: { x: 2, y: 0 } }]);
  assert.deepEqual(order.map((stop) => stop.id), ["Y"]);
  assert.deepEqual(unreachable.map((stop) => stop.id), ["N"]);
});

test("a rotated shelf blocks exactly the cells rectCells reports and routes avoid them", () => {
  const shelf = { type: "shelf", x: 4, y: 2, width: 4, height: 1, rotation: 90 };
  const grid = buildGrid({ gridSize: { width: 10, height: 10 }, elements: [shelf] });
  const reported = rectCells(shelf);
  for (const key of reported) assert.ok(grid.blocked.has(key), `${key} blocked`);
  assert.equal(grid.blocked.size, reported.size);

  const path = findPath(grid, { x: 0, y: 4 }, { x: 9, y: 4 });
  assert.ok(path, "a route exists around the shelf");
  assert.equal(path.some((cell) => reported.has(`${cell.x},${cell.y}`)), false);
});
