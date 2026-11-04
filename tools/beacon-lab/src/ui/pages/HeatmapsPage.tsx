import { useEffect, useMemo, useState } from "react";
import type { EvaluationOptions, PositioningConfig } from "../../core/types";
import { distanceUnit, toDisplayDistance } from "../../core/units";
import {
  FloorPlanMap,
  HeatmapLayer,
  HeatmapLegend,
  ReferenceLayer,
  coveragePoints,
  errorPointsFromEstimates,
  measurementDensity,
  rssiPointsForBeacon,
  type HeatPoint,
  type HeatmapMode,
} from "../../map";
import { makeTruthResolver } from "../../positioning/reference";
import { Callout, Card, EmptyState, Field, NumberInput, PageHeader, Select, Tabs } from "../components";
import { ConfigEditor, RunSelect, describeConfig, useEvaluation } from "../shared";
import { useCampaign } from "../state/LabContext";
import { fmt } from "./analysis/format";
import { baseConfig, defaultEvalOptions } from "./analysis/presets";
import { heardBeacons } from "./analysis/signalStats";

type HeatType = "rssi" | "error" | "coverage" | "density";

const MODE_TEXT: Record<HeatmapMode, string> = {
  points: "Es werden nur Kreise an tatsächlich gemessenen Positionen gezeichnet. Nichts wird interpoliert; Fläche ohne Kreis bedeutet „nicht gemessen“.",
  binned: "Messpunkte werden in Rasterzellen zusammengefasst (n-gewichteter Mittelwert). Nur Zellen mit mindestens einer Messung werden gefärbt; alles andere ist schraffiert („keine Daten“).",
  idw: "INTERPOLIERT: Inverse-Distance-Weighting zwischen echten Messpunkten, nur innerhalb der maximalen Distanz. Die Farbe zwischen den Messpunkten ist eine Schätzung, keine Messung. Jenseits der Distanz wird nichts berechnet.",
};

