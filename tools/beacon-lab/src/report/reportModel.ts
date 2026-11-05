import { formatPercent } from "../core/units";
import type { Campaign, DataIssue, DataOrigin, DynamicMetrics, ErrorMetrics, EvaluationResult, MeasurementRun, PathLossModel } from "../core/types";
import { DYNAMIC_METRIC_DEFINITIONS, ERROR_METRIC_DEFINITIONS } from "../ui/components/metricDefinitions";
import { runHolds } from "../positioning/reference";
import {
  blockDefinition,
  DEFAULT_BLOCK_SEC,
  DEFAULT_ITERATIONS,
  DEFAULT_SEED,
  makeBlocks,
  metricsWithCI,
  MIN_BLOCKS_FOR_CI,
  type BootstrapCI,
  type MetricsWithCI,
  type ProportionCI,
} from "../positioning/uncertainty";

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

export interface RunQuality {
  issues: DataIssue[];
  evaluable: boolean;
  reasons: string[];
  perBeacon: { beaconId: string; count: number; rateHz: number; maxGapSec: number; known: boolean }[];
}

export interface ReportFigureInput {
  id: string;
  title: string;
  /** standalone SVG markup (sanitised before it is embedded in the HTML) */
  svg: string;
  caption: string;
}

export interface ReportInput {
  campaign: Campaign;
  runs: MeasurementRun[];
  results: EvaluationResult[];
  qualityByRun?: Record<string, RunQuality>;
  /** metrics for the common epoch subset; aligned with `results` order when lengths match */
  commonComparison?: { commonEpochs: number; common: ErrorMetrics[] };
  figures?: ReportFigureInput[];
  toolVersion: string;
  gitCommit?: string;
  /** free text written by the team – the only source of the interpretation section */
  interpretationNotes?: string;
  generatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

export interface ReportTable {
  caption?: string;
  headers: string[];
  rows: string[][];
  /** zero-based indices of right-aligned numeric columns */
  numericColumns?: number[];
  /** explanatory note below the table (e.g. which key the rows are sorted by) */
  note?: string;
}

export type ReportBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "kv"; rows: { key: string; value: string }[] }
  | { type: "table"; table: ReportTable }
  | { type: "figure"; id: string; /** running figure number (Abbildung N) */ number: number; title: string; svg: string; caption: string }
  | { type: "notice"; tone: "info" | "warning" | "synthetic"; text: string };

export interface ReportSection {
  id: string;
  number: number;
  title: string;
  blocks: ReportBlock[];
}

export interface ReportModel {
  title: string;
  campaignName: string;
  toolVersion: string;
  gitCommit: string | null;
  generatedAt: string;
  hasSynthetic: boolean;
  /** non-null iff at least one synthetic run is included */
  syntheticBanner: string | null;
  sections: ReportSection[];
  configHashes: string[];
}

export const REPORT_TITLE = "Indooro Positioning Lab – Messbericht";
export const SYNTHETIC_BANNER = "ENTHÄLT SYNTHETISCHE DATEN – KEINE MESSERGEBNISSE";
export const NO_INTERPRETATION = "Keine Interpretation erfasst.";
export const INTERPRETATION_LABEL = "Interpretation des Teams – keine automatische Schlussfolgerung";
export const EXPLORATORY_EPOCHS = 100;
export const MIN_RUNS_PER_CONDITION = 3;

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

const DASH = "–";

export const ORIGIN_TEXT: Record<DataOrigin, string> = { real: "ECHTDATEN", synthetic: "SYNTHETISCH" };
const KIND_TEXT = { stationary: "stationär", walk: "Laufweg" } as const;
const ROLE_TEXT = { calibration: "Kalibrierung", evaluation: "Auswertung" } as const;
const ALGORITHM_TEXT: Record<string, string> = {
  "strongest-beacon": "Stärkster Beacon",
  "weighted-centroid": "Gewichteter Schwerpunkt",
  trilateration: "Trilateration",
  "knn-fingerprint": "kNN-Fingerprint",
};
export const algorithmLabel = (id: string) => ALGORITHM_TEXT[id] ?? id;

