import assert from "node:assert/strict";
import test from "node:test";
import { fitViewport, screenToWorld, worldToScreen, zoomAt } from "./geometry";
import { assignShelfSections, chooseShelfCategory } from "./metadata";
import { applyCommand, createEditorState, isDirty, isMobileElementId, markSaved, newElementId, parseImportedDocument, redo, repairMobileElementIds, replaceDocument, undo, type LayoutDocument } from "./model";
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

test("pointer rotation rounds floating point drift and ignores invalid angles", () => {
  const initial = createEditorState(fixture());
  const rotated = applyCommand(initial, { type: "rotate", id: "s-1", rotation: 90.00001049872242 });
  assert.equal(rotated.document.elements[1].rotation, 90);
  assert.equal(applyCommand(rotated, { type: "rotate", id: "s-1", rotation: Number.NaN }), rotated);
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
  assert.ok(isMobileElementId(state.document.elements[2].id));
  assert.equal(isDirty(state), true, "assigning an ID to an old document needs a save");
  state = applyCommand(state, { type: "create", element: { id: "new", type: "wall", x: 39.8, y: -2, width: 4, height: 2 } });
  assert.deepEqual([state.document.elements[3].x, state.document.elements[3].y], [36, 0]);
  state = applyCommand(state, { type: "delete", id: "new" });
  assert.equal(state.document.elements.length, 3);
  assert.equal(isDirty(state), true);
});

test("new and repaired element IDs remain safe JSON integers for the existing iOS decoder", () => {
  const source = fixture();
  const created = newElementId(source);
  assert.ok(isMobileElementId(created));
  assert.equal(source.elements.some((element) => element.id === created), false);
  const repaired = repairMobileElementIds(source);
  assert.equal(repaired.elements[0].id, 7);
  assert.ok(isMobileElementId(repaired.elements[1].id));
  assert.equal(validateLayout(source).some((issue) => issue.code === "mobile-id"), true);
  assert.equal(validateLayout(repaired).some((issue) => issue.code === "mobile-id"), false);
  assert.deepEqual(undo(replaceDocument(createEditorState(source), repaired)).document, source);
});

test("shelf address repair preserves a unique section and resolves duplicates in map order", () => {
  const source: LayoutDocument = { shopName: "Markt", gridSize: { width: 30, height: 30 }, elements: [
    { id: 1, type: "entrance", x: 1, y: 0, width: 2, height: 1 },
    { id: 2, type: "shelf", x: 1, y: 3, width: 2, height: 2, category: "310/1", meter: 1 },
    { id: 3, type: "shelf", x: 5, y: 3, width: 2, height: 2, category: "310/1", meter: 1 },
    { id: 4, type: "shelf", x: 1, y: 8, width: 2, height: 2, category: "310" },
  ] };
  assert.ok(validateLayout(source).some((issue) => issue.code === "shelf-address-duplicate"));
  const repaired = assignShelfSections(source);
  assert.deepEqual(repaired.elements.slice(1).map((element) => [element.category, element.meter]), [["310/1", 1], ["310/2", 2], ["310/3", 3]]);
  assert.equal(validateLayout(repaired).some((issue) => ["shelf-category", "shelf-address-duplicate"].includes(issue.code)), false);
  assert.deepEqual(undo(replaceDocument(createEditorState(source), repaired)).document, source);
});

test("catalog category choice assigns the next free product routing section", () => {
  const source = fixture();
  source.elements.push({ id: 8, type: "shelf", x: 12, y: 4, width: 3, height: 2, category: "525/1", meter: 1 });
  const changes = chooseShelfCategory(source, source.elements[1], "525");
  assert.deepEqual(changes, { category: "525/2", meter: 2 });
  assert.equal(source.elements[1].category, "310/1", "selection does not mutate saved data before command dispatch");
});