export function HeatmapsPage() {
  const { campaign, runs, results } = useCampaign();
  const [runId, setRunId] = useState<string | null>(runs.find((r) => r.role === "evaluation")?.id ?? runs[0]?.id ?? null);
  const run = runs.find((r) => r.id === runId) ?? runs[0];
  const [type, setType] = useState<HeatType>("rssi");
  const [beaconId, setBeaconId] = useState<string>("");
  const [options, setOptions] = useState<EvaluationOptions>(() => defaultEvalOptions(run));
  const [mode, setMode] = useState<HeatmapMode>("points");
  const [cellSize, setCellSize] = useState<number>(1);
  const [idwPower, setIdwPower] = useState<number>(2);
  const [maxDistance, setMaxDistance] = useState<number>(3);
  const [errSource, setErrSource] = useState<string>("config");
  const [config, setConfig] = useState<PositioningConfig>(() => baseConfig());

  useEffect(() => {
    if (run && run.id !== runId) setRunId(run.id);
  }, [run, runId]);

  const heard = useMemo(() => (run ? heardBeacons(run.samples) : []), [run]);
  useEffect(() => {
    if (!heard.some((h) => h.beaconId === beaconId)) setBeaconId(heard[0]?.beaconId ?? "");
  }, [heard, beaconId]);

  const changeRun = (id: string) => {
    setRunId(id);
    setOptions(defaultEvalOptions(runs.find((r) => r.id === id)));
    setErrSource("config");
  };

  const scale = campaign.floorPlan.scale;
  const unit = distanceUnit(scale);
  const calRuns = useMemo(() => runs.filter((r) => r.role === "calibration"), [runs]);
  const savedForRun = results.filter((r) => r.result.runId === run?.id);
  const hasRefs = (run?.references.length ?? 0) > 0;
  const truth = useMemo(() => makeTruthResolver(run?.references ?? [], options), [run, options]);

  const evalState = useEvaluation(type === "error" && errSource === "config" ? run : undefined, campaign, config, options, calRuns);
  const savedResult = errSource !== "config" ? savedForRun.find((r) => r.id === errSource) : undefined;
  const errorEstimates = savedResult ? savedResult.result.estimates : evalState?.result?.estimates ?? null;
  const evalError = type === "error" && !savedResult ? evalState?.error ?? null : null;

  const enabledBeaconIds = useMemo(() => campaign.beacons.filter((b) => b.enabled).map((b) => b.id), [campaign.beacons]);

  const { points, unitLabel, title, colorScale, domain, quantity, digits } = useMemo(() => {
    let pts: HeatPoint[] = [];
    let u = "dBm";
    let t = "";
    let cs: "sequential" | "error" = "sequential";
    let dom: [number, number] | undefined;
    let q = "RSSI";
    let dg = 1;
    if (run && hasRefs) {
      if (type === "rssi") {
        pts = beaconId ? rssiPointsForBeacon(run.samples, run.references, beaconId, truth) : [];
        t = `Mittlerer RSSI von ${campaign.beacons.find((b) => b.id === beaconId)?.label ?? beaconId}`;
      } else if (type === "error") {
        pts = errorEstimates ? errorPointsFromEstimates(errorEstimates).map((p) => ({ ...p, value: toDisplayDistance(p.value, scale) })) : [];
        u = unit;
        t = "Mittlerer Positionsfehler";
        cs = "error";
        q = "Fehler";
        dg = 2;
      } else if (type === "coverage") {
        pts = coveragePoints(run.samples, truth, enabledBeaconIds);
        u = "Beacons";
        t = "Anzahl gehörter Beacons";
        dom = [0, Math.max(1, enabledBeaconIds.length)];
        q = "Beacons";
        dg = 0;
      } else {
        pts = measurementDensity(run.samples, truth);
        u = "Samples";
        t = "Messpunktdichte";
        q = "Samples";
        dg = 0;
      }
    }
    return { points: pts, unitLabel: u, title: t, colorScale: cs, domain: dom, quantity: q, digits: dg };
  }, [run, hasRefs, type, beaconId, truth, errorEstimates, scale, unit, campaign.beacons, enabledBeaconIds]);

  if (!run) {
    return (
      <>
        <PageHeader title="Heatmaps" breadcrumbs={[campaign.name, "Visualisierung"]} />
        <EmptyState title="Keine Messreihen" description="Importieren Sie Messdaten oder laden Sie die Demo-Kampagne." />
      </>
    );
  }

  const heatOpts = { mode, cellSize, idwPower, maxDistance, colorScale, domain };

  return (
    <div className="space-y-6" data-testid="heatmaps-page">
      <PageHeader
        title="Heatmaps"
        breadcrumbs={[campaign.name, "Visualisierung"]}
        origin={run.origin}
        description="Karten gemessener Werte an den Referenzpositionen. Standardmäßig wird nichts interpoliert."
      />

      <Card>
        <div className="grid gap-4 md:grid-cols-3">
          <RunSelect runs={runs} value={run.id} onChange={changeRun} id="heatmap-run" />
          <Field label="Referenz-Zuordnung" info="Bestimmt, welche Referenzposition einem Sample zugeordnet wird.">
            <Select
              id="heatmap-matching"
              data-testid="heatmap-matching"
              value={options.referenceMatching}
              onChange={(e) => setOptions({ ...options, referenceMatching: e.target.value as EvaluationOptions["referenceMatching"] })}
            >
              <option value="hold-or-nearest">Standzeit / nächster Punkt</option>
              <option value="interpolate">linear interpolieren (Annahme)</option>
            </Select>
          </Field>
          <Field label="Toleranz">
            <NumberInput value={options.toleranceSec} onChange={(v) => v !== null && setOptions({ ...options, toleranceSec: v })} unit="s" min={0} max={30} step={0.1} aria-label="Toleranz" />
          </Field>
        </div>
      </Card>

      <Tabs
        label="Heatmap-Typ"
        value={type}
        onChange={(id) => setType(id as HeatType)}
        renderPanel={false}
        tabs={[
          { id: "rssi", label: "RSSI" },
          { id: "error", label: "Positionsfehler" },
          { id: "coverage", label: "Beacon-Abdeckung" },
          { id: "density", label: "Messpunktdichte" },
        ]}
      />

      {!hasRefs && (
        <Callout tone="warning" title="Keine Ground Truth in dieser Messreihe" >
          <span data-testid="heatmap-no-truth">
            Positionsbasierte Heatmaps brauchen Referenzpunkte (Ground Truth): Ohne bekannte Position lässt sich kein Messwert einem Ort auf der Karte zuordnen. Wählen Sie eine Messreihe mit Referenzpunkten.
          </span>
        </Callout>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="space-y-6">
          {type === "rssi" && (
            <Card title="RSSI-Heatmap">
              <Field label="Beacon">
                <Select id="heatmap-beacon" data-testid="heatmap-beacon" value={beaconId} onChange={(e) => setBeaconId(e.target.value)}>
                  {heard.map((h) => (
                    <option key={h.beaconId} value={h.beaconId}>
                      {campaign.beacons.find((b) => b.id === h.beaconId)?.label ?? h.beaconId} ({h.count})
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="mt-2 text-xs text-muted">Mittlerer Roh-RSSI je Referenzposition.</p>
            </Card>
          )}
          {type === "error" && (
            <Card title="Positionsfehler">
              <Field label="Quelle">
                <Select id="heatmap-error-source" data-testid="heatmap-error-source" value={errSource} onChange={(e) => setErrSource(e.target.value)}>
                  <option value="config">neu berechnen mit Konfiguration</option>
                  {savedForRun.map((r) => (
                    <option key={r.id} value={r.id}>
                      gespeichert: {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {savedResult ? (
                <p className="mt-2 text-xs text-muted">Gespeichertes Ergebnis vom {savedResult.result.computedAt.slice(0, 19).replace("T", " ")} · {describeConfig(savedResult.result.config)}</p>
              ) : (
                <details className="mt-3" open>
                  <summary className="cursor-pointer text-sm font-medium">Konfiguration ({describeConfig(config)})</summary>
                  <div className="mt-3">
                    <ConfigEditor idPrefix="heat" compact config={config} onChange={setConfig} />
                  </div>
                </details>
              )}
              <p className="mt-2 text-xs text-muted">Fehler = mittlerer Abstand Schätzung–Referenz je Referenzposition; Fehlschläge fehlen (kein Wert statt erfundener Position).</p>
            </Card>
          )}
          {type === "coverage" && (
            <Card title="Beacon-Abdeckung">
              <p className="text-sm text-muted">Anzahl verschiedener aktiver Beacons ({enabledBeaconIds.length}), die an einer Referenzposition mindestens einmal gehört wurden.</p>
            </Card>
          )}
          {type === "density" && (
            <Card title="Messpunktdichte">
              <p className="text-sm text-muted">Anzahl der RSSI-Samples (alle Beacons) je Referenzposition – zeigt, wie belastbar ein Kartenpunkt ist.</p>
            </Card>
          )}

          <Card title="Darstellung">
            <Field label="Modus">
              <Select id="heatmap-mode" data-testid="heatmap-mode" value={mode} onChange={(e) => setMode(e.target.value as HeatmapMode)}>
                <option value="points">Messpunkte (keine Interpolation)</option>
                <option value="binned">Rasterzellen (Mittelwert)</option>
                <option value="idw">IDW-Interpolation</option>
              </Select>
            </Field>
            {(mode === "binned" || mode === "idw") && (
              <div className="mt-3">
                <Field label="Zellgröße">
                  <NumberInput value={cellSize} onChange={(v) => v !== null && setCellSize(v)} unit="LE" min={0.25} max={10} step={0.25} aria-label="Zellgröße" />
                </Field>
              </div>
            )}
            {mode === "idw" && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="IDW-Potenz p">
                  <NumberInput value={idwPower} onChange={(v) => v !== null && setIdwPower(v)} min={0.5} max={6} step={0.5} aria-label="IDW-Potenz" />
                </Field>
                <Field label="Max. Distanz">
                  <NumberInput value={maxDistance} onChange={(v) => v !== null && setMaxDistance(v)} unit="LE" min={0.5} max={30} step={0.5} aria-label="Maximale Distanz" />
                </Field>
              </div>
            )}
            <p className={`mt-3 text-xs ${mode === "idw" ? "font-medium text-amber-800" : "text-muted"}`} data-testid="heatmap-mode-text">
              {MODE_TEXT[mode]}
            </p>
          </Card>
        </div>

        <div className="space-y-4">
          {evalError && (
            <Callout tone="danger" title="Auswertung nicht möglich">
              {evalError}
            </Callout>
          )}
          {hasRefs && !evalError && points.length === 0 && (
            <Callout tone="info" title="Keine Messpunkte">
              Für diese Auswahl liegen keine Werte an Referenzpositionen vor (z. B. Beacon nicht gehört oder keine Samples innerhalb der Toleranz).
            </Callout>
          )}
          <div data-testid="heatmap-map">
            <FloorPlanMap
              plan={campaign.floorPlan}
              beacons={campaign.beacons}
              height={520}
              underlay={points.length > 0 ? <HeatmapLayer points={points} unit={unitLabel} quantity={quantity} valueDigits={digits} {...heatOpts} /> : undefined}
              overlays={hasRefs ? <ReferenceLayer references={run.references} showLabels={false} /> : undefined}
              legend={
                points.length > 0 ? (
                  <HeatmapLegend points={points} unit={unitLabel} title={title} scale={scale} valueDigits={digits} {...heatOpts} />
                ) : undefined
              }
            />
          </div>
          {points.length > 0 && (
            <p className="text-xs text-muted" data-testid="heatmap-summary">
              {points.length} Messposition(en) · {points.reduce((s, p) => s + (p.n ?? 1), 0)} Beobachtungen · Wertebereich {fmt(Math.min(...points.map((p) => p.value)), digits)} bis {fmt(Math.max(...points.map((p) => p.value)), digits)} {unitLabel}
              {run.origin === "synthetic" ? " · SYNTHETISCHE Daten" : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
