import assert from "node:assert/strict";
import test from "node:test";
import { nextAnchorId } from "./metadata";
import { applyCommand, createEditorState, isDirty, parseImportedDocument, undo, type LayoutDocument } from "./model";
import { validateLayout } from "./validation";

const anchorDocument = (): LayoutDocument => ({
  shopName: "Ankermarkt", gridSize: { width: 40, height: 30 },
  elements: [
    { id: 11, type: "entrance", x: 1, y: 1, width: 3, height: 1, label: "Süd" },
    { id: 12, type: "anchor", x: 10.5, y: 3, width: 1, height: 1, label: "Gang 4 – Anfang", anchorId: "A12" },
    { id: 13, type: "anchor", x: 20, y: 3, width: 1, height: 1, label: "Gang 5", anchorId: "GANG-5-ENDE" },
  ],
  customDocumentField: "preserved",
});

const anchorIssues = (document: LayoutDocument) => validateLayout(document).filter((issue) => issue.code.startsWith("anchor-"));

test("a layout with QR anchors survives load, save and undo with anchorId and label unchanged", () => {
  const source = anchorDocument();
  const loaded = createEditorState(source);
  assert.equal(isDirty(loaded), false);
  assert.deepEqual(loaded.document, source);

  // The save path serializes a structured clone; the server receives exactly this JSON.
  const saved = JSON.parse(JSON.stringify(structuredClone(loaded.document))) as LayoutDocument;
  assert.deepEqual(saved, source);
  assert.deepEqual(saved.elements[1], { id: 12, type: "anchor", x: 10.5, y: 3, width: 1, height: 1, label: "Gang 4 – Anfang", anchorId: "A12" });

  const edited = applyCommand(loaded, { type: "move", id: 12, x: 11, y: 3 });
  assert.equal(edited.document.elements[1].anchorId, "A12");
  assert.deepEqual(undo(edited).document, source);
});

test("an imported layout file keeps anchor elements intact through parse and editor state", () => {
  const source = anchorDocument();
  const imported = parseImportedDocument(JSON.parse(JSON.stringify({ ...source, exportDate: "2026-10-16T10:00:00.000Z" })) as unknown);
  const state = createEditorState(imported);
  const roundTripped = JSON.parse(JSON.stringify(state.document)) as LayoutDocument;
  assert.deepEqual(roundTripped.elements, source.elements);
  assert.equal(roundTripped.customDocumentField, "preserved");
});

test("a new anchor receives the next free A<n> id and keeps it through creation", () => {
  const document = anchorDocument();
  assert.equal(nextAnchorId({ ...document, elements: [] }), "A1");
  assert.equal(nextAnchorId(document), "A1");
  const withGap = { ...document, elements: [...document.elements, { id: 14, type: "anchor", x: 2, y: 2, width: 1, height: 1, anchorId: "A1" }, { id: 15, type: "anchor", x: 3, y: 2, width: 1, height: 1, anchorId: "A3" }] };
  assert.equal(nextAnchorId(withGap), "A2");
  assert.equal(nextAnchorId({ ...document, elements: [{ id: 16, type: "shelf", x: 1, y: 1, width: 1, height: 1, anchorId: "A1" }] }), "A1");

  const created = applyCommand(createEditorState(document), {
    type: "create",
    element: { id: 20, type: "anchor", x: 5, y: 5, width: 1, height: 1, anchorId: nextAnchorId(document) },
  });
  assert.deepEqual(created.document.elements[3], { id: 20, type: "anchor", x: 5, y: 5, width: 1, height: 1, anchorId: "A1" });
});

test("duplicate anchor ids are reported on the later element as errors", () => {
  const document = anchorDocument();
  document.elements.push({ id: 14, type: "anchor", x: 4, y: 4, width: 1, height: 1, label: "Kopie", anchorId: "A12" });
  const issues = anchorIssues(document);
  assert.deepEqual(issues.map((issue) => [issue.code, issue.severity, issue.elementId]), [["anchor-duplicate", "error", 14]]);
});

test("malformed anchor ids are rejected with the same rule as the backend", () => {
  for (const anchorId of ["a1", "A1234567890123", "A_1", "A 1", "A/1", "Ä1", "", undefined]) {
    const document = anchorDocument();
    document.elements = [{ id: 30, type: "anchor", x: 1, y: 1, width: 1, height: 1, anchorId }];
    assert.deepEqual(anchorIssues(document).map((issue) => [issue.code, issue.severity, issue.elementId]), [["anchor-format", "error", 30]], String(anchorId));
  }
  for (const anchorId of ["A1", "A12", "GANG-4-ENDE", "ABCDEFGHIJKL"]) {
    const document = anchorDocument();
    document.elements = [{ id: 31, type: "anchor", x: 1, y: 1, width: 1, height: 1, anchorId }];
    assert.deepEqual(anchorIssues(document), [], anchorId);
  }
});

test("layouts without anchors and drafts with incomplete anchors follow the expected rules", () => {
  const withoutAnchors = { ...anchorDocument(), elements: anchorDocument().elements.filter((element) => element.type !== "anchor") };
  assert.deepEqual(anchorIssues(withoutAnchors), []);
  // A missing id is an anchor-format error; missing dimensions are reported by the generic dimension rule.
  const incompleteAnchor = anchorDocument();
  incompleteAnchor.elements.push({ id: 40, type: "anchor", x: 2, y: 2 });
  const issues = validateLayout(incompleteAnchor).filter((issue) => issue.elementId === 40);
  assert.ok(issues.some((issue) => issue.code === "anchor-format" && issue.severity === "error"));
  assert.ok(issues.some((issue) => issue.code === "dimension"));
});
