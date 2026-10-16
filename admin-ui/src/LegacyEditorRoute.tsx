import { useEffect, useState } from "react";
import type { ApiClient } from "./api/client";
import { LayoutEditor } from "./editor/LayoutEditor";
import { isLegacyLayoutDocument } from "./editor/contracts";
import type { LayoutDocument } from "./editor/model";
import "./LegacyEditorRoute.css";

interface LegacyHistoryEntry {
  layoutId: string;
  shopName: string;
  savedAt: string;
  exportDate: string;
  elementCount: number;
}
interface LegacySaveResponse { message: string; layoutId: string; savedAt: string }

/** The global OpenSearch layout publishes immediately; it has no draft version state. */
export function LegacyEditorRoute({ api, role }: { api: ApiClient; role: string }) {
  const [versionId, setVersionId] = useState(() => new URLSearchParams(window.location.search).get("layoutId"));
  const [layout, setLayout] = useState<LayoutDocument | null>(null);
  const [history, setHistory] = useState<LegacyHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [historyLimit, setHistoryLimit] = useState(12);
  const [historyRevision, setHistoryRevision] = useState(0);

  useEffect(() => {
    if (role !== "admin") return;
    const controller = new AbortController();
    const layoutPath = versionId ? `/api/layout/versions/${encodeURIComponent(versionId)}` : "/api/layout/current";
    api.get<unknown>(layoutPath, { signal: controller.signal })
      .then((response) => {
        if (!isLegacyLayoutDocument(response)) throw new Error("Globales Layout enthält kein gültiges Raster und keine Elementliste.");
        if (controller.signal.aborted) return;
        setLayout(response);
        setError(null);
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Globales Layout konnte nicht geladen werden."); });
    return () => controller.abort();
  }, [api, role, versionId, revision]);

  useEffect(() => {
    if (role !== "admin") return;
    const controller = new AbortController();
    api.get<LegacyHistoryEntry[]>(`/api/layout/history?limit=${historyLimit}`, { signal: controller.signal })
      .then((response) => { if (!controller.signal.aborted) { setHistory(Array.isArray(response) ? response : []); setHistoryError(null); } })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setHistoryError(cause instanceof Error ? cause.message : "Historie konnte nicht geladen werden."); });
    return () => controller.abort();
  }, [api, role, historyLimit, historyRevision]);

  if (role !== "admin") return <section className="legacy-editor-route-error" role="alert"><h2>Zugriff verweigert</h2><p>Das globale Kundenlayout kann nur von Administratoren bearbeitet werden.</p></section>;
  if (error) return <section className="legacy-editor-route-error" role="alert"><h2>Globales Layout nicht verfügbar</h2><p>{error}</p><button type="button" onClick={() => { setError(null); setRevision((current) => current + 1); }}>Erneut versuchen</button></section>;
  if (!layout) return <p role="status">Globales Layout wird geladen …</p>;

  const saveCurrent = async (document: LayoutDocument) => {
    // The backend accepts the document itself, not the store version envelope.
    const result = await api.post<LegacySaveResponse>("/api/layout/current", document);
    if (!result.layoutId || !result.savedAt) throw new Error("Server hat die Veröffentlichung nicht bestätigt.");
    setPublishedId(result.layoutId);
    if (versionId) {
      window.history.replaceState(null, "", "/admin/next/editor/");
      setLayout(null);
      setVersionId(null);
    }
    api.get<LegacyHistoryEntry[]>(`/api/layout/history?limit=${historyLimit}`)
      .then((response) => { setHistory(Array.isArray(response) ? response : []); setHistoryError(null); })
      .catch((cause: unknown) => setHistoryError(cause instanceof Error ? cause.message : "Historie konnte nicht aktualisiert werden."));
  };

  return <div className="legacy-editor-route">
    <div className="legacy-editor-route-intro"><div><p className="legacy-editor-route-kicker">GLOBALER KUNDENGRUNDRISS</p><h2>{versionId && !publishedId ? "Historische Version bearbeiten" : "Globales Layout"}</h2><p>Speichern veröffentlicht hier sofort für die Kundenansicht. Filiallayouts verwenden getrennte Entwürfe und Versionen.</p></div><a href="/admin/next/">Zur Administration</a></div>
    {publishedId && <p className="legacy-editor-route-published" role="status">Version {publishedId} ist jetzt das globale Layout.</p>}
    <LayoutEditor key={versionId ?? "current"} api={api} initialDocument={layout} mode="legacy" saveMode="immediate" onSaveCurrent={saveCurrent} allowUnchangedSave={!!versionId && !publishedId} onBack={() => { window.location.href = "/admin/next/"; }} />
    <section className="legacy-editor-route-history" aria-label="Globale Layout-Historie"><div><h3>Vorherige Versionen</h3><a href="/admin/next/editor/">Aktuelles globales Layout öffnen</a></div>{historyError && <div role="alert"><p>{historyError}</p><button type="button" className="legacy-editor-route-more" onClick={() => setHistoryRevision((value) => value + 1)}>Historie erneut laden</button></div>}{!historyError && (history.length ? <ul>{history.map((item) => <li key={item.layoutId}><span><strong>{item.shopName || "Globales Layout"}</strong><small>{item.savedAt ? new Date(item.savedAt).toLocaleString("de-AT") : "Ohne Zeitangabe"} · {item.elementCount} Elemente</small></span><a href={`/admin/next/editor/?layoutId=${encodeURIComponent(item.layoutId)}`}>Öffnen</a></li>)}</ul> : <p>Noch keine gespeicherten Versionen.</p>)}{!historyError && history.length === historyLimit && <button type="button" className="legacy-editor-route-more" onClick={() => setHistoryLimit((limit) => limit + 12)}>Weitere Versionen laden</button>}</section>
  </div>;
}
