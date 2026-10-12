import { expect, test } from "@playwright/test";

test("candidate recipe edit reads full detail and preserves image, tags, ingredients and steps", async ({ page }) => {
  const tag = { id: "tag-1", code: "VEGAN", name: "Vegan" };
  const detail = { id: "recipe-1", slug: "apfel-hafer", title: "Apfel-Hafer-Crumble", summary: "Kurz", description: "Bestehende Beschreibung", imageUrl: "/images/crumble.jpg", imageAlt: "Crumble", servings: 4, prepTimeMinutes: 10, cookTimeMinutes: 20, totalTimeMinutes: 30, status: "DRAFT", mappedIngredientCount: 1, totalIngredientCount: 1, stepCount: 1, tags: [tag], ingredients: [{ id: "ingredient-1", position: 1, displayName: "Apfel", quantityText: "2 Stück", canonicalName: "Apfel", optional: false }], steps: [{ id: "step-1", position: 1, instruction: "Backen", durationMinutes: 20 }] };
  let saved: Record<string, unknown> | null = null;
  let itemWrites = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/admin/recipe-tags?*", (route) => route.fulfill({ json: [tag] }));
  await page.route("**/api/admin/recipes?*", (route) => route.fulfill({ json: { content: [detail], page: 0, size: 20, totalElements: 1 } }));
  await page.route("**/api/admin/recipes/recipe-1", (route) => {
    if (route.request().method() === "PUT") { saved = route.request().postDataJSON(); Object.assign(detail, { title: saved?.title }); }
    return route.fulfill({ json: detail });
  });
  await page.route("**/api/admin/recipes/recipe-1/ingredients/**", (route) => { itemWrites += 1; return route.fulfill({ json: {} }); });
  await page.route("**/api/admin/recipes/recipe-1/steps/**", (route) => { itemWrites += 1; return route.fulfill({ json: {} }); });
  await page.goto("/admin/next/recipes/");
  await page.getByRole("button", { name: "Vorschau" }).click();
  const preview = page.getByRole("dialog");
  await expect(preview.getByText("Rezept-Vorschau")).toBeVisible();
  await expect(preview.getByRole("textbox", { name: "Bild-URL" })).toBeDisabled();
  await expect(preview.getByRole("button", { name: "Speichern" })).toHaveCount(0);
  await preview.getByRole("button", { name: "Schließen" }).click();
  await page.getByRole("button", { name: "Bearbeiten" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Bild-URL" })).toHaveValue("/images/crumble.jpg");
  await page.getByRole("textbox", { name: "Titel" }).fill("Apfel-Hafer-Crumble Neu");
  await page.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
  await expect.poll(() => saved?.title).toBe("Apfel-Hafer-Crumble Neu");
  expect(saved?.imageUrl).toBe("/images/crumble.jpg");
  expect(saved?.tagIds).toEqual(["tag-1"]);
  expect(itemWrites).toBe(0);
});

test("store manager cannot fetch candidate recipe data", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "store-1", username: "manager", role: "store-manager", scope: { storeId: "store-1" } } }));
  await page.route("**/api/admin/recipes?*", (route) => { calls += 1; return route.fulfill({ json: { content: [], page: 0, size: 20, totalElements: 0 } }); });
  await page.goto("/admin/next/recipes/");
  await expect(page.getByRole("alert")).toContainText("Zugriff verweigert");
  expect(calls).toBe(0);
});

test("candidate recipe list exposes empty and load-error states with keyboard retry and search", async ({ page }) => {
  let listCalls = 0;
  const listQueries: URL[] = [];
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/admin/recipe-tags?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/admin/recipes?*", (route) => {
    listCalls += 1;
    const url = new URL(route.request().url());
    listQueries.push(url);
    if (listCalls === 1) return route.fulfill({ status: 503, json: { message: "Rezeptdienst vorübergehend nicht verfügbar." } });
    return route.fulfill({ json: { content: [], page: Number(url.searchParams.get("page") ?? 0), size: 20, totalElements: 0 } });
  });

  await page.goto("/admin/next/recipes/");
  await expect(page.getByRole("alert")).toContainText("Serverfehler. Bitte später erneut versuchen.");
  await page.getByRole("button", { name: "Erneut versuchen" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Keine Rezepte passen zu den Filtern.")).toBeVisible();
  expect(listCalls).toBe(2);

  const search = page.getByRole("searchbox", { name: "Suche" });
  await search.fill("Apfel");
  await search.press("Enter");
  await expect(page).toHaveURL(/q=Apfel/);
  await expect(page.getByText("Keine Rezepte passen zu den Filtern.")).toBeVisible();
  expect(listQueries.at(-1)?.searchParams.get("q")).toBe("Apfel");
});

