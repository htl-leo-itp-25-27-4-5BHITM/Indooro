/**
 * Import pipeline: format detection, column mapping, parsing, validation.
 *
 * Principles (see docs/IMPORT_FORMATS.md):
 *  - Raw values are never silently "fixed". Every conversion lands in provenance.transformations,
 *    every rejected row in provenance.issues (German, with up to 5 example row numbers).
 *  - Ambiguity blocks the import (mixed time formats, decimal commas without ";" delimiter, ...).
 */
import { sha256Hex } from "../core/hash";
import type {
  DataIssue,
  DataOrigin,
  ImportFormat,
  ImportProvenance,
  ReferencePoint,
  RssiSample,
  RunKind,
} from "../core/types";
import { parseCsv, stripBom } from "./csv";
import { IssueCollector, hasBlockingError } from "./issues";
import { RSSI_MAX, RSSI_MIN, missingReferencesIssue, validateSamples } from "./validate";

/* ------------------------------------------------------------------ */
/* Column mapping                                                      */
/* ------------------------------------------------------------------ */

export type TargetField = "t" | "beaconId" | "rssi" | "deviceId" | "refX" | "refY" | "refLabel" | "runName" | "kind";
export type ColumnMapping = { [K in TargetField]?: string };

export const REQUIRED_FIELDS: TargetField[] = ["t", "beaconId", "rssi"];

/** Synonyms in normalised form (lower case, umlauts transliterated, only [a-z0-9]). Order = priority. */
const SYNONYMS: Record<TargetField, string[]> = {
  t: ["t", "timestamp", "time", "zeit", "ts", "zeitstempel", "zeitpunkt", "datetime"],
  beaconId: ["beaconid", "beacon", "beaconname", "name", "id"],
  rssi: ["rssi", "signal", "dbm", "signalstaerke", "signalstrength"],
  deviceId: ["deviceid", "device", "geraet", "geraeteid"],
  refX: ["refx", "xref", "truthx", "xtruth", "xm", "referenzx", "x"],
  refY: ["refy", "yref", "truthy", "ytruth", "ym", "referenzy", "y"],
  refLabel: ["reflabel", "marker", "label", "markierung", "referenzlabel"],
  runName: ["runname", "run", "lauf", "laufname", "messlauf"],
  kind: ["kind", "runkind", "laufart", "lauftyp"],
};

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

/** Case-insensitive synonym matching. Each source column is used at most once. */
export function suggestColumnMapping(header: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<number>();
  const normalized = header.map(normalizeName);
  (Object.keys(SYNONYMS) as TargetField[]).forEach((field) => {
    for (const syn of SYNONYMS[field]) {
      const idx = normalized.findIndex((h, i) => h === syn && !used.has(i));
      if (idx >= 0) {
        mapping[field] = header[idx];
        used.add(idx);
        return;
      }
    }
  });
  return mapping;
}

/* ------------------------------------------------------------------ */
/* Format detection & draft                                            */
/* ------------------------------------------------------------------ */

const JSONL_TYPES = new Set(["measurement", "truth", "layout", "scan", "step", "heading", "event"]);

export function detectFormat(fileName: string, text: string): ImportFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".jsonl") || lower.endsWith(".ndjson")) return "indooro-jsonl";
  const t = stripBom(text).trimStart();
  if (t.startsWith("{")) {
    const nl = t.indexOf("\n");
    const first = nl >= 0 ? t.slice(0, nl) : t;
    try {
      const o = JSON.parse(first) as unknown;
      if (o && typeof o === "object" && !Array.isArray(o)) {
        const type = (o as Record<string, unknown>).type;
        if (typeof type === "string" && JSONL_TYPES.has(type)) return "indooro-jsonl";
      }
    } catch {
      /* not a single-line object: regular JSON */
    }
    return "json";
  }
  if (t.startsWith("[") || lower.endsWith(".json")) return "json";
  return "csv";
}

export interface ImportDraft {
  format: ImportFormat;
  fileName: string;
  header: string[];
  previewRows: string[][];
  mapping: ColumnMapping;
  requiredMissing: TargetField[];
  /** only for CSV: detected delimiter */
  delimiter?: string;
  /** set if the file could not be read at all */
  error?: string;
}

const PREVIEW_ROWS = 8;

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function jsonSampleRows(parsed: unknown): Record<string, unknown>[] | null {
  const arr = jsonSampleArray(parsed);
  return arr ? (arr.filter((r) => r && typeof r === "object" && !Array.isArray(r)) as Record<string, unknown>[]) : null;
}

function jsonSampleArray(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    if (Array.isArray(o.samples)) return o.samples;
    if (o.run && typeof o.run === "object" && Array.isArray((o.run as Record<string, unknown>).samples)) {
      return (o.run as Record<string, unknown>).samples as unknown[];
    }
  }
  return null;
}

