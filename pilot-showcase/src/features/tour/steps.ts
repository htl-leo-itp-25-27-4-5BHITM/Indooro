import { demoBridge } from "../store/demoBridge";
import { resolveTarget, tid } from "./actions";
import type { TourCtx } from "./actions";
import type { DemoTab } from "../store/useStoreDemo";

export type Placement = "auto" | "top" | "bottom" | "left" | "right" | "center";

export interface TourStep {
  id: string;
  chapter: string;
  title: string;
  /** One or two short sentences for operators. */
  body: string;
  /** CSS selector (data-testid or id) or a list of fallbacks; null = centred card without spotlight. */
  target: string | readonly string[] | null;
  placement: Placement;
  /** Drives the page/demo for this step. Must be idempotent (back and forth). */
  onEnter?: (ctx: TourCtx) => Promise<void>;
  /** Advance automatically after this many ms (not used by the default script). */
  autoAdvanceMs?: number;
  /** Call to action on the card (final step). */
  cta?: { label: string; href: string };
}

export const NORD = "DEMO-NORD";
export const SUED = "DEMO-SUED";

interface DemoTarget {
  market?: string;
  tab?: DemoTab;
  list?: "empty" | "example" | "keep";
  sim?: "idle" | "pause" | "keep";
  select?: string | null;
}

/** Brings the live demo into a defined state. Every step calls this, so going back and forth is safe. */
async function applyDemo(ctx: TourCtx, o: DemoTarget): Promise<void> {
  let d = ctx.demo();
  if (!d) return;
  if (o.market && d.market.code !== o.market) {
    d.setMarketCode(o.market);
    await ctx.sleep(160);
    d = ctx.demo() ?? d;
  }
  if (o.sim === "idle" && d.sim.state !== "idle") d.sim.reset();
  if (o.sim === "pause" && (d.sim.state === "running" || d.sim.state === "arrived-at-stop")) d.sim.pause();
  if (o.list === "empty" && d.items.length > 0) d.clearList();
  if (o.list === "example" && d.items.length < 3) d.loadExample();
  if (o.list === "empty" || o.list === "example") {
    // wait until React has applied the list change (the handle is republished on render)
    for (let i = 0; i < 30; i++) {
      await ctx.sleep(50);
      const n = ctx.demo()?.items.length ?? 0;
      if (o.list === "empty" ? n === 0 : n >= 3) break;
    }
    await ctx.sleep(60);
  }
  d = ctx.demo() ?? d;
  if (o.tab && d.tab !== o.tab) {
    d.setTab(o.tab);
    await ctx.sleep(120);
    d = ctx.demo() ?? d;
  }
  if (o.select !== undefined) {
    const p = o.select ? d.market.products.find((x) => x.id === o.select) : null;
    d.selectProduct(p ? p.id : null);
  }
}

function stopOperatorAutoplay(): void {
  const btn = resolveTarget(tid("operator-autoplay"));
  if (btn?.getAttribute("aria-pressed") === "true") btn.click();
}

/** Restores a sane demo state when the tour ends or is aborted. */
export function restoreAfterTour(): void {
  stopOperatorAutoplay();
  const d = demoBridge.get();
  if (d && (d.sim.state === "running" || d.sim.state === "arrived-at-stop")) d.sim.pause();
}

async function clearSearch(ctx: TourCtx): Promise<void> {
  await ctx.type(tid("search-input"), "", true);
}

