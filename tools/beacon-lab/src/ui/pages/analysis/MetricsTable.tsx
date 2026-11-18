import type { DynamicMetrics, ErrorMetrics } from "../../../core/types";
import { DataTable, DYNAMIC_METRIC_DEFINITIONS, ERROR_METRIC_DEFINITIONS, type DataColumn } from "../../components";
import { fmt, fmtPct } from "./format";

export interface MetricsRow {
  key: string;
  name: string;
  hash?: string;
  color?: string;
  metrics: ErrorMetrics;
  dynamic?: DynamicMetrics;
}

/** Metrics table with every ErrorMetrics field, failure counts always visible (failures are never dropped). */
export function MetricsTable({ rows, caption, withDynamic = true, testId }: { rows: MetricsRow[]; caption: string; withDynamic?: boolean; testId?: string }) {
  const unit = rows[0]?.metrics.unit ?? "m";
  const d = ERROR_METRIC_DEFINITIONS;
  const cols: DataColumn<MetricsRow>[] = [
    {
      key: "name",
      header: "Konfiguration",
      sortValue: (r) => r.name,
      render: (r) => (
        <span className="inline-flex items-center gap-2">
          {r.color && <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />}
          {r.name}
        </span>
      ),
    },
    { key: "n", header: "Epochen mit Ref.", numeric: true, sortValue: (r) => r.metrics.epochsWithTruth, render: (r) => r.metrics.epochsWithTruth, definition: d.epochsWithTruth.definition },
    { key: "valid", header: "gültig", numeric: true, sortValue: (r) => r.metrics.validEstimates, render: (r) => r.metrics.validEstimates, definition: d.validEstimates.definition },
    { key: "failed", header: "Fehlschläge", numeric: true, sortValue: (r) => r.metrics.failedEstimates, render: (r) => r.metrics.failedEstimates, definition: d.failedEstimates.definition },
    { key: "fr", header: "Ausfallrate", numeric: true, sortValue: (r) => r.metrics.failureRate, render: (r) => fmtPct(r.metrics.failureRate), definition: d.failureRate.definition },
    { key: "mean", header: `Mittel (${unit})`, numeric: true, sortValue: (r) => r.metrics.mean, render: (r) => fmt(r.metrics.mean), definition: d.mean.definition },
    { key: "median", header: `Median (${unit})`, numeric: true, sortValue: (r) => r.metrics.median, render: (r) => fmt(r.metrics.median), definition: d.median.definition },
    { key: "rmse", header: `RMSE (${unit})`, numeric: true, sortValue: (r) => r.metrics.rmse, render: (r) => fmt(r.metrics.rmse), definition: d.rmse.definition },
    { key: "p90", header: `P90 (${unit})`, numeric: true, sortValue: (r) => r.metrics.p90, render: (r) => fmt(r.metrics.p90), definition: d.p90.definition },
    { key: "p95", header: `P95 (${unit})`, numeric: true, sortValue: (r) => r.metrics.p95, render: (r) => fmt(r.metrics.p95), definition: d.p95.definition },
    { key: "max", header: `Max (${unit})`, numeric: true, sortValue: (r) => r.metrics.max, render: (r) => fmt(r.metrics.max), definition: d.max.definition },
    { key: "w2", header: `≤ 2 ${unit}`, numeric: true, sortValue: (r) => r.metrics.within2, render: (r) => fmtPct(r.metrics.within2), definition: d.within2.definition },
    { key: "w3", header: `≤ 3 ${unit}`, numeric: true, sortValue: (r) => r.metrics.within3, render: (r) => fmtPct(r.metrics.within3), definition: d.within3.definition },
    { key: "w5", header: `≤ 5 ${unit}`, numeric: true, sortValue: (r) => r.metrics.within5, render: (r) => fmtPct(r.metrics.within5), definition: d.within5.definition },
  ];
  if (withDynamic) {
    cols.push(
      { key: "jump", header: "Sprungrate", numeric: true, sortValue: (r) => r.dynamic?.jumpRate, render: (r) => fmtPct(r.dynamic?.jumpRate ?? null), definition: DYNAMIC_METRIC_DEFINITIONS.jumpRate.definition },
      { key: "lag", header: "Lag (s)", numeric: true, sortValue: (r) => r.dynamic?.lagSec, render: (r) => fmt(r.dynamic?.lagSec ?? null, 1), definition: DYNAMIC_METRIC_DEFINITIONS.lagSec.definition },
      { key: "hash", header: "configHash", sortValue: (r) => r.hash, render: (r) => <code className="text-xs">{r.hash}</code> },
    );
  }
  return (
    <div data-testid={testId}>
      <DataTable caption={caption} columns={cols} rows={rows} rowKey={(r) => r.key} dense />
    </div>
  );
}
