import { useEffect, useMemo, useState } from "react";
import { ApiClientError, type ApiClient } from "./api/client";
import type { CurrentUser } from "./routes";
import {
  ACCESS_ASSIGNMENTS_PATH,
  accessListPath,
  accessPayload,
  accessRoles,
  blankAccessDraft,
  canManageAccess,
  roleLabel,
  scopeLabel,
  validateAccessDraft,
  type AccessAssignment,
  type AccessDraft,
  type AccessRole,
  type AccessStatusFilter
} from "./accessAssignments";

interface RegionOption { id: string; code: string; name: string }
interface StoreOption { id: string; storeCode: string; name: string; region: { id: string; name: string } | null }

const STORE_PAGE_SIZE = 100;
const MAX_STORE_PAGES = 20;

function friendlyError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  return "Die Anfrage ist fehlgeschlagen. Bitte erneut versuchen.";
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function loadActiveStores(api: ApiClient, signal: AbortSignal): Promise<StoreOption[]> {
  const stores: StoreOption[] = [];
  for (let page = 0; page < MAX_STORE_PAGES; page++) {
    const result = await api.get<{ content: StoreOption[]; totalElements: number }>(`/api/stores?status=ACTIVE&page=${page}&size=${STORE_PAGE_SIZE}`, { signal });
    if (!Array.isArray(result?.content)) throw new Error("Store-Antwort ist unvollständig.");
    stores.push(...result.content);
    if (result.content.length < STORE_PAGE_SIZE || stores.length >= result.totalElements) break;
  }
  return stores.sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/** "Zugänge": admin-only page that replaces the SQL insert into user_access_assignments. */
export function AccessAssignmentsPage({ api, user }: { api: ApiClient; user: CurrentUser }) {
  const canManage = canManageAccess(user.role);
  const [status, setStatus] = useState<AccessStatusFilter>("ACTIVE");
  const [query, setQuery] = useState("");
  const [assignments, setAssignments] = useState<AccessAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [reload, setReload] = useState(0);
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [optionsError, setOptionsError] = useState("");
  const [draft, setDraft] = useState<AccessDraft>(blankAccessDraft);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState("");

  useEffect(() => {
    if (!canManage) return;
    const controller = new AbortController();
    setLoading(true);
    setListError("");
    api.get<AccessAssignment[]>(accessListPath(status), { signal: controller.signal })
      .then((result) => {
        if (!Array.isArray(result)) throw new Error("Zugangsliste ist keine Liste.");
        setAssignments(result);
      })
      .catch((error: unknown) => { if (!isAbort(error)) setListError(friendlyError(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, canManage, reload, status]);

  useEffect(() => {
    if (!canManage) return;
    const controller = new AbortController();
    setOptionsError("");
    Promise.all([
      api.get<RegionOption[]>("/api/regions?status=ACTIVE", { signal: controller.signal }),
      loadActiveStores(api, controller.signal)
    ]).then(([regionList, storeList]) => {
      setRegions(Array.isArray(regionList) ? [...regionList].sort((a, b) => a.name.localeCompare(b.name, "de")) : []);
      setStores(storeList);
    }).catch((error: unknown) => { if (!isAbort(error)) setOptionsError(`Märkte und Regionen konnten nicht geladen werden. ${friendlyError(error)}`); });
    return () => controller.abort();
  }, [api, canManage]);

  const visibleAssignments = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return assignments;
    return assignments.filter((assignment) => `${assignment.username} ${assignment.email ?? ""} ${assignment.keycloakSubject} ${scopeLabel(assignment)}`.toLocaleLowerCase().includes(normalized));
  }, [assignments, query]);

  function update(patch: Partial<AccessDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function createAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateAccessDraft(draft);
    setFieldErrors(errors);
    setFormError("");
    setNotice("");
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const created = await api.post<AccessAssignment>(ACCESS_ASSIGNMENTS_PATH, accessPayload(draft));
      setNotice(`Zugang für „${created.username}“ angelegt: ${roleLabel(created.role)}, ${scopeLabel(created)}. Die Person meldet sich neu an und sieht dann nur diesen Bereich.`);
      setDraft(blankAccessDraft());
      setFieldErrors({});
      setReload((current) => current + 1);
    } catch (error) {
      setFormError(friendlyError(error));
      if (error instanceof ApiClientError) {
        const mapped: Record<string, string> = {};
        for (const [field, messages] of Object.entries(error.fieldErrors)) {
          const key = field.split(".").pop() ?? field;
          if (messages[0]) mapped[key] = messages[0];
        }
        setFieldErrors(mapped);
      }
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(assignment: AccessAssignment) {
    if (deactivatingId) return;
    if (!window.confirm(`Zugang von ${assignment.username} (${scopeLabel(assignment)}) deaktivieren? Die Person verliert sofort den Zugriff auf die Administration.`)) return;
    setDeactivatingId(assignment.id);
    setRowError("");
    setNotice("");
    try {
      const updated = await api.request<AccessAssignment>(`${ACCESS_ASSIGNMENTS_PATH}/${encodeURIComponent(assignment.id)}/deactivate`, { method: "PATCH", json: {} });
      setNotice(`Zugang von „${updated.username}“ wurde deaktiviert.`);
      setReload((current) => current + 1);
    } catch (error) {
      setRowError(friendlyError(error));
    } finally {
      setDeactivatingId(null);
    }
  }

  if (!canManage) {
    return <section role="alert" className="notice"><h2>Zugriff verweigert</h2><p>Zugänge können nur Administratoren vergeben.</p></section>;
  }

  const fieldProps = (name: keyof AccessDraft) => ({
    id: `access-${name}`,
    name,
    "aria-invalid": !!fieldErrors[name],
    "aria-describedby": fieldErrors[name] ? `access-${name}-error` : undefined
  });
  const fieldError = (name: keyof AccessDraft) => fieldErrors[name] && <small id={`access-${name}-error`} role="alert">{fieldErrors[name]}</small>;

  return <section className="regions-page access-page" aria-labelledby="access-title">
    <div className="page-heading">
      <div>
        <h2 id="access-title">Zugänge</h2>
        <p>Keycloak-Benutzer einer Rolle und einem Markt oder einer Region zuordnen. Den Benutzer selbst und seine Realm-Rolle legen Sie weiter in der Keycloak-Konsole an.</p>
      </div>
    </div>

    {notice && <p role="status" className="notice success">{notice}</p>}

    <div className="region-workspace">
      <section className="panel" aria-labelledby="access-list-title">
        <div className="panel-header"><h3 id="access-list-title">Übersicht</h3><span>{visibleAssignments.length} Zugänge</span></div>
        <div className="filters">
          <label>Suche<input type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Name, E-Mail, sub oder Markt" /></label>
          <label>Status<select value={status} onChange={(event) => setStatus(event.currentTarget.value as AccessStatusFilter)}>
            <option value="ACTIVE">Aktiv</option><option value="DISABLED">Deaktiviert</option><option value="ALL">Alle</option>
          </select></label>
        </div>
        {rowError && <p role="alert" className="notice error">{rowError}</p>}
        {loading && <p role="status">Zugänge werden geladen …</p>}
        {listError && <div role="alert" className="notice"><p>{listError}</p><button type="button" onClick={() => setReload((current) => current + 1)}>Erneut laden</button></div>}
        {!loading && !listError && visibleAssignments.length === 0 && <p className="empty-state">{query ? "Kein Zugang passt zur Suche." : "Keine Zugänge in diesem Status."}</p>}
        {!loading && !listError && visibleAssignments.length > 0 && <div className="table-scroll"><table>
          <thead><tr><th>Benutzer</th><th>Rolle</th><th>Bereich</th><th>Status</th><th>Aktion</th></tr></thead>
          <tbody>{visibleAssignments.map((assignment) => {
            const own = assignment.keycloakSubject === user.subject;
            return <tr key={assignment.id}>
              <td><strong>{assignment.username}</strong>{assignment.email && <><br /><span>{assignment.email}</span></>}<br /><code className="subject">{assignment.keycloakSubject}</code></td>
              <td>{roleLabel(assignment.role)}</td>
              <td>{scopeLabel(assignment)}</td>
              <td><span className={`status-pill ${assignment.status === "ACTIVE" ? "ready" : "missing"}`}>{assignment.status === "ACTIVE" ? "Aktiv" : "Deaktiviert"}</span></td>
              <td>{assignment.status === "ACTIVE" && (own
                ? <span>Eigener Zugang</span>
                : <button type="button" className="danger" onClick={() => void deactivate(assignment)} disabled={deactivatingId !== null} aria-label={`Zugang von ${assignment.username} deaktivieren`}>{deactivatingId === assignment.id ? "Deaktiviert …" : "Deaktivieren"}</button>)}</td>
            </tr>;
          })}</tbody>
        </table></div>}
      </section>

      <div className="region-detail-column">
        <section className="panel" aria-labelledby="access-form-title">
          <div className="panel-header"><h3 id="access-form-title">Zugang anlegen</h3></div>
          <p>Die Keycloak-ID (<code>sub</code>) zeigt die Administration einer angemeldeten Person ohne Zugang auf der Seite „Zugriff verweigert“. Sie steht auch in der Keycloak-Konsole unter Users → ID.</p>
          {optionsError && <p role="alert" className="notice error">{optionsError}</p>}
          {formError && <p role="alert" className="notice error">{formError}</p>}
          <form className="stack" onSubmit={createAssignment} noValidate>
            <label htmlFor="access-keycloakSubject">Keycloak-ID (sub)</label>
            <input {...fieldProps("keycloakSubject")} required maxLength={120} autoComplete="off" spellCheck={false} value={draft.keycloakSubject} onChange={(event) => update({ keycloakSubject: event.currentTarget.value })} placeholder="z. B. 6d1f0c2e-1b7a-4c55-9a0e-3f3b8d2a9e11" />
            {fieldError("keycloakSubject")}
            <label htmlFor="access-username">Benutzername</label>
            <input {...fieldProps("username")} required maxLength={120} autoComplete="off" value={draft.username} onChange={(event) => update({ username: event.currentTarget.value })} placeholder="Benutzername aus Keycloak" />
            {fieldError("username")}
            <label htmlFor="access-email">E-Mail <span>(optional)</span></label>
            <input {...fieldProps("email")} type="email" maxLength={254} autoComplete="off" value={draft.email} onChange={(event) => update({ email: event.currentTarget.value })} />
            {fieldError("email")}
            <label htmlFor="access-role">Rolle</label>
            <select {...fieldProps("role")} value={draft.role} onChange={(event) => update({ role: event.currentTarget.value as AccessRole })}>
              {accessRoles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
            </select>
            {fieldError("role")}
            {draft.role === "store-manager" && <>
              <label htmlFor="access-storeId">Markt</label>
              <select {...fieldProps("storeId")} required value={draft.storeId} onChange={(event) => update({ storeId: event.currentTarget.value })}>
                <option value="">Markt wählen …</option>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.name} ({store.storeCode}){store.region ? ` – ${store.region.name}` : ""}</option>)}
              </select>
              {fieldError("storeId")}
            </>}
            {draft.role === "region-manager" && <>
              <label htmlFor="access-regionId">Region</label>
              <select {...fieldProps("regionId")} required value={draft.regionId} onChange={(event) => update({ regionId: event.currentTarget.value })}>
                <option value="">Region wählen …</option>
                {regions.map((region) => <option key={region.id} value={region.id}>{region.name} ({region.code})</option>)}
              </select>
              {fieldError("regionId")}
            </>}
            {draft.role === "admin" && <p className="notice">Ein Administrator sieht alle Regionen und Märkte und kann Zugänge vergeben.</p>}
            <p>Die Rolle muss auch in Keycloak als Realm-Rolle zugewiesen sein, sonst bleibt der Zugriff verweigert.</p>
            <div className="toolbar"><button type="submit" className="primary" disabled={saving}>{saving ? "Speichert …" : "Zugang anlegen"}</button></div>
          </form>
        </section>
      </div>
    </div>
  </section>;
}
