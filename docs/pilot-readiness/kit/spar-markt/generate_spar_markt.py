#!/usr/bin/env python3
"""Erzeugt den Demo-Datensatz "SPAR-Markt 800 m²" für das Sprint-Review (Story #194).

Ausgaben (neben diesem Skript):
  spar-markt-layout.json   Grundriss 32 x 25 m für "JSON importieren" im Layout-Editor
  spar-markt.csv           vollständiges Sortiment für den CSV-Import (Produkte)
  spar-markt-fehler.csv    dasselbe Sortiment mit zwei absichtlichen Fehlern
  spar-markt-beacons-bulk.txt  Zeilen "Code,Minor" zum Einfügen unter Beacons -> Mehrere anlegen
  spar-markt-beacons.csv   Beacon-Liste für die Beacon-Verwaltung (Code, UUID, Major, Minor)
  dataset.json             Manifest (Markt, Beacons, Dateien, Suchproben, erwartete Fehler)

Der Aufbau folgt einem typischen SPAR-Supermarkt mit etwa 800 m² Verkaufsfläche:
Eingang Süd-West, Obst & Gemüse direkt nach dem Eingang, Backstation und Bedientheke
an der Westwand, Kühlung an der Rückwand (Nord), Tiefkühl und Getränke an der Ostwand,
Trockensortiment in Gondeln in der Mitte, Kassenzone Süd-Ost.
Quellen und Schätzungen: siehe README.md. Preise sind plausible Schätzungen, keine SPAR-Preise.

Das Skript prüft selbst, was die Bereitschaftsprüfung prüft: jedes Produkt trifft ein
beschriftetes Regal, jedes Regal hat mindestens ein Produkt, Beacon-Abdeckung (Radius 8 m,
mindestens 3 Beacons je begehbarer Zelle, höchstens 5 % Zellen darunter).
"""
from __future__ import annotations

import csv
import json
import math
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
WIDTH, HEIGHT = 32, 25
STORE_CODE = "SPAR-Demo-Review-800"
STORE_NAME = "SPAR Demo-Markt 800 (Sprint-Review)"
BEACON_UUID = str(uuid.uuid5(uuid.NAMESPACE_DNS, "indooro.demo.spar-markt-800")).upper()
BEACON_MAJOR = 800
RADIUS, MIN_BEACONS, MAX_LOW_SHARE = 8.0, 3, 0.05

# Abteilungen: Code (Warengruppe), Bezeichnung, Produkte (Name, Preis).
D = {}
def dept(code, label, items):
    D[code] = (label, [(n.strip(), p.strip()) for n, p in (i.split("|") for i in items.strip().splitlines())])

