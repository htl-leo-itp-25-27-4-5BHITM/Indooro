import { useMemo, useState } from "react";
import { toDisplayDistance } from "../../../core/units";
import type { Campaign, EvaluationResult, MeasurementRun } from "../../../core/types";
import { EstimateLayer, EstimateLegend, ErrorVectorLayer, FloorPlanMap, ReferenceLayer, TrajectoryLayer, TrajectoryLegend, type LayerId } from "../../../map";
import { CdfChart, LineChart, type LineSeries } from "../../charts";
import { Callout, Card, DataTable, DYNAMIC_METRIC_DEFINITIONS, ERROR_METRIC_DEFINITIONS, StatTile, withinLabel, type DataColumn } from "../../components";
import { useNarrow } from "./useNarrow";

function fmt(v: number | null | undefined, digits = 2): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "–" : v.toFixed(digits);
}
function pct(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "–" : `${(v * 100).toFixed(1)}`;
}

export function failureReasons(result: EvaluationResult): { reason: string; count: number }[] {
  const m = new Map<string, number>();
  for (const e of result.estimates) {
    if (e.position === null) {
      const r = e.failureReason ?? "unbekannt";
      m.set(r, (m.get(r) ?? 0) + 1);
    }
  }
  return [...m.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

/** Error values (display unit) of valid estimates that have truth. */
export function validErrors(result: EvaluationResult, campaign: Campaign): number[] {
  const scale = campaign.floorPlan.scale;
  const out: number[] = [];
  for (const e of result.estimates) if (e.truth && e.errorUnits !== null && Number.isFinite(e.errorUnits)) out.push(toDisplayDistance(e.errorUnits, scale));
  return out;
}

export function MetricsGrid({ result }: { result: EvaluationResult }) {
  const m = result.metrics;
  const d = result.dynamic;
  const E = ERROR_METRIC_DEFINITIONS;
  const D = DYNAMIC_METRIC_DEFINITIONS;
  const u = m.unit;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4" data-testid="metrics-grid">
        <StatTile label={E.epochsWithTruth.label} value={m.epochsWithTruth} definition={E.epochsWithTruth.definition} />
        <StatTile label={E.validEstimates.label} value={m.validEstimates} definition={E.validEstimates.definition} />
        <StatTile label={E.failedEstimates.label} value={m.failedEstimates} definition={E.failedEstimates.definition} tone={m.failedEstimates > 0 ? "warning" : "default"} />
        <StatTile label={E.failureRate.label} value={pct(m.failureRate)} unit="%" definition={E.failureRate.definition} tone={m.failureRate > 0 ? "warning" : "default"} />
        <StatTile label={E.mean.label} value={fmt(m.mean)} unit={u} definition={E.mean.definition} />
        <StatTile label={E.median.label} value={fmt(m.median)} unit={u} definition={E.median.definition} />
        <StatTile label={E.rmse.label} value={fmt(m.rmse)} unit={u} definition={E.rmse.definition} />
        <StatTile label={E.p90.label} value={fmt(m.p90)} unit={u} definition={E.p90.definition} />
        <StatTile label={E.p95.label} value={fmt(m.p95)} unit={u} definition={E.p95.definition} />
        <StatTile label={E.max.label} value={fmt(m.max)} unit={u} definition={E.max.definition} />
        <StatTile label={withinLabel(2, u)} value={pct(m.within2)} unit="%" definition={E.within2.definition} />
        <StatTile label={withinLabel(3, u)} value={pct(m.within3)} unit="%" definition={E.within3.definition} />
        <StatTile label={withinLabel(5, u)} value={pct(m.within5)} unit="%" definition={E.within5.definition} />
      </div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Dynamik</h4>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4" data-testid="dynamic-grid">
        <StatTile label={D.pairs.label} value={d.pairs} definition={D.pairs.definition} />
        <StatTile label={D.jumps.label} value={d.jumps} definition={D.jumps.definition} />
        <StatTile label={D.jumpRate.label} value={pct(d.jumpRate)} unit="%" definition={D.jumpRate.definition} />
        <StatTile label={D.jumpSpeedThreshold.label} value={fmt(d.jumpSpeedThreshold)} unit={`${d.unit}/s`} definition={D.jumpSpeedThreshold.definition} />
        <StatTile label={D.meanStepDistance.label} value={fmt(d.meanStepDistance)} unit={d.unit} definition={D.meanStepDistance.definition} />
        <StatTile label={D.lagSec.label} value={fmt(d.lagSec, 1)} unit="s" definition={D.lagSec.definition} />
        <StatTile label={D.stationaryPrecision.label} value={fmt(d.stationaryPrecision)} unit={d.unit} definition={D.stationaryPrecision.definition} />
        <StatTile label={D.stationaryBias.label} value={fmt(d.stationaryBias)} unit={d.unit} definition={D.stationaryBias.definition} />
      </div>
    </div>
  );
}

export function ResultView({ result, run, campaign }: { result: EvaluationResult; run: MeasurementRun; campaign: Campaign }) {
  const narrow = useNarrow();
  const scale = campaign.floorPlan.scale;
  const unit = result.metrics.unit;
  const [layers, setLayers] = useState<Partial<Record<LayerId, boolean>>>({ errors: true });
  const noTruth = result.metrics.epochsWithTruth === 0;
  const reasons = useMemo(() => failureReasons(result), [result]);
  const errors = useMemo(() => validErrors(result, campaign), [result, campaign]);
  const t0 = result.estimates[0]?.t ?? 0;

  const series = useMemo(() => {
    const err = result.estimates.map((e) => ({
      x: e.t - t0,
      y: e.truth && e.errorUnits !== null ? toDisplayDistance(e.errorUnits, scale) : null,
    }));
    const fails = result.estimates.filter((e) => e.truth && e.position === null).map((e) => ({ x: e.t - t0, y: 0 as number | null }));
    const list: LineSeries[] = [{ id: "err", label: `Fehler (${unit})`, points: err }];
    if (fails.length > 0) list.push({ id: "fail", label: "Fehlschlag (keine Position)", points: fails, style: "dots" });
    return list;
  }, [result, scale, t0, unit]);

  const reasonCols: DataColumn<{ reason: string; count: number }>[] = [
    { key: "reason", header: "Grund", sortValue: (r) => r.reason, render: (r) => r.reason },
    { key: "count", header: "Anzahl", numeric: true, sortValue: (r) => r.count, render: (r) => r.count },
  ];

  return (
    <div className="space-y-4" data-testid="result-view">
      {result.warnings.map((w, i) => (
        <Callout key={i} tone="warning" title="Einschränkung der Gültigkeit">
          {w}
        </Callout>
      ))}
      {noTruth ? (
        <Callout tone="warning" title="Keine Ground Truth – keine Fehlermetriken berechenbar">
          Diese Messreihe enthält keine Referenzpositionen. Die Schätzungen werden auf der Karte gezeigt, ohne Fehlerangabe.
        </Callout>
      ) : (
        <MetricsGrid result={result} />
      )}

      {!noTruth && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card title="Verteilung des Positionsfehlers" subtitle="Kumulativ; Fehlschläge zählen als „nicht innerhalb“, die Kurve endet daher unter 100 %.">
            <CdfChart
              title="Kumulative Fehlerverteilung"
              series={[{ id: "cdf", label: result.runName, values: errors, total: result.metrics.epochsWithTruth }]}
              unit={unit}
              synthetic={result.origin === "synthetic"}
              height={narrow ? 240 : 300}
            />
          </Card>
          <Card title="Fehler über die Zeit" subtitle="Lücken = Epoche ohne Referenz; Punkte am Boden = Fehlschläge.">
            <LineChart title="Positionsfehler über die Zeit" series={series} yLabel={`Fehler (${unit})`} unit={unit} synthetic={result.origin === "synthetic"} height={narrow ? 240 : 300} />
          </Card>
        </div>
      )}

      <Card title="Karte" subtitle="Referenz, Schätzungen (Farbe = Fehler) und Fehlervektoren">
        <FloorPlanMap
          plan={campaign.floorPlan}
          beacons={campaign.beacons}
          layers={layers}
          onLayersChange={(l) => setLayers(l)}
          availableLayers={["grid", "elements", "labels", "beacons", "references", "estimates", "trajectories", "errors"]}
          height={narrow ? 360 : 520}
          legend={
            <div className="flex flex-wrap gap-4">
              <EstimateLegend estimates={result.estimates} scale={scale} />
              {run.kind === "walk" && <TrajectoryLegend />}
            </div>
          }
          overlays={
            <>
              {run.kind === "walk" && <TrajectoryLayer estimates={result.estimates} references={run.references} />}
              <ReferenceLayer references={run.references} />
              <ErrorVectorLayer estimates={result.estimates} />
              <EstimateLayer estimates={result.estimates} />
            </>
          }
        />
      </Card>

      <Card title="Fehlschläge nach Grund" flush>
        <DataTable columns={reasonCols} rows={reasons} rowKey={(r) => r.reason} caption="Fehlschlaggründe" emptyMessage="Keine Fehlschläge." />
      </Card>
    </div>
  );
}