test("candidate recipe create and publish preserve saved content and tags", async ({ page }) => {
  const tag = { id: "tag-1", code: "VEGAN", name: "Vegan" };
  const product = { id: 23, name: "Birne", layoutCode: "310" };
  type CreatePayload = { recipe: Record<string, unknown>; ingredients: Array<Record<string, unknown>>; steps: Array<Record<string, unknown>> };
  let createBody: CreatePayload | null = null;
  let savedRecipe: Record<string, unknown> | null = null;
  let publishMethod = "";
  let mappedProductId: number | null = null;
  let confirmedMappingProductId: number | null = null;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/admin/recipe-tags?*", (route) => route.fulfill({ json: [tag] }));
  await page.route("**/api/admin/products**", (route) => route.fulfill({ json: [product] }));
  await page.route("**/api/admin/recipes?*", (route) => route.fulfill({ json: { content: savedRecipe ? [savedRecipe] : [], page: 0, size: 20, totalElements: savedRecipe ? 1 : 0 } }));
  await page.route("**/api/admin/recipes", async (route) => {
    createBody = route.request().postDataJSON() as CreatePayload;
    savedRecipe = { id: "recipe-new", slug: createBody.recipe.slug, title: createBody.recipe.title, summary: createBody.recipe.summary, imageUrl: createBody.recipe.imageUrl, imageAlt: createBody.recipe.imageAlt, servings: createBody.recipe.servings, status: "DRAFT", stepCount: 1, mappedIngredientCount: 1, totalIngredientCount: 1, tags: [tag] };
    return route.fulfill({ json: { ...savedRecipe, description: createBody.recipe.description, publishedAt: null, archivedAt: null, prepTimeMinutes: createBody.recipe.prepTimeMinutes, cookTimeMinutes: createBody.recipe.cookTimeMinutes, totalTimeMinutes: createBody.recipe.totalTimeMinutes, ingredients: [{ id: "ingredient-new", position: 1, displayName: "Birne", quantityText: "2" }], steps: [{ id: "step-new", position: 1, instruction: "Mischen", durationMinutes: null }] } });
  });
  await page.route("**/api/admin/recipes/recipe-new**", async (route) => {
    const request = route.request();
    if (request.method() === "PUT" && request.url().endsWith("/product-mapping")) {
      if (mappedProductId === null) mappedProductId = request.postDataJSON().productId;
      else confirmedMappingProductId = request.postDataJSON().productId;
      return route.fulfill({ json: {} });
    }
    if (request.method() === "PUT") {
      const body = request.postDataJSON();
      savedRecipe = { ...savedRecipe, ...body, tags: [tag] };
      return route.fulfill({ json: savedRecipe });
    }
    if (request.method() === "PATCH") {
      publishMethod = request.method();
      savedRecipe = { ...savedRecipe, status: "PUBLISHED" };
      return route.fulfill({ json: { ...savedRecipe, ingredients: [{ id: "ingredient-new", position: 1, displayName: "Birne", quantityText: "2" }], steps: [{ id: "step-new", position: 1, instruction: "Mischen" }] } });
    }
    if (request.url().endsWith("/mapping-status")) return route.fulfill({ json: { recipeId: "recipe-new", storeId: null, storeCode: null, ingredients: [{ ingredientId: "ingredient-new", ingredientName: "Birne", status: "MAPPED", product, candidates: [], confidence: 1, manuallyConfirmed: true, reason: null }] } });
    if (request.url().includes("/mapping-suggestions?")) return route.fulfill({ json: [{ id: 24, name: "Birne Bio", layoutCode: "310" }] });
    return route.fulfill({ json: { ...savedRecipe, description: createBody?.recipe.description, ingredients: [{ id: "ingredient-new", position: 1, displayName: "Birne", quantityText: "2" }], steps: [{ id: "step-new", position: 1, instruction: "Mischen" }] } });
  });
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/admin/next/recipes/");
  await page.getByRole("button", { name: "Rezept anlegen" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Slug" }).fill("birnen-mix");
  await dialog.getByRole("textbox", { name: "Titel" }).fill("Birnen Mix");
  await dialog.getByRole("textbox", { name: "Beschreibung", exact: true }).fill("Mit Joghurt servieren");
  await dialog.getByRole("textbox", { name: "Bild-URL" }).fill("/images/pear.jpg");
  await dialog.getByLabel("Tags").selectOption("tag-1");
  await dialog.getByRole("button", { name: "+ Zutat" }).click();
  await dialog.getByRole("textbox", { name: "Produkt aus Katalog" }).fill("Birne");
  await dialog.getByRole("button", { name: "Suchen" }).click();
  await expect(dialog.locator(".recipe-product-search select option[value='23']")).toHaveCount(1);
  await dialog.locator(".recipe-product-search select").selectOption("23");
  await dialog.getByRole("textbox", { name: "Menge" }).fill("2 Stück");
  await dialog.getByRole("button", { name: "+ Schritt" }).click();
  await dialog.getByRole("textbox", { name: "Schritt 1" }).fill("Mischen");
  await dialog.getByRole("button", { name: "Entwurf anlegen" }).click();
  await expect.poll(() => mappedProductId).toBe(23);
  await expect(page.getByText("Birnen Mix")).toBeVisible();
  expect(createBody?.recipe.tagIds).toEqual(["tag-1"]);
  expect(createBody?.recipe.imageUrl).toBe("/images/pear.jpg");
  expect(createBody?.ingredients).toEqual([{ position: 1, displayName: "Birne", canonicalName: "Birne", quantityText: "2 Stück", optional: false }]);
  expect(createBody?.steps).toEqual([{ position: 1, instruction: "Mischen", durationMinutes: null }]);

  await page.getByRole("button", { name: "Bearbeiten" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Mapping" }).click();
  await page.getByRole("dialog").getByRole("textbox", { name: "Produkt suchen" }).fill("Birne Bio");
  await page.getByRole("dialog").getByRole("button", { name: "Suchen" }).click();
  await page.getByRole("radio", { name: /Birne Bio/ }).check();
  await page.getByRole("dialog").getByRole("button", { name: "Mapping bestätigen" }).click();
  await expect.poll(() => confirmedMappingProductId).toBe(24);
  await page.getByRole("dialog").getByRole("button", { name: "Veröffentlichen" }).click();
  await expect.poll(() => publishMethod).toBe("PATCH");
  await expect(page.getByRole("dialog").getByText("PUBLISHED")).toBeVisible();
  expect(savedRecipe?.imageUrl).toBe("/images/pear.jpg");
  expect(savedRecipe?.tagIds).toEqual(["tag-1"]);
  expect(savedRecipe?.title).toBe("Birnen Mix");
});
