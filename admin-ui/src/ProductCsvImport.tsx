import { useRef, useState, type ChangeEvent } from "react";
import type { ApiClient } from "./api/client";
import {
  bulkRunnerDeps,
  canStartImport,
  importProgress,
  importResultRows,
  loadStoreLayout,
  loadStoreProductIds,
  reviewCsvImport,
  IMPORT_BATCH_SIZE,
  type CsvImportReview
} from "./catalogCsvImport";
import { retryUnknown, runCatalogImport, type RowStatus, type RunnerState } from "./catalogImportRunner";
import type { AdminStore } from "./productStore";

const STATUS_LABEL: Record<RowStatus, string> = { saved: "Gespeichert", failed: "Fehlgeschlagen", unknown: "Unklar" };

export function ProductCsvImport({ api, store, onImported, onBusyChange }: {
  api: ApiClient;
  store: AdminStore | null;
  onImported?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [fileName, setFileName] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [review, setReview] = useState<CsvImportReview | null>(null);
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);
  const [run, setRun] = useState<RunnerState | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const busy = useRef(false);
  const checkSeq = useRef(0);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Gleiche Datei nach einem Abbruch erneut wählbar machen.
    input.value = "";
    const seq = checkSeq.current + 1;
    checkSeq.current = seq;
    setFileName(file?.name ?? "");
    setReview(null);
    setRun(null);
    setRunError("");
    setCheckError("");
    setOverwriteConfirmed(false);
    if (!file || !store) {
      setChecking(false);
      return;
    }
    setChecking(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const [layout, existingIds] = await Promise.all([loadStoreLayout(api, store), loadStoreProductIds(api, store)]);
      if (seq !== checkSeq.current) return;
      setReview(reviewCsvImport(bytes, { layout, existingIds }));
    } catch (error) {
      if (seq === checkSeq.current) {
        setCheckError(`Datei konnte nicht geprüft werden: ${error instanceof Error ? error.message : "unbekannter Fehler"}`);
      }
    } finally {
      if (seq === checkSeq.current) setChecking(false);
    }
  }

  async function startImport() {
    if (!store || !review || busy.current || !canStartImport({ hasStore: true, review, overwriteConfirmed, running: false, started: run !== null })) return;
    await execute(() => runCatalogImport(review.products, deps(), { storeCode: store.storeCode, batchSize: IMPORT_BATCH_SIZE }));
  }

  async function retry() {
    if (!store || !review || !run || busy.current || importProgress(run).unknownBatches === 0) return;
    const previous = run;
    await execute(() => retryUnknown(previous, review.products, deps(), { storeCode: store.storeCode, batchSize: IMPORT_BATCH_SIZE }));
  }

  function deps() {
    return { ...bulkRunnerDeps(api), onProgress: (state: RunnerState) => setRun(state) };
  }

  async function execute(action: () => Promise<RunnerState>) {
    busy.current = true;
    setRunning(true);
    setRunError("");
    onBusyChange?.(true);
    try {
      const result = await action();
      setRun(result);
      if (result.totals.saved > 0) onImported?.();
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Import konnte nicht gestartet werden.");
    } finally {
      busy.current = false;
      setRunning(false);
      onBusyChange?.(false);
    }
  }

  const progress = run ? importProgress(run) : null;
  const results = run ? importResultRows(run) : [];
  const canStart = canStartImport({ hasStore: !!store, review, overwriteConfirmed, running, started: run !== null });
  const hint = review && review.errors.length > 0 ? "Vor dem Import alle Fehler in der Datei beheben."
    : review && review.overwrites.length > 0 && !overwriteConfirmed ? "Das Überschreiben vorhandener Produkte bestätigen, um zu importieren."
    : run ? "Für einen weiteren Import bitte eine neue Datei wählen."
    : "";

  return <section className="catalog-import panel product-csv-import" aria-labelledby="product-csv-import-title">
    <div className="panel-header"><h3 id="product-csv-import-title">Produktimport aus CSV</h3></div>
    <p>CSV mit Semikolon, Komma oder Tab als Trenner. Excel-Dateien bitte als CSV speichern; XLSX wird nicht unterstützt. Der Import schreibt nur in den gewählten Markt, in Blöcken von {IMPORT_BATCH_SIZE} Produkten.</p>
    <div className="inline-action">
      <label htmlFor="product-csv-file">CSV-Datei wählen</label>
      <input id="product-csv-file" type="file" accept=".csv,text/csv" disabled={!store || running || checking} onChange={(event) => void chooseFile(event)} />
    </div>
    {!store && <p role="status" className="notice">Bitte zuerst einen Markt wählen.</p>}
    {fileName && <p>Datei: <code>{fileName}</code></p>}
    {checking && <p role="status">Datei wird geprüft …</p>}
    {checkError && <p role="alert" className="notice error">{checkError}</p>}

    {review && <div className="catalog-review" aria-live="polite">
      <h4>Prüfung</h4>
      <p role="status">{review.counts.rows} Zeilen · {review.counts.valid} gültig · {review.counts.invalid} ungültig</p>
      {review.errors.length > 0 && <div className="table-scroll"><table><thead><tr><th>Zeile</th><th>Feld</th><th>Meldung</th></tr></thead><tbody>
        {review.errors.map((error, index) => <tr key={`${error.line ?? "file"}-${index}`}><td>{error.line ?? "Datei"}</td><td>{error.field ?? "—"}</td><td>{error.message}</td></tr>)}
      </tbody></table></div>}
      {review.overwrites.length > 0 && <div className="limit-notice">
        <p>{review.overwrites.length} vorhandene Produkte würden überschrieben: <code>{review.overwrites.join(", ")}</code></p>
        <label className="confirm-overwrite"><input type="checkbox" checked={overwriteConfirmed} disabled={running || run !== null} onChange={(event) => setOverwriteConfirmed(event.currentTarget.checked)} /> Vorhandene Produkte überschreiben</label>
      </div>}
      <div className="toolbar">
        <button type="button" className="primary" disabled={!canStart} onClick={() => void startImport()}>{running ? "Import läuft …" : "Produkte importieren"}</button>
        {hint && !running && <small>{hint}</small>}
      </div>
    </div>}

    {runError && <p role="alert" className="notice error">{runError}</p>}

    {run && progress && <div className="catalog-review" aria-label="Importergebnis">
      <h4>Ergebnis</h4>
      <p>{running && progress.runningBatch
        ? `Block ${progress.runningBatch} von ${progress.batchCount} wird gesendet.`
        : `${progress.batchesFinished} von ${progress.batchCount} Blöcken verarbeitet.`}</p>
      <div className="import-progress" role="progressbar" aria-label="Importfortschritt" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.processed} aria-valuetext={`${progress.processed} von ${progress.total} Produkten verarbeitet`}>
        <span style={{ width: `${progress.total ? Math.round((progress.processed / progress.total) * 100) : 0}%` }} />
      </div>
      <ul className="import-counters">
        <li>Gespeichert: {progress.saved}</li>
        <li>Fehlgeschlagen: {progress.failed}</li>
        <li>Unklar: {progress.unknown}</li>
      </ul>

      {progress.abortMessage && !running && <div role="alert" className="notice error">
        <p>Import abgebrochen: {progress.abortMessage}</p>
        {progress.notSent > 0 && <p>{progress.notSent} Produkte wurden nicht gesendet.</p>}
      </div>}
      {progress.unknownBatches > 0 && !running && <div role="alert" className="notice">
        <h4>Ergebnis unklar</h4>
        <p>{progress.unknown} Produkte in {progress.unknownBatches} Blöcken wurden vom Server nicht bestätigt. Wiederholen sendet dieselben Blöcke mit demselben Schlüssel erneut.</p>
        <button type="button" onClick={() => void retry()}>Wiederholen</button>
      </div>}
      {!running && !progress.abortMessage && progress.unknownBatches === 0 && progress.failed === 0 && <p role="status" className="notice success">Import abgeschlossen: {progress.saved} Produkte gespeichert.</p>}
      {!running && !progress.abortMessage && progress.unknownBatches === 0 && progress.failed > 0 && <p role="status" className="notice">Import beendet: {progress.saved} gespeichert, {progress.failed} fehlgeschlagen.</p>}

      {results.length > 0 && <div className="table-scroll"><table><thead><tr><th>Nr.</th><th>Produkt-ID</th><th>Ergebnis</th><th>Grund</th></tr></thead><tbody>
        {results.map((row) => <tr key={row.position}><td>{row.position}</td><td>{row.id}</td><td><span className={`status-pill ${row.status === "saved" ? "ready" : "missing"}`}>{STATUS_LABEL[row.status]}</span></td><td>{row.reason ?? "—"}</td></tr>)}
      </tbody></table></div>}
    </div>}
  </section>;
}
