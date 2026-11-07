import { describe, expect, it } from "vitest";
import { accessCellFor, buildGrid, checkoutCell, entranceCell, isWalkable, snapToWalkable } from "./index";
import { el, layoutOf, shelfLayout } from "./fixtures";

describe("buildGrid", () => {
  it("blocks shelves, walls, checkout but not entrance/exit/beacon", () => {
    const g = buildGrid(
      layoutOf(6, 4, [el("shelf", 1, 1, 2, 1), el("wall", 5, 0, 1, 4), el("checkout", 3, 3, 1, 1), el("entrance", 0, 3, 1, 1), el("exit", 4, 3, 1, 1), el("beacon", 2, 0, 1, 1)])
    );
    expect(isWalkable(g, 1, 1)).toBe(false);
    expect(isWalkable(g, 2, 1)).toBe(false);
    expect(isWalkable(g, 5, 2)).toBe(false);
    expect(isWalkable(g, 3, 3)).toBe(false);
    expect(isWalkable(g, 0, 3)).toBe(true);
    expect(isWalkable(g, 4, 3)).toBe(true);
    expect(isWalkable(g, 2, 0)).toBe(true);
    expect(isWalkable(g, -1, 0)).toBe(false);
    expect(isWalkable(g, 6, 0)).toBe(false);
  });

  it("blocks every cell a fractional rect overlaps", () => {
    const g = buildGrid(layoutOf(6, 4, [el("shelf", 1.5, 1.25, 2, 1)]));
    // x 1.5..3.5 → cells 1,2,3; y 1.25..2.25 → rows 1,2
    for (const x of [1, 2, 3]) for (const y of [1, 2]) expect(isWalkable(g, x, y)).toBe(false);
    expect(isWalkable(g, 0, 1)).toBe(true);
    expect(isWalkable(g, 4, 1)).toBe(true);
    expect(isWalkable(g, 1, 3)).toBe(true);
  });
});

describe("snapToWalkable", () => {
  it("returns the nearest walkable cell, deterministic", () => {
    const g = buildGrid(layoutOf(5, 5, [el("shelf", 1, 1, 3, 3)]));
    const s = snapToWalkable(g, { x: 2, y: 2 });
    expect(s).not.toBeNull();
    expect(isWalkable(g, s!.x, s!.y)).toBe(true);
    expect(snapToWalkable(g, { x: 2, y: 2 })).toEqual(s);
    expect(snapToWalkable(g, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
  it("is null on a fully blocked grid", () => {
    expect(snapToWalkable(buildGrid(layoutOf(2, 2, [el("shelf", 0, 0, 2, 2)])), { x: 0, y: 0 })).toBeNull();
  });
});

describe("accessCellFor", () => {
  const base = (access?: "north" | "south" | "east" | "west") => layoutOf(10, 8, [el("shelf", 3, 3, 4, 1, access ? { access } : {})]);

  it.each([
    ["south", 4],
    ["north", 2],
  ] as const)("respects access side %s", (side, y) => {
    const l = base(side);
    expect(accessCellFor(buildGrid(l), l.elements[0], 0.5).y).toBe(y);
  });

  it("respects east/west for vertical sides", () => {
    const l = layoutOf(10, 8, [el("shelf", 4, 2, 1, 4, { access: "east" })]);
    expect(accessCellFor(buildGrid(l), l.elements[0], 0.5).x).toBe(5);
    const w = layoutOf(10, 8, [el("shelf", 4, 2, 1, 4, { access: "west" })]);
    expect(accessCellFor(buildGrid(w), w.elements[0], 0.5).x).toBe(3);
  });

  it("picks the cell nearest to the slot fraction", () => {
    const l = base("south");
    const g = buildGrid(l);
    expect(accessCellFor(g, l.elements[0], 0).x).toBe(3);
    expect(accessCellFor(g, l.elements[0], 1).x).toBe(6);
  });

  it("falls back to another side when the access side is blocked", () => {
    const l = layoutOf(10, 8, [el("shelf", 3, 3, 4, 1, { access: "south" }), el("shelf", 3, 4, 4, 1)]);
    const c = accessCellFor(buildGrid(l), l.elements[0], 0.5);
    expect(c.y).toBe(2);
    expect(isWalkable(buildGrid(l), c.x, c.y)).toBe(true);
  });

  it("returns a walkable cell without access side", () => {
    const l = base();
    const c = accessCellFor(buildGrid(l), l.elements[0]);
    expect(isWalkable(buildGrid(l), c.x, c.y)).toBe(true);
  });
});

describe("entrance and checkout cells", () => {
  it("entrance cell is walkable and inside the entrance element", () => {
    const l = shelfLayout();
    const c = entranceCell(l);
    expect(c.y).toBe(7);
    expect(c.x === 1 || c.x === 2).toBe(true);
  });
  it("checkout cell lies on the interior side of the checkout row and is walkable", () => {
    const l = shelfLayout();
    const c = checkoutCell(l)!;
    expect(c.y).toBe(6);
    expect(isWalkable(buildGrid(l), c.x, c.y)).toBe(true);
    expect(checkoutCell(layoutOf(4, 4, []))).toBeUndefined();
  });
  it("checkout at the top places the cell below it", () => {
    const l = layoutOf(12, 8, [el("checkout", 4, 0, 4, 1)]);
    expect(checkoutCell(l)!.y).toBe(1);
  });
});
