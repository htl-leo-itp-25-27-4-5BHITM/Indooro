import { useMemo, useState } from "react";
import { DEFAULT_POSITIONING_CONFIG } from "../../core/defaults";
import type { EvaluationOptions, MeasurementRun, PositioningConfig } from "../../core/types";
import { distanceUnit } from "../../core/units";
import { downloadText } from "../../data/export";
import { FloorPlanMap, formatPosition } from "../../map";
import {
  beaconLeaveOneOut,
  beaconReception,
  beaconResiduals,
  summarizeBeaconHealth,
  type LeaveOneOutResult,
  type ReceptionResult,
  type ResidualsResult,
  type HealthSummary,
} from "../../positioning/diagnostics";
import { BarChart, ScatterChart } from "../charts";
import { Badge, Button, Callout, Card, EmptyState, PageHeader, Select, Spinner } from "../components";
import { ConfigEditor, RunSelect, runLabel } from "../shared";
import { useCampaign } from "../state/LabContext";
import { SOURCE_LABEL } from "./analysis/calibrationData";
import { fmt, decimate } from "./analysis/format";
import { cloneConfig, defaultEvalOptions } from "./analysis/presets";
import { BeaconFindingLayer, SEVERITY_COLOR, type BeaconMarker } from "./beacons/BeaconFindingLayer";
import { diagnosticsToCsv, diagnosticsToJson, type DiagnosticsBundle } from "./beacons/export";

interface Computed {
  residuals: ResidualsResult;
  reception: ReceptionResult;
  leaveOneOut: LeaveOneOutResult | null;
  looError: string | null;
  health: HealthSummary;
  analysisRunIds: string[];
  evaluationRunId: string | null;
  generatedAt: string;
}

const MAX_POINTS = 2500;

function signed(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  return `${v > 0 ? "+" : ""}${fmt(v, digits)}`;
}

