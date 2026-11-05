import { useState } from "react";
import type { DataOrigin, RunKind, RunRole } from "../../../core/types";
import { prepareImport, REQUIRED_FIELDS, runImport, type ColumnMapping, type ImportDraft, type ImportOutcome, type TargetField, type TimeFormatOption } from "../../../data/import";
import { Badge, Button, Callout, Card, Field, FileDrop, IssueList, OriginBadge, Select, Spinner, TextInput } from "../../components";
import { useCampaign } from "../../state/LabContext";
import { readFileText } from "./files";
import { buildRunFromOutcome, guessOrigin, stripExtension } from "./importRun";

const FIELD_LABEL: Record<TargetField, string> = {
  t: "Zeit",
  beaconId: "Beacon-ID",
  rssi: "RSSI (dBm)",
  deviceId: "Geräte-ID",
  refX: "Referenz x",
  refY: "Referenz y",
  refLabel: "Referenz-Marker",
  runName: "Lauf-Name",
  kind: "Lauf-Art",
};
const FIELD_ORDER: TargetField[] = ["t", "beaconId", "rssi", "refX", "refY", "refLabel", "deviceId", "runName", "kind"];
const FORMAT_LABEL = { csv: "CSV", json: "JSON", "indooro-jsonl": "Indooro-Aufnahme (JSONL)", synthetic: "Synthetisch" } as const;

interface Loaded {
  fileName: string;
  text: string;
  draft: ImportDraft;
}

