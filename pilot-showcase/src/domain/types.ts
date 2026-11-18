/**
 * Shared domain contracts of the pilot showcase.
 *
 * The layout shape mirrors Indooro's persisted layout JSON (admin-ui/src/editor/model.ts,
 * swift/.../LayoutData.swift): elements on a metre grid with x/y/width/height and a `type`.
 * Products reference shelves via Indooro's `layoutCode` = "<category>/<meter>/<level>/<slot>",
 * matched exactly like backend ShelfMatching.java (category base + meter).
 *
 * Coordinates: 1 unit = 1 metre = 1 routing grid cell. Origin top-left, x to the right, y down.
 * All demo data is fictional.
 */

export interface Cell {
  x: number;
  y: number;
}

export type ElementType = "shelf" | "wall" | "checkout" | "entrance" | "exit" | "beacon" | "fresh" | "cooler";

export interface LayoutElement {
  id: number;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Visible name, e.g. "Obst & Gemüse". */
  label?: string;
  /** Indooro category base, first segment of a product layoutCode, e.g. "310". */
  category?: string;
  /** Shelf meter, second segment of a product layoutCode. */
  meter?: number;
  /** Beacon identity shown in the operator view, e.g. "B-07". Only for type "beacon". */
  beaconCode?: string;
  /** Side from which customers access the shelf. Used to pick the routing target cell. */
  access?: "north" | "south" | "east" | "west";
}

export interface StoreLayout {
  shopName: string;
  /** Size in metres (= grid cells). */
  gridSize: { width: number; height: number };
  elements: LayoutElement[];
}

export interface Category {
  id: string;
  name: string;
  /** CSS colour token used for the zone tint on the map (hex). */
  color: string;
}

export interface Product {
  id: string;
  name: string;
  brand?: string;
  /** Display price in EUR. Fictional. */
  price: number;
  unit?: string;
  /** Indooro layout code "<category>/<meter>/<level>/<slot>", e.g. "310/1/2/1". */
  layoutCode: string;
  categoryId: string;
  /** Extra search terms (synonyms, Austrian variants: "Paradeiser", "Erdäpfel" …). */
  keywords?: string[];
  /** Single emoji used as compact product visual. */
  emoji: string;
}

export interface Market {
  id: string;
  /** Short code as used in Indooro's storeCode scoping, e.g. "DEMO-NORD". */
  code: string;
  name: string;
  /** One line: size/type, always marked as fictional. */
  tagline: string;
  areaSqm: number;
  layout: StoreLayout;
  categories: Category[];
  products: Product[];
}

/** A product resolved to its place in the market. */
export interface ProductLocation {
  product: Product;
  shelf: LayoutElement;
  level: number;
  slot: number;
  /** Walkable cell in front of the shelf where the customer stands. */
  accessCell: Cell;
  /** Point on the shelf face (metres, may be fractional) used for the product pin. */
  pin: { x: number; y: number };
}

export interface RouteStop {
  id: string;
  /** Walkable target cell. */
  cell: Cell;
  label: string;
}

export interface PlannedRoute {
  /** Stops in visiting order (reachable only). */
  order: RouteStop[];
  /** legs[i] leads to order[i]; the last leg (if `end` was given) leads to the end cell. */
  legs: Cell[][];
  /** Full cell path from start to end, consecutive duplicates removed. */
  path: Cell[];
  unreachable: RouteStop[];
  /** Total walking distance in metres. */
  totalMeters: number;
}
