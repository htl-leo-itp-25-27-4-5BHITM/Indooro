import { isMobileElementId, type LayoutDocument, type LayoutElement } from "./model";

/**
 * Imports `beacons-plan.csv` written by scripts/beacon-planner/outputs.py (write_csv) as beacon elements.
 * The element shape mirrors write_layout_patch: placeholder identities, never real hardware.
 */

export const PLAN_CSV_HEADER = ["minor", "x_m", "y_m", "mount", "notes"] as const;
export const PLAN_MAX_ROWS = 500;
export const PLAN_MAX_BYTES = 1_000_000;
/** iBeacon minor is an unsigned 16-bit value. */
export const PLAN_MAX_MINOR = 65535;
export const PLACEHOLDER_BEACON_UUID = "00000000-0000-0000-0000-000000000000";
const ELEMENT_LIMIT = 5000;

export interface PlanBeacon { minor: number; x: number; y: number; mount: string; notes: string }
export interface PlanParseResult { beacons: PlanBeacon[]; errors: string[] }
/** `errors` block the import; `skipped` lists placeholder IDs that already exist in the layout. */
export interface PlanElementsResult { elements: LayoutElement[]; errors: string[]; skipped: string[] }

interface CsvRecord { line: number; fields: string[] }

/** RFC 4180 records: quoted fields may contain commas, doubled quotes and line breaks. A leading BOM is dropped. */
function parseCsvRecords(text: string): { records: CsvRecord[]; unterminatedLine: number | null } {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let quoteLine = 0;
  let line = 1;
  let recordLine = 1;
  const endField = () => { fields.push(field); field = ""; };
  const endRecord = () => { endField(); records.push({ line: recordLine, fields }); fields = []; };
  for (let i = 0; i < source.length;) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === "\"") {
        if (source[i + 1] === "\"") { field += "\""; i += 2; continue; }
        inQuotes = false;
        i++;
        continue;
      }
      if (ch === "\n") line++;
      field += ch;
      i++;
      continue;
    }
    if (ch === "\"" && field === "") { inQuotes = true; quoteLine = line; i++; continue; }
    if (ch === ",") { endField(); i++; continue; }
    if (ch === "\r" || ch === "\n") {
      endRecord();
      i += ch === "\r" && source[i + 1] === "\n" ? 2 : 1;
      line++;
      recordLine = line;
      continue;
    }
    field += ch;
    i++;
  }
  if (inQuotes) return { records, unterminatedLine: quoteLine };
  if (field !== "" || fields.length > 0) endRecord();
  return { records, unterminatedLine: null };
}

const isBlankRecord = (record: CsvRecord) => record.fields.every((value) => value.trim() === "");

