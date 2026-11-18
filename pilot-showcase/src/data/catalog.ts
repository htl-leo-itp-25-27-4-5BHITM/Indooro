import type { Product } from "../domain/types";

/**
 * Fictional product catalog shared by both demo markets. The placement (layoutCode) is market
 * specific and defined in src/data/markets/*.ts. Brands are generic or invented – no real brands.
 */
export type CatalogEntry = Omit<Product, "layoutCode" | "categoryId">;

const e = (id: string, name: string, brand: string | undefined, price: number, unit: string, emoji: string, keywords: string[] = []): CatalogEntry => ({
  id,
  name,
  brand,
  price,
  unit,
  emoji,
  keywords
});

const HM = "Hausmarke";
const BIO = "Bio Regional";
const BAK = "Bäckerei Hausmarke";

export const CATALOG: Record<string, CatalogEntry> = Object.fromEntries(
  [
    // Brot & Gebäck
    e("semmeln", "Semmeln 6er", BAK, 2.49, "6 Stk.", "🥖", ["Brötchen", "Weckerl", "Gebäck", "Frühstückssemmel"]),
    e("bauernbrot", "Bauernbrot", BAK, 3.69, "750 g", "🍞", ["Brot", "Roggenbrot", "Sauerteigbrot"]),
    e("vollkornbrot", "Vollkornbrot", BIO, 3.49, "500 g", "🍞", ["Brot", "Körnerbrot", "Schnittbrot"]),
    e("salzstangerl", "Salzstangerl 4er", BAK, 2.29, "4 Stk.", "🥐", ["Kipferl", "Salzstangen", "Gebäck"]),
    e("croissant", "Butter-Croissant", BAK, 1.19, "Stk.", "🥐", ["Hörnchen", "Plundergebäck"]),
    e("brezen", "Laugenbrezen 2er", BAK, 1.99, "2 Stk.", "🥨", ["Brezel", "Breze", "Laugengebäck"]),

    // Fleisch & Wurst
    e("faschiertes", "Faschiertes gemischt", HM, 5.99, "500 g", "🥩", ["Hackfleisch", "Hack", "Rindfleisch", "Schweinefleisch"]),
    e("schnitzel", "Schweinsschnitzel", HM, 6.49, "400 g", "🥩", ["Schnitzel", "Schweinefleisch", "Wiener Schnitzel"]),
    e("huehnerbrust", "Hühnerbrust", HM, 6.99, "500 g", "🍗", ["Hendl", "Huhn", "Hähnchen", "Hühnerfilet", "Geflügel"]),
    e("extrawurst", "Extrawurst", HM, 2.29, "150 g", "🥓", ["Wurst", "Aufschnitt", "Jause"]),
    e("kochschinken", "Kochschinken", HM, 2.79, "150 g", "🥓", ["Schinken", "Beinschinken", "Aufschnitt", "Jause"]),
    e("salami", "Salami", HM, 2.49, "100 g", "🥓", ["Wurst", "Aufschnitt", "Jause"]),
    e("wiener", "Wiener Würstel 4er", HM, 3.29, "4 Stk.", "🌭", ["Frankfurter", "Würstchen", "Würstel", "Wurst"]),
    e("kaesekrainer", "Käsekrainer 2er", "Metzgerei Pöstlingberg", 3.79, "2 Stk.", "🌭", ["Kasekrainer", "Wurst", "Würstel", "Grillwurst"]),

    // Milchprodukte
    e("frischmilch", "Frischmilch 3,5 %", HM, 1.59, "1 l", "🥛", ["Milch", "Vollmilch", "Trinkmilch"]),
    e("haltbarmilch", "Haltbarmilch 1,5 %", HM, 1.29, "1 l", "🥛", ["Milch", "H-Milch", "Länger frisch"]),
    e("hafermilch", "Hafermilch", BIO, 1.99, "1 l", "🌾", ["Haferdrink", "Pflanzenmilch", "vegan", "Milchersatz"]),
    e("naturjoghurt", "Naturjoghurt", HM, 1.39, "500 g", "🥣", ["Joghurt", "Jogurt", "Milchprodukt"]),
    e("fruchtjoghurt", "Fruchtjoghurt Erdbeere", HM, 0.89, "180 g", "🍓", ["Joghurt", "Jogurt", "Erdbeerjoghurt"]),
    e("topfen", "Topfen 20 %", HM, 1.79, "250 g", "🥣", ["Quark", "Magertopfen", "Frischkäse"]),
    e("schlagobers", "Schlagobers", HM, 1.89, "250 ml", "🥛", ["Sahne", "Obers", "Schlagsahne"]),
    e("sauerrahm", "Sauerrahm", HM, 1.19, "200 g", "🥛", ["Saure Sahne", "Rahm", "Schmand"]),
    e("teebutter", "Teebutter", HM, 2.99, "250 g", "🧈", ["Butter", "Streichfett"]),

    // Käse & Eier
    e("freilandeier", "Freilandeier 10er", BIO, 3.79, "10 Stk.", "🥚", ["Eier", "Ei", "Frühstücksei"]),
    e("gouda", "Gouda in Scheiben", HM, 2.49, "150 g", "🧀", ["Käse", "Schnittkäse", "Jause"]),
    e("bergkaese", "Bergkäse", BIO, 3.49, "200 g", "🧀", ["Käse", "Hartkäse", "Almkäse", "Jause"]),
    e("mozzarella", "Mozzarella", HM, 1.19, "125 g", "🧀", ["Käse", "Pizzakäse", "Caprese"]),
    e("frischkaese", "Frischkäse natur", HM, 1.79, "200 g", "🧀", ["Käse", "Aufstrich", "Doppelrahmfrischkäse"]),

    // Tiefkühl
    e("pizza", "Tiefkühlpizza Salami", HM, 3.29, "350 g", "🍕", ["TK-Pizza", "Pizza", "Fertiggericht"]),
    e("blattspinat", "Blattspinat", HM, 1.99, "450 g", "🥬", ["Spinat", "TK-Gemüse", "Gemüse"]),
    e("pommes", "Pommes frites", HM, 2.49, "750 g", "🍟", ["Fritten", "Erdäpfel", "Kartoffeln", "TK-Beilage"]),
    e("fischstaebchen", "Fischstäbchen 10er", HM, 3.49, "10 Stk.", "🐟", ["Fisch", "Backfisch", "Fischstäbli"]),
    e("vanilleeis", "Vanilleeis", HM, 3.99, "1 l", "🍨", ["Speiseeis", "Eiscreme", "Eis", "Dessert"]),
    e("gemuesemix", "Gemüsemix", HM, 2.29, "750 g", "🥦", ["TK-Gemüse", "Suppengemüse", "Gemüse"]),

    // Obst & Gemüse
    e("tomaten", "Tomaten", BIO, 2.99, "500 g", "🍅", ["Paradeiser", "Tomate", "Rispentomaten"]),
    e("erdaepfel", "Erdäpfel festkochend", BIO, 2.99, "2 kg", "🥔", ["Kartoffeln", "Erdapfel", "Kartoffel", "Salzkartoffeln"]),
    e("zwiebeln", "Zwiebeln", BIO, 1.79, "1 kg", "🧅", ["Zwiebel", "Speisezwiebeln"]),
    e("karotten", "Karotten", BIO, 1.99, "1 kg", "🥕", ["Möhren", "Mohrrüben", "Gelbe Rüben", "Karotte"]),
    e("salatgurke", "Salatgurke", BIO, 0.99, "Stk.", "🥒", ["Gurke", "Gurken"]),
    e("paprika", "Paprika rot", BIO, 2.99, "500 g", "🫑", ["Paprikaschote", "Gemüsepaprika"]),
    e("karfiol", "Karfiol", BIO, 2.49, "Stk.", "🥦", ["Blumenkohl", "Kohl", "Gemüse"]),
    e("kopfsalat", "Kopfsalat", BIO, 1.29, "Stk.", "🥬", ["Salat", "Häuptelsalat", "Grüner Salat"]),
    e("aepfel", "Äpfel Gala", BIO, 2.99, "1 kg", "🍎", ["Apfel", "Obst", "Tafelobst"]),
    e("bananen", "Bananen", HM, 1.99, "1 kg", "🍌", ["Banane", "Obst"]),
    e("marillen", "Marillen", BIO, 3.49, "500 g", "🍑", ["Aprikosen", "Aprikose", "Marille", "Obst"]),
    e("zitronen", "Zitronen", HM, 1.79, "4 Stk.", "🍋", ["Zitrone", "Obst", "Südfrüchte"]),
    e("trauben", "Trauben weiß", HM, 2.99, "500 g", "🍇", ["Weintrauben", "Obst"]),

    // Nudeln, Reis & Mehl
    e("spaghetti", "Spaghetti", HM, 1.29, "500 g", "🍝", ["Nudeln", "Pasta", "Teigwaren"]),
    e("penne", "Penne", HM, 1.29, "500 g", "🍝", ["Nudeln", "Pasta", "Teigwaren"]),
    e("basmatireis", "Basmatireis", HM, 2.99, "1 kg", "🍚", ["Reis", "Langkornreis", "Beilage"]),
    e("mehl", "Weizenmehl glatt", HM, 1.19, "1 kg", "🌾", ["Mehl", "Backen", "Type 480"]),
    e("zucker", "Kristallzucker", HM, 1.39, "1 kg", "🍬", ["Zucker", "Backen", "Süßen"]),
    e("semmelbroesel", "Semmelbrösel", HM, 1.29, "400 g", "🍞", ["Paniermehl", "Brösel", "Panade", "Backen"]),

    // Frühstück & Aufstrich
    e("muesli", "Früchtemüsli", HM, 3.49, "750 g", "🥣", ["Müsli", "Frühstück", "Cerealien"]),
    e("haferflocken", "Haferflocken zart", HM, 1.29, "500 g", "🌾", ["Porridge", "Frühstück", "Flocken"]),
    e("honig", "Blütenhonig", BIO, 5.99, "500 g", "🍯", ["Honig", "Aufstrich", "Imker"]),
    e("marillenmarmelade", "Marillenmarmelade", BIO, 2.79, "450 g", "🍯", ["Konfitüre", "Aprikosenmarmelade", "Marmelade", "Aufstrich"]),
    e("nougatcreme", "Nuss-Nougat-Creme", HM, 2.99, "400 g", "🍫", ["Haselnussaufstrich", "Schokocreme", "Aufstrich"]),
    e("filterkaffee", "Filterkaffee gemahlen", "Rösterei Donaublick", 6.49, "500 g", "☕", ["Kaffee", "Bohnenkaffee", "Frühstück"]),
    e("fruechtetee", "Früchtetee", HM, 1.99, "20 Beutel", "🍵", ["Tee", "Teebeutel", "Aufguss"]),

    // Süßes & Snacks
    e("schokolade", "Milchschokolade", HM, 1.09, "100 g", "🍫", ["Schoki", "Schokoladetafel", "Süßigkeit"]),
    e("butterkekse", "Butterkekse", HM, 1.79, "200 g", "🍪", ["Kekse", "Biskuit", "Gebäck"]),
    e("chips", "Kartoffelchips Paprika", HM, 1.99, "150 g", "🥔", ["Erdäpfelchips", "Knabberei", "Snack", "Chips"]),
    e("fruchtgummi", "Fruchtgummi", HM, 1.49, "200 g", "🍬", ["Gummibärchen", "Süßigkeit", "Naschen"]),
    e("erdnuesse", "Erdnüsse geröstet", HM, 1.89, "200 g", "🥜", ["Nüsse", "Knabberei", "Snack"]),
    e("waffelschnitten", "Waffelschnitten Haselnuss", "Wiener Waffelmanufaktur", 0.99, "75 g", "🍫", ["Haselnussschnitten", "Neapolitaner", "Süßigkeit"]),

    // Öl, Gewürze & Saucen
    e("olivenoel", "Olivenöl nativ extra", HM, 6.99, "500 ml", "🫒", ["Öl", "Speiseöl", "Olivenöl"]),
    e("sonnenblumenoel", "Sonnenblumenöl", HM, 2.49, "1 l", "🌻", ["Öl", "Speiseöl", "Bratöl"]),
    e("kuerbiskernoel", "Steirisches Kürbiskernöl", "Ölmühle Mühlviertel", 8.99, "250 ml", "🎃", ["Kernöl", "Öl", "Salatöl", "Steirisch"]),
    e("apfelessig", "Apfelessig", HM, 1.59, "500 ml", "🍎", ["Essig", "Salatessig"]),
    e("salz", "Speisesalz", HM, 0.69, "1 kg", "🧂", ["Salz", "Kochsalz", "Gewürz"]),
    e("pfeffer", "Pfeffer schwarz gemahlen", HM, 1.99, "50 g", "🌶️", ["Gewürz", "Würzen"]),
    e("ketchup", "Tomatenketchup", HM, 1.99, "500 ml", "🍅", ["Ketchup", "Paradeiserketchup", "Sauce"]),
    e("senf", "Dijon-Senf", HM, 1.39, "200 g", "🟡", ["Senf", "Sauce", "Gewürz"]),

    // Konserven & Suppen
    e("tomaten-passiert", "Tomaten passiert", HM, 1.19, "500 g", "🥫", ["Paradeiser passiert", "Tomatensauce", "Passata", "Paradeisersauce"]),
    e("zuckermais", "Zuckermais", HM, 1.09, "340 g", "🌽", ["Mais", "Dose", "Konserve"]),
    e("kidneybohnen", "Kidneybohnen", HM, 0.99, "400 g", "🫘", ["Bohnen", "Dose", "Chili"]),
    e("thunfisch", "Thunfisch in Wasser 3er", HM, 3.49, "3 × 80 g", "🐟", ["Fisch", "Dose", "Konserve"]),
    e("gulaschsuppe", "Gulaschsuppe", HM, 2.49, "400 ml", "🍲", ["Suppe", "Dose", "Fertiggericht", "Eintopf"]),

    // Wasser & Säfte
    e("mineralwasser-still", "Mineralwasser still 6er", HM, 3.99, "6 × 1,5 l", "💧", ["Wasser", "Mineral", "Trinkwasser"]),
    e("mineralwasser-prickelnd", "Mineralwasser prickelnd 6er", HM, 3.99, "6 × 1,5 l", "🫧", ["Wasser", "Sprudel", "Soda", "Mineral"]),
    e("apfelsaft", "Apfelsaft naturtrüb", BIO, 1.89, "1 l", "🧃", ["Saft", "Most", "Direktsaft"]),
    e("orangensaft", "Orangensaft", HM, 2.19, "1 l", "🍊", ["Saft", "Orangen", "Frühstück"]),
    e("mostsaft", "Mostbirnensaft", "Mostschenke Pöstlingberg", 2.49, "1 l", "🍐", ["Saft", "Birnensaft", "Most", "Regional"]),
    e("cola", "Cola", HM, 1.69, "1,5 l", "🥤", ["Limonade", "Softdrink", "Erfrischung"]),
    e("holundersirup", "Holunderblütensirup", BIO, 3.99, "0,5 l", "🌸", ["Hollersirup", "Sirup", "Hollunder", "Hollerblüte"]),

    // Bier & Wein
    e("lagerbier", "Lagerbier 6er", HM, 5.99, "6 × 0,5 l", "🍺", ["Bier", "Seidel", "Märzen"]),
    e("weissbier", "Weißbier", HM, 1.49, "0,5 l", "🍺", ["Bier", "Weizenbier"]),
    e("radler", "Radler", HM, 1.19, "0,5 l", "🍋", ["Bier", "Biermischgetränk", "Almradler"]),
    e("gruener-veltliner", "Grüner Veltliner", "Weingut Kamptal-Nord", 6.49, "0,75 l", "🍷", ["Wein", "Weißwein", "Veltliner"]),
    e("zweigelt", "Zweigelt", "Weingut Kamptal-Nord", 6.99, "0,75 l", "🍷", ["Wein", "Rotwein"]),

    // Haushalt & Reinigung
    e("toilettenpapier", "Toilettenpapier 8 Rollen", HM, 3.99, "8 Rollen", "🧻", ["WC-Papier", "Klopapier", "Hygienepapier"]),
    e("kuechenrolle", "Küchenrolle 4 Rollen", HM, 2.99, "4 Rollen", "🧻", ["Haushaltstuch", "Küchenpapier"]),
    e("muellsaecke", "Müllsäcke 35 l", HM, 1.99, "20 Stk.", "🗑️", ["Mistsackerl", "Abfallsäcke", "Mistsack"]),
    e("spuelmittel", "Geschirrspülmittel", HM, 1.79, "500 ml", "🫧", ["Abwaschmittel", "Spülmittel", "Reiniger"]),
    e("waschmittel", "Vollwaschmittel 20 WL", HM, 6.99, "1,3 kg", "🧺", ["Waschpulver", "Wäsche", "Waschen"]),
    e("putzschwaemme", "Putzschwämme 6er", HM, 2.19, "6 Stk.", "🧽", ["Schwamm", "Reinigung", "Küche"]),

    // Körperpflege
    e("zahnpasta", "Zahnpasta Minze", HM, 1.49, "75 ml", "🪥", ["Zahncreme", "Mundpflege", "Zähne"]),
    e("duschgel", "Duschgel", HM, 1.99, "250 ml", "🚿", ["Dusche", "Körperpflege", "Waschgel"]),
    e("shampoo", "Shampoo", HM, 2.49, "250 ml", "🧴", ["Haarwäsche", "Haarpflege"]),
    e("handseife", "Handseife", HM, 1.79, "300 ml", "🧼", ["Seife", "Flüssigseife", "Händewaschen"]),
    e("deo", "Deo-Spray", HM, 2.29, "150 ml", "🧴", ["Deodorant", "Körperpflege"]),
    e("taschentuecher", "Papiertaschentücher 10er", HM, 1.49, "10 × 10 Stk.", "🤧", ["Taschentuch", "Schnupftuch"])
  ].map((p) => [p.id, p])
);
