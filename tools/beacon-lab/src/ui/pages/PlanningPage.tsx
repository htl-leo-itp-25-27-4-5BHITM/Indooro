import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import type { AlgorithmId, Beacon } from "../../core/types";
import { downloadText } from "../../data/export";
import { FloorPlanMap, roundTo, screenToLayout, type MapSelection } from "../../map";
import { ALGORITHMS } from "../../positioning/algorithms";
import {
  applyEdits,
  beaconsToCsv,
  compareResults,
  defaultSimInput,
  makePlannedBeacon,
  simulateAsync,
  suggestBeacon,
  type Objective,
  type SimInput,
  type SimResult,
  type Suggestion,
} from "../../planning";
import { Badge, Button, Callout, Card, Field, Modal, NumberInput, PageHeader, Select, StatTile, Toolbar } from "../components";
import { useCampaign } from "../state/LabContext";
import { fileSlug } from "./workflow/files";
import { PrognosisLayer, PrognosisLegend, type PrognosisCell } from "./planning/PrognosisLayer";
import { QUANTITIES, fmtNum, quantityById, toDisplay, type QuantityId } from "./planning/quantities";

type View = "A" | "B" | "delta";
type Mode = "select" | "add" | "move";
/** kNN-Fingerprinting braucht Kalibrierlauf-Fingerprints, die es vor der Installation nicht gibt. */
const SIM_ALGORITHMS = (Object.keys(ALGORITHMS) as AlgorithmId[]).filter((id) => id !== "knn-fingerprint");
const THRESHOLDS = [2, 3, 5];
const BANNER = "MODELLPROGNOSE – keine Messung";

interface Computed {
  a: SimResult;
  b: SimResult;
  snapshot: string;
}

function Num({ label, value, onChange, unit, min, max, step, info, testid }: { label: string; value: number; onChange: (v: number) => void; unit?: string; min?: number; max?: number; step?: number; info?: string; testid?: string }) {
  return (
    <Field label={label} info={info}>
      <NumberInput value={value} onChange={(v) => v !== null && onChange(v)} unit={unit} min={min} max={max} step={step} aria-label={label} {...(testid ? { "data-testid": testid } : {})} />
    </Field>
  );
}

