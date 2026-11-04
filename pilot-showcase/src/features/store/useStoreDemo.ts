import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LayoutElement, Market, PlannedRoute, Product, ProductLocation, RouteStop } from "../../domain/types";
import { buildGrid, checkoutCell, entranceCell, planRoute } from "../../domain/routing";
import { useNavigationSimulation } from "../navigation";
import type { NavigationSimulation } from "../navigation";
import { DEFAULT_MARKET, MARKETS, describeLocation, getMarketByCode, locateProduct } from "../../data";
import type { ListPin, MapRect } from "./StoreMap";

export interface ListItem {
  productId: string;
  qty: number;
}

export type DemoTab = "suche" | "liste" | "navigation";

const EXAMPLE_LISTS: Record<string, string[]> = {
  "DEMO-NORD": ["tomaten", "frischmilch", "semmeln", "spaghetti", "vanilleeis", "filterkaffee", "mineralwasser-still"],
  "DEMO-SUED": ["semmeln", "frischmilch", "tomaten", "filterkaffee", "toilettenpapier", "mineralwasser-still"]
};

const MAX_QTY = 9;
const storageKey = (code: string) => `indooro-pilot-demo-list:${code}`;

function readList(market: Market): ListItem[] {
  try {
    const raw = window.localStorage.getItem(storageKey(market.code));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const known = new Set(market.products.map((p) => p.id));
    return parsed
      .filter((i): i is ListItem => Boolean(i) && typeof i.productId === "string" && known.has(i.productId))
      .map((i) => ({ productId: i.productId, qty: Math.min(MAX_QTY, Math.max(1, Math.round(Number(i.qty)) || 1)) }));
  } catch {
    return [];
  }
}

function writeList(market: Market, items: ListItem[]) {
  try {
    window.localStorage.setItem(storageKey(market.code), JSON.stringify(items));
  } catch {
    /* storage unavailable – the demo still works without persistence */
  }
}

function initialMarket(): Market {
  try {
    return getMarketByCode(new URLSearchParams(window.location.search).get("markt")) ?? DEFAULT_MARKET;
  } catch {
    return DEFAULT_MARKET;
  }
}

function syncUrl(market: Market) {
  try {
    const url = new URL(window.location.href);
    if (market.code === DEFAULT_MARKET.code && !url.searchParams.has("markt")) return;
    url.searchParams.set("markt", market.code);
    window.history.replaceState(window.history.state, "", url);
  } catch {
    /* ignore */
  }
}

/** Bounding box of the route, padded and expanded to the map's aspect ratio. */
function routeFocus(route: PlannedRoute | null, market: Market): MapRect | null {
  if (!route || route.path.length < 2) return null;
  const { width: W, height: H } = market.layout.gridSize;
  const pad = 0.9;
  const full = { w: W + pad * 2, h: H + pad * 2 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of route.path) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + 1);
    maxY = Math.max(maxY, c.y + 1);
  }
  const m = 3;
  let w = maxX - minX + m * 2;
  let h = maxY - minY + m * 2;
  const aspect = full.w / full.h;
  if (w / h < aspect) w = h * aspect;
  else h = w / aspect;
  if (w >= full.w || h >= full.h) return null;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const x = Math.min(W + pad - w, Math.max(-pad, cx - w / 2));
  const y = Math.min(H + pad - h, Math.max(-pad, cy - h / 2));
  return { x, y, width: w, height: h };
}

export interface StoreDemo {
  markets: readonly Market[];
  market: Market;
  setMarketCode(code: string): void;
  tab: DemoTab;
  setTab(tab: DemoTab): void;
  selectedProductId: string | null;
  selectProduct(id: string | null): void;
  activeShelf: LayoutElement | null;
  setActiveShelf(shelf: LayoutElement | null): void;
  items: ListItem[];
  itemCount: number;
  has(productId: string): boolean;
  addProduct(productId: string): void;
  removeProduct(productId: string): void;
  setQty(productId: string, qty: number): void;
  clearList(): void;
  loadExample(): void;
  locationOf(product: Product): ProductLocation | undefined;
  shelfText(product: Product): string;
  route: PlannedRoute | null;
  sim: NavigationSimulation;
  /** 1-based visiting number of a list product (route order), falling back to list position. */
  visitNumber(productId: string): number;
  listPins: ListPin[];
  describeStop(stopId: string): { title: string; subtitle: string; emoji: string } | undefined;
  showBeacons: boolean;
  setShowBeacons(v: boolean): void;
  zoomToRoute: boolean;
  setZoomToRoute(v: boolean): void;
  focusRect: MapRect | null;
}

