import { useEffect, useMemo, useState } from "react";
import { ApiClientError, type ApiClient } from "./api/client";
import type { CurrentUser } from "./routes";

export interface Region {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
}

export interface RegionDraft {
  code: string;
  name: string;
  description: string;
}

export function canReadRegions(role: string): boolean {
  return role === "admin" || role === "region-manager";
}

export function canManageRegions(role: string): boolean {
  return role === "admin";
}

export function regionListPath(status: "ACTIVE" | "ARCHIVED"): string {
  return `/api/regions?status=${status}`;
}

export function validateRegionDraft(draft: RegionDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.code.trim()) errors.code = "Code ist erforderlich.";
  else if (draft.code.trim().length > 50) errors.code = "Der Code darf höchstens 50 Zeichen enthalten.";
  if (!draft.name.trim()) errors.name = "Name ist erforderlich.";
  else if (draft.name.trim().length > 120) errors.name = "Der Name darf höchstens 120 Zeichen enthalten.";
  if (draft.description.length > 2000) errors.description = "Die Beschreibung darf höchstens 2000 Zeichen enthalten.";
  return errors;
}

export function regionPayload(draft: RegionDraft): RegionDraft {
  return {
    code: draft.code.trim(),
    name: draft.name.trim(),
    description: draft.description.trim()
  };
}

const blankDraft = (): RegionDraft => ({ code: "", name: "", description: "" });

function draftFromRegion(region: Region): RegionDraft {
  return { code: region.code, name: region.name, description: region.description ?? "" };
}

function friendlyError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  return "Die Anfrage ist fehlgeschlagen. Bitte erneut versuchen.";
}

