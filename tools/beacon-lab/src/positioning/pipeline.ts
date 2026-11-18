import { fnv1aHex, stableStringify } from "../core/hash";
import type {
  Campaign,
  ErrorMetrics,
  EvaluationOptions,
  EvaluationResult,
  MeasurementRun,
  PositionEstimate,
  PositioningConfig,
} from "../core/types";
import { ALGORITHMS, prepareObservations, type AlgorithmContext } from "./algorithms";
import { MAX_EPOCHS, buildEpochs } from "./epochs";
import { LeakageError } from "./errors";
import { buildFingerprints } from "./fingerprint";
import { filterSamplesPerBeacon } from "./filters";
import { computeDynamicMetrics, computeErrorMetrics } from "./metrics";
import { makeTruthResolver, runHolds } from "./reference";
import { applyTemporalFilter } from "./temporal";

export { LeakageError } from "./errors";

/** Fewer evaluated epochs than this are flagged "explorativ". */
export const MIN_EPOCHS_FOR_CONFIDENCE = 100;

export interface RunPositioningArgs {
  run: MeasurementRun;
  campaign: Campaign;
  config: PositioningConfig;
  options: EvaluationOptions;
  /** calibration runs for fingerprints (kNN). Must all have role "calibration" and differ from `run`. */
  calibrationRuns?: MeasurementRun[];
}

/**
 * Full pipeline: filter -> epochs -> algorithm -> temporal -> truth -> errors -> metrics.
 *
 * Leakage rules (LeakageError):
 *  - `run.role === "calibration"` (never evaluate on calibration data);
 *  - any calibration run has role "evaluation", the same id as `run` or identical raw data (provenance.sha256);
 *  - the algorithm uses a path-loss model that was fitted on `run` (fittedOnRunIds).
 * Pure: inputs are not mutated. Everything else (empty data, degenerate geometry, NaN) yields failures in
 * the estimates / warnings, not exceptions.
 *
 * Path loss: per beacon `beacon.pathLoss ?? campaign.pathLoss`. Distances in the model are metres and are
 * converted to layout units with floorPlan.scale.metersPerUnit inside the algorithms.
 *
 * configHash = fnv1a(stableStringify({config, options, runSha, beacons, pathLoss, scale, calibration})) where
 * `calibration` (sha256 of the calibration runs) is only present if fingerprints were used.
 */
