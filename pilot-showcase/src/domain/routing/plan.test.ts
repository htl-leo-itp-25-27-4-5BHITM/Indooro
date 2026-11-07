import { describe, expect, it } from "vitest";
import type { Cell, RouteStop } from "../types";
import { buildGrid, countTurns, findPath, isWalkable, planRoute, optimiseOrder, tourLength } from "./index";
import { el, layoutOf, shelfLayout } from "./fixtures";

const stop = (id: string, x: number, y: number): RouteStop => ({ id, cell: { x, y }, label: id });

function assertValidPath(grid: ReturnType<typeof buildGrid>, path: Cell[]) {
  for (const c of path) expect(isWalkable(grid, c.x, c.y)).toBe(true);
  for (let i = 1; i < path.length; i++) {
    expect(Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y)).toBe(1);
  }
}

describe("findPath", () => {
  it("finds a straight path on open floor", () => {
    const g = buildGrid(layoutOf(10, 3, []));
    const p = findPath(g, { x: 0, y: 1 }, { x: 7, y: 1 })!;
    expect(p).toHaveLength(8);
    expect(p[0]).toEqual({ x: 0, y: 1 });
    expect(p[7]).toEqual({ x: 7, y: 1 });
    expect(countTurns(p)).toBe(0);
  });

  it("goes around a shelf and never through blocked cells", () => {
    const l = shelfLayout();
    const g = buildGrid(l);
    const p = findPath(g, { x: 5, y: 4 }, { x: 5, y: 2 })!;
    expect(p).not.toBeNull();
    assertValidPath(g, p);
    expect(p.length - 1).toBeGreaterThan(2);
  });

  it("returns null for unreachable or blocked targets", () => {
    const g = buildGrid(layoutOf(7, 5, [el("wall", 3, 0, 1, 5)]));
    expect(findPath(g, { x: 0, y: 0 }, { x: 6, y: 0 })).toBeNull();
    expect(findPath(g, { x: 0, y: 0 }, { x: 3, y: 2 })).toBeNull();
  });

  it("is deterministic", () => {
    const g = buildGrid(shelfLayout());
    const a = findPath(g, { x: 1, y: 7 }, { x: 10, y: 1 });
    const b = findPath(g, { x: 1, y: 7 }, { x: 10, y: 1 });
    expect(a).toEqual(b);
  });

  it("turn penalty reduces turns on open floor without lengthening the path", () => {
    const g = buildGrid(layoutOf(20, 20, []));
    const from = { x: 0, y: 0 };
    const to = { x: 12, y: 9 };
    const calm = findPath(g, from, to, { turnPenalty: 0.5 })!;
    const plain = findPath(g, from, to, { turnPenalty: 0 })!;
    expect(calm.length).toBe(plain.length);
    expect(countTurns(calm)).toBeLessThanOrEqual(countTurns(plain));
    expect(countTurns(calm)).toBe(1);
  });
});

describe("tour ordering", () => {
  // points on a line: start 0, stops at 1, 3, 2 (node ids 1..3 with positions) – optimum is 1,3,2? use explicit matrix
  const line = (pos: number[]) => pos.map((a) => pos.map((b) => Math.abs(a - b)));

  it("2-opt improves a bad nearest-neighbour tour and reaches the optimum on a known case", () => {
    // classic: start at 0, stops at 10, 1, 11, 2 on a line, end fixed at 12 → optimal 0→1→2→10→11→12 = 12
    const d = line([0, 10, 1, 11, 2, 12]);
    const order = optimiseOrder(d, 4, 5);
    expect(tourLength(d, order, 5)).toBe(12);
    expect(order).toEqual([2, 4, 1, 3]);
  });

  it("never worse than the input order", () => {
    const d = line([0, 9, 3, 7, 1, 5, 8]);
    const input = [1, 2, 3, 4, 5, 6];
    expect(tourLength(d, optimiseOrder(d, 6))).toBeLessThanOrEqual(tourLength(d, input));
  });
});

