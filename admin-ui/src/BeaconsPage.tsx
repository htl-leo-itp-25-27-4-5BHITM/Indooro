import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { DataTable } from "./DataTable";
import { ApiClientError, type ApiClient } from "./api/client";
import type { CurrentUser } from "./routes";
import { CopyableId } from "./CopyableId";
import { EmptyState } from "./EmptyState";

export interface BeaconStore {
  id: string;
  storeCode: string;
  name: string;
  status: string;
  region: { id: string; name: string } | null;
}

export interface Beacon {
  id: string;
  beaconCode: string;
  uuid: string;
  major: number | null;
  minor: number | null;
  identityKey: string;
  status: "ACTIVE" | "ARCHIVED";
  notes: string | null;
  currentStore: { id: string; storeCode: string; name: string; regionId?: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface BeaconFilters {
  query: string;
  status: "ACTIVE" | "ARCHIVED";
  assigned: "all" | "free" | "assigned";
  storeId: string;
}

export interface BeaconDraft {
  beaconCode: string;
  uuid: string;
  major: string;
  minor: string;
  notes: string;
}

export interface BulkBeaconItem {
  beaconCode: string;
  minor: number | null;
  line: number;
}

export interface BulkBeaconRow extends BulkBeaconItem {
  error: string;
}

const blankDraft = (): BeaconDraft => ({ beaconCode: "", uuid: "", major: "", minor: "", notes: "" });

export function beaconListPath(filters: BeaconFilters): string {
  const params = new URLSearchParams({ status: filters.status });
  if (filters.assigned !== "all") params.set("assigned", String(filters.assigned === "assigned"));
  if (filters.storeId) params.set("storeId", filters.storeId);
  if (filters.query.trim()) params.set("query", filters.query.trim());
  return `/api/beacons?${params.toString()}`;
}

export function normalizeBeaconUuid(value: string): string | null {
  if (value.trim().length > 40) return null;
  const normalized = value.trim().replaceAll("-", "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(normalized) ? normalized : null;
}

export function validateBeaconDraft(draft: BeaconDraft, existing: Beacon[], editingId?: string): Record<string, string> {
  const errors: Record<string, string> = {};
  const uuid = normalizeBeaconUuid(draft.uuid);
  if (!draft.beaconCode.trim()) errors.beaconCode = "Beacon-Code ist erforderlich.";
  else if (draft.beaconCode.trim().length > 60) errors.beaconCode = "Der Beacon-Code darf höchstens 60 Zeichen enthalten.";
  else if (existing.some((beacon) => beacon.id !== editingId && beacon.beaconCode.trim().toLowerCase() === draft.beaconCode.trim().toLowerCase())) errors.beaconCode = "Dieser Beacon-Code ist bereits vergeben.";
  if (!uuid) errors.uuid = "UUID muss 32 hexadezimale Zeichen enthalten; Bindestriche sind erlaubt.";
  else {
    const major = draft.major.trim() === "" ? null : Number(draft.major);
    const minor = draft.minor.trim() === "" ? null : Number(draft.minor);
    if ((major === null) !== (minor === null)) errors.identity = "Major und Minor müssen gemeinsam gesetzt oder leer sein.";
    for (const [field, value] of [["major", major], ["minor", minor]] as const) {
      if (value !== null && (!Number.isInteger(value) || value < 0 || value > 65_535)) errors[field] = "Wert muss eine ganze Zahl zwischen 0 und 65535 sein.";
    }
    if (!errors.identity && !errors.major && !errors.minor) {
      const identityKey = major === null ? uuid : `${uuid}:${major}:${minor}`;
      if (existing.some((beacon) => beacon.id !== editingId && beacon.identityKey.toLowerCase() === identityKey)) {
        errors.identity = "Diese UUID/Major/Minor-Identität ist bereits vergeben.";
      }
    }
  }
  if (draft.notes.length > 2000) errors.notes = "Notizen dürfen höchstens 2000 Zeichen enthalten.";
  return errors;
}

export function beaconPayload(draft: BeaconDraft): { beaconCode: string; uuid: string; major: number | null; minor: number | null; notes: string | null } {
  return {
    beaconCode: draft.beaconCode.trim(),
    uuid: normalizeBeaconUuid(draft.uuid) ?? draft.uuid.trim(),
    major: draft.major.trim() === "" ? null : Number(draft.major),
    minor: draft.minor.trim() === "" ? null : Number(draft.minor),
    notes: draft.notes.trim() || null
  };
}

export function parseBulkBeacons(uuidValue: string, majorValue: string, text: string, existing: Beacon[]): { uuid: string | null; major: number | null; rows: BulkBeaconRow[] } {
  const uuid = normalizeBeaconUuid(uuidValue);
  const major = majorValue.trim() === "" ? null : Number(majorValue);
  const baseError = !uuid
    ? "Gemeinsame UUID muss 32 hexadezimale Zeichen enthalten."
    : major !== null && (!Number.isInteger(major) || major < 0 || major > 65_535)
      ? "Major muss leer oder eine ganze Zahl zwischen 0 und 65535 sein."
      : "";
  const codes = new Set<string>();
  const identities = new Set<string>();
  const rows = text.split(/\r?\n/).map((raw, index) => ({ raw: raw.trim(), line: index + 1 })).filter((entry) => !!entry.raw).map(({ raw, line }) => {
    const [codeValue = "", minorValue = "", extra] = raw.split(",").map((part) => part.trim());
    const code = codeValue;
    const minor = minorValue === "" ? null : Number(minorValue);
    let error = baseError;
    if (!error && extra !== undefined) error = "Erwartetes Format: Beacon-Code,Minor.";
    else if (!error && !code) error = "Beacon-Code ist erforderlich.";
    else if (!error && code.length > 60) error = "Beacon-Code darf höchstens 60 Zeichen enthalten.";
    else if (!error && ((major === null) !== (minor === null))) error = "Major und Minor müssen gemeinsam gesetzt oder leer sein.";
    else if (!error && minor !== null && (!Number.isInteger(minor) || minor < 0 || minor > 65_535)) error = "Minor muss eine ganze Zahl zwischen 0 und 65535 sein.";
    const identityKey = uuid ? (major === null || minor === null ? uuid : `${uuid}:${major}:${minor}`) : "";
    if (!error && codes.has(code.toLowerCase())) error = "Beacon-Code kommt in dieser Liste mehrfach vor.";
    if (!error && identityKey && identities.has(identityKey)) error = "UUID/Major/Minor kommt in dieser Liste mehrfach vor.";
    if (!error && existing.some((beacon) => beacon.beaconCode.toLowerCase() === code.toLowerCase())) error = "Beacon-Code ist bereits vergeben.";
    if (!error && identityKey && existing.some((beacon) => beacon.identityKey.toLowerCase() === identityKey)) error = "UUID/Major/Minor ist bereits vergeben.";
    codes.add(code.toLowerCase());
    if (identityKey) identities.add(identityKey);
    return { beaconCode: code, minor: minor !== null && Number.isInteger(minor) ? minor : null, line, error };
  });
  if (!rows.length && baseError) rows.push({ beaconCode: "", minor: null, line: 1, error: baseError });
  else if (!rows.length) rows.push({ beaconCode: "", minor: null, line: 1, error: "Mindestens eine Beacon-Zeile ist erforderlich." });
  return { uuid, major, rows };
}

export function canManageBeacon(user: CurrentUser, beacon: Beacon, stores: BeaconStore[]): boolean {
  if (user.role === "admin") return true;
  if (!beacon.currentStore) return false;
  if (user.role === "store-manager") return user.scope?.storeId === beacon.currentStore.id;
  if (user.role === "region-manager" && beacon.currentStore.regionId) return user.scope?.regionId === beacon.currentStore.regionId;
  const store = stores.find((candidate) => candidate.id === beacon.currentStore?.id);
  if (!store) return false;
  if (user.role === "region-manager") return !!user.scope?.regionId && user.scope.regionId === store.region?.id;
  return false;
}

export function assignableStores(user: CurrentUser, stores: BeaconStore[]): BeaconStore[] {
  if (user.role === "admin") return stores.filter((store) => store.status === "ACTIVE");
  if (user.role === "store-manager") return stores.filter((store) => store.status === "ACTIVE" && store.id === user.scope?.storeId);
  if (user.role === "region-manager") return stores.filter((store) => store.status === "ACTIVE" && store.region?.id === user.scope?.regionId);
  return [];
}

export interface BulkAssignResult {
  assigned: string[];
  failed: { beaconCode: string; message: string }[];
}

/** Weist Beacons nacheinander einem Store zu; ein Fehler bricht die übrigen nicht ab. */
export async function assignBeaconsToStore(api: Pick<ApiClient, "post">, beacons: Pick<Beacon, "id" | "beaconCode">[], storeId: string): Promise<BulkAssignResult> {
  const result: BulkAssignResult = { assigned: [], failed: [] };
  for (const beacon of beacons) {
    try {
      await api.post(`/api/beacons/${encodeURIComponent(beacon.id)}/assign`, { storeId });
      result.assigned.push(beacon.beaconCode);
    } catch (error) {
      result.failed.push({ beaconCode: beacon.beaconCode, message: errorMessage(error) });
    }
  }
  return result;
}

export function assignNotice(result: BulkAssignResult, storeName: string): string {
  const ok = result.assigned.length === 1 ? `${result.assigned[0]} wurde ${storeName} zugewiesen.` : `${result.assigned.length} Beacons wurden ${storeName} zugewiesen.`;
  if (!result.failed.length) return ok;
  const failed = result.failed.map((item) => `${item.beaconCode}: ${item.message}`).join("; ");
  return `${result.assigned.length ? ok + " " : ""}Nicht zugewiesen: ${failed}`;
}

function errorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.message : "Die Anfrage ist fehlgeschlagen. Bitte erneut versuchen.";
}

function statusLabel(beacon: Beacon): string {
  if (beacon.status === "ARCHIVED") return "Archiviert";
  if (beacon.currentStore) return `Zugewiesen · ${beacon.currentStore.storeCode}`;
  return "Frei";
}

function draftFromBeacon(beacon: Beacon): BeaconDraft {
  return { beaconCode: beacon.beaconCode, uuid: beacon.uuid, major: beacon.major == null ? "" : String(beacon.major), minor: beacon.minor == null ? "" : String(beacon.minor), notes: beacon.notes ?? "" };
}

export function BeaconsPage({ api, user }: { api: ApiClient; user: CurrentUser }) {
  const [contextStoreId] = useState(() => new URLSearchParams(window.location.search).get("storeId") ?? "");
  const [filters, setFilters] = useState<BeaconFilters>({ query: "", status: "ACTIVE", assigned: "all", storeId: "" });
  const [sort, setSort] = useState<"beaconCode" | "uuid" | "storeCode">("beaconCode");
  const [beacons, setBeacons] = useState<Beacon[]>([]);
  const [stores, setStores] = useState<BeaconStore[]>([]);
  const [storePage, setStorePage] = useState(0);
  const [storeTotal, setStoreTotal] = useState(0);
  const [loadingMoreStores, setLoadingMoreStores] = useState(false);
  const [storePageError, setStorePageError] = useState("");
  const storeGeneration = useRef(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<Beacon | null | false>(false);
  const [draft, setDraft] = useState<BeaconDraft>(blankDraft);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectionStoreId, setSelectionStoreId] = useState("");
  const [createStoreId, setCreateStoreId] = useState("");
  const [archiveError, setArchiveError] = useState("");
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkUuid, setBulkUuid] = useState("");
  const [bulkMajor, setBulkMajor] = useState("");
  const [bulkNotes, setBulkNotes] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [bulkReview, setBulkReview] = useState<BulkBeaconRow[] | null>(null);
  const [bulkError, setBulkError] = useState("");
  const [bulkReviewing, setBulkReviewing] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const admin = user.role === "admin";
  const storesForUser = useMemo(() => assignableStores(user, stores), [user, stores]);
  const contextStore = storesForUser.find((store) => store.id === contextStoreId);

  useEffect(() => {
    if (contextStore && !selectionStoreId) setSelectionStoreId(contextStore.id);
  }, [contextStore, selectionStoreId]);

  useEffect(() => {
    const controller = new AbortController();
    storeGeneration.current += 1;
    setLoading(true);
    setSelectedIds(new Set());
    setLoadingMoreStores(false);
    setLoadError("");
    setStorePageError("");
    Promise.all([
      api.get<Beacon[]>(beaconListPath(filters), { signal: controller.signal }),
      api.get<{ content: BeaconStore[]; totalElements: number }>("/api/stores?status=ACTIVE&page=0&size=100", { signal: controller.signal })
    ]).then(async ([beaconList, storePage]) => {
      if (!Array.isArray(beaconList) || !Array.isArray(storePage?.content) || !Number.isFinite(storePage.totalElements)) throw new Error("Beacon- oder Store-Antwort ist unvollständig.");
      setBeacons(beaconList);
      let loadedStores = storePage.content;
      let loadedPage = 0;
      let totalStores = storePage.totalElements;
      setStores(loadedStores);
      setStorePage(loadedPage);
      setStoreTotal(storePage.totalElements);
      while (contextStoreId && !loadedStores.some((store) => store.id === contextStoreId) && loadedStores.length < totalStores) {
        try {
          const nextPage = loadedPage + 1;
          const result = await api.get<{ content: BeaconStore[]; totalElements: number }>(`/api/stores?status=ACTIVE&page=${nextPage}&size=100`, { signal: controller.signal });
          if (!Array.isArray(result?.content) || !Number.isFinite(result.totalElements)) throw new Error("Weitere Stores konnten nicht geladen werden.");
          if (controller.signal.aborted) return;
          if (result.content.length === 0) {
            totalStores = loadedStores.length;
            setStoreTotal(totalStores);
            break;
          }
          loadedStores = [...loadedStores, ...result.content.filter((store) => !loadedStores.some((item) => item.id === store.id))];
          loadedPage = nextPage;
          totalStores = result.totalElements;
          setStores(loadedStores);
          setStorePage(loadedPage);
          setStoreTotal(totalStores);
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setStorePageError(errorMessage(error));
          break;
        }
      }
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setLoadError(errorMessage(error));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, filters, revision]);

  async function loadMoreStores() {
    if (loadingMoreStores || stores.length >= storeTotal) return;
    const generation = storeGeneration.current;
    const nextPage = storePage + 1;
    setLoadingMoreStores(true);
    setStorePageError("");
    try {
      const result = await api.get<{ content: BeaconStore[]; totalElements: number }>(`/api/stores?status=ACTIVE&page=${nextPage}&size=100`);
      if (!Array.isArray(result?.content) || !Number.isFinite(result.totalElements)) throw new Error("Weitere Stores konnten nicht geladen werden.");
      if (generation !== storeGeneration.current) return;
      if (result.content.length === 0) {
        setStoreTotal(stores.length);
        return;
      }
      setStores((current) => [...current, ...result.content.filter((store) => !current.some((item) => item.id === store.id))]);
      setStorePage(nextPage);
      setStoreTotal(result.totalElements);
    } catch (error) {
      if (generation === storeGeneration.current) setStorePageError(errorMessage(error));
    } finally {
      if (generation === storeGeneration.current) setLoadingMoreStores(false);
    }
  }

  const sortedBeacons = useMemo(() => [...beacons].sort((a, b) => {
    const left = sort === "storeCode" ? a.currentStore?.storeCode : a[sort];
    const right = sort === "storeCode" ? b.currentStore?.storeCode : b[sort];
    if (left == null && right != null) return 1;
    if (right == null && left != null) return -1;
    const primary = String(left ?? "").localeCompare(String(right ?? ""), "de", { numeric: true, sensitivity: "base" });
    return primary || a.beaconCode.localeCompare(b.beaconCode, "de", { numeric: true, sensitivity: "base" });
  }), [beacons, sort]);

  const selectable = useMemo(() => sortedBeacons.filter((beacon) => beacon.status === "ACTIVE" && (canManageBeacon(user, beacon, stores) || !beacon.currentStore) && storesForUser.length > 0), [sortedBeacons, user, stores, storesForUser]);
  const selected = useMemo(() => selectable.filter((beacon) => selectedIds.has(beacon.id)), [selectable, selectedIds]);

  function openCreate() {
    setEditing(null);
    setCreateStoreId(contextStore?.id ?? "");
    setDraft(blankDraft());
    setFormErrors({});
    setFormError("");
  }

  function openEdit(beacon: Beacon) {
    setEditing(beacon);
    setDraft(draftFromBeacon(beacon));
    setFormErrors({});
    setFormError("");
  }

  function closeForm() {
    if (saving) return;
    setEditing(false);
    setFormErrors({});
    setFormError("");
  }

  async function saveBeacon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editing === false || saving) return;
    const errors = validateBeaconDraft(draft, beacons, editing?.id);
    setFormErrors(errors);
    setFormError("");
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const payload = beaconPayload(draft);
      let message = "Beacon wurde gespeichert.";
      if (editing) await api.put<Beacon>(`/api/beacons/${encodeURIComponent(editing.id)}`, payload);
      else {
        const created = await api.post<Beacon>("/api/beacons", payload);
        message = "Beacon wurde angelegt.";
        const store = storesForUser.find((candidate) => candidate.id === createStoreId);
        if (store && created?.id) message = `Beacon wurde angelegt. ${assignNotice(await assignBeaconsToStore(api, [created], store.id), store.name)}`;
      }
      setEditing(false);
      setNotice(message);
      setRevision((value) => value + 1);
    } catch (error) {
      setFormError(errorMessage(error));
      if (error instanceof ApiClientError) {
        const mapped: Record<string, string> = {};
        Object.entries(error.fieldErrors).forEach(([field, messages]) => { if (messages[0]) mapped[field] = messages[0]; });
        setFormErrors(mapped);
      }
    } finally {
      setSaving(false);
    }
  }

