/**
 * Pure validation functions. They only REPORT problems; they never modify data.
 * Any change to data (sorting, duplicate removal) happens in import.ts and is recorded there
 * as a transformation.
 */
import type { Campaign, DataIssue, FloorPlan, MeasurementRun, ReferencePoint, RssiSample } from "../core/types";
import { IssueCollector, MAX_EXAMPLE_ROWS } from "./issues";

export const RSSI_MIN = -110;
export const RSSI_MAX = -1;
/** warning threshold for the number of samples in a run */
export const FEW_SAMPLES = 30;
/** a gap per beacon counts as "large" if it exceeds this many seconds AND 10x the beacon's median interval */
export const LARGE_GAP_MIN_SEC = 10;

export function missingReferencesIssue(): DataIssue {
  return {
    severity: "warning",
    code: "no-references",
    message:
      "Keine Referenzpositionen vorhanden – keine Ground Truth, Fehlermetriken nicht berechenbar. " +
      "Der Lauf kann nur qualitativ betrachtet werden.",
  };
}

export function duplicateKey(s: RssiSample): string {
  return `${s.t}|${s.beaconId}|${s.rssi}|${s.deviceId ?? ""}`;
}

function rowOf(s: { sourceRow?: number }, index: number): number {
  return s.sourceRow ?? index + 1;
}

export function validateSamples(samples: RssiSample[], knownBeaconIds: string[]): DataIssue[] {
  const c = new IssueCollector();
  const known = new Set(knownBeaconIds);
  const unknownIds = new Map<string, number>();
  const seen = new Set<string>();
  const perBeacon = new Map<string, number[]>();
  let prevT = -Infinity;

  samples.forEach((s, i) => {
    const row = rowOf(s, i);
    let usable = true;
    if (typeof s.t !== "number" || !Number.isFinite(s.t)) {
      c.add("invalid-timestamp", "error", row, (n) => `${n} Messwerte ohne gültigen Zeitstempel (fehlend oder NaN).`);
      usable = false;
    }
    if (typeof s.rssi !== "number" || !Number.isFinite(s.rssi)) {
      c.add("rssi-not-finite", "error", row, (n) => `${n} Messwerte mit nicht-numerischem RSSI (Text, leer oder NaN).`);
      usable = false;
    } else if (s.rssi < RSSI_MIN || s.rssi > RSSI_MAX) {
      c.add(
        "rssi-out-of-range",
        "error",
        row,
        (n) =>
          `${n} Messwerte mit RSSI außerhalb von ${RSSI_MIN} bis ${RSSI_MAX} dBm. ` +
          `RSSI 0 bedeutet bei CoreLocation „unbekannt“, positive Werte sind physikalisch unplausibel.`,
      );
    }
    if (!s.beaconId) {
      c.add("missing-beacon-id", "error", row, (n) => `${n} Messwerte ohne Beacon-ID.`);
      usable = false;
    } else if (!known.has(s.beaconId)) {
      unknownIds.set(s.beaconId, (unknownIds.get(s.beaconId) ?? 0) + 1);
    }
    if (!usable) return;

    if (s.t < prevT) {
      c.add(
        "unsorted-timestamps",
        "warning",
        row,
        () =>
          "Zeitstempel sind nicht aufsteigend sortiert. Beim Import wird stabil nach Zeit sortiert " +
          "(als Transformation vermerkt).",
      );
    }
    prevT = Math.max(prevT, s.t);

    const key = duplicateKey(s);
    if (seen.has(key)) {
      c.add(
        "duplicate-rows",
        "warning",
        row,
        (n) => `${n} exakte Duplikate (gleiche Zeit, Beacon, RSSI und Gerät). Beim Import werden sie entfernt und gezählt.`,
      );
    } else {
      seen.add(key);
    }

    let list = perBeacon.get(s.beaconId);
    if (!list) perBeacon.set(s.beaconId, (list = []));
    list.push(s.t);
  });

  const out = c.toIssues();

  if (unknownIds.size > 0) {
    const ids = [...unknownIds.keys()].sort();
    const total = [...unknownIds.values()].reduce((a, b) => a + b, 0);
    out.push({
      severity: "warning",
      code: "unknown-beacon",
      count: total,
      message:
        `${ids.length} Beacon-ID(s) kommen im Lauf vor, sind aber in der Kampagne nicht angelegt: ` +
        `${ids.slice(0, MAX_EXAMPLE_ROWS).join(", ")}${ids.length > MAX_EXAMPLE_ROWS ? ", …" : ""} ` +
        `(${total} Messwerte). Die Zeilen bleiben erhalten, können aber nicht für die Positionierung genutzt werden – ` +
        `Beacon in der Kampagne anlegen oder ID prüfen.`,
    });
  }

  // large gaps per beacon
  const gapNotes: string[] = [];
  for (const [id, ts0] of perBeacon) {
    if (ts0.length < 2) continue;
    const ts = ts0.slice().sort((a, b) => a - b);
    const diffs: number[] = [];
    for (let i = 1; i < ts.length; i++) diffs.push(ts[i] - ts[i - 1]);
    const sorted = diffs.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const limit = Math.max(LARGE_GAP_MIN_SEC, 10 * median);
    const maxGap = sorted[sorted.length - 1];
    if (maxGap > limit) gapNotes.push(`${id}: ${maxGap.toFixed(1)} s`);
  }
  if (gapNotes.length > 0) {
    out.push({
      severity: "warning",
      code: "large-gap",
      count: gapNotes.length,
      message:
        `Große Lücken in den Messwerten (größer als ${LARGE_GAP_MIN_SEC} s und das 10-Fache des üblichen Abstands) bei ` +
        `${gapNotes.slice(0, MAX_EXAMPLE_ROWS).join("; ")}${gapNotes.length > MAX_EXAMPLE_ROWS ? "; …" : ""}. ` +
        `Beacon evtl. ausgefallen oder verdeckt – Positionsschätzungen in dieser Zeit sind weniger zuverlässig.`,
    });
  }

  if (samples.length === 0) {
    out.push({ severity: "error", code: "no-samples", message: "Der Lauf enthält keine Messwerte." });
  } else if (samples.length < FEW_SAMPLES) {
    out.push({
      severity: "warning",
      code: "few-samples",
      count: samples.length,
      message: `Sehr wenige Messwerte (${samples.length}, empfohlen mindestens ${FEW_SAMPLES}) – Kennzahlen sind kaum aussagekräftig.`,
    });
  }
  return out;
}

