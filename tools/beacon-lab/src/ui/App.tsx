import { useEffect, useState, type ComponentType } from "react";
import { Callout, OriginBadge, Spinner } from "./components";
import { CalibrationPage } from "./pages/CalibrationPage";
import { CampaignListPage } from "./pages/CampaignListPage";
import { ComparePage } from "./pages/ComparePage";
import { DataPage } from "./pages/DataPage";
import { HeatmapsPage } from "./pages/HeatmapsPage";
import { OverviewPage } from "./pages/OverviewPage";
import { PlanPage } from "./pages/PlanPage";
import { PositioningPage } from "./pages/PositioningPage";
import { ReplayPage } from "./pages/ReplayPage";
import { ReportPage } from "./pages/ReportPage";
import { SignalsPage } from "./pages/SignalsPage";
import { StatisticsPage } from "./pages/StatisticsPage";
import { BeaconDiagnosticsPage } from "./pages/BeaconDiagnosticsPage";
import { PlanningPage } from "./pages/PlanningPage";
import { PAGES, href, useRoute, type PageId } from "./router";
import { LabProvider, useLab } from "./state/LabContext";

const PAGE_COMPONENTS: Record<PageId, ComponentType> = {
  overview: OverviewPage,
  plan: PlanPage,
  data: DataPage,
  signals: SignalsPage,
  calibration: CalibrationPage,
  positioning: PositioningPage,
  compare: ComparePage,
  heatmaps: HeatmapsPage,
  replay: ReplayPage,
  statistics: StatisticsPage,
  beacons: BeaconDiagnosticsPage,
  planning: PlanningPage,
  report: ReportPage,
};

export function App() {
  return (
    <LabProvider>
      <Shell />
    </LabProvider>
  );
}

function Logo() {
  return (
    <a href={href(null)} className="flex items-center gap-2.5 px-5 py-5 text-white no-underline" aria-label="Zur Kampagnenübersicht">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <rect x="1" y="1" width="26" height="26" rx="7" fill="none" stroke="#7edcc6" strokeWidth="1.5" />
        <circle cx="14" cy="14" r="2.6" fill="#7edcc6" />
        <circle cx="14" cy="14" r="6.5" fill="none" stroke="#7edcc6" strokeOpacity="0.55" strokeWidth="1.2" />
        <circle cx="14" cy="14" r="10.5" fill="none" stroke="#7edcc6" strokeOpacity="0.25" strokeWidth="1.2" />
      </svg>
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold tracking-tight">Indooro</span>
        <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-brand-accent/80">Positioning Lab</span>
      </span>
    </a>
  );
}

function Shell() {
  const lab = useLab();
  const route = useRoute();
  const [navOpen, setNavOpen] = useState(false);
  const { campaign, openCampaign, ready } = lab;

  useEffect(() => {
    if (route.campaignId !== (campaign?.id ?? null)) void openCampaign(route.campaignId);
  }, [route.campaignId, campaign?.id, openCampaign]);

  useEffect(() => setNavOpen(false), [route.campaignId, route.page]);

  const hasSynthetic = !!campaign && (campaign.floorPlan.origin === "synthetic" || lab.runs.some((r) => r.origin === "synthetic"));
  const groups = [...new Set(PAGES.map((p) => p.group))];
  const Page = PAGE_COMPONENTS[route.page];
  const campaignLoaded = route.campaignId !== null && campaign?.id === route.campaignId;

  return (
    <div className="flex min-h-full">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 shrink-0 transform bg-brand text-white transition-transform lg:static lg:translate-x-0 ${navOpen ? "translate-x-0" : "-translate-x-full"}`}
        aria-label="Navigation"
      >
        <Logo />
        <nav className="px-3 pb-6">
          <a
            href={href(null)}
            className={`mb-4 block rounded-md px-3 py-2 text-sm font-medium no-underline ${route.campaignId === null ? "bg-white/10 text-white" : "text-white/75 hover:bg-white/5 hover:text-white"}`}
          >
            Alle Messkampagnen
          </a>
          {campaign && route.campaignId && (
            <>
              <div className="mb-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wider text-white/50">Aktive Kampagne</div>
                <div className="mt-0.5 truncate text-sm font-semibold" title={campaign.name}>
                  {campaign.name}
                </div>
                {hasSynthetic && <OriginBadge origin="synthetic" className="mt-1.5" />}
              </div>
              {groups.map((g) => (
                <div key={g} className="mb-3">
                  <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/45">{g}</div>
                  {PAGES.filter((p) => p.group === g).map((p) => {
                    const active = route.page === p.id;
                    return (
                      <a
                        key={p.id}
                        href={href(campaign.id, p.id)}
                        aria-current={active ? "page" : undefined}
                        data-nav={p.id}
                        className={`block rounded-md px-3 py-1.5 text-sm no-underline ${active ? "bg-brand-accent/15 font-semibold text-brand-accent" : "text-white/80 hover:bg-white/5 hover:text-white"}`}
                      >
                        {p.label}
                      </a>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </nav>
        <div className="absolute inset-x-0 bottom-0 px-5 py-4 text-[11px] leading-relaxed text-white/45">
          Lokal im Browser · keine Verbindung zum Indooro-Backend
        </div>
      </aside>
      {navOpen && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setNavOpen(false)} aria-hidden="true" />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-white/90 px-4 py-2.5 backdrop-blur lg:hidden">
          <button
            type="button"
            className="rounded-md border border-line px-2.5 py-1.5 text-sm font-medium"
            onClick={() => setNavOpen((v) => !v)}
            aria-expanded={navOpen}
            aria-label="Navigation öffnen"
          >
            Menü
          </button>
          <span className="truncate text-sm font-semibold">{campaign && route.campaignId ? campaign.name : "Indooro Positioning Lab"}</span>
        </header>
        {hasSynthetic && route.campaignId && (
          <div className="border-b border-synthetic/30 bg-synthetic/10 px-6 py-2 text-xs font-medium text-synthetic" role="note" data-testid="synthetic-banner">
            Diese Kampagne enthält SYNTHETISCHE Daten. Alle Kennzahlen beschreiben das Verhalten der Verfahren auf simulierten Signalen – es sind keine Messergebnisse.
          </div>
        )}
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {lab.error && (
            <Callout tone="danger" title="Speicher nicht verfügbar" className="mb-4">
              {lab.error}
            </Callout>
          )}
          {!ready ? (
            <div className="flex items-center gap-2 text-muted">
              <Spinner /> Lade lokale Daten …
            </div>
          ) : route.campaignId === null ? (
            <CampaignListPage />
          ) : campaignLoaded ? (
            <Page key={`${route.campaignId}/${route.page}`} />
          ) : campaign === null && lab.campaigns.every((c) => c.id !== route.campaignId) ? (
            <Callout tone="warning" title="Kampagne nicht gefunden">
              Diese Kampagne existiert im lokalen Speicher dieses Browsers nicht. <a href={href(null)}>Zur Übersicht</a>
            </Callout>
          ) : (
            <div className="flex items-center gap-2 text-muted">
              <Spinner /> Lade Kampagne …
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
