import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiClientError, type ApiClient } from "./api/client";
import { CatalogImportPanel } from "./CatalogImport";

interface Category { categoryCode: number; categoryName: string }

export function CategoriesPage({ api }: { api: ApiClient }) {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Category | null | false>(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api.get<Category[]>("/api/categories?size=500", { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(result) || result.some((item) => !Number.isInteger(item.categoryCode) || typeof item.categoryName !== "string")) throw new Error("Kategorienantwort ist unvollständig.");
        setCategories(result); setError(null);
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Kategorien konnten nicht geladen werden."); });
    return () => controller.abort();
  }, [api, revision]);
  const visible = useMemo(() => (categories ?? []).filter((item) => `${item.categoryCode} ${item.categoryName}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => a.categoryCode - b.categoryCode), [categories, query]);
  const open = (item: Category | null) => { setSelected(item); setCode(item ? String(item.categoryCode) : ""); setName(item?.categoryName ?? ""); setFormError(null); setNotice(null); };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const parsedCode = Number(code);
    if (!Number.isInteger(parsedCode) || parsedCode < 1 || parsedCode > 999 || !name.trim()) { setFormError("Kategorie-Code (1–999) und Name sind erforderlich."); return; }
    setSaving(true); setFormError(null);
    try {
      const payload = { categoryCode: parsedCode, categoryName: name.trim() };
      if (!selected) {
        try {
          await api.get<Category>(`/api/categories/${parsedCode}`);
          setFormError(`Kategorie-Code ${parsedCode} existiert bereits. Zum Ändern die bestehende Kategorie bearbeiten.`);
          return;
        } catch (cause) {
          if (!(cause instanceof ApiClientError && cause.status === 404)) throw cause;
        }
      }
      if (selected) await api.put(`/api/categories/${selected.categoryCode}`, payload);
      else await api.post("/api/categories", payload);
      setSelected(false); setNotice(`Kategorie ${parsedCode} gespeichert.`); setRevision((value) => value + 1);
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : "Kategorie konnte nicht gespeichert werden."); }
    finally { setSaving(false); }
  };
  return <div className="categories-page">
    <div className="page-intro"><div><p className="eyebrow">Katalog</p><h2>Kategorien</h2><p>Produktgruppen und ihre Codes verwalten.</p></div><button className="button primary" onClick={() => open(null)}>Kategorie anlegen</button></div>
    <CatalogImportPanel kind="category" />
    {notice && <p role="status" className="notice success-state">{notice}</p>}
    {error && <div className="notice error-state" role="alert"><h3>Kategorien konnten nicht geladen werden</h3><p>{error}</p><button className="button" onClick={() => setRevision((value) => value + 1)}>Erneut versuchen</button></div>}
    {!categories && !error && <p role="status" className="notice">Kategorien werden geladen …</p>}
    {selected !== false && <section className="notice"><h3>{selected ? "Kategorie bearbeiten" : "Kategorie anlegen"}</h3>{formError && <p role="alert" className="error-state">{formError}</p>}<form className="category-form" onSubmit={save}>
      <label>Kategorie-Code<input type="number" min="1" max="999" required value={code} disabled={Boolean(selected)} onChange={(event) => setCode(event.target.value)} /></label>
      <label>Name<input maxLength={180} required value={name} onChange={(event) => setName(event.target.value)} /></label>
      <div className="form-actions"><button className="button primary" type="submit" disabled={saving}>{saving ? "Speichert …" : "Speichern"}</button><button className="button" type="button" disabled={saving} onClick={() => setSelected(false)}>Abbrechen</button></div>
    </form></section>}
    {categories && !error && <section className="notice" aria-label="Kategorie-Ergebnisse"><div className="section-heading"><h3>{categories.length} Kategorien</h3><span>{visible.length} sichtbar</span></div>
      {categories.length >= 500 && <p className="limit-notice" role="status">Die API liefert höchstens 500 Kategorien. Für weitere Einträge ist eine paginierte API nötig.</p>}
      <label className="category-search">Suche<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Code oder Name" /></label>
      {visible.length === 0 ? <p>Keine Kategorie passt zur Suche.</p> : <div className="table-scroll"><table><thead><tr><th>Code</th><th>Name</th><th>Aktion</th></tr></thead><tbody>{visible.map((item) => <tr key={item.categoryCode}><td><code>{item.categoryCode}</code></td><td>{item.categoryName}</td><td><button className="button" onClick={() => open(item)}>Bearbeiten</button></td></tr>)}</tbody></table></div>}
    </section>}
  </div>;
}
