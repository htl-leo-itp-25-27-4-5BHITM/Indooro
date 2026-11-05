import { useMemo, useState } from "react";
import { DEFAULT_POSITIONING_CONFIG } from "../../core/defaults";
import type { Beacon, PathLossModel } from "../../core/types";
import { calibrateFromRuns, type CalibrationResult } from "../../positioning/pathloss";
import { ScatterChart, type CurveOverlay } from "../charts";
import { Badge, Button, Callout, Card, DataTable, EmptyState, Field, NumberInput, PageHeader, StatTile, Toggle, type DataColumn } from "../components";
import { runLabel } from "../shared";
import { useCampaign } from "../state/LabContext";
import { SOURCE_LABEL, modelCurve } from "./analysis/calibrationData";
import { decimate, fmt } from "./analysis/format";

const MAX_POINTS = 3000;

interface BeaconRow {
  beacon: Beacon;
  model: PathLossModel | null;
  error: string | null;
}

function sourceVariant(m: PathLossModel): "warning" | "success" | "neutral" {
  return m.source === "default" ? "warning" : m.source === "fitted" ? "success" : "neutral";
}

export function CalibrationPage() {
  const { campaign, runs, saveCampaign } = useCampaign();
  const calRuns = useMemo(() => runs.filter((r) => r.role === "calibration"), [runs]);
  const [selected, setSelected] = useState<string[]>(() => calRuns.map((r) => r.id));
  const [maxDistance, setMaxDistance] = useState<number | null>(null);
  const [xLog, setXLog] = useState(false);
  const [state, setState] = useState<{ result: CalibrationResult; runIds: string[]; maxDistance: number | null } | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [manualA, setManualA] = useState<number | null>(campaign.pathLoss.rssiAt1m);
  const [manualN, setManualN] = useState<number | null>(campaign.pathLoss.pathLossExponent);

  const selectedRuns = calRuns.filter((r) => selected.includes(r.id));
  const synthetic = selectedRuns.some((r) => r.origin === "synthetic") || campaign.floorPlan.origin === "synthetic";
  const cfg = DEFAULT_POSITIONING_CONFIG;

  const calibrate = (limit: number | null = maxDistance) => {
    setFatal(null);
    setStatus(null);
    try {
      const result = calibrateFromRuns(selectedRuns, campaign, cfg, limit !== null && limit > 0 ? { maxDistanceM: limit } : {});
      setState({ result, runIds: selectedRuns.map((r) => r.id), maxDistance: limit });
    } catch (e) {
      setState(null);
      setFatal(e instanceof Error ? e.message : String(e));
    }
  };

  // exactly the pairs the fit used (returned by calibrateFromRuns) – the plot can never drift from the fit
  const pairs = useMemo(() => (state ? state.result.pairs.filter((p) => p.distanceM > 0) : []), [state]);

  const curves = useMemo<CurveOverlay[]>(() => {
    const ds = pairs.map((p) => p.distanceM);
    // loop instead of Math.min(...ds): calibration can have >100k pairs (argument-spread stack overflow)
    let lo = Infinity, hi = -Infinity;
    for (const d of ds) {
      if (d < lo) lo = d;
      if (d > hi) hi = d;
    }
    if (!Number.isFinite(lo)) [lo, hi] = [0.5, 15];
    const out: CurveOverlay[] = [];
    if (state?.result.model) out.push({ id: "fit", label: "neu angepasstes Modell", color: "#167768", points: modelCurve(state.result.model, lo, hi) });
    out.push({ id: "campaign", label: `aktuelles Kampagnenmodell (${SOURCE_LABEL[campaign.pathLoss.source]})`, color: "#d97706", dashed: true, points: modelCurve(campaign.pathLoss, lo, hi) });
    return out;
  }, [pairs, state, campaign.pathLoss]);

  const rows: BeaconRow[] = useMemo(
    () =>
      campaign.beacons.map((b) => {
        const m = state?.result.perBeacon[b.id];
        return { beacon: b, model: m && !("error" in m) ? m : null, error: m && "error" in m ? m.error : state ? "keine Daten" : null };
      }),
    [campaign.beacons, state],
  );

  const applyCampaignModel = async (model: PathLossModel) => {
    await saveCampaign({ ...campaign, pathLoss: model });
    setStatus(`Kampagnenmodell gesetzt: A = ${fmt(model.rssiAt1m, 1)} dBm, n = ${fmt(model.pathLossExponent, 2)} (${SOURCE_LABEL[model.source]}).`);
  };
  const applyBeaconModel = async (id: string, model: PathLossModel) => {
    await saveCampaign({ ...campaign, beacons: campaign.beacons.map((b) => (b.id === id ? { ...b, pathLoss: model } : b)) });
    setStatus(`Beacon-Modell für ${id} gesetzt.`);
  };

  const manualValid = manualA !== null && manualN !== null && Number.isFinite(manualA) && manualN > 0;

  if (calRuns.length === 0) {
    return (
      <>
        <PageHeader title="Kalibrierung" breadcrumbs={[campaign.name, "Analyse"]} />
        <EmptyState
          title="Keine Kalibrierungsläufe"
          description="Zur Kalibrierung werden Läufe mit der Rolle „Kalibrierung“ und stationären Haltepunkten benötigt. Auswertungsläufe sind ausgeschlossen, damit keine Daten aus der Auswertung in das Modell einfließen."
        />
        <ManualModel campaign={campaign.pathLoss} a={manualA} n={manualN} setA={setManualA} setN={setManualN} valid={manualValid} onApply={() => manualValid && applyCampaignModel({ rssiAt1m: manualA, pathLossExponent: manualN, source: "manual" })} status={status} />
      </>
    );
  }

  const m = state?.result.model;
  const colsBeacon: DataColumn<BeaconRow>[] = [
    { key: "id", header: "Beacon", sortValue: (r) => r.beacon.id, render: (r) => r.beacon.label ?? r.beacon.id },
    { key: "A", header: "A (dBm @ 1 m)", numeric: true, sortValue: (r) => r.model?.rssiAt1m, render: (r) => fmt(r.model?.rssiAt1m, 1) },
    { key: "n", header: "n", numeric: true, sortValue: (r) => r.model?.pathLossExponent, render: (r) => fmt(r.model?.pathLossExponent, 2) },
    { key: "r2", header: "R²", numeric: true, sortValue: (r) => r.model?.r2, render: (r) => fmt(r.model?.r2, 3) },
    { key: "sigma", header: "σ Residuen (dB)", numeric: true, sortValue: (r) => r.model?.residualStdDb, render: (r) => fmt(r.model?.residualStdDb, 2) },
    { key: "N", header: "N", numeric: true, sortValue: (r) => r.model?.sampleCount, render: (r) => r.model?.sampleCount ?? "–" },
    {
      key: "cur",
      header: "aktuell",
      render: (r) => (r.beacon.pathLoss ? <Badge variant={sourceVariant(r.beacon.pathLoss)}>eigenes Modell</Badge> : <span className="text-muted">Kampagnenmodell</span>),
    },
    {
      key: "act",
      header: "",
      render: (r) =>
        r.model ? (
          <Button size="sm" variant="secondary" data-testid={`calibration-apply-beacon-${r.beacon.id}`} onClick={() => void applyBeaconModel(r.beacon.id, r.model as PathLossModel)}>
            übernehmen
          </Button>
        ) : (
          <span className="text-xs text-danger">{r.error ?? ""}</span>
        ),
    },
  ];

  return (
    <div className="space-y-6" data-testid="calibration-page">
      <PageHeader
        title="Kalibrierung des Pfadverlustmodells"
        breadcrumbs={[campaign.name, "Analyse"]}
        origin={synthetic ? "synthetic" : "real"}
        description="Anpassung von RSSI(d) = A − 10·n·log₁₀(d) an stationäre Kalibrierungsläufe (kleinste Quadrate)."
      />

      <Callout tone="info" title="Warum nur Kalibrierungsläufe?">
        Kalibrierung und Auswertung müssen getrennte Messungen sein: Würde das Modell auf denselben Daten angepasst, auf denen es später bewertet wird, wären die Fehlerwerte zu optimistisch (Datenleck). Deshalb sind hier ausschließlich Läufe mit der Rolle „Kalibrierung“ wählbar, und die Auswertung verweigert Kalibrierungsläufe.
      </Callout>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Card title="Aktuelles Kampagnenmodell">
            <div className="flex flex-wrap items-center gap-2" data-testid="calibration-current-model">
              <span data-testid="calibration-current-source">
                <Badge variant={sourceVariant(campaign.pathLoss)}>{SOURCE_LABEL[campaign.pathLoss.source]}</Badge>
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted">A (RSSI bei 1 m)</dt>
              <dd className="tabular text-right">{fmt(campaign.pathLoss.rssiAt1m, 1)} dBm</dd>
              <dt className="text-muted">Exponent n</dt>
              <dd className="tabular text-right">{fmt(campaign.pathLoss.pathLossExponent, 2)}</dd>
              {campaign.pathLoss.r2 !== undefined && (
                <>
                  <dt className="text-muted">R²</dt>
                  <dd className="tabular text-right">{fmt(campaign.pathLoss.r2, 3)}</dd>
                </>
              )}
              {campaign.pathLoss.sampleCount !== undefined && (
                <>
                  <dt className="text-muted">N</dt>
                  <dd className="tabular text-right">{campaign.pathLoss.sampleCount}</dd>
                </>
              )}
            </dl>
            {campaign.pathLoss.source === "default" && (
              <p className="mt-3 text-xs text-muted">Standardwerte der Lab-Voreinstellung – nicht kalibriert. Ergebnisse, die dieses Modell nutzen, sind entsprechend gekennzeichnet.</p>
            )}
          </Card>

          <Card title="Kalibrierungsläufe wählen">
            <ul className="space-y-2" data-testid="calibration-run-list">
              {calRuns.map((r) => (
                <li key={r.id}>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.includes(r.id)}
                      data-testid={`calibration-run-${r.id}`}
                      onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id)))}
                    />
                    <span>
                      {runLabel(r)}
                      <span className="block text-xs text-muted">
                        {r.samples.length} Samples · {r.references.length} Referenzpunkte
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <Field label="Maximale Kalibrierdistanz (optional)" hint="Messpaare jenseits dieser Distanz werden ignoriert – sinnvoll, wenn ferne Beacons nur noch selten empfangen werden.">
                <div data-testid="calibration-max-distance">
                  <NumberInput value={maxDistance} onChange={setMaxDistance} unit="m" min={0.5} max={200} step={0.5} placeholder="keine" aria-label="Maximale Kalibrierdistanz" />
                </div>
              </Field>
            </div>
            <Button className="mt-4 w-full" data-testid="calibration-run" disabled={selectedRuns.length === 0} onClick={() => calibrate()}>
              Kalibrieren
            </Button>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          {fatal && (
            <Callout tone="danger" title="Kalibrierung nicht möglich">
              {fatal}
            </Callout>
          )}
          {status && (
            <Callout tone="info" title="Gespeichert">
              <span data-testid="calibration-status">{status}</span>
            </Callout>
          )}
          {!state && !fatal && (
            <Callout tone="info" title="Noch nicht kalibriert">
              Wählen Sie Läufe und starten Sie „Kalibrieren“. Es werden nur Samples innerhalb stationärer Haltepunkte verwendet; die Referenzdistanz folgt aus Beacon-Position, Halteposition und Maßstab.
            </Callout>
          )}

          {state && (
            <div className="space-y-4" data-testid="calibration-result">
              {state.result.warnings.map((w, i) => {
                const censor = w.includes("Zensierung");
                return (
                  <Callout
                    key={i}
                    tone="warning"
                    title={censor ? "Zensierung durch die Empfangsgrenze" : w.startsWith("Maßstab") ? "Maßstab nicht bestätigt" : "Hinweis"}
                    actions={
                      censor && state.result.suggestedMaxDistanceM !== undefined ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          data-testid="calibration-apply-suggested-distance"
                          onClick={() => {
                            const d = state.result.suggestedMaxDistanceM!;
                            setMaxDistance(d);
                            calibrate(d);
                          }}
                        >
                          Mit ≤ {state.result.suggestedMaxDistanceM} m neu fitten
                        </Button>
                      ) : undefined
                    }
                  >
                    <span data-testid={censor ? "calibration-censoring-warning" : "calibration-warning"}>{w}</span>
                  </Callout>
                );
              })}
              {state.result.error && (
                <Callout tone="danger" title="Fit fehlgeschlagen">
                  {state.result.error}
                </Callout>
              )}
              {m && (
                <>
                  <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
                    <StatTile label="A (RSSI @ 1 m)" value={fmt(m.rssiAt1m, 1)} unit="dBm" definition="Achsenabschnitt des Modells: erwarteter RSSI-Wert in 1 m Abstand (globaler Fit über alle Beacons)." />
                    <StatTile label="Exponent n" value={fmt(m.pathLossExponent, 2)} definition="Pfadverlustexponent: wie stark der RSSI mit dem Zehnerlogarithmus der Distanz fällt. Gilt nur für diese Umgebung und dieses Gerät." hint="Literaturwerte streuen stark (grob 1,5–4) – nur Orientierung, keine Referenz." />
                    <StatTile label="R²" value={fmt(m.r2 ?? null, 3)} definition="Anteil der RSSI-Varianz, den das Modell erklärt. Hoher Wert bedeutet nicht, dass das Modell außerhalb der Messpunkte stimmt." />
                    <StatTile label="σ Residuen" value={fmt(m.residualStdDb ?? null, 2)} unit="dB" definition="Streuung der Messwerte um die Modellkurve (sqrt(SSE/(N−2)))." />
                    <StatTile label="Messpaare N" value={m.sampleCount ?? "–"} definition="Anzahl der (Distanz, RSSI)-Paare im Fit. Aufeinanderfolgende Samples sind nicht unabhängig; der effektive Stichprobenumfang ist kleiner." />
                  </section>
                  <div className="flex flex-wrap gap-2">
                    <Button data-testid="calibration-apply-campaign" onClick={() => void applyCampaignModel(m)}>
                      Als Kampagnenmodell übernehmen
                    </Button>
                  </div>
                </>
              )}
              <Card
                title="RSSI über Distanz"
                subtitle="Messpaare aus stationären Haltepunkten"
                actions={<Toggle checked={xLog} onChange={setXLog} label="x logarithmisch" />}
              >
                <ScatterChart
                  title="RSSI über Distanz mit Modellkurven"
                  synthetic={synthetic}
                  height={340}
                  xLabel="Distanz"
                  xUnit="m"
                  yLabel="RSSI"
                  yUnit="dBm"
                  xLog={xLog}
                  series={[{ id: "pairs", label: `Messpaare (${pairs.length})`, color: "#8a9ba6", points: decimate(pairs, MAX_POINTS).map((p) => ({ x: p.distanceM, y: p.rssi })) }]}
                  curves={curves}
                />
                {pairs.length > MAX_POINTS && <p className="mt-2 text-xs text-muted">Darstellung auf {MAX_POINTS} Punkte reduziert; der Fit nutzt alle {pairs.length}.</p>}
              </Card>
            </div>
          )}

          {state && (
            <Card title="Modell je Beacon" subtitle="Beacons mit zu wenigen Daten erhalten kein eigenes Modell." flush>
              <DataTable caption="Pfadverlustmodell je Beacon" columns={colsBeacon} rows={rows} rowKey={(r) => r.beacon.id} dense />
            </Card>
          )}

          <ManualModel
            campaign={campaign.pathLoss}
            a={manualA}
            n={manualN}
            setA={setManualA}
            setN={setManualN}
            valid={manualValid}
            onApply={() => manualValid && applyCampaignModel({ rssiAt1m: manualA, pathLossExponent: manualN, source: "manual" })}
            status={null}
          />
        </div>
      </div>
    </div>
  );
}

