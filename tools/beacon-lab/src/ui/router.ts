/** Minimal hash router (no dependency): #/ , #/c/<campaignId>/<page> */
import { useEffect, useState } from "react";

export type PageId =
  | "overview"
  | "plan"
  | "data"
  | "signals"
  | "calibration"
  | "positioning"
  | "compare"
  | "heatmaps"
  | "replay"
  | "statistics"
  | "beacons"
  | "planning"
  | "report";

export interface Route {
  campaignId: string | null;
  page: PageId;
}

export const PAGES: { id: PageId; label: string; group: string }[] = [
  { id: "overview", label: "Übersicht", group: "Kampagne" },
  { id: "plan", label: "Grundriss & Beacons", group: "Kampagne" },
  { id: "data", label: "Messdaten & Qualität", group: "Kampagne" },
  { id: "signals", label: "RSSI-Analyse", group: "Analyse" },
  { id: "calibration", label: "Kalibrierung", group: "Analyse" },
  { id: "positioning", label: "Positionierung", group: "Analyse" },
  { id: "compare", label: "Algorithmusvergleich", group: "Analyse" },
  { id: "heatmaps", label: "Heatmaps", group: "Visualisierung" },
  { id: "replay", label: "Replay", group: "Visualisierung" },
  { id: "statistics", label: "Statistik & Mehrlauf", group: "Analyse" },
  { id: "beacons", label: "Beacon-Diagnose", group: "Analyse" },
  { id: "planning", label: "Platzierung (Simulation)", group: "Visualisierung" },
  { id: "report", label: "Bericht & Export", group: "Ergebnis" },
];

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "c" && parts[1]) {
    const page = PAGES.some((p) => p.id === parts[2]) ? (parts[2] as PageId) : "overview";
    return { campaignId: parts[1], page };
  }
  return { campaignId: null, page: "overview" };
}

export function href(campaignId: string | null, page: PageId = "overview"): string {
  return campaignId ? `#/c/${encodeURIComponent(campaignId)}/${page}` : "#/";
}

export function navigate(campaignId: string | null, page: PageId = "overview"): void {
  window.location.hash = href(campaignId, page);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
