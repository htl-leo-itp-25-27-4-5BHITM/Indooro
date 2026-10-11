import { expect, test } from "@playwright/test";

const recipeDetail = {
  id: "recipe-1",
  slug: "apfel-hafer-crumble",
  title: "Apfel-Hafer-Crumble",
  summary: "Warm servieren",
  description: "Das Originalrezept mit Apfel und Hafer.",
  imageUrl: "https://example.com/crumble.jpg",
  imageAlt: "Crumble in einer Auflaufform",
  servings: 4,
  prepTimeMinutes: 12,
  cookTimeMinutes: 25,
  totalTimeMinutes: 37,
  status: "DRAFT",
  tags: [
    { id: "00000000-0000-0000-0000-000000000001", code: "VEGETARIAN", name: "Vegetarisch" },
    { id: "00000000-0000-0000-0000-000000000002", code: "QUICK", name: "Schnell" }
  ],
  ingredients: [{ id: "ingredient-1", position: 1, displayName: "Aepfel", quantityText: "2 Stk" }],
  steps: [{ id: "step-1", position: 1, instruction: "Aepfel schneiden." }]
};

test("recipe title edit sends full metadata and keeps tags and item rows", async ({ page }) => {
  let updated;
  await page.route("**/api/admin/recipes/recipe-1**", (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === "/api/admin/recipes/recipe-1" && method === "GET") return route.fulfill({ json: { ...recipeDetail, ...updated } });
    if (url.pathname === "/api/admin/recipes/recipe-1" && method === "PUT") {
      updated = route.request().postDataJSON();
      return route.fulfill({ json: { ...recipeDetail, ...updated } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/admin/recipes/");
  await page.getByRole("button", { name: "Bearbeiten" }).click();
  const drawer = page.locator(".drawer");
  await expect(drawer.getByRole("heading", { name: "Rezept bearbeiten" })).toBeVisible();
  await expect(drawer.locator("#description")).toHaveValue(recipeDetail.description);
  await expect(drawer.locator("#imageUrl")).toHaveValue(recipeDetail.imageUrl);
  await expect(drawer.locator("#imageAlt")).toHaveValue(recipeDetail.imageAlt);
  await expect(drawer).toContainText("Vegetarisch");
  await expect(drawer).toContainText("Schnell");
  await expect(drawer).toContainText("Aepfel");
  await expect(drawer).toContainText("Aepfel schneiden.");
  await expect(drawer.locator(".recipe-builder input, .recipe-builder textarea")).toHaveCount(2);
  await expect(drawer.getByRole("button", { name: "Entfernen" })).toHaveCount(2);

  await drawer.locator("#title").fill("Apfel-Hafer-Crumble neu");
  await drawer.getByRole("button", { name: "Speichern" }).click();
  await expect.poll(() => updated?.title).toBe("Apfel-Hafer-Crumble neu");
  expect(updated).toMatchObject({
    slug: recipeDetail.slug,
    summary: recipeDetail.summary,
    description: recipeDetail.description,
    imageUrl: recipeDetail.imageUrl,
    imageAlt: recipeDetail.imageAlt,
    servings: recipeDetail.servings,
    prepTimeMinutes: recipeDetail.prepTimeMinutes,
    cookTimeMinutes: recipeDetail.cookTimeMinutes,
    totalTimeMinutes: recipeDetail.totalTimeMinutes,
    status: recipeDetail.status,
    tagIds: recipeDetail.tags.map((tag) => tag.id)
  });
  await expect(drawer).toHaveCount(0);
});

test("failed recipe update keeps the full edit drawer open with an error", async ({ page }) => {
  await page.route("**/api/admin/recipes/recipe-1", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: recipeDetail });
    return route.fulfill({ status: 409, json: { error: "Bearbeitungskonflikt" } });
  });
  await page.goto("/admin/recipes/");
  await page.getByRole("button", { name: "Bearbeiten" }).click();
  const drawer = page.locator(".drawer");
  await drawer.locator("#title").fill("Nicht gespeichert");
  await drawer.getByRole("button", { name: "Speichern" }).click();
  await expect(drawer).toContainText("Bearbeitungskonflikt");
  await expect(drawer.locator("#title")).toHaveValue("Nicht gespeichert");
  await expect(drawer.getByRole("button", { name: "Speichern" })).toBeEnabled();
});

test("failed recipe detail load leaves the edit drawer closed", async ({ page }) => {
  await page.route("**/api/admin/recipes/recipe-1", (route) => route.fulfill({ status: 503, json: { error: "Detail nicht verfuegbar" } }));
  await page.goto("/admin/recipes/");
  await page.getByRole("button", { name: "Bearbeiten" }).click();
  await expect(page.locator("#toasts")).toContainText("Detail nicht verfuegbar");
  await expect(page.locator(".drawer")).toHaveCount(0);
});

test("failed ingredient write reloads the latest server detail for recovery", async ({ page }) => {
  const state = structuredClone(recipeDetail);
  await page.route("**/api/admin/recipes/recipe-1**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/recipes/recipe-1" && route.request().method() === "GET") return route.fulfill({ json: state });
    if (url.pathname === "/api/admin/recipes/recipe-1" && route.request().method() === "PUT") return route.fulfill({ json: state });
    if (url.pathname.endsWith("/ingredients/ingredient-1")) return route.fulfill({ status: 409, json: { error: "Position konflikt" } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/admin/recipes/");
  await page.getByRole("button", { name: "Bearbeiten" }).click();
  const drawer = page.locator(".drawer");
  await drawer.locator("[data-ingredient-quantity='0']").fill("3 Stk");
  await drawer.locator("[data-step-instruction='0']").fill("Aepfel fein schneiden.");
  await drawer.getByRole("button", { name: "Speichern" }).click();
  await expect(drawer).toContainText("Aktueller Serverstand wurde geladen: Position konflikt");
  await expect(drawer.locator("[data-ingredient-quantity='0']")).toHaveValue("2 Stk");
  await expect(drawer.locator("[data-step-instruction='0']")).toHaveValue("Aepfel schneiden.");
});

test("recipe edit diffs ingredients and steps while preserving untouched ingredient fields", async ({ page }) => {
  const state = structuredClone({ ...recipeDetail, ingredients: [
    { id: "ingredient-1", position: 1, displayName: "Aepfel", canonicalName: "Apfel", quantity: 2, quantityText: "2 Stk", unitCode: "PCS", preparationNote: "entkernt", optional: true },
    { id: "ingredient-2", position: 2, displayName: "Hafer", canonicalName: "Hafer", quantityText: "100 g", optional: false }
  ], steps: [
    { id: "step-1", position: 1, instruction: "Aepfel schneiden.", durationMinutes: 2 },
    { id: "step-2", position: 2, instruction: "Hafer dazugeben.", durationMinutes: 1 }
  ] });
  const requests = [];
  await page.route("**/api/admin/products**", (route) => route.fulfill({ json: [{ id: "product-1", name: "Birne" }] }));
  await page.route("**/api/admin/recipes/recipe-1**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split("/").filter(Boolean);
    const method = request.method();
    if (parts.length === 4 && method === "GET") return route.fulfill({ json: state });
    if (parts.length === 4 && method === "PUT") return route.fulfill({ json: state });
    if (parts[6] === "product-mapping" && method === "PUT") return route.fulfill({ json: {} });
    if (parts[4] === "ingredients" || parts[4] === "steps") {
      const type = parts[4];
      const rows = state[type];
      requests.push({ method, path: url.pathname, body: method !== "DELETE" ? request.postDataJSON() : null });
      if (method === "DELETE") {
        state[type] = rows.filter((row) => row.id !== parts[5]);
        return route.fulfill({ status: 204, body: "" });
      }
      const body = request.postDataJSON();
      if (method === "POST") {
        const created = { ...body, id: `${type}-${rows.length + 1}` };
        rows.push(created);
        return route.fulfill({ json: created });
      }
      const row = rows.find((item) => item.id === parts[5]);
      Object.assign(row, body);
      return route.fulfill({ json: row });
    }
    return route.fulfill({ status: 404, json: { error: url.pathname } });
  });
  await page.goto("/admin/recipes/");
  await page.getByRole("button", { name: "Bearbeiten" }).click();
  const drawer = page.locator(".drawer");
  await expect(drawer.locator("[data-ingredient-quantity]")).toHaveCount(2);
  await drawer.locator("[data-ingredient-quantity='0']").fill("3 Stk");
  await drawer.getByRole("button", { name: "Entfernen" }).nth(1).click();
  await drawer.locator("[data-step-instruction='0']").fill("Aepfel fein schneiden.");
  await drawer.getByRole("button", { name: "Entfernen" }).last().click();
  await drawer.getByRole("button", { name: "+ Zutat" }).click();
  const newIngredient = drawer.locator("[data-ingredient-product-search]");
  await newIngredient.last().fill("Birne");
  await drawer.locator("[data-recipe-select-product]").getByText("Birne").click();
  await drawer.getByRole("button", { name: "+ Schritt" }).click();
  await drawer.locator("[data-step-instruction='1']").fill("Birne dazugeben.");
  await drawer.getByRole("button", { name: "Speichern" }).click();
  await expect(drawer).toHaveCount(0);

  await expect.poll(() => state.steps.length).toBe(2);
  await expect.poll(() => state.ingredients.length).toBe(2);
  expect(state.ingredients.find((row) => row.id === "ingredient-1"), JSON.stringify(requests)).toMatchObject({ position: 1, displayName: "Aepfel", canonicalName: "Apfel", quantity: 2, quantityText: "3 Stk", unitCode: "PCS", preparationNote: "entkernt", optional: true });
  expect(state.ingredients.some((row) => row.displayName === "Birne" && row.position === 2)).toBe(true);
  expect(state.steps.map((row) => [row.position, row.instruction])).toEqual([[1, "Aepfel fein schneiden."], [2, "Birne dazugeben."]]);
  expect(requests.some((request) => request.method === "DELETE" && request.path.endsWith("ingredient-2"))).toBe(true);
  expect(requests.some((request) => request.method === "DELETE" && request.path.endsWith("step-2"))).toBe(true);
  await expect(drawer).toHaveCount(0);
});
