import { useEffect, useState, type FormEvent } from "react";
import { ApiClientError, type ApiClient } from "./api/client";
import type { CurrentUser } from "./routes";

interface Region { id: string; code: string; name: string }
interface StoreDetail {
  id: string; storeCode: string; name: string; street: string; zipCode: string; city: string; country: string;
  latitude: number | null; longitude: number | null; notes: string | null; status: string;
  region: Region; activeLayout: { id: string; versionNo: number } | null;
}
interface BeaconAssignment { beaconId: string; beaconCode: string; identityKey: string; assignedAt: string; isActive?: boolean }
interface FreeBeacon { id: string; beaconCode: string; identityKey: string }
interface LayoutVersion { layoutId: string; versionNo: number; status: string; layoutName: string | null; createdAt: string; activatedAt?: string | null }
interface AuditEntry { id: string; entityType?: string; action: string; summary: string; actorLabel: string; actorRole?: string; createdAt: string }
interface StoreData { store: StoreDetail; regions: Region[]; beacons: BeaconAssignment[]; versions: LayoutVersion[]; audit: AuditEntry[]; free: FreeBeacon[] }

function formattedDate(value?: string | null): string {
  if (!value) return "–";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "–" : date.toLocaleString("de-AT");
}

export function StoreDetailPage({ api, user }: { api: ApiClient; user: CurrentUser }) {
  const storeId = new URLSearchParams(window.location.search).get("storeId");
  const [data, setData] = useState<StoreData | null>(null);
  const [error, setError] = useState<{ message: string; forbidden: boolean } | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(() => new URLSearchParams(window.location.search).get("edit") === "1");
  const [revision, setRevision] = useState(0);
  const [selectedBeacon, setSelectedBeacon] = useState("");

  useEffect(() => {
    if (!storeId) return;
    const controller = new AbortController();
    const path = `/api/stores/${encodeURIComponent(storeId)}`;
    Promise.all([
      api.get<StoreDetail>(path, { signal: controller.signal }),
      api.get<Region[]>("/api/regions", { signal: controller.signal }),
      api.get<BeaconAssignment[]>(`${path}/beacons`, { signal: controller.signal }),
      api.get<LayoutVersion[]>(`${path}/layout/versions`, { signal: controller.signal }),
      api.get<{ entries: AuditEntry[] }>(`${path}/audit`, { signal: controller.signal }),
      user.role === "store-manager" ? Promise.resolve([] as FreeBeacon[]) : api.get<FreeBeacon[]>("/api/beacons/free", { signal: controller.signal })
    ]).then(([store, regions, beacons, versions, audit, free]) => {
      if (controller.signal.aborted) return;
      if (!store?.id || !Array.isArray(regions) || !Array.isArray(beacons) || !Array.isArray(versions) || !Array.isArray(audit?.entries) || !Array.isArray(free)) throw new Error("Store-Daten sind unvollständig.");
      setData({ store, regions, beacons, versions, audit: audit.entries, free });
      setError(null);
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError({
      message: cause instanceof Error ? cause.message : "Store konnte nicht geladen werden.",
      forbidden: cause instanceof ApiClientError && cause.kind === "forbidden"
    }); });
    return () => controller.abort();
  }, [api, storeId, user.role, revision]);

  if (!storeId) return <section className="notice" role="alert"><h2>Store auswählen</h2><a href="/admin/next/stores/">Zur Store-Liste</a></section>;
  if (error) return <section className="notice error-state" role="alert"><h2>{error.forbidden ? "Zugriff verweigert" : "Store konnte nicht geladen werden"}</h2><p>{error.message}</p>{!error.forbidden && <button className="button" onClick={() => setRevision((value) => value + 1)}>Erneut versuchen</button>}</section>;
  if (!data) return <p role="status">Store wird geladen …</p>;

  const { store, regions, beacons, versions, audit, free } = data;
  const path = `/api/stores/${encodeURIComponent(store.id)}`;
  const leaveEditing = () => {
    setEditing(false);
    const url = new URL(window.location.href);
    if (url.searchParams.has("edit")) {
      url.searchParams.delete("edit");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  };
  const mutate = async (action: () => Promise<unknown>, success: string) => {
    if (busy) return;
    setBusy(true); setMutationError(null); setFieldErrors({}); setNotice(null);
    try {
      await action();
      setNotice(success);
      leaveEditing();
      setSelectedBeacon("");
      setRevision((value) => value + 1);
    } catch (cause) {
      setMutationError(cause instanceof Error ? cause.message : "Änderung fehlgeschlagen.");
      if (cause instanceof ApiClientError) setFieldErrors(cause.fieldErrors);
    } finally { setBusy(false); }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const latitude = String(form.get("latitude") ?? "").trim();
    const longitude = String(form.get("longitude") ?? "").trim();
    void mutate(() => api.put(path, {
      regionId: String(form.get("regionId")), storeCode: String(form.get("storeCode")).trim(), name: String(form.get("name")).trim(),
      street: String(form.get("street")).trim(), zipCode: String(form.get("zipCode")).trim(), city: String(form.get("city")).trim(), country: String(form.get("country")).trim(),
      latitude: latitude ? Number(latitude) : null, longitude: longitude ? Number(longitude) : null, notes: String(form.get("notes") ?? "").trim() || null
    }), "Store gespeichert.");
  };
  const canAssign = user.role !== "store-manager" && store.status === "ACTIVE";
  const canArchive = user.role === "admin" && store.status === "ACTIVE";

  return <div className="store-detail-page">
    <div className="page-intro"><div><p className="eyebrow">{store.region.code} · {store.storeCode}</p><h2>{store.name}</h2><p>{store.street}, {store.zipCode} {store.city} · {store.status === "ACTIVE" ? "Aktiv" : "Archiviert"}</p></div><div className="form-actions"><a className="button" href={`/admin/next/stores/anchors/?storeId=${encodeURIComponent(store.id)}`}>QR-Codes drucken</a><a className="button" href="/admin/next/stores/">Zur Store-Liste</a></div></div>
    {notice && <p className="notice success-state" role="status">{notice}</p>}
    {mutationError && <div className="notice error-state" role="alert"><strong>Änderung nicht gespeichert</strong><p>{mutationError}</p></div>}
    <section className="notice detail-section" aria-labelledby="store-data-title"><div className="section-heading"><h3 id="store-data-title">Stammdaten</h3>{store.status === "ACTIVE" && !editing && <button className="button" onClick={() => setEditing(true)}>Bearbeiten</button>}</div>
      {editing && store.status === "ACTIVE" ? <form key={store.id} className="detail-form" onSubmit={submit}>
        <label>Region<select name="regionId" defaultValue={store.region.id} required disabled={user.role !== "admin"}>{regions.map((region) => <option key={region.id} value={region.id}>{region.code} · {region.name}</option>)}</select>{user.role !== "admin" && <input type="hidden" name="regionId" value={store.region.id} />}{fieldErrors.regionId && <small role="alert">{fieldErrors.regionId.join(" ")}</small>}</label>
        {([ ["storeCode", "Store-Code", store.storeCode, 50], ["name", "Name", store.name, 150], ["street", "Straße", store.street, 150], ["zipCode", "PLZ", store.zipCode, 20], ["city", "Ort", store.city, 100], ["country", "Land", store.country, 100] ] as const).map(([name, label, value, max]) => <label key={name}>{label}<input name={name} defaultValue={value} maxLength={max} required />{fieldErrors[name] && <small role="alert">{fieldErrors[name].join(" ")}</small>}</label>)}
        <label>Breitengrad<input name="latitude" type="number" step="any" min="-90" max="90" defaultValue={store.latitude ?? ""} /></label><label>Längengrad<input name="longitude" type="number" step="any" min="-180" max="180" defaultValue={store.longitude ?? ""} /></label>
        <label className="full">Notizen<textarea name="notes" rows={3} maxLength={2000} defaultValue={store.notes ?? ""} /></label>
        <div className="form-actions"><button className="button primary" type="submit" disabled={busy}>{busy ? "Speichert …" : "Speichern"}</button><button className="button" type="button" onClick={() => { leaveEditing(); setMutationError(null); }}>Abbrechen</button></div>
      </form> : <dl className="detail-facts"><div><dt>Region</dt><dd>{store.region.name}</dd></div><div><dt>Land</dt><dd>{store.country}</dd></div><div><dt>Koordinaten</dt><dd>{store.latitude == null || store.longitude == null ? "Nicht gesetzt" : `${store.latitude}, ${store.longitude}`}</dd></div><div><dt>Notizen</dt><dd>{store.notes || "–"}</dd></div></dl>}
    </section>
    <section className="notice detail-section" aria-labelledby="beacons-title"><div className="section-heading"><h3 id="beacons-title">Beacons ({beacons.length})</h3></div>
      {beacons.length ? <ul className="detail-list">{beacons.map((beacon) => <li key={beacon.beaconId}><span><strong>{beacon.beaconCode}</strong><small>{beacon.identityKey} · Zugeordnet am {formattedDate(beacon.assignedAt)}</small></span><button className="button" disabled={busy} onClick={() => { if (window.confirm(`Beacon ${beacon.beaconCode} freigeben?`)) void mutate(() => api.post(`/api/beacons/${encodeURIComponent(beacon.beaconId)}/release`, {}), "Beacon freigegeben."); }}>Freigeben</button></li>)}</ul> : <p>Keine Beacons zugeordnet.</p>}
      {canAssign && <div className="inline-action"><label>Freien Beacon zuordnen<select value={selectedBeacon} onChange={(event) => setSelectedBeacon(event.target.value)}><option value="">Beacon wählen</option>{free.map((beacon) => <option key={beacon.id} value={beacon.id}>{beacon.beaconCode} · {beacon.identityKey}</option>)}</select></label><button className="button primary" disabled={busy || !selectedBeacon} onClick={() => void mutate(() => api.post(`/api/beacons/${encodeURIComponent(selectedBeacon)}/assign`, { storeId: store.id }), "Beacon zugeordnet.")}>Zuordnen</button></div>}
    </section>
    <section className="notice detail-section" aria-labelledby="layouts-title"><div className="section-heading"><h3 id="layouts-title">Layout-Versionen</h3><a className="button" href={`/admin/next/editor/?storeId=${encodeURIComponent(store.id)}`}>Layout Editor öffnen</a></div>
      <p>{store.activeLayout ? `Aktiv: Version ${store.activeLayout.versionNo}` : "Noch kein aktives Layout. Ein Entwurf kann im Editor angelegt werden."}</p>
      {versions.length > 0 && <ul className="detail-list">{versions.map((version) => <li key={version.layoutId}><span><strong>v{version.versionNo} · {version.layoutName || "Layout"} · {version.status}</strong><small>Erstellt am {formattedDate(version.createdAt)}{version.activatedAt ? ` · Aktiviert am ${formattedDate(version.activatedAt)}` : ""}</small></span><a href={`/admin/next/editor/?storeId=${encodeURIComponent(store.id)}&layoutId=${encodeURIComponent(version.layoutId)}`}>Im Editor öffnen</a></li>)}</ul>}
    </section>
    <section className="notice detail-section" aria-labelledby="audit-title"><h3 id="audit-title">Änderungsverlauf</h3>{audit.length ? <ul className="detail-list">{audit.map((entry) => <li key={entry.id}><span><strong>{entry.summary || "Änderung"}</strong><small>{[entry.entityType, entry.action, entry.actorLabel || entry.actorRole || "System"].filter(Boolean).join(" · ")}</small></span><time dateTime={entry.createdAt}>{formattedDate(entry.createdAt)}</time></li>)}</ul> : <p>Keine Änderungen protokolliert.</p>}</section>
    {canArchive && <section className="notice detail-section"><h3>Store archivieren</h3><p>Beim Archivieren werden alle Beacon-Zuordnungen freigegeben.</p><button className="button" disabled={busy} onClick={() => { if (window.confirm(`Store ${store.name} archivieren und Beacons freigeben?`)) void mutate(() => api.request(`${path}/archive`, { method: "PATCH" }), "Store archiviert."); }}>Archivieren</button></section>}
  </div>;
}
