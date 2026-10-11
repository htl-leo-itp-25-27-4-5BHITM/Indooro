import assert from "node:assert/strict";
import test from "node:test";
import { createHistory, pushHistory, redoHistory, undoHistory } from "../../main/resources/META-INF/resources/admin/editor-core.js";

test("history stores completed edits and restores them through redo", () => {
  const initial = { gridSize: { width: 20, height: 20 }, elements: [] };
  let history = createHistory(initial);
  const drawn = { ...initial, elements: [{ id: 1, x: 2, y: 3 }] };
  history = pushHistory(history, drawn);

  drawn.elements[0].x = 99;
  assert.equal(history.present.elements[0].x, 2, "committed states cannot be changed by later edits");

  history = undoHistory(history);
  assert.deepEqual(history.present.elements, []);
  history = redoHistory(history);
  assert.equal(history.present.elements[0].x, 2);
});

test("unchanged selection creates no history entry and a new edit drops the redo branch", () => {
  const initial = { elements: [{ id: 1, x: 2 }] };
  let history = createHistory(initial);
  assert.equal(pushHistory(history, { elements: [{ id: 1, x: 2 }] }), history);

  history = pushHistory(history, { elements: [{ id: 1, x: 3 }] });
  history = undoHistory(history);
  history = pushHistory(history, { elements: [{ id: 1, x: 4 }] });
  assert.equal(history.future.length, 0);
  assert.equal(redoHistory(history), history);
  assert.equal(history.present.elements[0].x, 4);
});

test("history restores grid changes alongside scene elements", () => {
  const initial = { gridSize: { width: 20, height: 20 }, elements: [] };
  const changed = pushHistory(createHistory(initial), { gridSize: { width: 40, height: 30 }, elements: [] });
  assert.deepEqual(undoHistory(changed).present.gridSize, initial.gridSize);
  assert.deepEqual(redoHistory(undoHistory(changed)).present.gridSize, { width: 40, height: 30 });
});
