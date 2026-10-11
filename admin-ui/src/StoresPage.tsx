import { useEffect, useState } from "react";
import type { ApiClient } from "./api/client";

interface Region { id: string; code: string; name: string }
interface StoreSummary {
  id: string; storeCode: string; name: string; city: string | null; status: string;
  region: Region | null; activeBeaconCount: number; hasActiveLayout: boolean;
}
interface StorePageResponse { content: StoreSummary[]; page: number; size: number; totalElements: number }

export interface StoreQuery { query: string; regionId: string; status: string; layout: string; page: number }

export function readStoreQuery(search: string): StoreQuery {
  const params = new URLSearchParams(search);
  const page = Number(params.get("page"));
  const status = params.get("status") ?? "ACTIVE";
  const layout = params.get("layout") ?? "";
  return {
    query: (params.get("query") ?? "").slice(0, 120),
    regionId: params.get("regionId") ?? "",
    status: status === "ARCHIVED" ? status : "ACTIVE",
    layout: layout === "ready" || layout === "missing" ? layout : "",
    page: Number.isInteger(page) && page > 0 ? page : 0
  };
}

export function storeQueryString(query: StoreQuery): string {
  const params = new URLSearchParams();
  if (query.query) params.set("query", query.query);
  if (query.regionId) params.set("regionId", query.regionId);
  if (query.status !== "ACTIVE") params.set("status", query.status);
  if (query.layout) params.set("layout", query.layout);
  if (query.page) params.set("page", String(query.page));
  return params.toString();
}

export function storeApiPath(query: StoreQuery): string {
  const params = new URLSearchParams({ page: String(query.page), size: "20", status: query.status });
  if (query.query) params.set("query", query.query);
  if (query.regionId) params.set("regionId", query.regionId);
  if (query.layout) params.set("hasActiveLayout", String(query.layout === "ready"));
  return `/api/stores?${params.toString()}`;
}

export function StoresPage({ api }: { api: ApiClient }) {
  const query = readStoreQuery(window.location.search);
  const [page, setPage] = useState<StorePageResponse | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api.get<StorePageResponse>(storeApiPath(query), { signal: controller.signal }),
      api.get<Region[]>("/api/regions", { signal: controller.signal })
    ]).then(([result, regionList]) => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(result?.content) || !Number.isFinite(result.totalElements) || !Array.isArray(regionList)) throw new Error("Store-Daten sind unvollständig.");
      setPage(result);
      setRegions(regionList);
      setError(null);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Stores konnten nicht geladen werden.");
    });
    return () => controller.abort();
  }, [api, revision]);

  const totalPages = page ? Math.ceil(page.totalElements / Math.max(1, page.size)) : 0;
  const pageLink = (next: number) => `/admin/next/stores/${storeQueryString({ ...query, page: next }) ? `?${storeQueryString({ ...query, page: next })}` : ""}`;
  return <div className="stores-page">
    <div className="page-intro"><div><p className="eyebrow">Standorte</p><h2>Stores</h2><p>Filialen, Beacons und Layout-Status im aktuellen Zugriff.</p></div><a className="button" href="/admin/stores/">Store verwalten</a></div>
    <form className="notice store-filters" action="/admin/next/stores/" method="get" role="search">
      <label>Suche<input type="search" name="query" defaultValue={query.query} placeholder="Name, Code oder Ort" /></label>
      <label>Region<select key={regions.length} name="regionId" defaultValue={query.regionId}><option value="">Alle Regionen</option>{regions.map((region) => <option key={region.id} value={region.id}>{region.code} · {region.name}</option>)}</select></label>
      <label>Status<select name="status" defaultValue={query.status}><option value="ACTIVE">Aktiv</option><option value="ARCHIVED">Archiviert</option></select></label>
      <label>Layout<select name="layout" defaultValue={query.layout}><option value="">Alle</option><option value="ready">Aktiv</option><option value="missing">Fehlt</option></select></label>
      <button className="button primary" type="submit">Anwenden</button>
    </form>
    {error && <div className="notice error-state" role="alert"><h3>Stores konnten nicht geladen werden</h3><p>{error}</p><button className="button" onClick={() => setRevision((value) => value + 1)}>Erneut versuchen</button></div>}
    {!page && !error && <div className="notice" role="status">Stores werden geladen …</div>}
    {page && !error && <section className="notice store-results" aria-label="Store-Ergebnisse">
      <div className="section-heading"><h3>{page.totalElements.toLocaleString("de-AT")} Stores</h3><span>Seite {page.page + 1} von {Math.max(1, totalPages)}</span></div>
      {page.content.length === 0 ? <p>Keine Stores passen zu den Filtern.</p> : <div className="table-scroll"><table><thead><tr><th>Store</th><th>Region</th><th>Ort</th><th>Beacons</th><th>Layout</th><th>Aktionen</th></tr></thead><tbody>{page.content.map((store) => <tr key={store.id}>
        <td><strong>{store.name}</strong><small>{store.storeCode}</small></td><td>{store.region?.name ?? "–"}</td><td>{store.city || "–"}</td><td>{store.activeBeaconCount}</td><td><span className={`status-pill ${store.hasActiveLayout ? "ready" : "missing"}`}>{store.hasActiveLayout ? "Aktiv" : "Fehlt"}</span></td><td><div className="row-actions"><a href={`/admin/next/stores/detail/?storeId=${encodeURIComponent(store.id)}`}>Details</a><a href={`/admin/next/editor/?storeId=${encodeURIComponent(store.id)}`}>Editor</a></div></td>
      </tr>)}</tbody></table></div>}
      <div className="pager"><span>{page.totalElements ? `${page.page * page.size + 1}–${Math.min((page.page + 1) * page.size, page.totalElements)} von ${page.totalElements}` : "0 Ergebnisse"}</span><div>{page.page > 0 && <a className="button" href={pageLink(page.page - 1)}>Zurück</a>}{page.page + 1 < totalPages && <a className="button" href={pageLink(page.page + 1)}>Weiter</a>}</div></div>
    </section>}
  </div>;
}
