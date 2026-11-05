import { useEffect, useMemo, useState } from "react";
import { DEFAULT_EVALUATION_OPTIONS, DEFAULT_POSITIONING_CONFIG } from "../../core/defaults";
import type { EvaluationOptions, EvaluationResult, PositioningConfig } from "../../core/types";
import { downloadText, estimatesToCsv } from "../../data/export";
import { Button, Callout, Card, EmptyState, Field, PageHeader, SplitPane, TextInput } from "../components";
import { ConfigEditor, RunSelect, defaultOptionsFor, describeConfig, evaluate } from "../shared";
import { href } from "../router";
import { useCampaign } from "../state/LabContext";
import { fileSlug } from "./workflow/files";
import { ResultView } from "./workflow/ResultView";

interface Computed {
  result: EvaluationResult | null;
  error: string | null;
  ms: number;
  snapshot: string;
  runId: string;
}

export function PositioningPage() {
  const { campaign, runs, saveResult } = useCampaign();
  const evalRuns = useMemo(() => runs.filter((r) => r.role === "evaluation"), [runs]);
  const calRuns = useMemo(() => runs.filter((r) => r.role === "calibration"), [runs]);
  const [runId, setRunId] = useState<string | null>(evalRuns[0]?.id ?? null);
  const run = evalRuns.find((r) => r.id === runId);
  const [config, setConfig] = useState<PositioningConfig>(DEFAULT_POSITIONING_CONFIG);
  const [options, setOptions] = useState<EvaluationOptions>(() => defaultOptionsFor(evalRuns[0], DEFAULT_EVALUATION_OPTIONS));
  const [computed, setComputed] = useState<Computed | null>(null);
  const [label, setLabel] = useState("");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (runId === null && evalRuns[0]) setRunId(evalRuns[0].id);
  }, [evalRuns, runId]);

  const snapshot = JSON.stringify([runId, config, options]);
  const stale = computed !== null && computed.snapshot !== snapshot;

  const selectRun = (id: string) => {
    setRunId(id);
    setOptions(defaultOptionsFor(evalRuns.find((r) => r.id === id), options));
    setComputed(null);
    setSavedMsg(null);
  };

  const compute = () => {
    if (!run) return;
    const t0 = performance.now();
    const state = evaluate(run, campaign, config, options, calRuns);
    const ms = performance.now() - t0;
    setComputed({ result: state.result, error: state.error, ms, snapshot, runId: run.id });
    setSavedMsg(null);
    if (state.result) setLabel(`${describeConfig(state.result.config)} · ${run.name}`);
  };

  const result = computed?.result ?? null;
  const shownRun = computed ? runs.find((r) => r.id === computed.runId) : undefined;

  const save = async () => {
    if (!result) return;
    const saved = await saveResult(label.trim() || describeConfig(result.config), result);
    setSavedMsg(`Gespeichert als „${saved.label}“.`);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Positionierung"
        breadcrumbs={["Analyse", "Positionierung"]}
        origin={run?.origin ?? campaign.floorPlan.origin}
        description="Ein Verfahren auf einem Evaluationslauf berechnen. Fehler und Ausfälle werden gemeinsam ausgewiesen."
      />

      {evalRuns.length === 0 ? (
        <EmptyState
          title="Kein Evaluationslauf vorhanden"
          description="Für Fehlermetriken wird ein Lauf mit der Rolle „Evaluation“ benötigt."
          action={<a href={href(campaign.id, "data")}>Zu den Messdaten</a>}
        />
      ) : (
        <SplitPane
          sideWidth={400}
          side={
            <Card title="Einstellungen">
              <div className="space-y-4">
                <RunSelect runs={runs} roles={["evaluation"]} value={runId} onChange={selectRun} label="Evaluationslauf" id="pos-run" />
                <p className="text-xs text-muted">
                  Kalibrierungsläufe fehlen hier mit Absicht: Daten, mit denen Modell oder Fingerprints erstellt wurden, dürfen nicht zur Bewertung dienen (Datenleck).
                </p>
                <ConfigEditor config={config} onChange={setConfig} options={options} onOptionsChange={setOptions} idPrefix="pos" compact />
                <Button variant="primary" onClick={compute} disabled={!run} data-testid="compute" className="w-full">
                  Berechnen
                </Button>
              </div>
            </Card>
          }
        >
          {!computed && (
            <EmptyState title="Noch nichts berechnet" description="Wählen Sie Lauf und Verfahren und klicken Sie auf „Berechnen“." />
          )}
          {computed?.error && (
            <Callout tone="danger" title="Berechnung nicht möglich" >
              <span data-testid="compute-error">{computed.error}</span>
            </Callout>
          )}
          {stale && (
            <Callout tone="info" title="Einstellungen geändert">
              Die angezeigten Werte gehören zu den vorherigen Einstellungen. Neu berechnen, um zu aktualisieren.
            </Callout>
          )}
          {result && shownRun && (
            <>
              <Card
                title={result.runName}
                subtitle={describeConfig(result.config)}
                actions={
                  <span className="text-xs text-muted" data-testid="compute-time">
                    {computed!.ms.toFixed(0)} ms
                  </span>
                }
              >
                <p className="text-xs text-muted">
                  Config-Hash: <code className="font-mono" data-testid="config-hash">{result.configHash}</code> · berechnet {result.computedAt}
                </p>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <Field label="Bezeichnung zum Speichern" className="min-w-[16rem] flex-1">
                    <TextInput value={label} onChange={(e) => setLabel(e.target.value)} data-testid="result-label" />
                  </Field>
                  <Button variant="primary" onClick={save} data-testid="save-result">
                    Ergebnis speichern
                  </Button>
                  <Button onClick={() => downloadText(`schaetzungen-${fileSlug(result.runName)}-${result.configHash}.csv`, estimatesToCsv(result, campaign.floorPlan.scale), "text/csv")} data-testid="export-estimates">
                    Schätzungen als CSV
                  </Button>
                  <Button onClick={() => downloadText(`ergebnis-${fileSlug(result.runName)}-${result.configHash}.json`, JSON.stringify(result, null, 2), "application/json")} data-testid="export-result-json">
                    Ergebnis als JSON
                  </Button>
                </div>
                {savedMsg && (
                  <p role="status" className="mt-2 text-sm text-accent" data-testid="saved-msg">
                    {savedMsg}
                  </p>
                )}
              </Card>
              <ResultView result={result} run={shownRun} campaign={campaign} />
            </>
          )}
        </SplitPane>
      )}
    </div>
  );
}
