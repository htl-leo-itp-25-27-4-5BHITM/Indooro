import { useState } from "react";
import { DEFAULT_PATH_LOSS, defaultScale } from "../../core/defaults";
import { newId } from "../../core/ids";
import type { Beacon, Campaign, DataIssue, FloorPlan } from "../../core/types";
import { demoFloorPlan, floorPlanFromIndooroLayout } from "../../data/layout";
import { parseCampaignBundle } from "../../data/export";
import { Button, Callout, Card, EmptyState, Field, FileDrop, IssueList, Modal, OriginBadge, PageHeader, Select, TextInput, Textarea } from "../components";
import { href, navigate } from "../router";
import { useLab } from "../state/LabContext";
import { readFileText, todayIso } from "./workflow/files";

type PlanSource = "demo" | "layout";

function NewCampaignModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const lab = useLab();
  const [form, setForm] = useState({ name: "", description: "", date: todayIso(), market: "", device: "", conditions: "", notes: "" });
  const [source, setSource] = useState<PlanSource>("demo");
  const [layout, setLayout] = useState<{ plan: FloorPlan; beacons: Beacon[]; fileName: string } | null>(null);
  const [issues, setIssues] = useState<DataIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onLayoutFile = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    try {
      const parsed = floorPlanFromIndooroLayout(JSON.parse(await readFileText(file)), file.name);
      setIssues(parsed.issues);
      setLayout(parsed.issues.some((i) => i.severity === "error") ? null : { plan: parsed.plan, beacons: parsed.beacons, fileName: file.name });
    } catch (e) {
      setLayout(null);
      setIssues([{ severity: "error", code: "layout-json", message: `Datei ist kein gültiges JSON: ${e instanceof Error ? e.message : String(e)}` }]);
    }
  };

  const nameOk = form.name.trim().length > 0;
  const planOk = source === "demo" || layout !== null;

  const save = async () => {
    setBusy(true);
    try {
      const base = source === "demo" ? demoFloorPlan() : layout!;
      const now = new Date().toISOString();
      const campaign: Campaign = {
        id: newId("camp"),
        name: form.name.trim(),
        description: form.description,
        date: form.date,
        market: form.market,
        device: form.device,
        conditions: form.conditions,
        notes: form.notes,
        floorPlan: { ...base.plan, scale: base.plan.scale ?? defaultScale() },
        beacons: base.beacons,
        pathLoss: { ...DEFAULT_PATH_LOSS },
        createdAt: now,
        updatedAt: now,
      };
      await lab.saveCampaign(campaign);
      onClose();
      navigate(campaign.id, "overview");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Neue Messkampagne"
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" disabled={!nameOk || !planOk} loading={busy} onClick={save} data-testid="campaign-save">
            Kampagne anlegen
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name *">
          <TextInput value={form.name} onChange={(e) => set("name")(e.target.value)} data-testid="campaign-name" placeholder="z. B. Pilotmarkt Mai" />
        </Field>
        <Field label="Beschreibung">
          <Textarea rows={2} value={form.description} onChange={(e) => set("description")(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Datum der Messung">
            <TextInput type="date" value={form.date} onChange={(e) => set("date")(e.target.value)} />
          </Field>
          <Field label="Markt">
            <TextInput value={form.market} onChange={(e) => set("market")(e.target.value)} />
          </Field>
          <Field label="Messgerät" hint="Modell und iOS-Version">
            <TextInput value={form.device} onChange={(e) => set("device")(e.target.value)} />
          </Field>
          <Field label="Versuchsbedingungen" hint="Uhrzeit, Kundenaufkommen, Umbauten">
            <TextInput value={form.conditions} onChange={(e) => set("conditions")(e.target.value)} />
          </Field>
        </div>
        <Field label="Notizen">
          <Textarea rows={2} value={form.notes} onChange={(e) => set("notes")(e.target.value)} />
        </Field>
        <Field label="Grundriss">
          <Select value={source} onChange={(e) => setSource(e.target.value as PlanSource)} data-testid="campaign-plan-source">
            <option value="demo">Fiktiver Demo-Markt (synthetisch)</option>
            <option value="layout">Indooro-Layout-JSON importieren</option>
          </Select>
        </Field>
        {source === "layout" && (
          <div className="space-y-2">
            <FileDrop accept=".json" multiple={false} onFiles={onLayoutFile}>
              Layout-JSON hierher ziehen
            </FileDrop>
            {layout && (
              <Callout tone="info" title={`Layout gelesen: ${layout.plan.name}`}>
                {layout.plan.width} × {layout.plan.height} LE, {layout.plan.elements.length} Elemente, {layout.beacons.length} Beacons.
              </Callout>
            )}
            {issues.length > 0 && <IssueList issues={issues} />}
          </div>
        )}
        {source === "demo" && (
          <Callout tone="synthetic" title="Synthetischer Grundriss">
            Der Demo-Markt ist fiktiv. Er eignet sich zum Ausprobieren, nicht für Messungen im Feld.
          </Callout>
        )}
      </div>
    </Modal>
  );
}

export function CampaignListPage() {
  const lab = useLab();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Campaign | null>(null);
  const [importIssues, setImportIssues] = useState<DataIssue[]>([]);
  const [busy, setBusy] = useState(false);

  const loadDemo = async () => {
    setBusy(true);
    try {
      const id = await lab.loadDemoCampaign();
      navigate(id, "overview");
    } finally {
      setBusy(false);
    }
  };

  const importBundle = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    const { bundle, issues } = parseCampaignBundle(await readFileText(file));
    setImportIssues(issues);
    if (bundle) {
      await lab.importCampaign(bundle.campaign, bundle.runs);
      navigate(bundle.campaign.id, "overview");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Messkampagnen"
        description="Eine Kampagne bündelt Grundriss, Beacons, Messreihen und Auswertungen eines Messtags."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setCreating(true)} data-testid="new-campaign">
              Neue Messkampagne
            </Button>
            <Button onClick={loadDemo} loading={busy} data-testid="load-demo">
              Demo-Kampagne laden (synthetisch)
            </Button>
          </div>
        }
      />

      {lab.campaigns.length === 0 ? (
        <EmptyState
          title="Noch keine Messkampagne"
          description="Das Positioning Lab wertet RSSI-Messungen von BLE-Beacons aus und vergleicht Positionierungsverfahren – nachvollziehbar und ohne stille Korrekturen. Alle Daten bleiben lokal in diesem Browser (IndexedDB); es gibt keine Verbindung zu einem Server."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="campaign-list">
          {lab.campaigns.map((c) => (
            <li key={c.id}>
              <Card
                title={
                  <a href={href(c.id)} className="text-ink hover:underline" data-testid="campaign-link">
                    {c.name}
                  </a>
                }
                subtitle={c.date}
                actions={c.floorPlan.origin === "synthetic" ? <OriginBadge origin="synthetic" /> : undefined}
              >
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted">Markt</dt>
                  <dd className="min-w-0 truncate">{c.market || "–"}</dd>
                  <dt className="text-muted">Gerät</dt>
                  <dd className="min-w-0 truncate">{c.device || "–"}</dd>
                  <dt className="text-muted">Beacons</dt>
                  <dd>{c.beacons.length}</dd>
                </dl>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="primary" onClick={() => navigate(c.id, "overview")}>
                    Öffnen
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(c)} aria-label={`Kampagne ${c.name} löschen`}>
                    Löschen
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card title="Kampagne importieren" subtitle="JSON-Bundle, das mit „Kampagne exportieren“ erzeugt wurde.">
        <FileDrop accept=".json" multiple={false} onFiles={importBundle}>
          Kampagnen-Bundle hierher ziehen
        </FileDrop>
        {importIssues.length > 0 && (
          <div className="mt-3">
            <IssueList issues={importIssues} />
          </div>
        )}
      </Card>

      <p className="text-xs text-muted">Datenschutz: Alle Kampagnen, Messreihen und Ergebnisse liegen ausschließlich in der IndexedDB dieses Browsers. Es werden keine Daten übertragen.</p>

      {creating && <NewCampaignModal open onClose={() => setCreating(false)} />}
      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Kampagne löschen?"
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>Abbrechen</Button>
            <Button
              variant="danger"
              data-testid="confirm-delete-campaign"
              onClick={async () => {
                if (deleting) await lab.deleteCampaign(deleting.id);
                setDeleting(null);
              }}
            >
              Endgültig löschen
            </Button>
          </>
        }
      >
        „{deleting?.name}“ wird mit allen Messreihen und gespeicherten Ergebnissen aus diesem Browser entfernt. Das lässt sich nicht rückgängig machen. Exportieren Sie die Kampagne vorher als JSON-Bundle, wenn Sie sie behalten wollen.
      </Modal>
    </div>
  );
}
