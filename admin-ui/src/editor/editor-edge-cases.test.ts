import assert from "node:assert/strict";
import test from "node:test";
import { applyCommand, createEditorState, parseImportedDocument, redo, undo, type EditorCommand, type LayoutDocument, type LayoutElement } from "./model";
import { validateLayout } from "./validation";

const doc = (elements: LayoutElement[] = [], gridSize = { width: 40, height: 30 }): LayoutDocument => ({ shopName: "Rand", gridSize, elements });
const entrance = (): LayoutElement => ({ id: 1, type: "entrance", x: 0, y: 0, width: 2, height: 1 });
const shelf = (id: LayoutElement["id"], x: number, y: number, extra: Partial<LayoutElement> = {}): LayoutElement => ({ id, type: "shelf", x, y, width: 5, height: 2, ...extra });
const withEntrance = (...elements: LayoutElement[]) => doc([entrance(), ...elements]);
const codes = (issues: ReturnType<typeof validateLayout>) => issues.map((issue) => issue.code);

test("move clamps elements to every grid edge, with and without snapping", () => {
  const state = createEditorState(doc([entrance(), shelf(5, 4, 4)]));
  for (const snapping of [true, false]) {
    const low = applyCommand(state, { type: "move", id: 5, x: -10, y: -3 }, 1, snapping).document.elements[1];
    assert.deepEqual([low.x, low.y], [0, 0], `snapping=${snapping}`);
    const high = applyCommand(state, { type: "move", id: 5, x: 100, y: 50 }, 1, snapping).document.elements[1];
    assert.deepEqual([high.x, high.y], [35, 28], `snapping=${snapping}`);
    assert.deepEqual([high.width, high.height], [5, 2]);
  }
  for (const [x, y] of [[-10, -3], [100, 50], [40, 30], [35, 28], [0, 0]]) {
    const next = applyCommand(state, { type: "move", id: 5, x, y }).document;
    assert.equal(codes(validateLayout(next)).includes("bounds"), false, `move to ${x},${y} must stay inside`);
  }
});

test("snapping rounds moves and resizes to whole grid units", () => {
  const state = createEditorState(doc([entrance(), shelf(5, 4, 4)]));
  const moved = applyCommand(state, { type: "move", id: 5, x: 9.6, y: 2.4 }).document.elements[1];
  assert.deepEqual([moved.x, moved.y], [10, 2]);
  const resized = applyCommand(state, { type: "resize", id: 5, width: 6.4, height: 3.6 }).document.elements[1];
  assert.deepEqual([resized.width, resized.height], [6, 4]);
});

test("with snapping off, decimal coordinates and sizes are kept", () => {
  const state = createEditorState(doc([entrance(), shelf(5, 4, 4)]));
  const moved = applyCommand(state, { type: "move", id: 5, x: 9.37, y: 2.5 }, 1, false).document.elements[1];
  assert.deepEqual([moved.x, moved.y], [9.37, 2.5]);
  const resized = applyCommand(state, { type: "resize", id: 5, width: 6.25, height: 3.75 }, 1, false).document.elements[1];
  assert.deepEqual([resized.width, resized.height], [6.25, 3.75]);
});

test("resize keeps a minimum size of 0.1 without snapping and never exceeds the grid", () => {
  const state = createEditorState(doc([entrance(), shelf(5, 4, 4)]));
  const thin = applyCommand(state, { type: "resize", id: 5, width: 0.05, height: 0.02 }, 1, false).document.elements[1];
  assert.deepEqual([thin.width, thin.height], [0.1, 0.1]);

  const huge = applyCommand(state, { type: "resize", id: 5, width: 100, height: 100 }).document.elements[1];
  assert.deepEqual([huge.width, huge.height], [40, 30]);
  assert.deepEqual([huge.x, huge.y], [0, 0]);

  // With snapping on, sub-unit sizes resolve to whole grid units (never below one unit).
  const snapped = applyCommand(state, { type: "resize", id: 5, width: 0.4, height: 2.6 }).document.elements[1];
  assert.deepEqual([snapped.width, snapped.height], [1, 3]);
});