export function runPositioning(args: RunPositioningArgs): EvaluationResult {
  const { run, campaign, config, options } = args;
  const calibrationRuns = args.calibrationRuns ?? [];

  if (run.role === "calibration") {
    throw new LeakageError(
      `Datenleck: Lauf „${run.name}“ (${run.id}) ist ein Kalibrierungslauf und darf nicht ausgewertet werden. Auswertung nur auf Läufen mit der Rolle „evaluation“.`,
    );
  }
  for (const c of calibrationRuns) {
    if (c.role === "evaluation") {
      throw new LeakageError(`Datenleck: Lauf „${c.name}“ (${c.id}) ist ein Auswertungslauf und darf nicht zur Kalibrierung dienen.`);
    }
    if (c.id === run.id) {
      throw new LeakageError(`Datenleck: Kalibrierungs- und Auswertungslauf sind identisch („${run.name}“, ${run.id}).`);
    }
    // Content check: identical raw data (same file / same generator config) under another id or role.
    if (c.provenance?.sha256 && c.provenance.sha256 === run.provenance?.sha256) {
      throw new LeakageError(
        `Datenleck: Kalibrierungslauf „${c.name}“ hat dieselben Rohdaten (SHA-256 ${c.provenance.sha256.slice(0, 12)}…) wie der Auswertungslauf „${run.name}“.`,
      );
    }
  }

  const algorithm = ALGORITHMS[config.algorithm];
  if (algorithm.requires.calibration) {
    const models = [{ owner: "Kampagnenmodell", m: campaign.pathLoss }, ...campaign.beacons.map((b) => ({ owner: `Beacon ${b.id}`, m: b.pathLoss }))];
    for (const { owner, m } of models) {
      if (m?.fittedOnRunIds?.includes(run.id)) {
        throw new LeakageError(
          `Datenleck: Das Pfadverlustmodell (${owner}) wurde auf dem Lauf „${run.name}“ gefittet und darf nicht auf demselben Lauf ausgewertet werden.`,
        );
      }
    }
  }
  const scale = campaign.floorPlan.scale;
  const mpu = scale.metersPerUnit;
  const warnings: string[] = [];

  const fingerprints = algorithm.requires.fingerprints ? buildFingerprints(calibrationRuns, config) : undefined;
  if (algorithm.requires.fingerprints && (fingerprints?.length ?? 0) === 0) {
    warnings.push("Keine Fingerprints verfügbar: kNN-Fingerprinting braucht Kalibrierungsläufe mit stationären Haltepunkten – alle Epochen schlagen fehl.");
  }

  const ctx: AlgorithmContext = {
    beacons: campaign.beacons,
    plan: campaign.floorPlan,
    pathLoss: campaign.pathLoss,
    params: config.params,
    fingerprints,
  };

  // 1-2) filter + epochs
  const filtered = filterSamplesPerBeacon(run.samples, config.rssiFilter);
  const epochs = buildEpochs(filtered, config);
  if (epochs.length >= MAX_EPOCHS) {
    warnings.push(
      `Epochenzahl auf ${MAX_EPOCHS.toLocaleString("de-AT")} begrenzt: Der Lauf wurde nach dieser Epoche ABGESCHNITTEN, spätere Daten fehlen in allen Kennzahlen. Schrittweite erhöhen oder Zeitbasis prüfen (Millisekunden als Sekunden importiert?).`,
    );
  }
  if (config.rssiFilter.outlier.enabled) {
    warnings.push(
      "Hampel-Ausreißerfilter aktiv: Er arbeitet mit einem zentrierten Fenster und nutzt damit auch spätere Samples (nicht kausal). Ergebnisse sind daher nicht exakt in Echtzeit reproduzierbar.",
    );
  }

  // 3) algorithm per epoch
  const raw = epochs.map((ep) => {
    const out = algorithm.estimate(ep, ctx);
    const inputs = prepareObservations(ep, ctx).map((o) => ({ beaconId: o.beacon.id, rssi: o.rssi }));
    return { t: ep.t, out, inputs };
  });

  // 4) temporal filter
  const finalPositions = applyTemporalFilter(
    raw.map((r) => ({ t: r.t, position: r.out.position })),
    config.temporal,
    mpu,
  );

  // 5) truth + errors
  const holds = runHolds(run);
  const truthOf = makeTruthResolver(run.references, options, holds);
  const estimates: PositionEstimate[] = raw.map((r, i) => {
    const position = finalPositions[i];
    const truth = truthOf(r.t);
    const errorUnits = position && truth ? Math.hypot(position.x - truth.x, position.y - truth.y) : null;
    const est: PositionEstimate = {
      t: r.t,
      position,
      rawPosition: r.out.position ? { ...r.out.position } : null,
      inputs: r.inputs,
      truth,
      errorUnits: errorUnits !== null && Number.isFinite(errorUnits) ? errorUnits : null,
    };
    if (!r.out.position) est.failureReason = r.out.reason;
    return est;
  });

  // 6) metrics
  const metrics = computeErrorMetrics(estimates, scale);
  const dynamic = computeDynamicMetrics(estimates, run.references, scale, {
    lag: run.kind === "walk" && options.referenceMatching === "interpolate",
    holds,
  });

  // warnings
  if (run.samples.length === 0) warnings.push("Der Lauf enthält keine Messwerte.");
  if (algorithm.requires.calibration) {
    const models = campaign.beacons.filter((b) => b.enabled).map((b) => b.pathLoss ?? campaign.pathLoss);
    if (models.length === 0) models.push(campaign.pathLoss);
    if (models.some((m) => m.source === "default")) {
      warnings.push(
        "Achtung: unkalibriertes Pfadverlustmodell (Standardwerte −72 dBm @ 1 m, n = 2,8 – nicht feldkalibriert). Distanzen und Trilaterationsergebnisse sind nur als Vergleichsbasis zu lesen.",
      );
    }
    if (models.some((m) => m.source === "manual")) {
      warnings.push("Pfadverlustmodell manuell eingetragen und nicht anhand von Messdaten verifiziert.");
    }
  }
  if (!scale.confirmed) {
    warnings.push(
      `Maßstab nicht bestätigt: Fehler sind in Layout-Einheiten (LE), nicht in Metern angegeben; die Schwellen 2/3/5 gelten in LE. Distanzen aus dem Pfadverlustmodell (Meter) werden mit ${mpu} m/LE umgerechnet.`,
    );
  }
  if (run.references.length === 0) {
    warnings.push("Keine Referenzpunkte: Genauigkeit kann nicht bestimmt werden (nur Verfügbarkeit und Dynamik).");
  } else if (metrics.epochsWithTruth === 0) {
    warnings.push("Kein Epochen-Zeitpunkt liegt innerhalb der Referenz-Zuordnung (Toleranz/Haltepunkte): keine Fehlermetrik möglich.");
  }
  if (run.kind === "stationary" && run.references.length === 1) {
    warnings.push("Stationärer Lauf mit nur einem Referenzpunkt: Es wird angenommen, dass das Gerät während der gesamten Laufzeit dort stand.");
  }
  if (options.referenceMatching === "interpolate") {
    warnings.push("Referenz per linearer Interpolation: Annahme konstanter Gehgeschwindigkeit zwischen Referenzpunkten – die Referenz selbst ist unsicher.");
  }
  if (metrics.epochsWithTruth > 0 && metrics.epochsWithTruth < MIN_EPOCHS_FOR_CONFIDENCE) {
    warnings.push(`Nur ${metrics.epochsWithTruth} ausgewertete Epochen (< ${MIN_EPOCHS_FOR_CONFIDENCE}): explorativ, P90/P95 nicht belastbar.`);
  }
  const known = new Set(campaign.beacons.map((b) => b.id));
  const unknownIds = [...new Set(run.samples.map((s) => s.beaconId).filter((id) => !known.has(id)))];
  if (unknownIds.length > 0) {
    warnings.push(`${unknownIds.length} Beacon-ID(s) im Lauf sind in der Kampagne unbekannt und wurden ignoriert: ${unknownIds.slice(0, 5).join(", ")}${unknownIds.length > 5 ? " …" : ""}.`);
  }
  if (run.origin === "synthetic" || campaign.floorPlan.origin === "synthetic") {
    warnings.push("Synthetische Daten: Ergebnisse gelten nur für die Simulation, nicht für reale Hardware oder Räume.");
  }
  if (config.temporal.kind !== "none" || config.temporal.maxSpeedMps > 0) {
    warnings.push("Zeitliche Glättung aktiv: ruhigere Pfade bedeuten nicht automatisch höhere Genauigkeit (Verzögerung/Bias prüfen).");
  }

  const configHash = fnv1aHex(
    stableStringify({
      config,
      options,
      runSha: run.provenance.sha256,
      beacons: campaign.beacons,
      pathLoss: campaign.pathLoss,
      scale,
      calibration: algorithm.requires.fingerprints ? calibrationRuns.map((c) => c.provenance.sha256) : undefined,
    }),
  );

  return {
    runId: run.id,
    runName: run.name,
    origin: run.origin,
    config,
    options,
    configHash,
    estimates,
    metrics,
    dynamic,
    warnings,
    computedAt: new Date().toISOString(),
  };
}