export function useStoreDemo(): StoreDemo {
  const [market, setMarket] = useState<Market>(initialMarket);
  const [items, setItems] = useState<ListItem[]>(() => readList(initialMarket()));
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [activeShelf, setActiveShelf] = useState<LayoutElement | null>(null);
  const [tab, setTab] = useState<DemoTab>("suche");
  const [showBeacons, setShowBeacons] = useState(false);
  const [zoomToRoute, setZoomToRoute] = useState(false);

  useEffect(() => {
    syncUrl(market);
  }, [market]);

  useEffect(() => {
    writeList(market, items);
  }, [items, market]);

  const setMarketCode = useCallback(
    (code: string) => {
      const next = MARKETS.find((m) => m.code === code);
      if (!next || next.code === market.code) return;
      setMarket(next);
      setItems(readList(next));
      setSelectedProductId(null);
      setActiveShelf(null);
      setZoomToRoute(false);
      setTab("suche");
    },
    [market.code]
  );

  const productById = useMemo(() => new Map(market.products.map((p) => [p.id, p])), [market]);
  const locations = useMemo(() => {
    const m = new Map<string, ProductLocation>();
    for (const p of market.products) {
      const loc = locateProduct(market, p);
      if (loc) m.set(p.id, loc);
    }
    return m;
  }, [market]);

  const grid = useMemo(() => buildGrid(market.layout), [market]);

  const stops = useMemo<RouteStop[]>(
    () =>
      items.flatMap((item) => {
        const loc = locations.get(item.productId);
        return loc ? [{ id: item.productId, cell: loc.accessCell, label: loc.product.name }] : [];
      }),
    [items, locations]
  );

  const route = useMemo<PlannedRoute | null>(() => {
    if (stops.length === 0) return null;
    return planRoute(grid, entranceCell(market.layout), stops, checkoutCell(market.layout));
  }, [grid, market, stops]);

  const sim = useNavigationSimulation(route);
  const simRef = useRef(sim);
  simRef.current = sim;
  useEffect(() => {
    simRef.current.reset();
  }, [route]);

  const visitNumber = useCallback(
    (productId: string) => {
      const idx = route?.order.findIndex((s) => s.id === productId) ?? -1;
      if (idx >= 0) return idx + 1;
      return items.findIndex((i) => i.productId === productId) + 1;
    },
    [items, route]
  );

  const addProduct = useCallback((productId: string) => {
    setItems((prev) => (prev.some((i) => i.productId === productId) ? prev : [...prev, { productId, qty: 1 }]));
  }, []);
  const removeProduct = useCallback((productId: string) => setItems((prev) => prev.filter((i) => i.productId !== productId)), []);
  const setQty = useCallback(
    (productId: string, qty: number) =>
      setItems((prev) =>
        qty < 1 ? prev.filter((i) => i.productId !== productId) : prev.map((i) => (i.productId === productId ? { ...i, qty: Math.min(MAX_QTY, qty) } : i))
      ),
    []
  );
  const clearList = useCallback(() => setItems([]), []);
  const loadExample = useCallback(() => {
    const ids = (EXAMPLE_LISTS[market.code] ?? []).filter((id) => productById.has(id));
    setItems(ids.map((productId) => ({ productId, qty: 1 })));
  }, [market.code, productById]);

  const listPins = useMemo<ListPin[]>(() => {
    const pins: ListPin[] = [];
    for (const item of items) {
      const location = locations.get(item.productId);
      if (location) pins.push({ location, number: visitNumber(item.productId) });
    }
    return pins;
  }, [items, locations, visitNumber]);

  const locationOf = useCallback((product: Product) => locations.get(product.id), [locations]);
  const shelfText = useCallback(
    (product: Product) => {
      const loc = locations.get(product.id);
      return loc ? describeLocation(market, loc) : "";
    },
    [locations, market]
  );

  const describeStop = useCallback(
    (stopId: string) => {
      const product = productById.get(stopId);
      if (!product) return undefined;
      return { title: product.name, subtitle: shelfText(product), emoji: product.emoji };
    },
    [productById, shelfText]
  );

  const has = useCallback((id: string) => items.some((i) => i.productId === id), [items]);
  const focusRect = useMemo(() => (zoomToRoute ? routeFocus(route, market) : null), [zoomToRoute, route, market]);

  return {
    markets: MARKETS,
    market,
    setMarketCode,
    tab,
    setTab,
    selectedProductId,
    selectProduct: setSelectedProductId,
    activeShelf,
    setActiveShelf,
    items,
    itemCount: items.reduce((n, i) => n + i.qty, 0),
    has,
    addProduct,
    removeProduct,
    setQty,
    clearList,
    loadExample,
    locationOf,
    shelfText,
    route,
    sim,
    visitNumber,
    listPins,
    describeStop,
    showBeacons,
    setShowBeacons,
    zoomToRoute,
    setZoomToRoute,
    focusRect
  };
}
