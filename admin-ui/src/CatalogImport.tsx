import { useState, type FormEvent } from "react";

export type CatalogImportKind = "product" | "category";
export interface CatalogImportRow {
  row: number;
  item: unknown;
  errors: string[];
}
export interface CatalogImportReview {
  rows: CatalogImportRow[];
  total: number;
  valid: number;
  invalid: number;
}

export function parseCatalogImportText(text: string): CatalogImportRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    let value: unknown;
    try { value = JSON.parse(trimmed); }
    catch (error) { throw new Error(`JSON-Array ist ungültig: ${error instanceof Error ? error.message : "unbekannter Fehler"}`); }
    if (!Array.isArray(value)) throw new Error("JSON muss ein Array enthalten.");
    return value.map((item, index) => ({ row: index + 1, item, errors: [] }));
  }
  return trimmed.split(/\r?\n/).flatMap<CatalogImportRow>((line, index) => {
    if (!line.trim()) return [];
    try { return [{ row: index + 1, item: JSON.parse(line), errors: [] }]; }
    catch (error) {
      return [{ row: index + 1, item: line, errors: [`Zeile ${index + 1} ist kein gültiges JSON: ${error instanceof Error ? error.message : "unbekannter Fehler"}`] }];
    }
  });
}

export function reviewCatalogImport(kind: CatalogImportKind, rows: CatalogImportRow[]): CatalogImportReview {
  const keyField = kind === "category" ? "categoryCode" : "id";
  const seen = new Set<string>();
  const reviewed = rows.map((row) => {
    const errors = [...row.errors];
    const item = row.item;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      if (!errors.length) errors.push("Datensatz muss ein JSON-Objekt sein.");
      return { ...row, errors };
    }
    const value = item as Record<string, unknown>;
    if (kind === "category") {
      const code = value.categoryCode;
      if (!Number.isInteger(code) || Number(code) < 1 || Number(code) > 999) errors.push("categoryCode muss eine Ganzzahl zwischen 1 und 999 sein.");
      if (typeof value.categoryName !== "string" || !value.categoryName.trim()) errors.push("categoryName ist erforderlich.");
      if (typeof value.categoryName === "string" && value.categoryName.trim().length > 180) errors.push("categoryName darf höchstens 180 Zeichen enthalten.");
    } else {
      if (!Number.isInteger(value.id) || Number(value.id) < 1) errors.push("Produkt-ID muss eine positive ganze Zahl sein.");
      if (typeof value.name !== "string" || !value.name.trim()) errors.push("Produktname ist erforderlich.");
      if (typeof value.name === "string" && value.name.trim().length > 180) errors.push("Produktname darf höchstens 180 Zeichen enthalten.");
      if (value.price == null || value.price === "" || !Number.isFinite(Number(value.price)) || Number(value.price) < 0) errors.push("Preis muss eine endliche Zahl ab 0 sein.");
      if (typeof value.layoutCode !== "string" || !/^\d{3}\/[1-5]\/([1-7])\/([1-3])$/.test(value.layoutCode.trim())) errors.push("Layout-Code muss dem unterstützten Format 310/1/1/1 entsprechen.");
    }
    const key = value[keyField];
    if (key != null && String(key).trim()) {
      const normalizedKey = String(key).trim();
      if (seen.has(normalizedKey)) errors.push(`Doppelte ${keyField}: ${normalizedKey}.`);
      seen.add(normalizedKey);
    }
    return { ...row, errors };
  });
  return {
    rows: reviewed,
    total: reviewed.length,
    valid: reviewed.filter((row) => row.errors.length === 0).length,
    invalid: reviewed.filter((row) => row.errors.length > 0).length
  };
}

const limitation = "Commit gesperrt. Für Kategorien ist noch kein Bulk-Import freigegeben. Diese Prüfung hat nichts gesendet.";

/** Kategorieimport: nur Prüfung, der Commit bleibt gesperrt. Produktimport läuft über ProductCsvImport. */
export function CatalogImportPanel({ kind }: { kind: "category" }) {
  const [source, setSource] = useState("");
  const [review, setReview] = useState<CatalogImportReview | null>(null);
  const [parseError, setParseError] = useState("");
  const categoryExample = '[{"categoryCode":310,"categoryName":"Obst & Gemüse"}]';
  const parse = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setParseError("");
    try {
      const rows = parseCatalogImportText(source);
      if (!rows.length) throw new Error("Keine Datensätze gefunden.");
      setReview(reviewCatalogImport(kind, rows));
    } catch (error) {
      setReview(null);
      setParseError(error instanceof Error ? error.message : "Import konnte nicht geparst werden.");
    }
  };
  return <section className="catalog-import panel" aria-labelledby={`${kind}-import-title`}>
    <div className="panel-header"><h3 id={`${kind}-import-title`}>Kategorieimport prüfen</h3></div>
    <p>JSON-Array oder NDJSON einfügen. Die Prüfung bleibt lokal und sendet keine Daten.</p>
    <form onSubmit={parse}>
      <label htmlFor={`${kind}-import-source`}>JSON-Array oder NDJSON</label>
      <textarea id={`${kind}-import-source`} rows={6} value={source} onChange={(event) => setSource(event.currentTarget.value)} placeholder={categoryExample} />
      <button type="submit" className="primary">Parsen und prüfen</button>
    </form>
    {parseError && <p role="alert" className="notice error">Import konnte nicht geprüft werden: {parseError}</p>}
    {review && <div className="catalog-review" aria-live="polite">
      <h4>Review</h4>
      <p role="status">{review.total} Zeilen · {review.valid} gültig · {review.invalid} ungültig</p>
      <div className="table-scroll"><table><thead><tr><th>Zeile</th><th>Status</th><th>Datensatz</th><th>Prüfung</th></tr></thead><tbody>
        {review.rows.map(({ row, item, errors }) => <tr key={row}>
          <td>{row}</td><td><span className={`status-pill ${errors.length ? "missing" : "ready"}`}>{errors.length ? "Ungültig" : "Gültig"}</span></td>
          <td><code>{JSON.stringify(item)}</code></td><td>{errors.length ? <ul>{errors.map((reason, index) => <li key={`${row}-${index}`}>{reason}</li>)}</ul> : "—"}</td>
        </tr>)}
      </tbody></table></div>
      <p className="limit-notice"><strong>Commit nicht verfügbar.</strong> {limitation}</p>
      <button type="button" disabled aria-disabled="true">Commit nicht verfügbar</button>
    </div>}
  </section>;
}
