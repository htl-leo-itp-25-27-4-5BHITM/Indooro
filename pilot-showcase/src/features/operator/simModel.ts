/** Fiktiver Simulationszustand des Betreiber-Ablaufs. Alle Daten sind erfunden. */

export interface SimShelf {
  id: string;
  /** Layout-Code "kategorie/meter", z. B. "110/1". */
  category: string;
  label: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SimBeacon {
  code: string;
  x: number;
  y: number;
  major: number | null;
  minor: number | null;
}

export interface SimProduct {
  /** Datei-Zeile der CSV (Kopfzeile = 1). */
  line: number;
  id: string;
  name: string;
  emoji: string;
  layoutCode: string;
}

export interface SimMarket {
  name: string;
  code: string;
  address: string;
}

export interface SimState {
  market: SimMarket;
  gridWidth: number;
  gridHeight: number;
  entranceCount: number;
  layoutActive: boolean;
  shelves: SimShelf[];
  beacons: SimBeacon[];
  products: SimProduct[];
  /** Abdeckungsradius in Metern (Marktprofil). */
  radius: number;
}

export const COVERAGE_RADIUS_M = 8;
export const MIN_BEACONS_PER_CELL = 3;
export const MAX_LOW_COVERAGE_SHARE = 0.05;

export const DEFAULT_MARKET: SimMarket = {
  name: "Fiktiver Demomarkt Linz-Mitte",
  code: "DEMO-LZ-001",
  address: "Beispielgasse 1, 4020 Linz"
};

const SHELF_DEFS: [string, string, number, number][] = [
  ["110/1", "Gang 1 · links · Obst & Gemüse", 1, 1],
  ["120/1", "Gang 1 · rechts · Brot & Backwaren", 7, 1],
  ["210/1", "Gang 2 · links · Milchprodukte", 1, 3],
  ["220/1", "Gang 2 · rechts · Getränke", 7, 3],
  ["310/1", "Gang 3 · links · Nudeln & Konserven", 1, 5],
  ["320/1", "Gang 3 · rechts · Snacks & Süßes", 7, 5]
];

export const SHELVES: SimShelf[] = SHELF_DEFS.map(([category, label, x, y]) => ({
  id: `S-${category}`,
  category,
  label,
  x,
  y,
  w: 5,
  h: 1
}));

export const BEACONS: SimBeacon[] = [
  { code: "DEMO-B1", x: 0.5, y: 2.5, major: 10, minor: 1 },
  { code: "DEMO-B2", x: 13.5, y: 2.5, major: 10, minor: 2 },
  { code: "DEMO-B3", x: 6.5, y: 5.5, major: null, minor: null },
  { code: "DEMO-B4", x: 0.5, y: 7.5, major: 10, minor: 4 },
  { code: "DEMO-B5", x: 13.5, y: 7.5, major: 10, minor: 5 },
  { code: "DEMO-B6", x: 6.5, y: 0.5, major: 10, minor: 6 }
];

/** Fiktive CSV: Datei-Zeile 7 zeigt auf das nicht vorhandene Regal 520/9. */
export const PRODUCTS: SimProduct[] = [
  { line: 2, id: "1", name: "Bio Äpfel 1 kg", emoji: "🍎", layoutCode: "110/1" },
  { line: 3, id: "2", name: "Salatgurke", emoji: "🥒", layoutCode: "110/1" },
  { line: 4, id: "3", name: "Bauernbrot 500 g", emoji: "🍞", layoutCode: "120/1" },
  { line: 5, id: "4", name: "Vollmilch 1 l", emoji: "🥛", layoutCode: "210/1" },
  { line: 6, id: "5", name: "Naturjoghurt 500 g", emoji: "🥣", layoutCode: "210/1" },
  { line: 7, id: "6", name: "Mineralwasser still 1,5 l", emoji: "💧", layoutCode: "520/9" },
  { line: 8, id: "7", name: "Apfelsaft naturtrüb 1 l", emoji: "🧃", layoutCode: "220/1" },
  { line: 9, id: "8", name: "Spaghetti 500 g", emoji: "🍝", layoutCode: "310/1" }
];

/** Produkte, die der Betreiber im Schritt „Beheben“ für das leere Regal ergänzen kann. */
export const EXTRA_SNACK_PRODUCTS: SimProduct[] = [
  { line: 10, id: "9", name: "Salzbrezeln 200 g", emoji: "🥨", layoutCode: "320/1" },
  { line: 11, id: "10", name: "Zartbitterschokolade 100 g", emoji: "🍫", layoutCode: "320/1" }
];

export function createInitialState(market: SimMarket = DEFAULT_MARKET): SimState {
  return {
    market,
    gridWidth: 14,
    gridHeight: 9,
    entranceCount: 1,
    layoutActive: true,
    shelves: SHELVES.map((s) => ({ ...s })),
    beacons: BEACONS.map((b) => ({ ...b })),
    products: PRODUCTS.map((p) => ({ ...p })),
    radius: COVERAGE_RADIUS_M
  };
}
