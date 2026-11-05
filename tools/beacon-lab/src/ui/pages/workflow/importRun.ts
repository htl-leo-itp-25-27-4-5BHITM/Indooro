import { newId } from "../../../core/ids";
import type { DataOrigin, MeasurementRun, RunKind, RunRole } from "../../../core/types";
import type { ImportOutcome } from "../../../data/import";

export interface NewRunMeta {
  campaignId: string;
  name: string;
  kind: RunKind;
  role: RunRole;
  origin: DataOrigin;
  notes?: string;
}

/**
 * Builds a MeasurementRun from a successful import outcome. Samples, references and provenance are taken over
 * exactly as `runImport` produced them – nothing is altered here.
 */
export function buildRunFromOutcome(outcome: ImportOutcome, meta: NewRunMeta, now: Date = new Date()): MeasurementRun {
  if (!outcome.ok) throw new Error("Der Import enthält blockierende Fehler – es wird keine Messreihe angelegt.");
  return {
    id: newId("run"),
    campaignId: meta.campaignId,
    name: meta.name.trim() || outcome.provenance.fileName,
    kind: meta.kind,
    role: meta.role,
    origin: meta.origin,
    notes: meta.notes,
    // device from the recording's session line (indooro-recording/2), if any
    ...(outcome.suggested?.deviceId ? { deviceId: outcome.suggested.deviceId } : {}),
    createdAt: now.toISOString(),
    samples: outcome.samples,
    references: outcome.references,
    provenance: outcome.provenance,
  };
}

/** Default origin for an imported file: real, unless the file name or the file itself says synthetic. */
export function guessOrigin(fileName: string, suggested?: DataOrigin): DataOrigin {
  if (suggested) return suggested;
  return /^synthetic|^synthetisch/i.test(fileName.trim()) ? "synthetic" : "real";
}

export function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}
