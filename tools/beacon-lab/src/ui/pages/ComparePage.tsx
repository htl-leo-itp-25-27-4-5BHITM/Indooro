import { useEffect, useMemo, useState } from "react";
import { newId } from "../../core/ids";
import type { EvaluationOptions, MeasurementRun } from "../../core/types";
import { distanceUnit, toDisplayDistance } from "../../core/units";
import { downloadText } from "../../data/export";
import { FloorPlanMap, ReferenceLayer } from "../../map";
import { compareAlgorithms, type ComparisonResult } from "../../positioning/pipeline";
import { BarChart, BoxPlot, CdfChart } from "../charts";
import { Button, Callout, Card, EmptyState, PageHeader, Spinner, Tabs, TextInput } from "../components";
import { ConfigEditor, RunSelect, describeConfig } from "../shared";
import { useCampaign } from "../state/LabContext";
import { ColoredEstimatePath } from "./analysis/ColoredTrajectoryLayer";
import { MetricsTable, type MetricsRow } from "./analysis/MetricsTable";
import { SweepPanel } from "./analysis/SweepPanel";
import { fmt, seriesColor } from "./analysis/format";
import {
  cloneConfig,
  comparisonToCsv,
  comparisonToJson,
  defaultEvalOptions,
  errorValues,
  presetConfigs,
  type NamedConfig,
} from "./analysis/presets";

interface Computed {
  comparison: ComparisonResult;
  configs: NamedConfig[];
  options: EvaluationOptions;
  runId: string;
  generatedAt: string;
}

