import type { Market, Product } from "../../domain/types";
import { createBuilder } from "../builder";
import { CATALOG } from "../catalog";
import { categoriesFor } from "../categories";

/**
 * Fictional market A: "Frischmarkt Donaupark" (DEMO-NORD), 40 m × 26 m ≈ 1000 m².
 * Entrance bottom left, exit and four checkouts bottom right, coolers along the back wall,
 * three double-sided gondola rows with 2 m aisles and two cross aisles.
 */
const categories = categoriesFor(["110", "310", "320", "410", "420", "510", "610", "620", "630", "640", "650", "710", "720", "810", "820"]);
const b = createBuilder(categories);

// Outer walls with openings for entrance (x 2–4) and exit (x 34–36).
b.wall(0, 0, 40, 1);
b.wall(0, 1, 1, 24);
b.wall(39, 1, 1, 24);
b.wall(0, 25, 2, 1);
b.wall(5, 25, 29, 1);
b.wall(37, 25, 3, 1);
b.entrance(2, 25, 3, 1);
b.exit(34, 25, 3, 1);

// Back wall: bakery, meat, dairy, cheese, frozen (access from the south aisle y = 3–4).
b.shelf("fresh", "110", 1, 2, 1, 4, 2, "south");
b.shelf("fresh", "110", 2, 6, 1, 4, 2, "south");
b.shelf("cooler", "320", 1, 10, 1, 4, 2, "south");
b.shelf("cooler", "320", 2, 14, 1, 4, 2, "south");
b.shelf("cooler", "410", 1, 18, 1, 4, 2, "south");
b.shelf("cooler", "410", 2, 22, 1, 4, 2, "south");
b.shelf("cooler", "420", 1, 26, 1, 6, 2, "south");
b.shelf("cooler", "510", 1, 32, 1, 6, 2, "south");

// Right wall shelves (access from the west).
b.shelf("cooler", "510", 2, 38, 3, 1, 6, "west");
b.shelf("shelf", "820", 1, 38, 9, 1, 6, "west");
b.shelf("shelf", "820", 2, 38, 15, 1, 6, "west");

// Left wall shelves (access from the east); Obst & Gemüse starts right at the entrance.
b.shelf("shelf", "620", 1, 1, 5, 1, 6, "east");
b.shelf("shelf", "630", 1, 1, 11, 1, 6, "east");
b.shelf("fresh", "310", 3, 1, 17, 1, 6, "east");

// Gondola rows: x positions and widths of the five shelf segments, with 2 m cross aisles between.
const SEGMENTS: Array<[number, number]> = [
  [4, 6],
  [10, 6],
  [18, 6],
  [24, 6],
  [32, 4]
];
const rows: Array<{ y: number; access: "north" | "south"; plan: Array<[string, number]> }> = [
  { y: 5, access: "north", plan: [["610", 1], ["610", 2], ["610", 3], ["640", 1], ["640", 2]] },
  { y: 6, access: "south", plan: [["620", 2], ["620", 3], ["620", 4], ["630", 2], ["630", 3]] },
  { y: 9, access: "north", plan: [["630", 4], ["630", 5], ["610", 4], ["610", 5], ["640", 3]] },
  { y: 10, access: "south", plan: [["810", 1], ["810", 2], ["810", 3], ["820", 3], ["820", 4]] },
  { y: 13, access: "north", plan: [["710", 1], ["710", 2], ["710", 3], ["720", 1], ["720", 2]] },
  { y: 14, access: "south", plan: [["650", 1], ["650", 2], ["650", 3], ["650", 4], ["650", 5]] }
];
for (const row of rows) {
  row.plan.forEach(([cat, meter], i) => {
    const [x, w] = SEGMENTS[i];
    b.shelf("shelf", cat, meter, x, row.y, w, 1, row.access);
  });
}

// Fresh tables (Obst & Gemüse) near the entrance and a drinks island towards the checkouts.
b.shelf("fresh", "310", 1, 6, 18, 5, 1, "north");
b.shelf("fresh", "310", 2, 12, 18, 5, 1, "north");
b.shelf("shelf", "710", 4, 18, 18, 6, 1, "north");
b.shelf("shelf", "720", 3, 24, 18, 6, 1, "north");
b.shelf("shelf", "710", 5, 18, 19, 6, 1, "south");
b.shelf("shelf", "720", 4, 24, 19, 6, 1, "south");

// Checkouts and beacons.
[24, 27, 30, 33].forEach((x, i) => b.checkout(x, 22, i + 1));
const BEACONS: Array<[number, number]> = [
  [6, 3], [16, 4], [26, 3], [36, 4],
  [10, 7], [24, 8], [17, 12], [31, 12],
  [10, 16], [24, 15], [36, 16], [4, 21]
];
BEACONS.forEach(([x, y], i) => b.beacon(x, y, `B-${String(i + 1).padStart(2, "0")}`));

