import { fetchLayout, fetchStores, searchProducts } from "./api.js";
import { anchorPoint, entrancePoint } from "./layout.js";
import { addItem, deserialize, planList, serialize, toggleDone } from "./list.js";
import { createMap } from "./map.js";
import { describeProduct, findShelf, NOT_IN_TEST_AREA } from "./shelf-text.js";

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;
const PRICE_FORMAT = new Intl.NumberFormat("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");

const $ = (id) => document.getElementById(id);
const isObject = (value) => value !== null && typeof value === "object";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function button(label, className, onClick) {
  const node = el("button", className, label);
  node.type = "button";
  if (onClick) node.addEventListener("click", onClick);
  return node;
}

const dom = {
  title: $("shopNameDisplay"),
  switchStore: $("switch-store"),
  views: { status: $("view-status"), stores: $("view-stores"), finder: $("view-finder") },
  statusMessage: $("status-message"),
  statusActions: $("status-actions"),
  storeNote: $("store-note"),
  storeList: $("store-list"),
  finderNote: $("finder-note"),
  searchForm: $("search-form"),
  searchInput: $("search-input"),
  clearSearch: $("clear-search"),
  searchStatus: $("search-status"),
  searchActions: $("search-actions"),
  results: $("search-results-panel"),
  mapSection: $("map-section"),
  mapViewport: $("map-viewport"),
  mapCanvas: $("mapCanvas"),
  zoomIn: $("zoom-in"),
  zoomOut: $("zoom-out"),
  zoomReset: $("zoom-reset"),
  zoomLabel: $("zoom-label"),
  listItems: $("list-items"),
  listEmpty: $("list-empty"),
  clearList: $("clear-list")
};

const state = {
  stores: null,
  store: null,
  layout: null,
  anchorId: null,
  list: [],
  plan: null,
  highlight: null,
  map: null,
  searchQuery: "",
  searchController: null,
  searchSeq: 0,
  debounceTimer: 0,
  resultSyncs: []
};

// ---- storage (sessionStorage only, every access guarded) -------------------

function readStorage(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Quota exceeded or storage disabled: the page keeps working without it.
  }
}

const listKey = (storeCode) => `indooro.list.${storeCode}`;
const layoutKey = (storeCode) => `indooro.layout.${storeCode}`;

function loadList(storeCode) {
  return deserialize(readStorage(listKey(storeCode)) ?? "");
}

function persistList() {
  if (state.store) writeStorage(listKey(state.store.storeCode), serialize(state.list));
}

function readCachedLayout(storeCode) {
  const raw = readStorage(layoutKey(storeCode));
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return isObject(data) && isObject(data.layout) ? data : null;
  } catch {
    return null;
  }
}

// ---- view helpers -----------------------------------------------------------

function showView(name) {
  for (const [key, node] of Object.entries(dom.views)) node.hidden = key !== name;
}

function setTitle(text) {
  dom.title.textContent = text;
}

function setStatus(message, actions = []) {
  dom.statusMessage.textContent = message;
  dom.statusActions.replaceChildren(...actions);
  showView("status");
}

function formatPrice(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? `€ ${PRICE_FORMAT.format(number)}` : null;
}

function startPoint() {
  const elements = state.layout?.elements ?? [];
  return anchorPoint(elements, state.anchorId) || entrancePoint(elements) || null;
}

function routePoints(plan) {
  const points = [];
  for (const leg of plan.legs) {
    for (const cell of leg) {
      const point = { x: cell.x + 0.5, y: cell.y + 0.5 };
      const last = points.at(-1);
      if (!last || last.x !== point.x || last.y !== point.y) points.push(point);
    }
  }
  return points;
}

// ---- store selection --------------------------------------------------------

async function loadStores() {
  if (!state.stores) state.stores = await fetchStores();
  return state.stores;
}

async function start() {
  const params = new URLSearchParams(window.location.search);
  const code = (params.get("store") || "").trim();
  state.anchorId = (params.get("a") || "").trim() || null;

  if (!code) {
    await showStoreList();
    return;
  }

  setStatus("Markt wird geladen …");
  let stores;
  try {
    stores = await loadStores();
  } catch {
    const cached = readCachedLayout(code);
    if (cached) {
      openFinder({ id: cached.storeId, storeCode: code, name: "" }, cached, true);
      return;
    }
    await showStoreList({ error: true });
    return;
  }

  const wanted = code.toLowerCase();
  const store = stores.find((candidate) => String(candidate.storeCode ?? "").toLowerCase() === wanted);
  if (!store) {
    await showStoreList({ note: `Markt „${code}“ nicht gefunden – bitte Markt wählen.` });
    return;
  }
  await openStore(store);
}

