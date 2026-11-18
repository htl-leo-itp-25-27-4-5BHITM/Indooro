import { useMemo, useState } from "react";
import { campaignBundle, downloadText } from "../../data/export";
import { assessRunQuality } from "../../data/validate";
import { ALGORITHMS } from "../../positioning/algorithms";
import { Badge, Button, Callout, Card, DataTable, Field, OriginBadge, PageHeader, StatTile, TextInput, Textarea, type DataColumn } from "../components";
import { href } from "../router";
import { ROLE_LABEL, KIND_LABEL } from "../shared";
import { useCampaign } from "../state/LabContext";
import { fileSlug } from "./workflow/files";
import type { MeasurementRun } from "../../core/types";
import type { SavedEvaluation } from "../../data/store";

const STEPS: { n: number; title: string; text: string; page: "plan" | "data" | "calibration" | "positioning" | "compare" | "report" }[] = [
  { n: 1, title: "Grundriss & Maßstab", text: "Layout prüfen, Beacons kontrollieren, Maßstab vor Ort bestätigen.", page: "plan" },
  { n: 2, title: "Messdaten importieren", text: "Aufnahmen laden, Qualität prüfen, Rollen festlegen.", page: "data" },
  { n: 3, title: "Pfadverlust kalibrieren", text: "Modell nur aus Kalibrierungsläufen fitten.", page: "calibration" },
  { n: 4, title: "Positionierung auswerten", text: "Evaluationsläufe mit einem Verfahren berechnen.", page: "positioning" },
  { n: 5, title: "Verfahren vergleichen", text: "Mehrere Verfahren auf denselben Epochen.", page: "compare" },
  { n: 6, title: "Bericht erzeugen", text: "Ergebnisse auswählen, Interpretation ergänzen, exportieren.", page: "report" },
];

function fmt(v: number | null | undefined, digits = 2): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "–" : v.toFixed(digits);
}