dept(100, "Aktion & Saison", """
SPAR Lebkuchen Herzen 200 g|1,99
Manner Weihnachtsbaumbehang 300 g|4,99
SPAR Glühwein rot 1 l|2,99
Ölz Christstollen 750 g|6,99""")
dept(110, "Obst", """
Bananen 1 kg|1,89
Äpfel Gala 1 kg|2,49
Birnen Williams 1 kg|2,99
Orangen 2 kg Netz|3,99
Zitronen 500 g Netz|1,79
Weintrauben weiß 500 g|2,99
Heidelbeeren 125 g|2,49
SPAR Natur*pur Bio Äpfel 1 kg|3,49""")
dept(120, "Gemüse", """
Rispentomaten 1 kg|3,49
Salatgurke|0,99
Paprika rot 1 kg|4,99
SPAR Natur*pur Bio Karotten 1 kg|1,79
Kartoffeln festkochend 2 kg|2,99
Zwiebel 1 kg|1,49
Zucchini 1 kg|2,99
Knoblauch 3 Stück|1,19""")
dept(130, "Salate, Kräuter & Pilze", """
Eisbergsalat|1,49
Vogerlsalat 100 g|1,99
Salatmix 150 g|1,79
Champignons 250 g|1,99
Basilikum im Topf|1,99
Schnittlauch im Topf|1,79""")
dept(140, "Backstation Brot & Gebäck", """
Semmel|0,35
Kaisersemmel|0,39
Bauernbrot 750 g|3,29
Vollkornbrot 500 g|2,99
Buttercroissant|1,19
Laugenbrezel|0,89
Ölz Toastbrot 500 g|2,29
Kornspitz|0,59""")
dept(150, "Feinkost Bedientheke Wurst & Fleisch", """
Extrawurst 100 g|1,79
Leberkäse 100 g|1,49
Beinschinken 100 g|2,59
Ungarische Salami 100 g|3,49
Bauernspeck 100 g|2,79
Putenschnitzel paniert 100 g|1,79""")
dept(160, "Feinkost Bedientheke Käse & Antipasti", """
Emmentaler 100 g|1,69
Vorarlberger Bergkäse 100 g|2,49
Gouda jung 100 g|1,39
Grüne Oliven mit Mandeln 100 g|1,99
Mozzarella di Bufala 100 g|1,29""")
dept(210, "Wurst SB", """
SPAR Natur*pur Bio Putenbrust 100 g|2,49
SPAR Salami Aufschnitt 100 g|2,29
Käsekrainer 4 Stück|3,99
Frankfurter Würstel 2 Paar|1,99
Speck Streifen 150 g|2,19
Leberkäse Scheiben 4 Stück|2,79""")
dept(220, "Käse SB", """
Bergbaron Scheiben 150 g|2,99
SPAR Gouda Scheiben 150 g|1,99
SPAR Hirtenkäse 200 g|2,79
SPAR Mozzarella 125 g|1,19
Parmesan gerieben 100 g|1,99
Philadelphia Frischkäse 200 g|2,69
SPAR Gouda Block 400 g|4,19""")
dept(230, "Fleisch & Geflügel SB", """
Hühnerbrustfilet 400 g|5,49
Schweinsschnitzel 400 g|5,99
Faschiertes gemischt 500 g|5,29
Hendl ganz 1,2 kg|6,99
Cordon bleu 2 Stück|4,49
Schweinskotelett 4 Stück|6,49""")
dept(240, "Molkerei", """
Schärdinger Frische Vollmilch 3,5 % 1 l|1,59
SPAR Frische Vollmilch 1 l|1,39
SPAR Natur*pur Bio Vollmilch 1 l|1,69
NÖM Joghurt natur 500 g|1,49
NÖM Fruchtjoghurt Erdbeere 180 g|0,69
Schärdinger Teebutter 250 g|3,49
SPAR Schlagobers 200 ml|1,59
SPAR Sauerrahm 200 g|1,19
SPAR Topfen 250 g|1,49
SPAR Vital Skyr natur 450 g|1,99""")
dept(250, "Eier", """
SPAR Freilandeier 10 Stück|3,99
SPAR Natur*pur Bio Eier 6 Stück|3,29
Bodenhaltungseier 10 Stück|3,49""")
dept(260, "Frische Convenience", """
Frische Tortellini Ricotta 250 g|2,99
Pizzateig frisch 400 g|1,79
SPAR Veggie Hummus 200 g|1,99
Sushi Box 8 Stück|5,99
Hendl-Wrap|3,49
Frische Rindsuppe 400 ml|3,49""")
dept(310, "Tiefkühl", """
Iglo Fischstäbchen 450 g|4,99
Dr. Oetker Ristorante Salami|5,49
SPAR Pommes frites 750 g|2,29
Iglo Blattspinat 450 g|1,99
SPAR Erbsen 750 g|2,29
Iglo Gemüse Mix 400 g|2,49
SPAR Backhendl 500 g|3,99
SPAR Marillenknödel 6 Stück|3,49""")
dept(320, "Eis", """
Eskimo Magnum Classic 3 Stück|3,99
Mövenpick Bourbon Vanille 850 ml|5,99
SPAR Premium Eis Vanille 500 ml|3,49
Eskimo Cremissimo Schoko 750 ml|4,99
Eskimo Nogger 5 Stück|3,99""")
dept(410, "Mineralwasser", """
Vöslauer prickelnd 1,5 l|0,89
Vöslauer still 1,5 l|0,89
Römerquelle prickelnd 1,5 l|0,89
Römerquelle Emotion Birne-Melisse 0,75 l|1,19
Gasteiner Mineralwasser 1 l|1,19
Vöslauer 6 x 1,5 l|5,29
S-Budget Mineralwasser 2 l|0,55""")
dept(420, "Säfte & Limonaden", """
Pago Orange 1 l|2,29
Rauch Happy Day Apfel 1 l|2,29
Almdudler 1 l|1,89
Coca-Cola 1,5 l|2,29
Fanta Orange 1,5 l|2,29
Red Bull 250 ml|1,79
Pfanner Eistee Zitrone 2 l|2,99
Frucade 1 l|1,99""")
dept(430, "Bier", """
Gösser Märzen 0,5 l|1,29
Stiegl Goldbräu 0,5 l|1,39
Zipfer Märzen 0,5 l|1,29
Puntigamer 0,5 l|1,19
Schlossgold alkoholfrei 0,5 l|0,99
Gösser Radler 6 x 0,5 l|5,99""")
dept(440, "Wein, Sekt & Spirituosen", """
Grüner Veltliner Weinviertel DAC 0,75 l|5,99
Zweigelt Niederösterreich 0,75 l|5,49
Prosecco DOC 0,75 l|5,99
Schlumberger Sparkling Brut 0,75 l|7,99
Stroh Inländer Rum 38 % 0,5 l|14,99
Jägermeister 0,7 l|16,99
Aperol 0,7 l|13,99""")
dept(510, "Kaffee, Tee & Kakao", """
Julius Meinl Präsident gemahlen 500 g|8,49
Jacobs Krönung gemahlen 500 g|7,99
SPAR Kaffeekapseln Lungo 10 Stück|3,99
Julius Meinl Wiener Melange Bohne 1 kg|15,99
Teekanne Früchtetee 20 Beutel|2,59
SPAR Pfefferminztee 20 Beutel|1,49
Nesquik Kakao 400 g|3,49""")
dept(520, "Frühstück & Aufstriche", """
Kellogg's Cornflakes 375 g|3,49
SPAR Haferflocken zart 500 g|1,29
Nutella 450 g|4,49
Staud's Marillenmarmelade 450 g|3,99
Österreichischer Blütenhonig 500 g|6,99
SPAR Knuspermüsli Schoko 500 g|3,29""")
dept(530, "Süßwaren", """
Manner Original Neapolitaner 75 g|1,19
Manner Neapolitaner 400 g|3,49
Milka Alpenmilch 100 g|1,89
Ritter Sport Voll-Nuss 100 g|1,89
Haribo Goldbären 175 g|1,79
Kinder Riegel 8 Stück|2,29
Ferrero Rocher 200 g|5,99
Mirabell Mozartkugeln 150 g|4,99
Leibniz Butterkeks 200 g|1,99""")
dept(540, "Snacks & Knabbereien", """
Pringles Original 165 g|2,99
Kelly's Chips Paprika 150 g|2,29
Soletti Salzstangerl 100 g|1,49
SPAR Erdnüsse geröstet 200 g|2,19
SPAR Studentenfutter 200 g|2,49
Kelly's Popcorn salzig 100 g|1,79""")
dept(550, "Konserven", """
SPAR Gemüsemais 340 g|1,49
SPAR Tomaten gehackt 400 g|0,99
SPAR Kidneybohnen 400 g|0,99
Rio Mare Thunfisch 3 x 80 g|4,49
SPAR Ananas Scheiben 565 g|2,29
Essiggurken 720 ml|2,49
Inzersdorfer Gulasch 400 g|3,49""")
dept(560, "Nudeln & Reis", """
Barilla Spaghetti N.5 500 g|1,99
Recheis Eierspätzle 500 g|2,49
Recheis Fusilli 500 g|2,29
S-Budget Spaghetti 500 g|0,99
SPAR Basmatireis 1 kg|3,99
SPAR Polenta 500 g|1,79""")
dept(570, "Saucen, Öl & Essig", """
Knorr Fix Spaghetti Bolognese|1,29
Heinz Tomato Ketchup 570 g|2,99
Estragon Senf 200 g|1,49
SPAR Sonnenblumenöl 1 l|3,49
SPAR Premium Olivenöl nativ extra 750 ml|8,99
Mautner Markhof Apfelessig 1 l|1,49""")
dept(580, "Backzutaten", """
Fini's Feinstes Mehl glatt 1 kg|1,49
Wiener Kristallzucker 1 kg|1,69
Wiener Staubzucker 500 g|1,29
Dr. Oetker Backin 6 Stück|1,29
Dr. Oetker Vanillezucker 6 Stück|1,09
Frischgerm 42 g|0,59""")
dept(590, "Gewürze", """
Kotányi Paprika edelsüß 50 g|1,69
Kotányi Pfeffer schwarz gemahlen 50 g|1,79
Bad Ischler Speisesalz 1 kg|0,79
Kotányi Curry 50 g|1,69
Kotányi Kümmel ganz 50 g|1,49""")
dept(610, "Drogerie & Körperpflege", """
Nivea Creme 150 ml|3,99
Elmex Zahnpasta 75 ml|3,49
Colgate Total 75 ml|2,29
Fa Duschgel 250 ml|2,19
Schauma Shampoo 250 ml|2,99
Zewa Taschentücher 10 x 10|2,49
Hansaplast Pflaster 20 Stück|3,49""")
dept(620, "Haushalt & Reinigung", """
Fairy Spülmittel 500 ml|2,99
Persil Pulver 1,3 kg|9,99
Domestos WC-Reiniger 750 ml|2,49
Zewa Küchenrolle 4 Rollen|4,99
Hakle Toilettenpapier 8 Rollen|3,99
SPAR Müllsäcke 35 l|1,79
SPAR Alufolie 30 m|2,49""")
dept(630, "Tiernahrung", """
Whiskas Nassfutter 4 x 85 g|2,49
Felix Sensations 4 x 85 g|2,69
Pedigree Dose Rind 400 g|1,49
Chappi Trockenfutter 1,5 kg|3,99
SPAR Katzenstreu 10 l|4,99""")
dept(710, "Kassenzone", """
Wrigley's Extra Peppermint|1,49
Tic Tac Mint|1,29
Duracell AA 4 Stück|5,99
Kronen Zeitung|1,70""")