async function showStoreList({ note = "", error = false } = {}) {
  cancelSearch();
  state.store = null;
  state.highlight = null;
  dom.switchStore.hidden = true;
  setTitle("Markt wählen");
  document.title = "Indooro – Markt wählen";

  if (error) {
    setStatus("Die Märkte konnten nicht geladen werden. Bitte prüfen Sie Ihre Verbindung.", [
      button("Erneut versuchen", "btn btn-primary", () => start())
    ]);
    return;
  }

  let stores;
  try {
    stores = await loadStores();
  } catch {
    setStatus("Die Märkte konnten nicht geladen werden. Bitte prüfen Sie Ihre Verbindung.", [
      button("Erneut versuchen", "btn btn-primary", () => start())
    ]);
    return;
  }

  dom.storeList.replaceChildren();
  if (stores.length === 0) {
    dom.storeList.append(el("li", "hint", "Derzeit ist kein Markt verfügbar."));
  }
  for (const store of stores) {
    const code = String(store.storeCode ?? "");
    const meta = [store.city, store.address].filter((value) => typeof value === "string" && value).join(" · ");
    const choice = button("", "store-btn", () => pickStore(store));
    choice.append(el("span", "store-name", store.name || code), el("span", "store-meta", meta));
    const row = el("li");
    row.append(choice);
    dom.storeList.append(row);
  }

  dom.storeNote.textContent = note;
  dom.storeNote.hidden = !note;
  showView("stores");
}

function pickStore(store) {
  window.history.replaceState(null, "", `${window.location.pathname}?store=${encodeURIComponent(String(store.storeCode))}`);
  state.anchorId = null;
  openStore(store);
}

function switchStore() {
  window.history.replaceState(null, "", window.location.pathname);
  state.anchorId = null;
  showStoreList();
}

async function openStore(store) {
  setStatus("Ladenplan wird geladen …");
  let data;
  let offline = false;
  try {
    data = await fetchLayout(store.id);
    writeStorage(layoutKey(store.storeCode), JSON.stringify(data));
  } catch {
    data = readCachedLayout(store.storeCode);
    if (!data) {
      setStatus("Der Ladenplan konnte nicht geladen werden. Bitte erneut versuchen.", [
        button("Erneut versuchen", "btn btn-primary", () => openStore(store)),
        button("Markt wechseln", "btn", () => switchStore())
      ]);
      return;
    }
    offline = true;
  }
  openFinder(store, data, offline);
}

// ---- finder -----------------------------------------------------------------

function openFinder(store, data, offline) {
  cancelSearch();
  state.store = store;
  state.layout = data.layout;
  state.highlight = null;
  state.list = loadList(store.storeCode);

  const shopName = data.layout.shopName || store.name || store.storeCode || "Indooro";
  setTitle(shopName);
  document.title = `${shopName} – Produktsuche`;
  dom.switchStore.hidden = false;

  dom.finderNote.textContent = offline ? "Keine Verbindung – gespeicherter Ladenplan wird angezeigt." : "";
  dom.finderNote.hidden = !offline;
  dom.searchInput.value = "";
  dom.clearSearch.hidden = true;
  clearResults();
  setSearchStatus("");

  showView("finder");
  refreshList();
}

// ---- search -----------------------------------------------------------------

function setSearchStatus(message, actions = []) {
  dom.searchStatus.textContent = message;
  dom.searchActions.replaceChildren(...actions);
}

function clearResults() {
  state.resultSyncs = [];
  dom.results.replaceChildren();
}

function cancelSearch() {
  clearTimeout(state.debounceTimer);
  state.searchSeq += 1;
  if (state.searchController) state.searchController.abort();
  state.searchController = null;
}

function onSearchInput() {
  dom.clearSearch.hidden = dom.searchInput.value === "";
  clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(() => runSearch(dom.searchInput.value), SEARCH_DEBOUNCE_MS);
}

function runSearch(raw) {
  const query = raw.trim();
  cancelSearch();
  state.searchQuery = query;
  clearResults();

  if (query.length < MIN_QUERY_LENGTH) {
    setSearchStatus(query ? "Bitte mindestens 2 Zeichen eingeben." : "");
    return;
  }
  if (!state.store) return;

  const controller = new AbortController();
  const seq = state.searchSeq;
  state.searchController = controller;
  setSearchStatus("Suche läuft …");

  const retry = button("Erneut versuchen", "btn btn-primary", () => runSearch(state.searchQuery));

  searchProducts(query, state.store.storeCode, controller.signal).then(
    (products) => {
      if (seq !== state.searchSeq) return;
      state.searchController = null;
      renderResults(query, products);
    },
    (error) => {
      if (seq !== state.searchSeq || error?.name === "AbortError") return;
      state.searchController = null;
      if (error?.kind === "empty") {
        renderResults(query, []);
      } else if (error?.kind === "network") {
        setSearchStatus("Keine Verbindung. Bitte erneut versuchen.", [retry]);
      } else {
        setSearchStatus("Suche gerade nicht möglich.", [retry]);
      }
    }
  );
}