function num(v: number | null | undefined, digits = 2, unit?: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return `${v.toFixed(digits)}${unit ? ` ${unit}` : ""}`;
}
function int(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? DASH : String(v);
}
function pct(v: number | null | undefined): string {
  return formatPercent(v, 1);
}
function formatValue(v: unknown): string {
  if (typeof v === "boolean") return v ? "ja" : "nein";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(10)));
  if (v === null || v === undefined) return DASH;
  return String(v);
}

/** Flattens a config object into dotted-key / value rows (all parameters, nothing omitted). */
export function flattenParams(obj: unknown, prefix = ""): { key: string; value: string }[] {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return [{ key: prefix, value: formatValue(Array.isArray(obj) ? obj.join(", ") : obj) }];
  const out: { key: string; value: string }[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) out.push(...flattenParams(v, key));
    else out.push({ key, value: formatValue(Array.isArray(v) ? v.join(", ") : v) });
  }
  return out;
}

function pathLossText(m: PathLossModel): string {
  const base = `RSSI(1 m) = ${num(m.rssiAt1m, 1)} dBm, Pfadverlust-Exponent n = ${num(m.pathLossExponent, 2)}`;
  const src = m.source === "fitted" ? "angepasst (Kalibrierung)" : m.source === "manual" ? "manuell eingegeben (nicht verifiziert)" : "Lab-Standardwert (NICHT kalibriert)";
  return `${base}; Quelle: ${src}`;
}

function runLabel(r: { runName: string; origin: DataOrigin }): string {
  return `${r.runName} [${ORIGIN_TEXT[r.origin]}]`;
}

/* ------------------------------------------------------------------ */
/* Uncertainty (confidence intervals)                                  */
/* ------------------------------------------------------------------ */

const ciCache = new WeakMap<EvaluationResult, { key: string; value: MetricsWithCI }>();

/** Block-bootstrap / Wilson intervals of one result (fixed seed, memoised per result object). */
export function resultUncertainty(result: EvaluationResult, campaign: Campaign, runs: MeasurementRun[]): MetricsWithCI {
  const scale = campaign.floorPlan.scale;
  const run = runs.find((r) => r.id === result.runId);
  const kind = run?.kind ?? "walk";
  const key = `${scale.confirmed}|${scale.metersPerUnit}|${kind}|${DEFAULT_SEED}|${DEFAULT_ITERATIONS}`;
  const hit = ciCache.get(result);
  if (hit && hit.key === key) return hit.value;
  const blocks = makeBlocks(result.estimates, { kind, holds: run ? runHolds(run) : [], blockSec: DEFAULT_BLOCK_SEC });
  const value = metricsWithCI(blocks, scale, { seed: DEFAULT_SEED, iterations: DEFAULT_ITERATIONS, blockDefinition: blockDefinition(kind, DEFAULT_BLOCK_SEC) });
  ciCache.set(result, { key, value });
  return value;
}

function ciText(c: BootstrapCI): string {
  if (c.estimate === null) return DASH;
  if (c.lo === null || c.hi === null) return `${num(c.estimate)} [n. b.]`;
  return `${num(c.estimate)} [${num(c.lo)} – ${num(c.hi)}]`;
}
function propText(p: ProportionCI): string {
  if (p.p === null) return DASH;
  if (p.lo === null || p.hi === null) return pct(p.p);
  return `${pct(p.p)} [${pct(p.lo)} – ${pct(p.hi)}]`;
}

/* ------------------------------------------------------------------ */
/* Limitations (facts only)                                            */
/* ------------------------------------------------------------------ */

