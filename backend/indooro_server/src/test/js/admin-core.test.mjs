import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRecipeProductMappingPayload,
  buildProductPayload,
  canAccessRoute,
  isActiveLayoutVersion,
  nullableNumber,
  parseImportText,
  readinessForProduct,
  recipeMappingProductReadiness,
  recipeMappingProductMeta,
  recipeReadiness,
  routeFromPath,
  sortRows,
  validateBeaconForm,
  validateProductForm,
  validateRecipeForm,
  validateStoreForm
} from "../../main/resources/META-INF/resources/admin/core.js";
import {
  clampElement,
  createHistory,
  pushHistory,
  redoHistory,
  snapValue,
  undoHistory,
  validateLayoutDocument
} from "../../main/resources/META-INF/resources/admin/editor-core.js";

test("routeFromPath resolves split admin pages", () => {
  assert.equal(routeFromPath("/admin/stores/detail/").id, "stores");
  assert.equal(routeFromPath("/admin/server-logs/").id, "server-logs");
  assert.equal(routeFromPath("/admin/recipes/").id, "recipes");
  assert.equal(routeFromPath("/admin/recipes/?recipeId=abc").id, "recipes");
});

test("role-aware navigation blocks admin-only routes for store managers", () => {
  assert.equal(canAccessRoute({ roles: ["store-manager"] }, routeFromPath("/admin/products/")), false);
  assert.equal(canAccessRoute({ roles: ["store-manager"] }, routeFromPath("/admin/recipes/")), false);
  assert.equal(canAccessRoute({ roles: ["region-manager"] }, routeFromPath("/admin/recipes/")), false);
  assert.equal(canAccessRoute({ roles: ["admin"] }, routeFromPath("/admin/products/")), true);
  assert.equal(canAccessRoute({ roles: ["admin"] }, routeFromPath("/admin/recipes/")), true);
});

test("validators catch required operational fields", () => {
  assert.equal(validateStoreForm({}).regionId, "Region ist erforderlich.");
  assert.equal(validateBeaconForm({ uuid: "bad", major: 1, minor: 1 }).uuid, "UUID-Format wirkt ungueltig.");
  assert.equal(validateProductForm({ id: 0, name: "", price: -1, layoutCode: "" }).id, "Produkt-ID muss positiv sein.");
});

test("product readiness reports missing route metadata", () => {
  const readiness = readinessForProduct({ id: 1, name: "Apfel" });
  assert.equal(readiness.status, "warning");
  assert.ok(readiness.problems.includes("Layout-Code fehlt"));
  assert.deepEqual(readinessForProduct({ id: 2, name: "Milch", layoutCode: "310/1/1/1", storeCode: "LNZ" }), {
    status: "ready",
    label: "Routbar",
    problems: []
  });
  assert.ok(readinessForProduct({ layoutCode: "A-01", storeCode: "LNZ" }).problems.includes("Layout-Code ist unklar"));
  assert.ok(readinessForProduct({ layoutCode: "310/1/1", storeCode: "LNZ" }).problems.includes("Layout-Code ist unklar"));
});

test("empty numeric form values remain null in product and beacon payloads", () => {
  assert.equal(nullableNumber(""), null);
  assert.equal(nullableNumber(null), null);
  assert.equal(nullableNumber("2"), 2);
  assert.equal(buildProductPayload({ id: "7", name: "Apfel", price: "", layoutCode: "310/1/1/1" }).price, null);
});

test("layout and recipe readiness use backend summary fields", () => {
  assert.equal(isActiveLayoutVersion({ status: "ACTIVE" }), true);
  assert.equal(isActiveLayoutVersion({ status: "ARCHIVED", active: true }), false);
  assert.ok(recipeReadiness({ totalIngredientCount: 1, mappedIngredientCount: 1, stepCount: 0 }).warnings.includes("Keine Schritte"));
});

test("recipe form validation catches publish blockers early", () => {
  const errors = validateRecipeForm({ slug: "", title: "", servings: 0 });
  assert.equal(errors.slug, "Slug ist erforderlich.");
  assert.equal(errors.title, "Titel ist erforderlich.");
  assert.equal(errors.servings, "Portionen muessen mindestens 1 sein.");
  assert.deepEqual(validateRecipeForm({ slug: "tomaten-pasta", title: "Tomaten Pasta", servings: 2 }), {});
});

test("recipe readiness reports mapping and step gaps", () => {
  const readiness = recipeReadiness({
    totalIngredientCount: 3,
    mappedIngredientCount: 1,
    stepCount: 0,
    steps: []
  });
  assert.equal(readiness.status, "warning");
  assert.ok(readiness.warnings.includes("2 Mapping offen"));
  assert.ok(readiness.warnings.includes("Keine Schritte"));

  const ready = recipeReadiness({
    totalIngredientCount: 2,
    mappedIngredientCount: 2,
    steps: [{ instruction: "Kochen." }]
  });
  assert.equal(ready.status, "ready");
  assert.equal(ready.label, "Publikationsbereit");
});

test("recipe mapping product helpers keep product id as mapping source", () => {
  const product = {
    id: 42,
    name: "Tomaten",
    price: 1.99,
    layoutCode: "310/1",
    storeCode: "demo-store"
  };

  assert.deepEqual(buildRecipeProductMappingPayload(product), {
    productId: 42,
    storeId: null,
    storeCode: "demo-store",
    mappingType: "MANUAL",
    confidence: 1,
    manuallyConfirmed: true
  });
  assert.equal(buildRecipeProductMappingPayload({ name: "Freitext" }), null);
  assert.equal(recipeMappingProductReadiness(product).label, "Routbar");
  assert.equal(recipeMappingProductReadiness({ ...product, layoutCode: "" }).label, "Nicht routbar");
  assert.ok(recipeMappingProductMeta(product).includes("#42"));
  assert.ok(recipeMappingProductMeta(product).includes("310/1"));
});

test("imports support JSON arrays and NDJSON", () => {
  assert.equal(parseImportText('[{"id":1}]').length, 1);
  assert.equal(parseImportText('{"id":1}\n{"id":2}').length, 2);
});

test("table helpers sort naturally", () => {
  const sorted = sortRows([{ name: "B2" }, { name: "B10" }, { name: "B1" }], "name");
  assert.deepEqual(sorted.map((row) => row.name), ["B1", "B2", "B10"]);
});

test("layout validation reports publish blockers and warnings", () => {
  const result = validateLayoutDocument({
    width: 100,
    height: 100,
    gridSize: 10,
    elements: [
      { id: "b1", type: "beacon", x: 10, y: 10, width: 10, height: 10, beaconCode: "A" },
      { id: "b2", type: "beacon", x: 20, y: 10, width: 10, height: 10, beaconCode: "A" },
      { id: "s1", type: "shelf", x: 120, y: 0, width: 10, height: 10 }
    ]
  });
  assert.equal(result.readyToPublish, false);
  assert.ok(result.errorCount >= 2);
});

test("editor geometry and history helpers are deterministic", () => {
  assert.equal(snapValue(14, 10, true), 10);
  assert.equal(clampElement({ x: 99, y: -4, width: 20, height: 20 }, { width: 100, height: 100 }).x, 80);
  const history = pushHistory(createHistory({ value: 1 }), { value: 2 });
  assert.equal(undoHistory(history).present.value, 1);
  assert.equal(redoHistory(undoHistory(history)).present.value, 2);
});