test("locked elements reject geometry, order, delete, duplicate and patch commands unchanged", () => {
  const state = createEditorState(doc([entrance(), shelf(5, 10, 10, { locked: true, label: "Gesperrt" })]));
  const commands: EditorCommand[] = [
    { type: "move", id: 5, x: 20, y: 20 },
    { type: "resize", id: 5, width: 8, height: 4 },
    { type: "rotate", id: 5, rotation: 45 },
    { type: "rotate90", id: 5 },
    { type: "delete", id: 5 },
    { type: "duplicate", id: 5, duplicateId: 9 },
    { type: "reorder", id: 5, direction: "backward" },
    { type: "reorder", id: 5, direction: "forward" },
    { type: "patch", id: 5, changes: { label: "Neu" } },
  ];
  for (const command of commands) assert.equal(applyCommand(state, command), state, command.type);
});

test("patching locked:false unlocks an element, after which geometry commands apply again", () => {
  const state = createEditorState(doc([entrance(), shelf(5, 10, 10, { locked: true, label: "Gesperrt" })]));
  const unlocked = applyCommand(state, { type: "patch", id: 5, changes: { locked: false } });
  assert.notEqual(unlocked, state);
  assert.equal(unlocked.document.elements[1].locked, false);
  assert.equal(unlocked.document.elements[1].label, "Gesperrt");
  const moved = applyCommand(unlocked, { type: "move", id: 5, x: 20, y: 20 }).document.elements[1];
  assert.deepEqual([moved.x, moved.y], [20, 20]);
});

test("beacons are points: created without size, never resized, and duplicates drop hardware identity", () => {
  const created = applyCommand(createEditorState(doc([entrance()])), { type: "create", element: { id: 9, type: "beacon", x: 12.4, y: 7.6 } });
  const beacon = created.document.elements[1];
  assert.equal("width" in beacon, false);
  assert.equal("height" in beacon, false);
  assert.deepEqual([beacon.x, beacon.y], [12, 8]);

  const source = withEntrance({ id: 3, type: "beacon", x: 6, y: 6, beaconId: "IN-001", beaconCode: "IN-001", beaconDbId: "db-1", identityKey: "u:1:2", uuid: "u", major: 1, minor: 2 });
  const state = createEditorState(source);
  assert.equal(applyCommand(state, { type: "resize", id: 3, width: 5, height: 5 }), state);

  const copy = applyCommand(state, { type: "duplicate", id: 3, duplicateId: 4 }).document.elements[2];
  assert.equal(copy.id, 4);
  assert.deepEqual([copy.type, copy.x, copy.y], ["beacon", 7, 7]);
  const serialized = JSON.parse(JSON.stringify(copy)) as Record<string, unknown>;
  for (const field of ["beaconId", "beaconCode", "beaconDbId", "identityKey", "uuid", "major", "minor"]) {
    assert.equal(field in serialized, false, `${field} must not survive duplication`);
  }
});

test("duplicates stay inside the grid when placed on the bottom right edge", () => {
  const beaconCorner = applyCommand(createEditorState(withEntrance({ id: 3, type: "beacon", x: 40, y: 30, beaconId: "IN-002" })), { type: "duplicate", id: 3, duplicateId: 7 });
  const beaconCopy = beaconCorner.document.elements.find((element) => element.id === 7)!;
  assert.deepEqual([beaconCopy.x, beaconCopy.y], [40, 30]);

  const shelfCorner = applyCommand(createEditorState(withEntrance(shelf(6, 35, 28))), { type: "duplicate", id: 6, duplicateId: 7 });
  const shelfCopy = shelfCorner.document.elements.find((element) => element.id === 7)!;
  assert.deepEqual([shelfCopy.x, shelfCopy.y, shelfCopy.width, shelfCopy.height], [35, 28, 5, 2]);
  assert.equal(codes(validateLayout(shelfCorner.document)).includes("bounds"), false);
});