function renderResults(query, products) {
  clearResults();
  if (products.length === 0) {
    setSearchStatus(`Nichts gefunden für „${query}“.`);
    return;
  }
  setSearchStatus(`${products.length} ${products.length === 1 ? "Produkt" : "Produkte"} gefunden.`);
  dom.results.append(...products.map(buildResultCard));
}

function buildResultCard(product) {
  const item = el("li", "result");
  const body = el("div", "result-body");
  body.append(el("h3", "product-name", product.name ?? ""));

  const price = formatPrice(product.price);
  if (price) body.append(el("p", "product-price", price));

  const elements = state.layout.elements;
  const shelf = describeProduct(product.layoutCode, elements);
  const shelfElement = findShelf(product.layoutCode, elements);
  if (shelf) {
    const primary = el("p", "shelf-text");
    primary.append(el("strong", "", shelf.primary));
    body.append(primary);
    if (shelf.detail) body.append(el("p", "shelf-detail", shelf.detail));
  } else {
    body.append(el("p", "result-missing", NOT_IN_TEST_AREA));
  }

  const actions = el("div", "result-actions");
  if (shelfElement) {
    actions.append(button("Auf Karte zeigen", "btn btn-primary", () => showOnMap(shelfElement)));
  }
  const listButton = button("Zur Liste", "btn", () => addToList(product));
  const sync = () => {
    const inList = state.list.some((entry) => entry.id === product.id);
    listButton.textContent = inList ? "In der Liste" : "Zur Liste";
    listButton.disabled = inList;
  };
  sync();
  state.resultSyncs.push(sync);
  actions.append(listButton);

  item.append(body, actions);
  return item;
}

function showOnMap(shelfElement) {
  state.highlight = shelfElement;
  state.map.setScene({
    layout: state.layout,
    highlight: shelfElement,
    route: routePoints(state.plan),
    start: startPoint(),
    focus: true
  });
  dom.mapSection.scrollIntoView({ behavior: REDUCED_MOTION.matches ? "auto" : "smooth", block: "start" });
}

// ---- shopping list ----------------------------------------------------------

function addToList(product) {
  const item = {
    id: product.id,
    name: String(product.name ?? ""),
    layoutCode: typeof product.layoutCode === "string" ? product.layoutCode : ""
  };
  mutateList(addItem(state.list, item));
}

function mutateList(next) {
  state.list = next;
  persistList();
  refreshList();
}

function refreshList() {
  const start = startPoint();
  const plan = planList(state.list, state.layout, start);
  state.plan = plan;
  renderListItems(plan);
  for (const sync of state.resultSyncs) sync();
  state.map.setScene({
    layout: state.layout,
    highlight: state.highlight,
    route: routePoints(plan),
    start,
    focus: false
  });
}

function buildListItem(entry, index) {
  const { item } = entry;
  const row = el("li", entry.done ? "list-item is-done" : "list-item");
  const body = el("div", "list-body");
  body.append(el("p", "list-name", item.name));
  if (entry.text) {
    const primary = el("p", "shelf-text");
    primary.append(el("strong", "", entry.text.primary));
    body.append(primary);
    if (entry.text.detail) body.append(el("p", "shelf-detail", entry.text.detail));
  } else {
    body.append(el("p", "result-missing", NOT_IN_TEST_AREA));
  }

  const actions = el("div", "list-actions");
  const done = button("Erledigt", "btn btn-toggle", () => mutateList(toggleDone(state.list, item.id)));
  done.setAttribute("aria-pressed", String(entry.done));
  const remove = button("Entfernen", "btn btn-link", () =>
    mutateList(state.list.filter((candidate) => candidate.id !== item.id))
  );
  actions.append(done, remove);

  row.append(el("span", "step", String(index + 1)), body, actions);
  return row;
}

function renderListItems(plan) {
  dom.listItems.replaceChildren(...plan.entries.map(buildListItem));
  dom.listEmpty.hidden = plan.entries.length > 0;
  dom.clearList.disabled = plan.entries.length === 0;
}

// ---- wiring -----------------------------------------------------------------

function init() {
  state.map = createMap({
    viewport: dom.mapViewport,
    stage: dom.mapCanvas,
    zoomLabel: dom.zoomLabel,
    zoomIn: dom.zoomIn,
    zoomOut: dom.zoomOut,
    zoomReset: dom.zoomReset
  });

  dom.switchStore.addEventListener("click", switchStore);
  dom.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runSearch(dom.searchInput.value);
  });
  dom.searchInput.addEventListener("input", onSearchInput);
  dom.clearSearch.addEventListener("click", () => {
    dom.searchInput.value = "";
    dom.clearSearch.hidden = true;
    runSearch("");
  });
  dom.clearList.addEventListener("click", () => {
    if (state.list.length > 0) mutateList([]);
  });

  start();
}

init();
