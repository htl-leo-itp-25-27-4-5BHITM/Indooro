/**
 * A* on the 4-neighbour grid with unit step cost.
 * Ported from Indooro's customer/route.js (findPath with MinHeap, Manhattan heuristic).
 * Extension from the iOS IndoorGraph idea (turn penalty): every change of direction costs
 * `turnPenalty` extra, which yields calmer routes with fewer zigzags. Search state is
 * (cell, incoming direction). Ties are broken deterministically (lower f, then lower h = closer
 * to goal, then earlier insertion), so identical input always gives an identical path.
 */
import type { Cell } from "../types";
import { isWalkable, type Grid } from "./grid";

export interface PathOptions {
  /** Extra cost per 90° turn (metre-equivalent). 0 disables. Default 0.5. */
  turnPenalty?: number;
}

export const DEFAULT_TURN_PENALTY = 0.5;

const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];
const NO_DIR = 4;

class MinHeap {
  private f: number[] = [];
  private h: number[] = [];
  private seq: number[] = [];
  private v: number[] = [];
  private counter = 0;
  get size(): number {
    return this.v.length;
  }
  private less(a: number, b: number): boolean {
    if (this.f[a] !== this.f[b]) return this.f[a] < this.f[b];
    if (this.h[a] !== this.h[b]) return this.h[a] < this.h[b];
    return this.seq[a] < this.seq[b];
  }
  private swap(a: number, b: number): void {
    for (const arr of [this.f, this.h, this.seq, this.v]) {
      const t = arr[a];
      arr[a] = arr[b];
      arr[b] = t;
    }
  }
  push(value: number, f: number, h: number): void {
    this.f.push(f);
    this.h.push(h);
    this.seq.push(this.counter++);
    this.v.push(value);
    let i = this.v.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.v[0];
    const last = this.v.length - 1;
    this.swap(0, last);
    this.f.pop();
    this.h.pop();
    this.seq.pop();
    this.v.pop();
    let i = 0;
    const n = this.v.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && this.less(l, m)) m = l;
      if (r < n && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(m, i);
      i = m;
    }
    return top;
  }
}

/** A* between two cells, inclusive path (from … to) or null if unreachable / not walkable. */
export function findPath(grid: Grid, from: Cell, to: Cell, options: PathOptions = {}): Cell[] | null {
  const turn = options.turnPenalty ?? DEFAULT_TURN_PENALTY;
  if (!isWalkable(grid, from.x, from.y) || !isWalkable(grid, to.x, to.y)) return null;
  if (from.x === to.x && from.y === to.y) return [{ x: from.x, y: from.y }];

  const { width, height } = grid;
  const states = width * height * 5;
  const g = new Float64Array(states).fill(Infinity);
  const parent = new Int32Array(states).fill(-1);
  const closed = new Uint8Array(states);
  const heur = (x: number, y: number) => Math.abs(x - to.x) + Math.abs(y - to.y);

  const startState = (from.y * width + from.x) * 5 + NO_DIR;
  g[startState] = 0;
  const open = new MinHeap();
  open.push(startState, heur(from.x, from.y), heur(from.x, from.y));

  while (open.size > 0) {
    const s = open.pop();
    if (closed[s]) continue;
    closed[s] = 1;
    const dir = s % 5;
    const cellIdx = (s - dir) / 5;
    const x = cellIdx % width;
    const y = (cellIdx - x) / width;
    if (x === to.x && y === to.y) {
      const path: Cell[] = [];
      for (let c = s; c !== -1; c = parent[c]) {
        const d = c % 5;
        const ci = (c - d) / 5;
        const cx = ci % width;
        path.push({ x: cx, y: (ci - cx) / width });
      }
      return path.reverse();
    }
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || grid.blocked[ny * width + nx] !== 0) continue;
      const ns = (ny * width + nx) * 5 + d;
      if (closed[ns]) continue;
      const cost = g[s] + 1 + (dir !== NO_DIR && dir !== d ? turn : 0);
      if (cost < g[ns] - 1e-12) {
        g[ns] = cost;
        parent[ns] = s;
        const h = heur(nx, ny);
        open.push(ns, cost + h, h);
      }
    }
  }
  return null;
}

/** Number of 90° turns of a cell path. */
export function countTurns(path: readonly Cell[]): number {
  let turns = 0;
  for (let i = 2; i < path.length; i++) {
    const ax = path[i - 1].x - path[i - 2].x;
    const ay = path[i - 1].y - path[i - 2].y;
    const bx = path[i].x - path[i - 1].x;
    const by = path[i].y - path[i - 1].y;
    if (ax !== bx || ay !== by) turns++;
  }
  return turns;
}

/** Shortest walking distances (metres) from `from` to every cell, BFS. Infinity = unreachable. */
export function distancesFrom(grid: Grid, from: Cell): Float64Array {
  const { width, height } = grid;
  const dist = new Float64Array(width * height).fill(Infinity);
  if (!isWalkable(grid, from.x, from.y)) return dist;
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const start = from.y * width + from.x;
  dist[start] = 0;
  queue[tail++] = start;
  while (head < tail) {
    const idx = queue[head++];
    const x = idx % width;
    const y = (idx - x) / width;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (grid.blocked[ni] !== 0 || dist[ni] !== Infinity) continue;
      dist[ni] = dist[idx] + 1;
      queue[tail++] = ni;
    }
  }
  return dist;
}
