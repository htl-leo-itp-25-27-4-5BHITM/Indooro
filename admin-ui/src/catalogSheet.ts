/**
 * Prüfung einer Produkttabelle gegen das aktive Layout. Regeln entsprechen dem Entwurf
 * `prepare-pilot-store-operations` (Vorlage `produkte-vorlage.csv`), bis `csv_to_ndjson.py` existiert.
 */
import type { ParsedCsv } from "./catalogCsv";

export const SHEET_COLUMNS = ["id", "name", "marke", "menge", "regal_label", "kategorie", "meter", "fach", "reihe", "preis"] as const;
export type SheetColumn = (typeof SHEET_COLUMNS)[number];

const REQUIRED_COLUMNS: readonly SheetColumn[] = ["name", "kategorie", "meter", "fach", "reihe"];

/** Zusätzliche Kopfzeilen-Namen (deutsche Varianten). Verglichen wird ohne Zeichen außer Buchstaben und Ziffern, klein. */
const COLUMN_ALIASES: Record<SheetColumn, readonly string[]> = {
  id: ["id"],
  name: ["name", "produktname"],
  marke: ["marke"],
  menge: ["menge"],
  regal_label: ["regal_label", "regal label", "regal-bezeichnung", "regalbezeichnung"],
  kategorie: ["kategorie", "kategoriecode"],
  meter: ["meter"],
  fach: ["fach"],
  reihe: ["reihe"],
  preis: ["preis"]
};