export function RegionsPage({ api, user }: { api: ApiClient; user: CurrentUser }) {
  const [status, setStatus] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const [query, setQuery] = useState("");
  const [regions, setRegions] = useState<Region[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Region | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RegionDraft>(blankDraft);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [listError, setListError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [archiveError, setArchiveError] = useState("");
  const [archivedNotice, setArchivedNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [reload, setReload] = useState(0);
  const canRead = canReadRegions(user.role);
  const canManage = canManageRegions(user.role);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setListError("");
    api.get<Region[]>(regionListPath(status), { signal: controller.signal })
      .then((result) => {
        if (!Array.isArray(result)) throw new Error("Regions response is not a list");
        setRegions(result);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setListError(friendlyError(error));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, canRead, reload, status]);

  useEffect(() => {
    if (!canRead || !selectedId) {
      setDetail(null);
      setDetailError("");
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError("");
    setDetail(null);
    api.get<Region>(`/api/regions/${encodeURIComponent(selectedId)}`, { signal: controller.signal })
      .then(setDetail)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDetailError(friendlyError(error));
      })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [api, canRead, selectedId, reload]);

  const visibleRegions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return regions;
    return regions.filter((region) => `${region.code} ${region.name}`.toLocaleLowerCase().includes(normalized));
  }, [query, regions]);

  function startCreate() {
    setSelectedId(null);
    setDetail(null);
    setEditing(true);
    setDraft(blankDraft());
    setFieldErrors({});
    setFormError("");
    setArchiveError("");
  }

  function startEdit() {
    if (!detail) return;
    setEditing(true);
    setDraft(draftFromRegion(detail));
    setFieldErrors({});
    setFormError("");
  }

  function cancelEdit() {
    setEditing(false);
    setFieldErrors({});
    setFormError("");
    if (!detail) setDraft(blankDraft());
  }

  async function saveRegion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateRegionDraft(draft);
    setFieldErrors(errors);
    setFormError("");
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const payload = regionPayload(draft);
      const saved = detail
        ? await api.put<Region>(`/api/regions/${encodeURIComponent(detail.id)}`, payload)
        : await api.post<Region>("/api/regions", payload);
      setEditing(false);
      setDetail(saved);
      setSelectedId(saved.id);
      setArchivedNotice("");
      setReload((current) => current + 1);
    } catch (error) {
      setFormError(friendlyError(error));
      if (error instanceof ApiClientError) {
        const mapped: Record<string, string> = {};
        for (const [field, messages] of Object.entries(error.fieldErrors)) {
          if (messages[0]) mapped[field] = messages[0];
        }
        setFieldErrors(mapped);
      }
    } finally {
      setSaving(false);
    }
  }

  async function archiveRegion() {
    if (!detail || !canManage || archiving) return;
    const confirmed = window.confirm(`Region ${detail.name} archivieren? Bestehende Stores bleiben historisch sichtbar.`);
    if (!confirmed) return;
    setArchiving(true);
    setArchiveError("");
    try {
      const archived = await api.request<Region>(`/api/regions/${encodeURIComponent(detail.id)}/archive`, { method: "PATCH", json: {} });
      setDetail(archived);
      setArchivedNotice(`Region „${archived.name}“ wurde archiviert.`);
      setReload((current) => current + 1);
    } catch (error) {
      setArchiveError(friendlyError(error));
    } finally {
      setArchiving(false);
    }
  }

  if (!canRead) {
    return <section role="alert" className="notice"><h2>Zugriff verweigert</h2><p>Regionen sind nur für Administratoren und Regionsmanager verfügbar.</p></section>;
  }

  return <section className="regions-page" aria-labelledby="regions-title">
    <div className="page-heading">
      <div><h2 id="regions-title">Regionen</h2><p>Regionen und ihre Zuständigkeiten verwalten.</p></div>
      {canManage && <button type="button" className="primary" onClick={startCreate}>Region anlegen</button>}
    </div>

    {archivedNotice && <p role="status" className="notice success">{archivedNotice}</p>}

    <div className="region-workspace">
      <section className="panel" aria-labelledby="region-list-title">
        <div className="panel-header"><h3 id="region-list-title">Übersicht</h3><span>{visibleRegions.length} Regionen</span></div>
        <div className="filters">
          <label>Suche<input type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Code oder Name" /></label>
          <label>Status<select value={status} onChange={(event) => setStatus(event.currentTarget.value as "ACTIVE" | "ARCHIVED")}>
            <option value="ACTIVE">Aktiv</option><option value="ARCHIVED">Archiviert</option>
          </select></label>
        </div>
        {loading && <p role="status">Regionen werden geladen …</p>}
        {listError && <div role="alert" className="notice"><p>{listError}</p><button type="button" onClick={() => setReload((current) => current + 1)}>Erneut laden</button></div>}
        {!loading && !listError && visibleRegions.length === 0 && <p className="empty-state">{query ? "Keine Region passt zur Suche." : "Keine Regionen in diesem Status."}</p>}
        {!loading && !listError && visibleRegions.length > 0 && <div className="table-scroll"><table>
          <thead><tr><th>Code</th><th>Name</th><th>Status</th><th>Aktion</th></tr></thead>
          <tbody>{visibleRegions.map((region) => <tr key={region.id}>
            <td><code>{region.code}</code></td><td>{region.name}</td><td><span className={`status-pill ${region.status === "ACTIVE" ? "ready" : "missing"}`}>{region.status === "ACTIVE" ? "Aktiv" : "Archiviert"}</span></td>
            <td><button type="button" className="text-button" onClick={() => { setEditing(false); setSelectedId(region.id); setArchiveError(""); }}>Details</button></td>
          </tr>)}</tbody>
        </table></div>}
      </section>

      <div className="region-detail-column">
        {editing && canManage && <section className="panel" aria-labelledby="region-form-title">
          <div className="panel-header"><h3 id="region-form-title">{detail ? "Region bearbeiten" : "Region anlegen"}</h3></div>
          {formError && <p role="alert" className="notice error">{formError}</p>}
          <form className="stack" onSubmit={saveRegion} noValidate>
            <label htmlFor="region-code">Code</label>
            <input id="region-code" name="code" required maxLength={50} value={draft.code} aria-invalid={!!fieldErrors.code} aria-describedby={fieldErrors.code ? "region-code-error" : undefined} onChange={(event) => setDraft({ ...draft, code: event.currentTarget.value })} placeholder="AT-OÖ" />
            {fieldErrors.code && <small id="region-code-error" role="alert">{fieldErrors.code}</small>}
            <label htmlFor="region-name">Name</label>
            <input id="region-name" name="name" required maxLength={120} value={draft.name} aria-invalid={!!fieldErrors.name} aria-describedby={fieldErrors.name ? "region-name-error" : undefined} onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })} placeholder="Oberösterreich" />
            {fieldErrors.name && <small id="region-name-error" role="alert">{fieldErrors.name}</small>}
            <label htmlFor="region-description">Beschreibung <span>(optional)</span></label>
            <textarea id="region-description" name="description" maxLength={2000} rows={4} value={draft.description} aria-invalid={!!fieldErrors.description} aria-describedby={fieldErrors.description ? "region-description-error" : undefined} onChange={(event) => setDraft({ ...draft, description: event.currentTarget.value })} />
            {fieldErrors.description && <small id="region-description-error" role="alert">{fieldErrors.description}</small>}
            <div className="toolbar"><button type="submit" className="primary" disabled={saving}>{saving ? "Speichert …" : "Speichern"}</button><button type="button" onClick={cancelEdit} disabled={saving}>Abbrechen</button></div>
          </form>
        </section>}

        {!editing && <section className="panel" aria-labelledby="region-detail-title">
          <div className="panel-header"><h3 id="region-detail-title">Details</h3></div>
          {!selectedId && <p className="empty-state">Wählen Sie eine Region aus der Übersicht aus.</p>}
          {detailLoading && <p role="status">Details werden geladen …</p>}
          {detailError && <div role="alert" className="notice"><p>{detailError}</p><button type="button" onClick={() => setReload((current) => current + 1)}>Erneut laden</button></div>}
          {detail && !detailLoading && <>
            <dl className="detail-list"><dt>Code</dt><dd><code>{detail.code}</code></dd><dt>Name</dt><dd>{detail.name}</dd><dt>Beschreibung</dt><dd>{detail.description || "Keine Beschreibung"}</dd><dt>Status</dt><dd>{detail.status === "ACTIVE" ? "Aktiv" : "Archiviert"}</dd></dl>
            {canManage && detail.status === "ACTIVE" && <div className="toolbar"><button type="button" onClick={startEdit}>Bearbeiten</button><button type="button" className="danger" onClick={archiveRegion} disabled={archiving}>{archiving ? "Archiviert …" : "Archivieren"}</button></div>}
            {archiveError && <p role="alert" className="notice error">{archiveError}</p>}
          </>}
        </section>}
      </div>
    </div>
  </section>;
}
