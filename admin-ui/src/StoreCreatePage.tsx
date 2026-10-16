import { useEffect, useState, type FormEvent } from "react";
import { ApiClientError, type ApiClient } from "./api/client";
import type { CurrentUser } from "./routes";

interface Region { id: string; code: string; name: string; status: string }
interface CreatedStore { id: string; name: string }

export function StoreCreatePage({ api, user }: { api: ApiClient; user: CurrentUser }) {
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreatedStore | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (user.role === "store-manager") return;
    const controller = new AbortController();
    setLoading(true);
    api.get<Region[]>("/api/regions?status=ACTIVE", { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { if (!Array.isArray(result)) throw new Error("Regionen sind unvollständig."); setRegions(result); setLoadError(null); } })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "Regionen konnten nicht geladen werden."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, user.role, revision]);

  if (user.role === "store-manager") return <section role="alert" className="notice"><h2>Zugriff verweigert</h2><p>Store-Manager können keine neue Filiale anlegen.</p></section>;
  if (created) return <section className="notice success-state" role="status"><h2>Store angelegt</h2><p>{created.name} wurde gespeichert.</p><a className="button primary" href={`/admin/next/stores/detail/?storeId=${encodeURIComponent(created.id)}`}>Store-Detail öffnen</a></section>;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const latitude = String(form.get("latitude") ?? "").trim();
    const longitude = String(form.get("longitude") ?? "").trim();
    setSaving(true); setError(null); setFieldErrors({});
    try {
      const response = await api.post<CreatedStore>("/api/stores", {
        regionId: String(form.get("regionId")), storeCode: String(form.get("storeCode")).trim(), name: String(form.get("name")).trim(),
        street: String(form.get("street")).trim(), zipCode: String(form.get("zipCode")).trim(), city: String(form.get("city")).trim(), country: String(form.get("country")).trim(),
        latitude: latitude ? Number(latitude) : null, longitude: longitude ? Number(longitude) : null,
        notes: String(form.get("notes") ?? "").trim() || null
      });
      if (!response?.id) throw new Error("Server hat keinen Store bestätigt.");
      setCreated(response);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Store konnte nicht angelegt werden.");
      if (cause instanceof ApiClientError) setFieldErrors(cause.fieldErrors);
    } finally { setSaving(false); }
  };
  return <div className="store-create-page">
    <div className="page-intro"><div><p className="eyebrow">Standorte</p><h2>Store anlegen</h2><p>Stammdaten erfassen, danach Beacons zuordnen und Layout erstellen.</p></div><a className="button" href="/admin/next/stores/">Zurück zur Liste</a></div>
    {loadError && <div className="notice error-state" role="alert"><p>{loadError}</p><button className="button" onClick={() => setRevision((value) => value + 1)}>Erneut versuchen</button></div>}
    {loading && <p className="notice" role="status">Regionen werden geladen …</p>}
    {!loading && !loadError && regions.length === 0 && <p className="notice" role="status">{user.role === "region-manager" ? "Keine aktive Region in Ihrer Zuständigkeit vorhanden." : "Keine aktiven Regionen vorhanden. Bitte zuerst eine Region anlegen."}</p>}
    {!loading && !loadError && regions.length > 0 && <form className="notice detail-form" onSubmit={submit}>
      {error && <p className="full error-state" role="alert">{error}</p>}
      <label>Region<select name="regionId" required defaultValue={user.role === "region-manager" ? user.scope?.regionId ?? regions[0].id : regions[0].id} disabled={user.role === "region-manager"}>{regions.map((region) => <option key={region.id} value={region.id}>{region.code} · {region.name}</option>)}</select>{user.role === "region-manager" && <input type="hidden" name="regionId" value={user.scope?.regionId ?? regions[0].id} />}{fieldErrors.regionId && <small role="alert">{fieldErrors.regionId.join(" ")}</small>}</label>
      {([ ["storeCode", "Store-Code", 50], ["name", "Name", 150], ["street", "Straße", 150], ["zipCode", "PLZ", 20], ["city", "Ort", 100], ["country", "Land", 100] ] as const).map(([name, label, max]) => <label key={name}>{label}<input name={name} maxLength={max} required />{fieldErrors[name] && <small role="alert">{fieldErrors[name].join(" ")}</small>}</label>)}
      <label>Breitengrad<input name="latitude" type="number" step="any" min="-90" max="90" /></label><label>Längengrad<input name="longitude" type="number" step="any" min="-180" max="180" /></label>
      <label className="full">Notizen<textarea name="notes" rows={3} maxLength={2000} /></label>
      <div className="form-actions"><button className="button primary" type="submit" disabled={saving}>{saving ? "Legt an …" : "Store anlegen"}</button></div>
    </form>}
  </div>;
}