  async function reviewBulk() {
    if (bulkReviewing || bulkSaving) return;
    setBulkReviewing(true);
    setBulkError("");
    try {
      const [active, archived] = await Promise.all([
        api.get<Beacon[]>("/api/beacons?status=ACTIVE"),
        api.get<Beacon[]>("/api/beacons?status=ARCHIVED")
      ]);
      if (!Array.isArray(active) || !Array.isArray(archived)) throw new Error("Beacon-Inventar konnte nicht vollständig geprüft werden.");
      const parsed = parseBulkBeacons(bulkUuid, bulkMajor, bulkText, [...active, ...archived]);
      if (!parsed.uuid) setBulkError("Bitte eine gültige gemeinsame UUID eintragen.");
      setBulkReview(parsed.rows);
    } catch (error) {
      setBulkError(errorMessage(error));
      setBulkReview(null);
    } finally {
      setBulkReviewing(false);
    }
  }

  async function commitBulk() {
    if (!admin || bulkSaving || !bulkReview?.length || bulkReview.some((row) => row.error)) return;
    const targetStore = storesForUser.find((candidate) => candidate.id === createStoreId);
    const confirmed = window.confirm(`${bulkReview.length} Beacons anlegen${targetStore ? ` und ${targetStore.name} zuweisen` : ""}? Diese Aktion kann nicht rückgängig gemacht werden.`);
    if (!confirmed) return;
    setBulkSaving(true);
    setBulkError("");
    try {
      const payload = {
        uuid: normalizeBeaconUuid(bulkUuid),
        major: bulkMajor.trim() === "" ? null : Number(bulkMajor),
        notes: bulkNotes.trim() || null,
        items: bulkReview.map(({ beaconCode, minor }) => ({ beaconCode, minor }))
      };
      const result = await api.post<{ created: number; items: Beacon[] }>("/api/beacons/bulk", payload);
      let message = `${result.created} Beacon${result.created === 1 ? "" : "s"} wurden angelegt.`;
      const store = storesForUser.find((candidate) => candidate.id === createStoreId);
      if (store && Array.isArray(result.items) && result.items.length) message += ` ${assignNotice(await assignBeaconsToStore(api, result.items, store.id), store.name)}`;
      setNotice(message);
      setBulkOpen(false);
      setBulkReview(null);
      setBulkText("");
      setRevision((value) => value + 1);
    } catch (error) {
      setBulkError(errorMessage(error));
    } finally {
      setBulkSaving(false);
    }
  }