test("product positions alone cannot make a shelf reachable to customer search", () => {
  const source = fixture();
  source.elements[1].category = null;
  source.elements[1].productPositions = ["310-42"];
  assert.ok(validateLayout(source).some((issue) => issue.code === "shelf-target-address" && issue.elementId === "s-1" && issue.severity === "error"));
  source.elements[1].category = "310/1";
  assert.equal(validateLayout(source).some((issue) => issue.code === "shelf-target-address"), false);
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

test("store validation rejects a beacon when the store has no assignments", () => {
  const source = fixture();
  source.elements.push({ id: "b1", type: "beacon", x: 5, y: 5, beaconId: "B-404" });
  assert.ok(validateLayout(source, [], true).some((issue) => issue.code === "beacon-foreign" && issue.elementId === "b1"));
  assert.equal(validateLayout(source, [], false).some((issue) => issue.code === "beacon-foreign"), false);
});

test("shelf locations require the customer CODE/SECTION format before publication", () => {
  const source = fixture();
  source.elements[1].category = "310";
  const invalid = validateLayout(source);
  assert.ok(invalid.some((issue) => issue.code === "shelf-category" && issue.severity === "error" && issue.elementId === "s-1"));
  source.elements[1].category = "310/1";
  assert.equal(validateLayout(source).some((issue) => issue.code === "shelf-category"), false);
});

test("editor validates shelf routing metadata while preserving valid customer positions", () => {
  const source = fixture();
  const shelf = source.elements[1];
  shelf.layoutCode = "310/1/1/1";
  shelf.productPositions = ["310-42", 43];
  shelf.accessAngle = 90;
  assert.equal(validateLayout(source).some((issue) => ["layout-code", "product-positions", "access-angle"].includes(issue.code)), false);

  shelf.layoutCode = "525/2/1/1";
  assert.ok(validateLayout(source).some((issue) => issue.code === "shelf-target-mismatch" && issue.elementId === "s-1" && issue.severity === "error"));

  shelf.layoutCode = "310/1";
  shelf.productPositions = ["310-42", "310-42"];
  shelf.accessAngle = 361;
  const issues = validateLayout(source);
  for (const code of ["layout-code", "product-positions", "access-angle"]) {
    assert.ok(issues.some((issue) => issue.code === code && issue.elementId === "s-1" && issue.severity === "error"));
  }
  shelf.productPositions = { invalid: true } as unknown as Array<string | number>;
  assert.ok(validateLayout(source).some((issue) => issue.code === "product-positions"));
});

test("routing readiness warns only for explicit product targets with no geometric shelf approach", () => {
  const source: LayoutDocument = {
    shopName: "Routing fixture", gridSize: { width: 12, height: 12 },
    elements: [
      { id: "entry", type: "entrance", x: 0, y: 0, width: 2, height: 1 },
      { id: "target-shelf", type: "shelf", x: 5, y: 5, width: 2, height: 2, category: "310/1", productPositions: ["310-42", "310-43"] },
    ],
  };
  assert.equal(validateLayout(source).some((issue) => issue.code === "routing-access"), false);

  // Each side has a known physical obstruction, while the shelf itself stays
  // in bounds. The issue remains a warning and links back to the target shelf.
  source.elements.push(
    { id: "north", type: "wall", x: 4, y: 2, width: 4, height: 2.75 },
    { id: "south", type: "wall", x: 4, y: 7.25, width: 4, height: 2 },
    { id: "west", type: "wall", x: 2, y: 4, width: 2.75, height: 4 },
    { id: "east", type: "wall", x: 7.25, y: 4, width: 2, height: 4 },
  );
  const warning = validateLayout(source).find((issue) => issue.code === "routing-access");
  assert.equal(warning?.severity, "warning");
  assert.equal(warning?.elementId, "target-shelf");
  assert.match(warning?.message ?? "", /310-42, 310-43/);
  assert.match(warning?.message ?? "", /keine Aussage zur mobilen Routbarkeit/);
});

test("category-only legacy shelves do not get a routing readiness warning", () => {
  const source = fixture();
  assert.equal(validateLayout(source).some((issue) => issue.code === "routing-access"), false);
});

test("zoom keeps the cursor over the same world point", () => {
  const viewport = { x: 35, y: -20, scale: 10 };
  const cursor = { x: 270, y: 140 };
  const world = screenToWorld(cursor, viewport);
  const zoomed = zoomAt(viewport, cursor, 1.4);
  assert.deepEqual(screenToWorld(cursor, zoomed), world);
  assert.deepEqual(worldToScreen(world, zoomed), cursor);
});

test("fit viewport centers the complete map with padding", () => {
  const viewport = fitViewport({ width: 40, height: 60 }, { width: 800, height: 600 });
  const left = worldToScreen({ x: 0, y: 0 }, viewport);
  const right = worldToScreen({ x: 40, y: 60 }, viewport);
  assert.ok(left.x >= 40 && left.y >= 40);
  assert.ok(right.x <= 760 && right.y <= 560);
  assert.equal((left.x + right.x) / 2, 400);
  assert.equal((left.y + right.y) / 2, 300);
});

test("layer order changes without altering element data and can be undone", () => {
  const initial = createEditorState(fixture());
  const reordered = applyCommand(initial, { type: "reorder", id: 7, direction: "forward" });
  assert.deepEqual(reordered.document.elements.map((element) => element.id), ["s-1", 7]);
  assert.deepEqual(undo(reordered).document, initial.document);
});

test("JSON import preserves unknown mobile fields, is undoable and leaves server save state dirty", () => {
  const initial = createEditorState(fixture());
  const imported = parseImportedDocument({ ...fixture(), shopName: "Import", navigationMetadata: { source: "customer" } });
  const next = replaceDocument(initial, imported);
  assert.equal(next.document.shopName, "Import");
  assert.deepEqual(next.document.navigationMetadata, { source: "customer" });
  assert.equal(isDirty(next), true);
  assert.deepEqual(undo(next).document, initial.document);
  assert.equal(isDirty(undo(next)), false);
  assert.throws(() => parseImportedDocument({ ...fixture(), elements: [{ id: 1, type: "shelf", x: "bad", y: 0 }] }), /ungültige Daten/);
  assert.throws(() => parseImportedDocument({ ...fixture(), elements: [{ id: 1, type: "shelf", x: 0, y: 0 }, { id: 1, type: "wall", x: 1, y: 1 }] }), /eindeutig/);
});