test("duplicate inserts the copy behind the original with the requested id, selects it and can be undone", () => {
  const state = createEditorState(withEntrance(shelf("s-1", 4, 4, { label: "A" }), shelf("s-2", 20, 4)));
  const original = state.document.elements[1];
  const next = applyCommand(state, { type: "duplicate", id: "s-1", duplicateId: "s-copy" });
  assert.deepEqual(next.document.elements.map((element) => element.id), [1, "s-1", "s-copy", "s-2"]);
  assert.deepEqual(next.document.elements[1], original);
  const copy = next.document.elements[2];
  assert.equal(copy.locked, false);
  assert.deepEqual([copy.x, copy.y], [5, 5]);
  assert.equal(copy.label, "A");
  assert.equal(next.selectedId, "s-copy");
  assert.equal(next.past.length, 1);
  assert.deepEqual(undo(next).document, state.document);

  assert.equal(applyCommand(state, { type: "duplicate", id: "s-1", duplicateId: 1 }), state, "existing id 1 rejected");
  assert.equal(applyCommand(state, { type: "duplicate", id: "s-1", duplicateId: "s-2" }), state, "existing id s-2 rejected");
});

test("shrinking the grid below an element is applied and then reported as a bounds error", () => {
  const state = createEditorState(withEntrance(shelf(5, 4, 20, { height: 8 })));
  const shrunk = applyCommand(state, { type: "document", changes: { gridSize: { width: 40, height: 20 } } });
  assert.deepEqual(shrunk.document.gridSize, { width: 40, height: 20 });
  assert.equal(shrunk.past.length, 1);
  const issues = validateLayout(shrunk.document);
  assert.ok(issues.some((issue) => issue.code === "bounds" && issue.elementId === 5 && issue.severity === "error"));
  assert.equal(issues.some((issue) => issue.code === "bounds" && issue.elementId === 1), false);

  const narrow = applyCommand(state, { type: "document", changes: { gridSize: { width: 3, height: 30 } } });
  assert.ok(validateLayout(narrow.document).some((issue) => issue.code === "bounds" && issue.elementId === 5));
});

test("invalid grid sizes are rejected without changing state", () => {
  const state = createEditorState(withEntrance(shelf(5, 4, 4)));
  for (const gridSize of [{ width: 0, height: 30 }, { width: 40, height: 0 }, { width: -5, height: 30 }, { width: 1001, height: 30 }, { width: 40, height: Number.NaN }]) {
    assert.equal(applyCommand(state, { type: "document", changes: { gridSize } }), state, JSON.stringify(gridSize));
  }
});

test("undo and redo replay a create, move and resize sequence to the identical document", () => {
  const start = createEditorState(doc([entrance()]));
  let state = applyCommand(start, { type: "create", element: { id: 5, type: "shelf", x: 4, y: 4, width: 4, height: 2 } });
  state = applyCommand(state, { type: "move", id: 5, x: 10, y: 6 });
  state = applyCommand(state, { type: "resize", id: 5, width: 6, height: 3 });
  const finalDocument = structuredClone(state.document);

  for (let step = 0; step < 3; step++) state = undo(state);
  assert.deepEqual(state.document, start.document);
  assert.equal(state.future.length, 3);

  for (let step = 0; step < 3; step++) state = redo(state);
  assert.deepEqual(state.document, finalDocument);
  assert.equal(state.future.length, 0);

  state = undo(state);
  state = applyCommand(state, { type: "move", id: 5, x: 12, y: 6 });
  assert.equal(state.future.length, 0, "a new action after undo clears the redo branch");
  assert.equal(redo(state), state);
});

test("history keeps at most 80 steps", () => {
  let state = createEditorState(withEntrance(shelf(5, 4, 4)));
  for (let step = 1; step <= 81; step++) state = applyCommand(state, { type: "move", id: 5, x: step % 2 ? 11 : 10, y: 4 });
  assert.equal(state.past.length, 80);
  for (let step = 0; step < 81; step++) state = undo(state);
  assert.equal(state.past.length, 0);
  // The state before the first move (x = 4) was evicted, so the oldest reachable state has x = 11.
  assert.equal(state.document.elements[1].x, 11);
});

