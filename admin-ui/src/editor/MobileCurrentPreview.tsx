import { useEffect, useState } from "react";
import type { ApiClient } from "../api/client";
import { isMobileCurrentLayout, type MobileCurrentLayout } from "./contracts";
import { elementFill } from "./metadata";
import type { LayoutDocument, LayoutElement } from "./model";
import "./MobileCurrentPreview.css";

const safeElements = (layout: LayoutDocument): LayoutElement[] => layout.elements.filter((element) =>
  Number.isFinite(element.x) && Number.isFinite(element.y)
  && (element.type === "beacon" || (Number.isFinite(element.width) && Number.isFinite(element.height) && (element.width ?? 0) > 0 && (element.height ?? 0) > 0)));

/** Reads the same anonymous current-layout endpoint used by the mobile client. */
export function MobileCurrentPreview({ api, storeId, refreshKey = 0 }: { api: ApiClient; storeId: string; refreshKey?: string | number }) {
  const [refresh, setRefresh] = useState(0);
  const [current, setCurrent] = useState<MobileCurrentLayout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api.get<unknown>(`/api/mobile/stores/${encodeURIComponent(storeId)}/layout/current`, { signal: controller.signal })
      .then((response) => {
        if (!isMobileCurrentLayout(response)) throw new Error("Mobile-Layout-Antwort ist unvollständig.");
        if (response.storeId.toLowerCase() !== storeId.toLowerCase()) throw new Error("Mobile-Layout gehört zu einer anderen Filiale.");
        if (controller.signal.aborted) return;
        setCurrent(response);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Mobile-Layout konnte nicht geladen werden.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, storeId, refreshKey, refresh]);

  const elements = current ? safeElements(current.layout) : [];
  return <section className="mobile-current-preview" aria-label="Aktuell mobiles Layout">
    <div className="mobile-current-preview-heading"><div><span className="mobile-current-preview-kicker">ÖFFENTLICHE ANSICHT · NUR LESEN</span><h2>Mobile-Vorschau</h2></div><button type="button" onClick={() => setRefresh((value) => value + 1)} disabled={loading}>Aktualisieren</button></div>
    {loading && <p role="status">Mobiles Layout wird geladen …</p>}
    {error && !loading && <p role="alert">{error} <button type="button" onClick={() => setRefresh((value) => value + 1)}>Erneut versuchen</button></p>}
    {current && !loading && !error && <div className="mobile-current-preview-content">
      <div className="mobile-current-preview-map"><svg viewBox={`0 0 ${current.layout.gridSize.width} ${current.layout.gridSize.height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Aktuell mobiles Layout mit ${elements.length} Elementen`}>
        <rect x={0} y={0} width={current.layout.gridSize.width} height={current.layout.gridSize.height} fill="#f8faf7" stroke="#c7d6d0" strokeWidth={0.2} />
        {elements.map((element, index) => {
          const width = element.width ?? 0;
          const height = element.height ?? 0;
          const rotation = element.rotation ?? 0;
          return element.type === "beacon"
            ? <circle key={`${element.id ?? index}`} cx={element.x} cy={element.y} r={0.5} fill={elementFill(element, "#b6635f")} />
            : <rect key={`${element.id ?? index}`} x={element.x} y={element.y} width={width} height={height} rx={0.2} transform={`rotate(${rotation} ${element.x + width / 2} ${element.y + height / 2})`} fill={elementFill(element, element.type === "entrance" ? "#3b9a81" : "#628b91")} />;
        })}
      </svg></div>
      <div className="mobile-current-preview-facts"><strong>{current.fallback ? "Standardlayout (Fallback)" : "Aktive Version"}</strong><span>{current.layout.shopName}</span><dl><div><dt>Quelle</dt><dd>{current.source}</dd></div><div><dt>Layout-ID</dt><dd>{current.layoutId ?? "Keine aktive Version"}</dd></div><div><dt>Elemente</dt><dd>{elements.length}</dd></div><div><dt>Raster</dt><dd>{current.layout.gridSize.width} × {current.layout.gridSize.height}</dd></div></dl><p>Diese Vorschau wird direkt vom öffentlichen Mobile-Endpunkt geladen. Gespeicherte Entwürfe erscheinen hier erst nach der Veröffentlichung.</p></div>
    </div>}
  </section>;
}