# Regalstrecken: (x, y, Länge, Richtung, Tiefe, [(Abteilung, Abschnitte)]).
# Richtung "h" = entlang x, "v" = entlang y. Ein Abschnitt = ein Regal-Element = ein "meter" im Code.
RUNS = [
    # Rückwand Nord (y = 0): Kühlung
    (2, 0, 28, "h", 1, [(210, 3), (220, 3), (230, 3), (240, 5), (250, 1), (260, 3)]),
    # Westwand (x = 0): Bedientheke Käse, Bedientheke Wurst, Backstation
    (0, 2, 4, "v", 1, [(160, 2)]),
    (0, 7, 5, "v", 1, [(150, 3)]),
    (0, 13, 4, "v", 1, [(140, 4)]),
    # Ostwand (x = 31): Tiefkühl, Eis, Wasser, Säfte
    (31, 2, 8, "v", 1, [(310, 4)]),
    (31, 10, 3, "v", 1, [(320, 3)]),
    (31, 13, 4, "v", 1, [(410, 4)]),
    (31, 17, 3, "v", 1, [(420, 3)]),
    # Getränke-Gondel Ost (zweiseitig, x = 27/28): Bier und Wein
    (27, 4, 10, "v", 1, [(430, 5)]),
    (28, 4, 10, "v", 1, [(440, 5)]),
    # Mittelgondeln (zweiseitig, je 20 m, Gänge 2 bis 3 m)
    (5, 3, 20, "h", 1, [(510, 5), (520, 5)]),
    (5, 4, 20, "h", 1, [(530, 6), (540, 4)]),
    (5, 7, 20, "h", 1, [(550, 5), (560, 5)]),
    (5, 8, 20, "h", 1, [(570, 4), (580, 4), (590, 2)]),
    (5, 11, 20, "h", 1, [(610, 5)]),
    (5, 12, 20, "h", 1, [(620, 5), (630, 5)]),
    # Obst & Gemüse: Tische nach dem Eingang
    (3, 16, 8, "h", 2, [(110, 4)]),
    (3, 19, 8, "h", 1, [(120, 4)]),
    (12, 19, 4, "h", 1, [(130, 2)]),
    # Aktionsfläche am Eingang und Kassenzone
    (7, 22, 4, "h", 1, [(100, 2)]),
    (18, 18, 12, "h", 1, [(710, 2)]),
]

