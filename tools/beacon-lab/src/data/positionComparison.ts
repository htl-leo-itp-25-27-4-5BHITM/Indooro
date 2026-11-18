import type { DataIssue, DynamicMetrics, ErrorMetrics, MapScale, Point, PositionEstimate } from "../core/types";
import { computeDynamicMetrics, computeErrorMetrics } from "../positioning/metrics";

/**
 * Import of `indooro-position-comparison/1`: the per-epoch output of the Swift tool `compare-positioning`
 * (`scripts/field/compare_positioning.sh`), which replays ONE recording through the current app pipeline and through
 * `PositioningEngine`. The file already holds finished positions, so no algorithm runs here. Every method becomes a
 * list of `PositionEstimate`, and the Lab's own metric functions (`computeErrorMetrics`, `computeDynamicMetrics`)
 * give the figures. They are checked against the summary the Swift tool wrote (`summaryMismatches`), so the two
 * implementations of the metric definitions in `docs/METRICS.md` cannot drift apart unnoticed.
 *
 * Units: the file is in metres (1 layout cell = 1 m, `MEASUREMENT_PROTOCOL.md`), so the scale counts as confirmed.
 */
export const POSITION_COMPARISON_SCHEMA = "indooro-position-comparison/1";

export const POSITION_COMPARISON_SCALE: MapScale = {
  metersPerUnit: 1,
  confirmed: true,
  note: "1 Rasterzelle = 1 m (MEASUREMENT_PROTOCOL.md); Positionen der Datei sind in Metern.",
};

export interface ComparisonMethod {
  id: string;
  label: string;
  /** One estimate per epoch, `position: null` = the pipeline displayed nothing (an outage when truth exists). */
  estimates: PositionEstimate[];
  metrics: ErrorMetrics;
  dynamic: DynamicMetrics;
  /** Figures written by the Swift tool for this method (verbatim), if present. */
  toolSummary: Record<string, number | null> | null;
}

export interface PositionComparison {
  origin: "synthetic" | "field";
  recordingName: string;
  recordingSha256: string | null;
  session: { role: string | null; scenario: string | null; deviceModel: string | null } | null;
  epochCount: number;
  methods: ComparisonMethod[];
  /** Limits written by the tool (e.g. SYNTHETIC, shared pipeline core). Always show them next to the numbers. */
  warnings: string[];
  /** Differences between the Lab's figures and the tool's summary; empty when both agree. */
  summaryMismatches: string[];
}

export interface PositionComparisonImport {
  ok: boolean;
  comparison?: PositionComparison;
  issues: DataIssue[];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readPoint(v: unknown): Point | null | undefined {
  if (v === null) return null;
  if (!isObject(v) || typeof v.x !== "number" || typeof v.y !== "number" || !Number.isFinite(v.x) || !Number.isFinite(v.y)) {
    return undefined; // invalid
  }
  return { x: v.x, y: v.y };
}

const SUMMARY_TOLERANCE = 1e-4;

/** Lab figure name -> key in the tool's summary. */
function labFigures(m: ErrorMetrics, d: DynamicMetrics): Record<string, number | null> {
  return {
    epochsWithTruth: m.epochsWithTruth,
    validEstimates: m.validEstimates,
    failedEstimates: m.failedEstimates,
    outageRate: m.epochsWithTruth === 0 ? null : m.failureRate,
    mean: m.mean,
    median: m.median,
    rmse: m.rmse,
    p90: m.p90,
    p95: m.p95,
    max: m.max,
    within2: m.within2,
    within3: m.within3,
    within5: m.within5,
    pairs: d.pairs,
    jumps: d.jumps,
    jumpRate: d.jumpRate,
  };
}

function compareFigures(methodId: string, lab: Record<string, number | null>, tool: Record<string, number | null>): string[] {
  const out: string[] = [];
  for (const [key, labValue] of Object.entries(lab)) {
    if (!(key in tool)) continue;
    const toolValue = tool[key];
    if (labValue === null || toolValue === null) {
      if (labValue !== toolValue) out.push(`${methodId}.${key}: Lab ${labValue}, Werkzeug ${toolValue}`);
    } else if (Math.abs(labValue - toolValue) > SUMMARY_TOLERANCE) {
      out.push(`${methodId}.${key}: Lab ${labValue}, Werkzeug ${toolValue}`);
    }
  }
  return out;
}

/** Parses and validates a comparison file. Errors block the import; invalid epochs are dropped and reported. */
export function parsePositionComparison(text: string): PositionComparisonImport {
  const issues: DataIssue[] = [];
  const fail = (code: string, message: string): PositionComparisonImport => {
    issues.push({ severity: "error", code, message });
    return { ok: false, issues };
  };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return fail("json-parse-error", `Die Datei ist kein gültiges JSON (${e instanceof Error ? e.message : "unbekannter Fehler"}).`);
  }
  if (!isObject(raw)) return fail("json-shape", "Die Datei muss ein JSON-Objekt sein.");
  if (raw.schema !== POSITION_COMPARISON_SCHEMA) {
    return fail("schema-mismatch", `Erwartet wird das Schema „${POSITION_COMPARISON_SCHEMA}“, gefunden: ${JSON.stringify(raw.schema ?? null)}.`);
  }
  if (raw.unit !== "m") return fail("unit-unsupported", `Nur die Einheit „m“ wird gelesen, gefunden: ${JSON.stringify(raw.unit ?? null)}.`);
  const methodDefs = Array.isArray(raw.methods) ? raw.methods : null;
  if (!methodDefs || methodDefs.length === 0) return fail("methods-missing", "Die Datei nennt keine Verfahren („methods“).");
  const ids = new Set<string>();
  const methods: { id: string; label: string }[] = [];
  for (const def of methodDefs) {
    if (!isObject(def) || typeof def.id !== "string" || def.id === "" || typeof def.label !== "string") {
      return fail("methods-invalid", "Jedes Verfahren braucht „id“ und „label“ als Text.");
    }
    if (ids.has(def.id)) return fail("methods-duplicate", `Das Verfahren „${def.id}“ kommt doppelt vor.`);
    ids.add(def.id);
    methods.push({ id: def.id, label: def.label });
  }
  const epochs = Array.isArray(raw.epochs) ? raw.epochs : null;
  if (!epochs || epochs.length === 0) return fail("epochs-missing", "Die Datei enthält keine Epochen.");

