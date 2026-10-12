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
