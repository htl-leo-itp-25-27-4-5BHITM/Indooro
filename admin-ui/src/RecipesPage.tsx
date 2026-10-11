import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { ApiClient } from "./api/client";
import { cloneDetail, numeric, readRecipeFilters, recipeFiltersQuery, recipeListPath, saveRecipeChanges, type Product, type RecipeDetail, type RecipeIngredient, type RecipePageResponse, type RecipeStep, type RecipeTag, validateDraft } from "./RecipesPage.logic";
import "./RecipesPage.css";

export function RecipesPage({ api }: { api: ApiClient }) {
  const filters = useMemo(() => readRecipeFilters(window.location.search), []);
  const [page, setPage] = useState<RecipePageResponse | null>(null);
  const [tags, setTags] = useState<RecipeTag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<RecipeDetail | null>(null);
  const [original, setOriginal] = useState<RecipeDetail | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [productError, setProductError] = useState<string | null>(null);
  const [search, setSearch] = useState(filters.q);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api.get<RecipePageResponse>(recipeListPath(filters), { signal: controller.signal }),
      api.get<RecipeTag[]>('/api/admin/recipe-tags?status=ACTIVE', { signal: controller.signal })
    ]).then(([result, tagList]) => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(result?.content) || !Number.isFinite(result.totalElements) || !Array.isArray(tagList)) throw new Error("Rezeptdaten sind unvollständig.");
      setPage(result); setTags(tagList); setError(null);
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Rezepte konnten nicht geladen werden."); });
    return () => controller.abort();
  }, [api, revision]);

  const loadDetail = useCallback(async (id: string) => {
    setEditorError(null); setBusy(true);
    try {
      const detail = await api.get<RecipeDetail>(`/api/admin/recipes/${encodeURIComponent(id)}`);
      if (!detail?.id || !Array.isArray(detail.ingredients) || !Array.isArray(detail.steps) || !Array.isArray(detail.tags)) throw new Error("Rezeptdetails sind unvollständig.");
      const normalized = cloneDetail(detail);
      setOriginal(normalized); setEditor(cloneDetail(normalized)); setSelectedTagIds(normalized.tags.map((tag) => tag.id));
    } catch (cause) { setEditorError(cause instanceof Error ? cause.message : "Rezeptdetails konnten nicht geladen werden."); }
    finally { setBusy(false); }
  }, [api]);

  const patchEditor = (patch: Partial<RecipeDetail>) => setEditor((value) => value ? { ...value, ...patch } : value);
  const patchIngredient = (index: number, patch: Partial<RecipeIngredient>) => patchEditor({ ingredients: editor!.ingredients.map((item, i) => i === index ? { ...item, ...patch } : item) });
  const patchStep = (index: number, patch: Partial<RecipeStep>) => patchEditor({ steps: editor!.steps.map((item, i) => i === index ? { ...item, ...patch } : item) });
  const searchProducts = async () => {
    const params = new URLSearchParams({ page: "0", size: "20" }); if (productQuery.trim()) params.set("q", productQuery.trim());
    setProductError(null);
    try { const result = await api.get<{ content?: Product[] } | Product[]>(`/api/admin/products?${params}`); const list = Array.isArray(result) ? result : result.content; if (!Array.isArray(list)) throw new Error("Produktantwort ist unvollständig."); setProducts(list); }
    catch (cause) { setProductError(cause instanceof Error ? cause.message : "Produkte konnten nicht geladen werden."); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!editor || !original || busy) return;
    const localError = validateDraft(editor);
    if (localError) { setEditorError(localError); return; }
    setBusy(true); setEditorError(null);
    let metadataSaved = false;
    try { const saved = await saveRecipeChanges(api, original, editor, selectedTagIds, () => { metadataSaved = true; }); const normalized = cloneDetail(saved); setOriginal(normalized); setEditor(null); setOriginal(null); setRevision((value) => value + 1); }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : "Rezept konnte nicht gespeichert werden.";
      if (!metadataSaved) { setEditorError(message); return; }
      try {
        const latest = await api.get<RecipeDetail>(`/api/admin/recipes/${encodeURIComponent(original.id)}`);
        const normalized = cloneDetail(latest); setOriginal(normalized); setEditor(normalized); setSelectedTagIds(normalized.tags.map((tag) => tag.id));
        setEditorError(`Speichern teilweise fehlgeschlagen. Aktueller Serverstand wurde geladen: ${message}`);
      } catch { setEditorError(`Speichern fehlgeschlagen; aktueller Serverstand konnte nicht neu geladen werden: ${message}`); }
    } finally { setBusy(false); }
  };

  const totalPages = page ? Math.ceil(page.totalElements / Math.max(1, page.size)) : 0;
  const pageUrl = (next: number) => `/admin/next/recipes/${recipeFiltersQuery({ ...filters, page: next }) ? `?${recipeFiltersQuery({ ...filters, page: next })}` : ""}`;
  return <div className="recipes-page">
    <div className="page-intro"><div><p className="eyebrow">Inhalte</p><h2>Rezepte</h2><p>Rezeptdaten, Zutaten, Schritte und Mapping-Readiness.</p></div></div>
    <form className="notice recipe-filters" action="/admin/next/recipes/" method="get" role="search">
      <label>Suche<input type="search" name="q" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Titel oder Slug" /></label>
      <label>Status<select name="status" defaultValue={filters.status}><option value="">Alle</option><option value="DRAFT">Entwurf</option><option value="PUBLISHED">Veröffentlicht</option><option value="ARCHIVED">Archiviert</option></select></label>
      <label>Tag<select name="tag" defaultValue={filters.tag}><option value="">Alle Tags</option>{tags.map((tag) => <option key={tag.id} value={tag.code}>{tag.name}</option>)}</select></label>
      <button className="button primary" type="submit">Anwenden</button>
    </form>
    {error && <div className="notice error-state" role="alert"><h3>Rezepte konnten nicht geladen werden</h3><p>{error}</p><button className="button" onClick={() => setRevision((value) => value + 1)}>Erneut versuchen</button></div>}
    {editorError && !editor && <div className="notice error-state" role="alert">{editorError}</div>}
    {!page && !error && <p className="notice" role="status">Rezepte werden geladen …</p>}
    {page && !error && <section className="notice recipe-results" aria-label="Rezept-Ergebnisse">
      <div className="section-heading"><h3>{page.totalElements.toLocaleString("de-AT")} Rezepte</h3><span>Seite {page.page + 1} von {Math.max(totalPages, 1)}</span></div>
      {page.content.length === 0 ? <p>Keine Rezepte passen zu den Filtern.</p> : <div className="table-scroll"><table><thead><tr><th>Rezept</th><th>Status</th><th>Readiness</th><th>Tags</th><th>Aktion</th></tr></thead><tbody>{page.content.map((recipe) => <tr key={recipe.id}>
        <td><strong>{recipe.title}</strong><small>{recipe.slug}</small></td><td><span className={`status-pill ${recipe.status === "PUBLISHED" ? "ready" : "missing"}`}>{recipe.status}</span></td>
        <td>{recipe.mappedIngredientCount}/{recipe.totalIngredientCount} Zutaten{recipe.stepCount === 0 && <small className="recipe-warning">Keine Schritte</small>}</td><td>{recipe.tags?.map((tag) => tag.name).join(", ") || "–"}</td>
        <td><button className="button small-button" onClick={() => void loadDetail(recipe.id)}>Bearbeiten</button></td>
      </tr>)}</tbody></table></div>}
      <div className="pager"><span>{page.totalElements ? `${page.page * page.size + 1}–${Math.min((page.page + 1) * page.size, page.totalElements)} von ${page.totalElements}` : "0 Ergebnisse"}</span><div>{page.page > 0 && <a className="button" href={pageUrl(page.page - 1)}>Zurück</a>}{page.page + 1 < totalPages && <a className="button" href={pageUrl(page.page + 1)}>Weiter</a>}</div></div>
    </section>}
    {editor && original && <div className="recipe-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) { setEditor(null); setOriginal(null); } }}>
      <section className="recipe-drawer" role="dialog" aria-modal="true" aria-labelledby="recipe-editor-title">
        <div className="recipe-drawer-head"><div><p className="eyebrow">Rezept bearbeiten</p><h2 id="recipe-editor-title">{editor.title}</h2></div><button className="button" type="button" disabled={busy} onClick={() => { setEditor(null); setOriginal(null); }}>Schließen</button></div>
        {editorError && <div className="notice error-state" role="alert">{editorError}</div>}
        <form className="recipe-edit-form" onSubmit={(event) => void save(event)}>
          <fieldset disabled={busy}>
            <div className="recipe-form-grid">
              <label>Slug<input required maxLength={140} value={editor.slug} onChange={(event) => patchEditor({ slug: event.target.value })} /></label>
              <label>Titel<input required maxLength={180} value={editor.title} onChange={(event) => patchEditor({ title: event.target.value })} /></label>
              <label>Portionen<input required type="number" min="1" value={numeric(editor.servings)} onChange={(event) => patchEditor({ servings: Number(event.target.value) })} /></label>
              <label>Vorbereitung min<input type="number" min="0" value={numeric(editor.prepTimeMinutes)} onChange={(event) => patchEditor({ prepTimeMinutes: event.target.value === "" ? null : Number(event.target.value) })} /></label>
              <label>Kochen min<input type="number" min="0" value={numeric(editor.cookTimeMinutes)} onChange={(event) => patchEditor({ cookTimeMinutes: event.target.value === "" ? null : Number(event.target.value) })} /></label>
              <label>Gesamt min<input type="number" min="0" value={numeric(editor.totalTimeMinutes)} onChange={(event) => patchEditor({ totalTimeMinutes: event.target.value === "" ? null : Number(event.target.value) })} /></label>
              <label className="recipe-span-2">Summary<textarea maxLength={4000} value={editor.summary ?? ""} onChange={(event) => patchEditor({ summary: event.target.value })} /></label>
              <label className="recipe-span-2">Beschreibung<textarea maxLength={12000} value={editor.description ?? ""} onChange={(event) => patchEditor({ description: event.target.value })} /></label>
              <label>Bild-URL<input value={editor.imageUrl ?? ""} onChange={(event) => patchEditor({ imageUrl: event.target.value })} /></label>
              <label>Bildbeschreibung<input maxLength={240} value={editor.imageAlt ?? ""} onChange={(event) => patchEditor({ imageAlt: event.target.value })} /></label>
              <label className="recipe-span-2">Tags<select multiple value={selectedTagIds} onChange={(event) => setSelectedTagIds(Array.from(event.target.selectedOptions, (option) => option.value))}>{[...new Map([...tags, ...editor.tags].map((tag) => [tag.id, tag])).values()].map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select><small>Mit Strg/Cmd mehrere Tags auswählen.</small></label>
            </div>
            <div className="recipe-section"><div className="section-heading"><h3>Zutaten</h3><button type="button" className="button" onClick={() => { patchEditor({ ingredients: [...editor.ingredients, { position: editor.ingredients.length + 1, displayName: "", quantityText: "", selectedProduct: null }] }); setProducts([]); setProductQuery(""); }}>+ Zutat</button></div>
              {editor.ingredients.map((item, index) => <div className="recipe-item" key={item.id ?? `new-${index}`}><label>Zutat<input value={item.displayName} readOnly={!item.id} onChange={(event) => patchIngredient(index, { displayName: event.target.value })} /></label>
                <label>Menge<input value={item.quantityText ?? ""} onChange={(event) => patchIngredient(index, { quantityText: event.target.value })} /></label>
                {!item.id && <div className="recipe-product-search"><label>Produkt aus Katalog<input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Produktname suchen" /></label><button type="button" className="button" onClick={() => void searchProducts()}>Suchen</button>{productError && <small role="alert">{productError}</small>}{products.length > 0 && <select value={item.selectedProduct?.id ?? ""} onChange={(event) => { const product = products.find((candidate) => String(candidate.id) === event.target.value) ?? null; patchIngredient(index, { selectedProduct: product }); }}><option value="">Produkt auswählen</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · #{product.id}</option>)}</select>}{item.selectedProduct && <small>Ausgewählt: {item.selectedProduct.name}</small>}</div>}
                <button type="button" className="button danger-button" onClick={() => patchEditor({ ingredients: editor.ingredients.filter((_, i) => i !== index) })}>Entfernen</button>
              </div>)}
            </div>
            <div className="recipe-section"><div className="section-heading"><h3>Schritte</h3><button type="button" className="button" onClick={() => patchEditor({ steps: [...editor.steps, { position: editor.steps.length + 1, instruction: "" }] })}>+ Schritt</button></div>
              {editor.steps.map((item, index) => <div className="recipe-item" key={item.id ?? `new-step-${index}`}><label>Schritt {index + 1}<textarea required maxLength={12000} value={item.instruction} onChange={(event) => patchStep(index, { instruction: event.target.value })} /></label><label>Dauer min<input type="number" min="0" value={numeric(item.durationMinutes)} onChange={(event) => patchStep(index, { durationMinutes: event.target.value === "" ? null : Number(event.target.value) })} /></label><button type="button" className="button danger-button" onClick={() => patchEditor({ steps: editor.steps.filter((_, i) => i !== index) })}>Entfernen</button></div>)}
            </div>
          </fieldset>
          <div className="recipe-form-actions"><button className="button" type="button" disabled={busy} onClick={() => { setEditor(null); setOriginal(null); }}>Abbrechen</button><button className="button primary" type="submit" disabled={busy}>{busy ? "Speichert …" : "Speichern"}</button></div>
        </form>
      </section>
    </div>}
  </div>;
}

