import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { parse } from "yaml";
import { mock, mockRoutes } from "../../../../../scripts/admin-smoke-mocks.mjs";

const specPath = new URL("../../../../../openspec/specs/shared-api/openapi.yaml", import.meta.url);
const doc = parse(await readFile(specPath, "utf8"));

// Formats (uuid, date-time) are intentionally not asserted: the smoke mocks use readable ids such as "store-1".
const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });

function findOperation(method, path) {
  return doc.paths?.[path]?.[method.toLowerCase()];
}

// Resolves a "#/components/responses/..." reference, the only response ref form used by the operations under test.
function resolveResponse(response) {
  if (!response?.$ref) return response;
  const name = response.$ref.replace("#/components/responses/", "");
  return doc.components?.responses?.[name];
}

function responseSchema(operation, status) {
  const response = resolveResponse(operation?.responses?.[String(status)]);
  return response?.content?.["application/json"]?.schema;
}

// The schema the route table declares, as the yaml writes it: a ref object or an inline schema.
function declaredSchema(route) {
  return typeof route.schema === "string" ? { $ref: route.schema } : route.schema;
}

function describe(route) {
  return `${route.method} ${route.path} ${route.status}`;
}

// LayoutVersionSummary has no `required` list, so schema validation cannot reject the legacy `active` flag.
test("layout version mocks use status instead of the legacy active flag", () => {
  const route = mockRoutes.find((entry) => entry.name === "storeLayoutVersions");
  assert.ok(route, "storeLayoutVersions route is missing from the mock table");
  for (const entry of route.payload) {
    assert.equal("active" in entry, false, `layout version ${entry.layoutId} still carries the legacy "active" flag`);
    assert.ok(["DRAFT", "ACTIVE", "ARCHIVED"].includes(entry.status), `layout version ${entry.layoutId} has status ${entry.status}`);
  }
});

// Product.layoutCode is only typed as a string in the yaml; its documented format is checked here.
test("product layout codes in mocks use the documented <category>/<meter>/<level>/<position> format", () => {
  const layoutCodeFormat = /^\d{1,4}\/\d{1,3}\/\d{1,2}\/\d{1,2}$/;
  const products = [
    ...mock.products,
    ...mock.recipeMapping.ingredients.flatMap((ingredient) => [ingredient.product, ...ingredient.candidates]),
    mock.confirmedIngredient.product
  ].filter(Boolean);
  assert.ok(products.length > 0, "no products found in mocks");
  for (const product of products) {
    if (product.layoutCode == null) continue;
    assert.match(product.layoutCode, layoutCodeFormat, `product ${product.id} (${product.name}) has layoutCode "${product.layoutCode}"`);
  }
});

test("mock route names are unique", () => {
  const names = mockRoutes.map((route) => route.name);
  assert.equal(new Set(names).size, names.length, `duplicate mock names: ${names.join(", ")}`);
});

for (const route of mockRoutes) {
  test(`mock "${route.name}" targets an operation in openapi.yaml (${describe(route)})`, () => {
    const operation = findOperation(route.method, route.path);
    assert.ok(operation, `mock "${route.name}" points at ${route.method} ${route.path}, which does not exist in openapi.yaml`);
    assert.ok(
      responseSchema(operation, route.status),
      `mock "${route.name}" expects status ${route.status} with application/json, which ${route.method} ${route.path} does not document`
    );
  });

  test(`mock "${route.name}" declares the response schema of ${describe(route)}`, () => {
    const operation = findOperation(route.method, route.path);
    if (!operation) return;
    assert.deepEqual(
      declaredSchema(route),
      responseSchema(operation, route.status),
      `mock "${route.name}" declares a schema that differs from the ${describe(route)} response in openapi.yaml`
    );
  });

  test(`mock "${route.name}" payload validates against ${describe(route)}`, () => {
    const operation = findOperation(route.method, route.path);
    if (!operation) return;
    const schema = responseSchema(operation, route.status);
    if (!schema) return;
    // Validate the JSON the server actually sends, not the in-memory object.
    const wirePayload = JSON.parse(JSON.stringify(route.payload));
    const validate = ajv.compile({ ...schema, components: doc.components });
    const valid = validate(wirePayload);
    assert.ok(
      valid,
      [
        `mock "${route.name}" (${describe(route)}) does not match openapi.yaml:`,
        ...(validate.errors ?? []).map((error) => `  - ${error.instancePath || "/"} ${error.message}${error.params && Object.keys(error.params).length ? ` ${JSON.stringify(error.params)}` : ""}`)
      ].join("\n")
    );
  });
}
