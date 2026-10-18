import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadDocument } from "./check-parity.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const reviewedPath = resolve(here, "..", "..", "openspec/specs/shared-api/openapi.yaml");
const mobilePath = resolve(here, "..", "..", "api/openapi/indooro-mobile.yaml");

const types = schema => [schema?.type].flat();

test("LayoutElement id, meter and category have unambiguous types", () => {
  const reviewed = loadDocument(reviewedPath);
  const layout = reviewed.components.schemas.LayoutElement;
  assert.equal(layout.properties.id.type, "integer");
  assert.ok(types(layout.properties.meter).includes("integer"));
  assert.ok(!types(layout.properties.meter).includes("string"));
  assert.ok(types(layout.properties.category).includes("string"));
  assert.ok(!types(layout.properties.category).includes("integer"));
});

test("DraftLayoutElement mirrors LayoutElement except for id", () => {
  const reviewed = loadDocument(reviewedPath);
  const { LayoutElement: published, DraftLayoutElement: draft } = reviewed.components.schemas;
  assert.ok(draft, "DraftLayoutElement is missing");
  assert.equal(draft.allOf, undefined, "DraftLayoutElement must be flat, not allOf");
  assert.deepEqual(Object.keys(draft.properties).sort(), Object.keys(published.properties).sort());
  for (const name of Object.keys(published.properties)) {
    if (name === "id") continue;
    assert.deepEqual(draft.properties[name], published.properties[name], `property ${name} differs`);
  }
  assert.ok(Array.isArray(draft.properties.id.oneOf), "draft id must be a oneOf");
});

test("mobile contract exposes integer LayoutElement.id and no DraftLayoutElement", () => {
  const mobile = loadDocument(mobilePath);
  const schemas = mobile.components.schemas;
  assert.equal(schemas.LayoutElement.properties.id.type, "integer");
  assert.equal(schemas.DraftLayoutElement, undefined, "DraftLayoutElement leaked into mobile contract");
  assert.ok(!JSON.stringify(mobile).includes("#/components/schemas/DraftLayoutElement"), "mobile contract references DraftLayoutElement");
});
