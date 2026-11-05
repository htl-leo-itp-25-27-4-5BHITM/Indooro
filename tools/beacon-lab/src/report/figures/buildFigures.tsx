import type { Campaign, EvaluationResult, Point } from "../../core/types";
import { distanceUnit, toDisplayDistance } from "../../core/units";
import { BarChart, BoxPlot, CdfChart, chartToSvgString } from "../../ui/charts";
import { describeConfig } from "../../ui/shared/ConfigEditor";
import { ORIGIN_TEXT } from "../reportModel";
import type { ReportFigureInput } from "../reportModel";
import { DEFAULT_CELL_SIZE, MAX_FIGURE_POINTS, countEstimates, renderErrorHeatmapSvg, renderFloorPlanSvg } from "./floorPlanSvg";

export type FigureKind = "cdf" | "floorplan" | "heatmap" | "box" | "bar";

export const FIGURE_KINDS: { id: FigureKind; label: string; scope: "je Ergebnis" | "Ergebnisvergleich" }[] = [
  { id: "cdf", label: "Kumulative Fehlerverteilung (CDF)", scope: "je Ergebnis" },
  { id: "floorplan", label: "Grundriss mit Schätzungen und Fehlervektoren", scope: "je Ergebnis" },
  { id: "heatmap", label: "Fehler-Heatmap (Mittelwert je Zelle)", scope: "je Ergebnis" },
  { id: "box", label: "Boxplot der Fehler je Konfiguration", scope: "Ergebnisvergleich" },
  { id: "bar", label: "Ausfallrate je Konfiguration", scope: "Ergebnisvergleich" },
];
export const ALL_FIGURE_KINDS: FigureKind[] = FIGURE_KINDS.map((k) => k.id);

export interface SelectedResult {
  id: string;
  result: EvaluationResult;
}

export interface BuildFiguresInput {
  campaign: Campaign;
  results: SelectedResult[];
  kinds?: ReadonlySet<FigureKind> | FigureKind[];
  cellSize?: number;
  maxPoints?: number;
}

/** "Lauf · Verfahren (Filter …)" – the label used for a configuration in all figures. */
export function configLabel(r: EvaluationResult): string {
  return `${r.runName} · ${describeConfig(r.config)}`;
}

function validErrorValues(r: EvaluationResult, campaign: Campaign): number[] {
  const out: number[] = [];
  for (const e of r.estimates) if (e.truth && e.position && e.errorUnits !== null && Number.isFinite(e.errorUnits)) out.push(toDisplayDistance(e.errorUnits, campaign.floorPlan.scale));
  return out;
}

function unitNote(campaign: Campaign): string {
  return campaign.floorPlan.scale.confirmed ? "Einheit: m (Maßstab bestätigt)" : "Einheit: LE = Layout-Einheiten (Maßstab nicht bestätigt)";
}

const originNote = (r: EvaluationResult): string => `Herkunft: ${ORIGIN_TEXT[r.origin]}`;
const originNoteMany = (rs: EvaluationResult[]): string => `Herkunft: ${[...new Set(rs.map((r) => ORIGIN_TEXT[r.origin]))].join(" + ")}`;
const COORD_NOTE = "Ursprung (0,0) links oben, x nach rechts, y nach unten";

/** Common caption head: run, configuration, hash, counts, unit, origin. */
function head(r: EvaluationResult, campaign: Campaign, valid: number, failed: number): string {
  return `Lauf „${r.runName}“; Verfahren: ${describeConfig(r.config)}; configHash ${r.configHash}; n gültig = ${valid}, n Fehlschläge = ${failed}; ${unitNote(campaign)}; ${originNote(r)}.`;
}

