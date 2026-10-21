import type { ApiClient } from "./api/client";
import { fetchStoreReadiness, type ReadinessReport } from "./api/readiness";
import { BEACON_CONSISTENCY_CODES } from "./readiness";

// Pure derivation of the guided setup checklist ("Einrichtung") of one store. No React, no clock.
// Every fact comes from an endpoint the backend already serves; a source that failed to load is passed as null
// and the steps that need it say "unknown" instead of guessing.

export type SetupStepId = "store" | "layout" | "shelves" | "beacons" | "catalog" | "search" | "readiness";
export type SetupStepStatus = "done" | "open" | "problem" | "unknown";

export interface SetupLink { label: string; href: string; adminOnly: boolean }
export interface SetupStep { id: SetupStepId; title: string; status: SetupStepStatus; detail: string; link: SetupLink | null }

export interface SetupSearchCheck {
  /** Name of the first product of the store, used as the search query. */
  query: string;
  /** True when the store-scoped search returned that product. */
  found: boolean;
}

export interface SetupInput {
  store: { id: string; status: string; activeLayout: { id: string; versionNo: number } | null };
  /** `fallback` of GET /api/mobile/stores/{id}/layout/current; null when the call failed. */
  mobileLayoutFallback: boolean | null;
  /** Readiness report; null when the call failed. */
  readiness: ReadinessReport | null;
  /** Products whose storeCode equals the store code (GET /api/products?storeCode=); null when the call failed. */
  storeProductCount: number | null;
  /** Search by the first store product; null when it could not run, "no-products" when the store has none. */
  search: SetupSearchCheck | "no-products" | null;
}

/** Findings that mean the layout beacons and the registered beacons disagree or lack data. */
export const BEACON_PROBLEM_CODES: readonly string[] = [...BEACON_CONSISTENCY_CODES, "BEACON_WITHOUT_IDENTITY"];

export const SETUP_GUIDE_HREF = "https://github.com/htl-leo-itp-25-27-4-5BHITM/Indooro/blob/main/docs/pilot-readiness/operations/MARKT_EINRICHTEN.md";

function link(label: string, href: string, adminOnly = false): SetupLink { return { label, href, adminOnly }; }