/** layoutCode per product ("<category>/<meter>/<level>/<slot>"). */
const PLACEMENT: Record<string, string> = {
  semmeln: "110/1/1/1", salzstangerl: "110/1/1/3", croissant: "110/1/2/1",
  bauernbrot: "110/2/1/1", vollkornbrot: "110/2/1/3", brezen: "110/2/2/2",
  faschiertes: "320/1/1/1", schnitzel: "320/1/1/3", huehnerbrust: "320/1/2/2",
  extrawurst: "320/2/1/1", kochschinken: "320/2/1/3", salami: "320/2/2/2", wiener: "320/2/3/1",
  frischmilch: "410/1/1/1", haltbarmilch: "410/1/1/3", hafermilch: "410/1/2/1", naturjoghurt: "410/1/3/1",
  fruchtjoghurt: "410/2/1/2", topfen: "410/2/1/4", schlagobers: "410/2/2/2", sauerrahm: "410/2/3/2", teebutter: "410/2/3/4",
  freilandeier: "420/1/1/1", gouda: "420/1/2/1", bergkaese: "420/1/2/3", mozzarella: "420/1/3/1", frischkaese: "420/1/3/3",
  pizza: "510/1/1/1", pommes: "510/1/1/3", fischstaebchen: "510/1/2/1",
  blattspinat: "510/2/1/1", vanilleeis: "510/2/2/1", gemuesemix: "510/2/2/3",
  tomaten: "310/1/1/1", salatgurke: "310/1/1/3", paprika: "310/1/2/1", kopfsalat: "310/1/2/3",
  erdaepfel: "310/2/1/1", zwiebeln: "310/2/1/3", karotten: "310/2/2/1", karfiol: "310/2/2/3",
  aepfel: "310/3/1/1", bananen: "310/3/1/3", marillen: "310/3/2/1", zitronen: "310/3/2/3", trauben: "310/3/3/1",
  spaghetti: "610/1/1/1", penne: "610/1/1/3", basmatireis: "610/2/1/1", mehl: "610/3/1/1", zucker: "610/4/1/1", semmelbroesel: "610/5/1/1",
  olivenoel: "640/1/1/1", sonnenblumenoel: "640/1/1/3", apfelessig: "640/2/1/1", salz: "640/2/2/1", pfeffer: "640/2/2/3", ketchup: "640/3/1/1", senf: "640/3/1/3",
  muesli: "620/1/1/1", haferflocken: "620/1/1/3", honig: "620/2/1/1", marillenmarmelade: "620/2/2/1", nougatcreme: "620/3/1/1", filterkaffee: "620/4/1/1", fruechtetee: "620/4/2/1",
  schokolade: "630/1/1/1", butterkekse: "630/2/1/1", chips: "630/3/1/1", fruchtgummi: "630/4/1/1", erdnuesse: "630/5/1/1", waffelschnitten: "630/5/2/1",
  "tomaten-passiert": "650/1/1/1", zuckermais: "650/2/1/1", kidneybohnen: "650/3/1/1", thunfisch: "650/4/1/1", gulaschsuppe: "650/5/1/1",
  "mineralwasser-still": "710/1/1/1", "mineralwasser-prickelnd": "710/2/1/1", apfelsaft: "710/3/1/1", orangensaft: "710/4/1/1", cola: "710/4/1/3", holundersirup: "710/5/1/1",
  lagerbier: "720/1/1/1", radler: "720/2/1/1", weissbier: "720/2/1/3", "gruener-veltliner": "720/3/1/1", zweigelt: "720/4/1/1",
  toilettenpapier: "810/1/1/1", kuechenrolle: "810/1/1/3", muellsaecke: "810/2/1/1", spuelmittel: "810/3/1/1", waschmittel: "810/3/2/1", putzschwaemme: "810/3/1/3",
  zahnpasta: "820/1/1/1", duschgel: "820/2/1/1", shampoo: "820/2/1/3", handseife: "820/3/1/1", deo: "820/4/1/1", taschentuecher: "820/4/1/3"
};

const products: Product[] = Object.entries(PLACEMENT).map(([slug, layoutCode]) => {
  const entry = CATALOG[slug];
  if (!entry) throw new Error(`Unknown catalog entry: ${slug}`);
  return { ...entry, layoutCode, categoryId: layoutCode.split("/")[0] };
});

export const donauparkMarket: Market = {
  id: "demo-nord",
  code: "DEMO-NORD",
  name: "Frischmarkt Donaupark",
  tagline: "Fiktiver Demomarkt · ca. 1.000 m² · Vollsortiment",
  areaSqm: 1000,
  layout: { shopName: "Frischmarkt Donaupark", gridSize: { width: 40, height: 26 }, elements: b.elements },
  categories,
  products
};