function uniquePositions(points: (Point | null)[]): Point[] {
  const seen = new Set<string>();
  const out: Point[] = [];
  for (const p of points) {
    if (!p) continue;
    const key = `${p.x.toFixed(3)}|${p.y.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/**
 * Builds all report figures for the selected results. Deterministic and pure (no DOM): identical input gives identical
 * SVG strings. Figures without data (e.g. no truth) are omitted instead of drawn empty.
 */
export function buildReportFigures(input: BuildFiguresInput): ReportFigureInput[] {
  const { campaign, results } = input;
  const kinds = new Set<FigureKind>(input.kinds ?? ALL_FIGURE_KINDS);
  const maxPoints = input.maxPoints ?? MAX_FIGURE_POINTS;
  const cellSize = input.cellSize ?? DEFAULT_CELL_SIZE;
  const plan = campaign.floorPlan;
  const unit = distanceUnit(plan.scale);
  const out: ReportFigureInput[] = [];

  for (const { id, result: r } of results) {
    if (r.metrics.epochsWithTruth === 0) continue;
    const label = configLabel(r);
    const synthetic = r.origin === "synthetic";
    const counts = countEstimates(r.estimates, plan);

    if (kinds.has("cdf")) {
      out.push({
        id: `cdf-${id}`,
        title: `Fehlerverteilung: ${label}`,
        svg: chartToSvgString(
          <CdfChart
            title={`Kumulative Fehlerverteilung – ${label}`}
            series={[{ id, label, values: validErrorValues(r, campaign), total: r.metrics.epochsWithTruth }]}
            unit={unit}
            synthetic={synthetic}
            width={720}
            height={320}
          />,
        ),
        caption: `Kumulative Verteilung des Positionsfehlers. ${head(r, campaign, counts.valid, counts.failed)} Fehlschläge zählen als „nicht innerhalb“.`,
      });
    }

    if (kinds.has("floorplan")) {
      const fig = renderFloorPlanSvg({
        plan,
        beacons: campaign.beacons,
        estimates: r.estimates,
        references: uniquePositions(r.estimates.map((e) => e.truth)),
        unit,
        metersPerUnit: plan.scale.metersPerUnit,
        synthetic,
        title: `Grundriss: ${label}`,
        idPrefix: `fp-${id}`,
        maxPoints,
      });
      const c = fig.counts;
      const extra = [
        c.decimationStep > 1 ? `Darstellung deterministisch ausgedünnt: jede ${c.decimationStep}. gültige Schätzung, ${c.drawn} von ${c.valid} gezeichnet (Kennzahlen nutzen alle)` : null,
        c.failed > 0 ? `${c.failed} Fehlschläge ohne Position werden nicht gezeichnet` : null,
        c.withoutTruth > 0 ? `${c.withoutTruth} Schätzungen ohne Referenz in Grau, ohne Fehlervektor` : null,
        c.outsidePlan > 0 ? `${c.outsidePlan} gültige Schätzungen liegen außerhalb des Grundrisses und sind abgeschnitten` : null,
      ].filter(Boolean);
      out.push({
        id: `floorplan-${id}`,
        title: `Grundriss mit Schätzungen: ${label}`,
        svg: fig.svg,
        caption: `Schätzpunkte nach Fehler eingefärbt, Linie = Fehlervektor vom Referenzpunkt zur Schätzung; Grundriss ${plan.width} × ${plan.height} LE unverzerrt, ${COORD_NOTE}. ${head(r, campaign, c.valid, c.failed)}${extra.length ? ` ${extra.join("; ")}.` : ""}`,
      });
    }

    if (kinds.has("heatmap")) {
      const fig = renderErrorHeatmapSvg({
        plan,
        beacons: campaign.beacons,
        estimates: r.estimates,
        unit,
        metersPerUnit: plan.scale.metersPerUnit,
        synthetic,
        title: `Fehler-Heatmap: ${label}`,
        idPrefix: `hm-${id}`,
        cellSize,
      });
      const c = fig.counts;
      out.push({
        id: `heatmap-${id}`,
        title: `Fehler-Heatmap: ${label}`,
        svg: fig.svg,
        caption: `Mittelwert je Zelle, keine Interpolation. Zellgröße ${cellSize} LE; gefärbt nur Zellen mit Referenzpositionen (${fig.cellsWithData} von ${fig.cellsWithData + fig.cellsWithoutData}), schraffierte Zellen (${fig.cellsWithoutData}) enthalten keine Daten. Fehlschläge fließen nicht in den Mittelwert ein. ${head(r, campaign, c.valid, c.failed)}`,
      });
    }
  }

  const withData = results.filter((s) => s.result.metrics.epochsWithTruth > 0);
  if (withData.length >= 2) {
    const rs = withData.map((s) => s.result);
    const labels = rs.map(configLabel);
    const perConfig = rs
      .map((r, i) => {
        const c = countEstimates(r.estimates);
        return `${labels[i]} (configHash ${r.configHash.slice(0, 12)}…): n gültig = ${c.valid}, n Fehlschläge = ${c.failed}`;
      })
      .join("; ");
    const synthetic = rs.some((r) => r.origin === "synthetic");

    if (kinds.has("box")) {
      out.push({
        id: "box-compare",
        title: "Fehlerverteilung je Konfiguration (Boxplot)",
        svg: chartToSvgString(
          <BoxPlot
            title="Positionsfehler je Konfiguration"
            groups={withData.map((s, i) => ({ id: s.id, label: labels[i], values: validErrorValues(s.result, campaign) }))}
            valueLabel={`Positionsfehler (${unit})`}
            unit={unit}
            synthetic={synthetic}
            width={Math.max(720, 170 * rs.length)}
            height={340}
          />,
        ),
        caption: `Box = Quartile Q1–Q3 mit Median, Whisker bis 1,5 × IQR, Punkte = Ausreißer; Statistik über alle gültigen Schätzungen (keine Ausdünnung), Fehlschläge sind nicht enthalten. Läufe können unterschiedliche Epochenmengen haben. ${perConfig}. ${unitNote(campaign)}; ${originNoteMany(rs)}.`,
      });
    }

    if (kinds.has("bar")) {
      out.push({
        id: "bar-failure",
        title: "Ausfallrate je Konfiguration",
        svg: chartToSvgString(
          <BarChart
            title="Ausfallrate je Konfiguration"
            categories={labels}
            series={[{ id: "failure", label: "Ausfallrate", values: rs.map((r) => (r.metrics.failureRate === null || !Number.isFinite(r.metrics.failureRate) ? null : r.metrics.failureRate * 100)) }]}
            valueLabel="Ausfallrate (%)"
            unit="%"
            orientation="horizontal"
            digits={1}
            synthetic={synthetic}
            width={720}
            height={Math.max(220, 60 + 44 * rs.length)}
          />,
        ),
        caption: `Ausfallrate = Fehlschläge / Epochen mit Referenz. ${perConfig}. ${originNoteMany(rs)}.`,
      });
    }
  }

  return out;
}
