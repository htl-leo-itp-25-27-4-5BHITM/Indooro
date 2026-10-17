import { useEffect, useMemo, useState } from "react";
import { ApiClientError, type ApiClient } from "./api/client";
import { ANCHORS_PER_PAGE, chunk, printableAnchors, type PrintableAnchor } from "./anchors";
import type { LayoutDocument } from "./editor/model";
import { qrSvgPath } from "./qr";
import "./AnchorPrintPage.css";

interface StoreSummary { id: string; storeCode: string; name: string }
interface CurrentLayout { layoutId: string | null; versionNo: number | null; status: string; layout: LayoutDocument }
interface LoadError { message: string; forbidden: boolean }

function AnchorCard({ anchor, storeName }: { anchor: PrintableAnchor; storeName: string }) {
  const { size, path } = useMemo(() => qrSvgPath(anchor.url), [anchor.url]);
  return <article className="anchor-card">
    <svg className="anchor-qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`QR-Code ${anchor.anchorId}: ${anchor.label}`} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
    <p className="anchor-label">{anchor.label}</p>
    <p className="anchor-id">{anchor.anchorId}</p>
    <p className="anchor-store">{storeName}</p>
    <p className="anchor-hint">Scannen, um deinen Standort zu setzen</p>
  </article>;
}

export function AnchorPrintPage({ api }: { api: ApiClient }) {
  const storeId = new URLSearchParams(window.location.search).get("storeId");
  const [store, setStore] = useState<StoreSummary | null>(null);
  const [layout, setLayout] = useState<LayoutDocument | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!storeId) return;
    const controller = new AbortController();
    const path = `/api/stores/${encodeURIComponent(storeId)}`;
    Promise.all([
      api.get<StoreSummary>(path, { signal: controller.signal }),
      api.get<CurrentLayout>(`${path}/layout/current`, { signal: controller.signal }),
    ]).then(([loadedStore, loadedLayout]) => {
      if (controller.signal.aborted) return;
      if (!loadedStore?.id || !loadedLayout?.layout || !Array.isArray(loadedLayout.layout.elements)) throw new Error("Store- oder Layout-Daten sind unvollständig.");
      setStore(loadedStore);
      setLayout(loadedLayout.layout);
      setError(null);
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      setError({
        message: cause instanceof Error ? cause.message : "QR-Codes konnten nicht geladen werden.",
        forbidden: cause instanceof ApiClientError && cause.kind === "forbidden",
      });
    });
    return () => controller.abort();
  }, [api, storeId, revision]);

  if (!storeId) return <section className="notice" role="alert"><h2>Store auswählen</h2><a href="/admin/next/stores/">Zur Store-Liste</a></section>;
  if (error) return <section className="notice error-state" role="alert"><h2>{error.forbidden ? "Zugriff verweigert" : "QR-Codes konnten nicht geladen werden"}</h2><p>{error.message}</p>{!error.forbidden && <button className="button" type="button" onClick={() => { setError(null); setRevision((value) => value + 1); }}>Erneut versuchen</button>}</section>;
  if (!store || !layout) return <p role="status">QR-Anker werden geladen …</p>;

  const anchors = printableAnchors(layout, window.location.host, store.storeCode);
  const sheets = chunk(anchors, ANCHORS_PER_PAGE);
  return <div className="anchor-print-page">
    <div className="page-intro anchor-print-toolbar">
      <div><p className="eyebrow">{store.storeCode}</p><h2>QR-Codes drucken</h2><p>{store.name}</p></div>
      <div className="anchor-print-actions">
        <a className="button" href={`/admin/next/stores/detail/?storeId=${encodeURIComponent(store.id)}`}>Zur Filiale</a>
        {anchors.length > 0 && <button className="button primary" type="button" onClick={() => window.print()}>Drucken</button>}
      </div>
    </div>
    {anchors.length === 0 ? <section className="notice" role="status"><p>Keine QR-Anker im aktiven Layout. Im Editor mit dem Werkzeug „QR-Anker“ anlegen.</p></section> : <>
      <p className="anchor-print-notice">{anchors.length} QR-Code{anchors.length === 1 ? "" : "s"} auf {sheets.length} A4-{sheets.length === 1 ? "Seite" : "Seiten"}. Nach jeder Layoutänderung neu drucken.</p>
      {sheets.map((sheet, index) => <section key={index} className="anchor-sheet" aria-label={`Seite ${index + 1} von ${sheets.length}`}>
        {sheet.map((anchor) => <AnchorCard key={anchor.anchorId} anchor={anchor} storeName={store.name} />)}
      </section>)}
    </>}
  </div>;
}
