/**
 * CSV-Lesen für den Produktimport (Excel-Exporte). Reine Logik ohne Browser-Abhängigkeiten.
 * XLSX wird bewusst nicht unterstützt: Excel-Nutzer speichern als CSV.
 */

export type CsvSeparator = ";" | "," | "\t";

export interface ParsedCsv {
  separator: CsvSeparator;
  headers: string[];
  rows: string[][];
  /** Zeilennummer in der Datei je Datenzeile (Kopfzeile = 1). */
  lineNumbers: number[];
}

const SEPARATORS: readonly CsvSeparator[] = [";", ",", "\t"];
const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;

/** UTF-8 (streng, mit oder ohne BOM); bei ungültigen Bytes Fallback auf Windows-1252 (Excel unter Windows). */
export function decodeCsvBytes(bytes: Uint8Array): string {
  const hasBom = bytes.length >= 3 && bytes[0] === UTF8_BOM[0] && bytes[1] === UTF8_BOM[1] && bytes[2] === UTF8_BOM[2];
  const body = hasBom ? bytes.subarray(3) : bytes;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return new TextDecoder("windows-1252").decode(body);
  }
}

/** Trenner ist der häufigste der drei Kandidaten in der Kopfzeile außerhalb von Anführungszeichen; Standard ist `;`. */
function detectSeparator(text: string): CsvSeparator {
  const counts = new Map<CsvSeparator, number>(SEPARATORS.map((separator) => [separator, 0]));
  let inQuotes = false;
  for (const char of text) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && (char === "\n" || char === "\r")) {
      break;
    } else if (!inQuotes && (char === ";" || char === "," || char === "\t")) {
      counts.set(char, (counts.get(char) ?? 0) + 1);
    }
  }
  let best: CsvSeparator = ";";
  for (const separator of SEPARATORS) {
    if ((counts.get(separator) ?? 0) > (counts.get(best) ?? 0)) best = separator;
  }
  return best;
}

interface CsvRecord {
  fields: string[];
  line: number;
}

/**
 * RFC-4180-Parser mit Trennerkennung. Felder werden getrimmt, leere Zeilen übersprungen.
 * Wirft einen Fehler bei einem nicht geschlossenen Anführungszeichen.
 */
export function parseCsv(text: string): ParsedCsv {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const separator = detectSeparator(source);
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let quoteStartLine = 1;
  let line = 1;
  let recordLine = 1;

  const endRecord = () => {
    fields.push(field);
    if (fields.some((value) => value.trim() !== "")) {
      records.push({ fields: fields.map((value) => value.trim()), line: recordLine });
    }
    fields = [];
    field = "";
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === "\n") line += 1;
        field += char;
      }
      continue;
    }
    if (char === '"' && field.trim() === "") {
      inQuotes = true;
      quoteStartLine = line;
      field = "";
      continue;
    }
    if (char === separator) {
      fields.push(field);
      field = "";
      continue;
    }
    if (char === "\r" && source[index + 1] === "\n") continue;
    if (char === "\n" || char === "\r") {
      endRecord();
      line += 1;
      recordLine = line;
      continue;
    }
    field += char;
  }
  if (inQuotes) {
    throw new Error(`Anführungszeichen ab Zeile ${quoteStartLine} sind nicht geschlossen.`);
  }
  endRecord();

  const [header, ...data] = records;
  if (!header) return { separator, headers: [], rows: [], lineNumbers: [] };
  return {
    separator,
    headers: header.fields,
    rows: data.map((record) => record.fields),
    lineNumbers: data.map((record) => record.line)
  };
}