export function ComparePage() {
  const { campaign, runs, saveResult } = useCampaign();
  const evalRuns = useMemo(() => runs.filter((r) => r.role === "evaluation"), [runs]);
  const calRuns = useMemo(() => runs.filter((r) => r.role === "calibration"), [runs]);
  const [runId, setRunId] = useState<string | null>(evalRuns[0]?.id ?? null);
  const run: MeasurementRun | undefined = evalRuns.find((r) => r.id === runId) ?? evalRuns[0];
  const [configs, setConfigs] = useState<NamedConfig[]>(() => presetConfigs(calRuns.length > 0));
  const [options, setOptions] = useState<EvaluationOptions>(() => defaultEvalOptions(run));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<"compare" | "sweep">("compare");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [computed, setComputed] = useState<Computed | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (run && run.id !== runId) setRunId(run.id);
  }, [run, runId]);

  const changeRun = (id: string) => {
    setRunId(id);
    setOptions(defaultEvalOptions(evalRuns.find((r) => r.id === id)));
    setComputed(null);
    setError(null);
    setSaved(null);
  };

  const scale = campaign.floorPlan.scale;
  const unit = distanceUnit(scale);
  const toDisplay = (u: number) => toDisplayDistance(u, scale);
  const synthetic = run?.origin === "synthetic";

  const updateConfig = (id: string, patch: Partial<NamedConfig>) => setConfigs((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const duplicate = (c: NamedConfig) => {
    const copy = { id: newId("cfg"), name: `${c.name} (Kopie)`, config: cloneConfig(c.config) };
    setConfigs((cs) => {
      const i = cs.findIndex((x) => x.id === c.id);
      return [...cs.slice(0, i + 1), copy, ...cs.slice(i + 1)];
    });
    setExpanded(copy.id);
  };
  const addConfig = () => {
    const base = presetConfigs(calRuns.length > 0)[1];
    const c = { id: newId("cfg"), name: `Konfiguration ${configs.length + 1}`, config: cloneConfig(base.config) };
    setConfigs((cs) => [...cs, c]);
    setExpanded(c.id);
  };

  const runComparison = () => {
    if (!run) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    // let the spinner paint before the (synchronous) computation
    setTimeout(() => {
      try {
        const comparison = compareAlgorithms({ run, campaign, options, calibrationRuns: calRuns, configs: configs.map((c) => c.config) });
        setComputed({ comparison, configs: configs.map((c) => ({ ...c, config: cloneConfig(c.config) })), options, runId: run.id, generatedAt: new Date().toISOString() });
        setVisible(Object.fromEntries(configs.map((c) => [c.id, true])));
      } catch (e) {
        setComputed(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    }, 20);
  };

  const names = computed?.configs.map((c) => c.name) ?? [];
  const rows: MetricsRow[] =
    computed?.comparison.results.map((r, i) => ({ key: computed.configs[i].id, name: names[i], hash: r.configHash, color: seriesColor(i), metrics: r.metrics, dynamic: r.dynamic })) ?? [];
  const commonRows: MetricsRow[] =
    computed?.comparison.common.map((m, i) => ({ key: computed.configs[i].id, name: names[i], color: seriesColor(i), metrics: m })) ?? [];
  const warnings = useMemo(() => {
    if (!computed) return [] as string[];
    return [...new Set(computed.comparison.results.flatMap((r) => r.warnings))];
  }, [computed]);

  const exportInput = computed && run ? { run, names, options: computed.options, comparison: computed.comparison, generatedAt: computed.generatedAt } : null;
  const stamp = (computed?.generatedAt ?? "").slice(0, 19).replace(/[:T]/g, "-");

  const saveAll = async () => {
    if (!computed || !run) return;
    let n = 0;
    for (let i = 0; i < computed.comparison.results.length; i++) {
      await saveResult(`Vergleich: ${names[i]}`, computed.comparison.results[i]);
      n++;
    }
    setSaved(`${n} Ergebnisse gespeichert (siehe Bericht & Export).`);
  };

  if (evalRuns.length === 0 || !run) {
    return (
      <>
        <PageHeader title="Algorithmusvergleich" breadcrumbs={[campaign.name, "Analyse"]} />
        <EmptyState
          title="Keine Auswertungsläufe"
          description="Der Vergleich läuft nur auf Läufen mit der Rolle „Auswertung“. Kalibrierungsläufe sind ausgeschlossen, um Datenlecks zu verhindern."
        />
      </>
    );
  }

  return (
    <div className="space-y-6" data-testid="compare-page">
      <PageHeader
        title="Algorithmusvergleich"
        breadcrumbs={[campaign.name, "Analyse"]}
        origin={run.origin}
        description="Mehrere Konfigurationen auf demselben Auswertungslauf. Alle Zahlen werden live berechnet; Fehlschläge werden nie stillschweigend verworfen."
      />

      <Tabs
        label="Ansicht"
        value={tab}
        onChange={(id) => setTab(id as "compare" | "sweep")}
        renderPanel={false}
        tabs={[
          { id: "compare", label: "Vergleich" },
          { id: "sweep", label: "Parameter-Sweep" },
        ]}
      />

      <Card>
        <RunSelect runs={runs} roles={["evaluation"]} value={run.id} onChange={changeRun} id="compare-run" label="Auswertungslauf" />
        <p className="mt-2 text-xs text-muted">
          Nur Läufe mit der Rolle „Auswertung“. {calRuns.length > 0 ? `${calRuns.length} Kalibrierungslauf/-läufe stehen für kNN-Fingerprints bereit.` : "Ohne Kalibrierungsläufe ist kNN nicht verfügbar."}
        </p>
      </Card>

      {tab === "sweep" ? (
        <SweepPanel run={run} campaign={campaign} calibrationRuns={calRuns} options={options} configs={configs} />
      ) : (
        <>
          <Card
            title="Konfigurationen"
            subtitle={`${configs.length} Konfigurationen · Ground-Truth: ${options.referenceMatching === "interpolate" ? "linear interpoliert (Annahme)" : "Standzeit / nächster Punkt"}, Toleranz ${options.toleranceSec} s`}
            actions={
              <Button size="sm" variant="secondary" data-testid="compare-add" onClick={addConfig}>
                + Konfiguration
              </Button>
            }
            flush
          >
            <ul className="divide-y divide-line" data-testid="compare-config-list">
              {configs.map((c, i) => (
                <li key={c.id} className="px-5 py-3" data-testid={`compare-config-${i}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span aria-hidden="true" className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: seriesColor(i) }} />
                    <div className="min-w-[200px] flex-1">
                      <TextInput aria-label={`Name der Konfiguration ${i + 1}`} value={c.name} onChange={(e) => updateConfig(c.id, { name: e.target.value })} />
                      <div className="mt-1 text-xs text-muted">{describeConfig(c.config)}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" aria-expanded={expanded === c.id} onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                        {expanded === c.id ? "Schließen" : "Bearbeiten"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => duplicate(c)}>
                        Duplizieren
                      </Button>
                      <Button size="sm" variant="ghost" disabled={configs.length <= 1} onClick={() => setConfigs((cs) => cs.filter((x) => x.id !== c.id))}>
                        Entfernen
                      </Button>
                    </div>
                  </div>
                  {expanded === c.id && (
                    <div className="mt-4 rounded-lg border border-line bg-page p-4">
                      <ConfigEditor
                        idPrefix={`cmp-${i}`}
                        compact
                        config={c.config}
                        onChange={(config) => updateConfig(c.id, { config })}
                        options={options}
                        onOptionsChange={(o) => {
                          setOptions(o);
                          setComputed(null);
                        }}
                      />
                      <p className="mt-3 text-xs text-muted">Die Ground-Truth-Zuordnung gilt für alle Konfigurationen gemeinsam.</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-5 py-3">
              <Button data-testid="compare-run" onClick={runComparison} disabled={busy || configs.length === 0}>
                {busy ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner /> Berechne …
                  </span>
                ) : (
                  "Vergleichen"
                )}
              </Button>
            </div>
          </Card>

          {error && (
            <Callout tone="danger" title="Vergleich nicht möglich">
              {error}
            </Callout>
          )}

          {computed && run && (
            <div className="space-y-6" data-testid="compare-results">
              {warnings.length > 0 && (
                <Callout tone="warning" title="Einschränkungen der Gültigkeit">
                  <ul className="list-disc space-y-1 pl-5">
                    {warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </Callout>
              )}

              <Card title="Kennzahlen je Konfiguration" subtitle={`Alle Epochen mit Referenz · Einheit ${unit}`} flush>
                <MetricsTable rows={rows} caption="Fehlermetriken je Konfiguration" testId="compare-metrics-table" />
                <p className="border-t border-line px-5 py-3 text-xs text-muted">
                  Mittel, Median, RMSE, P90, P95 und Max beziehen sich nur auf gültige Schätzungen (bedingte Sicht). Fehlschläge werden nicht verworfen: Sie stehen in „Fehlschläge“ und „Ausfallrate“ und zählen bei „≤ x“ als nicht getroffen. Ein Verfahren mit kleinem Median, aber hoher Ausfallrate ist nicht besser.
                </p>
              </Card>

              <Card title={`Gemeinsame Epochenmenge (n = ${computed.comparison.commonEpochs})`} subtitle="Nur Epochen, in denen ALLE Konfigurationen eine Position lieferten – vergleichbar ohne Survivorship-Bias" flush>
                {computed.comparison.commonEpochs === 0 ? (
                  <div className="p-5">
                    <Callout tone="warning" title="Keine gemeinsamen Epochen">
                      Es gibt keine Epoche, in der alle Konfigurationen eine Position und eine Referenz haben (unterschiedliche Schrittweiten teilen oft keine Zeitstempel). Vergleichen Sie Konfigurationen mit gleicher Schrittweite.
                    </Callout>
                  </div>
                ) : (
                  <MetricsTable rows={commonRows} caption="Fehlermetriken auf der gemeinsamen Epochenmenge" withDynamic={false} testId="compare-common-table" />
                )}
              </Card>

              <div className="grid gap-6 xl:grid-cols-2">
                <Card title="Fehlerverteilung (CDF)" subtitle="Die Kurve endet bei 1 − Ausfallrate: Fehlschläge fehlen bewusst.">
                  <CdfChart
                    title="Kumulierte Fehlerverteilung je Konfiguration"
                    synthetic={synthetic}
                    unit={unit}
                    height={300}
                    series={computed.comparison.results.map((r, i) => ({
                      id: computed.configs[i].id,
                      label: names[i],
                      values: errorValues(r, toDisplay),
                      total: r.metrics.epochsWithTruth,
                      color: seriesColor(i),
                    }))}
                  />
                </Card>
                <Card title="Fehler je Konfiguration (Boxplot)" subtitle="nur gültige Schätzungen">
                  <BoxPlot
                    title="Positionsfehler je Konfiguration"
                    synthetic={synthetic}
                    valueLabel="Fehler"
                    unit={unit}
                    height={300}
                    groups={computed.comparison.results.map((r, i) => ({ id: computed.configs[i].id, label: names[i], values: errorValues(r, toDisplay), color: seriesColor(i) }))}
                  />
                </Card>
                <Card title="Ausfallrate" subtitle="Anteil der Epochen mit Referenz ohne Positionsschätzung">
                  <BarChart
                    title="Ausfallrate je Konfiguration"
                    synthetic={synthetic}
                    categories={names}
                    series={[{ id: "fr", label: "Ausfallrate", values: computed.comparison.results.map((r) => r.metrics.failureRate * 100), color: "#b4376b" }]}
                    valueLabel="Ausfallrate"
                    unit="%"
                    digits={1}
                    height={300}
                  />
                </Card>
                <Card title="Trajektorien" subtitle="Referenzpfad (Rauten) und Schätzpfade je Konfiguration; Linien brechen bei Fehlschlägen">
                  <div className="mb-3 flex flex-wrap gap-3" data-testid="compare-map-toggles">
                    {computed.configs.map((c, i) => (
                      <label key={c.id} className="inline-flex cursor-pointer items-center gap-2 text-sm">
                        <input type="checkbox" checked={visible[c.id] ?? true} onChange={(e) => setVisible((v) => ({ ...v, [c.id]: e.target.checked }))} />
                        <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: seriesColor(i) }} />
                        {c.name}
                      </label>
                    ))}
                  </div>
                  <div data-testid="compare-map">
                    <FloorPlanMap
                      plan={campaign.floorPlan}
                      beacons={campaign.beacons}
                      height={420}
                      overlays={
                        <>
                          <ReferenceLayer references={run.references} />
                          {computed.comparison.results.map(
                            (r, i) => (visible[computed.configs[i].id] ?? true) && <ColoredEstimatePath key={computed.configs[i].id} estimates={r.estimates} color={seriesColor(i)} testId={`compare-path-${i}`} />,
                          )}
                        </>
                      }
                    />
                  </div>
                </Card>
              </div>

              <Card title="Exportieren">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    data-testid="compare-export-json"
                    onClick={() => exportInput && downloadText(`vergleich-${stamp}.json`, comparisonToJson(exportInput), "application/json")}
                  >
                    JSON
                  </Button>
                  <Button
                    variant="secondary"
                    data-testid="compare-export-csv"
                    onClick={() => exportInput && downloadText(`vergleich-${stamp}.csv`, comparisonToCsv(exportInput), "text/csv")}
                  >
                    CSV
                  </Button>
                  <Button data-testid="compare-save-all" onClick={() => void saveAll()}>
                    Alle speichern
                  </Button>
                  {saved && <span className="text-sm text-muted" data-testid="compare-saved">{saved}</span>}
                </div>
                <p className="mt-2 text-xs text-muted">
                  Export enthält Konfigurationen, Metriken (gesamt und gemeinsame Epochen), configHash, SHA-256 des Laufs und Zeitstempel ({fmt(computed.comparison.commonEpochs, 0)} gemeinsame Epochen).
                </p>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