export function OverviewPage() {
  const lab = useCampaign();
  const { campaign, runs, results } = lab;
  const [form, setForm] = useState({
    name: campaign.name,
    description: campaign.description,
    date: campaign.date,
    market: campaign.market,
    device: campaign.device,
    conditions: campaign.conditions,
    notes: campaign.notes,
  });
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: v }));
  };

  const quality = useMemo(() => new Map(runs.map((r) => [r.id, assessRunQuality(r, campaign)])), [runs, campaign]);
  const calRuns = runs.filter((r) => r.role === "calibration");
  const evalRuns = runs.filter((r) => r.role === "evaluation");
  const pl = campaign.pathLoss;
  const scale = campaign.floorPlan.scale;
  const hasSynthetic = campaign.floorPlan.origin === "synthetic" || runs.some((r) => r.origin === "synthetic");
  const origin = hasSynthetic ? "synthetic" : "real";
  const runsById = new Map(runs.map((r) => [r.id, r]));

  const runColumns: DataColumn<MeasurementRun>[] = [
    {
      key: "name",
      header: "Name",
      sortValue: (r) => r.name,
      render: (r) => (
        <a href={href(campaign.id, "data")} className="font-medium">
          {r.name}
        </a>
      ),
    },
    { key: "kind", header: "Art", sortValue: (r) => r.kind, render: (r) => KIND_LABEL[r.kind] },
    { key: "role", header: "Rolle", sortValue: (r) => r.role, render: (r) => ROLE_LABEL[r.role] },
    { key: "origin", header: "Herkunft", sortValue: (r) => r.origin, render: (r) => <OriginBadge origin={r.origin} /> },
    { key: "samples", header: "Samples", numeric: true, sortValue: (r) => r.samples.length, render: (r) => r.samples.length },
    { key: "refs", header: "Referenzen", numeric: true, sortValue: (r) => r.references.length, render: (r) => r.references.length },
    { key: "dur", header: "Dauer", numeric: true, sortValue: (r) => quality.get(r.id)?.durationSec ?? 0, render: (r) => `${fmt(quality.get(r.id)?.durationSec, 0)} s` },
    {
      key: "beacons",
      header: "Beacons gehört",
      numeric: true,
      sortValue: (r) => quality.get(r.id)?.perBeacon.length ?? 0,
      render: (r) => `${quality.get(r.id)?.perBeacon.length ?? 0} / ${campaign.beacons.length}`,
    },
    {
      key: "eval",
      header: "Auswertbar",
      sortValue: (r) => (quality.get(r.id)?.evaluable ? 1 : 0),
      render: (r) => {
        const q = quality.get(r.id);
        return q?.evaluable ? <Badge variant="success">ja</Badge> : <Badge variant="warning" title={q?.reasons.join(" ")}>nein</Badge>;
      },
    },
  ];

  const resultColumns: DataColumn<SavedEvaluation>[] = [
    { key: "label", header: "Bezeichnung", sortValue: (s) => s.label, render: (s) => <span className="font-medium">{s.label}</span> },
    { key: "run", header: "Messreihe", sortValue: (s) => s.result.runName, render: (s) => (runsById.get(s.result.runId) ? s.result.runName : `${s.result.runName} (gelöscht)`) },
    { key: "alg", header: "Algorithmus", sortValue: (s) => s.result.config.algorithm, render: (s) => ALGORITHMS[s.result.config.algorithm].name },
    { key: "hash", header: "Config-Hash", render: (s) => <code className="font-mono text-xs">{s.result.configHash}</code> },
    {
      key: "median",
      header: "Median",
      numeric: true,
      sortValue: (s) => s.result.metrics.median,
      render: (s) => `${fmt(s.result.metrics.median)} ${s.result.metrics.unit}`,
    },
    {
      key: "p95",
      header: "P95",
      numeric: true,
      sortValue: (s) => s.result.metrics.p95,
      render: (s) => `${fmt(s.result.metrics.p95)} ${s.result.metrics.unit}`,
    },
    {
      key: "del",
      header: "",
      render: (s) => (
        <Button size="sm" variant="ghost" onClick={() => void lab.deleteResult(s.id)} aria-label={`Ergebnis ${s.label} löschen`}>
          Löschen
        </Button>
      ),
    },
  ];

  const save = async () => {
    await lab.saveCampaign({ ...campaign, ...form, name: form.name.trim() || campaign.name });
    setSaved(true);
  };

  const exportBundle = () => {
    downloadText(`kampagne-${fileSlug(campaign.name)}${hasSynthetic ? "-synthetisch" : ""}.json`, JSON.stringify(campaignBundle(campaign, runs), null, 2), "application/json");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={campaign.name}
        breadcrumbs={["Kampagne", "Übersicht"]}
        origin={origin}
        description={[campaign.market, campaign.date, campaign.device].filter(Boolean).join(" · ")}
        actions={
          <Button onClick={exportBundle} data-testid="export-bundle">
            Kampagne exportieren (JSON-Bundle)
          </Button>
        }
      />

      <div className="space-y-3" data-testid="status-callouts">
        {!scale.confirmed && (
          <Callout
            tone="warning"
            title="Maßstab nicht bestätigt – Fehler werden in Layout-Einheiten (LE) angegeben"
            actions={<a href={href(campaign.id, "plan")}>Maßstab prüfen</a>}
          >
            Ohne vor Ort bestätigten Maßstab erscheinen keine Meterwerte.
          </Callout>
        )}
        {pl.source === "fitted" ? (
          <Callout tone="info" title="Pfadverlustmodell: kalibriert (gefittet)">
            A = {fmt(pl.rssiAt1m, 1)} dBm, n = {fmt(pl.pathLossExponent)}, R² = {fmt(pl.r2)}
            {pl.fittedOnRunIds ? `, ${pl.fittedOnRunIds.length} Kalibrierungslauf/-läufe` : ""}
            {pl.sampleCount ? `, ${pl.sampleCount} Samples` : ""}.
          </Callout>
        ) : (
          <Callout
            tone="warning"
            title={pl.source === "manual" ? "Pfadverlustmodell: manuell gesetzt, nicht verifiziert" : "Pfadverlustmodell: nicht kalibriert"}
            actions={<a href={href(campaign.id, "calibration")}>Zur Kalibrierung</a>}
          >
            Aktuell gelten A = {fmt(pl.rssiAt1m, 1)} dBm und n = {fmt(pl.pathLossExponent)} (Lab-Standard). Distanzbasierte Ergebnisse sind als unkalibriert zu kennzeichnen.
          </Callout>
        )}
        {runs.length > 0 && evalRuns.length === 0 && (
          <Callout tone="warning" title="Keine Evaluationsläufe vorhanden">
            Ohne Läufe mit der Rolle „Evaluation“ lassen sich keine Fehlermetriken berechnen.
          </Callout>
        )}
        {runs.length > 0 && calRuns.length === 0 && (
          <Callout tone="warning" title="Keine Kalibrierungsläufe vorhanden">
            Ohne Kalibrierungsläufe bleibt das Pfadverlustmodell unkalibriert, und Fingerprinting ist nicht möglich.
          </Callout>
        )}
        {runs.length === 0 && (
          <Callout tone="info" title="Noch keine Messreihen" actions={<a href={href(campaign.id, "data")}>Messdaten importieren</a>}>
            Importieren Sie Aufnahmen oder erzeugen Sie synthetische Testdaten.
          </Callout>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Messreihen" value={runs.length} />
        <StatTile label="Kalibrierung" value={calRuns.length} />
        <StatTile label="Evaluation" value={evalRuns.length} />
        <StatTile label="Gespeicherte Ergebnisse" value={results.length} />
      </div>

      <Card title="Vorgehen" subtitle="Reihenfolge gemäß Feldanleitung">
        <ol className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n}>
              <a href={href(campaign.id, s.page)} className="flex gap-3 rounded-lg border border-line p-3 no-underline hover:bg-page" data-testid={`step-${s.n}`}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">{s.n}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{s.title}</span>
                  <span className="block text-xs text-muted">{s.text}</span>
                </span>
              </a>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Messreihen" flush actions={<a href={href(campaign.id, "data")}>Zur Datenseite</a>}>
        <div data-testid="runs-table">
          <DataTable columns={runColumns} rows={runs} rowKey={(r) => r.id} caption="Messreihen der Kampagne" emptyMessage="Noch keine Messreihen." />
        </div>
      </Card>

      <Card title="Gespeicherte Ergebnisse" flush>
        <div data-testid="results-table">
          <DataTable columns={resultColumns} rows={results} rowKey={(s) => s.id} caption="Gespeicherte Auswertungen" emptyMessage="Noch keine gespeicherten Ergebnisse. Berechnen und speichern Sie sie auf der Seite „Positionierung“." />
        </div>
      </Card>

      <Card
        title="Metadaten"
        actions={
          <Button variant="primary" onClick={save} data-testid="meta-save">
            Speichern
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Name">
            <TextInput value={form.name} onChange={(e) => set("name")(e.target.value)} data-testid="meta-name" />
          </Field>
          <Field label="Datum der Messung">
            <TextInput type="date" value={form.date} onChange={(e) => set("date")(e.target.value)} />
          </Field>
          <Field label="Markt">
            <TextInput value={form.market} onChange={(e) => set("market")(e.target.value)} />
          </Field>
          <Field label="Messgerät">
            <TextInput value={form.device} onChange={(e) => set("device")(e.target.value)} />
          </Field>
          <Field label="Versuchsbedingungen" className="md:col-span-2">
            <TextInput value={form.conditions} onChange={(e) => set("conditions")(e.target.value)} />
          </Field>
          <Field label="Beschreibung" className="md:col-span-2">
            <Textarea rows={2} value={form.description} onChange={(e) => set("description")(e.target.value)} />
          </Field>
          <Field label="Notizen" className="md:col-span-2">
            <Textarea rows={3} value={form.notes} onChange={(e) => set("notes")(e.target.value)} />
          </Field>
        </div>
        {saved && (
          <p className="mt-3 text-sm text-accent" role="status">
            Gespeichert.
          </p>
        )}
      </Card>
    </div>
  );
}