export const STEPS: readonly TourStep[] = [
  {
    id: "willkommen",
    chapter: "Willkommen",
    title: "Willkommen bei Indooro",
    body: "Indooro hilft Kundinnen und Kunden, Produkte im Supermarkt zu finden und den Weg dorthin zu gehen. In wenigen Minuten sehen Sie, wie das aussieht.",
    target: ["#hero-title"],
    placement: "bottom"
  },
  {
    id: "problem",
    chapter: "Problem",
    title: "Das Problem im Alltag",
    body: "Kundinnen und Kunden suchen, fragen das Personal und laufen Umwege. Das beschäftigt beide Seiten, im Markt und an der Information.",
    target: ["#problem-title"],
    placement: "bottom"
  },
  {
    id: "demo-markt",
    chapter: "Demo",
    title: "Ein fiktiver Demomarkt",
    body: "Markt und Sortiment sind frei erfunden und laufen nur in Ihrem Browser. Wir steuern die Demo für Sie, Sie können jederzeit selbst eingreifen.",
    target: [tid("store-map"), tid("store-3d")],
    placement: "auto",
    onEnter: async (ctx) => {
      await applyDemo(ctx, { market: NORD, tab: "suche", list: "empty", sim: "idle", select: null });
      await clearSearch(ctx);
    }
  },
  {
    id: "demo-suche",
    chapter: "Demo",
    title: "Produkt suchen",
    body: "Wir suchen „Paradeiser“. Die Suche kennt österreichische Begriffe und findet die Tomaten.",
    target: [tid("search-input")],
    placement: "left",
    onEnter: async (ctx) => {
      await applyDemo(ctx, { market: NORD, tab: "suche", list: "empty", sim: "idle", select: null });
      await ctx.type(tid("search-input"), "Paradeiser");
    }
  },
  {
    id: "demo-treffer",
    chapter: "Demo",
    title: "Treffer am Regal",
    body: "Der Treffer nennt das Regal. Der markierte Punkt auf dem Plan zeigt, wo das Produkt im Markt steht.",
    target: [`${tid("selected-pin")} > g`, tid("store-map"), tid("store-3d")],
    placement: "right",
    onEnter: async (ctx) => {
      await applyDemo(ctx, { market: NORD, tab: "suche", list: "empty", sim: "idle" });
      await ctx.type(tid("search-input"), "Paradeiser", true);
      await ctx.waitFor(tid("search-result"));
      await applyDemo(ctx, { select: "tomaten" });
      await ctx.waitFor(`${tid("selected-pin")} > g`, 1500);
    }
  },
  {
    id: "demo-liste",
    chapter: "Demo",
    title: "Auf die Einkaufsliste",
    body: "Mit „+ Liste“ landet das Produkt auf der Einkaufsliste, so wie Kundinnen und Kunden es zuhause vorbereiten.",
    target: [tid("add-button")],
    placement: "left",
    onEnter: async (ctx) => {
      await applyDemo(ctx, { market: NORD, tab: "suche", list: "empty", sim: "idle", select: "tomaten" });
      await ctx.type(tid("search-input"), "Paradeiser", true);
      await ctx.waitFor(tid("add-button"));
      await ctx.sleep(500);
      const btn = resolveTarget(tid("add-button"));
      if (btn && btn.getAttribute("aria-pressed") !== "true") btn.click();
    }
  },
  {
    id: "demo-beispiel",
    chapter: "Demo",
    title: "Eine ganze Liste",
    body: "Ein Einkauf besteht aus mehreren Produkten. Wir laden eine Beispielliste und sehen, wo alles liegt.",
    target: [tid("list-count"), tid("tab-liste")],
    placement: "left",
    onEnter: async (ctx) => {
      await applyDemo(ctx, { market: NORD, tab: "liste", list: "empty", sim: "idle" });
      await ctx.sleep(300);
      await applyDemo(ctx, { list: "example" });
      await ctx.waitFor(tid("list-count"));
    }
  },
  {
    id: "demo-route",
    chapter: "Demo",
    title: "Die Route durch den Markt",
    body: "Indooro ordnet die Produkte zu einer Route vom Eingang bis zur Kasse. Die Nummern zeigen die Reihenfolge.",
    target: [tid("route-path"), tid("store-map"), tid("store-3d")],
    placement: "auto",
    onEnter: async (ctx) => {
      await applyDemo(ctx, { market: NORD, tab: "navigation", list: "example", sim: "idle", select: null });
      await ctx.waitFor(tid("route-path"));
    }
  },
  {
    id: "demo-simulation",
    chapter: "Demo",
    title: "Navigation, simuliert",
    body: "Jetzt läuft eine Navigation. Die Position ist hier ausdrücklich eine „Simulierte Position“, in dieser Demo wird nichts gemessen.",
    target: [tid("store-map"), tid("store-3d")],
    placement: "right",
    onEnter: async (ctx) => {
      await applyDemo(ctx, { market: NORD, tab: "navigation", list: "example", sim: "idle", select: null });
      await ctx.sleep(250);
      ctx.demo()?.sim.start();
      await ctx.sleep(4000);
    }
  },
  {
    id: "demo-markt-suche",
    chapter: "Demo",
    title: "Suche gilt pro Markt",
    body: "Im „Nahversorger Pöstlingberg“ gibt es keine Hafermilch, also findet die Suche sie dort auch nicht. Es zählt nur, was der gewählte Markt führt.",
    target: [tid("search-empty"), tid("search-input")],
    placement: "left",
    onEnter: async (ctx) => {
      await applyDemo(ctx, { market: SUED, tab: "suche", sim: "pause", select: null });
      await ctx.type(tid("search-input"), "Hafermilch");
      await ctx.waitFor(tid("search-empty"), 1500);
    }
  },
  {
    id: "so-funktionierts",
    chapter: "So funktioniert’s",
    title: "Was dahinter steckt",
    body: "Die Position kommt aus Bluetooth-Beacons, QR-Anker dienen als Rückfall. Die App berechnet Suche und Route.",
    target: ["#how-title"],
    placement: "bottom",
    onEnter: async (ctx) => {
      await applyDemo(ctx, { sim: "pause" });
    }
  },
  {
    id: "betreiber-intro",
    chapter: "Betreiber",
    title: "Für Betreiber",
    body: "Ihr Markt soll ohne Entwickler startklar werden: anlegen, Sortiment importieren, Bereitschaft prüfen.",
    target: ["#betreiber-title"],
    placement: "bottom",
    onEnter: async () => stopOperatorAutoplay()
  },
  {
    id: "betreiber-demo",
    chapter: "Betreiber",
    title: "Bereitschaft prüfen",
    body: "Die Simulation legt einen Markt an, importiert das Sortiment und prüft ihn. Der Status wechselt von „Nicht bereit“ zu „Bereit“, das dauert rund 20 Sekunden.",
    target: [tid("operator-status")],
    placement: "auto",
    onEnter: async (ctx) => {
      await ctx.waitFor(tid("operator-demo"));
      ctx.click(tid("operator-reset"));
      await ctx.sleep(200);
      const btn = resolveTarget(tid("operator-autoplay"));
      if (btn && btn.getAttribute("aria-pressed") !== "true") btn.click();
    }
  },
  {
    id: "projektstand",
    chapter: "Projektstand",
    title: "Projektstand, ehrlich",
    body: "Server, Verwaltung und iOS-App sind umgesetzt. Offen ist die erste Messung der Beacon-Ortung, es gibt noch keine Messergebnisse.",
    target: [tid("project-status"), "#projektstand-title"],
    placement: "auto",
    onEnter: async () => stopOperatorAutoplay()
  },
  {
    id: "pilot-ablauf",
    chapter: "Pilot",
    title: "So läuft ein Pilot ab",
    body: "Vom Erstgespräch bis zur gemeinsamen Auswertung in fünf Schritten. Nach jeder Phase entscheiden Sie, ob es weitergeht.",
    target: [tid("pilot-steps")],
    placement: "auto"
  },
  {
    id: "pilot-kontakt",
    chapter: "Pilot",
    title: "Lernen wir uns kennen",
    body: "Ein Erstgespräch kostet Sie ca. 20–30 Minuten. Wir zeigen die Demo und klären Ihre Fragen.",
    target: [tid("contact-card")],
    placement: "auto"
  },
  {
    id: "ende",
    chapter: "Pilot",
    title: "Das war die Tour",
    body: "Die Demo und alle Abschnitte stehen Ihnen weiter offen. Wenn Sie Pilotpartner werden möchten, freuen wir uns auf Ihre Nachricht.",
    target: null,
    placement: "center",
    cta: { label: "Erstgespräch vereinbaren", href: "#kontakt" }
  }
];