  const estimates = new Map<string, PositionEstimate[]>(methods.map((m) => [m.id, []]));
  let dropped = 0;
  const droppedRows: number[] = [];
  epochs.forEach((epoch, index) => {
    const row = index + 1;
    const t = isObject(epoch) ? epoch.t : undefined;
    const truth = isObject(epoch) ? readPoint(epoch.truth) : undefined;
    const perMethod = new Map<string, PositionEstimate>();
    let valid = typeof t === "number" && Number.isFinite(t) && truth !== undefined;
    if (valid && isObject(epoch)) {
      for (const m of methods) {
        const entry = epoch[m.id];
        const position = isObject(entry) ? readPoint(entry.position) : undefined;
        if (position === undefined) {
          valid = false;
          break;
        }
        const rawPosition = isObject(entry) ? readPoint(entry.raw) : null;
        const errorUnits = position && truth ? Math.hypot(position.x - truth.x, position.y - truth.y) : null;
        perMethod.set(m.id, {
          t: t as number,
          position,
          rawPosition: rawPosition ?? null,
          ...(position ? {} : { failureReason: "nichts angezeigt" }),
          inputs: [],
          truth: truth ?? null,
          errorUnits,
        });
      }
    }
    if (!valid) {
      dropped++;
      if (droppedRows.length < 5) droppedRows.push(row);
      return;
    }
    for (const m of methods) estimates.get(m.id)!.push(perMethod.get(m.id)!);
  });
  if (dropped > 0) {
    issues.push({
      severity: "warning",
      code: "epochs-invalid",
      message: `${dropped} Epochen waren ungültig (Zeit, Referenz oder Position) und wurden verworfen (z. B. Epoche ${droppedRows.join(", ")}).`,
      rows: droppedRows,
      count: dropped,
    });
  }
  const kept = estimates.get(methods[0].id)!.length;
  if (kept === 0) return { ok: false, issues: [...issues, { severity: "error", code: "no-valid-epochs", message: "Keine gültige Epoche übrig." }] };

  const toolSummary = isObject(raw.summary) ? raw.summary : {};
  const mismatches: string[] = [];
  const result: ComparisonMethod[] = methods.map((m) => {
    const list = estimates.get(m.id)!.sort((a, b) => a.t - b.t);
    const metrics = computeErrorMetrics(list, POSITION_COMPARISON_SCALE);
    const dynamic = computeDynamicMetrics(list, [], POSITION_COMPARISON_SCALE);
    const fromTool = isObject(toolSummary[m.id]) ? (toolSummary[m.id] as Record<string, number | null>) : null;
    if (fromTool && dropped === 0) mismatches.push(...compareFigures(m.id, labFigures(metrics, dynamic), fromTool));
    return { id: m.id, label: m.label, estimates: list, metrics, dynamic, toolSummary: fromTool };
  });

  const session = isObject(raw.session)
    ? {
        role: typeof raw.session.role === "string" ? raw.session.role : null,
        scenario: typeof raw.session.scenario === "string" ? raw.session.scenario : null,
        deviceModel: typeof raw.session.deviceModel === "string" ? raw.session.deviceModel : null,
      }
    : null;
  const recording = isObject(raw.recording) ? raw.recording : {};
  const origin = raw.origin === "synthetic" ? "synthetic" : "field";
  const warnings = Array.isArray(raw.warnings) ? raw.warnings.filter((w): w is string => typeof w === "string") : [];
  if (origin === "synthetic") issues.push({ severity: "warning", code: "synthetic-origin", message: "SYNTHETISCH: erzeugte Daten, keine Messung. Nie als Messergebnis zitieren." });
  if (mismatches.length > 0) {
    issues.push({ severity: "warning", code: "summary-mismatch", message: `Lab und Werkzeug rechnen unterschiedlich: ${mismatches.join("; ")}.`, count: mismatches.length });
  }

  return {
    ok: true,
    issues,
    comparison: {
      origin,
      recordingName: typeof recording.name === "string" ? recording.name : "unbekannt",
      recordingSha256: typeof recording.sha256 === "string" ? recording.sha256 : null,
      session,
      epochCount: kept,
      methods: result,
      warnings,
      summaryMismatches: mismatches,
    },
  };
}