export function parsePlanCsv(text: string): PlanParseResult {
  if (new TextEncoder().encode(text).byteLength > PLAN_MAX_BYTES) return { beacons: [], errors: ["Die Datei ist größer als 1 MB."] };
  const { records, unterminatedLine } = parseCsvRecords(text);
  if (unterminatedLine !== null) return { beacons: [], errors: [`Zeile ${unterminatedLine}: Ein Anführungszeichen wird nicht geschlossen.`] };
  const rows = records.filter((record) => !isBlankRecord(record));
  if (!rows.length) return { beacons: [], errors: ["Die Datei ist leer."] };

  const [header, ...data] = rows;
  const headerOk = header.fields.length === PLAN_CSV_HEADER.length && header.fields.every((value, index) => value.trim() === PLAN_CSV_HEADER[index]);
  if (!headerOk) {
    return { beacons: [], errors: [`Zeile ${header.line}: Die Kopfzeile muss exakt „${PLAN_CSV_HEADER.join(",")}“ lauten.`] };
  }
  if (data.length > PLAN_MAX_ROWS) return { beacons: [], errors: [`Höchstens ${PLAN_MAX_ROWS} Beacons pro Datei (gefunden: ${data.length}).`] };

  const errors: string[] = [];
  const beacons: PlanBeacon[] = [];
  const minorLines = new Map<number, number>();
  const number = (raw: string) => {
    const value = raw.trim();
    if (!/^[+-]?\d+(\.\d+)?$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  for (const record of data) {
    const at = `Zeile ${record.line}`;
    if (record.fields.length !== PLAN_CSV_HEADER.length) {
      errors.push(`${at}: ${PLAN_CSV_HEADER.length} Spalten erwartet, gefunden ${record.fields.length}.`);
      continue;
    }
    const [rawMinor, rawX, rawY, rawMount, rawNotes] = record.fields;
    const minorText = rawMinor.trim();
    const minor = /^\d+$/.test(minorText) ? Number(minorText) : NaN;
    let rowOk = true;
    if (!Number.isSafeInteger(minor)) {
      errors.push(`${at}: minor muss eine ganze Zahl sein (gefunden „${minorText}“).`);
      rowOk = false;
    } else if (minor < 1 || minor > PLAN_MAX_MINOR) {
      errors.push(`${at}: minor muss zwischen 1 und ${PLAN_MAX_MINOR} liegen.`);
      rowOk = false;
    } else if (minorLines.has(minor)) {
      errors.push(`${at}: minor ${minor} ist bereits in Zeile ${minorLines.get(minor)} vergeben.`);
      rowOk = false;
    }
    const x = number(rawX);
    const y = number(rawY);
    if (x === null) { errors.push(`${at}: x_m ist keine endliche Zahl (Dezimalpunkt, z. B. 12.50).`); rowOk = false; }
    else if (x < 0) { errors.push(`${at}: x_m darf nicht negativ sein.`); rowOk = false; }
    if (y === null) { errors.push(`${at}: y_m ist keine endliche Zahl (Dezimalpunkt, z. B. 3.00).`); rowOk = false; }
    else if (y < 0) { errors.push(`${at}: y_m darf nicht negativ sein.`); rowOk = false; }
    if (!rowOk || x === null || y === null) continue;
    minorLines.set(minor, record.line);
    beacons.push({ minor, x, y, mount: rawMount.trim(), notes: rawNotes });
  }
  if (errors.length) return { beacons: [], errors };
  return { beacons, errors: [] };
}

const roundCentimetre = (value: number) => Math.round(value * 100) / 100;

/**
 * Beacon elements for the plan, shaped like write_layout_patch. IDs continue after the largest numeric ID.
 * Beacons outside the grid are errors (never clipped); beacons whose placeholder ID already exists are skipped.
 * The caller must not import when `errors` is non-empty.
 */
export function planToElements(document: LayoutDocument, beacons: PlanBeacon[]): PlanElementsResult {
  const errors: string[] = [];
  const skipped: string[] = [];
  const elements: LayoutElement[] = [];
  const { width, height } = document.gridSize;
  const placed = new Set(document.elements.filter((element) => element.type === "beacon").map((element) => element.beaconId));
  let nextId = Math.max(0, ...document.elements.map((element) => element.id).filter(isMobileElementId)) + 1;
  for (const beacon of beacons) {
    const beaconId = `Indooro${beacon.minor}`;
    if (placed.has(beaconId)) { skipped.push(beaconId); continue; }
    const x = roundCentimetre(beacon.x);
    const y = roundCentimetre(beacon.y);
    if (x > width || y > height) {
      errors.push(`minor ${beacon.minor}: Position x ${x} / y ${y} liegt außerhalb des Rasters ${width} × ${height}.`);
      continue;
    }
    elements.push({
      id: nextId++,
      type: "beacon",
      beaconId,
      beaconUUID: PLACEHOLDER_BEACON_UUID,
      beaconMajor: 1,
      beaconMinor: beacon.minor,
      x,
      y,
      meter: beacon.minor,
      category: `undefined/${beacon.minor}`,
    });
  }
  if (document.elements.length + elements.length > ELEMENT_LIMIT) {
    errors.push(`Höchstens ${ELEMENT_LIMIT} Elemente im Grundriss (vorhanden: ${document.elements.length}, neu: ${elements.length}).`);
  }
  if (errors.length) return { elements: [], errors, skipped };
  return { elements, errors, skipped };
}
