# Architektur – Indooro Positioning Lab

Eigenständige, lokal laufende Webanwendung (React 19 + TypeScript + Vite 7 + Tailwind CSS 4).
Kein Backend, keine Authentifizierung, keine Netzwerkzugriffe zur Laufzeit. Alle Daten bleiben im Browser
(IndexedDB) bzw. in exportierten Dateien.

```
tools/beacon-lab/
  src/core/        gemeinsame Typen, Hash, Defaults, Einheiten         (Opus – Vertrag)
  src/data/        Import, Validierung, Persistenz, Export, Synthetik  (Sonnet 1)
  src/positioning/ Filter, Algorithmen, Kalibrierung, Metriken, Pipeline (Sonnet 2)
  src/map/         Grundriss, Marker, Heatmaps, Replay                 (Sonnet 3)
  src/ui/          Shell, Designsystem, Seiten, Diagramme              (Sonnet 4)
  src/report/      Messbericht (HTML, druckbar), CSV/JSON-Export       (Sonnet 4)
  e2e/             Playwright                                         (Sonnet 5)
```

Abhängigkeitsrichtung: `core <- data, positioning <- map, report <- ui`. `positioning` kennt `data` nicht
(reine Funktionen über `core`-Typen). Keine zyklischen Importe.

## Datenfluss (Kernpipeline)

```
Datei (CSV / JSON / Indooro-JSONL)
  -> data/import  parse + Spaltenzuordnung        -> ParseResult (Rohzeilen, Issues)
  -> data/validate Prüfung (keine stille Korrektur) -> MeasurementRun (Rohdaten unverändert) + Provenance
  -> positioning/pipeline  runPositioning(run, campaign, config, options)
        1. RSSI-Filter je Beacon (Kopie, Rohdaten bleiben)       positioning/filters
        2. Epochen alle stepSec, Fenster windowSec, staleSec     positioning/epochs
        3. Algorithmus je Epoche (gemeinsame Schnittstelle)      positioning/algorithms
        4. Zeitlicher Filter auf Positionen                       positioning/temporal
        5. Ground Truth je Epoche (hold-or-nearest / interpolate) positioning/reference
        6. Metriken                                               positioning/metrics
  -> EvaluationResult -> map (Heatmap, Replay), ui (Vergleich), report (Bericht, Export)
```

## Modul-Schnittstellen (verbindlich)

### `src/core`
```ts
// core/types.ts           – alle Domänentypen
// core/defaults.ts
export const DEFAULT_PATH_LOSS: PathLossModel;              // source: "default"
export const DEFAULT_POSITIONING_CONFIG: PositioningConfig;
export const DEFAULT_EVALUATION_OPTIONS: EvaluationOptions;
export function defaultScale(): MapScale;                   // 1 m/LE, confirmed=false
// core/units.ts
export function distanceUnit(scale: MapScale): "m" | "LE";  // "m" nur wenn scale.confirmed
export function toDisplayDistance(units: number, scale: MapScale): number;
export function formatDistance(units: number | null, scale: MapScale, digits?: number): string;
// core/hash.ts
export async function sha256Hex(data: ArrayBuffer | string): Promise<string>;
export function stableStringify(value: unknown): string;   // sortierte Keys
export function fnv1aHex(text: string): string;            // synchroner Kurz-Hash für configHash
// core/random.ts
export function mulberry32(seed: number): () => number;
export function gaussian(rng: () => number): number;       // Box-Muller, N(0,1)
// core/ids.ts
export function newId(prefix: string): string;
```