export function ImportWizard() {
  const { campaign, saveRun } = useCampaign();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [timeFormat, setTimeFormat] = useState<TimeFormatOption>("auto");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<RunKind>("stationary");
  const [role, setRole] = useState<RunRole>("evaluation");
  const [origin, setOrigin] = useState<DataOrigin>("real");
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  const reset = () => {
    setLoaded(null);
    setOutcome(null);
    setDone(null);
    setReadError(null);
  };

  const onFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    reset();
    try {
      const text = await readFileText(file);
      const draft = prepareImport(file.name, text);
      setLoaded({ fileName: file.name, text, draft });
      setMapping(draft.mapping);
      setName(stripExtension(file.name));
      setOrigin(guessOrigin(file.name));
      setKind("stationary");
      if (draft.error) setReadError(draft.error);
    } catch (e) {
      setReadError(e instanceof Error ? e.message : String(e));
    }
  };

  const mappingNeeded = loaded !== null && loaded.draft.format !== "indooro-jsonl";
  const missing = mappingNeeded ? REQUIRED_FIELDS.filter((f) => !mapping[f]) : [];

  const check = async () => {
    if (!loaded) return;
    setBusy(true);
    setDone(null);
    try {
      const o = await runImport({
        fileName: loaded.fileName,
        text: loaded.text,
        mapping: mappingNeeded ? mapping : undefined,
        knownBeaconIds: campaign.beacons.map((b) => b.id),
        timeFormat,
      });
      setOutcome(o);
      if (o.suggested?.runName) setName(o.suggested.runName);
      if (o.suggested?.kind) setKind(o.suggested.kind);
      if (o.suggested?.role) setRole(o.suggested.role);
      if (o.suggested?.origin) setOrigin(guessOrigin(loaded.fileName, o.suggested.origin));
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    if (!outcome?.ok) return;
    const run = buildRunFromOutcome(outcome, { campaignId: campaign.id, name, kind, role, origin });
    await saveRun(run);
    reset();
    setDone(run.name);
  };

  const setMap = (f: TargetField, v: string) => {
    setOutcome(null);
    setMapping((m) => {
      const next = { ...m };
      if (v) next[f] = v;
      else delete next[f];
      return next;
    });
  };

  return (
    <Card title="Messreihe importieren" subtitle="CSV, JSON oder Indooro-Aufnahme (.jsonl). Rohdaten werden nie stillschweigend verändert." >
      <div className="space-y-4" data-testid="import-wizard">
        <FileDrop accept=".csv,.json,.jsonl" multiple={false} onFiles={onFiles}>
          Messdatei hierher ziehen
        </FileDrop>
        {done && (
          <Callout tone="info" title="Messreihe übernommen" >
            „{done}“ wurde gespeichert.
          </Callout>
        )}
        {readError && <Callout tone="danger" title="Datei nicht lesbar">{readError}</Callout>}

        {loaded && !loaded.draft.error && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{loaded.fileName}</span>
              <Badge variant="neutral" >
                <span data-testid="detected-format">{FORMAT_LABEL[loaded.draft.format]}</span>
              </Badge>
            </div>

            {mappingNeeded && (
              <>
                <div className="overflow-auto rounded-lg border border-line" data-testid="import-preview">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr>
                        {loaded.draft.header.map((h) => (
                          <th key={h} className="border-b border-line bg-page px-2 py-1.5 text-left font-semibold text-muted">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loaded.draft.previewRows.map((r, i) => (
                        <tr key={i} className="border-b border-line last:border-b-0">
                          {r.map((c, j) => (
                            <td key={j} className="tabular whitespace-nowrap px-2 py-1">
                              {c}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Spaltenzuordnung</h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {FIELD_ORDER.map((f) => (
                      <Field key={f} label={`${FIELD_LABEL[f]}${REQUIRED_FIELDS.includes(f) ? " *" : ""}`}>
                        <Select value={mapping[f] ?? ""} onChange={(e) => setMap(f, e.target.value)} data-testid={`map-${f}`}>
                          <option value="">– nicht zugeordnet –</option>
                          {loaded.draft.header.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    ))}
                  </div>
                  {missing.length > 0 && (
                    <p role="alert" className="mt-2 text-xs text-danger">
                      Pflichtfelder fehlen: {missing.map((f) => FIELD_LABEL[f]).join(", ")}.
                    </p>
                  )}
                </div>
                <Field label="Zeitformat">
                  <Select value={timeFormat} onChange={(e) => { setOutcome(null); setTimeFormat(e.target.value as TimeFormatOption); }} data-testid="time-format">
                    <option value="auto">automatisch erkennen</option>
                    <option value="epoch-s">Unix-Sekunden</option>
                    <option value="epoch-ms">Unix-Millisekunden</option>
                    <option value="iso">ISO 8601</option>
                  </Select>
                </Field>
              </>
            )}
            {!mappingNeeded && <p className="text-sm text-muted">Indooro-Aufnahme: Spalten sind festgelegt, keine Zuordnung nötig.</p>}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Name der Messreihe">
                <TextInput value={name} onChange={(e) => setName(e.target.value)} data-testid="import-name" />
              </Field>
              <Field label="Art">
                <Select value={kind} onChange={(e) => setKind(e.target.value as RunKind)} data-testid="import-kind">
                  <option value="stationary">stationär (Standzeiten an Markern)</option>
                  <option value="walk">Gehversuch (laufend)</option>
                </Select>
              </Field>
              <Field
                label="Rolle"
                hint="Kalibrierung: darf Pfadverlust-Fit und Fingerprints speisen. Evaluation: nur Fehlermetriken. Ein Lauf kann nie beides sein – so wird Datenleck verhindert. Trennung nach Lauf oder Tag, nie nach einzelnen Samples."
              >
                <Select value={role} onChange={(e) => setRole(e.target.value as RunRole)} data-testid="import-role">
                  <option value="evaluation">Evaluation</option>
                  <option value="calibration">Kalibrierung</option>
                </Select>
              </Field>
              <Field label="Herkunft" hint="Ihre Angabe. Synthetische Daten werden überall unübersehbar gekennzeichnet.">
                <div className="flex items-center gap-3">
                  <Select value={origin} onChange={(e) => setOrigin(e.target.value as DataOrigin)} data-testid="import-origin">
                    <option value="real">Echtdaten (im Feld gemessen)</option>
                    <option value="synthetic">Synthetisch (simuliert)</option>
                  </Select>
                  <OriginBadge origin={origin} />
                </div>
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={check} disabled={missing.length > 0 || busy} loading={busy} data-testid="import-check">
                Prüfen
              </Button>
              <Button variant="ghost" onClick={reset}>
                Verwerfen
              </Button>
              {busy && <Spinner />}
            </div>
          </>
        )}

        {outcome && (
          <div className="space-y-3" data-testid="import-result">
            <Callout tone={outcome.ok ? "info" : "danger"} title={outcome.ok ? "Import kann übernommen werden" : "Import enthält blockierende Fehler"}>
              <span data-testid="import-counts">
                {outcome.samples.length} Messwerte, {outcome.references.length} Referenzpunkte · Zeilen: {outcome.provenance.totalRows} gesamt, {outcome.provenance.acceptedRows} akzeptiert, {outcome.provenance.rejectedRows} abgelehnt
              </span>
            </Callout>
            {outcome.unknownBeaconIds.length > 0 && (
              <Callout tone="warning" title="Unbekannte Beacon-IDs">
                Diese IDs kommen in der Datei vor, aber nicht in der Kampagne: {outcome.unknownBeaconIds.join(", ")}. Sie werden von den Verfahren ignoriert.
              </Callout>
            )}
            <IssueList issues={outcome.provenance.issues} emptyText="Keine Auffälligkeiten beim Import." />
            <div>
              <h4 className="mb-1 text-xs font-semibold text-ink">Angewandte Umwandlungen</h4>
              {outcome.provenance.transformations.length === 0 ? (
                <p className="text-sm text-muted">Keine – die Rohwerte wurden unverändert übernommen.</p>
              ) : (
                <ul className="list-disc space-y-0.5 pl-5 text-sm" data-testid="import-transformations">
                  {outcome.provenance.transformations.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              )}
            </div>
            <Button variant="primary" onClick={accept} disabled={!outcome.ok} data-testid="import-accept">
              Messreihe übernehmen
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