  async function assignTo(targets: Beacon[], storeId: string) {
    if (!targets.length || !storeId || assigning) return;
    const store = storesForUser.find((candidate) => candidate.id === storeId);
    if (!store) {
      setAssignmentError("Der Ziel-Store liegt außerhalb Ihres Zugriffs oder ist nicht aktiv.");
      return;
    }
    const moving = targets.filter((beacon) => beacon.currentStore && beacon.currentStore.id !== store.id);
    const question = targets.length === 1
      ? `${targets[0].beaconCode} ${targets[0].currentStore ? `von ${targets[0].currentStore.name} nach ${store.name} verschieben` : `dem Store ${store.name} zuweisen`}?`
      : `${targets.length} Beacons dem Store ${store.name} zuweisen?${moving.length ? ` ${moving.length} davon werden aus einem anderen Store verschoben.` : ""}`;
    if (!window.confirm(question)) return;
    setAssigning(true);
    setAssignmentError("");
    try {
      const result = await assignBeaconsToStore(api, targets, store.id);
      if (result.failed.length) setAssignmentError(assignNotice(result, store.name));
      else setNotice(assignNotice(result, store.name));
      setSelectionStoreId("");
      setRevision((value) => value + 1);
    } finally {
      setAssigning(false);
    }
  }

