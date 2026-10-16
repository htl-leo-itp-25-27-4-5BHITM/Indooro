import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { elementFill, shelfMetadata, shelfMetadataChanges } from "./metadata";
import { applyCommand, createEditorState, isDirty, undo, type LayoutDocument } from "./model";
import { validateLayout } from "./validation";

const readDocument = (url: URL): LayoutDocument => JSON.parse(readFileSync(url, "utf8")) as LayoutDocument;
const legacyFixture = new URL("../../../backend/indooro_server/src/main/resources/default-layout.json", import.meta.url);
const storeFixture = new URL("./fixtures/store-layout.json", import.meta.url);

test("shipped customer layout round-trips without altering category, meter, color, ids or element order", () => {
  const source = readDocument(legacyFixture);
  assert.equal(source.elements.length, 55);
  const state = createEditorState(source);
  assert.deepEqual(state.document, source);
  assert.equal(isDirty(state), false);
  assert.equal(validateLayout(state.document).filter((issue) => issue.severity === "error").length, 0);
  const shelf = source.elements.find((element) => element.type === "shelf" && element.category);
  assert.ok(shelf?.id);
  const edited = applyCommand(state, { type: "move", id: shelf.id, x: shelf.x + 1, y: shelf.y });
  assert.equal(isDirty(edited), true);
  assert.deepEqual(undo(edited).document, source);
  assert.deepEqual(JSON.parse(JSON.stringify(undo(edited).document)), source);
});

test("store fixture preserves beacon identity and navigation metadata through unrelated edits", () => {
  const source = readDocument(storeFixture);
  const assigned = [{ beaconCode: "IN-001", identityKey: "123e4567-e89b-12d3-a456-426614174000:1:2" }];
  const state = createEditorState(source);
  assert.deepEqual(validateLayout(state.document, assigned), []);
  const edited = applyCommand(state, { type: "patch", id: 2, changes: { label: "Frisches Obst" } });
  assert.equal(edited.document.elements[2].identityKey, source.elements[2].identityKey);
  assert.deepEqual(edited.document.navigationMetadata, source.navigationMetadata);
  assert.equal(edited.document.elements[1].category, "310/1");
  assert.equal(edited.document.elements[1].meter, 1);
  assert.deepEqual(undo(edited).document, source);
});

test("shelf inspector changes preserve legacy CODE/SECTION addressing", () => {
  const source = readDocument(storeFixture);
  const original = source.elements[1];
  assert.deepEqual(shelfMetadata(original), { code: "310", section: 1 });
  const codePatch = shelfMetadataChanges(original, { code: "311" });
  assert.deepEqual(codePatch, { category: "311/1", meter: 1 });
  const sectionPatch = shelfMetadataChanges({ ...original, ...codePatch }, { section: 3 });
  assert.deepEqual(sectionPatch, { category: "311/3", meter: 3 });
  const edited = applyCommand(createEditorState(source), { type: "patch", id: 2, changes: sectionPatch });
  assert.equal(validateLayout(edited.document, [{ beaconCode: "IN-001" }]).length, 0);
  const inconsistent = structuredClone(edited.document);
  inconsistent.elements[1].meter = 4;
  assert.ok(validateLayout(inconsistent).some((issue) => issue.code === "shelf-section" && issue.elementId === 2));
});

test("stored element colors render only as safe hex values", () => {
  const source = readDocument(storeFixture);
  assert.equal(elementFill(source.elements[1], "#000000"), "#4CAF50");
  assert.equal(elementFill({ ...source.elements[1], color: "url(https://example.invalid/track)" }, "#000000"), "#000000");
});
