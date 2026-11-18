import type { Market, Product } from "../../domain/types";
import { createBuilder } from "../builder";
import { CATALOG } from "../catalog";
import { categoriesFor } from "../categories";

/**
 * Fictional market B: "Nahversorger Pöstlingberg" (DEMO-SUED), 24 m × 18 m ≈ 430 m².
 * Entrance bottom right, exit bottom left, vertical gondolas, partly different assortment
 * (no Körperpflege, no Hafermilch – but regional products such as Kürbiskernöl).
 */
const categories = categoriesFor(["110", "310", "320", "410", "420", "510", "610", "620", "630", "640", "650", "710", "720", "810"]);
const b = createBuilder(categories);

// Outer walls with exit (x 2–3) and entrance (x 19–21) in the bottom wall.
b.wall(0, 0, 24, 1);
b.wall(0, 1, 1, 16);
b.wall(23, 1, 1, 16);
b.wall(0, 17, 2, 1);
b.wall(4, 17, 15, 1);
b.wall(22, 17, 2, 1);
b.exit(2, 17, 2, 1);
b.entrance(19, 17, 3, 1);

// Back wall coolers.
b.shelf("cooler", "410", 1, 2, 1, 5, 2, "south");
b.shelf("cooler", "420", 1, 7, 1, 5, 2, "south");
b.shelf("cooler", "320", 1, 12, 1, 5, 2, "south");
b.shelf("cooler", "510", 1, 17, 1, 5, 2, "south");

// Left wall: bakery and drinks. Right wall: fresh produce next to the entrance.
b.shelf("fresh", "110", 1, 1, 5, 1, 6, "east");
b.shelf("shelf", "720", 1, 1, 11, 1, 4, "east");
b.shelf("fresh", "310", 1, 22, 5, 1, 5, "west");
b.shelf("fresh", "310", 2, 22, 10, 1, 5, "west");

// Vertical gondolas (4 m segments); west column accessed from the west, east column from the east.
const COLUMNS: Array<{ x: number; access: "west" | "east"; plan: Array<[string, number]> }> = [
  { x: 6, access: "west", plan: [["610", 1], ["610", 2]] },
  { x: 7, access: "east", plan: [["640", 1], ["650", 1]] },
  { x: 11, access: "west", plan: [["630", 1], ["630", 2]] },
  { x: 12, access: "east", plan: [["620", 1], ["620", 2]] },
  { x: 16, access: "west", plan: [["710", 1], ["710", 2]] },
  { x: 17, access: "east", plan: [["810", 1], ["810", 2]] }
];
for (const col of COLUMNS) {
  col.plan.forEach(([cat, meter], i) => b.shelf("shelf", cat, meter, col.x, 6 + i * 4, 1, 4, col.access));
}

[8, 11].forEach((x, i) => b.checkout(x, 15, i + 1));
const BEACONS: Array<[number, number]> = [
  [5, 3], [14, 4], [20, 4], [3, 9], [9, 9], [14, 9], [19, 10], [16, 15]
];
BEACONS.forEach(([x, y], i) => b.beacon(x, y, `B-${String(i + 1).padStart(2, "0")}`));

const PLACEMENT: Record<string, string> = {
  frischmilch: "410/1/1/1", naturjoghurt: "410/1/1/3", teebutter: "410/1/2/1", topfen: "410/1/2/3", schlagobers: "410/1/3/2",
  freilandeier: "420/1/1/1", gouda: "420/1/2/1", bergkaese: "420/1/2/3",
  faschiertes: "320/1/1/1", extrawurst: "320/1/1/3", wiener: "320/1/2/1", kaesekrainer: "320/1/2/3",
  pizza: "510/1/1/1", pommes: "510/1/1/3", vanilleeis: "510/1/2/2",
  semmeln: "110/1/1/1", bauernbrot: "110/1/1/3", salzstangerl: "110/1/2/2",
  lagerbier: "720/1/1/1", "gruener-veltliner": "720/1/2/1",
  tomaten: "310/1/1/1", salatgurke: "310/1/1/3", paprika: "310/1/2/1", zwiebeln: "310/1/2/3", aepfel: "310/1/3/2",
  erdaepfel: "310/2/1/1", karotten: "310/2/1/3", bananen: "310/2/2/1", zitronen: "310/2/2/3",
  spaghetti: "610/1/1/1", basmatireis: "610/1/1/3", mehl: "610/2/1/1", zucker: "610/2/1/3",
  olivenoel: "640/1/1/1", kuerbiskernoel: "640/1/1/3", salz: "640/1/2/2",
  "tomaten-passiert": "650/1/1/1", zuckermais: "650/1/1/3", thunfisch: "650/1/2/1", gulaschsuppe: "650/1/2/3",
  schokolade: "630/1/1/1", butterkekse: "630/1/1/3", chips: "630/2/1/1",
  filterkaffee: "620/1/1/1", muesli: "620/1/1/3", honig: "620/1/2/2", marillenmarmelade: "620/2/1/1", fruechtetee: "620/2/1/3",
  "mineralwasser-still": "710/1/1/1", apfelsaft: "710/1/1/3", orangensaft: "710/2/1/1", mostsaft: "710/2/1/3",
  toilettenpapier: "810/1/1/1", kuechenrolle: "810/1/1/3", spuelmittel: "810/2/1/2"
};

const products: Product[] = Object.entries(PLACEMENT).map(([slug, layoutCode]) => {
  const entry = CATALOG[slug];
  if (!entry) throw new Error(`Unknown catalog entry: ${slug}`);
  return { ...entry, layoutCode, categoryId: layoutCode.split("/")[0] };
});

export const poestlingbergMarket: Market = {
  id: "demo-sued",
  code: "DEMO-SUED",
  name: "Nahversorger Pöstlingberg",
  tagline: "Fiktiver Demomarkt · ca. 430 m² · Nahversorger",
  areaSqm: 430,
  layout: { shopName: "Nahversorger Pöstlingberg", gridSize: { width: 24, height: 18 }, elements: b.elements },
  categories,
  products
};