describe("planRoute", () => {
  const layout = shelfLayout();
  const grid = buildGrid(layout);
  const start = { x: 1, y: 7 };

  it("plans start → stops → end with a continuous path and consistent metres", () => {
    const stops = [stop("a", 10, 2), stop("b", 2, 2), stop("c", 6, 5)];
    const end = { x: 9, y: 6 };
    const r = planRoute(grid, start, stops, end);
    expect(r.order).toHaveLength(3);
    expect(r.legs).toHaveLength(4);
    expect(r.unreachable).toEqual([]);
    assertValidPath(grid, r.path);
    expect(r.path[0]).toEqual(start);
    expect(r.path[r.path.length - 1]).toEqual(end);
    expect(r.totalMeters).toBe(r.path.length - 1);
    // no duplicated joints
    for (let i = 1; i < r.path.length; i++) expect(r.path[i]).not.toEqual(r.path[i - 1]);
    // legs end at stops
    r.order.forEach((s, i) => expect(r.legs[i][r.legs[i].length - 1]).toEqual(s.cell));
    // every stop lies on the path
    for (const s of r.order) expect(r.path.some((c) => c.x === s.cell.x && c.y === s.cell.y)).toBe(true);
  });

  it("is no worse than visiting in input order", () => {
    const stops = [stop("a", 10, 2), stop("b", 2, 2), stop("c", 6, 5), stop("d", 1, 1)];
    const opt = planRoute(grid, start, stops, { x: 9, y: 6 });
    const listed = planRoute(grid, start, stops, { x: 9, y: 6 }, { optimise: false });
    expect(opt.totalMeters).toBeLessThanOrEqual(listed.totalMeters);
    expect(listed.order.map((s) => s.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("reports unreachable stops and still plans the rest", () => {
    const l = layoutOf(9, 5, [el("wall", 5, 0, 1, 5)]);
    const g = buildGrid(l);
    const r = planRoute(g, { x: 0, y: 0 }, [stop("near", 3, 3), stop("far", 8, 1), stop("inside", 5, 2)]);
    expect(r.order.map((s) => s.id)).toEqual(["near"]);
    expect(r.unreachable.map((s) => s.id).sort()).toEqual(["far", "inside"]);
    assertValidPath(g, r.path);
  });

  it("recalculates when stops change", () => {
    const one = planRoute(grid, start, [stop("a", 10, 2)]);
    const two = planRoute(grid, start, [stop("a", 10, 2), stop("b", 0, 0)]);
    expect(two.order).toHaveLength(2);
    expect(two.totalMeters).toBeGreaterThan(one.totalMeters);
    const none = planRoute(grid, start, []);
    expect(none.path).toEqual([start]);
    expect(none.totalMeters).toBe(0);
  });

  it("respects the fixed end cell (last tour leg targets it)", () => {
    const r = planRoute(grid, start, [stop("a", 10, 2), stop("b", 2, 5)], { x: 9, y: 6 });
    expect(r.legs[r.legs.length - 1].at(-1)).toEqual({ x: 9, y: 6 });
    expect(r.path.at(-1)).toEqual({ x: 9, y: 6 });
  });

  it("is deterministic", () => {
    const stops = [stop("a", 10, 2), stop("b", 2, 2), stop("c", 6, 5)];
    expect(planRoute(grid, start, stops, { x: 9, y: 6 })).toEqual(planRoute(grid, start, stops, { x: 9, y: 6 }));
  });

  it("handles a stop on the start cell", () => {
    const r = planRoute(grid, start, [stop("here", 1, 7), stop("a", 4, 5)]);
    expect(r.order).toHaveLength(2);
    assertValidPath(grid, r.path);
  });

  it("plans a 60×40 store with 20 stops in under 30 ms", () => {
    const els = [el("entrance", 1, 39, 2, 1), el("checkout", 50, 39, 6, 1)];
    for (let row = 0; row < 6; row++) for (let col = 0; col < 4; col++) els.push(el("shelf", 4 + col * 14, 4 + row * 5, 10, 1.5));
    const l = layoutOf(60, 40, els);
    const g = buildGrid(l);
    const stops: RouteStop[] = [];
    for (let i = 0; i < 20; i++) stops.push(stop(`s${i}`, 3 + ((i * 17) % 54), 3 + ((i * 7) % 34)));
    const t0 = performance.now();
    planRoute(g, { x: 1, y: 39 }, stops, { x: 52, y: 38 });
    const first = performance.now() - t0;
    const t1 = performance.now();
    const r = planRoute(g, { x: 1, y: 39 }, stops, { x: 52, y: 38 });
    const second = performance.now() - t1;
    expect(r.order.length + r.unreachable.length).toBe(20);
    expect(Math.min(first, second)).toBeLessThan(30);
  });
});
