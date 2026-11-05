import { useEffect, useMemo, useState } from "react";
import { DEFAULT_POSITIONING_CONFIG } from "../../core/defaults";
import type { RssiFilterConfig } from "../../core/types";
import {
  BarChart,
  BoxPlot,
  HistogramChart,
  LineChart,
  type BoxGroup,
  type LineSeries,
} from "../charts";
import { Callout, Card, DataTable, EmptyState, Field, InfoTip, PageHeader, RSSI_STAT_DEFINITIONS, Select, StatTile, type DataColumn } from "../components";
import { RunSelect } from "../shared";
import { useCampaign } from "../state/LabContext";
import { RssiFilterControls } from "./analysis/RssiFilterControls";
import { decimate, fmt } from "./analysis/format";
import {
  GAP_THRESHOLD_SEC,
  beaconSamples,
  countHampelOutliers,
  filterBeaconSeries,
  filterEffect,
  groupByHold,
  heardBeacons,
  summarizeBeacon,
  type BeaconSummary,
} from "./analysis/signalStats";

const ALL = "__all__";
const MAX_POINTS = 3000;
const RAW_COLOR = "#8a9ba6";
const FILTERED_COLOR = "#167768";

const STABILITY_DEFINITION =
  "Stabilität = Stichproben-Standardabweichung (n−1) der Roh-RSSI-Werte eines Beacons in dB. Kleiner = ruhigeres Signal. Sie beschreibt das Rauschen an diesem Ort, nicht die Genauigkeit einer Positionierung.";

