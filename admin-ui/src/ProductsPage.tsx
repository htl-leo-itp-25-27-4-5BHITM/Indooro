import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiClientError, type ApiClient } from "./api/client";

export interface Product {
  id: number;
  name: string;
  price: number | null;
  layoutCode: string | null;
  storeId: string | null;
  storeCode: string | null;
}

export interface Category {
  categoryCode: number;
  categoryName: string;
}

export interface ProductPage {
  content: Product[];
  page: number;
  size: number;
  totalElements: number;
}

export interface ProductFilters {
  q: string;
  page: number;
  size: number;
}

export interface ProductDraft {
  id: string;
  name: string;
  price: string;
  storeId: string;
  storeCode: string;
  categoryCode: string;
  meter: string;
  shelf: string;
  position: string;
}

export interface LayoutLocation {
  categoryCode: number;
  meter: number;
  shelf: number;
  position: number;
}

export function readProductFilters(search: string): ProductFilters {
  const params = new URLSearchParams(search);
  const rawPage = Number(params.get("page"));
  const rawSize = Number(params.get("size"));
  return {
    q: (params.get("q") ?? "").slice(0, 120),
    page: Number.isInteger(rawPage) && rawPage >= 0 ? rawPage : 0,
    size: Number.isInteger(rawSize) && rawSize >= 1 && rawSize <= 100 ? rawSize : 20
  };
}

export function productListPath(filters: ProductFilters): string {
  const params = new URLSearchParams({ page: String(filters.page), size: String(filters.size) });
  if (filters.q.trim()) params.set("q", filters.q.trim());
  return `/api/admin/products?${params.toString()}`;
}

export function isProductPageResponse(value: unknown): value is ProductPage {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<ProductPage>;
  return Array.isArray(response.content)
    && Number.isInteger(response.page) && response.page! >= 0
    && Number.isInteger(response.size) && response.size! > 0
    && Number.isInteger(response.totalElements) && response.totalElements! >= 0;
}

export function productPageUrl(filters: ProductFilters): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.page) params.set("page", String(filters.page));
  if (filters.size !== 20) params.set("size", String(filters.size));
  return `/admin/next/products/${params.size ? `?${params.toString()}` : ""}`;
}

export function parseLayoutCode(layoutCode: string | null | undefined): LayoutLocation | null {
  const match = String(layoutCode ?? "").trim().match(/^(\d{3})\/(\d+)\/(\d+)\/(\d+)$/);
  if (!match) return null;
  const [, category, meter, shelf, position] = match;
  const result = { categoryCode: Number(category), meter: Number(meter), shelf: Number(shelf), position: Number(position) };
  if (result.meter < 1 || result.meter > 5 || result.shelf < 1 || result.shelf > 7 || result.position < 1 || result.position > 3) return null;
  return result;
}

export function buildLayoutCode(draft: Pick<ProductDraft, "categoryCode" | "meter" | "shelf" | "position">): string {
  return `${draft.categoryCode.trim()}/${draft.meter.trim()}/${draft.shelf.trim()}/${draft.position.trim()}`;
}

export function parseProductPrice(value: string): number {
  return Number(value.trim().replace(",", "."));
}

export function productReadiness(product: Product, categories: Category[]): { ready: boolean; label: string; detail: string; categoryName: string } {
  const location = parseLayoutCode(product.layoutCode);
  if (!location) return { ready: false, label: "Layout prüfen", detail: "Layout-Code fehlt oder liegt außerhalb des Formats 310/1/1/1.", categoryName: "Unbekannte Kategorie" };
  const category = categories.find((item) => item.categoryCode === location.categoryCode);
  if (!category) return { ready: false, label: "Kategorie fehlt", detail: `Kategorie ${location.categoryCode} ist im Katalog nicht vorhanden.`, categoryName: `Kategorie ${location.categoryCode}` };
  return {
    ready: true,
    label: product.storeId || product.storeCode ? "Routbar" : "Global routbar",
    detail: `${location.meter}. Regalabschnitt · Fach ${location.shelf} · Position ${location.position}`,
    categoryName: category.categoryName
  };
}