export function prepareImport(fileName: string, text: string): ImportDraft {
  const format = detectFormat(fileName, text);
  if (format === "indooro-jsonl") {
    return { format, fileName, header: [], previewRows: [], mapping: {}, requiredMissing: [] };
  }
  if (format === "json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripBom(text));
    } catch (e) {
      return {
        format,
        fileName,
        header: [],
        previewRows: [],
        mapping: {},
        requiredMissing: [...REQUIRED_FIELDS],
        error: `JSON nicht lesbar: ${(e as Error).message}`,
      };
    }
    const rows = jsonSampleRows(parsed) ?? [];
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const r of rows.slice(0, 200)) {
      for (const k of Object.keys(r)) {
        if (!seen.has(k)) {
          seen.add(k);
          keys.push(k);
        }
      }
    }
    const mapping = suggestColumnMapping(keys);
    return {
      format,
      fileName,
      header: keys,
      previewRows: rows.slice(0, PREVIEW_ROWS).map((r) => keys.map((k) => cellToString(r[k]))),
      mapping,
      requiredMissing: REQUIRED_FIELDS.filter((f) => !mapping[f]),
    };
  }
  const csv = parseCsv(text);
  const mapping = suggestColumnMapping(csv.header);
  return {
    format: "csv",
    fileName,
    header: csv.header,
    previewRows: csv.rows.slice(0, PREVIEW_ROWS),
    mapping,
    requiredMissing: REQUIRED_FIELDS.filter((f) => !mapping[f]),
    delimiter: csv.delimiter,
  };
}

/* ------------------------------------------------------------------ */
/* Raw records produced by the format-specific parsers                 */
/* ------------------------------------------------------------------ */

interface RawSample {
  row: number;
  t: unknown;
  beaconId: unknown;
  rssi: unknown;
  deviceId?: string;
  source: string;
}
interface RawRef {
  row: number;
  t: unknown;
  x: unknown;
  y: unknown;
  label?: string;
  /** index into samples if the reference was read from a sample row (shares its time cell) */
  sampleIndex?: number;
}

interface ParsedFile {
  samples: RawSample[];
  refs: RawRef[];
  issues: DataIssue[];
  transformations: string[];
  totalRows: number;
  /** rows already rejected by the parser (e.g. unparsable JSON lines) */
  rejectedRows: number;
  convertDecimalComma: boolean;
  /** CSV/JSON long format repeats the reference on every beacon row: collapse identical repeats */
  collapseRepeatedRefs: boolean;
  columnMapping?: Record<string, string>;
  layoutInfo?: ImportOutcome["layoutInfo"];
  suggested?: ImportOutcome["suggested"];
}

/* ------------------------------------------------------------------ */
/* Outcome                                                             */
/* ------------------------------------------------------------------ */

export interface ImportOutcome {
  /** false => blocking errors, run must not be created */
  ok: boolean;
  samples: RssiSample[];
  references: ReferencePoint[];
  provenance: ImportProvenance;
  /** beacons found in the file but not in the campaign */
  unknownBeaconIds: string[];
  /** layout found inside an Indooro recording ("layout" line) – metadata only */
  layoutInfo?: { layoutId?: string; revision?: number; shopName?: string };
  /** hints found in the file (run name / kind column, declared origin) – the UI may pre-fill with them */
  suggested?: { runName?: string; kind?: RunKind; origin?: DataOrigin };
}

export type TimeFormatOption = "auto" | "epoch-s" | "epoch-ms" | "iso";

/* ------------------------------------------------------------------ */
/* Number & time cell parsing                                          */
/* ------------------------------------------------------------------ */

interface NumCtx {
  convertComma: boolean;
  converted: Map<string, number>;
  rejected: Map<string, { count: number; rows: number[] }>;
  minus: Map<string, number>;
}

const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const DECIMAL_COMMA = /^[+-]?\d+,\d+$/;

/** null = missing, NaN = invalid, otherwise the number. */
function parseNum(raw: unknown, field: string, row: number, ctx: NumCtx): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : NaN;
  if (typeof raw !== "string") return NaN;
  let s = raw.trim();
  if (s === "") return null;
  if (s.includes("−")) {
    s = s.replace(/−/g, "-");
    ctx.minus.set(field, (ctx.minus.get(field) ?? 0) + 1);
  }
  if (PLAIN_NUMBER.test(s)) return Number(s);
  if (DECIMAL_COMMA.test(s)) {
    if (ctx.convertComma) {
      ctx.converted.set(field, (ctx.converted.get(field) ?? 0) + 1);
      return Number(s.replace(",", "."));
    }
    const r = ctx.rejected.get(field) ?? { count: 0, rows: [] };
    r.count++;
    if (r.rows.length < 5) r.rows.push(row);
    ctx.rejected.set(field, r);
    return NaN;
  }
  return NaN;
}

type TimeKind = "epoch-ms" | "epoch-s" | "relative" | "iso";
const ISO_RE = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:?\d{2})?)?$/i;

const KIND_LABEL: Record<TimeKind, string> = {
  "epoch-ms": "Epoch-Millisekunden",
  "epoch-s": "Epoch-Sekunden",
  relative: "relative Sekunden",
  iso: "ISO-8601-Text",
};

