import { useEffect, useState } from "react";
import { ApiClientError, type ApiClient } from "./api/client";
import { LayoutEditor } from "./editor/LayoutEditor";
import type { LayoutDocument } from "./editor/model";
import type { AssignedBeacon } from "./editor/validation";
import { MobileCurrentPreview } from "./editor/MobileCurrentPreview";

interface LayoutVersion {
  layoutId: string;
  versionNo: number;
  layoutName?: string | null;
  status: "DEFAULT" | "DRAFT" | "ACTIVE" | "ARCHIVED";
  createdAt?: string | null;
  layout?: LayoutDocument;
}
interface EditorContext {
  store: { id: string; storeCode: string; name: string };
  currentLayout: LayoutVersion & { layout: LayoutDocument };
  assignedBeacons: AssignedBeacon[];
}

function validDocument(value: unknown): value is LayoutDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<LayoutDocument>;
  return typeof document.shopName === "string" && !!document.gridSize
    && Number.isFinite(document.gridSize.width) && Number.isFinite(document.gridSize.height)
    && Array.isArray(document.elements);
}

export function EditorRoute({ api }: { api: ApiClient }) {
  const [storeId] = useState(() => new URLSearchParams(window.location.search).get("storeId"));
  const [selectedVersionId] = useState(() => new URLSearchParams(window.location.search).get("layoutId"));
  const [context, setContext] = useState<EditorContext | null>(null);
  const [version, setVersion] = useState<LayoutVersion | null>(null);
  const [versions, setVersions] = useState<LayoutVersion[]>([]);
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; forbidden: boolean } | null>(null);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [versionRevision, setVersionRevision] = useState(0);

  useEffect(() => {
    if (!storeId) return;
    const controller = new AbortController();
    const base = `/api/stores/${encodeURIComponent(storeId)}/layout`;
    api.get<EditorContext>(`${base}/editor-context`, { signal: controller.signal })
      .then(async (loadedContext) => {
        const loadedVersion = selectedVersionId
          ? await api.get<LayoutVersion>(`${base}/versions/${encodeURIComponent(selectedVersionId)}`, { signal: controller.signal })
          : loadedContext.currentLayout;
        if (!validDocument(loadedVersion?.layout)) throw new Error("Layout-Daten sind unvollständig.");
        if (controller.signal.aborted) return;
        setContext(loadedContext);
        setVersion(loadedVersion);
        setSavedDraftId(loadedVersion.status === "DRAFT" ? loadedVersion.layoutId : null);
        setError(null);
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError({
        message: cause instanceof Error ? cause.message : "Editor konnte nicht geladen werden.",
        forbidden: cause instanceof ApiClientError && cause.kind === "forbidden"
      }); });
    return () => controller.abort();
  }, [api, storeId, selectedVersionId, revision]);

  useEffect(() => {
    if (!storeId) return;
    const controller = new AbortController();
    api.get<LayoutVersion[]>(`/api/stores/${encodeURIComponent(storeId)}/layout/versions`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setVersions(Array.isArray(result) ? result : []); setVersionError(null); } })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setVersionError(cause instanceof Error ? cause.message : "Versionsliste konnte nicht geladen werden."); });
    return () => controller.abort();
  }, [api, storeId, revision, versionRevision]);

  if (!storeId) return <section className="notice" role="alert"><h2>Store auswählen</h2><p>Der neue Layout-Editor benötigt eine Filiale. Das globale Kundenlayout bleibt im bisherigen Editor verfügbar.</p><a href="/admin/next/stores/">Zur Store-Liste</a><span> · </span><a href="/admin/editor/">Globales Layout öffnen</a></section>;
  if (error) return <section className="notice error-state" role="alert"><h2>{error.forbidden ? "Zugriff verweigert" : "Editor konnte nicht geladen werden"}</h2><p>{error.message}</p>{!error.forbidden && <button className="button" onClick={() => setRevision((value) => value + 1)}>Erneut versuchen</button>}</section>;
  if (!context || !version?.layout) return <p role="status">Layout-Editor wird geladen …</p>;

  const base = `/api/stores/${encodeURIComponent(storeId)}/layout`;
  const saveDraft = async (document: LayoutDocument) => {
    const response = await api.post<LayoutVersion>(`${base}/versions`, {
      layoutName: document.shopName || context.store.name,
      changeNote: "Im neuen Layout-Editor als Entwurf gespeichert",
      activate: false,
      layout: document
    });
    if (!response.layoutId || response.status !== "DRAFT") throw new Error("Server hat keinen gültigen Entwurf bestätigt.");
    setSavedDraftId(response.layoutId);
    setVersion(response);
    window.history.replaceState(null, "", `/admin/next/editor/?storeId=${encodeURIComponent(storeId)}&layoutId=${encodeURIComponent(response.layoutId)}`);
    setVersions((current) => [{ ...response, layoutName: document.shopName }, ...current]);
  };
  const activationId = version.status === "ARCHIVED" ? version.layoutId : savedDraftId;
  const publish = activationId ? async () => {
    const response = await api.post<LayoutVersion>(`${base}/versions/${encodeURIComponent(activationId)}/activate`, {});
    if (response.status !== "ACTIVE") throw new Error("Server hat die Veröffentlichung nicht bestätigt.");
    setVersion(response);
    setSavedDraftId(null);
    setVersions((current) => current.map((item) => ({ ...item, status: item.layoutId === response.layoutId ? "ACTIVE" : item.status === "ACTIVE" ? "ARCHIVED" : item.status })));
  } : undefined;

  return <div className="editor-route">
    <div className="editor-route-header"><div><p className="eyebrow">{context.store.storeCode} · {context.store.name}</p><h2>Layout Editor</h2><p>Version {version.versionNo ?? "–"} · {version.status === "DEFAULT" ? "Vorlage" : version.status === "DRAFT" ? "Entwurf" : version.status === "ACTIVE" ? "Aktiv" : "Archiviert"}</p></div><a className="button" href={`/admin/next/stores/detail/?storeId=${encodeURIComponent(storeId)}`}>Store-Detail öffnen</a></div>
    <LayoutEditor key={storeId} api={api} initialDocument={version.layout} mode="store" storeName={context.store.name} assignedBeacons={context.assignedBeacons ?? []} onSaveDraft={saveDraft} onPublish={publish} publishLabel={version.status === "ARCHIVED" ? "Version wieder aktivieren" : "Veröffentlichen"} publishPrompt={version.status === "ARCHIVED" ? "Diese ältere Version wieder aktivieren? Die mobile Ansicht verwendet danach genau diese gespeicherte Version." : undefined} onBack={() => { window.location.href = `/admin/next/stores/detail/?storeId=${encodeURIComponent(storeId)}`; }} />
    <MobileCurrentPreview api={api} storeId={storeId} refreshKey={`${version.layoutId}:${version.status}`} draft={version.status === "DRAFT" ? { layoutId: version.layoutId, layout: version.layout } : null} assignedBeacons={context.assignedBeacons ?? []} />
    <section className="notice version-history"><div className="section-heading"><h3>Versionen</h3><span>Öffnen lädt die gewählte Version im Editor.</span></div>
      {versionError && <div role="alert"><p>Versionsliste nicht verfügbar: {versionError}</p><button type="button" className="button" onClick={() => setVersionRevision((value) => value + 1)}>Versionen erneut laden</button></div>}
      {!versionError && (versions.length ? <ul>{versions.map((item) => <li key={item.layoutId}><span>v{item.versionNo} · {item.layoutName || "Layout"} · {item.status}</span><a href={`/admin/next/editor/?storeId=${encodeURIComponent(storeId)}&layoutId=${encodeURIComponent(item.layoutId)}`}>Öffnen</a></li>)}</ul> : <p>Noch keine gespeicherten Versionen.</p>)}
    </section>
  </div>;
}