export function validateProductDraft(draft: ProductDraft, categories: Category[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const id = Number(draft.id);
  if (!Number.isInteger(id) || id < 1) errors.id = "Produkt-ID muss eine positive ganze Zahl sein.";
  if (!draft.name.trim()) errors.name = "Name ist erforderlich.";
  if (draft.name.trim().length > 180) errors.name = "Name darf höchstens 180 Zeichen enthalten.";
  if (draft.price.trim() === "" || !Number.isFinite(parseProductPrice(draft.price)) || parseProductPrice(draft.price) < 0) errors.price = "Preis muss eine Zahl größer oder gleich 0 sein.";
  if (!draft.categoryCode) errors.categoryCode = "Kategorie ist erforderlich.";
  else if (!categories.some((category) => String(category.categoryCode) === draft.categoryCode)) errors.categoryCode = "Kategorie wurde nicht gefunden.";
  if (!/^[1-5]$/.test(draft.meter)) errors.meter = "Meter muss zwischen 1 und 5 liegen.";
  if (!/^[1-7]$/.test(draft.shelf)) errors.shelf = "Fach muss zwischen 1 und 7 liegen.";
  if (!/^[1-3]$/.test(draft.position)) errors.position = "Reihe muss zwischen 1 und 3 liegen.";
  return errors;
}

export function productPayload(draft: ProductDraft): Product {
  return {
    id: Number(draft.id),
    name: draft.name.trim(),
    price: parseProductPrice(draft.price),
    layoutCode: buildLayoutCode(draft),
    storeId: draft.storeId.trim() || null,
    storeCode: draft.storeCode.trim() || null
  };
}

function productDraft(product?: Product): ProductDraft {
  const location = parseLayoutCode(product?.layoutCode);
  return {
    id: product?.id == null ? "" : String(product.id),
    name: product?.name ?? "",
    price: product?.price == null ? "" : String(product.price),
    storeId: product?.storeId ?? "",
    storeCode: product?.storeCode ?? "",
    categoryCode: location ? String(location.categoryCode) : "",
    meter: location ? String(location.meter) : "1",
    shelf: location ? String(location.shelf) : "1",
    position: location ? String(location.position) : "1"
  };
}

function friendlyError(error: unknown): string {
  return error instanceof ApiClientError ? error.message : "Anfrage fehlgeschlagen. Bitte erneut versuchen.";
}

export function ProductsPage({ api }: { api: ApiClient }) {
  const [filters, setFilters] = useState<ProductFilters>(() => readProductFilters(window.location.search));
  const [searchInput, setSearchInput] = useState(filters.q);
  const [pageData, setPageData] = useState<ProductPage | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryError, setCategoryError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<Product | null | false>(false);
  const [draft, setDraft] = useState<ProductDraft>(productDraft());
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    api.get<ProductPage>(productListPath(filters), { signal: controller.signal })
      .then((result) => {
        if (!isProductPageResponse(result)) {
          throw new Error("Die Produktantwort enthält keine gültige Seitennavigation.");
        }
        if (controller.signal.aborted) return;
        const pageCount = Math.ceil(result.totalElements / Math.max(1, result.size));
        if (pageCount > 0 && result.page >= pageCount) {
          setFilters((current) => ({ ...current, page: pageCount - 1 }));
          return;
        }
        setPageData(result);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setLoadError(friendlyError(error));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, filters, revision]);

  useEffect(() => {
    const controller = new AbortController();
    api.get<Category[]>("/api/categories?size=500", { signal: controller.signal })
      .then((result) => {
        if (!Array.isArray(result)) throw new Error("Die Kategorienantwort ist ungültig.");
        if (!controller.signal.aborted) { setCategories(result); setCategoryError(""); }
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setCategoryError(friendlyError(error));
      });
    return () => controller.abort();
  }, [api, revision]);

  const totalPages = pageData ? Math.ceil(pageData.totalElements / Math.max(1, pageData.size)) : 0;

  function changeFilters(next: ProductFilters) {
    setFilters(next);
    window.history.replaceState(null, "", productPageUrl(next));
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    changeFilters({ ...filters, q: searchInput.trim(), page: 0 });
  }

  function startCreate() {
    setEditor(null);
    setDraft(productDraft());
    setValidationErrors({});
    setSaveError("");
  }

  function startEdit(product: Product) {
    setEditor(product);
    setDraft(productDraft(product));
    setValidationErrors({});
    setSaveError("");
  }

  function closeEditor() {
    if (saving) return;
    setEditor(false);
    setValidationErrors({});
    setSaveError("");
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editor === false || saving) return;
    const errors = validateProductDraft(draft, categories);
    setValidationErrors(errors);
    setSaveError("");
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      await api.post<Product>("/api/admin/products", productPayload(draft));
      setEditor(false);
      setNotice(editor ? "Produkt wurde aktualisiert." : "Produkt wurde angelegt.");
      setRevision((value) => value + 1);
    } catch (error) {
      setSaveError(friendlyError(error));
      if (error instanceof ApiClientError) {
        const mapped: Record<string, string> = {};
        Object.entries(error.fieldErrors).forEach(([field, messages]) => { if (messages[0]) mapped[field] = messages[0]; });
        setValidationErrors(mapped);
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(product: Product) {
    if (deletingId !== null || !window.confirm(`Produkt ${product.name} (#${product.id}) löschen?`)) return;
    setDeletingId(product.id);
    setDeleteError("");
    try {
      await api.delete<void>(`/api/admin/products/${product.id}`);
      setNotice(`Produkt ${product.name} wurde gelöscht.`);
      setRevision((value) => value + 1);
    } catch (error) {
      setDeleteError(friendlyError(error));
    } finally {
      setDeletingId(null);
    }
  }

  const pageItems = useMemo(() => pageData?.content ?? [], [pageData]);

  return <section className="products-page" aria-labelledby="products-title">
    <div className="page-heading"><div><p className="eyebrow">Katalog</p><h2 id="products-title">Produkte</h2><p>Produkte, Kategorie-Kontext und Regalpositionen im Katalog verwalten.</p></div><button type="button" className="primary" onClick={startCreate}>Produkt anlegen</button></div>
    {notice && <p role="status" className="notice success">{notice}</p>}
    {deleteError && <p role="alert" className="notice error">{deleteError}</p>}
    {categoryError && <p role="status" className="notice">Kategorien konnten nicht geladen werden. Kategorie-Namen und lokale Layout-Prüfung sind eingeschränkt: {categoryError}</p>}

    {editor !== false && <section className="panel" aria-labelledby="product-form-title"><div className="panel-header"><h3 id="product-form-title">{editor ? "Produkt bearbeiten" : "Produkt anlegen"}</h3></div>
      {saveError && <p role="alert" className="notice error">{saveError}</p>}
      <form className="form-grid" onSubmit={saveProduct} noValidate>
        <label>Produkt-ID<input required inputMode="numeric" value={draft.id} aria-invalid={!!validationErrors.id} onChange={(event) => setDraft({ ...draft, id: event.currentTarget.value })} />{validationErrors.id && <small role="alert">{validationErrors.id}</small>}</label>
        <label>Name<input required maxLength={180} value={draft.name} aria-invalid={!!validationErrors.name} onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })} />{validationErrors.name && <small role="alert">{validationErrors.name}</small>}</label>
        <label>Preis (EUR)<input required inputMode="decimal" value={draft.price} aria-invalid={!!validationErrors.price} onChange={(event) => setDraft({ ...draft, price: event.currentTarget.value })} />{validationErrors.price && <small role="alert">{validationErrors.price}</small>}</label>
        <label>Kategorie<select required value={draft.categoryCode} aria-invalid={!!validationErrors.categoryCode} onChange={(event) => setDraft({ ...draft, categoryCode: event.currentTarget.value })}><option value="">Kategorie auswählen</option>{categories.map((category) => <option key={category.categoryCode} value={category.categoryCode}>{category.categoryCode} · {category.categoryName}</option>)}</select>{validationErrors.categoryCode && <small role="alert">{validationErrors.categoryCode}</small>}</label>
        <fieldset className="span-2"><legend>Regalposition · Format categoryCode/meter/fach/reihe</legend><div className="form-grid">
          <label>Meter (1–5)<select value={draft.meter} aria-invalid={!!validationErrors.meter} onChange={(event) => setDraft({ ...draft, meter: event.currentTarget.value })}>{[1, 2, 3, 4, 5].map((value) => <option key={value}>{value}</option>)}</select>{validationErrors.meter && <small role="alert">{validationErrors.meter}</small>}</label>
          <label>Fach (1–7)<select value={draft.shelf} aria-invalid={!!validationErrors.shelf} onChange={(event) => setDraft({ ...draft, shelf: event.currentTarget.value })}>{[1, 2, 3, 4, 5, 6, 7].map((value) => <option key={value}>{value}</option>)}</select>{validationErrors.shelf && <small role="alert">{validationErrors.shelf}</small>}</label>
          <label>Reihe (1–3)<select value={draft.position} aria-invalid={!!validationErrors.position} onChange={(event) => setDraft({ ...draft, position: event.currentTarget.value })}>{[1, 2, 3].map((value) => <option key={value}>{value}</option>)}</select>{validationErrors.position && <small role="alert">{validationErrors.position}</small>}</label>
          <p>Layout-Code: <code>{draft.categoryCode ? buildLayoutCode(draft) : "310/1/1/1"}</code></p>
        </div></fieldset>
        <label>Store-ID <span>(optional)</span><input value={draft.storeId} onChange={(event) => setDraft({ ...draft, storeId: event.currentTarget.value })} /></label>
        <label>Store-Code <span>(optional)</span><input value={draft.storeCode} onChange={(event) => setDraft({ ...draft, storeCode: event.currentTarget.value })} /></label>
        <div className="toolbar span-2"><button type="submit" className="primary" disabled={saving}>{saving ? "Speichert …" : "Speichern"}</button><button type="button" onClick={closeEditor} disabled={saving}>Abbrechen</button></div>
      </form>
    </section>}

    <form className="filters" role="search" onSubmit={submitSearch}><label>Suche<input type="search" value={searchInput} maxLength={120} onChange={(event) => setSearchInput(event.currentTarget.value)} placeholder="Name, ID, Layout-Code oder Store-Code" /></label><button type="submit" className="primary">Suchen</button></form>
    {loadError && <div role="alert" className="notice error"><p>{loadError}</p><button type="button" onClick={() => setRevision((value) => value + 1)}>Erneut laden</button></div>}
    {loading && <p role="status">Produkte werden geladen …</p>}
    {!loading && !loadError && pageData && <section className="panel" aria-labelledby="product-list-title">
      <div className="panel-header"><h3 id="product-list-title">{pageData.totalElements.toLocaleString("de-AT")} Produkte</h3><span>Seite {pageData.page + 1} von {Math.max(totalPages, 1)}</span></div>
      {pageItems.length === 0 ? <p className="empty-state">{filters.q ? "Keine Produkte zur Suche gefunden." : "Der Produktkatalog ist leer."}</p> : <div className="table-scroll"><table><thead><tr><th>ID</th><th>Produkt</th><th>Preis</th><th>Kategorie</th><th>Regalposition</th><th>Store</th><th>Readiness</th><th>Aktionen</th></tr></thead><tbody>{pageItems.map((product) => {
        const readiness = productReadiness(product, categories);
        const location = parseLayoutCode(product.layoutCode);
        return <tr key={product.id}><td>{product.id}</td><td><strong>{product.name}</strong></td><td>{product.price == null ? "–" : `${Number(product.price).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`}</td>
          <td>{readiness.categoryName}</td><td><code>{product.layoutCode || "–"}</code>{location && <small>{readiness.detail}</small>}</td><td>{product.storeCode || product.storeId || "Global"}</td>
          <td><span className={`status-pill ${readiness.ready ? "ready" : "missing"}`}>{readiness.label}</span>{!readiness.ready && <small>{readiness.detail}</small>}</td>
          <td><div className="row-actions"><button type="button" onClick={() => startEdit(product)}>Bearbeiten</button><button type="button" className="danger" onClick={() => deleteProduct(product)} disabled={deletingId !== null}>{deletingId === product.id ? "Löscht …" : "Löschen"}</button></div></td></tr>;
      })}</tbody></table></div>}
      <div className="pager"><span>{pageData.totalElements ? `${pageData.page * pageData.size + 1}–${Math.min((pageData.page + 1) * pageData.size, pageData.totalElements)} von ${pageData.totalElements}` : "0 Ergebnisse"}</span><div>
        {pageData.page > 0 && <a className="button" href={productPageUrl({ ...filters, page: pageData.page - 1 })} onClick={(event) => { event.preventDefault(); changeFilters({ ...filters, page: pageData.page - 1 }); }}>Zurück</a>}
        {pageData.page + 1 < totalPages && <a className="button" href={productPageUrl({ ...filters, page: pageData.page + 1 })} onClick={(event) => { event.preventDefault(); changeFilters({ ...filters, page: pageData.page + 1 }); }}>Weiter</a>}
      </div></div>
    </section>}
  </section>;
}
