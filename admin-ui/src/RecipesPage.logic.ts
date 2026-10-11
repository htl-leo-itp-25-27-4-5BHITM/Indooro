import type { ApiClient } from "./api/client";

const PAGE_SIZE = 20;

export interface RecipeTag { id: string; code: string; name: string; status?: string }
export interface RecipeIngredient {
  id?: string;
  position: number;
  displayName: string;
  canonicalName?: string | null;
  quantity?: number | null;
  quantityText?: string | null;
  unitCode?: string | null;
  unitDisplayName?: string | null;
  preparationNote?: string | null;
  optional?: boolean;
  product?: Product | null;
  selectedProduct?: Product | null;
}
export interface RecipeStep { id?: string; position: number; instruction: string; durationMinutes?: number | null }
export interface RecipeSummary {
  id: string; slug: string; title: string; summary?: string | null; imageUrl?: string | null;
  servings: number; prepTimeMinutes?: number | null; cookTimeMinutes?: number | null; totalTimeMinutes?: number | null;
  stepCount: number; status: string; mappedIngredientCount: number; totalIngredientCount: number; tags: RecipeTag[];
}
export interface RecipeDetail extends RecipeSummary {
  description?: string | null; imageAlt?: string | null; publishedAt?: string | null; archivedAt?: string | null;
  ingredients: RecipeIngredient[]; steps: RecipeStep[];
}
export interface Product { id: number; name: string; price?: number | null; layoutCode?: string | null; storeId?: string | null; storeCode?: string | null }
export interface RecipePageResponse { content: RecipeSummary[]; page: number; size: number; totalElements: number }
export interface RecipeFilters { q: string; status: string; tag: string; page: number }

export function readRecipeFilters(search: string): RecipeFilters {
  const params = new URLSearchParams(search);
  const page = Number(params.get("page"));
  const status = params.get("status") ?? "";
  return {
    q: (params.get("q") ?? "").slice(0, 120),
    status: ["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status) ? status : "",
    tag: params.get("tag") ?? "",
    page: Number.isInteger(page) && page > 0 ? page : 0
  };
}

export function recipeListPath(filters: RecipeFilters): string {
  const params = new URLSearchParams({ page: String(filters.page), size: String(PAGE_SIZE) });
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.tag) params.set("tag", filters.tag);
  return `/api/admin/recipes?${params.toString()}`;
}

export function recipeFiltersQuery(filters: RecipeFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.page) params.set("page", String(filters.page));
  return params.toString();
}

function ingredientBody(item: RecipeIngredient, position: number) {
  return {
    position,
    displayName: item.displayName,
    canonicalName: item.canonicalName ?? null,
    quantity: item.quantity ?? null,
    quantityText: item.quantityText?.trim() || null,
    unitCode: item.unitCode ?? null,
    preparationNote: item.preparationNote ?? null,
    optional: Boolean(item.optional)
  };
}

function stepBody(item: RecipeStep, position: number) {
  return { position, instruction: item.instruction.trim(), durationMinutes: item.durationMinutes ?? null };
}

function recipeBody(values: RecipeDetail, tagIds: string[]) {
  return {
    slug: values.slug,
    title: values.title,
    summary: values.summary || null,
    description: values.description || null,
    imageUrl: values.imageUrl || null,
    imageAlt: values.imageAlt || null,
    servings: Number(values.servings),
    prepTimeMinutes: values.prepTimeMinutes == null || Number.isNaN(Number(values.prepTimeMinutes)) ? null : Number(values.prepTimeMinutes),
    cookTimeMinutes: values.cookTimeMinutes == null || Number.isNaN(Number(values.cookTimeMinutes)) ? null : Number(values.cookTimeMinutes),
    totalTimeMinutes: values.totalTimeMinutes == null || Number.isNaN(Number(values.totalTimeMinutes)) ? null : Number(values.totalTimeMinutes),
    status: values.status,
    tagIds
  };
}