export function SignalsPage() {
  const { campaign, runs } = useCampaign();
  const [runId, setRunId] = useState<string | null>(runs[0]?.id ?? null);
  const [beaconId, setBeaconId] = useState<string>(ALL);
  const [filter, setFilter] = useState<RssiFilterConfig>({ ...DEFAULT_POSITIONING_CONFIG.rssiFilter, kind: "ema", alpha: 0.3 });

  const run = runs.find((r) => r.id === runId) ?? runs[0];
  const heard = useMemo(() => (run ? heardBeacons(run.samples) : []), [run]);

  useEffect(() => {
    if (run && run.id !== runId) setRunId(run.id);
  }, [run, runId]);
  useEffect(() => {
    if (beaconId !== ALL && !heard.some((h) => h.beaconId === beaconId)) setBeaconId(heard.length === 1 ? heard[0].beaconId : ALL);
  }, [heard, beaconId]);

  const beaconLabel = (id: string) => campaign.beacons.find((b) => b.id === id)?.label ?? id;

  const summaries = useMemo(() => {
    if (!run) return [] as BeaconSummary[];
    return heard.map((h) => summarizeBeacon(h.beaconId, beaconSamples(run.samples, h.beaconId))).filter((s): s is BeaconSummary => s !== null);
  }, [run, heard]);

  const t0 = useMemo(() => {
    if (!run) return 0;
    let m = Infinity;
    for (const s of run.samples) if (Number.isFinite(s.t) && s.t < m) m = s.t;
    return Number.isFinite(m) ? m : 0;
  }, [run]);

  const own = useMemo(() => (run && beaconId !== ALL ? beaconSamples(run.samples, beaconId) : []), [run, beaconId]);
  const series = useMemo(() => (own.length ? filterBeaconSeries(own, filter) : null), [own, filter]);
  const summary = summaries.find((s) => s.beaconId === beaconId) ?? null;
  const effect = useMemo(() => (series ? filterEffect(series.t, series.raw, series.filtered) : null), [series]);
  const outliers = useMemo(() => (series ? countHampelOutliers(series.raw, filter.outlier.window, filter.outlier.k) : 0), [series, filter.outlier.window, filter.outlier.k]);
  const synthetic = run?.origin === "synthetic";

  const allSeries = useMemo<LineSeries[]>(() => {
    if (!run || beaconId !== ALL) return [];
    return heard.map((h) => {
      const o = beaconSamples(run.samples, h.beaconId);
      const f = filterBeaconSeries(o, filter);
      return {
        id: h.beaconId,
        label: beaconLabel(h.beaconId),
        style: "line" as const,
        points: decimate(f.t.map((t, i) => ({ x: t - t0, y: f.filtered[i] })), MAX_POINTS),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, heard, filter, beaconId, t0, campaign.beacons]);

  const holdGroups = useMemo(() => (run && beaconId !== ALL ? groupByHold(run, beaconId) : []), [run, beaconId]);

  if (runs.length === 0 || !run) {
    return (
      <>
        <PageHeader title="RSSI-Analyse" breadcrumbs={[campaign.name, "Analyse"]} />
        <EmptyState title="Keine Messreihen" description="Importieren Sie zuerst Messdaten unter „Messdaten & Qualität“ oder laden Sie die Demo-Kampagne." />
      </>
    );
  }

  const columns: DataColumn<BeaconSummary>[] = [
    { key: "beacon", header: "Beacon", sortValue: (r) => r.beaconId, render: (r) => beaconLabel(r.beaconId) },
    { key: "n", header: "n", numeric: true, sortValue: (r) => r.n, render: (r) => r.n, definition: RSSI_STAT_DEFINITIONS.count.definition },
    { key: "mean", header: "Mittel (dBm)", numeric: true, sortValue: (r) => r.mean, render: (r) => fmt(r.mean, 1), definition: RSSI_STAT_DEFINITIONS.mean.definition },
    { key: "median", header: "Median (dBm)", numeric: true, sortValue: (r) => r.median, render: (r) => fmt(r.median, 1), definition: RSSI_STAT_DEFINITIONS.median.definition },
    { key: "std", header: "σ (dB)", numeric: true, sortValue: (r) => r.std, render: (r) => fmt(r.std, 2), definition: STABILITY_DEFINITION },
    { key: "min", header: "Min", numeric: true, sortValue: (r) => r.min, render: (r) => fmt(r.min, 0), definition: RSSI_STAT_DEFINITIONS.min.definition },
    { key: "max", header: "Max", numeric: true, sortValue: (r) => r.max, render: (r) => fmt(r.max, 0), definition: RSSI_STAT_DEFINITIONS.max.definition },
    { key: "rate", header: "Rate (Hz)", numeric: true, sortValue: (r) => r.rateHz, render: (r) => fmt(r.rateHz, 2), definition: RSSI_STAT_DEFINITIONS.rate.definition },
    { key: "gap", header: "größte Lücke (s)", numeric: true, sortValue: (r) => r.maxGapSec, render: (r) => fmt(r.maxGapSec, 1), definition: RSSI_STAT_DEFINITIONS.gaps.definition },
    { key: "gaps", header: `Lücken > ${GAP_THRESHOLD_SEC} s`, numeric: true, sortValue: (r) => r.gapsOver, render: (r) => r.gapsOver },
  ];

  const filtered = filter.kind !== "none" || filter.outlier.enabled;
  const effectRows = effect
    ? [
        { k: "Verschiebung des Mittelwerts (gefiltert − roh)", v: `${fmt(effect.meanShift, 2)} dB` },
        { k: "Standardabweichung roh", v: `${fmt(effect.stdRaw, 2)} dB` },
        { k: "Standardabweichung gefiltert", v: `${fmt(effect.stdFiltered, 2)} dB` },
        { k: "Maximale absolute Abweichung gefiltert vs. roh", v: `${fmt(effect.maxAbsDeviation, 1)} dB` },
        {
          k: "Verzögerung (Kreuzkorrelation, ca.)",
          v:
            effect.delaySec === null
              ? effect.delaySamples === null
                ? "n/a (zu wenige Samples oder konstantes Signal)"
                : `${effect.delaySamples} Samples (Intervall nicht bestimmbar)`
              : `${fmt(effect.delaySec, 2)} s (${effect.delaySamples} Samples)`,
        },
        { k: `Ausreißer (Hampel, Fenster ${filter.outlier.window}, k = ${fmt(filter.outlier.k, 1)})`, v: `${outliers} von ${series?.raw.length ?? 0}` },
      ]
    : [];

  const barSummaries = summaries;

  return (
    <div className="space-y-6" data-testid="signals-page">
      <PageHeader
        title="RSSI-Analyse"
        breadcrumbs={[campaign.name, "Analyse"]}
        origin={run.origin}
        description="Rauschen, Lücken und Filterwirkung der Roh-Signale. Filter werden nur auf einer Kopie angewendet; die Originaldaten bleiben unverändert."
      />

      <Card>
        <div className="grid gap-4 md:grid-cols-2">
          <RunSelect runs={runs} value={run.id} onChange={setRunId} id="signals-run" />
          <Field label="Beacon">
            <Select id="signals-beacon" data-testid="signals-beacon-select" value={beaconId} onChange={(e) => setBeaconId(e.target.value)}>
              <option value={ALL}>alle Beacons (Vergleich)</option>
              {heard.map((h) => (
                <option key={h.beaconId} value={h.beaconId}>
                  {beaconLabel(h.beaconId)} ({h.count} Samples)
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {heard.length === 0 && <p className="mt-3 text-sm text-muted">Diese Messreihe enthält keine gültigen RSSI-Samples.</p>}
      </Card>

      {heard.length > 0 && (
        <>
          {summary && (
            <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5" data-testid="signals-stats">
              <StatTile label="Samples (n)" value={summary.n} definition={RSSI_STAT_DEFINITIONS.count.definition} />
              <StatTile label="Mittelwert" value={fmt(summary.mean, 1)} unit="dBm" definition={RSSI_STAT_DEFINITIONS.mean.definition} />
              <StatTile label="Median" value={fmt(summary.median, 1)} unit="dBm" definition={RSSI_STAT_DEFINITIONS.median.definition} />
              <StatTile label="Std.-abw. (n−1)" value={fmt(summary.std, 2)} unit="dB" definition={RSSI_STAT_DEFINITIONS.std.definition} />
              <StatTile label="Stabilität (σ)" value={fmt(summary.std, 2)} unit="dB" definition={STABILITY_DEFINITION} hint="kleiner = ruhiger" />
              <StatTile label="Minimum" value={fmt(summary.min, 0)} unit="dBm" definition={RSSI_STAT_DEFINITIONS.min.definition} />
              <StatTile label="Maximum" value={fmt(summary.max, 0)} unit="dBm" definition={RSSI_STAT_DEFINITIONS.max.definition} />
              <StatTile label="Paketrate" value={fmt(summary.rateHz, 2)} unit="Hz" definition={RSSI_STAT_DEFINITIONS.rate.definition} />
              <StatTile
                label="Größte Lücke"
                value={fmt(summary.maxGapSec, 1)}
                unit="s"
                definition={RSSI_STAT_DEFINITIONS.gaps.definition}
                hint={`${summary.gapsOver} Lücke(n) > ${GAP_THRESHOLD_SEC} s`}
                tone={summary.gapsOver > 0 ? "warning" : "default"}
              />
              <StatTile
                label="Ausreißer (Hampel)"
                value={outliers}
                definition="Anzahl der Samples, die der Hampel-Filter mit den unten eingestellten Parametern als Ausreißer markiert (|x − Median| > k · max(1,4826·MAD, 1 dB)). Markierung, keine Löschung."
                hint={`Fenster ${filter.outlier.window}, k = ${fmt(filter.outlier.k, 1)}`}
              />
            </section>
          )}

          <Card title="Filter (Vorschau)" subtitle="Nur Anzeige – die Roh-Samples werden nie verändert." >
            <RssiFilterControls value={filter} onChange={setFilter} />
            <p className="mt-3 text-xs text-muted" data-testid="signals-original-note">
              Originaldaten bleiben unverändert. Die Filter laufen kausal je Beacon auf einer Kopie der Samples (Hampel zentriert).
            </p>
          </Card>

          {beaconId !== ALL && series && summary ? (
            <>
              <Card title={`RSSI über die Zeit – ${beaconLabel(beaconId)}`} subtitle="Zeit relativ zum Beginn der Messreihe">
                <LineChart
                  title={`RSSI über die Zeit, Beacon ${beaconLabel(beaconId)}`}
                  synthetic={synthetic}
                  yLabel="RSSI"
                  unit="dBm"
                  xLabel="Zeit seit Start (s)"
                  height={300}
                  series={[
                    { id: "raw", label: "roh", style: "dots", color: RAW_COLOR, points: decimate(series.t.map((t, i) => ({ x: t - t0, y: series.raw[i] })), MAX_POINTS) },
                    ...(filtered
                      ? [{ id: "filtered", label: "gefiltert", style: "line" as const, color: FILTERED_COLOR, points: decimate(series.t.map((t, i) => ({ x: t - t0, y: series.filtered[i] })), MAX_POINTS) }]
                      : []),
                  ]}
                />
                {series.t.length > MAX_POINTS && <p className="mt-2 text-xs text-muted">Darstellung auf {MAX_POINTS} gleichmäßig verteilte Punkte reduziert; alle Kennzahlen nutzen alle Samples.</p>}
              </Card>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Verteilung (Histogramm)" subtitle="roh vs. gefiltert">
                  <HistogramChart
                    title={`Histogramm RSSI, Beacon ${beaconLabel(beaconId)}`}
                    synthetic={synthetic}
                    xLabel="RSSI"
                    unit="dBm"
                    binWidth={1}
                    height={260}
                    series={[
                      { id: "raw", label: "roh", values: series.raw, color: RAW_COLOR },
                      ...(filtered ? [{ id: "filtered", label: "gefiltert", values: series.filtered, color: FILTERED_COLOR }] : []),
                    ]}
                  />
                </Card>

                <Card title="Filterwirkung" subtitle={filtered ? "Kennzahlen für den gewählten Beacon" : "Kein Filter aktiv – roh = gefiltert"}>
                  <table className="w-full text-sm" data-testid="signals-filter-effect">
                    <tbody>
                      {effectRows.map((r) => (
                        <tr key={r.k} className="border-b border-line last:border-0">
                          <th scope="row" className="py-2 pr-3 text-left font-normal text-muted">
                            {r.k}
                          </th>
                          <td className="tabular py-2 text-right font-medium">{r.v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
                    <InfoTip text="Die Verzögerung ist die Verschiebung (in Samples, mit dem medianen Abtastintervall in Sekunden umgerechnet), bei der gefiltertes und rohes Signal am stärksten korrelieren. Näherung bei annähernd regelmäßiger Abtastung; bei kurzen oder konstanten Reihen wird „n/a“ gezeigt." label="Verzögerung" />
                    Verzögerung ist eine Näherung (Kreuzkorrelation) und wird nicht erfunden: bei zu wenigen Daten steht „n/a“.
                  </p>
                </Card>
              </div>

              <Card title="Signal je Messposition" subtitle="RSSI-Verteilung des Beacons je stationärem Halt (Referenzposition)">
                {run.references.length === 0 ? (
                  <Callout tone="info" title="Keine Referenzpositionen">
                    Diese Messreihe hat keine Referenzpunkte. Ohne bekannte Positionen kann das Signal nicht je Messposition gruppiert werden.
                  </Callout>
                ) : holdGroups.length === 0 ? (
                  <Callout tone="info" title="Keine stationären Halte mit Samples">
                    Ein Halt entsteht durch mindestens zwei aufeinanderfolgende Referenzpunkte mit identischer Position. Für diesen Beacon liegen innerhalb solcher Halte keine Samples vor (z. B. Gehversuch).
                  </Callout>
                ) : (
                  <BoxPlot
                    title={`RSSI je Messposition, Beacon ${beaconLabel(beaconId)}`}
                    synthetic={synthetic}
                    valueLabel="RSSI"
                    unit="dBm"
                    digits={1}
                    height={280}
                    groups={holdGroups.map<BoxGroup>((g) => ({ id: g.key, label: g.label, values: g.values }))}
                  />
                )}
                <p className="mt-2 text-xs text-muted">Positionen in Layout-Einheiten (x; y). Rohwerte, ungefiltert.</p>
              </Card>
            </>
          ) : (
            <Card title="Alle Beacons im Vergleich" subtitle="gefilterte Zeitreihen (dünne Linien) – Filter siehe oben">
              <LineChart title="RSSI aller Beacons über die Zeit" synthetic={synthetic} yLabel="RSSI" unit="dBm" xLabel="Zeit seit Start (s)" height={300} series={allSeries} />
            </Card>
          )}

          <Card title="Mittelwert ± Standardabweichung je Beacon" subtitle="Roh-RSSI; Fehlerbalken = Stichproben-σ (n−1)">
            <BarChart
              title="Mittlerer RSSI je Beacon"
              synthetic={synthetic}
              categories={barSummaries.map((s) => beaconLabel(s.beaconId))}
              series={[{ id: "mean", label: "Mittelwert ± σ", values: barSummaries.map((s) => s.mean), errors: barSummaries.map((s) => s.std), color: FILTERED_COLOR }]}
              valueLabel="RSSI"
              unit="dBm"
              digits={1}
              zeroBased={false}
              height={260}
            />
          </Card>

          <Card title="Alle Beacons dieser Messreihe" flush>
            <DataTable
              caption="RSSI-Kennzahlen je Beacon"
              columns={columns}
              rows={summaries}
              rowKey={(r) => r.beaconId}
              initialSort={{ key: "n", dir: "desc" }}
              onRowClick={(r) => setBeaconId(r.beaconId)}
              dense
            />
          </Card>
        </>
      )}
    </div>
  );
}
