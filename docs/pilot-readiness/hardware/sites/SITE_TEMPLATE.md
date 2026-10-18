# Standort: <Name> (Vorlage)

Status: Vorlage. Vor der ersten Messung ausfüllen. Platzhalter in `(Mensch: …)` werden durch Messwerte ersetzt.

Datei: `docs/pilot-readiness/hardware/sites/<site>.md` (zum Beispiel `testraum.md`, `grossraum.md`).
Layout: `docs/pilot-readiness/hardware/sites/layout-<site>.json`.

## Kennung

| Feld | Wert |
| --- | --- |
| Standortkennung (`site`) | (Mensch: Kurzname ohne Leerzeichen, z. B. `testraum`) |
| Major (Standortnummer) | (Mensch: 1, 2 oder 10 und höher) |
| Layout-Datei | `sites/layout-<site>.json` |
| Messdatum | (Mensch: JJJJ-MM-TT) |

## Raumdaten

- Raumname und Nutzung: (Mensch: z. B. Klassenraum, Bibliothek)
- Grundfläche: (Mensch: Länge × Breite in m)
- Eingang: (Mensch: Position in Layout-Metern, x_m und y_m)
- Messgerät: (Mensch: Typ des Laser-Entfernungsmessers)
- Messende Person: (Mensch: Rolle)

## Skizze

(Mensch: Handskizze mit Maßen einfügen oder Datei verlinken, zum Beispiel `sites/<site>-skizze.jpg`. Maße in Metern. Nordpfeil und Eingang einzeichnen.)

## Wand- und Regal-Maße

| Element | Typ | x_m | y_m | Länge_m | Tiefe_m | Höhe_m | Bemerkung |
| --- | --- | --- | --- | --- | --- | --- | --- |
| (Mensch: z. B. Wand Nord) | Wand | (Mensch) | (Mensch) | (Mensch) | – | (Mensch) | (Mensch) |
| (Mensch: z. B. Regal 1) | Regal | (Mensch) | (Mensch) | (Mensch) | (Mensch) | (Mensch) | (Mensch) |

## Beacon-Montagepunkte

Die Liste entspricht `beacons.csv` für diesen Standort. Abweichungen zwischen Plan und Montage werden hier dokumentiert.

| Minor | x_m | y_m | Höhe_m | Montageort | Plan-Abweichung_m | Bemerkung |
| --- | --- | --- | --- | --- | --- | --- |
| (Mensch: Minor) | (Mensch: x_m) | (Mensch: y_m) | (Mensch: Höhe) | (Mensch: regal-oberkante, saeule oder wand-oben) | (Mensch: gemessen minus Plan) | (Mensch) |

## Marker

Diese Tabelle wird von `field_stats.py` über `--markers` gelesen. Das Spaltenformat ist fest. Die Namen sind `M1` bis `Mn` in fester Reihenfolge. Zahlen mit Punkt als Dezimaltrenner. Platzhalter vor der Messung ersetzen.

| Marker | x_m | y_m | Beschreibung |
| --- | --- | --- | --- |
| M1 | (Mensch: x_m) | (Mensch: y_m) | (Mensch: Ort in Worten; S4-Paar kennzeichnen) |
| M2 | (Mensch: x_m) | (Mensch: y_m) | (Mensch: Ort in Worten) |
| M3 | (Mensch: x_m) | (Mensch: y_m) | (Mensch: Ort in Worten) |
| M4 | (Mensch: x_m) | (Mensch: y_m) | (Mensch: Ort in Worten) |
| (Mensch: weitere Marker M5 bis Mn in gleichem Format) | | | |

Mindestens vier Marker für Standzeiten (`MEASUREMENT_PROTOCOL.md`, Abschnitt 4, S1).

## Gänge

Die Gangtabelle wird für die Gang-Prüfung (Anteil Gehzeit im richtigen Gang) verwendet. Jeder Gang ist ein achsenparalleles Rechteck in Layout-Metern.

- `x_m`, `y_m`: Ecke mit den kleinsten Koordinaten.
- `width_m`: Ausdehnung in x-Richtung.
- `height_m`: Ausdehnung in y-Richtung.

| Gang | x_m | y_m | width_m | height_m |
| --- | --- | --- | --- | --- |
| (Mensch: Gangname) | (Mensch) | (Mensch) | (Mensch) | (Mensch) |

Hinweis zur Auswertung: `MEASUREMENT_PROTOCOL.md` (Task 4.4) nennt Gangpolygone aus dem Layout-JSON als Quelle. Diese Tabelle verwendet dagegen Rechtecke. Vor der ersten Auswertung wird festgelegt, welche Quelle `field_stats.py` nutzt (Mensch: entscheiden und hier vermerken).

## Fotos

Fotos im Ordner `sites/<site>-fotos/` ablegen. Keine Personen auf Fotos.

- (Mensch: Gesamtansicht des Raums mit Eingang)
- (Mensch: je Marker ein Foto)
- (Mensch: je Beacon-Montagepunkt ein Foto mit Etikett `IND-<major>-<minor>`)

## Änderungsverlauf

| Datum | Änderung | Durch |
| --- | --- | --- |
| (Mensch: JJJJ-MM-TT) | (Mensch: z. B. Erstfassung) | (Mensch: Rolle) |
