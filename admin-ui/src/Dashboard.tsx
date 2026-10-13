import { useCallback, useEffect, useState } from "react";
import { ApiClientError, type ApiClient } from "./api/client";
import type { CurrentUser } from "./routes";

interface StorePage { totalElements: number }
interface Region { id: string }
interface Beacon { id: string }
interface AuditEntry { id: string; action: string; summary: string | null; createdAt: string }
interface AuditResponse { entries: AuditEntry[] }

export interface DashboardSummary {
  regions: number;
  stores: number;
  storesWithoutLayout: number;
  freeBeacons: number;
  activity: AuditEntry[];
}

export async function loadDashboardSummary(api: ApiClient, user: CurrentUser, signal?: AbortSignal): Promise<DashboardSummary> {
  const options = { signal };
  const [regions, stores, withoutLayout, freeBeacons, activity] = await Promise.all([
    api.get<Region[]>("/api/regions", options),
    api.get<StorePage>("/api/stores?size=1", options),
    api.get<StorePage>("/api/stores?size=1&hasActiveLayout=false", options),
    api.get<Beacon[]>("/api/beacons/free", options),
    user.role === "admin" ? api.get<AuditResponse>("/api/admin/logs?limit=8", options) : Promise.resolve({ entries: [] })
  ]);
  if (!Array.isArray(regions) || !Array.isArray(freeBeacons) || !Number.isFinite(stores?.totalElements) || !Number.isFinite(withoutLayout?.totalElements) || !Array.isArray(activity?.entries)) {
    throw new ApiClientError("invalid-response", 200, "Dashboard-Daten sind unvollständig.");
  }
  return {
    regions: regions.length,
    stores: stores.totalElements,
    storesWithoutLayout: withoutLayout.totalElements,
    freeBeacons: freeBeacons.length,
    activity: activity.entries.slice(0, 8)
  };
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="metric"><span className="metric-label">{label}</span><strong>{value.toLocaleString("de-AT")}</strong><span className="metric-detail">{detail}</span></div>;
}

export function Dashboard({ api, user }: { api: ApiClient; user: CurrentUser }) {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(null);
    loadDashboardSummary(api, user, controller.signal)
      .then((summary) => { if (!controller.signal.aborted) setData(summary); })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Dashboard konnte nicht geladen werden.");
      });
    return () => controller.abort();
  }, [api, user, revision]);

  return <div className="dashboard">
    <div className="page-intro"><div><p className="eyebrow">Übersicht</p><h2>Dashboard</h2><p>Stand Ihrer sichtbaren Stores und der nächsten Einrichtungsschritte.</p></div><a className="button primary" href="/admin/next/stores/">Stores verwalten</a></div>
    {error && <div className="notice error-state" role="alert"><h3>Daten konnten nicht geladen werden</h3><p>{error}</p><button className="button" onClick={retry}>Erneut versuchen</button></div>}
    {!data && !error && <div className="notice" role="status">Dashboard wird geladen …</div>}
    {data && !error && <>
      <section className="metrics" aria-label="Kennzahlen">
        <Metric label="Regionen" value={data.regions} detail="in Ihrem Zugriff" />
        <Metric label="Stores" value={data.stores} detail="sichtbarer Scope" />
        <Metric label="Freie Beacons" value={data.freeBeacons} detail="bereit zur Zuweisung" />
        <Metric label="Layouts offen" value={data.storesWithoutLayout} detail="ohne aktives Layout" />
      </section>
      <div className="dashboard-columns">
        <section className="notice"><div className="section-heading"><h3>Einrichtung</h3><a href="/admin/next/stores/">Stores öffnen</a></div>
          {data.storesWithoutLayout === 0 && data.freeBeacons === 0 ? <p>Keine offenen Einrichtungshinweise.</p> : <ul className="warning-list">
            {data.storesWithoutLayout > 0 && <li><strong>{data.storesWithoutLayout} Stores ohne aktives Layout</strong><span>Entwurf prüfen und veröffentlichen.</span><a href="/admin/next/stores/?layout=missing">Layouts prüfen</a></li>}
            {data.freeBeacons > 0 && <li><strong>{data.freeBeacons} freie Beacons</strong><span>Position im Store zuweisen.</span><a href="/admin/next/beacons/">Beacons zuweisen</a></li>}
          </ul>}
        </section>
        <section className="notice"><div className="section-heading"><h3>Schnellzugriff</h3></div><div className="quick-links">
          <a href="/admin/next/stores/">Store verwalten</a>{user.role !== "store-manager" && <a href="/admin/next/stores/new/">Store anlegen</a>}<a href={user.role === "store-manager" && user.scope?.storeId ? `/admin/next/editor/?storeId=${encodeURIComponent(user.scope.storeId)}` : user.role === "region-manager" ? "/admin/next/stores/" : "/admin/next/editor/"}>Layout Editor öffnen</a><a href="/admin/next/beacons/">Beacons verwalten</a>
          {user.role === "admin" && <><a href="/admin/next/products/">Produkte verwalten</a><a href="/admin/next/recipes/">Rezepte verwalten</a></>}
        </div></section>
      </div>
      {user.role === "admin" && <section className="notice activity"><div className="section-heading"><h3>Letzte Aktivitäten</h3><a href="/admin/next/server-logs/">Diagnose öffnen</a></div>
        {data.activity.length === 0 ? <p>Keine Aktivitäten vorhanden.</p> : <ul>{data.activity.map((entry) => <li key={entry.id}><span>{entry.summary || entry.action}</span><time dateTime={entry.createdAt}>{new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt))}</time></li>)}</ul>}
      </section>}
    </>}
  </div>;
}