interface TimeCell {
  /** "missing" | "invalid" | a kind */
  kind: TimeKind | "missing" | "invalid";
  value: number;
  /** ISO without time zone: UTC assumed */
  assumedUtc?: boolean;
}

function classifyTime(raw: unknown, row: number, fmt: TimeFormatOption, ctx: NumCtx): TimeCell {
  const num = parseNum(raw, "t", row, ctx);
  if (num === null) return { kind: "missing", value: NaN };
  if (!Number.isNaN(num)) {
    if (fmt === "iso") return { kind: "invalid", value: NaN };
    if (fmt === "epoch-s") return { kind: "epoch-s", value: num };
    if (fmt === "epoch-ms") return { kind: "epoch-ms", value: num };
    const a = Math.abs(num);
    if (a > 1e11) return { kind: "epoch-ms", value: num };
    if (a >= 1e8) return { kind: "epoch-s", value: num };
    return { kind: "relative", value: num };
  }
  if (typeof raw === "string" && (fmt === "auto" || fmt === "iso")) {
    const m = ISO_RE.exec(raw.trim());
    if (m) {
      const [, date, time, zone] = m;
      const assumedUtc = !zone;
      const iso = `${date}T${time ?? "00:00:00"}${zone ?? "Z"}`;
      const ms = Date.parse(iso);
      if (Number.isFinite(ms)) return { kind: "iso", value: ms / 1000, assumedUtc };
    }
  }
  return { kind: "invalid", value: NaN };
}

/* ------------------------------------------------------------------ */
/* CSV / JSON parsers                                                  */
/* ------------------------------------------------------------------ */

function mappingToRecord(m: ColumnMapping): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(m)) if (v) out[k] = v;
  return out;
}

const KIND_ALIASES: Record<string, RunKind> = {
  stationary: "stationary",
  stationaer: "stationary",
  stationär: "stationary",
  statisch: "stationary",
  stehen: "stationary",
  walk: "walk",
  gehen: "walk",
  lauf: "walk",
  dynamisch: "walk",
};

class MetaCollector {
  runNames = new Set<string>();
  kinds = new Set<RunKind>();
  firstRunName?: string;
  firstKind?: RunKind;
  add(runName: unknown, kind: unknown): void {
    if (typeof runName === "string" && runName.trim()) {
      this.runNames.add(runName.trim());
      this.firstRunName ??= runName.trim();
    }
    if (typeof kind === "string") {
      const k = KIND_ALIASES[kind.trim().toLowerCase()];
      if (k) {
        this.kinds.add(k);
        this.firstKind ??= k;
      }
    }
  }
  finish(issues: DataIssue[]): ImportOutcome["suggested"] {
    if (this.runNames.size > 1) {
      issues.push({
        severity: "warning",
        code: "multiple-runs-in-file",
        count: this.runNames.size,
        message:
          `Die Datei enthält ${this.runNames.size} verschiedene Lauf-Namen (${[...this.runNames].slice(0, 5).join(", ")}). ` +
          `Alle Zeilen werden in EINEN Lauf importiert – bei getrennten Läufen die Datei vorher aufteilen.`,
      });
    }
    if (this.kinds.size > 1) {
      issues.push({
        severity: "warning",
        code: "mixed-run-kinds",
        message: "Die Datei mischt Lauf-Arten (stationär und Gehen) – bitte getrennt importieren.",
      });
    }
    const s: NonNullable<ImportOutcome["suggested"]> = {};
    if (this.firstRunName) s.runName = this.firstRunName;
    if (this.firstKind) s.kind = this.firstKind;
    return Object.keys(s).length > 0 ? s : undefined;
  }
}

interface Table {
  count: number;
  cell(i: number, column: string): unknown;
  rowNumber(i: number): number;
  hasColumn(column: string): boolean;
  rowLength?(i: number): number;
  columnCount?: number;
}

