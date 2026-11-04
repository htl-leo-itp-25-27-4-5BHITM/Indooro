/**
 * RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF/LF/CR, BOM) with delimiter auto-detection.
 *
 * The parser never interprets values (no number conversion, no decimal-comma handling) – that is
 * done explicitly in import.ts so that every conversion can be reported.
 */

export const CSV_DELIMITERS = [";", "\t", ","] as const;

export interface CsvParseResult {
  header: string[];
  /** data rows (header excluded); fully empty lines are skipped */
  rows: string[][];
  delimiter: string;
  /** 1-based file line on which each data row starts (parallel to `rows`) */
  lineNumbers: number[];
}

/** Removes a UTF-8 byte-order mark if present. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Detects the delimiter from the first non-empty line (outside quotes).
 * Highest count wins; ties prefer ";" over tab over ",". Falls back to ",".
 */
export function detectDelimiter(text: string): string {
  const counts: Record<string, number> = { ";": 0, "\t": 0, ",": 0 };
  let inQuotes = false;
  let seenContent = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      seenContent = true;
    } else if (!inQuotes && (c === "\n" || c === "\r")) {
      if (seenContent) break;
    } else if (!inQuotes && c in counts) {
      counts[c]++;
      seenContent = true;
    } else if (c !== " ") {
      seenContent = true;
    }
  }
  let best = ",";
  let bestCount = 0;
  for (const d of CSV_DELIMITERS) {
    if (counts[d] > bestCount) {
      best = d;
      bestCount = counts[d];
    }
  }
  return best;
}

export function parseCsv(input: string, forcedDelimiter?: string): CsvParseResult {
  const text = stripBom(input);
  const delimiter = forcedDelimiter ?? detectDelimiter(text);
  const all: string[][] = [];
  const lines: number[] = [];

  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldWasQuoted = false;
  let rowHadQuotes = false;
  let line = 1;
  let rowStartLine = 1;
  const n = text.length;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
    fieldWasQuoted = false;
  };
  const endRow = () => {
    endField();
    // skip fully empty lines (a single empty unquoted field)
    if (!(row.length === 1 && row[0] === "" && !rowHadQuotes)) {
      all.push(row);
      lines.push(rowStartLine);
    }
    row = [];
    rowHadQuotes = false;
  };

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      if (c === "\n") line++;
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field === "" && !fieldWasQuoted) {
      inQuotes = true;
      fieldWasQuoted = true;
      rowHadQuotes = true;
      i++;
    } else if (c === delimiter) {
      endField();
      i++;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      i++;
      endRow();
      line++;
      rowStartLine = line;
    } else {
      field += c;
      i++;
    }
  }
  // last row without trailing newline
  if (field !== "" || row.length > 0 || fieldWasQuoted) endRow();

  const header = (all[0] ?? []).map((h) => h.trim());
  return { header, rows: all.slice(1), delimiter, lineNumbers: lines.slice(1) };
}

/** Quotes a field for CSV output if necessary. */
export function csvEscape(value: string, delimiter = ","): string {
  if (value === "") return "";
  if (value.includes('"') || value.includes(delimiter) || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