export function buildLimitations(input: ReportInput): string[] {
  const { campaign, runs, results, qualityByRun } = input;
  const out: string[] = [];

  const synthRuns = runs.filter((r) => r.origin === "synthetic");
  const synthResults = results.filter((r) => r.origin === "synthetic");
  if (synthRuns.length > 0 || synthResults.length > 0) {
    const names = [...new Set([...synthRuns.map((r) => r.name), ...synthResults.map((r) => r.runName)])];
    out.push(`Der Bericht enthält synthetische (simulierte) Daten: ${names.join(", ")}. Diese Werte sind keine Messergebnisse und sagen nichts über das reale Verhalten von Beacons oder Algorithmen aus.`);
  }
  if (!campaign.floorPlan.scale.confirmed) {
    out.push("Maßstab nicht bestätigt: Distanzen und Fehler sind in Layout-Einheiten (LE) angegeben, nicht in Metern. Die Konvention „1 Zelle = 1 m“ wurde vor Ort nicht überprüft.");
  }
  const models: { name: string; model: PathLossModel }[] = [{ name: "Kampagne", model: campaign.pathLoss }];
  for (const b of campaign.beacons) if (b.enabled && b.pathLoss) models.push({ name: `Beacon ${b.id}`, model: b.pathLoss });
  const uncal = models.filter((m) => m.model.source === "default");
  const manual = models.filter((m) => m.model.source === "manual");
  if (uncal.length > 0) out.push(`Unkalibriert: Das Pfadverlustmodell (${uncal.map((m) => m.name).join(", ")}) ist der Lab-Standardwert und wurde nicht an Messdaten angepasst. Distanzabhängige Verfahren (Trilateration, gewichteter Schwerpunkt) sind davon betroffen.`);
  if (manual.length > 0) out.push(`Das Pfadverlustmodell (${manual.map((m) => m.name).join(", ")}) wurde manuell eingegeben und nicht anhand von Messdaten verifiziert.`);

  if (results.length === 0) out.push("Es liegen keine Auswertungsergebnisse vor; der Bericht enthält keine Fehlermetriken.");

  const noTruth = results.filter((r) => r.metrics.epochsWithTruth === 0);
  if (noTruth.length > 0) out.push(`Keine Referenzposition (Ground Truth) vorhanden, daher keine Fehlerwerte: ${noTruth.map(runLabel).join("; ")}.`);
  const runsWithoutRefs = runs.filter((r) => r.references.length === 0 && r.role === "evaluation");
  if (runsWithoutRefs.length > 0) out.push(`Auswertungsläufe ohne Referenzpunkte: ${runsWithoutRefs.map((r) => r.name).join(", ")}.`);

  const few = results.filter((r) => r.metrics.epochsWithTruth > 0 && r.metrics.epochsWithTruth < EXPLORATORY_EPOCHS);
  if (few.length > 0) out.push(`Weniger als ${EXPLORATORY_EPOCHS} Epochen mit Referenz – Ergebnis nur explorativ: ${few.map((r) => `${runLabel(r)} / ${algorithmLabel(r.config.algorithm)} (${r.metrics.epochsWithTruth})`).join("; ")}.`);

  const calibRuns = new Set(runs.filter((r) => r.role === "calibration").map((r) => r.id));
  const leak = results.filter((r) => calibRuns.has(r.runId));
  if (leak.length > 0) out.push(`Auswertung auf Kalibrierungsläufen (Datenleckage, Ergebnis nicht auf unbekannte Daten übertragbar): ${[...new Set(leak.map((r) => r.runName))].join(", ")}.`);

  const evaluatedRuns = runs.filter((r) => results.some((x) => x.runId === r.id));
  const devices = new Set(evaluatedRuns.map((r) => r.deviceId ?? campaign.device).filter((d) => d && d.trim() !== ""));
  if (evaluatedRuns.length > 0 && devices.size <= 1) {
    out.push(`Nur ein Endgerät verwendet${devices.size === 1 ? ` (${[...devices][0]})` : " (Gerät nicht angegeben)"}; keine Aussage über Geräteunabhängigkeit.`);
  }

  const byKind = new Map<string, number>();
  for (const r of evaluatedRuns.filter((r) => r.role === "evaluation")) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
  const thin = [...byKind.entries()].filter(([, n]) => n < MIN_RUNS_PER_CONDITION);
  if (thin.length > 0) out.push(`Weniger als ${MIN_RUNS_PER_CONDITION} Läufe pro Bedingung (${thin.map(([k, n]) => `${KIND_TEXT[k as keyof typeof KIND_TEXT] ?? k}: ${n}`).join(", ")}); Wiederholbarkeit nicht belegt.`);

  const failing = results.filter((r) => r.metrics.failedEstimates > 0);
  if (failing.length > 0) out.push(`Fehlschläge (keine Position berechenbar): ${failing.map((r) => `${runLabel(r)} / ${algorithmLabel(r.config.algorithm)}: ${r.metrics.failedEstimates} von ${r.metrics.epochsWithTruth} (${pct(r.metrics.failureRate)})`).join("; ")}. Mittelwert, Median, RMSE, P90, P95 und Maximum beziehen sich nur auf gültige Schätzungen.`);

  if (qualityByRun) {
    for (const run of runs) {
      const q = qualityByRun[run.id];
      if (!q) continue;
      if (!q.evaluable) out.push(`Keine belastbare Auswertung möglich für Lauf „${run.name}“: ${q.reasons.length ? q.reasons.join("; ") : "Gründe nicht angegeben"}.`);
      const unknown = q.perBeacon.filter((b) => !b.known);
      if (unknown.length > 0) out.push(`Lauf „${run.name}“ enthält Signale unbekannter Beacons (nicht in der Kampagne definiert): ${unknown.map((b) => `${b.beaconId} (${b.count})`).join(", ")}.`);
      const errs = q.issues.filter((i) => i.severity === "error");
      if (errs.length > 0) out.push(`Datenfehler in Lauf „${run.name}“: ${errs.map((i) => `${i.message}${i.count !== undefined ? ` (${i.count}×)` : ""}`).join("; ")}.`);
    }
  }

  // every warning attached to the results, grouped by identical text
  const warn = new Map<string, string[]>();
  for (const r of results) for (const w of r.warnings) warn.set(w, [...(warn.get(w) ?? []), `${r.runName} / ${algorithmLabel(r.config.algorithm)}`]);
  for (const [w, where] of warn) out.push(`Warnung der Auswertung: ${w} (${where.join("; ")})`);

  return out;
}

