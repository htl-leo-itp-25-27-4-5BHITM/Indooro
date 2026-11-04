import type { DynamicMetrics, ErrorMetrics } from "../../core/types";

export interface MetricDefinition {
  label: string;
  /** German definition shown in tooltips and in the report */
  definition: string;
}

/** Definitions for every field of ErrorMetrics / DynamicMetrics. Keys are type-checked against the core contract. */
export const ERROR_METRIC_DEFINITIONS: Record<Exclude<keyof ErrorMetrics, "unit">, MetricDefinition> = {
  epochsWithTruth: {
    label: "Epochen mit Referenz",
    definition: "Anzahl der Schätzzeitpunkte, zu denen eine Referenzposition (Ground Truth) vorliegt. Nenner für Ausfallrate und Trefferquoten.",
  },
  validEstimates: {
    label: "Gültige Schätzungen",
    definition: "Epochen mit Referenz, für die der Algorithmus eine Position geliefert hat. Nur diese gehen in Mittelwert, Median, RMSE, P90, P95 und Maximum ein.",
  },
  failedEstimates: {
    label: "Fehlschläge",
    definition: "Epochen mit Referenz, für die der Algorithmus keine Position liefern konnte (z. B. zu wenige Beacons). Fehlschläge werden nie stillschweigend verworfen.",
  },
  failureRate: {
    label: "Ausfallrate",
    definition: "Fehlschläge geteilt durch Epochen mit Referenz. 0 % bedeutet, dass in jeder Epoche mit Referenz eine Position vorlag.",
  },
  mean: {
    label: "Mittlerer Fehler",
    definition: "Arithmetisches Mittel der Positionsfehler (Abstand Schätzung–Wahrheit) über alle gültigen Schätzungen. Bedingte Sicht: Fehlschläge sind nicht enthalten.",
  },
  median: {
    label: "Median",
    definition: "Mittlerer Wert der sortierten Positionsfehler (50-%-Quantil, lineare Interpolation, Typ 7). Robust gegenüber Ausreißern.",
  },
  rmse: {
    label: "RMSE",
    definition: "Wurzel aus dem Mittel der quadrierten Positionsfehler. Gewichtet große Fehler stärker als der Mittelwert.",
  },
  p90: {
    label: "P90",
    definition: "90-%-Quantil der Positionsfehler (lineare Interpolation, Typ 7): 90 % der gültigen Schätzungen liegen darunter.",
  },
  p95: {
    label: "P95",
    definition: "95-%-Quantil der Positionsfehler (lineare Interpolation, Typ 7): 95 % der gültigen Schätzungen liegen darunter.",
  },
  max: {
    label: "Maximum",
    definition: "Größter beobachteter Positionsfehler unter den gültigen Schätzungen. Hängt stark von Einzelausreißern ab.",
  },
  within2: {
    label: "Innerhalb 2 m",
    definition: "Anteil der Epochen mit Referenz, deren Fehler höchstens 2 m beträgt. Fehlschläge zählen als nicht innerhalb (End-to-End-Sicht).",
  },
  within3: {
    label: "Innerhalb 3 m",
    definition: "Anteil der Epochen mit Referenz, deren Fehler höchstens 3 m beträgt. Fehlschläge zählen als nicht innerhalb (End-to-End-Sicht).",
  },
  within5: {
    label: "Innerhalb 5 m",
    definition: "Anteil der Epochen mit Referenz, deren Fehler höchstens 5 m beträgt. Fehlschläge zählen als nicht innerhalb (End-to-End-Sicht).",
  },
};

export const DYNAMIC_METRIC_DEFINITIONS: Record<Exclude<keyof DynamicMetrics, "unit">, MetricDefinition> = {
  pairs: {
    label: "Schätzpaare",
    definition: "Aufeinanderfolgende gültige Schätzungen mit zeitlichem Abstand unterhalb der Lückengrenze; Grundlage der Sprungrate.",
  },
  jumps: {
    label: "Sprünge",
    definition: "Anzahl der Schätzpaare, deren implizierte Geschwindigkeit die Sprungschwelle (2 m/s) überschreitet.",
  },
  jumpSpeedThreshold: {
    label: "Sprungschwelle",
    definition: "Implizierte Geschwindigkeit zwischen zwei aufeinanderfolgenden Schätzungen, ab der ein Paar als Sprung zählt (Standard: > 2 m/s).",
  },
  jumpRate: {
    label: "Sprungrate",
    definition: "Anteil der Schätzpaare mit implizierter Geschwindigkeit > 2 m/s. Hoher Wert = unruhige, springende Positionsanzeige.",
  },
  meanStepDistance: {
    label: "Mittlere Schrittweite",
    definition: "Mittlerer Abstand zwischen aufeinanderfolgenden gültigen Schätzungen.",
  },
  lagSec: {
    label: "Verzögerung",
    definition: "Zeitversatz in Sekunden, bei dem der mittlere Fehler der Schätzungen gegenüber der Referenz minimal wird. Positiv = Schätzung hinkt der Wahrheit hinterher. Nur ein Näherungswert.",
  },
  stationaryPrecision: {
    label: "Präzision (stationär)",
    definition: "Streuung der Schätzungen um ihren eigenen Mittelpunkt während eines stationären Halts. Sagt nichts darüber aus, ob der Mittelpunkt an der richtigen Stelle liegt.",
  },
  stationaryBias: {
    label: "Genauigkeit / Bias (stationär)",
    definition: "Abstand zwischen dem Mittelpunkt der Schätzungen und der wahren Position bei einem stationären Halt. Ein systematischer Versatz, der durch Mitteln nicht verschwindet.",
  },
};

export const RSSI_STAT_DEFINITIONS = {
  mean: { label: "Mittelwert", definition: "Arithmetisches Mittel der RSSI-Werte in dBm (Mittelung im logarithmischen dBm-Bereich)." },
  median: { label: "Median", definition: "Mittlerer Wert der sortierten RSSI-Werte; robust gegenüber Ausreißern." },
  std: { label: "Standardabweichung", definition: "Stichproben-Standardabweichung mit Nenner n−1. Maß für das Rauschen des Signals in dB." },
  min: { label: "Minimum", definition: "Schwächster gemessener RSSI-Wert in dBm." },
  max: { label: "Maximum", definition: "Stärkster gemessener RSSI-Wert in dBm." },
  gaps: { label: "Lücken", definition: "Zeitspannen ohne Paket eines Beacons, die länger als die Lückenschwelle sind. Die größte Lücke ist die längste Zeit ohne Signal." },
  rate: { label: "Paketrate", definition: "Empfangene Pakete pro Sekunde (Hz) für diesen Beacon über die Dauer des Laufs." },
  count: { label: "Anzahl Samples", definition: "Anzahl der importierten RSSI-Messwerte dieses Beacons." },
} as const satisfies Record<string, MetricDefinition>;

export const METRIC_DEFINITIONS: Record<string, MetricDefinition> = {
  ...ERROR_METRIC_DEFINITIONS,
  ...DYNAMIC_METRIC_DEFINITIONS,
  ...Object.fromEntries(Object.entries(RSSI_STAT_DEFINITIONS).map(([k, v]) => [`rssi.${k}`, v])),
};

/**
 * Label for the "within threshold" metrics in the actual distance unit.
 * With an unconfirmed scale the thresholds are applied in layout units, so the label must say "LE", never "m".
 */
export function withinLabel(threshold: 2 | 3 | 5, unit: "m" | "LE"): string {
  return `Innerhalb ${threshold} ${unit}`;
}
