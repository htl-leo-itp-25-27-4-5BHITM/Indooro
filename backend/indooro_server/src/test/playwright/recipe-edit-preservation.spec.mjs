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
  await page.route("**/api/admin/recipes/recipe-1", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: recipeDetail });
    updated = route.request().postDataJSON();
    return route.fulfill({ json: { ...recipeDetail, ...updated } });
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
  await expect(drawer.locator(".recipe-builder input, .recipe-builder textarea")).toHaveCount(0);

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