### `src/data` (Sonnet 1)
```ts
// data/csv.ts
export function parseCsv(text: string): { header: string[]; rows: string[][]; delimiter: string };
// data/import.ts
export type TargetField = "t" | "beaconId" | "rssi" | "deviceId" | "refX" | "refY" | "refLabel" | "runName" | "kind";
export interface ColumnMapping { [K in TargetField]?: string }
export function detectFormat(fileName: string, text: string): ImportFormat;
export function suggestColumnMapping(header: string[]): ColumnMapping;
export interface ImportDraft {
  format: ImportFormat; fileName: string; header: string[]; previewRows: string[][];
  mapping: ColumnMapping; requiredMissing: TargetField[];
}
export function prepareImport(fileName: string, text: string): ImportDraft;
export interface ImportOutcome {
  ok: boolean;                     // false => blocking errors, run must not be created
  samples: RssiSample[]; references: ReferencePoint[];
  provenance: ImportProvenance;    // issues + transformations
  /** beacons found in the file but not in the campaign */ unknownBeaconIds: string[];
  /** layout found inside an Indooro recording ("layout" line) – metadata only */
  layoutInfo?: { layoutId?: string; revision?: number; shopName?: string };
}
export async function runImport(args: {
  fileName: string; text: string; mapping?: ColumnMapping; knownBeaconIds: string[];
  timeFormat?: "auto" | "epoch-s" | "epoch-ms" | "iso";
}): Promise<ImportOutcome>;
// data/validate.ts – reine Prüfungen, liefern DataIssue[]
export function validateSamples(samples: RssiSample[], knownBeaconIds: string[]): DataIssue[];
export function validateReferences(refs: ReferencePoint[], plan: FloorPlan): DataIssue[];
export function assessRunQuality(run: MeasurementRun, campaign: Campaign): RunQualityReport;
export interface RunQualityReport {
  durationSec: number; sampleCount: number; referenceCount: number;
  perBeacon: { beaconId: string; count: number; rateHz: number; maxGapSec: number; known: boolean }[];
  issues: DataIssue[];
  /** false => no reliable evaluation possible, with reasons */
  evaluable: boolean; reasons: string[];
}
// data/layout.ts – Indooro-Layout-JSON -> FloorPlan + Beacons
export function floorPlanFromIndooroLayout(json: unknown, fileName: string):
  { plan: FloorPlan; beacons: Beacon[]; issues: DataIssue[] };
export function demoFloorPlan(): { plan: FloorPlan; beacons: Beacon[] };  // fiktiver Markt, origin synthetic
// data/synthetic.ts
export const SCENARIOS: { id: SyntheticScenarioId; title: string; description: string; kind: RunKind }[];
export function defaultScenarioConfig(id: SyntheticScenarioId, seed?: number): SyntheticScenarioConfig;
export function generateSyntheticRun(campaign: Campaign, cfg: SyntheticScenarioConfig, role: RunRole): MeasurementRun;
export function createDemoCampaign(): { campaign: Campaign; runs: MeasurementRun[] };
// data/store.ts – IndexedDB "indooro-positioning-lab"
export const store: {
  listCampaigns(): Promise<Campaign[]>; getCampaign(id: string): Promise<Campaign | undefined>;
  saveCampaign(c: Campaign): Promise<void>; deleteCampaign(id: string): Promise<void>;
  listRuns(campaignId: string): Promise<MeasurementRun[]>; saveRun(r: MeasurementRun): Promise<void>;
  deleteRun(id: string): Promise<void>;
  listResults(campaignId: string): Promise<SavedEvaluation[]>; saveResult(r: SavedEvaluation): Promise<void>;
};
export interface SavedEvaluation { id: string; campaignId: string; label: string; result: EvaluationResult }
// data/export.ts
export function campaignBundle(c: Campaign, runs: MeasurementRun[]): CampaignBundle; // JSON, schemaVersion
export function parseCampaignBundle(text: string): { bundle?: CampaignBundle; issues: DataIssue[] };
export function samplesToCsv(run: MeasurementRun): string;
export function estimatesToCsv(result: EvaluationResult, scale: MapScale): string;
export function downloadText(fileName: string, text: string, mime: string): void;
```