# Kassen, Leergutrücknahme und Wände (blockieren Zellen, keine Produkte).
FIXTURES = [
    ("wall", 19, 21, 1, 2, "Kassa 1"),
    ("wall", 22, 21, 1, 2, "Kassa 2"),
    ("wall", 25, 21, 1, 2, "Kassa 3"),
    ("wall", 28, 21, 1, 2, "Self-Checkout"),
    ("wall", 0, 20, 1, 3, "Leergutrücknahme"),
]

BEACON_POSITIONS = [(x, y) for y in (1.5, 7.5, 13.5, 19.5, 24.0) for x in (1.0, 8.5, 16.0, 23.5, 31.0)]


def build():
    elements, next_id = [], 1
    def add(element):
        nonlocal next_id
        element = {"id": next_id, **element}
        elements.append(element)
        next_id += 1
        return element

    add({"type": "entrance", "x": 2, "y": 24, "width": 3, "height": 1, "label": "Eingang / Ausgang"})
    for kind, x, y, w, h, label in FIXTURES:
        add({"type": kind, "x": x, "y": y, "width": w, "height": h, "label": label})

    shelves = {}  # Abteilung -> [(meter, element)]
    for x, y, length, direction, depth, parts in RUNS:
        total = sum(n for _, n in parts)
        if total > length:
            raise SystemExit(f"Strecke bei ({x},{y}) ist zu kurz: {length} m für {total} Abschnitte")
        # Ganze Meter je Abschnitt, so gleichmäßig wie möglich (Rest auf die ersten Abschnitte).
        widths = [length // total + (1 if k < length % total else 0) for k in range(total)]
        offset, index = 0, 0
        for code, n in parts:
            label = D[code][0]
            start = len(shelves.get(code, []))
            for k in range(n):
                meter = start + k + 1
                seg = widths[index]
                index += 1
                ex, ey = (x + offset, y) if direction == "h" else (x, y + offset)
                w, h = (seg, depth) if direction == "h" else (depth, seg)
                el = add({"type": "shelf", "x": ex, "y": ey, "width": w, "height": h,
                          "category": f"{code}/{meter}", "meter": meter,
                          "label": f"{label} {meter}" if n > 1 or start else label,
                          "productPositions": []})
                shelves.setdefault(code, []).append((meter, el))
                offset += seg

    beacons = []
    for i, (bx, by) in enumerate(BEACON_POSITIONS, start=1):
        code = f"SPAR800-B{i:02d}"
        add({"type": "beacon", "x": bx, "y": by, "beaconId": code})
        beacons.append({"code": code, "uuid": BEACON_UUID, "major": BEACON_MAJOR, "minor": i, "x": bx, "y": by})

    # Produkte gleichmäßig auf die Abschnitte der Abteilung verteilen (jedes Regal bekommt mindestens eins).
    products, pid = [], 1
    for code, (label, items) in D.items():
        segs = shelves.get(code)
        if not segs:
            raise SystemExit(f"Abteilung {code} {label} hat kein Regal")
        if len(items) < len(segs):
            raise SystemExit(f"Abteilung {code}: {len(items)} Produkte für {len(segs)} Regale")
        per_seg = {}
        for idx, (name, price) in enumerate(items):
            meter = segs[idx % len(segs)][0]
            n = per_seg.get(meter, 0)
            per_seg[meter] = n + 1
            fach, reihe = n // 3 + 1, n % 3 + 1  # Fach von oben, Reihe von links
            products.append({"id": pid, "name": name, "kategorie": code, "meter": meter,
                             "fach": fach, "reihe": reihe, "preis": price, "dept": label})
            pid += 1

    doc = {"shopName": STORE_NAME, "gridSize": {"width": WIDTH, "height": HEIGHT}, "elements": elements}
    return doc, products, beacons, shelves


def check(doc, products, beacons):
    blocked = [[False] * WIDTH for _ in range(HEIGHT)]
    cells_seen = {}
    for e in doc["elements"]:
        if e["type"] in ("beacon", "entrance"):
            continue
        if e["x"] + e["width"] > WIDTH or e["y"] + e["height"] > HEIGHT:
            raise SystemExit(f"Element {e['id']} liegt außerhalb des Grundrisses")
        for yy in range(e["y"], e["y"] + e["height"]):
            for xx in range(e["x"], e["x"] + e["width"]):
                if (xx, yy) in cells_seen:
                    raise SystemExit(f"Element {e['id']} überlappt Element {cells_seen[(xx, yy)]} bei ({xx},{yy})")
                cells_seen[(xx, yy)] = e["id"]
                blocked[yy][xx] = True
    walkable = low = 0
    for j in range(HEIGHT):
        for i in range(WIDTH):
            if blocked[j][i]:
                continue
            walkable += 1
            n = sum(1 for b in beacons if (i + 0.5 - b["x"]) ** 2 + (j + 0.5 - b["y"]) ** 2 <= RADIUS ** 2)
            if n < MIN_BEACONS:
                low += 1
    if low > MAX_LOW_SHARE * walkable:
        raise SystemExit(f"Abdeckung zu gering: {low} von {walkable} Zellen unter {MIN_BEACONS} Beacons")
    categories = {e["category"] for e in doc["elements"] if e["type"] == "shelf"}
    for p in products:
        if f"{p['kategorie']}/{p['meter']}" not in categories:
            raise SystemExit(f"Produkt {p['id']} trifft kein Regal")
    hit = {f"{p['kategorie']}/{p['meter']}" for p in products}
    if categories - hit:
        raise SystemExit(f"Regale ohne Produkte: {sorted(categories - hit)}")
    return walkable, low


def write_csv(path, rows):
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter=";", lineterminator="\n")
        w.writerow(["id", "name", "kategorie", "meter", "fach", "reihe", "preis"])
        for r in rows:
            w.writerow([r["id"], r["name"], r["kategorie"], r["meter"], r["fach"], r["reihe"], r["preis"]])


