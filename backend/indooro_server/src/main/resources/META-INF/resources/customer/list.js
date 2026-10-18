import { accessCell, buildGrid, cellOf, centerOf, entrancePoint } from "./layout.js";
import { describe as describeShelf, findShelf } from "./shelf-text.js";
import { orderStops } from "./route.js";

const isObject = (value) => value !== null && typeof value === "object";
const asList = (list) => (Array.isArray(list) ? list.filter(isObject) : []);

export function addItem(list, item) {
  const items = asList(list);
  if (!isObject(item) || item.id == null) return items.slice();
  if (items.some((entry) => entry.id === item.id)) return items.slice();
  return [...items, { ...item, done: false }];
}

export function removeItem(list, id) {
  return asList(list).filter((entry) => entry.id !== id);
}

export function toggleDone(list, id) {
  return asList(list).map((entry) => (entry.id === id ? { ...entry, done: !entry.done } : entry));
}

// Open items are routed from the start point (entrance by default), then done items,
// then items without a shelf/cell. Layout-less start falls back to cell (0,0).
export function planList(list, layout, startPoint) {
  const elements = Array.isArray(layout?.elements) ? layout.elements : [];
  const grid = buildGrid(layout);
  const start = cellOf(startPoint ?? entrancePoint(elements) ?? { x: 0, y: 0 }, grid);

  const stops = [];
  const doneEntries = [];
  const missingEntries = [];
  for (const item of asList(list)) {
    const shelf = findShelf(item.layoutCode, elements);
    const cell = shelf ? (accessCell(grid, shelf) ?? cellOf(centerOf(shelf), grid)) : null;
    const described = shelf ? describeShelf(item.layoutCode, shelf) : null;
    const entry = {
      item,
      shelf,
      text: described ? { primary: described.primary, detail: described.detail } : null,
      cell,
      done: item.done === true
    };
    if (!shelf || !cell) missingEntries.push(entry);
    else if (entry.done) doneEntries.push(entry);
    else stops.push({ id: item.id, cell, entry });
  }

  const routed = orderStops(grid, start, stops);
  return {
    entries: [
      ...routed.order.map((stop) => stop.entry),
      ...routed.unreachable.map((stop) => stop.entry),
      ...doneEntries,
      ...missingEntries
    ],
    legs: routed.legs,
    notFound: missingEntries.map((entry) => entry.item)
  };
}

export function serialize(list) {
  return JSON.stringify(asList(list));
}

const isValidItem = (entry) =>
  isObject(entry) &&
  ((typeof entry.id === "string" && entry.id !== "") || Number.isFinite(entry.id)) &&
  typeof entry.name === "string" &&
  typeof entry.layoutCode === "string";

export function deserialize(str) {
  let data;
  try {
    data = JSON.parse(str);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const seen = new Set();
  const items = [];
  for (const entry of data) {
    if (!isValidItem(entry) || seen.has(entry.id)) continue;
    seen.add(entry.id);
    items.push({ ...entry, done: entry.done === true });
  }
  return items;
}
