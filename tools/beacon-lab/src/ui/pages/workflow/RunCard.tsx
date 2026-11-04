import { useMemo, useState } from "react";
import type { MeasurementRun, RunKind, RunRole } from "../../../core/types";
import { downloadText, referencesToCsv, samplesToCsv } from "../../../data/export";
import { assessRunQuality } from "../../../data/validate";
import { Badge, Button, Callout, DataTable, Field, IssueList, Modal, OriginBadge, Select, TextInput, type DataColumn } from "../../components";
import { useCampaign } from "../../state/LabContext";
import { fileSlug } from "./files";

type BeaconRow = ReturnType<typeof assessRunQuality>["perBeacon"][number];

export function RunCard({ run, resultCount }: { run: MeasurementRun; resultCount: number }) {
  const { campaign, saveRun, deleteRun } = useCampaign();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(run.name);
  const [kind, setKind] = useState<RunKind>(run.kind);
  const [role, setRole] = useState<RunRole>(run.role);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const quality = useMemo(() => assessRunQuality(run, campaign), [run, campaign]);
  const dirty = name !== run.name || kind !== run.kind || role !== run.role;
  const p = run.provenance;

  const columns: DataColumn<BeaconRow>[] = [
    { key: "id", header: "Beacon", sortValue: (b) => b.beaconId, render: (b) => <code className="font-mono text-xs">{b.beaconId}</code> },
    { key: "count", header: "Samples", numeric: true, sortValue: (b) => b.count, render: (b) => b.count },
    { key: "rate", header: "Rate (Hz)", numeric: true, sortValue: (b) => b.rateHz, render: (b) => b.rateHz.toFixed(2) },
    { key: "gap", header: "Größte Lücke (s)", numeric: true, sortValue: (b) => b.maxGapSec, render: (b) => b.maxGapSec.toFixed(1) },
    { key: "known", header: "Bekannt", render: (b) => (b.known ? <Badge variant="success">ja</Badge> : <Badge variant="warning">unbekannt</Badge>) },
  ];

  return (
    <div className="rounded-xl border border-line bg-white" data-testid="run-card" data-run-id={run.id}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button type="button" className="min-w-0 flex-1 text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="run-toggle">
          <span className="block truncate text-sm font-semibold text-ink">{run.name}</span>
          <span className="block text-xs text-muted">
            {run.kind === "walk" ? "Gehversuch" : "stationär"} · {run.role === "calibration" ? "Kalibrierung" : "Evaluation"} · {run.samples.length} Samples · {run.references.length} Referenzen
          </span>
        </button>
        <OriginBadge origin={run.origin} />
        {quality.evaluable ? <Badge variant="success">auswertbar</Badge> : <Badge variant="warning">nicht auswertbar</Badge>}
        <Button size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? "Schließen" : "Details"}
        </Button>
      </div>

      {open && (
        <div className="space-y-5 border-t border-line px-4 py-4" data-testid="run-details">
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Datenqualität</h4>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
              <div>
                <dt className="text-xs text-muted">Dauer</dt>
                <dd className="tabular">{quality.durationSec.toFixed(1)} s</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Samples</dt>
                <dd className="tabular">{quality.sampleCount}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Referenzpunkte</dt>
                <dd className="tabular">{quality.referenceCount}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Auswertbar</dt>
                <dd>{quality.evaluable ? "ja" : "nein"}</dd>
              </div>
            </dl>
            {!quality.evaluable && (
              <Callout tone="warning" title="Keine belastbare Auswertung möglich">
                <ul className="list-disc pl-5">
                  {quality.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </Callout>
            )}
            <DataTable columns={columns} rows={quality.perBeacon} rowKey={(b) => b.beaconId} caption="Qualität je Beacon" dense emptyMessage="Keine Messwerte." />
            <IssueList issues={quality.issues} />
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Herkunft der Daten (Provenienz)</h4>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm md:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">Datei</dt>
                <dd className="break-all">{p.fileName}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Format / importiert</dt>
                <dd>
                  {p.format} · {p.importedAt}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs text-muted">SHA-256</dt>
                <dd className="break-all font-mono text-xs">{p.sha256}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Zeilen</dt>
                <dd className="tabular">
                  {p.totalRows} gesamt · {p.acceptedRows} akzeptiert · {p.rejectedRows} abgelehnt
                </dd>
              </div>
              {p.columnMapping && (
                <div>
                  <dt className="text-xs text-muted">Spaltenzuordnung</dt>
                  <dd className="text-xs">{Object.entries(p.columnMapping).map(([k, v]) => `${k} ← ${v}`).join(", ")}</dd>
                </div>
              )}
            </dl>
            <div>
              <h5 className="mb-1 text-xs font-semibold text-ink">Umwandlungen</h5>
              {p.transformations.length === 0 ? (
                <p className="text-sm text-muted">Keine.</p>
              ) : (
                <ul className="list-disc space-y-0.5 pl-5 text-sm">
                  {p.transformations.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              )}
            </div>
            {p.issues.length > 0 && <IssueList issues={p.issues} />}
          </section>

          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Bearbeiten</h4>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="Name">
                <TextInput value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Art">
                <Select value={kind} onChange={(e) => setKind(e.target.value as RunKind)}>
                  <option value="stationary">stationär</option>
                  <option value="walk">Gehversuch</option>
                </Select>
              </Field>
              <Field label="Rolle">
                <Select value={role} onChange={(e) => setRole(e.target.value as RunRole)} data-testid="run-role">
                  <option value="evaluation">Evaluation</option>
                  <option value="calibration">Kalibrierung</option>
                </Select>
              </Field>
            </div>
            {role !== run.role && (
              <Callout tone="warning" title="Rollenwechsel">
                Bereits gespeicherte Ergebnisse{resultCount > 0 ? ` (${resultCount} zu dieser Messreihe)` : ""} bleiben so, wie sie berechnet wurden. Ein Pfadverlustmodell, das aus dieser Messreihe gefittet wurde, wird nicht automatisch zurückgenommen.
              </Callout>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                disabled={!dirty || name.trim() === ""}
                data-testid="run-save"
                onClick={() => saveRun({ ...run, name: name.trim(), kind, role })}
              >
                Änderungen speichern
              </Button>
              <Button onClick={() => downloadText(`${fileSlug(run.name)}-samples.csv`, samplesToCsv(run), "text/csv")}>Samples als CSV</Button>
              <Button onClick={() => downloadText(`${fileSlug(run.name)}-referenzen.csv`, referencesToCsv(run), "text/csv")} disabled={run.references.length === 0}>
                Referenzen als CSV
              </Button>
              <Button variant="danger" onClick={() => setConfirmDelete(true)} data-testid="run-delete">
                Löschen
              </Button>
            </div>
          </section>
        </div>
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Messreihe löschen?"
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>Abbrechen</Button>
            <Button
              variant="danger"
              data-testid="run-delete-confirm"
              onClick={async () => {
                await deleteRun(run.id);
                setConfirmDelete(false);
              }}
            >
              Endgültig löschen
            </Button>
          </>
        }
      >
        „{run.name}“ wird entfernt{resultCount > 0 ? `, ebenso ${resultCount} dazu gespeicherte(s) Ergebnis(se)` : ""}. Ein Kampagnen-Export enthält die Messreihe weiterhin, falls Sie vorher exportiert haben.
      </Modal>
    </div>
  );
}