function parseTable(
  table: Table,
  mapping: ColumnMapping,
  defaultSource: string,
  convertDecimalComma: boolean,
): ParsedFile {
  const issues: DataIssue[] = [];
  const col = mapping;
  const samples: RawSample[] = [];
  const refs: RawRef[] = [];
  const meta = new MetaCollector();
  const coll = new IssueCollector();

  for (const f of REQUIRED_FIELDS) {
    if (!col[f]) {
      issues.push({
        severity: "error",
        code: "missing-column",
        message: `Pflichtfeld „${f}“ ist keiner Spalte zugeordnet. Bitte die Spaltenzuordnung ergänzen (Zeit, Beacon, RSSI).`,
      });
    } else if (!table.hasColumn(col[f]!)) {
      issues.push({
        severity: "error",
        code: "unknown-column",
        message: `Die zugeordnete Spalte „${col[f]}“ für „${f}“ existiert in der Datei nicht.`,
      });
    }
  }
  if (issues.length > 0) {
    return {
      samples,
      refs,
      issues,
      transformations: [],
      totalRows: table.count,
      rejectedRows: 0,
      convertDecimalComma,
      collapseRepeatedRefs: true,
      columnMapping: mappingToRecord(mapping),
    };
  }

  const get = (i: number, f: TargetField): unknown => (col[f] ? table.cell(i, col[f]!) : undefined);

  for (let i = 0; i < table.count; i++) {
    const row = table.rowNumber(i);
    if (table.rowLength && table.columnCount !== undefined && table.rowLength(i) !== table.columnCount) {
      coll.add(
        "ragged-row",
        "warning",
        row,
        (n) => `${n} Zeilen haben eine andere Spaltenanzahl als die Kopfzeile (fehlende Zellen gelten als leer).`,
      );
    }
    const device = get(i, "deviceId");
    samples.push({
      row,
      t: get(i, "t"),
      beaconId: get(i, "beaconId"),
      rssi: get(i, "rssi"),
      deviceId: typeof device === "string" && device.trim() ? device.trim() : typeof device === "number" ? String(device) : undefined,
      source: defaultSource,
    });
    const rx = get(i, "refX");
    const ry = get(i, "refY");
    const hasX = rx !== undefined && rx !== null && String(rx).trim() !== "";
    const hasY = ry !== undefined && ry !== null && String(ry).trim() !== "";
    if (hasX || hasY) {
      const label = get(i, "refLabel");
      refs.push({
        row,
        t: get(i, "t"),
        x: rx,
        y: ry,
        label: typeof label === "string" && label.trim() ? label.trim() : undefined,
        sampleIndex: samples.length - 1,
      });
    }
    meta.add(get(i, "runName"), get(i, "kind"));
  }

  const out = coll.toIssues();
  const suggested = meta.finish(out);
  return {
    samples,
    refs,
    issues: out,
    transformations: [],
    totalRows: table.count,
    rejectedRows: 0,
    convertDecimalComma,
    collapseRepeatedRefs: true,
    columnMapping: mappingToRecord(mapping),
    suggested,
  };
}

function parseCsvFile(text: string, mapping: ColumnMapping | undefined): ParsedFile {
  const csv = parseCsv(text);
  const effective = mapping ?? suggestColumnMapping(csv.header);
  const index = new Map<string, number>();
  csv.header.forEach((h, i) => {
    if (!index.has(h)) index.set(h, i);
  });
  const table: Table = {
    count: csv.rows.length,
    cell: (i, column) => {
      const idx = index.get(column);
      return idx === undefined ? undefined : csv.rows[i][idx];
    },
    rowNumber: (i) => csv.lineNumbers[i],
    hasColumn: (c) => index.has(c),
    rowLength: (i) => csv.rows[i].length,
    columnCount: csv.header.length,
  };
  const parsed = parseTable(table, effective, "csv", csv.delimiter === ";");
  if (csv.header.length === 0) {
    parsed.issues.unshift({ severity: "error", code: "empty-file", message: "Die Datei ist leer oder enthält keine Kopfzeile." });
  } else {
    parsed.transformations.unshift(
      `CSV gelesen: Trennzeichen ${csv.delimiter === "\t" ? "Tabulator" : `„${csv.delimiter}“`} automatisch erkannt.`,
    );
  }
  return parsed;
}

function refFromJson(r: Record<string, unknown>, row: number): RawRef {
  const pos = r.position && typeof r.position === "object" ? (r.position as Record<string, unknown>) : undefined;
  const label = r.label ?? r.refLabel ?? r.marker;
  return {
    row,
    t: r.t ?? r.time ?? r.timestamp,
    x: r.x ?? r.refX ?? pos?.x,
    y: r.y ?? r.refY ?? pos?.y,
    label: typeof label === "string" && label.trim() ? label.trim() : undefined,
  };
}

