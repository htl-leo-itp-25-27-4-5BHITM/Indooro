import { useEffect, useState, type FormEvent } from "react";
import type { ApiClient } from "./api/client";
import { DEFAULT_READINESS_RADIUS, fetchStoreReadiness, type ReadinessFinding, type ReadinessReport } from "./api/readiness";
import type { CurrentUser } from "./routes";
import {
  coverageSummary,
  describeReadinessError,
  formatRadius,
  groupFindings,
  parseRadiusInput,
  profileLabel,
  readinessToMarkdown,
  ruleText,
  statusLabel
} from "./readiness";

interface StoreHeader { storeCode: string; name: string }
type LoadError = ReturnType<typeof describeReadinessError>;

function checkedOnLabel(): string {
  return new Date().toLocaleDateString("de-AT");
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function FindingItem({ finding, storeId, isAdmin }: { finding: ReadinessFinding; storeId: string; isAdmin: boolean }) {
  const details = [
    finding.beaconCode ? `Beacon ${finding.beaconCode}` : null,
    finding.layoutCode ? `Layout-Code ${finding.layoutCode}` : null,
    finding.productId != null ? `Produkt ${finding.productId}` : null,
    finding.elementId ? `Element ${finding.elementId}` : null
  ].filter(Boolean);
  // The editor does not read elementId from the URL yet: the link opens the store's editor and the element has to be found there by hand.
  const editorHref = finding.elementId
    ? `/admin/next/editor/?storeId=${encodeURIComponent(storeId)}&elementId=${encodeURIComponent(finding.elementId)}`
    : null;
  // The product page searches by ID as well, which narrows the list to the affected product.
  const productHref = finding.productId != null ? `/admin/next/products/?q=${encodeURIComponent(String(finding.productId))}` : null;
  return <li>
    <span>
      <strong>{finding.message}</strong>
      <small><code>{finding.code}</code>{details.map((detail) => <span key={detail}> · {detail}</span>)}</small>
    </span>
    <span className="readiness-links">
      {editorHref && <a href={editorHref}>Im Editor öffnen</a>}
      {productHref && isAdmin && <a href={productHref}>Produkt suchen</a>}
    </span>
  </li>;
}

export function ReadinessPage({ api, user }: { api: ApiClient; user: CurrentUser }) {
  const storeId = new URLSearchParams(window.location.search).get("storeId");
  const [radiusInput, setRadiusInput] = useState(DEFAULT_READINESS_RADIUS.toFixed(1));
  const [radiusError, setRadiusError] = useState<string | null>(null);
  const [radius, setRadius] = useState(DEFAULT_READINESS_RADIUS);
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [revision, setRevision] = useState(0);
  const [store, setStore] = useState<StoreHeader | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [fallbackText, setFallbackText] = useState<string | null>(null);

  useEffect(() => {
    if (!storeId) return;
    const controller = new AbortController();
    api.get<StoreHeader>(`/api/stores/${encodeURIComponent(storeId)}`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted && typeof result?.name === "string") setStore(result); })
      .catch(() => {
        // The store name only labels the page and the export; the check itself stays usable without it.
      });
    return () => controller.abort();
  }, [api, storeId]);

  useEffect(() => {
    if (!storeId) return;
    const controller = new AbortController();
    setLoadError(null);
    setReport(null);
    fetchStoreReadiness(api, storeId, radius, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setReport(result); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setLoadError(describeReadinessError(cause)); });
    return () => controller.abort();
  }, [api, storeId, radius, revision]);

  if (!storeId) return <section className="notice" role="alert"><h2>Store auswählen</h2><p>Die Pilot-Bereitschaft gehört zu einem Store.</p><a href="/admin/next/stores/">Zur Store-Liste</a></section>;

  // Narrowed copy for the nested functions below, which TypeScript does not narrow from the early return.
  const activeStoreId: string = storeId;
  const isAdmin = user.role === "admin";

  function applyRadius(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseRadiusInput(radiusInput);
    if ("error" in parsed) {
      setRadiusError(parsed.error);
      return;
    }
    setRadiusError(null);
    setRadius(parsed.radius);
    setRevision((value) => value + 1);
  }

  async function copyMarkdown() {
    if (!report) return;
    const markdown = readinessToMarkdown(report, { storeName: store?.name ?? activeStoreId, checkedOn: checkedOnLabel() });
    if (await copyToClipboard(markdown)) {
      setFallbackText(null);
      setCopyNotice("Markdown in die Zwischenablage kopiert.");
      return;
    }
    setFallbackText(markdown);
    setCopyNotice("Die Zwischenablage ist nicht verfügbar. Den Text unten markieren und mit Strg+C kopieren.");
  }

  const backHref = `/admin/next/stores/detail/?storeId=${encodeURIComponent(storeId)}`;
  const { blocking, warnings } = report ? groupFindings(report.findings) : { blocking: [], warnings: [] };

  return <div className="readiness-page">
    <div className="page-intro"><div><p className="eyebrow">{store ? `${store.storeCode} · ${store.name}` : "Store"}</p><h2>Pilot-Bereitschaft</h2><p>Prüft aktives Layout, Produkte und Beacons dieses Markts.</p></div><a className="button" href={backHref}>Zurück zum Store</a></div>

    {/* noValidate: the range is checked by parseRadiusInput so the message stays German and consistent. */}
    <form className="readiness-controls notice" noValidate onSubmit={applyRadius}>
      <label>Beacon-Radius in Metern<input name="radius" type="number" min={0.5} max={30} step="any" inputMode="decimal" value={radiusInput} aria-invalid={!!radiusError} aria-describedby={radiusError ? "readiness-radius-error" : undefined} onChange={(event) => setRadiusInput(event.currentTarget.value)} /></label>
      <button className="button" type="submit">Prüfen</button>
      {radiusError && <small id="readiness-radius-error" role="alert">{radiusError}</small>}
    </form>

    {loadError && <section className="notice error-state" role="alert"><h2>{loadError.title}</h2><p>{loadError.message}</p>
      {loadError.kind === "retryable" && <button className="button" onClick={() => setRevision((value) => value + 1)}>Erneut versuchen</button>}
      {loadError.kind === "unauthorized" && <a href="/admin/">Erneut anmelden</a>}
    </section>}
    {!loadError && !report && <p role="status">Pilot-Bereitschaft wird geprüft …</p>}

    {report && <>
      <section className={`notice readiness-summary readiness-${report.status.toLowerCase()}`} aria-labelledby="readiness-status-title">
        <p className="readiness-light"><span className="readiness-dot" aria-hidden="true" /><strong id="readiness-status-title">{statusLabel(report.status)}</strong></p>
        <p className="readiness-meta">Blockierend: {blocking.length} · Warnungen: {warnings.length} · Radius {formatRadius(report.radius)} m · Layout {report.layoutVersionNo != null ? `Version ${report.layoutVersionNo}` : "kein aktives Layout"}</p>
        <dl className="readiness-counts">
          <div><dt>Abdeckungsprofil</dt><dd>{profileLabel(report.profile)}</dd></div>
          <div><dt>Regale</dt><dd>{report.counts.shelves}</dd></div>
          <div><dt>Eingänge</dt><dd>{report.counts.entrances}</dd></div>
          <div><dt>Produkte</dt><dd>{report.counts.products}</dd></div>
          <div><dt>Beacons platziert</dt><dd>{report.counts.placedBeacons}</dd></div>
          <div><dt>Beacons zugewiesen</dt><dd>{report.counts.assignedBeacons}</dd></div>
          {ruleText(report) && <div className="wide"><dt>Abdeckungsregel</dt><dd>{ruleText(report)}</dd></div>}
          <div className="wide"><dt>Abdeckung</dt><dd>{coverageSummary(report)}</dd></div>
        </dl>
        <div className="form-actions"><button className="button primary" type="button" onClick={() => void copyMarkdown()}>Als Markdown kopieren</button></div>
        {copyNotice && <p role="status" className="notice">{copyNotice}</p>}
        {fallbackText !== null && <label className="readiness-fallback">Markdown zum Kopieren<textarea readOnly rows={12} value={fallbackText} autoFocus onFocus={(event) => event.currentTarget.select()} /></label>}
      </section>

      <section className="notice detail-section" aria-labelledby="readiness-blocking-title">
        <h3 id="readiness-blocking-title">Blockierend ({blocking.length})</h3>
        {blocking.length ? <ul className="readiness-findings">{blocking.map((finding, index) => <FindingItem key={`blocking-${index}`} finding={finding} storeId={activeStoreId} isAdmin={isAdmin} />)}</ul> : <p>Keine blockierenden Punkte.</p>}
      </section>

      <section className="notice detail-section" aria-labelledby="readiness-warning-title">
        <h3 id="readiness-warning-title">Warnungen ({warnings.length})</h3>
        {warnings.length ? <ul className="readiness-findings">{warnings.map((finding, index) => <FindingItem key={`warning-${index}`} finding={finding} storeId={activeStoreId} isAdmin={isAdmin} />)}</ul> : <p>Keine Warnungen.</p>}
      </section>
    </>}
  </div>;
}
