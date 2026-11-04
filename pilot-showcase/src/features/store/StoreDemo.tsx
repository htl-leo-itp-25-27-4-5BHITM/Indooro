import { useMemo } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Maximize2, Radio } from "lucide-react";
import { Tag } from "../../components/ui/Tag";
import { entranceCell } from "../../domain/routing";
import { productsOnShelf, shelfName } from "../../data";
import { NavigationPanel, RouteLayer } from "../navigation";
import { ProductSearch } from "./ProductSearch";
import { ShoppingList } from "./ShoppingList";
import { StoreMap } from "./StoreMap";
import { useStoreDemo } from "./useStoreDemo";
import type { DemoTab } from "./useStoreDemo";

const EMPTY_SET: ReadonlySet<string> = new Set();

export function StoreDemo() {
  const demo = useStoreDemo();
  const reduce = useReducedMotion();
  const { market, sim, route } = demo;

  const productById = useMemo(() => new Map(market.products.map((p) => [p.id, p])), [market]);
  const start = useMemo(() => entranceCell(market.layout), [market]);

  const shelfProducts = demo.activeShelf
    ? { title: shelfName(market, demo.activeShelf), products: productsOnShelf(market, demo.activeShelf) }
    : null;

  const tabs: Array<{ id: DemoTab; label: string; icon: ReactNode; badge?: number }> = [
    { id: "suche", label: "Suche", icon: null },
    { id: "liste", label: "Einkaufsliste", icon: null, badge: demo.items.length },
    { id: "navigation", label: "Navigation", icon: null }
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,13fr)_minmax(0,7fr)] lg:gap-6" data-testid="store-demo">
      {/* Map column */}
      <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div role="radiogroup" aria-label="Demomarkt wählen" className="inline-flex rounded-full bg-white/5 p-1 ring-1 ring-white/10">
            {demo.markets.map((m) => {
              const on = m.code === market.code;
              return (
                <button
                  key={m.code}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-testid="market-switch"
                  data-market-code={m.code}
                  onClick={() => demo.setMarketCode(m.code)}
                  className={`relative h-10 rounded-full px-4 text-[13px] font-semibold transition-colors ${on ? "text-ink-950" : "text-ink-200 hover:text-white"}`}
                >
                  {on && (
                    <motion.span
                      layoutId="market-pill"
                      className="absolute inset-0 rounded-full bg-mint"
                      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }}
                    />
                  )}
                  <span className="relative">{m.name}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <ToggleChip
              pressed={demo.showBeacons}
              onClick={() => demo.setShowBeacons(!demo.showBeacons)}
              icon={<Radio className="size-4" aria-hidden />}
              testId="toggle-beacons"
            >
              Beacons anzeigen
            </ToggleChip>
            <ToggleChip
              pressed={demo.zoomToRoute}
              disabled={!route}
              onClick={() => demo.setZoomToRoute(!demo.zoomToRoute)}
              icon={<Maximize2 className="size-4" aria-hidden />}
              testId="toggle-zoom"
            >
              Route im Fokus
            </ToggleChip>
          </div>
        </div>

        <StoreMap
          market={market}
          selectedProductId={demo.selectedProductId}
          listLocations={demo.listPins}
          activeShelfId={demo.activeShelf?.id ?? null}
          showBeacons={demo.showBeacons}
          focusRect={demo.focusRect}
          onShelfClick={(shelf) => {
            demo.setActiveShelf(shelf);
            demo.setTab("suche");
          }}
        >
          <RouteLayer
            route={route}
            position={sim.position}
            activeStopIndex={sim.activeStopIndex}
            reachedStopIds={sim.reachedStopIds ?? EMPTY_SET}
            progress={sim.progress}
            start={start}
          />
        </StoreMap>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-xs text-ink-200">
          <Tag kind="fiktiv" onDark>
            Fiktiver Demomarkt
          </Tag>
          <span>
            {market.name} · ca. {market.areaSqm.toLocaleString("de-AT")} m²
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full bg-mint" /> Route
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full bg-amber" /> Gesuchtes Produkt
          </span>
          <span className="text-ink-300">Simulierte Position – keine Messung.</span>
        </div>
      </div>

      {/* Panel column */}
      <section aria-label="Suche, Einkaufsliste und Navigation" className="relative min-w-0">
        <div className="flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-ink-900/80 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)] lg:min-h-[36rem]">
          <div role="tablist" aria-label="Bereiche der Demo" className="grid shrink-0 grid-cols-3 gap-1 border-b border-white/8 p-1.5">
            {tabs.map((t) => {
              const on = demo.tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`demo-tab-${t.id}`}
                  aria-selected={on}
                  aria-controls={`demo-panel-${t.id}`}
                  data-testid={`tab-${t.id}`}
                  onClick={() => demo.setTab(t.id)}
                  className={`relative inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl px-2 text-[13px] font-semibold transition-colors ${
                    on ? "bg-white/10 text-white" : "text-ink-300 hover:text-white"
                  }`}
                >
                  {t.icon}
                  {t.id === "liste" ? (
                    <span className="truncate">
                      <span className="sm:hidden">Liste</span>
                      <span className="hidden sm:inline">{t.label}</span>
                    </span>
                  ) : (
                    <span className="truncate">{t.label}</span>
                  )}
                  {t.badge ? (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-mint px-1 text-[11px] font-bold tabular-nums text-ink-950" data-testid="tab-badge">
                      {t.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            id={`demo-panel-${demo.tab}`}
            aria-labelledby={`demo-tab-${demo.tab}`}
            className="min-h-0 flex-1 p-4"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${demo.tab}-${market.code}`}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: reduce ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
              >
                {demo.tab === "suche" && (
                  <ProductSearch
                    market={market}
                    selectedProductId={demo.selectedProductId}
                    onSelect={demo.selectProduct}
                    has={demo.has}
                    onAdd={demo.addProduct}
                    onRemove={demo.removeProduct}
                    shelfText={demo.shelfText}
                    shelfProducts={shelfProducts}
                    onClearShelf={() => demo.setActiveShelf(null)}
                  />
                )}
                {demo.tab === "liste" && (
                  <ShoppingList
                    items={demo.items}
                    productById={(id) => productById.get(id)}
                    shelfText={demo.shelfText}
                    visitNumber={demo.visitNumber}
                    routePlanned={Boolean(route)}
                    selectedProductId={demo.selectedProductId}
                    onSelect={demo.selectProduct}
                    onRemove={demo.removeProduct}
                    onQty={demo.setQty}
                    onClear={demo.clearList}
                    onLoadExample={demo.loadExample}
                    onGoSearch={() => demo.setTab("suche")}
                  />
                )}
                {demo.tab === "navigation" &&
                  (route ? (
                    <NavigationPanel route={route} sim={sim} describeStop={demo.describeStop} />
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/12 px-5 py-9 text-center" data-testid="nav-empty">
                      <p className="text-[15px] font-semibold text-white">Noch keine Route</p>
                      <p className="mx-auto mt-1 max-w-[18rem] text-xs leading-relaxed text-ink-200">
                        Legen Sie Produkte auf die Einkaufsliste. Indooro plant daraus den Weg vom Eingang bis zur Kasse.
                      </p>
                      <button
                        type="button"
                        data-testid="nav-load-example"
                        onClick={() => {
                          demo.loadExample();
                        }}
                        className="mt-5 h-10 rounded-full bg-mint px-4 text-[13px] font-semibold text-ink-950 transition hover:bg-mint-soft"
                      >
                        Beispielliste laden
                      </button>
                    </div>
                  ))}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </section>
    </div>
  );
}

function ToggleChip({
  pressed,
  onClick,
  icon,
  children,
  disabled,
  testId
}: {
  pressed: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      data-testid={testId}
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold ring-1 transition disabled:cursor-not-allowed disabled:opacity-40 ${
        pressed ? "bg-mint/15 text-mint ring-mint/40" : "bg-white/5 text-ink-200 ring-white/10 hover:text-white"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
