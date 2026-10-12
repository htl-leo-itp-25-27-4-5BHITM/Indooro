import { useEffect, useState } from "react";
import type { ApiClient } from "../api/client";
import { isMobileCurrentLayout, type MobileCurrentLayout } from "./contracts";
import { elementFill } from "./metadata";
import type { LayoutDocument, LayoutElement } from "./model";
import { validateLayout, type AssignedBeacon } from "./validation";
import "./MobileCurrentPreview.css";

const safeElements = (layout: LayoutDocument): LayoutElement[] => layout.elements.filter((element) =>
  Number.isFinite(element.x) && Number.isFinite(element.y)
  && (element.type === "beacon" || (Number.isFinite(element.width) && Number.isFinite(element.height) && (element.width ?? 0) > 0 && (element.height ?? 0) > 0)));

/** Compares the anonymous mobile response with a saved, unpublished draft. */
export function MobileCurrentPreview({ api, storeId, refreshKey = 0, draft, assignedBeacons = [] }: { api: ApiClient; storeId: string; refreshKey?: string | number; draft?: { layoutId: string; layout: LayoutDocument } | null; assignedBeacons?: AssignedBeacon[] }) {
  const [refresh, setRefresh] = useState(0);
  const [requestedView, setRequestedView] = useState<"current" | "draft">("current");
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

  const view = requestedView === "draft" && draft ? "draft" : "current";
  const displayed = view === "draft" && draft
    ? { layout: draft.layout, layoutId: draft.layoutId, source: "DRAFT", fallback: false }
    : current;
  const elements = displayed ? safeElements(displayed.layout) : [];
  const issues = displayed ? validateLayout(displayed.layout, assignedBeacons) : [];
  const beaconIssues = issues.filter((issue) => issue.code.startsWith("beacon-")).length;
  const productIssues = issues.filter((issue) => ["metadata", "shelf-category", "shelf-section", "routing-access"].includes(issue.code)).length;
  const routingIssues = issues.filter((issue) => issue.code === "routing-access").length;
  return <section className="mobile-current-preview" aria-label="Aktuell mobiles Layout">
    <div className="mobile-current-preview-heading"><div><span className="mobile-current-preview-kicker">MOBILE-VORSCHAU · NUR LESEN</span><h2>Mobile-Vorschau</h2></div><div className="mobile-current-preview-controls"><button type="button" aria-pressed={view === "current"} onClick={() => setRequestedView("current")}>Öffentlich aktiv</button>{draft && <button type="button" aria-pressed={view === "draft"} onClick={() => setRequestedView("draft")}>Gespeicherten Entwurf ansehen</button>}<button type="button" onClick={() => setRefresh((value) => value + 1)} disabled={loading}>Aktualisieren</button></div></div>
    {loading && <p role="status">Mobiles Layout wird geladen …</p>}
    {error && !loading && <p role="alert">{error} <button type="button" onClick={() => setRefresh((value) => value + 1)}>Erneut versuchen</button></p>}
    {displayed && !loading && !error && <div className="mobile-current-preview-content">
      <div className="mobile-current-preview-map"><svg viewBox={`0 0 ${displayed.layout.gridSize.width} ${displayed.layout.gridSize.height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${view === "draft" ? "Gespeicherter Entwurf" : "Aktuell mobiles Layout"} mit ${elements.length} Elementen`}>
        <rect x={0} y={0} width={displayed.layout.gridSize.width} height={displayed.layout.gridSize.height} fill="#f8faf7" stroke="#c7d6d0" strokeWidth={0.2} />
        {elements.map((element, index) => {
          const width = element.width ?? 0;
          const height = element.height ?? 0;
          const rotation = element.rotation ?? 0;
          return element.type === "beacon"
            ? <circle key={`${element.id ?? index}`} cx={element.x} cy={element.y} r={0.5} fill={elementFill(element, "#b6635f")} />
            : <rect key={`${element.id ?? index}`} x={element.x} y={element.y} width={width} height={height} rx={0.2} transform={`rotate(${rotation} ${element.x + width / 2} ${element.y + height / 2})`} fill={elementFill(element, element.type === "entrance" ? "#3b9a81" : "#628b91")} />;
        })}
      </svg></div>
      <div className="mobile-current-preview-facts"><strong>{view === "draft" ? "Gespeicherter Entwurf · nicht öffentlich" : displayed.fallback ? "Standardlayout (Fallback)" : "Aktive Version"}</strong><span>{displayed.layout.shopName}</span><dl><div><dt>Quelle</dt><dd>{displayed.source}</dd></div><div><dt>Layout-ID</dt><dd>{displayed.layoutId ?? "Keine aktive Version"}</dd></div><div><dt>Elemente</dt><dd>{elements.length}</dd></div><div><dt>Raster</dt><dd>{displayed.layout.gridSize.width} × {displayed.layout.gridSize.height}</dd></div><div><dt>Beacons</dt><dd>{beaconIssues ? `${beaconIssues} ungeklärte Hinweise` : "Keine editorseitigen Konflikte"}</dd></div><div><dt>Produktpositionen</dt><dd>{productIssues ? `${productIssues} ungeklärte Hinweise` : "Keine editorseitigen Konflikte"}</dd></div><div><dt>Routing</dt><dd>{routingIssues ? `${routingIssues} Zugänge manuell prüfen` : "Mobile Route nicht geprüft"}</dd></div></dl><p>{view === "draft" ? "Diese Vorschau zeigt die gespeicherte Entwurfsversion. Kunden sehen weiterhin die öffentliche Version, bis du veröffentlichst." : "Diese Ansicht wird direkt vom öffentlichen Mobile-Endpunkt geladen. Gespeicherte Entwürfe erscheinen hier erst nach der Veröffentlichung."}</p></div>
    </div>}
  </section>;
}
