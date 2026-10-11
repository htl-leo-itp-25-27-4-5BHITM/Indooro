import assert from "node:assert/strict";
import { test } from "node:test";
import type { ApiClient } from "./api/client";
import { readRecipeFilters, recipeListPath, saveRecipeChanges, type RecipeDetail } from "./RecipesPage.logic";

const detail: RecipeDetail = {
  id: "recipe-1", slug: "apple-oats", title: "Apple oats", summary: "Warm", description: "Full instructions", imageUrl: "/apple.jpg", imageAlt: "Apple bowl",
  servings: 4, prepTimeMinutes: 10, cookTimeMinutes: 20, totalTimeMinutes: 30, status: "DRAFT", stepCount: 2,
  mappedIngredientCount: 2, totalIngredientCount: 2,
  tags: [{ id: "tag-1", name: "Quick", code: "QUICK" }],
  ingredients: [
    { id: "ingredient-1", position: 1, displayName: "Apples", canonicalName: "Apple", quantity: 2, quantityText: "2 pcs", unitCode: "PCS", preparationNote: "cored", optional: true },
    { id: "ingredient-2", position: 2, displayName: "Oats", canonicalName: "Oat", quantityText: "100 g", optional: false }
  ],
  steps: [{ id: "step-1", position: 1, instruction: "Cut apples", durationMinutes: 2 }, { id: "step-2", position: 2, instruction: "Add oats", durationMinutes: 1 }]
};

test("recipe filters are validated and sent as server-side query parameters", () => {
  assert.deepEqual(readRecipeFilters("?q=apple&status=PUBLISHED&tag=QUICK&page=2"), { q: "apple", status: "PUBLISHED", tag: "QUICK", page: 2 });
  assert.equal(recipeListPath(readRecipeFilters("?q=apple&status=PUBLISHED&tag=QUICK&page=2")), "/api/admin/recipes?page=2&size=20&q=apple&status=PUBLISHED&tag=QUICK");
  assert.deepEqual(readRecipeFilters("?status=wrong&page=-1"), { q: "", status: "", tag: "", page: 0 });
});

test("metadata-only edit preserves image, description, current tags, and skips content writes", async () => {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const api = {
    put: async (path: string, body: unknown) => { calls.push({ method: "PUT", path, body }); return detail; },
    post: async () => { throw new Error("unexpected POST"); },
    delete: async () => { throw new Error("unexpected DELETE"); },
    get: async (path: string) => { calls.push({ method: "GET", path }); return detail; }
  } as unknown as ApiClient;
  await saveRecipeChanges(api, detail, { ...detail, title: "New title", prepTimeMinutes: null }, ["tag-1"]);
  assert.deepEqual(calls.map(({ method, path }) => [method, path]), [
    ["PUT", "/api/admin/recipes/recipe-1"], ["GET", "/api/admin/recipes/recipe-1"]
  ]);
  assert.deepEqual(calls[0].body, {
    slug: "apple-oats", title: "New title", summary: "Warm", description: "Full instructions", imageUrl: "/apple.jpg", imageAlt: "Apple bowl",
    servings: 4, prepTimeMinutes: null, cookTimeMinutes: 20, totalTimeMinutes: 30, status: "DRAFT", tagIds: ["tag-1"]
  });
});

test("content diff uses temporary positions and preserves untouched ingredient fields", async () => {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const bodyOf = (call: { body?: unknown }): Record<string, unknown> => call.body as Record<string, unknown>;
  const api = {
    put: async (path: string, body: unknown) => { calls.push({ method: "PUT", path, body }); return {}; },
    post: async (path: string, body: unknown) => { calls.push({ method: "POST", path, body }); return { id: "new-row" }; },
    delete: async (path: string) => { calls.push({ method: "DELETE", path }); return undefined; },
    get: async (path: string) => { calls.push({ method: "GET", path }); return detail; }
  } as unknown as ApiClient;
  const draft: RecipeDetail = {
    ...detail,
    ingredients: [
      { ...detail.ingredients[0], quantityText: "3 pcs", position: 1 },
      { position: 2, displayName: "Pear", quantityText: "1", selectedProduct: { id: 19, name: "Pear" } }
    ],
    steps: [{ ...detail.steps[0], instruction: "Cut apples finely", position: 1 }, { position: 2, instruction: "Add pear", durationMinutes: null }]
  };
  await saveRecipeChanges(api, detail, draft, ["tag-1"]);
  const tempIngredientUpdate = calls.find((call) => call.path.endsWith("/ingredients/ingredient-1") && Number(bodyOf(call).position) > 1000);
  const tempStepUpdate = calls.find((call) => call.path.endsWith("/steps/step-1") && Number(bodyOf(call).position) > 1000);
  assert.ok(tempIngredientUpdate);
  assert.ok(tempStepUpdate);
  assert.deepEqual(tempIngredientUpdate.body, { position: bodyOf(tempIngredientUpdate).position, displayName: "Apples", canonicalName: "Apple", quantity: 2, quantityText: "3 pcs", unitCode: "PCS", preparationNote: "cored", optional: true });
  assert.ok(calls.some((call) => call.method === "DELETE" && call.path.endsWith("/ingredients/ingredient-2")));
  assert.ok(calls.some((call) => call.method === "DELETE" && call.path.endsWith("/steps/step-2")));
  assert.ok(calls.some((call) => call.method === "POST" && call.path.endsWith("/ingredients") && bodyOf(call).position === 2));
  assert.ok(calls.some((call) => call.method === "PUT" && call.path.endsWith("/product-mapping") && bodyOf(call).productId === 19));
  assert.ok(calls.some((call) => call.method === "POST" && call.path.endsWith("/steps") && bodyOf(call).position === 2));
  assert.deepEqual(calls.at(-1), { method: "GET", path: "/api/admin/recipes/recipe-1" });
});

test("new ingredients require a selected product before mutation", async () => {
  const calls: string[] = [];
  const api = {
    put: async (path: string) => { calls.push(path); return {}; },
    post: async (path: string) => { calls.push(path); return {}; },
    delete: async (path: string) => { calls.push(path); return undefined; },
    get: async (path: string) => { calls.push(path); return detail; }
  } as unknown as ApiClient;
  await assert.rejects(saveRecipeChanges(api, detail, { ...detail, ingredients: [{ position: 1, displayName: "", quantityText: "" }] }, ["tag-1"]), /Produkt aus dem Katalog/);
  assert.deepEqual(calls, []);
});
