import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import type { ApiClient } from "./api/client";
import { changeRecipePublication, cloneDetail, createRecipeWithContent, numeric, readRecipeFilters, recipeFiltersQuery, recipeListPath, RecipeCreatePartialError, saveRecipeChanges, type Product, type RecipeDetail, type RecipeIngredient, type RecipeIngredientMapping, type RecipeMappingResponse, type RecipePageResponse, type RecipeStep, type RecipeTag, validateDraft, validateNewRecipe } from "./RecipesPage.logic";
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
  const [recoveryDraft, setRecoveryDraft] = useState<{ detail: RecipeDetail; tagIds: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [productError, setProductError] = useState<string | null>(null);
  const [search, setSearch] = useState(filters.q);
  const [creating, setCreating] = useState(false);
  const [mappingFor, setMappingFor] = useState<string | null>(null);
  const [mappings, setMappings] = useState<RecipeIngredientMapping[]>([]);
  const [mappingQuery, setMappingQuery] = useState("");
  const [mappingProducts, setMappingProducts] = useState<Product[]>([]);
  const [mappingSelection, setMappingSelection] = useState<Product | null>(null);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const initialFocusPending = useRef(false);

  const dialogOpen = editor !== null;
  useLayoutEffect(() => {
    if (!dialogOpen) {
      openerRef.current?.focus();
      return;
    }
    if (busy) { dialogRef.current?.focus(); return; }
    if (!initialFocusPending.current) return;
    const first = dialogRef.current?.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]");
    (first ?? dialogRef.current)?.focus();
    initialFocusPending.current = false;
  }, [dialogOpen, busy]);

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

  const loadDetail = useCallback(async (id: string, preview = false) => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    initialFocusPending.current = true;
    setEditorError(null); setRecoveryDraft(null); setBusy(true); setCreating(false); setPreviewMode(preview); setMappingFor(null);
    try {
      const detail = await api.get<RecipeDetail>(`/api/admin/recipes/${encodeURIComponent(id)}`);
      if (!detail?.id || !Array.isArray(detail.ingredients) || !Array.isArray(detail.steps) || !Array.isArray(detail.tags)) throw new Error("Rezeptdetails sind unvollständig.");
      const normalized = cloneDetail(detail);
      setOriginal(normalized); setEditor(cloneDetail(normalized)); setSelectedTagIds(normalized.tags.map((tag) => tag.id));
    } catch (cause) { setEditorError(cause instanceof Error ? cause.message : "Rezeptdetails konnten nicht geladen werden."); }
    finally { setBusy(false); }
  }, [api]);

  const startCreate = () => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    initialFocusPending.current = true;
    const blank: RecipeDetail = { id: "", slug: "", title: "", summary: "", description: "", imageUrl: "", imageAlt: "", servings: 2, prepTimeMinutes: null, cookTimeMinutes: null, totalTimeMinutes: null, status: "DRAFT", stepCount: 0, mappedIngredientCount: 0, totalIngredientCount: 0, tags: [], ingredients: [], steps: [] };
    setEditor(blank); setOriginal(blank); setSelectedTagIds([]); setEditorError(null); setRecoveryDraft(null); setCreating(true); setPreviewMode(false); setMappingFor(null);
  };

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
    event.preventDefault(); if (!editor || !original || busy || previewMode) return;
    const localError = creating ? validateNewRecipe(editor) : validateDraft(editor);
    if (localError) { setEditorError(localError); return; }
    setBusy(true); setEditorError(null); setRecoveryDraft(null);
    let metadataSaved = false;
    try {
      if (creating) await createRecipeWithContent(api, editor, selectedTagIds);
      else await saveRecipeChanges(api, original, editor, selectedTagIds, () => { metadataSaved = true; });
      setEditor(null); setOriginal(null); setCreating(false); setRevision((value) => value + 1);
    }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : "Rezept konnte nicht gespeichert werden.";
      if (creating) {
        if (cause instanceof RecipeCreatePartialError) {
          const persisted = cloneDetail(cause.created);
          setEditor(persisted); setOriginal(persisted); setSelectedTagIds(persisted.tags.map((tag) => tag.id)); setCreating(false); setRevision((value) => value + 1);
          setEditorError(`${message} Der gespeicherte Entwurf bleibt geöffnet; fehlende Zuordnungen können über „Mapping“ ergänzt werden.`);
        } else setEditorError(message);
        return;
      }
      if (!metadataSaved) { setEditorError(message); return; }
      setRevision((value) => value + 1);
      const attempted = { detail: cloneDetail(editor), tagIds: [...selectedTagIds] };
      try {
        const latest = await api.get<RecipeDetail>(`/api/admin/recipes/${encodeURIComponent(original.id)}`);
        const normalized = cloneDetail(latest); setOriginal(normalized); setEditor(normalized); setSelectedTagIds(normalized.tags.map((tag) => tag.id)); setRecoveryDraft(attempted);
        setEditorError(`Speichern teilweise fehlgeschlagen. Aktueller Serverstand wurde geladen; Ihre Eingaben sind zur Wiederherstellung erhalten: ${message}`);
      } catch { setRecoveryDraft(attempted); setEditorError(`Speichern fehlgeschlagen; aktueller Serverstand konnte nicht neu geladen werden. Ihre Eingaben bleiben erhalten: ${message}`); }
    } finally { setBusy(false); }
  };

  const updatePublication = async (action: "publish" | "deactivate" | "archive") => {
    if (!editor || !original || creating || busy || previewMode) return;
    const labels = { publish: "veröffentlichen", deactivate: "deaktivieren", archive: "archivieren" };
    if (!window.confirm(`Rezept „${editor.title}“ ${labels[action]}?`)) return;
    setBusy(true); setEditorError(null);
    let metadataSaved = false;
    let contentSaved = false;
    try {
      const saved = await saveRecipeChanges(api, original, editor, selectedTagIds, () => { metadataSaved = true; });
      contentSaved = true;
      const updated = cloneDetail(await changeRecipePublication(api, saved.id, action));
      setOriginal(updated); setEditor(updated); setSelectedTagIds(updated.tags.map((tag) => tag.id)); setRecoveryDraft(null); setRevision((value) => value + 1);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Rezeptstatus konnte nicht geändert werden.";
      if (!metadataSaved) { setEditorError(message); return; }
      setRevision((value) => value + 1);
      const attempted = { detail: cloneDetail(editor), tagIds: [...selectedTagIds] };
      try {
        const latest = cloneDetail(await api.get<RecipeDetail>(`/api/admin/recipes/${encodeURIComponent(original.id)}`));
        setOriginal(latest); setEditor(latest); setSelectedTagIds(latest.tags.map((tag) => tag.id));
        setRecoveryDraft(contentSaved ? null : attempted);
        setEditorError(contentSaved
          ? `Statusänderung fehlgeschlagen. Der aktuelle Serverstand wurde geladen; bitte den Status prüfen und bei Bedarf erneut versuchen: ${message}`
          : `Speichern teilweise fehlgeschlagen. Aktueller Serverstand wurde geladen; Ihre Eingaben sind zur Wiederherstellung erhalten: ${message}`);
      } catch {
        setRecoveryDraft(attempted);
        setEditorError(`Statusänderung fehlgeschlagen; aktueller Serverstand konnte nicht neu geladen werden. Ihre Eingaben bleiben erhalten: ${message}`);
      }
    }
    finally { setBusy(false); }
  };

  const openMapping = async (ingredientId: string) => {
    if (!editor?.id) return;
    setMappingFor(ingredientId); setMappingError(null); setMappingQuery(""); setMappingProducts([]); setMappingSelection(null);
    try {
      const result = await api.get<RecipeMappingResponse>(`/api/admin/recipes/${encodeURIComponent(editor.id)}/mapping-status`);
      setMappings(result.ingredients ?? []);
    } catch (cause) { setMappingError(cause instanceof Error ? cause.message : "Mapping konnte nicht geladen werden."); }
  };

  const searchMapping = async () => {
    if (!editor?.id || !mappingFor || mappingQuery.trim().length < 2) { setMappingError("Bitte mindestens zwei Zeichen eingeben."); return; }
    setMappingError(null);
    try {
      const result = await api.get<Product[]>(`/api/admin/recipes/${encodeURIComponent(editor.id)}/ingredients/${encodeURIComponent(mappingFor)}/mapping-suggestions?${new URLSearchParams({ q: mappingQuery.trim(), size: "8" })}`);
      setMappingProducts(result);
    } catch (cause) { setMappingError(cause instanceof Error ? cause.message : "Produktsuche fehlgeschlagen."); }
  };

  const saveMapping = async () => {
    if (!editor?.id || !mappingFor || !mappingSelection) return;
    setBusy(true); setMappingError(null);
    try {
      await api.put(`/api/admin/recipes/${encodeURIComponent(editor.id)}/ingredients/${encodeURIComponent(mappingFor)}/product-mapping`, { productId: mappingSelection.id, productName: mappingSelection.name, layoutCode: mappingSelection.layoutCode ?? null, storeId: mappingSelection.storeId ?? null, storeCode: mappingSelection.storeCode ?? null, mappingType: "MANUAL", confidence: 1, manuallyConfirmed: true });
      const result = await api.get<RecipeMappingResponse>(`/api/admin/recipes/${encodeURIComponent(editor.id)}/mapping-status`);
      setMappings(result.ingredients ?? []); setMappingFor(null); setMappingSelection(null); setRevision((value) => value + 1);
    } catch (cause) { setMappingError(cause instanceof Error ? cause.message : "Mapping konnte nicht gespeichert werden."); }
    finally { setBusy(false); }
  };

  const totalPages = page ? Math.ceil(page.totalElements / Math.max(1, page.size)) : 0;
  const pageUrl = (next: number) => `/admin/next/recipes/${recipeFiltersQuery({ ...filters, page: next }) ? `?${recipeFiltersQuery({ ...filters, page: next })}` : ""}`;
  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && !busy) { setEditor(null); setOriginal(null); setCreating(false); setPreviewMode(false); return; }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]") ?? []);
    if (!focusable.length) { event.preventDefault(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return <div className="recipes-page">
    <div className="page-intro"><div><p className="eyebrow">Inhalte</p><h2>Rezepte</h2><p>Rezeptdaten, Zutaten, Schritte und Mapping-Readiness.</p></div><button className="button primary" type="button" onClick={startCreate}>Rezept anlegen</button></div>
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
        <td><div className="recipe-row-actions"><button className="button small-button" onClick={() => void loadDetail(recipe.id, true)}>Vorschau</button><button className="button small-button" onClick={() => void loadDetail(recipe.id)}>Bearbeiten</button></div></td>
      </tr>)}</tbody></table></div>}
      <div className="pager"><span>{page.totalElements ? `${page.page * page.size + 1}–${Math.min((page.page + 1) * page.size, page.totalElements)} von ${page.totalElements}` : "0 Ergebnisse"}</span><div>{page.page > 0 && <a className="button" href={pageUrl(page.page - 1)}>Zurück</a>}{page.page + 1 < totalPages && <a className="button" href={pageUrl(page.page + 1)}>Weiter</a>}</div></div>
    </section>}
    {editor && original && <div className="recipe-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) { setEditor(null); setOriginal(null); } }}>
      <section ref={dialogRef} onKeyDown={handleDialogKeyDown} className="recipe-drawer" role="dialog" aria-modal="true" aria-labelledby="recipe-editor-title" tabIndex={-1}>
        <div className="recipe-drawer-head"><div><p className="eyebrow">{creating ? "Neues Rezept" : previewMode ? "Rezept-Vorschau" : "Rezept bearbeiten"}</p><h2 id="recipe-editor-title">{editor.title || "Rezept anlegen"}</h2></div><div className="recipe-drawer-controls"><span className={`status-pill ${editor.status === "PUBLISHED" ? "ready" : "missing"}`}>{editor.status}</span>{!creating && !previewMode && editor.status !== "PUBLISHED" && <button className="button" type="button" disabled={busy} onClick={() => void updatePublication("publish")}>Veröffentlichen</button>}{!creating && !previewMode && editor.status === "PUBLISHED" && <button className="button" type="button" disabled={busy} onClick={() => void updatePublication("deactivate")}>Deaktivieren</button>}{!creating && !previewMode && editor.status !== "ARCHIVED" && <button className="button danger-button" type="button" disabled={busy} onClick={() => void updatePublication("archive")}>Archivieren</button>}<button className="button" type="button" disabled={busy} onClick={() => { setEditor(null); setOriginal(null); setCreating(false); setPreviewMode(false); }}>Schließen</button></div></div>
        {editorError && <div className="notice error-state" role="alert">{editorError}{recoveryDraft && <button className="button" type="button" disabled={busy} onClick={() => { setEditor(cloneDetail(recoveryDraft.detail)); setSelectedTagIds([...recoveryDraft.tagIds]); setRecoveryDraft(null); setEditorError("Ihre Eingaben wurden wiederhergestellt. Prüfen Sie bereits gespeicherte Zutaten und Schritte vor einem erneuten Speichern."); }}>Meine Eingaben wiederherstellen</button>}</div>}
        <form className="recipe-edit-form" onSubmit={(event) => void save(event)}>
          <fieldset disabled={busy || previewMode}>
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
              {editor.ingredients.map((item, index) => <div className="recipe-item" key={item.id ?? `new-${index}`}><label>Zutat<input value={item.id ? item.displayName : item.selectedProduct?.name ?? ""} readOnly /></label>
                <label>Menge<input value={item.quantityText ?? ""} onChange={(event) => patchIngredient(index, { quantityText: event.target.value })} /></label>
                {!item.id && <div className="recipe-product-search"><label>Produkt aus Katalog<input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Produktname suchen" /></label><button type="button" className="button" onClick={() => void searchProducts()}>Suchen</button>{productError && <small role="alert">{productError}</small>}{products.length > 0 && <select value={item.selectedProduct?.id ?? ""} onChange={(event) => { const product = products.find((candidate) => String(candidate.id) === event.target.value) ?? null; patchIngredient(index, { selectedProduct: product }); }}><option value="">Produkt auswählen</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · #{product.id}</option>)}</select>}{item.selectedProduct && <small>Ausgewählt: {item.selectedProduct.name}</small>}</div>}
                {item.id && <div className="recipe-mapping-controls"><button type="button" className="button" onClick={() => void openMapping(item.id!)}>Mapping</button><small>{mappings.find((mapping) => mapping.ingredientId === item.id)?.product?.name ?? mappings.find((mapping) => mapping.ingredientId === item.id)?.status ?? "Noch nicht gemappt"}</small></div>}
                <button type="button" className="button danger-button" onClick={() => patchEditor({ ingredients: editor.ingredients.filter((_, i) => i !== index) })}>Entfernen</button>
              </div>)}
              {mappingFor && <div className="recipe-mapping-panel"><h4>Zutaten-Mapping</h4><label>Produkt suchen<input value={mappingQuery} onChange={(event) => setMappingQuery(event.target.value)} placeholder="Mindestens 2 Zeichen" /></label><button type="button" className="button" disabled={busy} onClick={() => void searchMapping()}>Suchen</button>{mappingError && <p role="alert">{mappingError}</p>}{mappingProducts.map((product) => <label className="recipe-mapping-option" key={product.id}><input type="radio" name="recipe-mapping-product" checked={mappingSelection?.id === product.id} onChange={() => setMappingSelection(product)} />{product.name} · #{product.id}{product.layoutCode ? ` · ${product.layoutCode}` : " · Ohne Layoutposition"}</label>)}<button type="button" className="button primary" disabled={busy || !mappingSelection} onClick={() => void saveMapping()}>Mapping bestätigen</button><button type="button" className="button" onClick={() => setMappingFor(null)}>Schließen</button></div>}
            </div>
            <div className="recipe-section"><div className="section-heading"><h3>Schritte</h3><button type="button" className="button" onClick={() => patchEditor({ steps: [...editor.steps, { position: editor.steps.length + 1, instruction: "" }] })}>+ Schritt</button></div>
              {editor.steps.map((item, index) => <div className="recipe-item" key={item.id ?? `new-step-${index}`}><label>Schritt {index + 1}<textarea required maxLength={12000} value={item.instruction} onChange={(event) => patchStep(index, { instruction: event.target.value })} /></label><label>Dauer min<input type="number" min="0" value={numeric(item.durationMinutes)} onChange={(event) => patchStep(index, { durationMinutes: event.target.value === "" ? null : Number(event.target.value) })} /></label><button type="button" className="button danger-button" onClick={() => patchEditor({ steps: editor.steps.filter((_, i) => i !== index) })}>Entfernen</button></div>)}
            </div>
          </fieldset>
          {!previewMode && <div className="recipe-form-actions"><button className="button" type="button" disabled={busy} onClick={() => { setEditor(null); setOriginal(null); setCreating(false); }}>Abbrechen</button><button className="button primary" type="submit" disabled={busy}>{busy ? "Speichert …" : creating ? "Entwurf anlegen" : "Speichern"}</button></div>}
        </form>
      </section>
    </div>}
  </div>;
}