function parseJsonFile(text: string, mapping: ColumnMapping | undefined): ParsedFile {
  const fail = (message: string, code = "json-invalid"): ParsedFile => ({
    samples: [],
    refs: [],
    issues: [{ severity: "error", code, message }],
    transformations: [],
    totalRows: 0,
    rejectedRows: 0,
    convertDecimalComma: false,
    collapseRepeatedRefs: false,
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripBom(text));
  } catch (e) {
    return fail(`JSON nicht lesbar: ${(e as Error).message}`, "json-parse-error");
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const o = parsed as Record<string, unknown>;
    if (o.schema === "indooro-positioning-lab/campaign-bundle") {
      return fail(
        "Dies ist ein Kampagnen-Bundle (kompletter Export einer Kampagne), keine Messdatei. " +
          "Bitte über „Kampagne importieren“ laden.",
        "wrong-file-kind",
      );
    }
  }
  const root =
    parsed && typeof parsed === "object" && !Array.isArray(parsed) && (parsed as Record<string, unknown>).run &&
    typeof (parsed as Record<string, unknown>).run === "object"
      ? ((parsed as Record<string, unknown>).run as Record<string, unknown>)
      : parsed;
  const sampleArr = jsonSampleArray(root);
  if (!sampleArr) {
    return fail(
      'JSON hat nicht das erwartete Format: erwartet wird ein Array von Zeilen-Objekten oder { "samples": [...], "references": [...] }.',
      "json-shape",
    );
  }
  const rows = sampleArr.map((r, i) => ({ r, i }));
  const objects = rows.filter((x) => x.r && typeof x.r === "object" && !Array.isArray(x.r)) as {
    r: Record<string, unknown>;
    i: number;
  }[];
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const { r } of objects.slice(0, 200)) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
    }
  }
  const effective = mapping ?? suggestColumnMapping(keys);
  const table: Table = {
    count: objects.length,
    cell: (i, column) => objects[i].r[column],
    rowNumber: (i) => objects[i].i + 1,
    hasColumn: (c) => seen.has(c),
  };
  const result = parseTable(table, effective, "json", false);
  // per-sample "source" field of the lab's own export
  objects.forEach(({ r }, i) => {
    if (typeof r.source === "string" && r.source && result.samples[i]) result.samples[i].source = r.source;
  });
  const notObjects = rows.length - objects.length;
  if (notObjects > 0) {
    result.issues.push({
      severity: "warning",
      code: "json-non-object-rows",
      count: notObjects,
      message: `${notObjects} Einträge im Array sind keine Objekte und wurden verworfen.`,
    });
    result.rejectedRows += notObjects;
    result.totalRows += notObjects;
  }
  // separate "references" array (Indooro Lab JSON)
  const refArr = root && typeof root === "object" && !Array.isArray(root) ? (root as Record<string, unknown>).references : undefined;
  if (Array.isArray(refArr)) {
    refArr.forEach((r, i) => {
      if (r && typeof r === "object" && !Array.isArray(r)) {
        result.refs.push(refFromJson(r as Record<string, unknown>, i + 1));
      } else {
        result.rejectedRows++;
      }
    });
    result.totalRows += refArr.length;
  }
  if (root && typeof root === "object" && !Array.isArray(root)) {
    const o = root as Record<string, unknown>;
    result.suggested = { ...(result.suggested ?? {}) };
    if (typeof o.runName === "string" && o.runName) result.suggested.runName = o.runName;
    if (typeof o.name === "string" && o.name && !result.suggested.runName) result.suggested.runName = o.name;
    if (typeof o.kind === "string" && KIND_ALIASES[o.kind.toLowerCase()]) result.suggested.kind = KIND_ALIASES[o.kind.toLowerCase()];
    if (o.origin === "synthetic" || o.origin === "real") result.suggested.origin = o.origin;
    if (Object.keys(result.suggested).length === 0) result.suggested = undefined;
    // top-level deviceId applies to samples without their own
    if (typeof o.deviceId === "string" && o.deviceId) {
      for (const s of result.samples) s.deviceId ??= o.deviceId as string;
    }
  }
  // JSON without explicit references array: references are collapsed rows (long format); lab refs are not repeated
  result.collapseRepeatedRefs = true;
  return result;
}

/* ------------------------------------------------------------------ */
/* Indooro recording (JSON Lines)                                      */
/* ------------------------------------------------------------------ */

function parseJsonlFile(text: string): ParsedFile {
  const lines = stripBom(text).split(/\r?\n/);
  const samples: RawSample[] = [];
  const refs: RawRef[] = [];
  const coll = new IssueCollector();
  const counts: Record<string, number> = {};
  const scanPairs = new Map<string, number>();
  let scanCount = 0;
  let total = 0;
  let rejected = 0;
  let layoutInfo: ImportOutcome["layoutInfo"];
  const layoutVariants = new Set<string>();

  lines.forEach((line, idx) => {
    if (line.trim() === "") return;
    total++;
    const row = idx + 1;
    let o: Record<string, unknown>;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("kein Objekt");
      o = parsed as Record<string, unknown>;
    } catch {
      rejected++;
      coll.add("jsonl-parse-error", "warning", row, (n) => `${n} Zeilen sind kein gültiges JSON-Objekt und wurden verworfen.`);
      return;
    }
    const type = typeof o.type === "string" ? o.type : "";
    counts[type || "(ohne type)"] = (counts[type || "(ohne type)"] ?? 0) + 1;
    switch (type) {
      case "measurement": {
        const b = o.beacon;
        samples.push({
          row,
          t: o.t,
          beaconId: typeof b === "string" ? b : typeof b === "number" ? String(b) : null,
          rssi: o.rssi,
          source: typeof o.source === "string" && o.source ? o.source : "rssi",
        });
        break;
      }
      case "truth":
        refs.push({ row, t: o.t, x: o.x, y: o.y });
        break;
      case "layout": {
        const info = {
          layoutId: typeof o.layoutId === "string" ? o.layoutId : undefined,
          revision: typeof o.revision === "number" ? o.revision : undefined,
          shopName: typeof o.shopName === "string" ? o.shopName : undefined,
        };
        layoutVariants.add(JSON.stringify(info));
        layoutInfo ??= Object.fromEntries(Object.entries(info).filter(([, v]) => v !== undefined));
        break;
      }
      case "scan": {
        scanCount++;
        const key = `${String(o.major)}-${String(o.minor)}`;
        scanPairs.set(key, (scanPairs.get(key) ?? 0) + 1);
        break;
      }
      case "step":
      case "heading":
      case "event":
        break;
      default:
        coll.add("unknown-line-type", "info", row, (n) => `${n} Zeilen mit unbekanntem oder fehlendem „type“ wurden ignoriert.`);
    }
  });

  const issues = coll.toIssues();
  if (scanCount > 0) {
    const pairs = [...scanPairs.entries()].map(([k, n]) => `${k} (${n}×)`);
    issues.push({
      severity: "info",
      code: "unmatched-ibeacon",
      count: scanCount,
      message:
        `Nicht zugeordnete iBeacons (unmatched iBeacon major-minor): ${pairs.slice(0, 5).join(", ")}${pairs.length > 5 ? ", …" : ""} – ` +
        `${scanCount} Scan-Zeilen. Sie gehören zu keinem Beacon des Layouts und wurden nicht als Messwerte übernommen.`,
    });
  }
  const ignored = (["step", "heading", "event"] as const).filter((k) => counts[k]);
  if (ignored.length > 0) {
    issues.push({
      severity: "info",
      code: "ignored-lines",
      count: ignored.reduce((a, k) => a + counts[k], 0),
      message:
        `Ignoriert (nicht relevant für die RSSI-Auswertung): ${ignored.map((k) => `${counts[k]}× ${k}`).join(", ")}.`,
    });
  }
  if (layoutVariants.size > 1) {
    issues.push({
      severity: "warning",
      code: "layout-changed",
      count: layoutVariants.size,
      message: "Die Aufzeichnung enthält mehrere unterschiedliche Layout-Zeilen (Layout wurde während der Aufnahme gewechselt?). Es wird nur die erste verwendet.",
    });
  }
  return {
    samples,
    refs,
    issues,
    transformations: [
      "Indooro-Aufzeichnung (JSON Lines) gelesen: „measurement“ → RSSI-Messwerte, „truth“ → Referenzpunkte (Langdruck-Markierungen in Layout-Einheiten).",
    ],
    totalRows: total,
    rejectedRows: rejected,
    convertDecimalComma: false,
    collapseRepeatedRefs: false,
    layoutInfo,
  };
}

