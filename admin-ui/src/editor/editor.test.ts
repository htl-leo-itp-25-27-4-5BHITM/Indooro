import assert from "node:assert/strict";
import test from "node:test";
import { screenToWorld, worldToScreen, zoomAt } from "./geometry";
import { applyCommand, createEditorState, isDirty, markSaved, redo, undo, type LayoutDocument } from "./model";
import { validateLayout } from "./validation";

const fixture = (): LayoutDocument => ({
  shopName: "Testmarkt", gridSize: { width: 40, height: 30 },
  elements: [
    { id: 7, type: "entrance", x: 1, y: 1, width: 3, height: 1, label: "Süd" },
    { id: "s-1", type: "shelf", x: 4, y: 4, width: 5, height: 2, category: "310/1", meter: 1, customConsumerField: { code: "kept" } },
  ],
  customDocumentField: "preserved",
});

test("move, resize, rotate and inspector edits are atomic and reversible", () => {
  let state = createEditorState(fixture());
  state = applyCommand(state, { type: "move", id: "s-1", x: 9.3, y: 6.7 });
  assert.deepEqual([state.document.elements[1].x, state.document.elements[1].y], [9, 7]);
  state = applyCommand(state, { type: "resize", id: "s-1", width: 8, height: 4 });
  state = applyCommand(state, { type: "rotate", id: "s-1", rotation: -90 });
  state = applyCommand(state, { type: "patch", id: "s-1", changes: { label: "Obst", x: 999 } });
  assert.equal(state.document.elements[1].rotation, 270);
  assert.equal(state.document.elements[1].label, "Obst");
  assert.equal(state.document.elements[1].x, 9);
  assert.equal(state.document.elements[1].category, "310/1");
  assert.deepEqual(state.document.elements[1].customConsumerField, { code: "kept" });
  assert.equal(state.document.customDocumentField, "preserved");
  assert.equal(state.past.length, 4);
  state = undo(state);
  assert.equal(state.document.elements[1].label, undefined);
  state = undo(state);
  assert.equal(state.document.elements[1].rotation, undefined);
  state = redo(state);
  assert.equal(state.document.elements[1].rotation, 270);
  assert.equal(state.document.elements[0].x, 1);
});

test("dirty state tracks the saved revision even when editing continues during save", () => {
  const initial = createEditorState(fixture());
  let state = applyCommand(initial, { type: "move", id: "s-1", x: 10, y: 4 });
  const sent = structuredClone(state.document);
  state = applyCommand(state, { type: "move", id: "s-1", x: 12, y: 4 });
  state = markSaved(state, sent);
  assert.equal(isDirty(state), true);
  state = undo(state);
  assert.equal(isDirty(state), false);
  state = redo(state);
  assert.equal(isDirty(state), true);
});

test("old ids are normalized, created elements snap and stay in bounds", () => {
  const source = fixture();
  source.elements.push({ type: "counter", x: 1, y: 2, width: 2, height: 2 });
  let state = createEditorState(source);
  assert.equal(state.document.elements[2].id, "legacy-3");
  assert.equal(isDirty(state), false);
  state = applyCommand(state, { type: "create", element: { id: "new", type: "wall", x: 39.8, y: -2, width: 4, height: 2 } });
  assert.deepEqual([state.document.elements[3].x, state.document.elements[3].y], [36, 0]);
  state = applyCommand(state, { type: "delete", id: "new" });
  assert.equal(state.document.elements.length, 3);
  assert.equal(isDirty(state), false);
});

test("duplicate beacon clears hardware identity; locked elements resist edits but unlock", () => {
  const source = fixture();
  source.elements.push({ id: "b", type: "beacon", x: 3, y: 3, beaconId: "B-1", uuid: "abc", major: 1, minor: 2 });
  let state = createEditorState(source);
  state = applyCommand(state, { type: "duplicate", id: "b", duplicateId: "b-copy" });
  const copy = state.document.elements.find((element) => element.id === "b-copy")!;
  assert.equal(copy.beaconId, undefined);
  assert.equal(copy.uuid, undefined);
  state = applyCommand(state, { type: "patch", id: "b", changes: { locked: true } });
  const blocked = applyCommand(state, { type: "move", id: "b", x: 20, y: 20 });
  assert.equal(blocked, state);
  state = applyCommand(state, { type: "patch", id: "b", changes: { locked: false } });
  assert.equal(state.document.elements.find((element) => element.id === "b")!.locked, false);
});

test("validation links bounds, rotated bounds, beacon assignment and overlap to elements", () => {
  const source = fixture();
  source.elements.push({ id: "rotated", type: "wall", x: 0, y: 0, width: 5, height: 1, rotation: 45 });
  source.elements.push({ id: "b1", type: "beacon", x: 5, y: 5, beaconId: "B-1" });
  source.elements.push({ id: "b2", type: "beacon", x: 6, y: 5, beaconId: "B-1" });
  source.elements.push({ id: "s2", type: "shelf", x: 5, y: 4, width: 2, height: 2 });
  const issues = validateLayout(source, [{ beaconCode: "B-1" }, { beaconCode: "B-2" }]);
  assert.ok(issues.some((issue) => issue.code === "bounds" && issue.elementId === "rotated"));
  assert.ok(issues.some((issue) => issue.code === "beacon-duplicate" && issue.elementId === "b2"));
  assert.ok(issues.some((issue) => issue.code === "beacon-unused"));
  assert.ok(issues.some((issue) => issue.code === "overlap" && issue.elementId === "s2"));
  assert.ok(issues.some((issue) => issue.code === "metadata" && issue.elementId === "s2"));
});

test("zoom keeps the cursor over the same world point", () => {
  const viewport = { x: 35, y: -20, scale: 10 };
  const cursor = { x: 270, y: 140 };
  const world = screenToWorld(cursor, viewport);
  const zoomed = zoomAt(viewport, cursor, 1.4);
  assert.deepEqual(screenToWorld(cursor, zoomed), world);
  assert.deepEqual(worldToScreen(world, zoomed), cursor);
});