const headerKey = (value: string): string => value.replace(/\(.*?\)/g, "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

const COLUMN_BY_KEY = new Map<string, SheetColumn>(
  SHEET_COLUMNS.flatMap((column) => COLUMN_ALIASES[column].map((alias) => [headerKey(alias), column] as const))
);

export interface SheetLayoutElement {
  type: string;
  category?: string | null;
  label?: string;
}

export interface SheetLayout {
  elements: SheetLayoutElement[];
}

export interface SheetOptions {
  /** Erste automatisch vergebene Id (Standard 1). */
  startId?: number;
  /** Ids, die bereits im Katalog stehen; sie werden nicht automatisch vergeben und gelten als Überschreibung. */
  existingIds?: Set<number>;
  /** Dateizeilennummern, die übersprungen werden (kein Fehler, kein Produkt). */
  excludedRows?: Set<number>;
}

export interface SheetProduct {
  id: number;
  name: string;
  price?: number;
  layoutCode: string;
}

/** Zeile null = Fehler betrifft die ganze Datei (z. B. fehlende Spalte). */
export interface RowError {
  line: number | null;
  field: string | null;
  message: string;
}

export interface ReviewRow {
  line: number;
  status: "valid" | "invalid" | "excluded";
  id: number | null;
  name: string;
  layoutCode: string;
  errors: RowError[];
}

export interface SheetSummary {
  rows: number;
  valid: number;
  excluded: number;
  shelvesUsed: number;
  shelvesWithoutProducts: number;
}

export interface SheetReview {
  products: SheetProduct[];
  rows: ReviewRow[];
  /** Alle Fehler: Dateifehler zuerst bzw. allein, sonst Zeilenfehler in Dateireihenfolge. */
  errors: RowError[];
  summary: SheetSummary;
  /** Ids gültiger Produkte, die bereits in `existingIds` stehen. */
  overwrites: number[];
}

export type SheetInput = Pick<ParsedCsv, "headers" | "rows" | "lineNumbers">;

const collapse = (value: string): string => value.replace(/\s+/g, " ").trim();

function mapHeaders(headers: string[]): Map<SheetColumn, number> {
  const positions = new Map<SheetColumn, number>();
  headers.forEach((header, position) => {
    const column = COLUMN_BY_KEY.get(headerKey(header));
    if (column && !positions.has(column)) positions.set(column, position);
  });
  return positions;
}

/** Ganze Zahl aus 1 bis `maxDigits` Ziffern, mindestens 1. */
function parseCount(text: string, maxDigits: number): number | null {
  if (!new RegExp(`^\\d{1,${maxDigits}}$`).test(text)) return null;
  const value = Number(text);
  return value >= 1 ? value : null;
}

/** Produkt-Id: ganze Zahl ab 1, im sicheren Integer-Bereich. */
function parseId(text: string): number | null {
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

function parsePrice(text: string): number | null {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(text)) return null;
  return Number(text.replace(",", "."));
}

const shelfKey = (kategorie: number, meter: number): string => `${kategorie}/${meter}`;

export function reviewSheet(parsed: SheetInput, layout: SheetLayout, options: SheetOptions = {}): SheetReview {
  const startId = options.startId ?? 1;
  const existingIds = options.existingIds ?? new Set<number>();
  const excludedRows = options.excludedRows ?? new Set<number>();
  const positions = mapHeaders(parsed.headers);
  const cell = (values: string[], column: SheetColumn): string => {
    const position = positions.get(column);
    return position === undefined ? "" : (values[position] ?? "").trim();
  };

  const fileFailure = (errors: RowError[]): SheetReview => ({
    products: [],
    rows: [],
    errors,
    summary: { rows: parsed.rows.length, valid: 0, excluded: 0, shelvesUsed: 0, shelvesWithoutProducts: 0 },
    overwrites: []
  });

  if (parsed.headers.length === 0) {
    return fileFailure([{ line: null, field: null, message: "Die Datei enthält keine Kopfzeile." }]);
  }
  const fileErrors: RowError[] = REQUIRED_COLUMNS.filter((column) => !positions.has(column)).map((column) => ({
    line: null,
    field: column,
    message: `Spalte „${column}“ fehlt in der Kopfzeile.`
  }));
  if (parsed.rows.length === 0) {
    fileErrors.push({ line: null, field: null, message: "Die Datei enthält keine Produktzeilen." });
  }
  if (fileErrors.length > 0) return fileFailure(fileErrors);

  const shelves = layout.elements.filter(
    (element): element is SheetLayoutElement & { category: string } =>
      element.type === "shelf" && typeof element.category === "string" && element.category.trim() !== ""
  );
  const shelfCode = (element: { category: string }) => element.category.trim();

  // Alle Ids der Datei sind reserviert, damit automatische Ids nie mit einer Zeile der Datei kollidieren.
  const reserved = new Set<number>();
  const idCounts = new Map<number, number>();
  parsed.rows.forEach((values, index) => {
    const id = parseId(cell(values, "id"));
    if (id === null) return;
    reserved.add(id);
    if (!excludedRows.has(parsed.lineNumbers[index])) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  });

  const reviewRows: ReviewRow[] = [];
  const pendingAutoIds: number[] = [];
  const rowPrices = new Map<ReviewRow, number>();

  parsed.rows.forEach((values, index) => {
    const line = parsed.lineNumbers[index];
    const name = [cell(values, "marke"), cell(values, "name"), cell(values, "menge")].map(collapse).filter(Boolean).join(" ");
    if (excludedRows.has(line)) {
      reviewRows.push({ line, status: "excluded", id: null, name, layoutCode: "", errors: [] });
      return;
    }

    const errors: RowError[] = [];
    const fail = (field: string, message: string) => errors.push({ line, field, message });

    if (!name) fail("name", "Produktname ist leer.");
    else if (name.length > 180) fail("name", "Produktname ist länger als 180 Zeichen.");

    const kategorie = parseCount(cell(values, "kategorie"), 4);
    if (kategorie === null) fail("kategorie", "Kategorie muss eine ganze Zahl mit 1 bis 4 Ziffern sein (ab 1).");
    const meter = parseCount(cell(values, "meter"), 3);
    if (meter === null) fail("meter", "Meter muss eine ganze Zahl mit 1 bis 3 Ziffern sein (ab 1).");
    const fach = parseCount(cell(values, "fach"), 2);
    if (fach === null) fail("fach", "Fach muss eine ganze Zahl mit 1 bis 2 Ziffern sein (ab 1).");
    const reihe = parseCount(cell(values, "reihe"), 2);
    if (reihe === null) fail("reihe", "Reihe muss eine ganze Zahl mit 1 bis 2 Ziffern sein (ab 1).");

    if (kategorie !== null && meter !== null) {
      const key = shelfKey(kategorie, meter);
      const matching = shelves.filter((element) => shelfCode(element) === key);
      if (matching.length === 0) {
        fail("kategorie", `Kein Regal ${key} im aktiven Layout.`);
      } else {
        const regalLabel = cell(values, "regal_label");
        const normalize = (value: string) => collapse(value).toLowerCase();
        if (regalLabel && !matching.some((element) => normalize(element.label ?? "") === normalize(regalLabel))) {
          const labels = matching.map((element) => element.label?.trim() || "ohne Bezeichnung");
          fail("regal_label", `Regal-Bezeichnung passt nicht (Layout: ${labels.join(", ")}).`);
        }
      }
    }

    const idText = cell(values, "id");
    let id: number | null = null;
    if (idText !== "") {
      const explicit = parseId(idText);
      if (explicit === null) fail("id", "ID muss eine ganze Zahl ab 1 sein.");
      else if ((idCounts.get(explicit) ?? 0) > 1) fail("id", `ID ${explicit} kommt mehrfach in der Datei vor.`);
      else id = explicit;
    }

    const priceText = cell(values, "preis");
    let price: number | undefined;
    if (priceText !== "") {
      const parsedPrice = parsePrice(priceText);
      if (parsedPrice === null) fail("preis", "Preis muss eine Zahl ab 0 mit Komma oder Punkt als Dezimaltrenner sein.");
      else price = parsedPrice;
    }

    const layoutCode = kategorie !== null && meter !== null && fach !== null && reihe !== null
      ? `${kategorie}/${meter}/${fach}/${reihe}`
      : "";
    const row: ReviewRow = { line, status: errors.length ? "invalid" : "valid", id, name, layoutCode, errors };
    if (errors.length === 0 && idText === "") pendingAutoIds.push(reviewRows.length);
    if (price !== undefined) rowPrices.set(row, price);
    reviewRows.push(row);
  });

  // Automatische Ids in Dateireihenfolge, übersprungen werden Ids aus der Datei und aus existingIds.
  let next = startId;
  for (const rowIndex of pendingAutoIds) {
    while (reserved.has(next) || existingIds.has(next)) next += 1;
    reviewRows[rowIndex].id = next;
    reserved.add(next);
    next += 1;
  }

  const products: SheetProduct[] = [];
  for (const row of reviewRows) {
    if (row.status !== "valid" || row.id === null) continue;
    const price = rowPrices.get(row);
    products.push(price === undefined
      ? { id: row.id, name: row.name, layoutCode: row.layoutCode }
      : { id: row.id, name: row.name, price, layoutCode: row.layoutCode });
  }

  const usedShelves = new Set(products.map((product) => product.layoutCode.split("/").slice(0, 2).join("/")));
  const shelvesUsed = shelves.filter((element) => usedShelves.has(shelfCode(element))).length;
  const shelvesWithoutProducts = shelves.length - shelvesUsed;

  return {
    products,
    rows: reviewRows,
    errors: reviewRows.flatMap((row) => row.errors),
    summary: {
      rows: reviewRows.length,
      valid: products.length,
      excluded: reviewRows.filter((row) => row.status === "excluded").length,
      shelvesUsed,
      shelvesWithoutProducts
    },
    overwrites: products.filter((product) => existingIds.has(product.id)).map((product) => product.id)
  };
}
