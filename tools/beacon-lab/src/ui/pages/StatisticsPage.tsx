import { useMemo, useState } from "react";
import { DEFAULT_EVALUATION_OPTIONS, DEFAULT_POSITIONING_CONFIG } from "../../core/defaults";
import type { EvaluationOptions, PositioningConfig } from "../../core/types";
import { downloadText } from "../../data/export";
import { aggregateRuns, type Aggregation } from "../../positioning/aggregate";
import { MIN_BLOCKS_FOR_CI, type MetricsWithCI } from "../../positioning/uncertainty";
import { Button, Callout, Card, EmptyState, Field, NumberInput, PageHeader, Select, Spinner, TextInput } from "../components";
import { ConfigEditor, defaultOptionsFor, describeConfig, runLabel } from "../shared";
import { useCampaign } from "../state/LabContext";
import { fmt } from "./analysis/format";
import { cloneConfig } from "./analysis/presets";
import { aggregationToCsv, aggregationToJson } from "./statistics/export";
import { ForestPlot, type ForestRow } from "./statistics/ForestPlot";
import { CI_LEGEND, fmtBootstrap, fmtProportion, type CellText } from "./statistics/format";

interface Computed {
  agg: Aggregation;
  generatedAt: string;
  condition: string;
}

const Cell = ({ c }: { c: CellText }) => <span title={c.title}>{c.text}</span>;

function MetricCells({ m }: { m: MetricsWithCI }) {
  const u = m.unit;
  return (
    <>
      <td className="tabular px-3 py-2 text-right">{m.metrics.epochsWithTruth}</td>
      <td className="tabular px-3 py-2 text-right">
        <Cell c={fmtProportion(m.failureRate)} />
      </td>
      <td className="tabular px-3 py-2 text-right">
        <Cell c={fmtBootstrap(m.mean, u)} />
      </td>
      <td className="tabular px-3 py-2 text-right">
        <Cell c={fmtBootstrap(m.median, u)} />
      </td>
      <td className="tabular px-3 py-2 text-right">
        <Cell c={fmtBootstrap(m.p90, u)} />
      </td>
      <td className="tabular px-3 py-2 text-right">
        <Cell c={fmtBootstrap(m.p95, u)} />
      </td>
      <td className="tabular px-3 py-2 text-right">
        <Cell c={fmtProportion(m.within2)} />
      </td>
      <td className="tabular px-3 py-2 text-right">
        <Cell c={fmtProportion(m.within3)} />
      </td>
      <td className="tabular px-3 py-2 text-right">
        <Cell c={fmtProportion(m.within5)} />
      </td>
    </>
  );
}