test("an empty layout reports both the empty and the missing entrance error", () => {
  const issues = validateLayout(doc([]));
  assert.ok(issues.some((issue) => issue.code === "empty" && issue.severity === "error" && issue.elementId === null));
  assert.ok(issues.some((issue) => issue.code === "entrance" && issue.severity === "error"));
});

test("a duplicate beacon ID is reported on the second placement only", () => {
  const issues = validateLayout(withEntrance({ id: 2, type: "beacon", x: 3, y: 3, beaconId: "B-1" }, { id: 3, type: "beacon", x: 4, y: 4, beaconId: "B-1" }), [{ beaconCode: "B-1" }]);
  const duplicates = issues.filter((issue) => issue.code === "beacon-duplicate");
  assert.deepEqual(duplicates.map((issue) => [issue.severity, issue.elementId]), [["error", 3]]);
  assert.equal(issues.some((issue) => issue.code === "beacon-unused"), false);
});

test("a beacon without any identity is an unassigned error", () => {
  const issues = validateLayout(withEntrance({ id: 2, type: "beacon", x: 3, y: 3 }));
  assert.ok(issues.some((issue) => issue.code === "beacon-unassigned" && issue.severity === "error" && issue.elementId === 2));
});

test("foreign beacons are rejected for store layouts and whenever any assignment exists", () => {
  const placed = withEntrance({ id: 2, type: "beacon", x: 3, y: 3, beaconId: "B-404" });
  assert.ok(validateLayout(placed, [], true).some((issue) => issue.code === "beacon-foreign" && issue.elementId === 2));
  assert.ok(validateLayout(placed, [{ beaconCode: "B-1" }], false).some((issue) => issue.code === "beacon-foreign"));
  assert.equal(validateLayout(placed, [], false).some((issue) => issue.code === "beacon-foreign"), false);
});

test("an assigned beacon that is not placed yet only produces a warning", () => {
  const issues = validateLayout(withEntrance({ id: 2, type: "beacon", x: 3, y: 3, beaconId: "B-1" }), [{ beaconCode: "B-1" }, { beaconCode: "B-2" }], true);
  const unused = issues.find((issue) => issue.code === "beacon-unused");
  assert.equal(unused?.severity, "warning");
  assert.equal(unused?.elementId, null);
  assert.match(unused?.message ?? "", /B-2/);
  assert.equal(issues.some((issue) => issue.severity === "error"), false);
});

test("overlapping fixtures warn on the later element, while touching edges do not count", () => {
  const issues = validateLayout(withEntrance(shelf(2, 5, 5), shelf(3, 7, 5), shelf(4, 12, 5)));
  const overlaps = issues.filter((issue) => issue.code === "overlap");
  assert.deepEqual(overlaps.map((issue) => [issue.severity, issue.elementId]), [["warning", 3]]);
});

test("layout codes must use CODE/SECTION/SHELF/ROW and shelf categories must be numeric", () => {
  const issues = validateLayout(withEntrance(
    shelf(2, 5, 5, { layoutCode: "abc" }),
    shelf(3, 15, 5, { layoutCode: "310/1/1" }),
    shelf(4, 25, 5, { layoutCode: "310/1/1/1", category: "310/1", meter: 1 }),
    shelf(5, 5, 15, { category: "3a/1" }),
  ));
  assert.deepEqual(issues.filter((issue) => issue.code === "layout-code").map((issue) => issue.elementId), [2, 3]);
  assert.deepEqual(issues.filter((issue) => issue.code === "shelf-category").map((issue) => issue.elementId), [5]);
  assert.equal(issues.some((issue) => issue.code === "layout-code" && issue.elementId === 4), false);
});