function ManualModel({
  a,
  n,
  setA,
  setN,
  valid,
  onApply,
  status,
}: {
  campaign: PathLossModel;
  a: number | null;
  n: number | null;
  setA: (v: number | null) => void;
  setN: (v: number | null) => void;
  valid: boolean;
  onApply: () => void;
  status: string | null;
}) {
  return (
    <Card title="Modell manuell eintragen" subtitle="z. B. aus Datenblatt oder früherer Messung – wird als „manuell – ungeprüft“ geführt.">
      <div className="grid grid-cols-2 gap-3 md:max-w-md">
        <Field label="A (RSSI bei 1 m)">
          <div data-testid="calibration-manual-a">
            <NumberInput value={a} onChange={setA} unit="dBm" min={-120} max={0} step={0.5} aria-label="A (RSSI bei 1 m)" />
          </div>
        </Field>
        <Field label="Exponent n" error={n !== null && n <= 0 ? "n muss > 0 sein" : undefined}>
          <div data-testid="calibration-manual-n">
            <NumberInput value={n} onChange={setN} min={0.5} max={8} step={0.1} aria-label="Exponent n" />
          </div>
        </Field>
      </div>
      <p className="mt-3 text-xs text-muted">Typische Werte für n im Innenraum liegen häufig im Bereich von etwa 1,5 bis 4 – das ist nur eine grobe Orientierung und ersetzt keine Messung.</p>
      <Button className="mt-3" variant="secondary" data-testid="calibration-apply-manual" disabled={!valid} onClick={onApply}>
        Manuelles Modell als Kampagnenmodell speichern
      </Button>
      {status && <p className="mt-2 text-sm">{status}</p>}
    </Card>
  );
}