def main():
    doc, products, beacons, shelves = build()
    walkable, low = check(doc, products, beacons)
    (HERE / "spar-markt-layout.json").write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_csv(HERE / "spar-markt.csv", products)

    # Fehlerdatei: Zeile 21 (Produkt 20) auf ein nicht vorhandenes Regal, Zeile 101 (Produkt 100) ohne Preis.
    broken = [dict(p) for p in products]
    broken[19]["kategorie"], broken[19]["meter"] = 999, 1
    broken[99]["preis"] = ""
    write_csv(HERE / "spar-markt-fehler.csv", broken)

    with (HERE / "spar-markt-beacons.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter=";", lineterminator="\n")
        w.writerow(["code", "uuid", "major", "minor", "x_m", "y_m"])
        for b in beacons:
            w.writerow([b["code"], b["uuid"], b["major"], b["minor"], b["x"], b["y"]])

    # Für "Beacons -> Mehrere anlegen": gemeinsame UUID und Major oben im Formular, je Zeile "Code,Minor".
    (HERE / "spar-markt-beacons-bulk.txt").write_text(
        "".join(f"{b['code']},{b['minor']}\n" for b in beacons), encoding="utf-8")

    by_name = {p["name"]: p for p in products}
    probes = []
    for query, name in [("Vollmilch", "SPAR Frische Vollmilch 1 l"), ("Vöslauer", "Vöslauer still 1,5 l"),
                        ("Spaghetti", "Barilla Spaghetti N.5 500 g"), ("Manner", "Manner Neapolitaner 400 g"),
                        ("Kotányi", "Kotányi Paprika edelsüß 50 g")]:
        p = by_name[name]
        probes.append({"query": query, "expectProduct": name,
                       "expectLayoutCode": f"{p['kategorie']}/{p['meter']}/{p['fach']}/{p['reihe']}",
                       "expectShelfLabel": next(e["label"] for e in doc["elements"]
                                                if e.get("category") == f"{p['kategorie']}/{p['meter']}")})
    manifest = {
        "storeCode": STORE_CODE,
        "store": {"name": STORE_NAME, "street": "Demostraße 1", "zipCode": "4060", "city": "Leonding", "country": "AT"},
        "files": {"layout": "spar-markt-layout.json", "csv": "spar-markt.csv",
                  "errorCsv": "spar-markt-fehler.csv", "beacons": "spar-markt-beacons.csv",
                  "beaconsBulk": "spar-markt-beacons-bulk.txt"},
        "beacons": [{k: b[k] for k in ("code", "uuid", "major", "minor")} for b in beacons],
        "expectedErrors": [
            {"line": 21, "field": "kategorie", "message": "Kein Regal 999/1 im aktiven Layout."},
            {"line": 101, "field": "preis",
             "message": "Preis fehlt. Für den Import ist für jedes Produkt ein Preis erforderlich."}],
        "searchProbes": probes,
        "stats": {"products": len(products), "departments": len(D),
                  "shelves": sum(len(v) for v in shelves.values()), "beacons": len(beacons),
                  "walkableCells": walkable, "lowCoverageCells": low},
    }
    (HERE / "dataset.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest["stats"], ensure_ascii=False))


if __name__ == "__main__":
    main()