export function PlanningPage() {
  const { campaign, saveCampaign } = useCampaign();
  const plan = campaign.floorPlan;
  const [bBeacons, setBBeacons] = useState<Beacon[]>(() => applyEdits(campaign.beacons, []));
  const [input, setInput] = useState<SimInput>(() => defaultSimInput(plan, campaign.beacons, campaign.pathLoss));
  const [view, setView] = useState<View>("A");
  const [quantity, setQuantity] = useState<QuantityId>("median");
  const [mode, setMode] = useState<Mode>("select");
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [computed, setComputed] = useState<Computed | null>(null);
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [highlightWorst, setHighlightWorst] = useState(false);
  const [objectiveKind, setObjectiveKind] = useState<"share" | "worst10">("share");
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [suggesting, setSuggesting] = useState<{ done: number; total: number } | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const cancel = useRef({ cancelled: false });
  const downPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => () => void (cancel.current.cancelled = true), []);

  const baseBeacons = campaign.beacons;
  const calibrated = campaign.pathLoss.source === "fitted";
  const setModel = (patch: Partial<SimInput["model"]>) => setInput((s) => ({ ...s, model: { ...s.model, ...patch } }));
  const setSettings = (patch: Partial<SimInput["settings"]>) => setInput((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  const setAlgParams = (patch: Partial<SimInput["algorithmParams"]>) => setInput((s) => ({ ...s, algorithmParams: { ...s.algorithmParams, ...patch } }));

  const snapshot = JSON.stringify([input.model, input.settings, input.algorithm, input.algorithmParams, baseBeacons, bBeacons]);
  const stale = computed !== null && computed.snapshot !== snapshot;
  const dirty = JSON.stringify(baseBeacons) !== JSON.stringify(bBeacons);

  const unitLabel = plan.scale.confirmed ? "m" : "LE";
  const displayToLE = (v: number) => (plan.scale.confirmed ? v / plan.scale.metersPerUnit : v);

  /** B bearbeiten: verwirft Vorschläge (sie gelten nur für den Stand, für den sie berechnet wurden). */
  const editB = (fn: (b: Beacon[]) => Beacon[]) => {
    setBBeacons(fn);
    setSuggestions(null);
    setPreviewId(null);
  };

  const run = async () => {
    cancel.current.cancelled = true;
    const token = { cancelled: false };
    cancel.current = token;
    const snap = snapshot;
    setRunning({ done: 0, total: 1 });
    setNotice(null);
    const a = await simulateAsync({ ...input, beacons: baseBeacons }, { signal: token, onProgress: (done, total) => setRunning({ done, total }) });
    if (!a) return;
    const b = dirty ? await simulateAsync({ ...input, beacons: bBeacons }, { signal: token }) : a;
    if (!b) return;
    setComputed({ a, b, snapshot: snap });
    setRunning(null);
  };

  const comparison = useMemo(() => (computed ? compareResults(computed.a, computed.b, THRESHOLDS.map((t) => t)) : null), [computed]);
  const shown = computed ? (view === "A" ? computed.a : computed.b) : null;
  const q = quantityById(quantity);

  /* ---- Heatmap-Zellen ---- */
  const layerData = useMemo(() => {
    if (!computed || !shown) return null;
    const size = shown.displayCellSize;
    const cs = shown.input.settings.cellSize;
    const worst = new Set((view === "A" ? comparison?.summaryA : comparison?.summaryB)?.worst10.map((c) => `${c.ix}|${c.iy}`) ?? []);
    if (view === "delta" && comparison) {
      const maxAbs = Math.max(0.1, ...comparison.cells.map((c) => Math.abs(toDisplay(quantityById("median"), c.delta, shown) ?? 0)));
      const cells: PrognosisCell[] = comparison.cells.map((c) => {
        const d = toDisplay(quantityById("median"), c.delta, shown);
        const status = c.status === "gained" ? "B liefert hier erstmals eine Schätzung" : c.status === "lost" ? "B verliert hier die Schätzung" : c.status === "none" ? "in A und B keine Schätzung" : undefined;
        return {
          id: `${c.ix}|${c.iy}`,
          x: c.ix * cs,
          y: c.iy * cs,
          size,
          value: d === null ? null : d + maxAbs, // 0..2*maxAbs, Mitte = keine Änderung
          color: c.status === "gained" ? "#1f9d8f" : c.status === "lost" ? "#b42318" : undefined,
          title: "Δ Medianfehler (B − A)",
          lines: [
            d === null ? (status ?? "–") : `${d > 0 ? "+" : ""}${fmtNum(d)} ${shown.unit} (${d < 0 ? "B besser" : d > 0 ? "B schlechter" : "gleich"})`,
            `A: ${fmtNum(toDisplay(quantityById("median"), c.a.medianError, shown))} · B: ${fmtNum(toDisplay(quantityById("median"), c.b.medianError, shown))} ${shown.unit}`,
            `Zelle ${c.x.toFixed(1)} / ${c.y.toFixed(1)} LE`,
          ],
        };
      });
      return { cells, domain: [0, 2 * maxAbs] as [number, number], maxAbs, worst };
    }
    const vals = shown.cells.map((c) => toDisplay(q, q.value(c), shown));
    const finite = vals.filter((v): v is number => v !== null);
    const domain: [number, number] = q.fixedDomain ?? [0, Math.max(0.1, ...finite)];
    if (q.id === "audible") domain[0] = 0;
    const cells: PrognosisCell[] = shown.cells.map((c, i) => ({
      id: `${c.ix}|${c.iy}`,
      x: c.ix * cs,
      y: c.iy * cs,
      size,
      value: vals[i],
      title: `${q.label} (Prognose)`,
      lines: [
        vals[i] === null ? "keine Schätzung möglich" : `${fmtNum(vals[i], q.digits)} ${q.unitLabel(shown)}`,
        `Median ${fmtNum(toDisplay(quantityById("median"), c.medianError, shown))} · P90 ${fmtNum(toDisplay(quantityById("p90"), c.p90Error, shown))} ${shown.unit}`,
        `Ausfall ${fmtNum(c.failureRate * 100, 0)} % · hörbar Ø ${fmtNum(c.meanAudible, 1)} · HDOP ${fmtNum(c.hdop)}`,
        `Zelle ${c.x.toFixed(1)} / ${c.y.toFixed(1)} LE`,
      ],
    }));
    return { cells, domain, maxAbs: 0, worst };
  }, [computed, shown, view, comparison, q]);

  /* ---- Karteninteraktion ---- */
  const onPointerDownCapture = (e: PointerEvent<HTMLDivElement>) => {
    downPos.current = { x: e.clientX, y: e.clientY };
  };
  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    if (mode === "select") return;
    const target = e.target as Element;
    if (target.closest("[data-beacon-id]")) return; // Beacon wählen
    const svg = target.closest("svg[data-testid='floorplan-svg']") as SVGSVGElement | null;
    if (!svg) return;
    const d = downPos.current;
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return; // Pan, kein Klick
    const ctm = svg.getScreenCTM?.();
    if (!ctm) return;
    const p = screenToLayout({ x: e.clientX, y: e.clientY }, ctm);
    if (!p) return;
    const pos = { x: Math.min(plan.width, Math.max(0, roundTo(p.x, 0.5))), y: Math.min(plan.height, Math.max(0, roundTo(p.y, 0.5))) };
    e.stopPropagation();
    if (view === "A") setView("B");
    if (mode === "add") {
      const nb = makePlannedBeacon(bBeacons, pos);
      editB((b) => applyEdits(b, [{ kind: "add", beacon: nb }]));
      setSelectedId(nb.id);
    } else if (mode === "move" && selectedId) {
      editB((b) => applyEdits(b, [{ kind: "move", id: selectedId, position: pos }]));
    }
  };
  const onSelect = (sel: MapSelection) => {
    if (sel.kind === "beacon") {
      setSelectedId(sel.id);
    }
  };

  const selected = bBeacons.find((b) => b.id === selectedId);
  const mapBeacons = view === "A" ? baseBeacons : bBeacons;

  /* ---- Vorschlag ---- */
  const objective: Objective = objectiveKind === "share" ? { kind: "share-within", thresholdLE: displayToLE(3) } : { kind: "worst10" };
  const suggest = async () => {
    const token = { cancelled: false };
    cancel.current = token;
    setSuggesting({ done: 0, total: 1 });
    const res = await suggestBeacon({ ...input, beacons: bBeacons }, { objective, topN: 5, signal: token, onProgress: (done, total) => setSuggesting({ done, total }) });
    setSuggesting(null);
    if (res) setSuggestions(res);
  };
  const preview = (s: Suggestion) => {
    const nb = makePlannedBeacon(
      bBeacons.filter((b) => b.id !== previewId),
      s.position,
    );
    setBBeacons((b) => applyEdits(b.filter((x) => x.id !== previewId), [{ kind: "add", beacon: nb }]));
    setPreviewId(nb.id);
    setSelectedId(nb.id);
    setView("B");
  };
  const fmtImprovement = (s: Suggestion) =>
    objectiveKind === "share"
      ? `+${fmtNum(s.improvement * 100, 1)} Prozentpunkte (Anteil ≤ 3 ${unitLabel})`
      : `${fmtNum(plan.scale.confirmed ? s.improvement * plan.scale.metersPerUnit : s.improvement)} ${unitLabel} geringerer Fehler in den schlechtesten 10 %`;

  /* ---- Export / Übernehmen ---- */
  const exportCsv = () => downloadText(`${fileSlug(campaign.name)}-variante-b-beacons.csv`, beaconsToCsv(bBeacons), "text/csv");
  const applyToCampaign = async () => {
    await saveCampaign({ ...campaign, beacons: bBeacons.map((b) => ({ ...b, position: { ...b.position } })) });
    setApplyOpen(false);
    setNotice("Beacon-Liste in die Kampagne übernommen. Die Prognose ist veraltet – bitte neu simulieren.");
    setSuggestions(null);
    setPreviewId(null);
  };
  const changedLabel = useMemo(() => {
    const ids = new Set(baseBeacons.map((b) => b.id));
    const added = bBeacons.filter((b) => !ids.has(b.id)).length;
    const bIds = new Set(bBeacons.map((b) => b.id));
    const removed = baseBeacons.filter((b) => !bIds.has(b.id)).length;
    return `${added} neu, ${removed} entfernt, ${bBeacons.length} gesamt`;
  }, [baseBeacons, bBeacons]);

  /* ---- Zusammenfassung ---- */
  const sum = comparison ? (view === "A" ? comparison.summaryA : comparison.summaryB) : null;
  const ref = comparison && view !== "A" && dirty ? comparison.summaryA : null;
  const pctDelta = (a: number, b: number) => `${b - a >= 0 ? "+" : ""}${fmtNum((b - a) * 100, 1)} Pp. gegenüber A`;
  const worstCentroid = sum && sum.worst10.length ? { x: sum.worst10.reduce((s, c) => s + c.x, 0) / sum.worst10.length, y: sum.worst10.reduce((s, c) => s + c.y, 0) / sum.worst10.length } : null;

  const qDomainLegend = layerData?.domain ?? [0, 1];

  return (
    <div className="space-y-5" data-testid="planning-page">
      <PageHeader
        title="Platzierung (Simulation)"
        breadcrumbs={["Visualisierung", "Platzierung"]}
        description="Vorab prognostizieren, wo die Positionierung bei einer Beacon-Anordnung schwach wird, und Varianten vergleichen. Reines Rechenmodell – es werden weder Messdaten verwendet noch gespeichert."
      />

      <div role="status" data-testid="planning-banner" className="rounded-lg border-2 border-synthetic bg-orange-50 px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-synthetic">
        {BANNER}
        <span className="ml-2 text-xs font-normal normal-case tracking-normal text-ink">
          Alle Werte stammen aus einem vereinfachten Signalmodell, nicht aus Messungen, und werden nie als Messlauf oder Ergebnis gespeichert.
        </span>
      </div>

      {!calibrated && (
        <Callout tone="warning" title="Unkalibriertes Pfadverlustmodell">
          Die Kampagne hat kein angepasstes Modell ({campaign.pathLoss.source === "manual" ? "manuell eingetragen" : "Lab-Standard"}: A = {campaign.pathLoss.rssiAt1m} dBm, n = {campaign.pathLoss.pathLossExponent}). Die Prognose ist
          entsprechend unsicher; Werte hier sind Annahmen, keine Kalibrierung.
        </Callout>
      )}
      {!plan.scale.confirmed && (
        <Callout tone="warning" title="Maßstab nicht bestätigt">
          Alle Abstände und Fehler werden in Layout-Einheiten (LE) angegeben, nicht in Metern.
        </Callout>
      )}
      {notice && <Callout tone="info">{notice}</Callout>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Toolbar label="Ansicht und Bearbeitung">
            <Select aria-label="Variante" value={view} onChange={(e) => setView(e.target.value as View)} data-testid="planning-view" className="w-auto">
              <option value="A">Variante A – Kampagne (Bestand)</option>
              <option value="B">Variante B – bearbeitet</option>
              <option value="delta">Δ Medianfehler (B − A)</option>
            </Select>
            {view !== "delta" && (
              <Select aria-label="Größe" value={quantity} onChange={(e) => setQuantity(e.target.value as QuantityId)} data-testid="planning-quantity" className="w-auto">
                {QUANTITIES.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </Select>
            )}
            <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
            <Button size="sm" variant={mode === "select" ? "primary" : "secondary"} onClick={() => setMode("select")} data-testid="planning-mode-select">
              Auswählen
            </Button>
            <Button size="sm" variant={mode === "add" ? "primary" : "secondary"} onClick={() => setMode("add")} data-testid="planning-mode-add">
              Beacon setzen
            </Button>
            <Button size="sm" variant={mode === "move" ? "primary" : "secondary"} onClick={() => setMode("move")} disabled={!selected} data-testid="planning-mode-move">
              Verschieben
            </Button>
            <label className="ml-2 flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={highlightWorst} onChange={(e) => setHighlightWorst(e.target.checked)} />
              schlechteste 10 % markieren
            </label>
          </Toolbar>
          <p className="text-xs text-muted">
            {mode === "add" && "Klick auf den Plan setzt einen geplanten Beacon in Variante B (Raster 0,5 LE)."}
            {mode === "move" && (selected ? `Klick auf den Plan verschiebt ${selected.id}.` : "Erst einen Beacon wählen.")}
            {mode === "select" && "Beacon anklicken zum Auswählen. Bearbeitet wird immer Variante B; Variante A bleibt der Stand der Kampagne."}
          </p>

          <div onPointerDownCapture={onPointerDownCapture} onClickCapture={onClickCapture} data-testid="planning-map" data-view={view}>
            <FloorPlanMap
              plan={plan}
              beacons={mapBeacons}
              availableLayers={["grid", "elements", "labels", "beacons", "heatmap"]}
              selectedId={selectedId}
              onSelect={onSelect}
              underlay={
                layerData && (
                  <PrognosisLayer
                    cells={layerData.cells}
                    domain={layerData.domain}
                    ramp={view === "delta" ? "error" : q.ramp}
                  />
                )
              }
              overlays={
                highlightWorst && layerData ? (
                  <g pointerEvents="none" data-testid="planning-worst">
                    {layerData.cells
                      .filter((c) => layerData.worst.has(c.id))
                      .map((c) => (
                        <rect key={`w${c.x}|${c.y}`} x={c.x} y={c.y} width={c.size} height={c.size} fill="none" stroke="#102a3b" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                      ))}
                  </g>
                ) : undefined
              }
              legend={
                layerData && shown ? (
                  view === "delta" ? (
                    <PrognosisLegend
                      title="Δ Medianfehler B − A"
                      unit={unitLabel}
                      domain={[-layerData.maxAbs, layerData.maxAbs]}
                      ramp="error"
                      digits={2}
                      note="Grün/Teal = B besser (kleinerer Fehler), Rot = B schlechter. Volle Farbe grün: nur B hat eine Schätzung; volles Rot: B verliert sie."
                    />
                  ) : (
                    <PrognosisLegend
                      title={`${q.label} – Variante ${view}`}
                      unit={q.unitLabel(shown)}
                      domain={qDomainLegend}
                      ramp={q.ramp}
                      digits={q.digits}
                      note={q.note}
                      extra={`Raster ${shown.displayCellSize} LE · ${shown.cells.length} von ${shown.walkableCellCount} begehbaren Zellen simuliert · K = ${shown.input.settings.samplesPerCell} · Seed ${shown.input.settings.seed}`}
                    />
                  )
                ) : (
                  <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs text-muted">Noch keine Prognose. „Simulieren“ klicken.</div>
                )
              }
            />
          </div>

          {stale && (
            <Callout tone="warning" title="Prognose veraltet">
              Modell, Verfahren oder Beacon-Liste wurden seit der letzten Simulation geändert. Angezeigt wird noch der alte Stand.
            </Callout>
          )}

          <div data-testid="planning-summary" className="space-y-3">
            {sum && shown ? (
              <>
                <h2 className="text-sm font-semibold text-ink">
                  Zusammenfassung Variante {view === "A" ? "A" : "B"} <Badge variant="synthetic">Prognose</Badge>
                </h2>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {sum.within.map((w, i) => (
                    <StatTile
                      key={w.threshold}
                      label={`Zellen mit Median ≤ ${w.threshold} ${unitLabel}`}
                      value={fmtNum(w.share * 100, 1)}
                      unit="%"
                      hint={ref ? pctDelta(ref.within[i].share, w.share) : undefined}
                      definition="Anteil der simulierten begehbaren Zellen, deren Medianfehler höchstens so groß ist. Zellen ohne Schätzung zählen als nicht erfüllt."
                    />
                  ))}
                  <StatTile label="Ø hörbare Beacons" value={fmtNum(sum.meanAudible, 1)} hint={ref && ref.meanAudible !== null && sum.meanAudible !== null ? `${sum.meanAudible - ref.meanAudible >= 0 ? "+" : ""}${fmtNum(sum.meanAudible - ref.meanAudible, 1)} gegenüber A` : undefined} />
                  <StatTile
                    label="Zellen mit < 3 Beacons"
                    value={sum.cellsUnder3}
                    hint={`${fmtNum((sum.shareUnder3 ?? 0) * 100, 1)} % der Zellen${ref ? ` · A: ${ref.cellsUnder3}` : ""}`}
                    tone={sum.cellsUnder3 > 0 ? "warning" : "default"}
                    definition="Im Mittel weniger als 3 hörbare Beacons: Trilateration ist dort nicht möglich."
                  />
                  <StatTile label="Median der Zellmediane" value={fmtNum(sum.medianOfMedians)} unit={sum.unit} />
                  <StatTile
                    label="Schlechteste 10 %"
                    value={fmtNum(sum.worst10MeanError)}
                    unit={sum.unit}
                    hint={`${sum.worst10.length} Zellen${worstCentroid ? ` · Schwerpunkt x ${worstCentroid.x.toFixed(1)} · y ${worstCentroid.y.toFixed(1)} LE` : ""}`}
                    tone="warning"
                    definition="Mittlerer Medianfehler der 10 % schlechtesten Zellen; Zellen ohne Schätzung gehen mit der Plandiagonale ein."
                  />
                </div>
                {view === "delta" && comparison && (
                  <p className="text-sm text-muted" data-testid="planning-delta-text">
                    B gegenüber A: {comparison.improved} Zellen besser, {comparison.worsened} schlechter; mittlere Änderung des Medianfehlers {comparison.meanDelta === null ? "–" : `${fmtNum(plan.scale.confirmed ? comparison.meanDelta * plan.scale.metersPerUnit : comparison.meanDelta)} ${unitLabel}`}.
                  </p>
                )}
                {shown.warnings.length > 0 && (
                  <ul className="list-disc pl-5 text-xs text-muted">
                    {shown.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted">Rechenzeit {Math.round(shown.elapsedMs)} ms · {BANNER}.</p>
              </>
            ) : (
              <Callout tone="info">Noch keine Prognose berechnet. Modellparameter prüfen und „Simulieren“ klicken.</Callout>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <Card title="Simulation">
            <div className="space-y-3">
              <Button variant="primary" onClick={() => void run()} loading={running !== null} data-testid="planning-simulate" className="w-full">
                {running ? `Simuliere … ${Math.round((running.done / running.total) * 100)} %` : "Simulieren"}
              </Button>
              <p className="text-xs text-muted">Variante A = Beacons der Kampagne, Variante B = bearbeitete Kopie. Gleicher Seed: Unterschiede kommen nur vom Layout.</p>
            </div>
          </Card>

          <Card title="Beacons (Variante B)" subtitle={changedLabel}>
            <div className="space-y-3">
              {selected ? (
                <div className="space-y-2" data-testid="planning-selected">
                  <p className="text-sm font-medium">
                    {selected.id} {selected.label === "geplant" && <Badge variant="synthetic">geplant</Badge>} {!selected.enabled && <Badge variant="warning">deaktiviert</Badge>}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Num label="x" unit="LE" value={selected.position.x} step={0.5} min={0} max={plan.width} testid="planning-beacon-x" onChange={(v) => editB((b) => applyEdits(b, [{ kind: "move", id: selected.id, position: { x: v, y: selected.position.y } }]))} />
                    <Num label="y" unit="LE" value={selected.position.y} step={0.5} min={0} max={plan.height} testid="planning-beacon-y" onChange={(v) => editB((b) => applyEdits(b, [{ kind: "move", id: selected.id, position: { x: selected.position.x, y: v } }]))} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => editB((b) => applyEdits(b, [{ kind: "toggle", id: selected.id }]))} data-testid="planning-toggle">
                      {selected.enabled ? "Deaktivieren" : "Aktivieren"}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        editB((b) => applyEdits(b, [{ kind: "remove", id: selected.id }]));
                        setSelectedId(undefined);
                        setMode("select");
                      }}
                      data-testid="planning-remove"
                    >
                      Entfernen
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted">Keinen Beacon gewählt. Auf einen Marker klicken oder „Beacon setzen“ nutzen.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    editB(() => applyEdits(baseBeacons, []));
                    setSelectedId(undefined);
                  }}
                  disabled={!dirty}
                  data-testid="planning-reset"
                >
                  B zurücksetzen
                </Button>
                <Button size="sm" onClick={exportCsv} data-testid="planning-export">
                  Variante als Beacon-Liste exportieren
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setApplyOpen(true)} disabled={!dirty} data-testid="planning-apply">
                  In Kampagne übernehmen …
                </Button>
              </div>
            </div>
          </Card>

          <Card title="Vorschlag (Heuristik)" subtitle="Ein zusätzlicher Beacon – nur ein Hinweis, nie automatisch übernommen.">
            <div className="space-y-3">
              <Field label="Ziel">
                <Select value={objectiveKind} onChange={(e) => setObjectiveKind(e.target.value as "share" | "worst10")} data-testid="planning-objective">
                  <option value="share">Anteil Zellen mit Median ≤ 3 {unitLabel} maximieren</option>
                  <option value="worst10">Fehler in den schlechtesten 10 % senken</option>
                </Select>
              </Field>
              <Button onClick={() => void suggest()} loading={suggesting !== null} data-testid="planning-suggest" className="w-full">
                {suggesting ? `Suche … ${Math.round((suggesting.done / suggesting.total) * 100)} %` : "Vorschlag berechnen"}
              </Button>
              {suggestions && (
                <ol className="space-y-1.5" data-testid="planning-suggestions">
                  {suggestions.length === 0 && <li className="text-xs text-muted">Keine Kandidatenposition gefunden.</li>}
                  {suggestions.map((s, i) => (
                    <li key={`${s.position.x}|${s.position.y}`}>
                      <button
                        type="button"
                        onClick={() => preview(s)}
                        data-testid={`planning-suggestion-${i}`}
                        className="w-full rounded-lg border border-line px-3 py-2 text-left text-xs hover:bg-page focus-visible:outline-2 focus-visible:outline-teal"
                      >
                        <span className="font-semibold text-ink">
                          {i + 1}. x {s.position.x.toFixed(1)} · y {s.position.y.toFixed(1)} LE
                        </span>
                        <br />
                        <span className="text-muted">
                          {fmtImprovement(s)} · {s.improvedCells} Zellen besser
                        </span>
                      </button>
                    </li>
                  ))}
                  <li className="text-xs text-muted">Klick auf einen Eintrag zeigt ihn als Vorschau in Variante B. Gieriger Einzelschritt mit reduzierter Simulation (K = 12, Raster ×2), kein Optimum.</li>
                </ol>
              )}
            </div>
          </Card>

          <Card title="Modell">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Num label="A (RSSI @ 1 m)" unit="dBm" value={input.model.rssiAt1m} min={-100} max={-30} step={1} onChange={(v) => setModel({ rssiAt1m: v })} info="Signalstärke in 1 m Abstand (Pfadverlustmodell)." />
                <Num label="n (Exponent)" value={input.model.pathLossExponent} min={1} max={6} step={0.1} onChange={(v) => setModel({ pathLossExponent: v })} />
                <Num label="σ Schattierung" unit="dB" value={input.model.shadowingStdDb} min={0} max={20} step={0.5} onChange={(v) => setModel({ shadowingStdDb: v })} info="Streuung des Signals je Epoche und Beacon." />
                <Num label="Empfindlichkeit" unit="dBm" value={input.model.sensitivityDbm} min={-120} max={-40} step={1} onChange={(v) => setModel({ sensitivityDbm: v })} info="Schwächere Signale werden nicht empfangen." />
                <Num label="Hindernis-Dämpfung" unit="dB" value={input.model.obstaclePenaltyDb} min={0} max={30} step={1} onChange={(v) => setModel({ obstaclePenaltyDb: v })} info="Vereinfachung: konstante Dämpfung je durchquertem Regal/Wand auf der Sichtlinie. 0 = aus." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Num label="K (Epochen/Zelle)" value={input.settings.samplesPerCell} min={1} max={200} step={1} onChange={(v) => setSettings({ samplesPerCell: Math.round(v) })} />
                <Num label="Stride" value={input.settings.stride} min={1} max={10} step={1} onChange={(v) => setSettings({ stride: Math.round(v) })} info="Nur jede n-te Zelle in x und y simulieren (schneller, gröber)." />
                <Num label="Seed" value={input.settings.seed} min={0} max={4294967295} step={1} onChange={(v) => setSettings({ seed: Math.round(v) })} />
                <Num label="Rasterweite" unit="LE" value={input.settings.cellSize} min={0.5} max={5} step={0.5} onChange={(v) => setSettings({ cellSize: v })} />
              </div>
              <Field label="Verfahren" hint={ALGORITHMS[input.algorithm].description}>
                <Select value={input.algorithm} onChange={(e) => setInput((s) => ({ ...s, algorithm: e.target.value as AlgorithmId }))} data-testid="planning-algorithm">
                  {SIM_ALGORITHMS.map((id) => (
                    <option key={id} value={id}>
                      {ALGORITHMS[id].name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Num label="RSSI-Schwelle" unit="dBm" value={input.algorithmParams.rssiThreshold} min={-120} max={0} onChange={(v) => setAlgParams({ rssiThreshold: v })} />
                <Num label="Top-K Beacons" value={input.algorithmParams.topK} min={0} max={50} onChange={(v) => setAlgParams({ topK: Math.round(v) })} info="0 = alle." />
                <Num label="Min. Beacons" value={input.algorithmParams.minBeacons} min={1} max={20} onChange={(v) => setAlgParams({ minBeacons: Math.round(v) })} />
                {input.algorithm === "weighted-centroid" && <Num label="Gewichtsexponent g" value={input.algorithmParams.weightExponent} min={0} max={5} step={0.1} onChange={(v) => setAlgParams({ weightExponent: v })} />}
                {input.algorithm === "trilateration" && <Num label="Huber δ" unit="m" value={input.algorithmParams.huberDeltaM} min={0} max={10} step={0.05} onChange={(v) => setAlgParams({ huberDeltaM: v })} />}
              </div>
              <p className="text-xs text-muted">Kein RSSI- und kein Zeitfilter: jede Epoche wird einzeln geschätzt. kNN-Fingerprinting entfällt (braucht Kalibrierläufe).</p>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        title="Variante B in die Kampagne übernehmen?"
        footer={
          <>
            <Button onClick={() => setApplyOpen(false)} data-testid="planning-apply-cancel">
              Abbrechen
            </Button>
            <Button variant="danger" onClick={() => void applyToCampaign()} data-testid="planning-apply-confirm">
              Beacon-Liste überschreiben
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <p>
            Die Beacon-Liste der Kampagne „{campaign.name}“ wird durch Variante B ersetzt ({changedLabel}).
          </p>
          <p className="font-semibold">
            Vorhandene Messläufe, Kalibrierung und gespeicherte Ergebnisse beziehen sich auf die alte Anordnung und bleiben unverändert. Sie passen danach nicht mehr zur Beacon-Liste.
          </p>
          <p>Geplante Beacons tragen Platzhalter-IDs (PLAN-…); vor echten Messungen müssen sie den Beacon-IDs der installierten Geräte zugeordnet werden. Die Prognose selbst wird nicht gespeichert.</p>
        </div>
      </Modal>
    </div>
  );
}