export function validateReferences(refs: ReferencePoint[], plan: FloorPlan): DataIssue[] {
  if (refs.length === 0) return [missingReferencesIssue()];
  const c = new IssueCollector();
  let prev = -Infinity;
  refs.forEach((r, i) => {
    const row = rowOf(r, i);
    const { x, y } = r.position ?? { x: NaN, y: NaN };
    if (!Number.isFinite(r.t) || !Number.isFinite(x) || !Number.isFinite(y)) {
      c.add("reference-invalid", "error", row, (n) => `${n} Referenzpunkte mit fehlender/ungültiger Zeit oder Position.`);
      return;
    }
    if (x < 0 || y < 0 || x > plan.width || y > plan.height) {
      c.add(
        "reference-out-of-bounds",
        "error",
        row,
        (n) =>
          `${n} Referenzpunkte liegen außerhalb des Grundrisses (0…${plan.width} × 0…${plan.height} Layout-Einheiten). ` +
          `Koordinaten prüfen: Ursprung ist links oben, y wächst nach unten; Einheit ist die Layout-Zelle, nicht Meter.`,
      );
    }
    if (r.t < prev) {
      c.add(
        "reference-unsorted",
        "warning",
        row,
        () => "Referenzpunkte sind zeitlich nicht aufsteigend sortiert (Sortierung wird beim Import als Transformation vermerkt).",
      );
    }
    prev = Math.max(prev, r.t);
  });
  const out = c.toIssues();
  if (refs.length === 1) {
    out.push({
      severity: "warning",
      code: "few-references",
      count: 1,
      message: "Nur ein Referenzpunkt vorhanden – für Haltephasen werden Start- und Endpunkt benötigt (zwei gleiche Punkte).",
    });
  }
  return out;
}