export function BeaconDiagnosticsPage() {
  const { campaign, runs } = useCampaign();
  const evalRuns = useMemo(() => runs.filter((r) => r.role === "evaluation"), [runs]);
  const calRuns = useMemo(() => runs.filter((r) => r.role === "calibration"), [runs]);
  const [evalId, setEvalId] = useState<string | null>(evalRuns[0]?.id ?? null);
  const evalRun: MeasurementRun | undefined = evalRuns.find((r) => r.id === evalId) ?? evalRuns[0];
  const [config, setConfig] = useState<PositioningConfig>(() => cloneConfig(DEFAULT_POSITIONING_CONFIG));
  const [options, setOptions] = useState<EvaluationOptions>(() => defaultEvalOptions(evalRun));
  const [useLoo, setUseLoo] = useState(true);
  const [analysisIds, setAnalysisIds] = useState<string[]>(() => (calRuns.length > 0 ? calRuns.map((r) => r.id) : evalRuns.map((r) => r.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [computed, setComputed] = useState<Computed | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const scale = campaign.floorPlan.scale;
  const unit = distanceUnit(scale);
  const analysisRuns = runs.filter((r) => analysisIds.includes(r.id));
  const synthetic = campaign.floorPlan.origin === "synthetic" || analysisRuns.some((r) => r.origin === "synthetic") || evalRun?.origin === "synthetic";
  const model = campaign.pathLoss;
  const perBeaconModels = campaign.beacons.filter((b) => b.pathLoss).length;
  const modelNote = `Pfadverlustmodell: ${SOURCE_LABEL[model.source]} (A = ${fmt(model.rssiAt1m, 1)} dBm @ 1 m, n = ${fmt(model.pathLossExponent, 2)})${perBeaconModels > 0 ? `; ${perBeaconModels} Beacon(s) mit eigenem Modell` : ""}`;

  const compute = () => {
    setBusy(true);
    setError(null);
    // let the spinner paint before the synchronous computation
    setTimeout(() => {
      try {
        const residuals = beaconResiduals(analysisRuns, campaign);
        const reception = beaconReception(analysisRuns, campaign);
        let leaveOneOut: LeaveOneOutResult | null = null;
        let looError: string | null = null;
        if (useLoo) {
          if (!evalRun) looError = "Kein Auswertungslauf gewählt.";
          else {
            try {
              leaveOneOut = beaconLeaveOneOut(evalRun, campaign, config, options, calRuns);
            } catch (e) {
              looError = e instanceof Error ? e.message : String(e);
            }
          }
        }
        const health = summarizeBeaconHealth({ campaign, residuals, reception, leaveOneOut });
        setComputed({
          residuals,
          reception,
          leaveOneOut,
          looError,
          health,
          analysisRunIds: analysisRuns.map((r) => r.id),
          evaluationRunId: useLoo ? (evalRun?.id ?? null) : null,
          generatedAt: new Date().toISOString(),
        });
        setSelected((s) => s ?? campaign.beacons[0]?.id ?? null);
      } catch (e) {
        setComputed(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    }, 20);
  };

  const bundle: DiagnosticsBundle | null = computed
    ? {
        campaign,
        health: computed.health,
        residuals: computed.residuals,
        reception: computed.reception,
        leaveOneOut: computed.leaveOneOut,
        modelNote,
        analysisRunIds: computed.analysisRunIds,
        evaluationRunId: computed.evaluationRunId,
        generatedAt: computed.generatedAt,
        synthetic,
      }
    : null;
  const stamp = (computed?.generatedAt ?? "").slice(0, 19).replace(/[:T]/g, "-");

  const markers: BeaconMarker[] = useMemo(() => {
    if (!computed) return [];
    return campaign.beacons.map((b) => {
      const h = computed.health.beacons.find((x) => x.beaconId === b.id);
      const l = computed.leaveOneOut?.rows.find((x) => x.beaconId === b.id);
      return {
        id: b.id,
        x: b.position.x,
        y: b.position.y,
        severity: h?.severity ?? null,
        dataSufficient: h?.dataSufficient ?? false,
        badge: l && l.deltaMedian !== null ? `Δ ${signed(l.deltaMedian)} ${computed.leaveOneOut?.unit}` : undefined,
      };
    });
  }, [computed, campaign.beacons]);

  if (evalRuns.length === 0 && calRuns.length === 0) {
    return (
      <>
        <PageHeader title="Beacon-Diagnose" breadcrumbs={[campaign.name, "Analyse"]} />
        <EmptyState title="Keine Messläufe" description="Die Diagnose braucht Läufe mit stationären Haltepunkten (Residuen, Empfang) bzw. einen Auswertungslauf (Leave-one-out)." />
      </>
    );
  }

  const toggleRun = (id: string, on: boolean) => setAnalysisIds((s) => (on ? [...s, id] : s.filter((x) => x !== id)));
  const sel = computed?.residuals.beacons.find((b) => b.beaconId === selected);
  const thr = computed?.residuals.thresholds.biasThresholdDb ?? 6;
  const looRows = computed?.leaveOneOut?.rows ?? [];
  const evalInAnalysis = analysisRuns.some((r) => r.role === "evaluation");

  return (
    <div className="space-y-6" data-testid="beacons-page">
      <PageHeader
        title="Beacon-Diagnose"
        breadcrumbs={[campaign.name, "Analyse"]}
        origin={synthetic ? "synthetic" : "real"}
        description="Welche Beacons sind auffällig – ungünstig platziert, still oder falsch eingetragen? Hinweise aus Messdaten, keine Urteile."
      />

      <Callout tone="info" title="Annahmen und Grenzen">
        <span data-testid="beacons-assumptions">
          {modelNote}. Residuen = gemessener RSSI − Modell in stationären Haltepunkten (nur Beacon–Halt-Paare bis 10 m). Leave-one-out gilt nur für den gewählten Lauf und die gewählte
          Konfiguration. Ein Hinweis ist kein Defektnachweis: vor Ort Position, Batterie und Montage prüfen. Fehler in {unit === "m" ? "Metern" : "Layout-Einheiten (LE), Maßstab nicht bestätigt"}.
        </span>
      </Callout>
      {model.source === "default" && (
        <Callout tone="warning" title="Unkalibriertes Pfadverlustmodell">
          <span data-testid="beacons-uncalibrated">
            Es gelten die Standardwerte (−72 dBm @ 1 m, n = 2,8), nicht feldkalibriert. Bias-Werte sind dann vor allem ein Maß für das Modell, nicht für einzelne Beacons – nur Unterschiede
            zwischen Beacons sind aussagekräftig. Zuerst unter „Kalibrierung“ ein Modell anpassen.
          </span>
        </Callout>
      )}
      {synthetic && (
        <Callout tone="synthetic" title="Synthetische Daten">
          Die Ergebnisse beschreiben die Simulation, nicht reale Hardware oder Räume.
        </Callout>
      )}
      {evalInAnalysis && (
        <Callout tone="info" title="Auswertungslauf für Residuen gewählt">
          Es wird nichts angepasst – die Residuen dienen nur der Ansicht. Ergebnisse daraus dürfen nicht in ein Modell zurückfließen, das auf demselben Lauf bewertet wird.
        </Callout>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Card title="Läufe für Residuen und Empfang" subtitle="Läufe mit stationären Haltepunkten">
            <ul className="space-y-2" data-testid="beacons-run-list">
              {runs.map((r) => (
                <li key={r.id}>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1" checked={analysisIds.includes(r.id)} onChange={(e) => toggleRun(r.id, e.target.checked)} data-testid={`beacons-run-${r.id}`} />
                    <span>
                      {runLabel(r)}
                      <span className="block text-xs text-muted">{r.samples.length} Samples · {r.references.length} Referenzpunkte</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Leave-one-out" subtitle="Beacon weglassen und Auswertung wiederholen">
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={useLoo} onChange={(e) => setUseLoo(e.target.checked)} data-testid="beacons-loo-toggle" />
                Leave-one-out berechnen
              </label>
              {useLoo && (
                <>
                  <RunSelect runs={runs} roles={["evaluation"]} value={evalRun?.id ?? null} onChange={(id) => { setEvalId(id); setOptions(defaultEvalOptions(evalRuns.find((r) => r.id === id))); }} label="Auswertungslauf" id="beacons-eval-run" />
                  <ConfigEditor config={config} onChange={setConfig} options={options} onOptionsChange={setOptions} compact idPrefix="beacons-cfg" />
                </>
              )}
            </div>
          </Card>

          <Button className="w-full" data-testid="beacons-compute" disabled={busy || (analysisRuns.length === 0 && !(useLoo && evalRun))} onClick={compute}>
            {busy ? <Spinner /> : null} Diagnose berechnen
          </Button>
        </div>

        <div className="min-w-0 space-y-6">
          {error && (
            <Callout tone="danger" title="Diagnose nicht möglich">
              {error}
            </Callout>
          )}
          {computed?.looError && (
            <Callout tone="danger" title="Leave-one-out nicht möglich">
              <span data-testid="beacons-loo-error">{computed.looError}</span>
            </Callout>
          )}
          {!computed && !error && (
            <Callout tone="info" title="Noch nicht berechnet">
              Läufe wählen und „Diagnose berechnen“ starten. Rechenzeit: eine Auswertung je aktivem Beacon plus Baseline.
            </Callout>
          )}

          {computed && (
            <>
              {computed.health.warnings.map((w, i) => (
                <Callout key={i} tone="warning" title="Hinweis">
                  {w}
                </Callout>
              ))}
              {computed.leaveOneOut && <p className="text-xs text-muted" data-testid="beacons-loo-note">{computed.leaveOneOut.note}</p>}

              <Card title="Karte" subtitle="Farbe = Befund (orange Warnung, blau Hinweis, grün unauffällig, grau zu wenige Daten); Badge = Δ Median ohne den Beacon (positiv = Beacon hilft)">
                <div data-testid="beacons-map">
                  <FloorPlanMap
                    plan={campaign.floorPlan}
                    beacons={campaign.beacons}
                    height={460}
                    selectedId={selected ?? undefined}
                    onSelect={(s) => s.kind === "beacon" && setSelected(s.id)}
                    overlays={<BeaconFindingLayer markers={markers} />}
                    legend={
                      <>
                        {([["warning", "Warnung"], ["info", "Hinweis"], ["ok", "unauffällig"], ["none", "zu wenige Daten"]] as const).map(([k, l]) => (
                          <span key={k} className="inline-flex items-center gap-1.5 text-xs text-muted">
                            <span className="inline-block h-3 w-3 rounded-full border-2" style={{ borderColor: SEVERITY_COLOR[k] }} />
                            {l}
                          </span>
                        ))}
                      </>
                    }
                  />
                </div>
              </Card>

              <Card title="Beacons im Überblick" flush>
                <div className="overflow-auto" data-testid="beacons-table">
                  <table className="w-full border-collapse text-sm">
                    <caption className="sr-only">Diagnose je Beacon</caption>
                    <thead>
                      <tr className="bg-page text-left text-xs font-semibold text-muted">
                        {["Beacon", "Position", "Samples", "Bias ± σ (dB)", "Empfang nah", `Δ Median (${unit})`, `Δ P95 (${unit})`, "Δ Ausfall (PP)", "Befunde"].map((h, i) => (
                          <th key={h} scope="col" className={`border-b border-line px-3 py-2 ${i >= 2 && i <= 7 ? "text-right" : ""}`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {campaign.beacons.map((b) => {
                        const r = computed.residuals.beacons.find((x) => x.beaconId === b.id);
                        const c = computed.reception.beacons.find((x) => x.beaconId === b.id);
                        const l = computed.leaveOneOut?.rows.find((x) => x.beaconId === b.id);
                        const h = computed.health.beacons.find((x) => x.beaconId === b.id);
                        return (
                          <tr
                            key={b.id}
                            data-testid={`beacons-row-${b.id}`}
                            data-severity={h?.severity ?? "none"}
                            onClick={() => setSelected(b.id)}
                            className={`cursor-pointer border-b border-line align-top last:border-b-0 hover:bg-page ${selected === b.id ? "bg-teal/5" : ""}`}
                          >
                            <td className="px-3 py-2 font-medium">
                              {b.label ?? b.id} {!b.enabled && <Badge variant="neutral">aus</Badge>}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted">{formatPosition(b.position, scale)}</td>
                            <td className="tabular px-3 py-2 text-right">{r?.n ?? 0}</td>
                            <td className="tabular px-3 py-2 text-right">{r && r.enoughData ? `${signed(r.biasDb, 1)} ± ${fmt(r.stdDb, 1)}` : "zu wenige Daten"}</td>
                            <td className="tabular px-3 py-2 text-right">{c && c.nearHolds > 0 ? `${c.nearHolds - c.silentNearHolds}/${c.nearHolds}` : "–"}</td>
                            <td className="tabular px-3 py-2 text-right">{signed(l?.deltaMedian)}</td>
                            <td className="tabular px-3 py-2 text-right">{signed(l?.deltaP95)}</td>
                            <td className="tabular px-3 py-2 text-right">{l?.deltaFailureRate != null ? signed(l.deltaFailureRate * 100, 1) : "–"}</td>
                            <td className="min-w-[16rem] px-3 py-2 text-xs">
                              {h && h.findings.length > 0 ? (
                                <ul className="space-y-1">
                                  {h.findings.map((f, i) => (
                                    <li key={i}>
                                      <Badge variant={f.severity === "warning" ? "warning" : "neutral"}>{f.severity === "warning" ? "Warnung" : "Hinweis"}</Badge> {f.text}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="text-muted">kein Befund</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="px-4 py-2 text-xs text-muted">„Empfang nah“ = Haltepunkte ≤ 5 m mit normalem Empfang / alle Haltepunkte ≤ 5 m. PP = Prozentpunkte.</p>
              </Card>

              {looRows.length > 0 && (
                <Card title={`Δ Median-Fehler ohne Beacon (${unit})`} subtitle={`Baseline-Median: ${fmt(computed.leaveOneOut?.baseline.median, 2)} ${unit}. Positiv = Beacon hilft, negativ = Auswertung wird ohne ihn besser.`}>
                  <BarChart
                    title="Δ Median-Fehler je Beacon bei Weglassen"
                    synthetic={synthetic}
                    height={280}
                    categories={looRows.map((r) => r.beaconId)}
                    series={[{ id: "dm", label: "Δ Median", values: looRows.map((r) => r.deltaMedian), color: "#167768" }]}
                    valueLabel={`Δ Median (${unit})`}
                    unit={unit}
                    zeroBased
                  />
                </Card>
              )}

              <Card
                title="Residuum über Distanz"
                subtitle={`gemessen − Modell, je Beacon; Hilfslinien bei 0 und ±${fmt(thr, 0)} dB`}
                actions={
                  <Select aria-label="Beacon für Streudiagramm" data-testid="beacons-scatter-select" value={selected ?? ""} onChange={(e) => setSelected(e.target.value)}>
                    {campaign.beacons.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label ?? b.id}
                      </option>
                    ))}
                  </Select>
                }
              >
                {sel && sel.points.length > 0 ? (
                  <ScatterChart
                    title={`Residuum über Distanz, Beacon ${sel.beaconId}`}
                    synthetic={synthetic}
                    height={300}
                    xLabel="Distanz"
                    xUnit="m"
                    yLabel="Residuum"
                    yUnit="dB"
                    series={[{ id: "res", label: `Samples (${sel.points.length})`, color: "#8a9ba6", points: decimate(sel.points, MAX_POINTS).map((p) => ({ x: p.distanceM, y: p.residualDb })) }]}
                    curves={(() => {
                      const xs = sel.points.map((p) => p.distanceM);
                      let lo = Infinity, hi = -Infinity;
                      for (const x of xs) { if (x < lo) lo = x; if (x > hi) hi = x; }
                      const line = (y: number) => [{ x: lo, y }, { x: hi, y }];
                      return [
                        { id: "zero", label: "Modell (0 dB)", color: "#167768", points: line(0) },
                        { id: "up", label: `+${fmt(thr, 0)} dB`, color: "#d97706", dashed: true, points: line(thr) },
                        { id: "dn", label: `−${fmt(thr, 0)} dB`, color: "#d97706", dashed: true, points: line(-thr) },
                      ];
                    })()}
                  />
                ) : (
                  <p className="text-sm text-muted">Für diesen Beacon liegen keine Haltepunkt-Samples im Bereich ≤ {computed.residuals.thresholds.maxDistanceM} m vor.</p>
                )}
              </Card>

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" data-testid="beacons-export-csv" onClick={() => bundle && downloadText(`beacon-diagnose-${stamp}.csv`, diagnosticsToCsv(bundle), "text/csv")}>
                  CSV exportieren
                </Button>
                <Button variant="secondary" data-testid="beacons-export-json" onClick={() => bundle && downloadText(`beacon-diagnose-${stamp}.json`, diagnosticsToJson(bundle), "application/json")}>
                  JSON exportieren
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