/** Persist a recipe edit while avoiding unique-position conflicts during reorder. */
export async function saveRecipeChanges(api: ApiClient, original: RecipeDetail, draft: RecipeDetail, tagIds: string[], onMetadataSaved?: () => void): Promise<RecipeDetail> {
  const root = `/api/admin/recipes/${encodeURIComponent(original.id)}`;
  if (draft.ingredients.some((item) => !item.id && !item.selectedProduct?.id)) throw new Error("Neue Zutaten benötigen ein Produkt aus dem Katalog.");
  await api.put(root, recipeBody(draft, tagIds));
  onMetadataSaved?.();

  const keptIngredients = draft.ingredients.filter((item) => item.id);
  const keptSteps = draft.steps.filter((item) => item.id);
  const oldIngredients = new Map(original.ingredients.map((item) => [String(item.id), item]));
  const oldSteps = new Map(original.steps.map((item) => [String(item.id), item]));
  const ingredientStructureChanged = draft.ingredients.length !== oldIngredients.size || draft.ingredients.some((item, index) => String(item.id ?? "new") !== String(original.ingredients[index]?.id ?? "new") || item.position !== index + 1);
  const stepStructureChanged = draft.steps.length !== oldSteps.size || draft.steps.some((item, index) => String(item.id ?? "new") !== String(original.steps[index]?.id ?? "new") || item.position !== index + 1);
  const tempIngredient = Math.max(0, ...original.ingredients.map((item) => item.position)) + draft.ingredients.length + 1000;
  const tempStep = Math.max(0, ...original.steps.map((item) => item.position)) + draft.steps.length + 1000;

  if (ingredientStructureChanged) {
    for (let index = 0; index < keptIngredients.length; index++) await api.put(`${root}/ingredients/${encodeURIComponent(keptIngredients[index].id!)}`, ingredientBody(keptIngredients[index], tempIngredient + index));
  }
  if (stepStructureChanged) {
    for (let index = 0; index < keptSteps.length; index++) await api.put(`${root}/steps/${encodeURIComponent(keptSteps[index].id!)}`, stepBody(keptSteps[index], tempStep + index));
  }

  const ingredientIds = new Set(keptIngredients.map((item) => String(item.id)));
  const stepIds = new Set(keptSteps.map((item) => String(item.id)));
  for (const item of original.ingredients) if (!ingredientIds.has(String(item.id))) await api.delete(`${root}/ingredients/${encodeURIComponent(item.id!)}`);
  for (const item of original.steps) if (!stepIds.has(String(item.id))) await api.delete(`${root}/steps/${encodeURIComponent(item.id!)}`);

  for (let index = 0; index < draft.ingredients.length; index++) {
    const item = draft.ingredients[index];
    if (item.id) {
      const old = oldIngredients.get(String(item.id))!;
      const body = ingredientBody(item, index + 1);
      if (ingredientStructureChanged || JSON.stringify(body) !== JSON.stringify(ingredientBody(old, old.position))) await api.put(`${root}/ingredients/${encodeURIComponent(item.id)}`, body);
    } else {
      const product = item.selectedProduct;
      if (!product?.id) throw new Error("Neue Zutaten benötigen ein Produkt aus dem Katalog.");
      const created = await api.post<{ id: string }>(`${root}/ingredients`, ingredientBody({ ...item, displayName: product.name, canonicalName: product.name, optional: false }, index + 1));
      await api.put(`${root}/ingredients/${encodeURIComponent(created.id)}/product-mapping`, {
        productId: Number(product.id), storeId: product.storeId ?? null, storeCode: product.storeCode ?? null,
        mappingType: "MANUAL", confidence: 1, manuallyConfirmed: true
      });
    }
  }
  for (let index = 0; index < draft.steps.length; index++) {
    const item = draft.steps[index];
    if (item.id) {
      const old = oldSteps.get(String(item.id))!;
      const body = stepBody(item, index + 1);
      if (stepStructureChanged || JSON.stringify(body) !== JSON.stringify(stepBody(old, old.position))) await api.put(`${root}/steps/${encodeURIComponent(item.id)}`, body);
    } else await api.post(`${root}/steps`, stepBody(item, index + 1));
  }
  return api.get<RecipeDetail>(root);
}

export function cloneDetail(detail: RecipeDetail): RecipeDetail {
  return { ...detail, tags: [...(detail.tags ?? [])], ingredients: (detail.ingredients ?? []).map((item, index) => ({ ...item, position: item.position || index + 1 })), steps: (detail.steps ?? []).map((item, index) => ({ ...item, position: item.position || index + 1 })) };
}

export function numeric(value: number | null | undefined): string { return value == null ? "" : String(value); }


export function validateDraft(draft: RecipeDetail): string | null {
  if (!draft.slug.trim() || !draft.title.trim()) return "Slug und Titel sind erforderlich.";
  if (draft.servings < 1) return "Portionen müssen mindestens 1 sein.";
  if (draft.ingredients.some((item) => !item.id && !item.selectedProduct?.id)) return "Neue Zutaten müssen einem Produkt aus dem Katalog zugeordnet werden.";
  if (draft.ingredients.some((item) => !item.id && !item.selectedProduct?.name)) return "Bitte das Produkt für jede neue Zutat auswählen.";
  if (draft.steps.some((item) => !item.instruction.trim())) return "Jeder Schritt benötigt eine Beschreibung.";
  return null;
}