  async function releaseBeacon(beacon: Beacon) {
    if (!beacon.currentStore || !canManageBeacon(user, beacon, stores) || pendingActionId) return;
    if (!window.confirm(`${beacon.beaconCode} von ${beacon.currentStore.name} freigeben?`)) return;
    setPendingActionId(beacon.id);
    setArchiveError("");
    try {
      const result = await api.post<{ beaconId: string; released: boolean }>(`/api/beacons/${encodeURIComponent(beacon.id)}/release`, {});
      setNotice(result.released ? `${beacon.beaconCode} wurde freigegeben.` : `${beacon.beaconCode} hatte keine aktive Zuweisung.`);
      setRevision((value) => value + 1);
    } catch (error) {
      setArchiveError(errorMessage(error));
    } finally {
      setPendingActionId(null);
    }
  }

  async function archiveBeacon(beacon: Beacon) {
    if (!canManageBeacon(user, beacon, stores) || pendingActionId) return;
    if (!window.confirm(`${beacon.beaconCode} archivieren? Die aktive Zuweisung wird dabei beendet.`)) return;
    setPendingActionId(beacon.id);
    setArchiveError("");
    try {
      await api.request<Beacon>(`/api/beacons/${encodeURIComponent(beacon.id)}/archive`, { method: "PATCH" });
      setNotice(`${beacon.beaconCode} wurde archiviert.`);
      setRevision((value) => value + 1);
    } catch (error) {
      setArchiveError(errorMessage(error));
    } finally {
      setPendingActionId(null);
    }
  }