test("two shelves with the same CODE/SECTION address block on the second, and a meter mismatch is an error", () => {
  const issues = validateLayout(withEntrance(
    shelf(2, 5, 5, { category: "310/1", meter: 1 }),
    shelf(3, 15, 5, { category: "310/1", meter: 1 }),
    shelf(4, 25, 5, { category: "310/2", meter: 2 }),
    shelf(5, 5, 15, { category: "310/2", meter: 1 }),
  ));
  assert.deepEqual(issues.filter((issue) => issue.code === "shelf-address-duplicate").map((issue) => [issue.severity, issue.elementId]), [["error", 3]]);
  assert.deepEqual(issues.filter((issue) => issue.code === "shelf-section").map((issue) => issue.elementId), [5]);
});

test("QR anchors need printed IDs of 1 to 12 uppercase letters, digits or hyphens, and must be unique", () => {
  const anchor = (id: number, x: number, anchorId?: string): LayoutElement => ({ id, type: "anchor", x, y: 20, width: 1, height: 1, ...(anchorId === undefined ? {} : { anchorId }) });
  const malformed = validateLayout(withEntrance(anchor(2, 2), anchor(3, 4, "bad id"), anchor(4, 6, "a1"), anchor(5, 8, "ABCDEFGHIJKLM")));
  assert.deepEqual(malformed.filter((issue) => issue.code === "anchor-format").map((issue) => issue.elementId), [2, 3, 4, 5]);

  const duplicated = validateLayout(withEntrance(anchor(2, 2, "A-1"), anchor(3, 4, "A-1"), anchor(4, 6, "A-2")));
  assert.deepEqual(duplicated.filter((issue) => issue.code === "anchor-duplicate").map((issue) => issue.elementId), [3]);
  assert.equal(duplicated.some((issue) => issue.code === "anchor-format"), false);

  const twelve = validateLayout(withEntrance(anchor(2, 2, "ABCDEFGHIJKL")));
  assert.equal(twelve.some((issue) => issue.code === "anchor-format"), false);
});

test("element IDs must be positive safe integers for the iOS map", () => {
  const issues = validateLayout(doc([
    { id: "7", type: "entrance", x: 0, y: 0, width: 2, height: 1 },
    { id: 1.5, type: "shelf", x: 5, y: 5, width: 2, height: 2 },
    { id: 0, type: "wall", x: 10, y: 10, width: 1, height: 1 },
  ]));
  assert.deepEqual(issues.filter((issue) => issue.code === "mobile-id").map((issue) => issue.elementId), ["7", 1.5, 0]);
});

test("a QR anchor duplicate takes the fresh printed ID it is given", () => {
  const state = createEditorState(withEntrance({ id: 2, type: "anchor", x: 3, y: 3, width: 1, height: 1, anchorId: "A1" }));
  const next = applyCommand(state, { type: "duplicate", id: 2, duplicateId: 3, anchorId: "A2" });
  const copy = next.document.elements.find((element) => element.id === 3)!;
  assert.equal(copy.anchorId, "A2");
  assert.equal(next.document.elements.find((element) => element.id === 2)!.anchorId, "A1");
  assert.equal(validateLayout(next.document).some((issue) => issue.code === "anchor-duplicate"), false);
});

test("a QR anchor duplicate without a new ID does not silently copy the printed code", () => {
  const state = createEditorState(withEntrance({ id: 2, type: "anchor", x: 3, y: 3, width: 1, height: 1, anchorId: "A1" }));
  const next = applyCommand(state, { type: "duplicate", id: 2, duplicateId: 3 });
  const copy = next.document.elements.find((element) => element.id === 3)!;
  assert.equal("anchorId" in copy, false);
  assert.ok(validateLayout(next.document).some((issue) => issue.code === "anchor-format" && issue.elementId === 3));
});

test("a rotated element moved to the grid corner keeps its rotated bounding box inside the grid", () => {
  // validateLayout measures rotated bounds, so move must clamp the same footprint it validates.
  const state = createEditorState(withEntrance({ id: 5, type: "wall", x: 10, y: 10, width: 5, height: 1, rotation: 45 }));
  const moved = applyCommand(state, { type: "move", id: 5, x: 0, y: 0 });
  assert.equal(codes(validateLayout(moved.document)).includes("bounds"), false);
});