/* ------------------------------------------------------------------ */
/* Section builders                                                    */
/* ------------------------------------------------------------------ */

const COMMON = (unit: string, key: keyof ErrorMetrics, m: ErrorMetrics): string => {
  const v = m[key];
  if (key === "within2" || key === "within3" || key === "within5" || key === "failureRate") return pct(v as number | null);
  if (typeof v === "number" && ["mean", "median", "rmse", "p90", "p95", "max"].includes(key)) return num(v, 2, unit);
  return int(v as number);
};

function metricRow(label: string[], m: ErrorMetrics): string[] {
  return [
    ...label,
    int(m.epochsWithTruth),
    int(m.validEstimates),
    int(m.failedEstimates),
    pct(m.failureRate),
    COMMON(m.unit, "mean", m),
    COMMON(m.unit, "median", m),
    COMMON(m.unit, "rmse", m),
    COMMON(m.unit, "p90", m),
    COMMON(m.unit, "p95", m),
    COMMON(m.unit, "max", m),
    pct(m.within2),
    pct(m.within3),
    pct(m.within5),
  ];
}
/** Threshold headers carry the real unit: "m" only with a confirmed scale, otherwise layout units. */
function metricHeaders(unit: "m" | "LE"): string[] {
  return ["Epochen m. Ref.", "Gültig", "Fehlschläge", "Ausfallrate", "Mittel", "Median", "RMSE", "P90", "P95", "Maximum", `≤ 2 ${unit}`, `≤ 3 ${unit}`, `≤ 5 ${unit}`];
}

function dynamicRow(label: string[], d: DynamicMetrics): string[] {
  return [
    ...label,
    int(d.pairs),
    int(d.jumps),
    pct(d.jumpRate),
    num(d.meanStepDistance, 2, d.unit),
    num(d.lagSec, 2, "s"),
    num(d.stationaryPrecision, 2, d.unit),
    num(d.stationaryBias, 2, d.unit),
  ];
}