  return <section className="beacons-page" aria-labelledby="beacons-title">
    <div className="page-intro"><div><p className="eyebrow">Inventar</p><h2 id="beacons-title">Beacons</h2><p>Hardware-Identitäten und Store-Zuweisungen verwalten.</p></div>
      {admin && <div className="toolbar"><button type="button" className="primary" onClick={openCreate}>Beacon anlegen</button><button type="button" onClick={() => { setBulkOpen((value) => !value); setBulkReview(null); setBulkError(""); setCreateStoreId(contextStore?.id ?? ""); }}>Mehrere anlegen</button></div>}
    </div>
    {notice && <p role="status" className="notice success">{notice}</p>}
    {archiveError && <p role="alert" className="notice error">{archiveError}</p>}
    {loadError && <div role="alert" className="notice error"><p>{loadError}</p><button type="button" onClick={() => setRevision((value) => value + 1)}>Erneut versuchen</button></div>}

    {bulkOpen && admin && <section className="panel" aria-labelledby="beacon-bulk-title"><div className="panel-header"><h3 id="beacon-bulk-title">Mehrere Beacons anlegen</h3></div>
      {bulkError && <p role="alert" className="notice error">{bulkError}</p>}
      <div className="form-grid"><label>Gemeinsame UUID<input disabled={bulkReviewing || bulkSaving} value={bulkUuid} onChange={(event) => { setBulkUuid(event.currentTarget.value); setBulkReview(null); }} placeholder="fda50693-a4e2-4fb1-afcf-c6eb07647825" maxLength={40} /></label>
        <label>Gemeinsamer Major<input disabled={bulkReviewing || bulkSaving} inputMode="numeric" value={bulkMajor} onChange={(event) => { setBulkMajor(event.currentTarget.value); setBulkReview(null); }} /></label>
        <label>Direkt zuweisen an (optional)<select disabled={bulkReviewing || bulkSaving} value={createStoreId} onChange={(event) => setCreateStoreId(event.currentTarget.value)}><option value="">Nicht zuweisen</option>{storesForUser.map((store) => <option key={store.id} value={store.id}>{store.storeCode} · {store.name}</option>)}</select></label>
        <label>Notizen<textarea disabled={bulkReviewing || bulkSaving} maxLength={2000} value={bulkNotes} onChange={(event) => setBulkNotes(event.currentTarget.value)} /></label>
        <label className="span-2">Zeilen im Format Beacon-Code,Minor (Major und Minor gemeinsam leer für UUID-only)<textarea disabled={bulkReviewing || bulkSaving} rows={6} value={bulkText} onChange={(event) => { setBulkText(event.currentTarget.value); setBulkReview(null); }} placeholder={"B-001,1\nB-002,2\nB-003,3"} /></label>
      </div>
      <div className="toolbar"><button type="button" onClick={reviewBulk} disabled={bulkSaving || bulkReviewing}>{bulkReviewing ? "Prüft …" : "Prüfen"}</button><button type="button" className="primary" onClick={commitBulk} disabled={bulkSaving || bulkReviewing || !bulkReview?.length || bulkReview.some((row) => row.error)}>{bulkSaving ? "Legt an …" : `Geprüfte ${bulkReview?.length ?? 0} anlegen`}</button><button type="button" onClick={() => { setBulkOpen(false); setBulkReview(null); }} disabled={bulkSaving || bulkReviewing}>Abbrechen</button></div>
      {bulkReview && <div aria-live="polite"><DataTable label="Bulk-Prüfungstabelle"><thead><tr><th>Zeile</th><th>Beacon-Code</th><th>Minor</th><th>Prüfergebnis</th></tr></thead><tbody>{bulkReview.map((row) => <tr key={row.line}><td>{row.line}</td><td>{row.beaconCode || "–"}</td><td>{row.minor ?? "–"}</td><td>{row.error || "Bereit"}</td></tr>)}</tbody></DataTable></div>}
    </section>}

