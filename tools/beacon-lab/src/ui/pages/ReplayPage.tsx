import { useEffect, useMemo, useState } from "react";
import { Replay } from "../../map";
import { Callout, Card, EmptyState, PageHeader } from "../components";
import { RunSelect, evaluate } from "../shared";
import { useCampaign } from "../state/LabContext";
import { defaultEvalOptions, presetConfigs } from "./analysis/presets";

export function ReplayPage() {
  const { campaign, runs, results } = useCampaign();
  const calRuns = useMemo(() => runs.filter((r) => r.role === "calibration"), [runs]);
  const initial = runs.find((r) => r.role === "evaluation") ?? runs[0];
  const [runId, setRunId] = useState<string | null>(initial?.id ?? null);
  const run = runs.find((r) => r.id === runId) ?? initial;
  const presets = useMemo(() => presetConfigs(calRuns.length > 0), [calRuns.length]);
  const [algId, setAlgId] = useState<string>(presets[1]?.id ?? presets[0].id);

  useEffect(() => {
    if (run && run.id !== runId) setRunId(run.id);
  }, [run, runId]);

  const saved = useMemo(() => results.filter((r) => r.result.runId === run?.id), [results, run?.id]);
  const options = useMemo(() => [...presets.map((p) => ({ id: p.id, label: p.name })), ...saved.map((s) => ({ id: `saved:${s.id}`, label: `Gespeichert: ${s.label}` }))], [presets, saved]);
  const algorithmId = options.some((o) => o.id === algId) ? algId : options[0].id;

  const state = useMemo(() => {
    if (!run) return null;
    if (algorithmId.startsWith("saved:")) {
      const s = saved.find((x) => `saved:${x.id}` === algorithmId);
      return s ? { result: s.result, error: null as string | null, fromSaved: true } : null;
    }
    const preset = presets.find((p) => p.id === algorithmId);
    if (!preset) return null;
    const ev = evaluate(run, campaign, preset.config, defaultEvalOptions(run), calRuns);
    return { result: ev.result, error: ev.error, fromSaved: false };
  }, [run, algorithmId, saved, presets, campaign, calRuns]);

  if (runs.length === 0 || !run) {
    return (
      <>
        <PageHeader title="Replay" breadcrumbs={[campaign.name, "Visualisierung"]} />
        <EmptyState title="Keine Messreihen" description="Importieren Sie Messdaten oder laden Sie die Demo-Kampagne." />
      </>
    );
  }

  return (
    <div className="space-y-6" data-testid="replay-page">
      <PageHeader
        title="Replay"
        breadcrumbs={[campaign.name, "Visualisierung"]}
        origin={run.origin}
        description="Spielt Ground Truth, Schätzung und aktive Beacons einer Messreihe zeitlich ab. Leertaste: Play/Pause, Pfeiltasten: Epoche vor/zurück."
      />
      <Card>
        <RunSelect runs={runs} value={run.id} onChange={setRunId} id="replay-run" />
        <p className="mt-2 text-xs text-muted">Auswertungsläufe sind vorausgewählt. Kalibrierungsläufe können nicht abgespielt werden, weil die Positionsschätzung darauf einen Datenleck-Fehler auslöst.</p>
      </Card>

      {state?.error ? (
        <Callout tone="danger" title="Replay nicht möglich">
          <span data-testid="replay-page-error">{state.error}</span>
        </Callout>
      ) : state?.result ? (
        <>
          {state.fromSaved && (
            <Callout tone="info">
              Es wird das gespeicherte Ergebnis vom {state.result.computedAt.slice(0, 19).replace("T", " ")} abgespielt (nicht neu berechnet).
            </Callout>
          )}
          {state.result.warnings.length > 0 && (
            <Callout tone="warning" title="Einschränkungen der Gültigkeit">
              <ul className="list-disc space-y-1 pl-5">
                {state.result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Callout>
          )}
          <div data-testid="replay-container" className="min-w-0 max-w-full overflow-x-hidden [&_select]:max-w-full">
            <Replay
              plan={campaign.floorPlan}
              beacons={campaign.beacons}
              estimates={state.result.estimates}
              references={run.references}
              samples={run.samples}
              origin={run.origin}
              algorithmOptions={options}
              algorithmId={algorithmId}
              onAlgorithmChange={setAlgId}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
