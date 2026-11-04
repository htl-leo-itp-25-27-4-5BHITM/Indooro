import { useMemo, useState } from "react";
import type { Campaign, EvaluationOptions, MeasurementRun } from "../../../core/types";
import { compareAlgorithms } from "../../../positioning/pipeline";
import { LineChart } from "../../charts";
import { Button, Callout, Card, DataTable, Field, Select, TextInput, type DataColumn } from "../../components";
import { fmt, fmtPct } from "./format";
import {
  SWEEP_METRICS,
  SWEEP_PARAMS,
  getSweepParam,
  parseSweepValues,
  setSweepParam,
  sweepParamHint,
  type NamedConfig,
  type SweepMetric,
  type SweepParamId,
} from "./presets";

interface SweepRow {
  value: number;
  median: number | null;
  p95: number | null;
  failureRate: number;
  valid: number;
  failed: number;
  epochs: number;
  hash: string;
  unit: "m" | "LE";
}

export function SweepPanel({
  run,
  campaign,
  calibrationRuns,
  options,
  configs,
}: {
  run: MeasurementRun;
  campaign: Campaign;
  calibrationRuns: MeasurementRun[];
  options: EvaluationOptions;
  configs: NamedConfig[];
}) {
  const [baseId, setBaseId] = useState<string>(configs[0]?.id ?? "");
  const [paramId, setParamId] = useState<SweepParamId>("weightExponent");
  const [text, setText] = useState("0.5, 1, 1.5, 2");
  const [metric, setMetric] = useState<SweepMetric>("median");
  const [rows, setRows] = useState<SweepRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ base: string; param: string; commonEpochs: number } | null>(null);

  const base = configs.find((c) => c.id === baseId) ?? configs[0];
  const param = SWEEP_PARAMS.find((p) => p.id === paramId) ?? SWEEP_PARAMS[0];
  const parsed = useMemo(() => parseSweepValues(text, param), [text, param]);
  const hint = base ? sweepParamHint(base.config, paramId) : null;

  const runSweep = () => {
    if (!base || parsed.values.length === 0) return;
    setError(null);
    try {
      const cfgs = parsed.values.map((v) => setSweepParam(base.config, paramId, v));
      const cmp = compareAlgorithms({ run, campaign, options, calibrationRuns, configs: cfgs });
      setRows(
        cmp.results.map((r, i) => ({
          value: parsed.values[i],
          median: r.metrics.median,
          p95: r.metrics.p95,
          failureRate: r.metrics.failureRate,
          valid: r.metrics.validEstimates,
          failed: r.metrics.failedEstimates,
          epochs: r.metrics.epochsWithTruth,
          hash: r.configHash,
          unit: r.metrics.unit,
        })),
      );
      setMeta({ base: base.name, param: param.label, commonEpochs: cmp.commonEpochs });
    } catch (e) {
      setRows(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const unit = rows?.[0]?.unit ?? "m";
  const metricDef = SWEEP_METRICS.find((m) => m.id === metric) ?? SWEEP_METRICS[0];
  const yUnit = metricDef.unit === "%" ? "%" : unit;
  const synthetic = run.origin === "synthetic";

  const cols: DataColumn<SweepRow>[] = [
    { key: "v", header: param.label, numeric: true, sortValue: (r) => r.value, render: (r) => fmt(r.value, param.integer ? 0 : 2) },
    { key: "median", header: `Median (${unit})`, numeric: true, sortValue: (r) => r.median, render: (r) => fmt(r.median) },
    { key: "p95", header: `P95 (${unit})`, numeric: true, sortValue: (r) => r.p95, render: (r) => fmt(r.p95) },
    { key: "fr", header: "Ausfallrate", numeric: true, sortValue: (r) => r.failureRate, render: (r) => fmtPct(r.failureRate) },
    { key: "valid", header: "gültig", numeric: true, render: (r) => r.valid },
    { key: "failed", header: "Fehlschläge", numeric: true, render: (r) => r.failed },
    { key: "hash", header: "configHash", render: (r) => <code className="text-xs">{r.hash}</code> },
  ];

  return (
    <div className="space-y-6" data-testid="sweep-panel">
      <Card title="Parameter-Sweep" subtitle="Ein Parameter einer Basis-Konfiguration wird variiert; alle anderen Einstellungen bleiben gleich.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Basis-Konfiguration">
            <Select id="sweep-base" data-testid="sweep-base" value={base?.id ?? ""} onChange={(e) => setBaseId(e.target.value)}>
              {configs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Parameter">
            <Select id="sweep-param" data-testid="sweep-param" value={paramId} onChange={(e) => setParamId(e.target.value as SweepParamId)}>
              {SWEEP_PARAMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Werte"
            hint={base ? `aktuell in der Basis: ${fmt(getSweepParam(base.config, paramId), 2)} · erlaubt ${param.min} … ${param.max}${param.integer ? ", ganzzahlig" : ""}` : undefined}
            error={parsed.errors.length ? parsed.errors.join("; ") : undefined}
          >
            <TextInput id="sweep-values" data-testid="sweep-values" value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. 0.5, 1, 1.5, 2" />
          </Field>
          <Field label="Kennzahl (Diagramm)">
            <Select id="sweep-metric" data-testid="sweep-metric" value={metric} onChange={(e) => setMetric(e.target.value as SweepMetric)}>
              {SWEEP_METRICS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {hint && (
          <Callout tone="warning" className="mt-4">
            {hint}
          </Callout>
        )}
        <Button className="mt-4" data-testid="sweep-run" disabled={!base || parsed.values.length === 0 || parsed.errors.length > 0} onClick={runSweep}>
          Sweep starten ({parsed.values.length} Läufe)
        </Button>
      </Card>

      {error && (
        <Callout tone="danger" title="Sweep fehlgeschlagen">
          {error}
        </Callout>
      )}

      {rows && meta && (
        <>
          <Card title={`${metricDef.label} über ${meta.param}`} subtitle={`Basis: ${meta.base} · Lauf: ${run.name}`}>
            <div data-testid="sweep-chart">
              <LineChart
                title={`${metricDef.label} über ${meta.param}`}
                synthetic={synthetic}
                yLabel={metricDef.label}
                unit={yUnit}
                xLabel={meta.param}
                xFormat={(x) => String(Math.round(x * 100) / 100)}
                height={280}
                series={[
                  {
                    id: "sweep",
                    label: metricDef.label,
                    style: "line",
                    points: rows.map((r) => ({ x: r.value, y: metric === "failureRate" ? r.failureRate * 100 : metric === "median" ? r.median : r.p95 })),
                  },
                ]}
              />
            </div>
            <p className="mt-2 text-xs text-muted">
              Median und P95 beziehen sich nur auf gültige Schätzungen; die Ausfallrate daneben zeigt, ob ein Parameter Fehlschläge verschiebt. Die gemeinsame Epochenmenge aller Werte umfasst {meta.commonEpochs} Epochen.
            </p>
          </Card>
          <Card title="Sweep-Tabelle" flush>
            <div data-testid="sweep-table">
              <DataTable caption="Ergebnisse je Parameterwert" columns={cols} rows={rows} rowKey={(r) => String(r.value)} dense />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
