/**
 * Export: campaign bundle (JSON), samples CSV, estimates CSV, browser download helper.
 */
import { distanceUnit, toDisplayDistance } from "../core/units";
import type { Campaign, DataIssue, EvaluationResult, MapScale, MeasurementRun } from "../core/types";
import { csvEscape } from "./csv";
import { IssueCollector } from "./issues";
import { RSSI_MAX, RSSI_MIN } from "./validate";

export const BUNDLE_SCHEMA = "indooro-positioning-lab/campaign-bundle";
export const BUNDLE_SCHEMA_VERSION = 1;
export const TOOL_VERSION = "0.1.0";

export interface CampaignBundle {
  schema: typeof BUNDLE_SCHEMA;
  schemaVersion: number;
  exportedAt: string;
  tool: { name: string; version: string };
  campaign: Campaign;
  runs: MeasurementRun[];
}

export function campaignBundle(c: Campaign, runs: MeasurementRun[]): CampaignBundle {
  return {
    schema: BUNDLE_SCHEMA,
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    tool: { name: "indooro-positioning-lab", version: TOOL_VERSION },
    campaign: c,
    runs,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isPoint = (v: unknown): boolean => isObj(v) && isNum(v.x) && isNum(v.y);

/** Parses and validates a campaign bundle. `bundle` is only set if there is no error-level issue. */
export function parseCampaignBundle(text: string): { bundle?: CampaignBundle; issues: DataIssue[] } {
  const issues: DataIssue[] = [];
  const fail = (code: string, message: string) => {
    issues.push({ severity: "error", code, message });
    return { issues };
  };
  let doc: unknown;
  try {
    doc = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (e) {
    return fail("bundle-json", `Datei ist kein gültiges JSON: ${(e as Error).message}`);
  }
  if (!isObj(doc)) return fail("bundle-shape", "Das Bundle muss ein JSON-Objekt sein.");
  if (doc.schema !== BUNDLE_SCHEMA) {
    return fail(
      "bundle-schema",
      `Unbekanntes Schema „${String(doc.schema)}“ – erwartet wird „${BUNDLE_SCHEMA}“. Ist das eine Messdatei? Dann über „Messlauf importieren“ laden.`,
    );
  }
  if (!isNum(doc.schemaVersion)) return fail("bundle-version", "schemaVersion fehlt oder ist keine Zahl.");
  if (doc.schemaVersion > BUNDLE_SCHEMA_VERSION) {
    return fail(
      "bundle-version",
      `Das Bundle hat Schema-Version ${doc.schemaVersion}, diese App kennt nur Version ${BUNDLE_SCHEMA_VERSION}. Bitte die App aktualisieren.`,
    );
  }
  if (doc.schemaVersion < 1) return fail("bundle-version", `Ungültige Schema-Version ${doc.schemaVersion}.`);

  const c = doc.campaign;
  if (!isObj(c) || typeof c.id !== "string" || !c.id || typeof c.name !== "string") {
    return fail("bundle-campaign", "„campaign“ fehlt oder hat keine id/name.");
  }
  const plan = c.floorPlan;
  if (!isObj(plan) || !isNum(plan.width) || !isNum(plan.height) || !Array.isArray(plan.elements) || !isObj(plan.scale)) {
    return fail("bundle-floorplan", "campaign.floorPlan ist unvollständig (width, height, elements, scale erforderlich).");
  }
  if (!Array.isArray(c.beacons)) return fail("bundle-beacons", "campaign.beacons fehlt oder ist kein Array.");
  c.beacons.forEach((b, i) => {
    if (!isObj(b) || typeof b.id !== "string" || !isPoint(b.position)) {
      issues.push({ severity: "error", code: "bundle-beacons", message: `Beacon Nr. ${i + 1} hat keine gültige id/position.` });
    }
  });
  if (!isObj(c.pathLoss) || !isNum(c.pathLoss.rssiAt1m) || !isNum(c.pathLoss.pathLossExponent)) {
    issues.push({ severity: "error", code: "bundle-pathloss", message: "campaign.pathLoss fehlt oder ist unvollständig." });
  }
  if (!Array.isArray(doc.runs)) {
    issues.push({ severity: "error", code: "bundle-runs", message: "„runs“ fehlt oder ist kein Array." });
    return { issues };
  }

  const runIds = new Set<string>();
  doc.runs.forEach((r, ri) => {
    const where = isObj(r) && typeof r.name === "string" ? `Lauf „${r.name}“` : `Lauf Nr. ${ri + 1}`;
    if (!isObj(r) || typeof r.id !== "string" || !r.id) {
      issues.push({ severity: "error", code: "bundle-run", message: `${where}: id fehlt.` });
      return;
    }
    if (runIds.has(r.id)) issues.push({ severity: "error", code: "bundle-run", message: `${where}: doppelte Lauf-ID „${r.id}“.` });
    runIds.add(r.id);
    if (r.campaignId !== c.id) {
      issues.push({ severity: "error", code: "bundle-run", message: `${where}: gehört zu einer anderen Kampagne („${String(r.campaignId)}“).` });
    }
    if (r.kind !== "stationary" && r.kind !== "walk") issues.push({ severity: "error", code: "bundle-run", message: `${where}: ungültige Lauf-Art „${String(r.kind)}“.` });
    if (r.role !== "calibration" && r.role !== "evaluation") issues.push({ severity: "error", code: "bundle-run", message: `${where}: ungültige Rolle „${String(r.role)}“.` });
    if (r.origin !== "real" && r.origin !== "synthetic") issues.push({ severity: "error", code: "bundle-run", message: `${where}: Herkunft (origin) fehlt oder ist ungültig.` });
    if (!isObj(r.provenance)) issues.push({ severity: "error", code: "bundle-run", message: `${where}: Provenienz fehlt.` });
    if (!Array.isArray(r.samples) || !Array.isArray(r.references)) {
      issues.push({ severity: "error", code: "bundle-run", message: `${where}: samples/references fehlen.` });
      return;
    }
    const coll = new IssueCollector();
    r.samples.forEach((s, i) => {
      if (!isObj(s) || !isNum(s.t) || typeof s.beaconId !== "string" || !s.beaconId || !isNum(s.rssi)) {
        coll.add("bundle-sample", "error", i + 1, (n) => `${where}: ${n} ungültige Messwerte (t, beaconId, rssi erforderlich).`);
      } else if (s.rssi < RSSI_MIN || s.rssi > RSSI_MAX) {
        coll.add("bundle-sample-range", "error", i + 1, (n) => `${where}: ${n} Messwerte mit RSSI außerhalb von ${RSSI_MIN}…${RSSI_MAX} dBm.`);
      }
    });
    r.references.forEach((p, i) => {
      if (!isObj(p) || !isNum(p.t) || !isPoint(p.position)) {
        coll.add("bundle-reference", "error", i + 1, (n) => `${where}: ${n} ungültige Referenzpunkte.`);
      }
    });
    issues.push(...coll.toIssues());
  });

  if (issues.some((i) => i.severity === "error")) return { issues };
  return { bundle: doc as unknown as CampaignBundle, issues };
}

function num(v: number | null | undefined, digits = 4): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  return String(Math.round(v * 10 ** digits) / 10 ** digits);
}

/** Long-format samples CSV (comma, dot decimals, UTF-8). Re-importable by runImport. */
export function samplesToCsv(run: MeasurementRun): string {
  const lines = ["t,beaconId,rssi,deviceId,source,origin"];
  for (const s of run.samples) {
    lines.push([String(s.t), csvEscape(s.beaconId), String(s.rssi), csvEscape(s.deviceId ?? run.deviceId ?? ""), csvEscape(s.source ?? ""), run.origin].join(","));
  }
  return lines.join("\n") + "\n";
}

/** Reference points of a run as CSV (t,x,y,label; layout units). */
export function referencesToCsv(run: MeasurementRun): string {
  const lines = ["t,x,y,label,origin"];
  for (const r of run.references) {
    lines.push([String(r.t), String(r.position.x), String(r.position.y), csvEscape(r.label ?? ""), run.origin].join(","));
  }
  return lines.join("\n") + "\n";
}

/**
 * Estimates CSV. error is in metres only if scale.confirmed, otherwise in layout units (error_unit "LE").
 * Failures stay in the file (empty x_est/y_est/error, failure_reason set) – they are never dropped.
 */
export function estimatesToCsv(result: EvaluationResult, scale: MapScale): string {
  const unit = distanceUnit(scale);
  const lines = ["t,x_est,y_est,x_raw,y_raw,x_truth,y_truth,error,error_unit,failure_reason,n_beacons"];
  for (const e of result.estimates) {
    lines.push(
      [
        num(e.t, 3),
        num(e.position?.x),
        num(e.position?.y),
        num(e.rawPosition?.x),
        num(e.rawPosition?.y),
        num(e.truth?.x),
        num(e.truth?.y),
        e.errorUnits === null || e.errorUnits === undefined ? "" : num(toDisplayDistance(e.errorUnits, scale)),
        unit,
        csvEscape(e.failureReason ?? ""),
        String(e.inputs.length),
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

/** Browser download via Blob. No-op outside a DOM environment (SSR, tests, workers). */
export function downloadText(fileName: string, text: string, mime: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof Blob === "undefined") return;
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