/* ------------------------------------------------------------------ */
/* Finalisation: numbers, time, rejection, ordering, validation        */
/* ------------------------------------------------------------------ */

export async function runImport(args: {
  fileName: string;
  text: string;
  mapping?: ColumnMapping;
  knownBeaconIds: string[];
  timeFormat?: TimeFormatOption;
}): Promise<ImportOutcome> {
  const { fileName, text, knownBeaconIds } = args;
  const timeFormat: TimeFormatOption = args.timeFormat ?? "auto";
  const format = detectFormat(fileName, text);
  const sha256 = await sha256Hex(text);

  const parsed =
    format === "indooro-jsonl"
      ? parseJsonlFile(text)
      : format === "json"
        ? parseJsonFile(text, args.mapping)
        : parseCsvFile(text, args.mapping);

  const issues: DataIssue[] = [...parsed.issues];
  const transformations = [...parsed.transformations];
  const makeProvenance = (acceptedRows: number, rejectedRows: number): ImportProvenance => {
    const p: ImportProvenance = {
      fileName,
      format,
      importedAt: new Date().toISOString(),
      sha256,
      totalRows: parsed.totalRows,
      acceptedRows,
      rejectedRows,
      transformations,
      issues,
    };
    if (parsed.columnMapping) p.columnMapping = parsed.columnMapping;
    return p;
  };
  const failed = (): ImportOutcome => ({
    ok: false,
    samples: [],
    references: [],
    provenance: makeProvenance(0, parsed.rejectedRows),
    unknownBeaconIds: [],
    layoutInfo: parsed.layoutInfo,
    suggested: parsed.suggested,
  });

  if (hasBlockingError(issues)) return failed();

  const ctx: NumCtx = { convertComma: parsed.convertDecimalComma, converted: new Map(), rejected: new Map(), minus: new Map() };

  // ---- 1. time classification over samples AND references (one format per file)
  const sampleTimes = parsed.samples.map((s) => classifyTime(s.t, s.row, timeFormat, ctx));
  const refTimes = parsed.refs.map((r) =>
    r.sampleIndex !== undefined ? sampleTimes[r.sampleIndex] : classifyTime(r.t, r.row, timeFormat, ctx),
  );
  const kindCounts = new Map<TimeKind, number>();
  const kindRows = new Map<TimeKind, number[]>();
  const tally = (cells: TimeCell[], rows: number[]) => {
    cells.forEach((c, i) => {
      if (c.kind === "missing" || c.kind === "invalid") return;
      kindCounts.set(c.kind, (kindCounts.get(c.kind) ?? 0) + 1);
      const l = kindRows.get(c.kind) ?? [];
      if (l.length < 5) l.push(rows[i]);
      kindRows.set(c.kind, l);
    });
  };
  tally(sampleTimes, parsed.samples.map((s) => s.row));
  tally(
    refTimes.filter((_, i) => parsed.refs[i].sampleIndex === undefined),
    parsed.refs.filter((r) => r.sampleIndex === undefined).map((r) => r.row),
  );

  if (kindCounts.size > 1) {
    const parts = [...kindCounts.entries()].map(([k, n]) => `${n}× ${KIND_LABEL[k]} (z. B. Zeile ${kindRows.get(k)!.join(", ")})`);
    issues.push({
      severity: "error",
      code: "mixed-time-formats",
      count: kindCounts.size,
      message:
        `Die Zeitspalte mischt Formate: ${parts.join("; ")}. Der Import ist blockiert, weil die Zeitbasis sonst falsch wäre. ` +
        `Bitte die Datei bereinigen oder unter „Zeitformat“ ein Format erzwingen.`,
    });
    return failed();
  }
  const timeKind: TimeKind | undefined = [...kindCounts.keys()][0];
  let assumedUtcCount = 0;
  const toSeconds = (c: TimeCell): number => {
    if (c.kind === "epoch-ms") return c.value / 1000;
    if (c.assumedUtc) assumedUtcCount++;
    return c.value;
  };

  // ---- 2. samples: reject invalid rows (reported, never kept)
  const coll = new IssueCollector();
  const samples: RssiSample[] = [];
  for (let i = 0; i < parsed.samples.length; i++) {
    const raw = parsed.samples[i];
    const tc = sampleTimes[i];
    const beacon = typeof raw.beaconId === "string" ? raw.beaconId.trim() : "";
    const rssi = parseNum(raw.rssi, "rssi", raw.row, ctx);
    if (tc.kind === "missing" || beacon === "" || rssi === null) {
      coll.add("missing-value", "warning", raw.row, (n) => `${n} Zeilen mit fehlenden Werten (Zeit, Beacon oder RSSI leer) wurden verworfen.`);
      continue;
    }
    if (tc.kind === "invalid") {
      coll.add(
        "invalid-timestamp",
        "warning",
        raw.row,
        (n) => `${n} Zeilen mit nicht lesbarem Zeitstempel wurden verworfen (erwartet: Zahl in Sekunden/Millisekunden oder ISO-8601).`,
      );
      continue;
    }
    if (Number.isNaN(rssi)) {
      coll.add("rssi-not-numeric", "warning", raw.row, (n) => `${n} Zeilen mit nicht-numerischem RSSI (Text, „NaN“ o. Ä.) wurden verworfen.`);
      continue;
    }
    if (rssi < RSSI_MIN || rssi > RSSI_MAX) {
      coll.add(
        "rssi-out-of-range",
        "warning",
        raw.row,
        (n) =>
          `${n} Zeilen mit RSSI außerhalb von ${RSSI_MIN} bis ${RSSI_MAX} dBm wurden verworfen ` +
          `(RSSI 0 bedeutet bei CoreLocation „unbekannt“, positive Werte sind unplausibel).`,
      );
      continue;
    }
    const s: RssiSample = { t: toSeconds(tc), beaconId: beacon, rssi, source: raw.source, sourceRow: raw.row };
    if (raw.deviceId) s.deviceId = raw.deviceId;
    samples.push(s);
  }

  // ---- 3. references
  let references: ReferencePoint[] = [];
  const refColl = new IssueCollector();
  for (let i = 0; i < parsed.refs.length; i++) {
    const raw = parsed.refs[i];
    const tc = refTimes[i];
    const x = parseNum(raw.x, "refX", raw.row, ctx);
    const y = parseNum(raw.y, "refY", raw.row, ctx);
    if (tc.kind === "missing" || tc.kind === "invalid" || x === null || y === null || Number.isNaN(x) || Number.isNaN(y)) {
      refColl.add(
        "reference-invalid",
        "warning",
        raw.row,
        (n) => `${n} Referenzpunkte mit fehlender/ungültiger Zeit oder Position (x, y) wurden verworfen.`,
      );
      continue;
    }
    const r: ReferencePoint = { t: toSeconds(tc), position: { x, y }, sourceRow: raw.row };
    if (raw.label) r.label = raw.label;
    references.push(r);
  }
  issues.push(...coll.toIssues(), ...refColl.toIssues());

  // ---- 4. decimal comma / unicode minus reports
  for (const [field, n] of ctx.converted) {
    issues.push({
      severity: "info",
      code: "decimal-comma-converted",
      count: n,
      message:
        `Spalte „${field}“: ${n} Werte mit Dezimalkomma wurden in Dezimalpunkt umgewandelt (Trennzeichen „;“, deutsches Zahlenformat). ` +
        `Stichprobe prüfen.`,
    });
    transformations.push(`Dezimalkomma → Dezimalpunkt in Feld „${field}“ (${n} Werte, Trennzeichen „;“).`);
  }
  for (const [field, r] of ctx.rejected) {
    issues.push({
      severity: "error",
      code: "decimal-comma-unconverted",
      count: r.count,
      rows: r.rows,
      message:
        `Feld „${field}“: ${r.count} Werte enthalten ein Dezimalkomma (z. B. „−72,5“), das Trennzeichen der Datei ist aber nicht „;“. ` +
        `Eine automatische Umwandlung wäre mehrdeutig und unterbleibt (z. B. Zeile ${r.rows.join(", ")}). ` +
        `Bitte mit Semikolon als Trennzeichen exportieren oder Dezimalpunkte verwenden.`,
    });
  }
  for (const [field, n] of ctx.minus) {
    transformations.push(`Unicode-Minuszeichen „−“ → „-“ in Feld „${field}“ (${n} Werte).`);
  }

  // ---- 5. time transformations
  if (timeKind === "epoch-ms") transformations.push("Zeitstempel: Epoch-Millisekunden → Sekunden (÷ 1000).");
  if (timeKind === "iso") {
    transformations.push("Zeitstempel: ISO-8601-Text → Epoch-Sekunden.");
    if (assumedUtcCount > 0) {
      transformations.push(`ISO-Zeitstempel ohne Zeitzone (${assumedUtcCount} Werte): UTC angenommen.`);
    }
  }
  if (timeKind === "relative") {
    issues.push({
      severity: "info",
      code: "relative-time",
      message: "Zeitstempel wurden als relative Sekunden (seit Messbeginn) interpretiert; es gibt keinen absoluten Zeitbezug.",
    });
  }

  // ---- 6. rejection accounting
  const accepted = samples.length + references.length;
  const rejectedRows = parsed.rejectedRows + (parsed.samples.length - samples.length) + (parsed.refs.length - references.length);
  if (rejectedRows > 0) {
    transformations.push(`${rejectedRows} ungültige Zeilen verworfen (Details unter Hinweise).`);
  }
  const rejectedFrac = parsed.samples.length > 0 ? (parsed.samples.length - samples.length) / parsed.samples.length : 0;
  if (rejectedFrac > 0.2 && samples.length > 0) {
    issues.push({
      severity: "warning",
      code: "many-rows-rejected",
      message: `${(rejectedFrac * 100).toFixed(0)} % der Messzeilen wurden verworfen – Format und Spaltenzuordnung prüfen.`,
    });
  }
  if (samples.length === 0) {
    issues.push({
      severity: "error",
      code: "no-valid-samples",
      message: "Keine einzige gültige Messzeile gefunden – der Import wird nicht angelegt. Spaltenzuordnung, Zeitformat und Dezimaltrennzeichen prüfen.",
    });
    return { ...failed(), provenance: makeProvenance(0, rejectedRows) };
  }

  // ---- 7. validation (reports), then documented ordering / duplicate removal
  issues.push(...validateSamples(samples, knownBeaconIds));

  let ordered = samples;
  let unsorted = false;
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].t < ordered[i - 1].t) {
      unsorted = true;
      break;
    }
  }
  if (unsorted) {
    ordered = samples.slice().sort((a, b) => a.t - b.t);
    transformations.push(`${samples.length} Messwerte stabil nach Zeitstempel aufsteigend sortiert (Eingabe war unsortiert).`);
  }
  const seen = new Set<string>();
  const deduped: RssiSample[] = [];
  for (const s of ordered) {
    const key = `${s.t}|${s.beaconId}|${s.rssi}|${s.deviceId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(s);
  }
  if (deduped.length < ordered.length) {
    transformations.push(`${ordered.length - deduped.length} exakte Duplikate (gleiche Zeit, Beacon, RSSI, Gerät) entfernt; jeweils erstes Vorkommen behalten.`);
  }

  // references: collapse exact repeats (long format repeats the reference on every beacon row), sort
  if (parsed.collapseRepeatedRefs && references.length > 0) {
    const refSeen = new Set<string>();
    const collapsed: ReferencePoint[] = [];
    for (const r of references) {
      const key = `${r.t}|${r.position.x}|${r.position.y}|${r.label ?? ""}`;
      if (refSeen.has(key)) continue;
      refSeen.add(key);
      collapsed.push(r);
    }
    if (collapsed.length < references.length) {
      transformations.push(
        `${references.length - collapsed.length} identische Referenz-Wiederholungen (gleiche Zeit/Position in mehreren Messzeilen) zu je einem Referenzpunkt zusammengefasst.`,
      );
    }
    references = collapsed;
  }
  let refUnsorted = false;
  for (let i = 1; i < references.length; i++) {
    if (references[i].t < references[i - 1].t) {
      refUnsorted = true;
      break;
    }
  }
  if (refUnsorted) {
    references = references.slice().sort((a, b) => a.t - b.t);
    transformations.push("Referenzpunkte stabil nach Zeit sortiert (Eingabe war unsortiert).");
    issues.push({ severity: "warning", code: "reference-unsorted", message: "Referenzpunkte waren zeitlich nicht sortiert; sie wurden sortiert (siehe Transformationen)." });
  }
  if (references.length === 0) issues.push(missingReferencesIssue());

  const unknown = [...new Set(deduped.map((s) => s.beaconId))].filter((id) => !knownBeaconIds.includes(id)).sort();

  const ok = !hasBlockingError(issues);
  return {
    ok,
    samples: deduped,
    references,
    provenance: makeProvenance(accepted, rejectedRows),
    unknownBeaconIds: unknown,
    layoutInfo: parsed.layoutInfo,
    suggested: parsed.suggested,
  };
}