function countWithCode(report: ReadinessReport, codes: readonly string[]): number {
  return report.findings.filter((finding) => codes.includes(finding.code)).length;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function layoutStep(input: SetupInput): SetupStep {
  const editor = link("Layout im Editor anlegen und aktivieren", `/admin/next/editor/?storeId=${encodeURIComponent(input.store.id)}`);
  const title = "Layout aktiv";
  const active = input.store.activeLayout;
  if (!active) return { id: "layout", title, status: "open", detail: "Kein Layout aktiv. Kundinnen und Kunden sehen nur das Standard-Layout.", link: editor };
  if (input.mobileLayoutFallback === true) {
    return { id: "layout", title, status: "problem", detail: "Die App liefert trotz aktivem Layout das Standard-Layout. Layout im Editor prüfen und neu aktivieren.", link: editor };
  }
  return { id: "layout", title, status: "done", detail: `Version ${active.versionNo} ist aktiv.`, link: null };
}

function shelvesStep(input: SetupInput): SetupStep {
  const editor = link("Regale im Editor beschriften", `/admin/next/editor/?storeId=${encodeURIComponent(input.store.id)}`);
  const title = "Regale beschriftet";
  const report = input.readiness;
  if (!input.store.activeLayout) return { id: "shelves", title, status: "open", detail: "Zuerst ein Layout aktivieren.", link: null };
  if (!report) return { id: "shelves", title, status: "unknown", detail: "Die Bereitschaftsprüfung konnte nicht geladen werden.", link: null };
  if (report.counts.shelves === 0) return { id: "shelves", title, status: "open", detail: "Das Layout enthält noch keine Regale.", link: editor };
  const unlabeled = countWithCode(report, ["TARGET_SHELF_WITHOUT_LABEL"]);
  if (unlabeled > 0) {
    return { id: "shelves", title, status: "problem", detail: `${plural(unlabeled, "Regal wird", "Regale werden")} angesteuert, ${unlabeled === 1 ? "hat" : "haben"} aber keine Beschriftung.`, link: editor };
  }
  return { id: "shelves", title, status: "done", detail: `${plural(report.counts.shelves, "Regal", "Regale")} im Layout, kein angesteuertes Regal ohne Beschriftung.`, link: null };
}

function beaconsStep(input: SetupInput): SetupStep {
  const title = "Beacons registriert und im Layout platziert";
  const beaconsPage = link("Beacons verwalten", `/admin/next/beacons/?storeId=${encodeURIComponent(input.store.id)}`);
  const report = input.readiness;
  if (!input.store.activeLayout) return { id: "beacons", title, status: "open", detail: "Zuerst ein Layout aktivieren.", link: null };
  if (!report) return { id: "beacons", title, status: "unknown", detail: "Die Bereitschaftsprüfung konnte nicht geladen werden.", link: null };
  const problems = countWithCode(report, BEACON_PROBLEM_CODES);
  if (problems > 0) {
    return { id: "beacons", title, status: "problem", detail: `${plural(problems, "Abweichung", "Abweichungen")} bei UUID, Major, Minor oder zwischen Registrierung und Layout.`, link: beaconsPage };
  }
  const { assignedBeacons, placedBeacons } = report.counts;
  if (assignedBeacons === 0) {
    return { id: "beacons", title, status: "open", detail: placedBeacons > 0 ? "Beacons sind im Layout, aber noch keinem Markt zugeordnet." : "Dem Markt sind noch keine Beacons zugeordnet.", link: beaconsPage };
  }
  const unplaced = countWithCode(report, ["BEACON_ASSIGNED_NOT_PLACED"]);
  if (placedBeacons === 0 || unplaced > 0) {
    const missing = unplaced > 0 ? unplaced : assignedBeacons;
    return { id: "beacons", title, status: "open", detail: `${plural(missing, "zugeordnetes Beacon ist", "zugeordnete Beacons sind")} noch nicht im Layout platziert.`, link: link("Beacons im Editor platzieren", `/admin/next/editor/?storeId=${encodeURIComponent(input.store.id)}`) };
  }
  return { id: "beacons", title, status: "done", detail: `${plural(placedBeacons, "Beacon", "Beacons")} platziert, Registrierung und Layout stimmen überein.`, link: null };
}

function catalogStep(input: SetupInput): SetupStep {
  const title = "Sortiment importiert";
  const csv = link("CSV-Import öffnen", "/admin/next/products/", true);
  const count = input.storeProductCount;
  if (count === null) return { id: "catalog", title, status: "unknown", detail: "Die Produkte des Markts konnten nicht geladen werden.", link: null };
  if (count > 0) return { id: "catalog", title, status: "done", detail: "Der Markt hat eigene Produkte.", link: null };
  const shared = input.readiness?.counts.products ?? 0;
  if (shared > 0) {
    return { id: "catalog", title, status: "problem", detail: `Die Prüfung sieht ${plural(shared, "Produkt", "Produkte")}, aber keines gehört dem Markt (gemeinsamer Katalog ohne Markt). Sortiment dieses Markts per CSV importieren.`, link: csv };
  }
  return { id: "catalog", title, status: "open", detail: "Für diesen Markt ist noch kein Produkt importiert.", link: csv };
}

function searchStep(input: SetupInput): SetupStep {
  const title = "Suche findet Produkte des Markts";
  const reindex = link("Suchindex öffnen", "/admin/next/search-index/", true);
  const { search } = input;
  if (search === "no-products" || input.storeProductCount === 0) return { id: "search", title, status: "open", detail: "Zuerst das Sortiment importieren.", link: null };
  if (search === null) return { id: "search", title, status: "unknown", detail: "Die Suche konnte nicht geprüft werden.", link: null };
  if (search.found) return { id: "search", title, status: "done", detail: `Die Suche nach „${search.query}“ liefert das Produkt dieses Markts.`, link: null };
  return { id: "search", title, status: "problem", detail: `Die Suche nach „${search.query}“ findet das Produkt nicht, obwohl es importiert ist. Suchindex prüfen.`, link: reindex };
}

function readinessStep(input: SetupInput): SetupStep {
  const title = "Bereitschaftsprüfung ohne blockierende Befunde";
  const page = link("Pilot-Bereitschaft öffnen", `/admin/next/stores/readiness/?storeId=${encodeURIComponent(input.store.id)}`);
  const report = input.readiness;
  if (!report) return { id: "readiness", title, status: "unknown", detail: "Die Bereitschaftsprüfung konnte nicht geladen werden.", link: page };
  if (!report.layoutId) return { id: "readiness", title, status: "open", detail: "Ohne aktives Layout ist keine Prüfung möglich.", link: page };
  if (report.blockingCount > 0) return { id: "readiness", title, status: "problem", detail: `${plural(report.blockingCount, "blockierender Befund", "blockierende Befunde")}.`, link: page };
  const warnings = report.warningCount > 0 ? ` ${plural(report.warningCount, "Warnung", "Warnungen")} bleiben zur Ansicht.` : "";
  return { id: "readiness", title, status: "done", detail: `Keine blockierenden Befunde.${warnings}`, link: page };
}

/** The seven setup steps in the order an operator has to work through them. */
export function deriveSetupSteps(input: SetupInput): SetupStep[] {
  const storeStep: SetupStep = input.store.status === "ACTIVE"
    ? { id: "store", title: "Markt angelegt", status: "done", detail: "Der Markt ist angelegt und aktiv.", link: null }
    : { id: "store", title: "Markt angelegt", status: "problem", detail: "Der Markt ist archiviert.", link: link("Zur Store-Liste", "/admin/next/stores/") };
  return [storeStep, layoutStep(input), shelvesStep(input), beaconsStep(input), catalogStep(input), searchStep(input), readinessStep(input)];
}

export function setupSummary(steps: readonly SetupStep[]): { done: number; total: number; next: SetupStep | null } {
  const next = steps.find((step) => step.status !== "done") ?? null;
  return { done: steps.filter((step) => step.status === "done").length, total: steps.length, next };
}

export const SETUP_STATUS_LABEL: Record<SetupStepStatus, string> = {
  done: "Erledigt",
  open: "Offen",
  problem: "Problem",
  unknown: "Nicht prüfbar"
};

// ---------------------------------------------------------------------------------------------
// Loading. Each source fails on its own; one failed call never hides the others.

interface StoreProductRef { id?: number; name?: string }

async function settled<T>(promise: Promise<T>): Promise<T | null> {
  try { return await promise; } catch { return null; }
}

export async function loadSetupInput(
  api: ApiClient,
  store: SetupInput["store"] & { storeCode: string },
  signal?: AbortSignal
): Promise<SetupInput> {
  const id = encodeURIComponent(store.id);
  const code = encodeURIComponent(store.storeCode);
  const [readiness, mobile, products] = await Promise.all([
    settled(fetchStoreReadiness(api, store.id, undefined, { signal })),
    settled(api.get<{ fallback?: unknown }>(`/api/mobile/stores/${id}/layout/current`, { signal })),
    // One product is enough to know whether the market has any and to build the search query.
    settled(api.get<Array<StoreProductRef | null>>(`/api/products?storeCode=${code}&size=1`, { signal }))
  ]);
  const first = Array.isArray(products) ? products.find((product): product is StoreProductRef => !!product) : undefined;
  const storeProductCount = products === null || !Array.isArray(products) ? null : first ? 1 : 0;
  let search: SetupInput["search"] = storeProductCount === 0 ? "no-products" : null;
  if (first && typeof first.name === "string" && first.name.trim()) {
    const query = first.name.trim();
    const hits = await settled(api.get<Array<StoreProductRef | null>>(`/api/products/search?q=${encodeURIComponent(query)}&storeCode=${code}&size=10`, { signal }));
    if (Array.isArray(hits)) search = { query, found: hits.some((hit) => hit != null && hit.id === first.id) };
  }
  return {
    store: { id: store.id, status: store.status, activeLayout: store.activeLayout },
    mobileLayoutFallback: mobile && typeof mobile.fallback === "boolean" ? mobile.fallback : null,
    readiness,
    storeProductCount,
    search
  };
}