export function StatisticsPage() {
  const { campaign, runs } = useCampaign();
  const evalRuns = useMemo(() => runs.filter((r) => r.role === "evaluation"), [runs]);
  const calRuns = useMemo(() => runs.filter((r) => r.role === "calibration"), [runs]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(evalRuns.map((r) => r.id)));
  const [config, setConfig] = useState<PositioningConfig>(() => cloneConfig(DEFAULT_POSITIONING_CONFIG));
  const [options, setOptions] = useState<EvaluationOptions>(DEFAULT_EVALUATION_OPTIONS);
  const [condition, setCondition] = useState("");
  const [seed, setSeed] = useState<number>(20260101);
  const [iterations, setIterations] = useState(2000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [computed, setComputed] = useState<Computed | null>(null);

  const chosen = evalRuns.filter((r) => selected.has(r.id));
  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setComputed(null);
  };

  const compute = () => {
    if (chosen.length === 0) return;
    setBusy(true);
    setError(null);
    // let the spinner paint before the synchronous computation
    setTimeout(() => {
      try {
        const needsFp = config.algorithm === "knn-fingerprint";
        const agg = aggregateRuns(chosen, campaign, config, (run) => defaultOptionsFor(run, options), needsFp ? calRuns : [], {
          seed: seed ?? 20260101,
          iterations,
        });
        setComputed({ agg, generatedAt: new Date().toISOString(), condition });
      } catch (e) {
        setComputed(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    }, 20);
  };

  if (evalRuns.length === 0) {
    return (
      <>
        <PageHeader title="Statistik und Mehrlauf-Auswertung" breadcrumbs={[campaign.name, "Analyse"]} />
        <EmptyState
          title="Keine Auswertungsläufe"
          description="Die Mehrlauf-Auswertung läuft nur auf Läufen mit der Rolle „Auswertung“. Kalibrierungsläufe sind ausgeschlossen, um Datenlecks zu verhindern."
        />
      </>
    );
  }

  const agg = computed?.agg ?? null;
  const unit = agg?.unit ?? (campaign.floorPlan.scale.confirmed ? "m" : "LE");
  const pooled = agg ? (agg.primary === "run" ? agg.pooledRunLevel : agg.pooledBlockLevel) : null;
  const stamp = (computed?.generatedAt ?? "").slice(0, 19).replace(/[:T]/g, "-");
  const meta = computed ? { campaignName: campaign.name, condition: computed.condition, generatedAt: computed.generatedAt } : null;
  const walkRuns = agg?.perRun.filter((r) => r.trackError) ?? [];

  const forest: ForestRow[] = agg
    ? [
        ...agg.perRun.map((r) => ({ label: r.run.name, estimate: r.uncertainty.median.estimate, lo: r.uncertainty.median.lo, hi: r.uncertainty.median.hi })),
        { label: "Gepoolt", estimate: pooled!.median.estimate, lo: pooled!.median.lo, hi: pooled!.median.hi, emphasized: true },
      ]
    : [];

  return (
    <div className="space-y-6" data-testid="statistics-page">
      <PageHeader
        title="Statistik und Mehrlauf-Auswertung"
        breadcrumbs={[campaign.name, "Analyse"]}
        origin={chosen.some((r) => r.origin === "synthetic") ? "synthetic" : undefined}
        description="Mehrere Läufe mit derselben Konfiguration auswerten: Kennzahlen je Lauf und gepoolt, jeweils mit Konfidenzintervall. Intervalle beschreiben nur die statistische Unsicherheit dieser Messungen."
      />

      <Card title="Auswertungsläufe" subtitle={`${chosen.length} von ${evalRuns.length} gewählt · Referenzzuordnung je Lauftyp automatisch (stationär: Standzeit/nächster Punkt, Gehversuch: Interpolation)`}>
        <ul className="grid gap-2 sm:grid-cols-2" data-testid="statistics-run-list">
          {evalRuns.map((r) => (
            <li key={r.id}>
              <label className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                <input type="checkbox" className="mt-1" checked={selected.has(r.id)} onChange={() => toggle(r.id)} data-testid={`statistics-run-${r.id}`} />
                <span>{runLabel(r)}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label="Bedingung" hint="Nur Läufe unter gleicher Bedingung poolen (Standort, Gerät, Tageszeit, Personendichte). Wird in den Export übernommen.">
            <TextInput id="stat-condition" value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="z. B. Markt A, iPhone 15, vormittags" />
          </Field>
          <Field label="Seed" hint="Startwert des Zufallsgenerators: gleicher Seed = gleiche Intervalle.">
            <NumberInput id="stat-seed" value={seed} onChange={(v) => setSeed(v ?? 20260101)} min={0} step={1} aria-label="Seed" />
          </Field>
          <Field label="Bootstrap-Wiederholungen">
            <Select id="stat-iterations" value={iterations} onChange={(e) => setIterations(Number(e.target.value))}>
              {[500, 2000, 5000].map((n) => (
                <option key={n} value={n}>
                  {n.toLocaleString("de-DE")}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card title="Konfiguration" subtitle={describeConfig(config)}>
        <ConfigEditor config={config} onChange={(c) => { setConfig(c); setComputed(null); }} options={options} onOptionsChange={(o) => { setOptions(o); setComputed(null); }} idPrefix="stat" compact />
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={compute} disabled={chosen.length === 0 || busy} data-testid="statistics-compute">
          Auswerten
        </Button>
        {busy && <Spinner label="Berechne Intervalle …" />}
        {chosen.length === 0 && <span className="text-sm text-muted">Mindestens einen Lauf wählen.</span>}
      </div>

      {error && (
        <Callout tone="danger" title="Auswertung nicht möglich">
          {error}
        </Callout>
      )}

      {agg && pooled && meta && (
        <>
          {agg.synthetic && (
            <Callout tone="synthetic" title="Synthetische Daten">
              Die Intervalle beschreiben nur die Simulation (angenommene Störungen, fiktiver Raum), nicht reale Hardware oder reale Räume.
            </Callout>
          )}
          {agg.exploratory && (
            <Callout tone="warning" title="Explorativ">
              Ergebnis nur explorativ: {agg.exploratoryReasons.join("; ")}. Intervalle sind unter diesen Bedingungen kaum belastbar.
            </Callout>
          )}
          {agg.unit === "LE" ? (
            <Callout tone="warning" title="Einheit: Layout-Einheiten (LE)">
              Der Maßstab ist nicht bestätigt: Alle Fehler und die Schwellen ≤ 2/3/5 sind in LE, nicht in Metern.
            </Callout>
          ) : null}
          <Callout tone="info" title="Methode der Intervalle">
            <p>
              Mittel, Median, P90, P95: <strong>Block-Bootstrap</strong> ({agg.iterations.toLocaleString("de-DE")} Wiederholungen, Seed {agg.seed}, {Math.round(agg.level * 100)} %-Perzentilintervall). Es werden ganze Blöcke
              gezogen, nicht einzelne Epochen, weil aufeinanderfolgende Epochen autokorreliert sind. Trefferquoten (≤ 2/3/5 {unit}) und Ausfallrate: <strong>Wilson-Intervall</strong> (Fehlschläge zählen als „nicht
              innerhalb“).
            </p>
            <p className="mt-1" data-testid="statistics-block-definition">
              Blockdefinition: stationär = ein Halt, Gehversuch = {agg.blockSec}-s-Segment (Zeilen je Lauf). Gepoolte Zeile:{" "}
              {agg.primary === "run"
                ? `${pooled.blocks} Läufe als Blöcke (zwischen den Läufen).`
                : `${pooled.blocks} Zeitblöcke innerhalb der Läufe – bei weniger als ${MIN_BLOCKS_FOR_CI} Läufen sind Läufe als Blöcke nicht möglich; das Intervall erfasst dann nur die Streuung innerhalb der Läufe, nicht zwischen den Läufen.`}
            </p>
            <p className="mt-1">Überlappende Intervalle belegen keine Gleichheit; nicht überlappende sind kein formaler Test.</p>
          </Callout>

          <Card
            title="Kennzahlen je Lauf und gepoolt"
            subtitle={`Einheit ${unit} · configHash ${agg.configHash}${computed?.condition ? ` · Bedingung: ${computed.condition}` : ""}`}
            actions={
              <>
                <Button size="sm" variant="secondary" data-testid="statistics-export-json" onClick={() => downloadText(`mehrlauf-${stamp}.json`, aggregationToJson(agg, meta), "application/json")}>
                  JSON
                </Button>
                <Button size="sm" variant="secondary" data-testid="statistics-export-csv" onClick={() => downloadText(`mehrlauf-${stamp}.csv`, aggregationToCsv(agg), "text/csv")}>
                  CSV
                </Button>
              </>
            }
            flush
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="statistics-table">
                <caption className="sr-only">Positionsfehler je Lauf und gepoolt mit Konfidenzintervallen</caption>
                <thead>
                  <tr className="border-b border-line bg-page text-xs font-semibold text-muted">
                    {["Lauf", "Epochen mit Ref.", "Ausfallrate", `Mittel (${unit})`, `Median (${unit})`, `P90 (${unit})`, `P95 (${unit})`, `≤ 2 ${unit}`, `≤ 3 ${unit}`, `≤ 5 ${unit}`].map((h, i) => (
                      <th key={h} scope="col" className={`px-3 py-2 ${i === 0 ? "text-left" : "text-right"}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agg.perRun.map((r) => (
                    <tr key={r.run.id} className="border-b border-line" data-testid={`statistics-row-${r.run.id}`}>
                      <th scope="row" className="px-3 py-2 text-left font-normal">
                        {r.run.name}
                        <span className="block text-xs text-muted">
                          {r.run.kind === "walk" ? "Gehversuch" : "stationär"} · {r.uncertainty.blocks} Blöcke
                        </span>
                      </th>
                      <MetricCells m={r.uncertainty} />
                    </tr>
                  ))}
                  <tr className="bg-page font-semibold" data-testid="statistics-pooled-row">
                    <th scope="row" className="px-3 py-2 text-left">
                      Gepoolt ({agg.perRun.length} {agg.perRun.length === 1 ? "Lauf" : "Läufe"})
                      <span className="block text-xs font-normal text-muted">{pooled.blocks} Blöcke · {agg.primary === "run" ? "Läufe als Blöcke" : "Zeitblöcke"}</span>
                    </th>
                    <MetricCells m={pooled} />
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="px-5 py-3 text-xs text-muted">{CI_LEGEND}</p>
          </Card>

          <Card title="Streuung zwischen den Läufen" subtitle="Mediane der einzelnen Läufe (Punkt: Median, Balken: Intervall, Raute: gepoolt)">
            <ForestPlot rows={forest} unit={unit} title="Median je Lauf und gepoolt" />
            <p className="mt-2 text-sm text-muted" data-testid="statistics-spread">
              {agg.spread.runs} Läufe · Mediane von {fmt(agg.spread.min)} bis {fmt(agg.spread.max)} {unit}
              {agg.spread.stdOfMedians !== null ? ` · Standardabweichung der Mediane ${fmt(agg.spread.stdOfMedians)} ${unit}` : ""}.
            </p>
          </Card>

          {walkRuns.length > 0 && (
            <Card title="Längs- und Querfehler (Gehversuche)" subtitle="Zerlegung des Fehlers entlang und quer zur lokalen Gehrichtung der (interpolierten) Referenz" flush>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="statistics-track-table">
                  <caption className="sr-only">Längs- und Querfehler je Gehversuch</caption>
                  <thead>
                    <tr className="border-b border-line bg-page text-xs font-semibold text-muted">
                      {["Lauf", "Epochen", "übersprungen (Stillstand)", `Längs Mittel (${unit})`, `Längs Median |·| (${unit})`, `Längs P95 |·| (${unit})`, `Quer Mittel (${unit})`, `Quer Median |·| (${unit})`, `Quer P95 |·| (${unit})`].map((h, i) => (
                        <th key={h} scope="col" className={`px-3 py-2 ${i === 0 ? "text-left" : "text-right"}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {walkRuns.map((r) => {
                      const t = r.trackError!;
                      return (
                        <tr key={r.run.id} className="border-b border-line">
                          <th scope="row" className="px-3 py-2 text-left font-normal">
                            {r.run.name}
                          </th>
                          {[t.n, t.skippedStationary, fmt(t.along.mean), fmt(t.along.medianAbs), fmt(t.along.p95Abs), fmt(t.cross.mean), fmt(t.cross.medianAbs), fmt(t.cross.p95Abs)].map((v, i) => (
                            <td key={i} className="tabular px-3 py-2 text-right">
                              {v}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="px-5 py-3 text-xs text-muted">
                Längs: positiv = Schätzung vor der Referenz, negativ = hinterher (Verzögerung). Quer: positiv = rechts der Gehrichtung. Die Referenz ist interpoliert (konstante Geschwindigkeit angenommen) und selbst unsicher.
              </p>
            </Card>
          )}

          {agg.warnings.length > 0 && (
            <Callout tone="warning" title="Hinweise der Auswertung">
              <ul className="list-disc pl-5">
                {agg.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Callout>
          )}
        </>
      )}
    </div>
  );
}