    {editing !== false && <section className="panel" aria-labelledby="beacon-form-title"><div className="panel-header"><h3 id="beacon-form-title">{editing ? "Beacon bearbeiten" : "Beacon anlegen"}</h3></div>
      {formError && <p role="alert" className="notice error">{formError}</p>}
      <form className="form-grid" onSubmit={saveBeacon} noValidate>
        <label>Beacon-Code<input required maxLength={60} value={draft.beaconCode} aria-invalid={!!formErrors.beaconCode} onChange={(event) => setDraft({ ...draft, beaconCode: event.currentTarget.value })} />{formErrors.beaconCode && <small role="alert">{formErrors.beaconCode}</small>}</label>
        <label>UUID<input required maxLength={40} value={draft.uuid} aria-invalid={!!formErrors.uuid} onChange={(event) => setDraft({ ...draft, uuid: event.currentTarget.value })} />{formErrors.uuid && <small role="alert">{formErrors.uuid}</small>}</label>
        <label>Major (optional)<input inputMode="numeric" value={draft.major} aria-invalid={!!formErrors.major} onChange={(event) => setDraft({ ...draft, major: event.currentTarget.value })} />{formErrors.major && <small role="alert">{formErrors.major}</small>}</label>
        <label>Minor (optional)<input inputMode="numeric" value={draft.minor} aria-invalid={!!formErrors.minor} onChange={(event) => setDraft({ ...draft, minor: event.currentTarget.value })} />{formErrors.minor && <small role="alert">{formErrors.minor}</small>}</label>
        {!editing && <label>Direkt zuweisen an (optional)<select value={createStoreId} onChange={(event) => setCreateStoreId(event.currentTarget.value)}><option value="">Nicht zuweisen</option>{storesForUser.map((store) => <option key={store.id} value={store.id}>{store.storeCode} · {store.name}</option>)}</select></label>}
        {formErrors.identity && <p role="alert" className="span-2">{formErrors.identity}</p>}
        <label className="span-2">Notizen<textarea maxLength={2000} rows={3} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.currentTarget.value })} />{formErrors.notes && <small role="alert">{formErrors.notes}</small>}</label>
        <div className="toolbar span-2"><button type="submit" className="primary" disabled={saving}>{saving ? "Speichert …" : "Speichern"}</button><button type="button" onClick={closeForm} disabled={saving}>Abbrechen</button></div>
      </form>
    </section>}

    {assignmentError && <p role="alert" className="notice error">{assignmentError}</p>}
    {contextStore && <p role="status" className="notice">Aus Store-Detail: Ziel-Store {contextStore.storeCode} · {contextStore.name}</p>}
    {contextStoreId && !contextStore && !loading && <p role="status" className="notice">Der Store aus dem Link ist nicht verfügbar oder liegt außerhalb Ihres Zugriffs. Bitte wählen Sie einen zugänglichen Ziel-Store.</p>}

    <section className="panel" aria-labelledby="beacon-list-title"><div className="panel-header"><h3 id="beacon-list-title">Inventar</h3><span>{loading || loadError ? "–" : sortedBeacons.length} Beacons</span></div>
      <form className="filters" role="search" onSubmit={(event) => event.preventDefault()}>
        <label>Suche<input type="search" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.currentTarget.value })} placeholder="Code oder UUID" /></label>
        <label>Status<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.currentTarget.value as BeaconFilters["status"] })}><option value="ACTIVE">Aktiv</option><option value="ARCHIVED">Archiviert</option></select></label>
        <label>Zuweisung<select value={filters.assigned} onChange={(event) => setFilters({ ...filters, assigned: event.currentTarget.value as BeaconFilters["assigned"] })}><option value="all">Alle</option><option value="free">Frei</option><option value="assigned">Zugewiesen</option></select></label>
        <label>Store<select value={filters.storeId} onChange={(event) => setFilters({ ...filters, storeId: event.currentTarget.value })}><option value="">Alle im Zugriff</option>{storesForUser.map((store) => <option key={store.id} value={store.id}>{store.storeCode} · {store.name}</option>)}</select></label>
        <label>Sortierung<select value={sort} onChange={(event) => setSort(event.currentTarget.value as typeof sort)}><option value="beaconCode">Code</option><option value="uuid">UUID</option><option value="storeCode">Store</option></select></label>
      </form>
      {stores.length < storeTotal && <button type="button" onClick={() => void loadMoreStores()} disabled={loadingMoreStores}>{loadingMoreStores ? "Lädt …" : `Weitere Stores laden (${stores.length} von ${storeTotal})`}</button>}
      {storePageError && <p role="alert" className="notice error">Weitere Stores konnten nicht geladen werden: {storePageError}</p>}
      {loading && <p role="status">Beacons werden geladen …</p>}
      {!loading && !loadError && sortedBeacons.length === 0 && <EmptyState action={admin && editing === false && !filters.query && !filters.storeId && filters.assigned === "all" && filters.status === "ACTIVE" ? <button type="button" className="primary" onClick={openCreate}>Ersten Beacon anlegen</button> : undefined}>{!filters.query && !filters.storeId && filters.assigned === "all" && filters.status === "ACTIVE" ? "Noch keine Beacons vorhanden." : "Keine Beacons passen zu Suche, Filtern oder Zugriff."}</EmptyState>}
      {!loading && !loadError && selectable.length > 0 && <div className="toolbar" aria-label="Auswahl zuweisen">
        <span>{selected.length} ausgewählt</span>
        <label>Auswahl zuweisen an<select value={selectionStoreId} disabled={assigning || !selected.length} onChange={(event) => setSelectionStoreId(event.currentTarget.value)}><option value="">Store auswählen</option>{storesForUser.map((store) => <option key={store.id} value={store.id}>{store.storeCode} · {store.name}</option>)}</select></label>
        <button type="button" className="primary" disabled={assigning || !selected.length || !selectionStoreId} onClick={() => void assignTo(selected, selectionStoreId)}>{assigning ? "Weist zu …" : `${selected.length} zuweisen`}</button>
        {selected.length > 0 && <button type="button" disabled={assigning} onClick={() => setSelectedIds(new Set())}>Auswahl aufheben</button>}
      </div>}
      {!loading && !loadError && sortedBeacons.length > 0 && <DataTable label="Beacon-Tabelle"><thead><tr><th><input type="checkbox" aria-label="Alle zuweisbaren Beacons auswählen" disabled={!selectable.length || assigning} checked={selectable.length > 0 && selected.length === selectable.length} onChange={(event) => setSelectedIds(event.currentTarget.checked ? new Set(selectable.map((beacon) => beacon.id)) : new Set())} /></th><th>Code</th><th className="col-id">Identität</th><th>Status</th><th className="col-low">Store</th><th>Aktionen</th></tr></thead><tbody>{sortedBeacons.map((beacon) => {
        const manageable = canManageBeacon(user, beacon, stores);
        const canAssign = beacon.status === "ACTIVE" && (manageable || !beacon.currentStore) && storesForUser.length > 0;
        return <tr key={beacon.id}><td>{canAssign && <input type="checkbox" aria-label={`${beacon.beaconCode} auswählen`} disabled={assigning} checked={selectedIds.has(beacon.id)} onChange={(event) => { const checked = event.currentTarget.checked; setSelectedIds((current) => { const next = new Set(current); if (checked) next.add(beacon.id); else next.delete(beacon.id); return next; }); }} />}</td><td><strong>{beacon.beaconCode}</strong><small>{beacon.notes || ""}</small></td><td className="col-id"><CopyableId value={beacon.identityKey} label={`Identität von ${beacon.beaconCode}`} /></td><td><span className={`status-pill ${beacon.status === "ARCHIVED" ? "missing" : beacon.currentStore ? "info" : "ready"}`}>{statusLabel(beacon)}</span></td><td className="col-low">{beacon.currentStore?.name ?? "–"}</td><td><div className="row-actions">
          {manageable && beacon.status === "ACTIVE" && <button type="button" onClick={() => openEdit(beacon)}>Bearbeiten</button>}
          {canAssign && <select aria-label={`${beacon.beaconCode} ${beacon.currentStore ? "verschieben" : "zuweisen"}`} value="" disabled={assigning} onChange={(event) => { const storeId = event.currentTarget.value; if (storeId) void assignTo([beacon], storeId); }}><option value="">{beacon.currentStore ? "Verschieben nach …" : "Zuweisen an …"}</option>{storesForUser.filter((store) => store.id !== beacon.currentStore?.id).map((store) => <option key={store.id} value={store.id}>{store.storeCode} · {store.name}</option>)}</select>}
          {beacon.currentStore && manageable && <button type="button" onClick={() => releaseBeacon(beacon)} disabled={pendingActionId === beacon.id}>Freigeben</button>}
          {manageable && beacon.status === "ACTIVE" && <button type="button" className="danger" onClick={() => archiveBeacon(beacon)} disabled={pendingActionId === beacon.id}>Archivieren</button>}
        </div></td></tr>;
      })}</tbody></DataTable>}
    </section>
  </section>;
}