export interface ComparisonResult {
  results: EvaluationResult[];
  /** number of epochs (same t) where ALL configs had a valid estimate and truth */
  commonEpochs: number;
  /** metrics restricted to the common epochs, one per config (same order as `results`) */
  common: ErrorMetrics[];
}

/**
 * Runs several configurations on the same run and additionally computes the metrics on the COMMON epoch set:
 * epochs (matched by identical `t`) where every configuration produced a valid estimate and truth exists.
 * This removes survivorship bias (an algorithm that fails on hard epochs would otherwise look better).
 * Configs with different stepSec/window share few identical timestamps, so commonEpochs may be small –
 * compare configs with the same stepSec.
 */
export function compareAlgorithms(args: Omit<RunPositioningArgs, "config"> & { configs: PositioningConfig[] }): ComparisonResult {
  const { configs, ...rest } = args;
  const results = configs.map((config) => runPositioning({ ...rest, config }));
  if (results.length === 0) return { results, commonEpochs: 0, common: [] };
  const valid = results.map((r) => {
    const s = new Set<number>();
    for (const e of r.estimates) if (e.position && e.truth) s.add(e.t);
    return s;
  });
  const common = new Set<number>([...valid[0]].filter((t) => valid.every((s) => s.has(t))));
  const scale = args.campaign.floorPlan.scale;
  return {
    results,
    commonEpochs: common.size,
    common: results.map((r) => computeErrorMetrics(r.estimates.filter((e) => common.has(e.t)), scale)),
  };
}