test("rotating an element at the grid edge keeps its rotated bounding box inside without moving fractional positions", () => {
  // Top edge: the 45 degree footprint reaches above y = 0, so the centre is pushed down; x keeps its fraction.
  const state = createEditorState(withEntrance({ id: 5, type: "wall", x: 0.37, y: 0, width: 5, height: 1 }));
  const turnedState = applyCommand(state, { type: "rotate", id: 5, rotation: 45 });
  const turned = turnedState.document.elements[1];
  assert.equal(turned.rotation, 45);
  assert.equal(turned.x, 0.37);
  const halfY = (5 * Math.sin(Math.PI / 4) + 1 * Math.cos(Math.PI / 4)) / 2;
  assert.ok(Math.abs(turned.y - (halfY - 0.5)) < 1e-9, `y ${turned.y}`);
  assert.equal(codes(validateLayout(turnedState.document)).includes("bounds"), false);
});

test("parseImportedDocument rejects anything that is not a layout object", () => {
  for (const value of [null, "layout", [], 42]) {
    assert.throws(() => parseImportedDocument(value), /enthält keinen Grundriss/, JSON.stringify(value));
  }
});

test("parseImportedDocument rejects invalid shop name, grid size and element list", () => {
  const valid = { shopName: "Import", gridSize: { width: 20, height: 20 }, elements: [{ id: 1, type: "entrance", x: 0, y: 0 }] };
  assert.throws(() => parseImportedDocument({ ...valid, shopName: undefined }), /Filialname oder Rastergröße/);
  assert.throws(() => parseImportedDocument({ ...valid, shopName: 12 }), /Filialname oder Rastergröße/);
  for (const gridSize of [{ width: 0, height: 20 }, { width: 20, height: 1001 }, { width: Number.NaN, height: 20 }, { width: 20 }]) {
    assert.throws(() => parseImportedDocument({ ...valid, gridSize }), /Filialname oder Rastergröße/, JSON.stringify(gridSize));
  }
  assert.throws(() => parseImportedDocument({ ...valid, elements: {} }), /Elementliste/);
  assert.throws(() => parseImportedDocument({ ...valid, elements: Array.from({ length: 5001 }, (_, index) => ({ id: index + 1, type: "wall", x: 0, y: 0 })) }), /Elementliste/);
});

test("parseImportedDocument rejects elements without a type, with negative sizes or with duplicate IDs", () => {
  const valid = { shopName: "Import", gridSize: { width: 20, height: 20 }, elements: [] as unknown[] };
  const invalidElements: unknown[] = [
    { id: 1, x: 0, y: 0 },
    { id: 2, type: "  ", x: 0, y: 0 },
    { id: 3, type: "wall", x: 0, y: 0, width: -1 },
    { id: 4, type: "wall", x: 0, y: 0, height: Number.NaN },
    { id: 5, type: "wall", x: Number.NaN, y: 0 },
  ];
  for (const element of invalidElements) {
    assert.throws(() => parseImportedDocument({ ...valid, elements: [element] }), /ungültige Daten/, JSON.stringify(element));
  }
  assert.throws(() => parseImportedDocument({ ...valid, elements: [{ id: 1, type: "shelf", x: 0, y: 0 }, { id: 1, type: "wall", x: 1, y: 1 }] }), /eindeutig/);
});

test("parseImportedDocument accepts unknown document and element fields and returns them unchanged", () => {
  const value = {
    shopName: "Import", gridSize: { width: 20, height: 20 }, customRoot: { version: 3 },
    elements: [{ id: 1, type: "shelf", x: 0, y: 0, width: 2, height: 2, customElement: ["keep"] }],
  };
  const parsed = parseImportedDocument(value);
  assert.deepEqual(parsed, value);
  assert.deepEqual(parsed.customRoot, { version: 3 });
});