export interface RunQualityReport {
  durationSec: number;
  sampleCount: number;
  referenceCount: number;
  perBeacon: { beaconId: string; count: number; rateHz: number; maxGapSec: number; known: boolean }[];
  issues: DataIssue[];
  /** false => no reliable evaluation possible, with reasons */
  evaluable: boolean;
  reasons: string[];
}

export function assessRunQuality(run: MeasurementRun, campaign: Campaign): RunQualityReport {
  const knownIds = campaign.beacons.map((b) => b.id);
  const known = new Set(knownIds);
  const samples = run.samples;

  let tMin = Infinity;
  let tMax = -Infinity;
  const byBeacon = new Map<string, number[]>();
  for (const s of samples) {
    if (!Number.isFinite(s.t)) continue;
    if (s.t < tMin) tMin = s.t;
    if (s.t > tMax) tMax = s.t;
    let l = byBeacon.get(s.beaconId);
    if (!l) byBeacon.set(s.beaconId, (l = []));
    l.push(s.t);
  }
  const durationSec = samples.length > 0 && tMax >= tMin ? tMax - tMin : 0;

  const perBeacon = [...byBeacon.entries()]
    .map(([beaconId, ts]) => {
      const sorted = ts.slice().sort((a, b) => a - b);
      let maxGap = 0;
      for (let i = 1; i < sorted.length; i++) maxGap = Math.max(maxGap, sorted[i] - sorted[i - 1]);
      return {
        beaconId,
        count: ts.length,
        rateHz: durationSec > 0 ? ts.length / durationSec : 0,
        maxGapSec: maxGap,
        known: known.has(beaconId),
      };
    })
    .sort((a, b) => a.beaconId.localeCompare(b.beaconId));

  const issues = [...validateSamples(samples, knownIds), ...validateReferences(run.references, campaign.floorPlan)];

  // campaign beacons that were never heard
  const silent = campaign.beacons.filter((b) => b.enabled && !byBeacon.has(b.id)).map((b) => b.id);
  if (silent.length > 0 && samples.length > 0) {
    issues.push({
      severity: "info",
      code: "beacon-never-heard",
      count: silent.length,
      message: `${silent.length} aktivierte Beacon(s) der Kampagne wurden in diesem Lauf nie gehört: ${silent
        .slice(0, MAX_EXAMPLE_ROWS)
        .join(", ")}${silent.length > MAX_EXAMPLE_ROWS ? ", …" : ""}.`,
    });
  }

  const reasons: string[] = [];
  if (samples.length === 0) reasons.push("Keine Messwerte vorhanden.");
  if (run.references.length === 0) reasons.push("Keine Ground Truth – Fehlermetriken nicht berechenbar.");
  if (run.role === "calibration") {
    reasons.push("Kalibrierungslauf: darf nicht zur Bewertung genutzt werden (Datenleck-Schutz).");
  }
  const usable = perBeacon.filter((b) => b.known).length;
  if (samples.length > 0 && usable === 0) reasons.push("Kein einziger Messwert gehört zu einem in der Kampagne angelegten Beacon.");
  for (const i of issues) {
    if (i.severity === "error") reasons.push(`${i.message}`);
  }
  if (samples.length > 0 && samples.length < FEW_SAMPLES) reasons.push("Zu wenige Messwerte für belastbare Kennzahlen.");

  return {
    durationSec,
    sampleCount: samples.length,
    referenceCount: run.references.length,
    perBeacon,
    issues,
    evaluable: reasons.length === 0,
    reasons,
  };
}
