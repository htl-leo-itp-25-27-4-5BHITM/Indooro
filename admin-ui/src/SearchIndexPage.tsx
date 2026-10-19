import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiClient } from "./api/client";
import { activateIndex, fetchIndexOverview, reindexProducts, type IndexOverview } from "./api/searchIndex";
import type { CurrentUser } from "./routes";
import {
  activateConfirmText,
  aliasSummary,
  aliasWarning,
  canActivate,
  compareWithSource,
  comparisonText,
  describeIndexError,
  formatCount,
  reindexSummary,
  type IndexErrorView
} from "./searchIndex";

type Busy = null | "load" | "reindex" | { activate: string };

export function SearchIndexPage({ api, user }: { api: ApiClient; user: CurrentUser }) {
  const isAdmin = user.role === "admin";
  const [overview, setOverview] = useState<IndexOverview | null>(null);
  const [error, setError] = useState<IndexErrorView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(isAdmin ? "load" : null);
  const running = useRef(false);

  /** Reads the overview. Returns the load error instead of showing it, so a write error is not overwritten. */
  const load = useCallback(async (signal?: AbortSignal): Promise<IndexErrorView | null> => {
    try {
      const result = await fetchIndexOverview(api, { signal });
      if (!signal?.aborted) setOverview(result);
      return null;
    } catch (cause) {
      return signal?.aborted ? null : describeIndexError(cause, "load");
    }
  }, [api]);

  useEffect(() => {
    if (!isAdmin) return;
    const controller = new AbortController();
    setBusy("load");
    void load(controller.signal).then((loadError) => {
      if (controller.signal.aborted) return;
      setError(loadError);
      setBusy(null);
    });
    return () => controller.abort();
  }, [isAdmin, load]);

  if (!isAdmin) return <section className="notice" role="alert"><h2>Zugriff verweigert</h2><p>Der Suchindex ist Administratoren vorbehalten.</p></section>;

  // One write at a time: a second click while a request runs must not start another reindex or switch.
  async function runWrite(kind: Exclude<Busy, null | "load">, action: () => Promise<string>, failure: "reindex" | "activate") {
    if (running.current) return;
    running.current = true;
    setBusy(kind);
    setNotice(null);
    setError(null);
    try {
      setNotice(await action());
    } catch (cause) {
      setError(describeIndexError(cause, failure));
    }
    // The overview is read again after success and failure: a failed reindex can leave a target behind.
    const loadError = await load();
    if (loadError) setError((current) => current ?? loadError);
    running.current = false;
    setBusy(null);
  }

  function startReindex() {
    void runWrite("reindex", async () => {
      const result = await reindexProducts(api);
      return `Reindex abgeschlossen. ${reindexSummary(result)} Der Alias ist unverändert; ${result.target} ist noch nicht aktiv.`;
    }, "reindex");
  }

  function startActivate(name: string) {
    const version = overview?.versions.find((entry) => entry.name === name);
    if (!overview || !version || !canActivate(version) || running.current) return;
    if (!window.confirm(activateConfirmText(version, overview))) return;
    void runWrite({ activate: name }, async () => {
      const result = await activateIndex(api, name);
      return `Alias ${result.alias} zeigt jetzt auf ${result.index}. Vorher: ${result.previous.length ? result.previous.join(", ") : "kein Versionsindex"}.`;
    }, "activate");
  }

  function refresh() {
    setNotice(null);
    setError(null);
    setBusy("load");
    void load().then((loadError) => { setError(loadError); setBusy(null); });
  }

  const disabled = busy !== null;
  const warning = overview ? aliasWarning(overview) : null;

  return <div className="search-index-page">
    <div className="page-intro">
      <div><p className="eyebrow">Betrieb</p><h2>Suchindex</h2><p>Neue Version der Produktsuche aufbauen und den Alias umschalten. Es wird kein Index gelöscht.</p></div>
      <button className="button" type="button" disabled={disabled} onClick={refresh}>Aktualisieren</button>
    </div>

    {error && <section className="notice error-state" role="alert"><h3>{error.kind === "conflict" ? "Umschaltung abgelehnt" : "Aktion nicht möglich"}</h3><p>{error.message}</p>{error.kind === "unauthorized" && <a href="/admin/">Erneut anmelden</a>}</section>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {busy === "load" && !overview && <p className="notice" role="status">Suchindex wird geladen …</p>}
    {busy === "reindex" && <p className="notice" role="status">Reindex läuft. Bitte warten und die Seite offen lassen …</p>}
    {busy !== null && typeof busy === "object" && <p className="notice" role="status">Alias wird auf {busy.activate} umgeschaltet …</p>}

    {overview && <>
      <section className="notice" aria-labelledby="index-alias-title">
        <h3 id="index-alias-title">Alias</h3>
        <p>{aliasSummary(overview)}</p>
        {warning && <p className="limit-notice" role="note">{warning}</p>}
        <p>Quellindex <code>{overview.sourceIndex}</code>: {formatCount(overview.sourceCount)} Dokumente.</p>
      </section>

      <section className="notice" aria-labelledby="index-versions-title">
        <div className="section-heading"><h3 id="index-versions-title">Versionen</h3><span>{overview.versions.length} {overview.versions.length === 1 ? "Version" : "Versionen"}</span></div>
        {overview.versions.length === 0 ? <p>Es gibt noch keine Version. Mit „Reindex starten“ wird die erste Version angelegt.</p> : <div className="table-scroll"><table>
          <thead><tr><th>Index</th><th>Dokumente</th><th>Quelle</th><th>Status</th><th>Aktion</th></tr></thead>
          <tbody>{overview.versions.map((version) => <tr key={version.name}>
            <td><code>{version.name}</code></td>
            <td>{formatCount(version.docCount)}</td>
            <td>{comparisonText(compareWithSource(version, overview.sourceCount), overview.sourceCount)}</td>
            <td>{version.active ? <strong>Aktiv</strong> : "Nicht aktiv"}</td>
            <td>{canActivate(version) && <button className="button" type="button" disabled={disabled} aria-label={`${version.name} aktivieren`} onClick={() => startActivate(version.name)}>Aktivieren</button>}</td>
          </tr>)}</tbody>
        </table></div>}
      </section>

      <section className="notice" aria-labelledby="index-reindex-title">
        <h3 id="index-reindex-title">Reindex</h3>
        <p>Kopiert alle Produkte aus <code>{overview.sourceIndex}</code> in die nächste Version. Quelle, vorhandene Versionen und Alias bleiben unverändert. Danach die Zahlen prüfen und erst dann aktivieren.</p>
        <div className="form-actions"><button className="button primary" type="button" disabled={disabled} onClick={startReindex}>Reindex starten</button></div>
      </section>
    </>}
  </div>;
}
