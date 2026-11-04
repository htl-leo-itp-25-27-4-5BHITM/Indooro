import { useEffect, useMemo, useState } from "react";
import type { Beacon, DataIssue, FloorPlan, MapScale } from "../../core/types";
import { floorPlanFromIndooroLayout } from "../../data/layout";
import { FloorPlanMap } from "../../map";
import { Badge, Button, Callout, Card, DataTable, Field, FileDrop, IssueList, Modal, NumberInput, PageHeader, SplitPane, Textarea, Toggle, type DataColumn } from "../components";
import { useCampaign } from "../state/LabContext";
import { readFileText } from "./workflow/files";
import { useNarrow } from "./workflow/useNarrow";

function outside(b: Beacon, plan: FloorPlan): boolean {
  return b.position.x < 0 || b.position.y < 0 || b.position.x > plan.width || b.position.y > plan.height;
}

export function PlanPage() {
  const { campaign, saveCampaign, runs } = useCampaign();
  const narrow = useNarrow();
  const plan = campaign.floorPlan;

  const [beacons, setBeacons] = useState<Beacon[]>(campaign.beacons);
  const [scale, setScale] = useState<MapScale>(plan.scale);
  const [selected, setSelected] = useState<string | undefined>();
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [scaleError, setScaleError] = useState<string | null>(null);

  const [pending, setPending] = useState<{ plan: FloorPlan; beacons: Beacon[] } | null>(null);
  const [importIssues, setImportIssues] = useState<DataIssue[]>([]);

  useEffect(() => {
    setBeacons(campaign.beacons);
    setScale(campaign.floorPlan.scale);
  }, [campaign.beacons, campaign.floorPlan.scale]);

  const dirty = useMemo(() => JSON.stringify(beacons) !== JSON.stringify(campaign.beacons), [beacons, campaign.beacons]);
  const scaleDirty = useMemo(() => JSON.stringify(scale) !== JSON.stringify(plan.scale), [scale, plan.scale]);
  const outsideBeacons = beacons.filter((b) => outside(b, plan));

  const patchBeacon = (id: string, patch: Partial<Beacon>) => setBeacons((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const saveBeacons = async () => {
    await saveCampaign({ ...campaign, beacons });
    setSaveMsg("Beacons gespeichert.");
  };

  const saveScale = async () => {
    if (scale.confirmed && scale.note.trim() === "") {
      setScaleError("Zum Bestätigen ist eine Notiz nötig: Wie wurde der Maßstab geprüft (z. B. „Regal 4: 10,0 m gemessen = 10 LE“)?");
      return;
    }
    if (!(scale.metersPerUnit > 0)) {
      setScaleError("Meter je Layout-Einheit muss größer als 0 sein.");
      return;
    }
    setScaleError(null);
    await saveCampaign({ ...campaign, floorPlan: { ...plan, scale } });
    setSaveMsg("Maßstab gespeichert.");
  };

  const onLayoutFile = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    try {
      const parsed = floorPlanFromIndooroLayout(JSON.parse(await readFileText(file)), file.name);
      setImportIssues(parsed.issues);
      setPending(parsed.issues.some((i) => i.severity === "error") ? null : { plan: parsed.plan, beacons: parsed.beacons });
    } catch (e) {
      setPending(null);
      setImportIssues([{ severity: "error", code: "layout-json", message: `Datei ist kein gültiges JSON: ${e instanceof Error ? e.message : String(e)}` }]);
    }
  };

  const applyImport = async () => {
    if (!pending) return;
    await saveCampaign({ ...campaign, floorPlan: pending.plan, beacons: pending.beacons });
    setPending(null);
    setImportIssues([]);
    setSaveMsg("Layout übernommen. Maßstab bitte neu prüfen.");
  };

  const columns: DataColumn<Beacon>[] = [
    { key: "id", header: "ID", sortValue: (b) => b.id, render: (b) => <code className="font-mono text-xs">{b.id}</code> },
    { key: "label", header: "Bezeichnung", render: (b) => b.label ?? "–" },
    {
      key: "x",
      header: "x (LE)",
      numeric: true,
      render: (b) => (
        <NumberInput className="w-24" value={b.position.x} step={0.1} aria-label={`x von ${b.id}`} onChange={(v) => v !== null && patchBeacon(b.id, { position: { ...b.position, x: v } })} />
      ),
    },
    {
      key: "y",
      header: "y (LE)",
      numeric: true,
      render: (b) => (
        <NumberInput className="w-24" value={b.position.y} step={0.1} aria-label={`y von ${b.id}`} onChange={(v) => v !== null && patchBeacon(b.id, { position: { ...b.position, y: v } })} />
      ),
    },
    {
      key: "enabled",
      header: "Aktiv",
      render: (b) => <Toggle checked={b.enabled} onChange={(enabled) => patchBeacon(b.id, { enabled })} label={<span className="sr-only">{`${b.id} aktiv`}</span>} />,
    },
    { key: "tx", header: "TX-Power", numeric: true, render: (b) => (b.txPowerDbm === undefined ? "–" : `${b.txPowerDbm} dBm`) },
    {
      key: "pl",
      header: "Pfadverlust",
      render: (b) =>
        b.pathLoss ? (
          <span title={`A ${b.pathLoss.rssiAt1m} dBm, n ${b.pathLoss.pathLossExponent}`}>
            {b.pathLoss.source === "fitted" ? "gefittet" : b.pathLoss.source === "manual" ? "manuell" : "Standard"} (A {b.pathLoss.rssiAt1m}, n {b.pathLoss.pathLossExponent})
          </span>
        ) : (
          "Kampagnenmodell"
        ),
    },
    { key: "warn", header: "", render: (b) => (outside(b, plan) ? <Badge variant="warning">außerhalb</Badge> : null) },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Grundriss & Beacons"
        breadcrumbs={["Kampagne", "Grundriss"]}
        origin={plan.origin}
        description={`${plan.name} · ${plan.width} × ${plan.height} LE · Quelle: ${plan.source}`}
      />

      {outsideBeacons.length > 0 && (
        <Callout tone="warning" title={`${outsideBeacons.length} Beacon(s) liegen außerhalb des Grundrisses`} >
          {outsideBeacons.map((b) => b.id).join(", ")} – Position oder Layout prüfen. Positionen außerhalb verfälschen jede Auswertung.
        </Callout>
      )}

      <div data-testid="plan-map">
        <FloorPlanMap
          plan={{ ...plan, scale }}
          beacons={beacons}
          availableLayers={["grid", "elements", "labels", "beacons"]}
          selectedId={selected}
          onSelect={(sel) => sel.kind === "beacon" && setSelected(sel.id)}
          height={narrow ? 360 : 560}
        />
      </div>
      {selected && (
        <p className="text-sm text-muted" data-testid="selected-beacon">
          Ausgewählt: <code className="font-mono">{selected}</code>
        </p>
      )}

      <SplitPane
        sideWidth={380}
        sidePosition="right"
        side={
          <>
            <Card title="Maßstab" subtitle="Physikalischer Maßstab des Layouts">
              <div className="space-y-3" data-testid="scale-card">
                {!scale.confirmed && (
                  <Callout tone="warning" title="Maßstab nicht bestätigt">
                    Solange er nicht bestätigt ist, zeigt das Lab Fehler nur in Layout-Einheiten (LE), nie in Metern.
                  </Callout>
                )}
                <Field label="Meter je Layout-Einheit" hint="Indooro-Konvention: 1 Zelle = 1 m – vor Ort prüfen.">
                  <NumberInput value={scale.metersPerUnit} min={0.01} step={0.05} unit="m/LE" onChange={(v) => v !== null && setScale((s) => ({ ...s, metersPerUnit: v }))} aria-label="Meter je Layout-Einheit" />
                </Field>
                <Field label="Notiz zur Prüfung" hint="Pflicht zum Bestätigen: eine bekannte Strecke vor Ort messen und mit dem Layout vergleichen.">
                  <Textarea rows={3} value={scale.note} onChange={(e) => setScale((s) => ({ ...s, note: e.target.value }))} data-testid="scale-note" />
                </Field>
                <Toggle
                  checked={scale.confirmed}
                  onChange={(confirmed) => setScale((s) => ({ ...s, confirmed }))}
                  label="Maßstab vor Ort bestätigt"
                  description={scale.note.trim() === "" ? "Ohne Notiz kann nicht gespeichert werden." : undefined}
                />
                {scaleError && (
                  <p role="alert" className="text-xs text-danger" data-testid="scale-error">
                    {scaleError}
                  </p>
                )}
                <Button variant="primary" onClick={saveScale} disabled={!scaleDirty} data-testid="scale-save">
                  Maßstab speichern
                </Button>
              </div>
            </Card>
            <Card title="Layout-JSON importieren" subtitle="Ersetzt Grundriss und Beacons. Messreihen bleiben erhalten.">
              <FileDrop accept=".json" multiple={false} onFiles={onLayoutFile}>
                Layout-JSON hierher ziehen
              </FileDrop>
              {importIssues.length > 0 && (
                <div className="mt-3">
                  <IssueList issues={importIssues} />
                </div>
              )}
            </Card>
          </>
        }
      >
        <Card
          title="Beacons"
          subtitle="Positionen in Layout-Einheiten (LE)"
          flush
          actions={
            <Button variant="primary" onClick={saveBeacons} disabled={!dirty} data-testid="beacons-save">
              Änderungen speichern
            </Button>
          }
        >
          <div data-testid="beacon-table">
            <DataTable columns={columns} rows={beacons} rowKey={(b) => b.id} caption="Beacons" dense onRowClick={(b) => setSelected(b.id)} />
          </div>
        </Card>
        {saveMsg && (
          <p role="status" className="text-sm text-accent">
            {saveMsg}
          </p>
        )}
      </SplitPane>

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Layout ersetzen?"
        footer={
          <>
            <Button onClick={() => setPending(null)}>Abbrechen</Button>
            <Button variant="danger" onClick={applyImport} data-testid="layout-confirm">
              Grundriss und Beacons ersetzen
            </Button>
          </>
        }
      >
        <p>
          Neuer Grundriss „{pending?.plan.name}“ ({pending?.plan.width} × {pending?.plan.height} LE, {pending?.beacons.length} Beacons) ersetzt den aktuellen. Die {runs.length} vorhandenen Messreihen bleiben unverändert, beziehen sich aber auf die alten Beacon-IDs. Der Maßstab ist danach wieder unbestätigt.
        </p>
        {importIssues.length > 0 && (
          <div className="mt-3">
            <IssueList issues={importIssues} />
          </div>
        )}
      </Modal>
    </div>
  );
}