export function buildReportModel(input: ReportInput): ReportModel {
  const { campaign, runs, results, qualityByRun, commonComparison, figures = [], toolVersion, gitCommit, generatedAt } = input;
  const scale = campaign.floorPlan.scale;
  const METRIC_HEADERS = metricHeaders(scale.confirmed ? "m" : "LE");
  const hasSynthetic = runs.some((r) => r.origin === "synthetic") || results.some((r) => r.origin === "synthetic");
  const sections: ReportSection[] = [];
  const add = (id: string, title: string, blocks: ReportBlock[]) => sections.push({ id, number: sections.length + 1, title, blocks });

  /* 1 Titel & Metadaten */
  add("meta", "Titel und Metadaten", [
    {
      type: "kv",
      rows: [
        { key: "Kampagne", value: campaign.name },
        { key: "Beschreibung", value: campaign.description || DASH },
        { key: "Messdatum", value: campaign.date || DASH },
        { key: "Markt / Ort", value: campaign.market || DASH },
        { key: "Gerät", value: campaign.device || DASH },
        { key: "Bedingungen", value: campaign.conditions || DASH },
        { key: "Notizen", value: campaign.notes || DASH },
        { key: "Bericht erstellt", value: generatedAt },
      ],
    },
  ]);

  /* 2 Datengrundlage */
  const dataBlocks: ReportBlock[] = [];
  if (runs.length === 0) dataBlocks.push({ type: "paragraph", text: "Keine Messläufe enthalten." });
  else {
    dataBlocks.push({
      type: "table",
      table: {
        caption: "Messläufe",
        headers: ["Lauf", "Herkunft", "Art", "Rolle", "Gerät", "RSSI-Samples", "Referenzpunkte", "Datei", "Format", "SHA-256", "Zeilen (gesamt / akzeptiert / verworfen)"],
        numericColumns: [5, 6],
        rows: runs.map((r) => [
          r.name,
          ORIGIN_TEXT[r.origin],
          KIND_TEXT[r.kind],
          ROLE_TEXT[r.role],
          r.deviceId ?? DASH,
          String(r.samples.length),
          String(r.references.length),
          r.provenance.fileName,
          r.provenance.format,
          r.provenance.sha256,
          `${r.provenance.totalRows} / ${r.provenance.acceptedRows} / ${r.provenance.rejectedRows}`,
        ]),
      },
    });
    for (const r of runs) {
      const issues = qualityByRun?.[r.id]?.issues ?? r.provenance.issues;
      dataBlocks.push({ type: "heading", text: `Lauf „${r.name}“ [${ORIGIN_TEXT[r.origin]}]` });
      dataBlocks.push({
        type: "bullets",
        items: r.provenance.transformations.length ? r.provenance.transformations.map((t) => `Transformation: ${t}`) : ["Keine Transformationen an den Rohdaten dokumentiert."],
      });
      dataBlocks.push(
        issues.length === 0
          ? { type: "paragraph", text: "Datenqualität: keine Auffälligkeiten gemeldet." }
          : {
              type: "table",
              table: {
                caption: "Datenqualität: gemeldete Auffälligkeiten",
                headers: ["Schwere", "Code", "Meldung", "Anzahl", "Zeilen"],
                numericColumns: [3],
                rows: issues.map((i) => [i.severity === "error" ? "Fehler" : i.severity === "warning" ? "Warnung" : "Hinweis", i.code, i.message, i.count !== undefined ? String(i.count) : DASH, i.rows?.length ? i.rows.join(", ") : DASH]),
              },
            },
      );
      const pb = qualityByRun?.[r.id]?.perBeacon;
      if (pb && pb.length > 0) {
        dataBlocks.push({
          type: "table",
          table: {
            caption: "RSSI-Statistik je Beacon",
            headers: ["Beacon", "Samples", "Rate (Hz)", "Größte Lücke (s)", "In Kampagne definiert"],
            numericColumns: [1, 2, 3],
            rows: pb.map((b) => [b.beaconId, String(b.count), num(b.rateHz, 2), num(b.maxGapSec, 1), b.known ? "ja" : "nein"]),
          },
        });
      }
    }
  }
  add("data", "Datengrundlage", dataBlocks);

  /* 3 Testumgebung & Beacons */
  add("environment", "Testumgebung und Beacons", [
    {
      type: "kv",
      rows: [
        { key: "Grundriss", value: campaign.floorPlan.name },
        { key: "Größe", value: `${campaign.floorPlan.width} × ${campaign.floorPlan.height} LE` },
        { key: "Herkunft des Grundrisses", value: `${ORIGIN_TEXT[campaign.floorPlan.origin]} – ${campaign.floorPlan.source}` },
        { key: "Elemente", value: String(campaign.floorPlan.elements.length) },
      ],
    },
    {
      type: "table",
      table: {
        caption: "Beacons",
        headers: ["ID", "Bezeichnung", "Position x, y (LE)", scale.confirmed ? "Position x, y (m)" : "Position (m)", "txPower (dBm)", "aktiv", "Pfadverlustmodell"],
        numericColumns: [2, 3, 4],
        rows: campaign.beacons.map((b) => [
          b.id,
          b.label ?? DASH,
          `${num(b.position.x, 2)}, ${num(b.position.y, 2)}`,
          scale.confirmed ? `${num(b.position.x * scale.metersPerUnit, 2)}, ${num(b.position.y * scale.metersPerUnit, 2)}` : "nicht angegeben (Maßstab unbestätigt)",
          b.txPowerDbm !== undefined ? num(b.txPowerDbm, 0) : DASH,
          b.enabled ? "ja" : "nein",
          b.pathLoss ? `eigenes Modell (${b.pathLoss.source})` : `Kampagnenmodell (${campaign.pathLoss.source})`,
        ]),
      },
    },
  ]);

  /* 4 Maßstab & Koordinaten */
  add("scale", "Maßstab und Koordinaten", [
    {
      type: "kv",
      rows: [
        { key: "Meter pro Layout-Einheit (LE)", value: num(scale.metersPerUnit, 4) },
        { key: "Maßstab bestätigt", value: scale.confirmed ? "ja" : "NEIN" },
        { key: "Herkunft / Notiz", value: scale.note || DASH },
        { key: "Koordinatensystem", value: "Ursprung (0,0) links oben, x nach rechts, y nach unten; 1 Gitterzelle = 1 LE (Indooro-Layout-Konvention)." },
        { key: "Anzeigeeinheit der Fehler", value: scale.confirmed ? "Meter (m)" : "Layout-Einheiten (LE)" },
      ],
    },
    ...(scale.confirmed ? [] : [{ type: "notice" as const, tone: "warning" as const, text: "Maßstab nicht bestätigt: Alle Distanzangaben sind in LE; Schwellen „2/3/5 m“ sind mit dem unbestätigten Maßstab umgerechnet." }]),
  ]);

  /* 5 Verfahren & Parameter */
  const procBlocks: ReportBlock[] = [];
  if (results.length === 0) procBlocks.push({ type: "paragraph", text: "Keine Auswertungen vorhanden." });
  for (const r of results) {
    procBlocks.push({ type: "heading", text: `${algorithmLabel(r.config.algorithm)} – Lauf „${r.runName}“ [${ORIGIN_TEXT[r.origin]}]` });
    procBlocks.push({
      type: "kv",
      rows: [
        { key: "Algorithmus", value: r.config.algorithm },
        ...flattenParams({ ...r.config, algorithm: undefined }).filter((p) => p.key !== "algorithm"),
        ...flattenParams(r.options, "evaluation"),
        { key: "configHash", value: r.configHash },
      ],
    });
  }
  add("procedure", "Verfahren und Parameter", procBlocks);

  /* 6 Kalibrierung */
  const pl = campaign.pathLoss;
  const calBlocks: ReportBlock[] = [];
  if (pl.source === "fitted") {
    const runNames = (pl.fittedOnRunIds ?? []).map((id) => runs.find((r) => r.id === id)?.name ?? id);
    calBlocks.push({
      type: "kv",
      rows: [
        { key: "Modell", value: pathLossText(pl) },
        { key: "Bestimmtheitsmaß R²", value: pl.r2 !== undefined ? num(pl.r2, 3) : DASH },
        { key: "Reststreuung σ", value: pl.residualStdDb !== undefined ? num(pl.residualStdDb, 2, "dB") : DASH },
        { key: "Anzahl Samples", value: pl.sampleCount !== undefined ? String(pl.sampleCount) : DASH },
        { key: "Kalibrierungsläufe", value: runNames.length ? runNames.join(", ") : DASH },
      ],
    });
  } else {
    calBlocks.push({ type: "notice", tone: "warning", text: pl.source === "default" ? "nicht kalibriert – es wird das Lab-Standardmodell verwendet." : "Nicht aus Messdaten kalibriert – Modell wurde manuell eingegeben." });
    calBlocks.push({ type: "kv", rows: [{ key: "Modell", value: pathLossText(pl) }] });
  }
  const own = campaign.beacons.filter((b) => b.pathLoss);
  if (own.length > 0) {
    calBlocks.push({ type: "table", table: { caption: "Beacon-spezifische Modelle", headers: ["Beacon", "Modell"], rows: own.map((b) => [b.id, pathLossText(b.pathLoss as PathLossModel)]) } });
  }
  add("calibration", "Kalibrierung", calBlocks);

  /* 7 Ergebnisse */
  const resBlocks: ReportBlock[] = [];
  if (results.length === 0) resBlocks.push({ type: "paragraph", text: "Keine Auswertungsergebnisse vorhanden." });
  else {
    const sorted = [...results].sort((a, b) => a.runName.localeCompare(b.runName, "de") || a.config.algorithm.localeCompare(b.config.algorithm));
    resBlocks.push({
      type: "table",
      table: {
        caption: `Positionsfehler je Lauf und Algorithmus (Einheit: ${sorted[0].metrics.unit})`,
        headers: ["Lauf", "Herkunft", "Algorithmus", ...METRIC_HEADERS],
        numericColumns: Array.from({ length: METRIC_HEADERS.length }, (_, i) => i + 3),
        rows: sorted.map((r) => metricRow([r.runName, ORIGIN_TEXT[r.origin], algorithmLabel(r.config.algorithm)], r.metrics)),
        note: "Sortierung: Lauf (alphabetisch), dann Algorithmus – keine Rangfolge nach Güte. Mittel, Median, RMSE, P90, P95, Maximum: nur gültige Schätzungen. Trefferquoten (≤ 2/3/5 m bzw. LE bei unbestätigtem Maßstab): bezogen auf alle Epochen mit Referenz, Fehlschläge zählen als nicht innerhalb.",
      },
    });
    resBlocks.push({
      type: "table",
      table: {
        caption: "Dynamische Metriken",
        headers: ["Lauf", "Herkunft", "Algorithmus", "Paare", "Sprünge (>2 m/s)", "Sprungrate", "Mittl. Schrittweite", "Verzögerung", "Präzision (stationär)", "Bias (stationär)"],
        numericColumns: [3, 4, 5, 6, 7, 8, 9],
        rows: sorted.map((r) => dynamicRow([r.runName, ORIGIN_TEXT[r.origin], algorithmLabel(r.config.algorithm)], r.dynamic)),
        note: "Sortierung wie oben.",
      },
    });
    if (commonComparison && commonComparison.common.length > 0) {
      const aligned = commonComparison.common.length === results.length;
      resBlocks.push({
        type: "table",
        table: {
          caption: `Vergleich auf gemeinsamer Epochenmenge (${commonComparison.commonEpochs} Epochen, in denen alle verglichenen Konfigurationen eine Referenz haben)`,
          headers: ["Konfiguration", ...METRIC_HEADERS],
          numericColumns: METRIC_HEADERS.map((_, i) => i + 1),
          rows: commonComparison.common.map((m, i) => metricRow([aligned ? `${results[i].runName} / ${algorithmLabel(results[i].config.algorithm)}` : `Konfiguration ${i + 1}`], m)),
          note: aligned ? "Reihenfolge entspricht der Ergebnisliste; keine Rangfolge." : "Zuordnung zu Läufen nicht angegeben; keine Rangfolge.",
        },
      });
    }
    const unc = sorted.map((r) => ({ r, u: resultUncertainty(r, campaign, runs) }));
    const unit = scale.confirmed ? "m" : "LE";
    resBlocks.push({ type: "heading", text: "Unsicherheit (Konfidenzintervalle)" });
    resBlocks.push({
      type: "table",
      table: {
        caption: `Median und P95 mit ${Math.round(unc[0].u.level * 100)} %-Block-Bootstrap-Intervall, Trefferquoten mit Wilson-Intervall (Einheit: ${unit})`,
        headers: ["Lauf", "Herkunft", "Algorithmus", "Blöcke", `Median [KI] (${unit})`, `P95 [KI] (${unit})`, `≤ 2 ${unit} [KI]`, `≤ 3 ${unit} [KI]`, `≤ 5 ${unit} [KI]`, "Ausfallrate [KI]"],
        numericColumns: [3, 4, 5, 6, 7, 8, 9],
        rows: unc.map(({ r, u }) => [r.runName, ORIGIN_TEXT[r.origin], algorithmLabel(r.config.algorithm), String(u.blocks), ciText(u.median), ciText(u.p95), propText(u.within2), propText(u.within3), propText(u.within5), propText(u.failureRate)]),
        note: `Methode: Block-Bootstrap (Perzentilintervall) über ganze Blöcke statt einzelner Epochen, weil aufeinanderfolgende Epochen autokorreliert sind; Seed ${DEFAULT_SEED}, ${DEFAULT_ITERATIONS} Wiederholungen. Blockdefinition: stationär = ein Halt, Gehversuch = ${DEFAULT_BLOCK_SEC}-s-Segment. Bei weniger als ${MIN_BLOCKS_FOR_CI} Blöcken ist kein Intervall berechenbar (n. b.). Wilson-Intervalle setzen unabhängige Epochen voraus und sind bei autokorrelierten Epochen eher zu eng. Intervalle beschreiben nur die statistische Unsicherheit dieser Messung; überlappende Intervalle belegen keine Gleichheit.${hasSynthetic ? " Bei synthetischen Läufen beschreiben die Intervalle nur die Simulation." : ""}`,
      },
    });
    resBlocks.push({ type: "heading", text: "Metrikdefinitionen" });
    resBlocks.push({
      type: "bullets",
      items: [...Object.values(ERROR_METRIC_DEFINITIONS), ...Object.values(DYNAMIC_METRIC_DEFINITIONS)].map((d) => `${d.label}: ${d.definition}`),
    });
  }
  add("results", "Ergebnisse", resBlocks);

  /* 8 Abbildungen */
  add(
    "figures",
    "Abbildungen",
    figures.length === 0 ? [{ type: "paragraph", text: "Keine Abbildungen angehängt." }] : figures.map((f, i) => ({ type: "figure" as const, id: f.id, number: i + 1, title: f.title, svg: f.svg, caption: f.caption })),
  );

  /* 9 Grenzen der Aussagekraft */
  const limits = buildLimitations(input);
  add("limitations", "Grenzen der Aussagekraft", [
    { type: "paragraph", text: "Dieser Abschnitt wird automatisch ausschließlich aus den vorliegenden Fakten erzeugt." },
    limits.length === 0 ? { type: "paragraph", text: "Es wurden keine einschränkenden Fakten erkannt. Das ist keine Aussage über die Gültigkeit der Messung." } : { type: "bullets", items: limits },
  ]);

  /* 10 Interpretation */
  const notes = (input.interpretationNotes ?? "").trim();
  add("interpretation", "Interpretation und Hypothesen", [
    { type: "notice", tone: "info", text: INTERPRETATION_LABEL },
    { type: "paragraph", text: notes === "" ? NO_INTERPRETATION : notes },
  ]);

  /* 11 Reproduzierbarkeit */
  const repro: ReportBlock[] = [
    {
      type: "kv",
      rows: [
        { key: "Tool-Version", value: toolVersion },
        { key: "Git-Commit", value: gitCommit ?? "nicht angegeben" },
        { key: "Bericht erstellt", value: generatedAt },
      ],
    },
  ];
  if (results.length > 0) {
    repro.push({
      type: "table",
      table: { caption: "Konfigurations-Hashes", headers: ["Lauf", "Algorithmus", "configHash", "berechnet am"], rows: results.map((r) => [r.runName, r.config.algorithm, r.configHash, r.computedAt]) },
    });
  }
  const synth = runs.filter((r) => r.provenance.synthetic);
  if (synth.length > 0) {
    repro.push({
      type: "table",
      table: {
        caption: "Synthetische Läufe (Generator-Parameter)",
        headers: ["Lauf", "Szenario", "Seed", "Rate (Hz)", "Paketverlust", "Schattierung σ (dB)", "wahres RSSI(1 m)", "wahres n"],
        numericColumns: [2, 3, 4, 5, 6, 7],
        rows: synth.map((r) => {
          const s = r.provenance.synthetic as NonNullable<typeof r.provenance.synthetic>;
          return [r.name, s.scenario, String(s.seed), num(s.sampleRateHz, 1), num(s.packetLossProb, 3), num(s.shadowingStdDb, 1), num(s.trueRssiAt1m, 1), num(s.truePathLossExponent, 2)];
        }),
      },
    });
  }
  if (runs.length > 0) {
    repro.push({ type: "table", table: { caption: "Rohdateien (SHA-256)", headers: ["Datei", "Lauf", "SHA-256"], rows: runs.map((r) => [r.provenance.fileName, r.name, r.provenance.sha256]) } });
  }
  add("reproducibility", "Reproduzierbarkeit", repro);

  return {
    title: REPORT_TITLE,
    campaignName: campaign.name,
    toolVersion,
    gitCommit: gitCommit ?? null,
    generatedAt,
    hasSynthetic,
    syntheticBanner: hasSynthetic ? SYNTHETIC_BANNER : null,
    sections,
    configHashes: results.map((r) => r.configHash),
  };
}
