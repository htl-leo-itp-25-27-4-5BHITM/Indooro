import { useMemo, useState } from "react";
import type { ErrorMetrics, EvaluationResult } from "../../core/types";
import { TOOL_VERSION, downloadText } from "../../data/export";
import { assessRunQuality } from "../../data/validate";
import { compareAlgorithms } from "../../positioning/pipeline";
import { ReportPreview, buildResultsJson, resultsToCsv, type ReportFigureInput, type ReportInput, type RunQuality } from "../../report";
import { ALGORITHMS } from "../../positioning/algorithms";
import { CdfChart, chartToSvgString } from "../charts";
import { Badge, Button, Callout, Card, EmptyState, Field, OriginBadge, PageHeader, SplitPane, TextInput, Textarea } from "../components";
import { href } from "../router";
import { describeConfig } from "../shared";
import { useCampaign } from "../state/LabContext";
import { fileSlug } from "./workflow/files";
import { validErrors } from "./workflow/ResultView";

function Check({ checked, onChange, children, testId }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; testId?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-accent" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
      <span className="min-w-0">{children}</span>
    </label>
  );
}

export function ReportPage() {
  const { campaign, runs, results } = useCampaign();
  const [selResults, setSelResults] = useState<Set<string>>(() => new Set(results.map((r) => r.id)));
  const [selRuns, setSelRuns] = useState<Set<string>>(() => new Set(runs.map((r) => r.id)));
  const [notes, setNotes] = useState("");
  const [commit, setCommit] = useState("");
  const [generatedAt, setGeneratedAt] = useState(() => new Date().toISOString());

  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const n = new Set(set);
    if (on) n.add(id);
    else n.delete(id);
    return n;
  };

  const chosen = useMemo(() => results.filter((r) => selResults.has(r.id)), [results, selResults]);
  const chosenResults: EvaluationResult[] = useMemo(() => chosen.map((c) => c.result), [chosen]);
  // runs: user selection plus every run a chosen result refers to (a result without its run would be unverifiable)
  const reportRuns = useMemo(() => {
    const need = new Set(chosenResults.map((r) => r.runId));
    return runs.filter((r) => selRuns.has(r.id) || need.has(r.id));
  }, [runs, selRuns, chosenResults]);

  const input: ReportInput | null = useMemo(() => {
    if (chosen.length === 0) return null;
    const qualityByRun: Record<string, RunQuality> = {};
    for (const r of reportRuns) {
      const q = assessRunQuality(r, campaign);
      qualityByRun[r.id] = { issues: q.issues, evaluable: q.evaluable, reasons: q.reasons, perBeacon: q.perBeacon };
    }
    const figures: ReportFigureInput[] = chosen
      .filter((c) => c.result.metrics.epochsWithTruth > 0)
      .map((c) => ({
        id: `cdf-${c.id}`,
        title: `Fehlerverteilung: ${c.label}`,
        svg: chartToSvgString(
          <CdfChart
            title={`Kumulative Fehlerverteilung – ${c.label}`}
            series={[{ id: c.id, label: c.label, values: validErrors(c.result, campaign), total: c.result.metrics.epochsWithTruth }]}
            unit={c.result.metrics.unit}
            synthetic={c.result.origin === "synthetic"}
            width={720}
            height={320}
          />,
        ),
        caption: `Kumulative Verteilung des Positionsfehlers (${c.result.metrics.unit}); ${describeConfig(c.result.config)}; Messreihe ${c.result.runName}; Config-Hash ${c.result.configHash}. Fehlschläge zählen als „nicht innerhalb“.`,
      }));

    let commonComparison: { commonEpochs: number; common: ErrorMetrics[] } | undefined;
    const runIds = new Set(chosenResults.map((r) => r.runId));
    if (chosenResults.length >= 2 && runIds.size === 1) {
      const run = runs.find((r) => r.id === chosenResults[0].runId);
      if (run && run.role === "evaluation") {
        try {
          const cmp = compareAlgorithms({
            run,
            campaign,
            options: chosenResults[0].options,
            configs: chosenResults.map((r) => r.config),
            calibrationRuns: runs.filter((r) => r.role === "calibration"),
          });
          commonComparison = { commonEpochs: cmp.commonEpochs, common: cmp.common };
        } catch {
          commonComparison = undefined;
        }
      }
    }

    return {
      campaign,
      runs: reportRuns,
      results: chosenResults,
      qualityByRun,
      commonComparison,
      figures,
      toolVersion: TOOL_VERSION,
      gitCommit: commit.trim() || undefined,
      interpretationNotes: notes.trim() || undefined,
      generatedAt,
    };
  }, [chosen, chosenResults, reportRuns, runs, campaign, commit, notes, generatedAt]);

  const hasSynthetic = campaign.floorPlan.origin === "synthetic" || reportRuns.some((r) => r.origin === "synthetic") || chosenResults.some((r) => r.origin === "synthetic");

  const allResultsInput: ReportInput = {
    campaign,
    runs,
    results: results.map((r) => r.result),
    toolVersion: TOOL_VERSION,
    gitCommit: commit.trim() || undefined,
    generatedAt,
  };
  const base = `${fileSlug(campaign.name)}${hasSynthetic ? "-synthetisch" : ""}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bericht & Export"
        breadcrumbs={["Ergebnis", "Bericht"]}
        origin={hasSynthetic ? "synthetic" : "real"}
        description="Gespeicherte Ergebnisse auswählen, Interpretation ergänzen und den druckbaren Bericht erzeugen."
        actions={
          results.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => downloadText(`ergebnisse-${base}.json`, buildResultsJson(allResultsInput), "application/json")} data-testid="export-results-json">
                Alle Ergebnisse (JSON)
              </Button>
              <Button onClick={() => downloadText(`ergebnisse-${base}.csv`, resultsToCsv(results.map((r) => r.result)), "text/csv")} data-testid="export-results-csv">
                Alle Ergebnisse (CSV)
              </Button>
            </div>
          ) : undefined
        }
      />

      {results.length === 0 ? (
        <EmptyState
          title="Noch keine gespeicherten Ergebnisse"
          description="Berechnen Sie ein Ergebnis und speichern Sie es – dann kann es hier in den Bericht aufgenommen werden."
          action={
            <div className="flex gap-3 text-sm">
              <a href={href(campaign.id, "positioning")}>Zur Positionierung</a>
              <a href={href(campaign.id, "compare")}>Zum Algorithmusvergleich</a>
            </div>
          }
        />
      ) : (
        <SplitPane
          sideWidth={380}
          side={
            <>
              <Card title="Ergebnisse im Bericht" subtitle={`${chosen.length} von ${results.length} gewählt`}>
                <div className="space-y-3" data-testid="result-select">
                  {results.map((s) => (
                    <Check key={s.id} checked={selResults.has(s.id)} onChange={(v) => setSelResults(toggle(selResults, s.id, v))} testId="result-check">
                      <span className="block font-medium">{s.label}</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        {ALGORITHMS[s.result.config.algorithm].name} · {s.result.runName} <OriginBadge origin={s.result.origin} />
                      </span>
                    </Check>
                  ))}
                </div>
              </Card>
              <Card title="Messreihen im Bericht" subtitle="Messreihen gewählter Ergebnisse sind immer enthalten.">
                <div className="space-y-2" data-testid="run-select">
                  {runs.map((r) => {
                    const forced = chosenResults.some((x) => x.runId === r.id);
                    return (
                      <Check key={r.id} checked={selRuns.has(r.id) || forced} onChange={(v) => setSelRuns(toggle(selRuns, r.id, v))} testId="run-check">
                        {r.name} {forced && <Badge variant="neutral">durch Ergebnis nötig</Badge>}
                      </Check>
                    );
                  })}
                </div>
              </Card>
              <Card title="Angaben">
                <div className="space-y-3">
                  <Field label="Interpretation des Teams" hint="Nur dieser Text erscheint als Interpretation im Bericht. Zahlen und Hypothesen bleiben getrennt.">
                    <Textarea rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="interpretation" />
                  </Field>
                  <Field label="Git-Commit (optional)" hint="Stand des Lab-Codes, mit dem ausgewertet wurde.">
                    <TextInput value={commit} onChange={(e) => setCommit(e.target.value)} data-testid="git-commit" />
                  </Field>
                  <Button onClick={() => setGeneratedAt(new Date().toISOString())}>Erstellungszeit aktualisieren</Button>
                </div>
              </Card>
            </>
          }
        >
          {hasSynthetic && (
            <Callout tone="synthetic" title="Enthält synthetische Daten – keine Messergebnisse">
              Der Bericht wird entsprechend gekennzeichnet.
            </Callout>
          )}
          {input ? (
            <div data-testid="report-preview">
              <ReportPreview input={input} />
            </div>
          ) : (
            <EmptyState title="Kein Ergebnis gewählt" description="Wählen Sie links mindestens ein gespeichertes Ergebnis aus." />
          )}
        </SplitPane>
      )}
    </div>
  );
}