### `src/positioning` (Sonnet 2)
```ts
// positioning/stats.ts
export function mean(xs: number[]): number | null; median; std (sample, n-1); percentile(xs, p /*0..100*/) // linear, type 7
export function summarize(xs: number[]): { n, mean, median, std, min, max, p5, p95 } ;
// positioning/filters.ts – reine Funktionen, Eingabe wird nie verändert
export function filterSeries(values: number[], cfg: RssiFilterConfig): number[];
export function hampel(values: number[], window: number, k: number): { values: number[]; outlierIdx: number[] };
export function filterSamplesPerBeacon(samples: RssiSample[], cfg: RssiFilterConfig): RssiSample[]; // neue Objekte
// positioning/pathloss.ts
export function rssiToDistance(rssi: number, m: PathLossModel): number;   // Meter
export function distanceToRssi(d: number, m: PathLossModel): number;
export function fitPathLoss(pairs: { distanceM: number; rssi: number }[]): PathLossModel | { error: string };
export function calibrateFromRuns(runs: MeasurementRun[], campaign: Campaign, cfg: PositioningConfig):
  { model?: PathLossModel; perBeacon: Record<string, PathLossModel | { error: string }>; error?: string };
// positioning/algorithms.ts – gemeinsame Schnittstelle
export interface EpochInput { t: number; observations: { beaconId: string; rssi: number }[] }
export interface AlgorithmContext {
  beacons: Beacon[]; plan: FloorPlan; pathLoss: PathLossModel; params: AlgorithmParams;
  fingerprints?: Fingerprint[];  // nur aus Kalibrierungsläufen
}
export interface Fingerprint { position: Point; rssi: Record<string, number>; runId: string }
export type AlgorithmOutput = { position: Point } | { position: null; reason: string };
export interface PositioningAlgorithm {
  id: AlgorithmId; name: string; description: string;
  requires: { calibration: boolean; fingerprints: boolean; minBeacons: number };
  estimate(input: EpochInput, ctx: AlgorithmContext): AlgorithmOutput;
}
export const ALGORITHMS: Record<AlgorithmId, PositioningAlgorithm>;
// positioning/fingerprint.ts
export function buildFingerprints(runs: MeasurementRun[], cfg: PositioningConfig): Fingerprint[];
// positioning/epochs.ts
export function buildEpochs(samples: RssiSample[], cfg: PositioningConfig): EpochInput[];
// positioning/temporal.ts
export function applyTemporalFilter(est: { t: number; position: Point | null }[], cfg: TemporalFilterConfig,
  metersPerUnit: number): (Point | null)[];
// positioning/reference.ts
export function truthAt(t: number, refs: ReferencePoint[], opts: EvaluationOptions): Point | null;
export function stationaryHolds(refs: ReferencePoint[]): { start: number; end: number; position: Point }[];
// positioning/metrics.ts
export function computeErrorMetrics(est: PositionEstimate[], scale: MapScale): ErrorMetrics;
export function computeDynamicMetrics(est: PositionEstimate[], refs: ReferencePoint[], scale: MapScale,
  opts?: { jumpSpeedMps?: number; maxGapSec?: number }): DynamicMetrics;
export function errorCdf(est: PositionEstimate[], scale: MapScale): { x: number; p: number }[];
// positioning/pipeline.ts
export function runPositioning(args: {
  run: MeasurementRun; campaign: Campaign; config: PositioningConfig; options: EvaluationOptions;
  calibrationRuns?: MeasurementRun[];
}): EvaluationResult;   // wirft LeakageError, wenn run.role === "calibration"
export class LeakageError extends Error {}
export function compareAlgorithms(args: {...same, configs: PositioningConfig[]}): ComparisonResult;
export interface ComparisonResult { results: EvaluationResult[]; commonEpochs: number; /** metrics nur über Epochen, in denen ALLE Verfahren gültig waren */ common: ErrorMetrics[] }
```

### `src/map` (Sonnet 3), `src/ui` und `src/report` (Sonnet 4)
React-Komponenten. Die Karte rendert per SVG im Layout-Koordinatensystem (`viewBox` in Layout-Einheiten,
`preserveAspectRatio="xMidYMid meet"`, also keine Verzerrung). Zoomen und Verschieben erfolgen über eine viewBox-Transformation.

## Grundsätze

1. **Rohdaten sind unveränderlich.** Filter erzeugen neue Arrays. Jede Transformation beim Import steht in
   `provenance.transformations`.
2. **Keine stille Korrektur.** Ungültige Zeilen werden verworfen *und* als Issue mit Zeilennummer gemeldet.
   Mehrdeutige Zeitformate oder Einheiten blockieren den Import, bis der Nutzer entscheidet.
3. **Kein Meter ohne Maßstab.** Bei `scale.confirmed === false` werden Fehler in „LE“ (Layout-Einheiten) angezeigt.
4. **Kein Leakage.** Kalibrierung und Fingerprints nur aus `role === "calibration"`, Evaluation nur auf
   `role === "evaluation"`. Die Pipeline erzwingt das.
5. **Fehlschläge zählen.** `failureRate` wird immer berichtet; `within*` zählt Fehlschläge als „nicht innerhalb“;
   Vergleiche werden zusätzlich auf der gemeinsamen Epochenmenge berechnet.
6. **Synthetisch bleibt synthetisch.** `origin` wird bis in Tabellen, Diagramme und Bericht durchgereicht.
