import { isWalkable } from "./layout.js";

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];

const keyOf = (x, y) => `${x},${y}`;
const parseKey = (key) => {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
};
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].f <= a[i].f) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }

  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < a.length && a[left].f < a[smallest].f) smallest = left;
        if (right < a.length && a[right].f < a[smallest].f) smallest = right;
        if (smallest === i) break;
        [a[smallest], a[i]] = [a[i], a[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

function rebuildPath(cameFrom, goalKey) {
  let key = goalKey;
  const path = [parseKey(key)];
  while (cameFrom.has(key)) {
    key = cameFrom.get(key);
    path.push(parseKey(key));
  }
  return path.reverse();
}

// A* over 4-neighbour moves with unit cost. Returns inclusive cell path or null.
export function findPath(grid, from, to) {
  if (!from || !to) return null;
  if (from.x === to.x && from.y === to.y) return [{ x: from.x, y: from.y }];
  if (!isWalkable(grid, from.x, from.y) || !isWalkable(grid, to.x, to.y)) return null;

  const goalKey = keyOf(to.x, to.y);
  const gScore = new Map([[keyOf(from.x, from.y), 0]]);
  const cameFrom = new Map();
  const closed = new Set();
  const open = new MinHeap();
  open.push({ x: from.x, y: from.y, f: manhattan(from, to) });

  while (open.size > 0) {
    const current = open.pop();
    const currentKey = keyOf(current.x, current.y);
    if (currentKey === goalKey) return rebuildPath(cameFrom, goalKey);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);

    const g = gScore.get(currentKey);
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const nextKey = keyOf(nx, ny);
      if (closed.has(nextKey) || !isWalkable(grid, nx, ny)) continue;
      const nextG = g + 1;
      if (nextG < (gScore.get(nextKey) ?? Infinity)) {
        gScore.set(nextKey, nextG);
        cameFrom.set(nextKey, currentKey);
        open.push({ x: nx, y: ny, f: nextG + manhattan({ x: nx, y: ny }, to) });
      }
    }
  }
  return null;
}

export function pathLength(path) {
  return path ? path.length - 1 : Infinity;
}

// Nearest-neighbour ordering of stops from a start cell. Each stop is {id, cell, ...};
// the same objects are returned. Stops without a path are returned in `unreachable`
// in input order.
export function orderStops(grid, start, stops) {
  const candidates = (stops ?? []).filter((stop) => stop?.cell);
  const remaining = candidates.slice();
  const order = [];
  const legs = [];
  let current = start ?? null;

  while (current && remaining.length > 0) {
    let bestIndex = -1;
    let bestPath = null;
    let bestLength = Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const path = findPath(grid, current, remaining[i].cell);
      const length = pathLength(path);
      if (length < bestLength) {
        bestIndex = i;
        bestPath = path;
        bestLength = length;
      }
    }
    if (bestIndex < 0) break;
    const [stop] = remaining.splice(bestIndex, 1);
    order.push(stop);
    legs.push(bestPath);
    current = stop.cell;
  }

  const placed = new Set(order);
  const unreachable = (stops ?? []).filter((stop) => !placed.has(stop));
  return { order, legs, unreachable };
}
