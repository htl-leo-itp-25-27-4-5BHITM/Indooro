# SPAR-Demo-Markt 800 m² – Datensatz und Live-Ablauf für das Sprint-Review

Stand: 2026-11-07. Gehört zu Story #194 („Ein neuer Markt lässt sich ohne Entwickler anlegen und befüllen“).

Dieser Ordner enthält einen vollständigen Supermarkt zum Importieren. Er ist nach dem Vorbild eines typischen SPAR-Markts mit etwa 800 m² Verkaufsfläche aufgebaut. Gezeigt wird er auf dem **deployten System** (`https://it220209.cloud.htl-leonding.ac.at`). Erik ist dabei als Admin eingeloggt.

## Kurzantwort: Geht das?

Ja, mit dem Stand, der seit 2026-11-04 live ist (Image `4cb1e03`). Geprüft wurde Folgendes:

| Schritt | Geht live? | Begründung |
|---|---|---|
| Markt anlegen | ja | Stores → Neuer Store. Ein neuer Markt ist erst nach „Für Kunden freigeben“ in der Kunden-Marktliste (T13). |
| 25 Beacons anlegen | ja | Beacons → „Bulk anlegen“: gemeinsame UUID und Major, je Zeile `Code,Minor` |
| Beacons dem Markt zuweisen | ja, aber einzeln | 25 × „Zuweisen“ mit Bestätigung, etwa 3 Minuten. Deshalb vor dem Review erledigen. |
| Layout importieren und aktivieren | ja | Editor → „JSON importieren“. Aktivieren geht nur, wenn alle 25 Beacons dem Markt zugewiesen sind. |
| CSV mit Fehlern | ja | Die Prüfung läuft im Browser. Genau 2 Fehler, der Commit bleibt gesperrt. |
| CSV mit 205 Produkten | ja | Der Bulk-Import (`/api/admin/products/bulk`) ist nicht durch die Altbestand-Sperre (409) blockiert. Die sperrt nur Einzelspeichern und -löschen, bis T5 erledigt ist. |
| Bereitschaft „Bereit“ | ja, erwartet GREEN | Kein Regal ohne Produkt, jedes Produkt trifft ein beschriftetes Regal, Abdeckung: 10 von 546 Zellen unter 3 Beacons (1,8 %, Grenze 5 %) |
| Suche nur im gewählten Markt | ja | Seit T3 sind Suchen ohne Markt fail-closed. Mit Markt kommen nur dessen Produkte. |

Lokal geprüft mit dem Produktionscode des Admin-UI (`parseImportedDocument`, `reviewCsvImport`):

- Layout akzeptiert, 151 Elemente, 32 × 25.
- `spar-markt.csv`: 205 von 205 gültig.
- `spar-markt-fehler.csv`: 203 gültig und 2 Fehler, genau wie unten erwartet.

Der Backend-Lauf über alle Schritte gegen ein lokales Postgres und OpenSearch steht in `scripts/ops/full_run/`. Er prüft Layout-Validator, Aktivierung, Readiness und Suche ohne Login.

**Nicht geprüft:** der Ablauf live nach dem Login. Claude meldet sich nicht an. Das zeigt erst die Generalprobe.

## Dateien

| Datei | Inhalt | Wo verwenden |
|---|---|---|
| `spar-markt-layout.json` | Grundriss 32 × 25 m, 1 Eingang, 4 Kassen, Leergutrücknahme, 120 beschriftete Regalabschnitte, 25 Beacon-Plätze `SPAR800-B01` bis `SPAR800-B25` | Editor → „JSON importieren“ |
| `spar-markt.csv` | 205 Produkte in 32 Abteilungen, `id;name;kategorie;meter;fach;reihe;preis` | Produkte → CSV-Import |
| `spar-markt-fehler.csv` | Dieselben 205 Zeilen mit 2 Fehlern (siehe unten) | CSV-Import, nur zum Zeigen der Fehlerliste |
| `spar-markt-beacons-bulk.txt` | 25 Zeilen `Code,Minor` | Beacons → Bulk anlegen → Textfeld |
| `spar-markt-beacons.csv` | Code, UUID, Major, Minor, Position in Metern | zum Nachschlagen |
| `dataset.json` | Markt, Beacons, erwartete Fehler, Suchproben, Kennzahlen | lokaler Full-Run |
| `generate_spar_markt.py` | erzeugt alle Dateien und prüft Regalzuordnung und Abdeckung | `python3 generate_spar_markt.py` |

Werte für das Formular:

- **Markt:** Code `SPAR-Demo-Review-800`, Name „SPAR Demo-Markt 800 (Sprint-Review)“, Demostraße 1, 4060 Leonding, AT.
- **Beacons:** UUID `2BD5170C-DD73-5CA0-A4D8-51B91BD13BF3`, Major `800`, Minor 1 bis 25.

Die Beacons sind Datensätze ohne echte Hardware. Für Bereitschaft und Suche reicht das. Navigation vor Ort mit der iOS-App geht damit nicht.

**Erwartete Fehler in `spar-markt-fehler.csv`:**
- Zeile 21, `kategorie`: „Kein Regal 999/1 im aktiven Layout.“
- Zeile 101, `preis`: „Preis fehlt. Für den Import ist für jedes Produkt ein Preis erforderlich.“

## Wie der Markt aufgebaut ist

Die Koordinaten sind Meter, mit dem Ursprung oben links. Oben ist die Rückwand (Norden), unten liegt der Eingang (Süden).

```
 y=0  | Wurst SB | Käse SB | Fleisch SB | Molkerei | Eier | Convenience |   <- Kühlung Rückwand
      |Käse-                                                  Getränke- | Tief-
      |theke    Gondel: Kaffee/Tee | Frühstück                 gondel:   | kühl
      |         Gondel: Süßwaren | Snacks                     Bier |    |
      |Wurst-   Gondel: Konserven | Nudeln & Reis             Wein     | Eis
      |theke    Gondel: Saucen/Öl | Backzutaten | Gewürze                | Wasser
      |Back-    Gondel: Drogerie                                         |
      |station  Gondel: Haushalt | Tiernahrung                           | Säfte
      |         Obst (Tische)   Salate/Kräuter       Kassenzone-Regal
      |Leergut  Gemüse          Aktion        Kassa 1  2  3  Self-Checkout
 y=24 |  [Eingang]
```

Kundenlauf wie im Handel üblich:

1. Eingang, dann Obst & Gemüse.
2. Backstation und Bedientheke an der Westwand.
3. Kühlung an der Rückwand.
4. Tiefkühl und Getränke an der Ostwand.
5. Trockensortiment in den Gondeln in der Mitte.
6. Kassen.

**Quellen:**

- SPAR-Expansionsbroschüre 2026: Verkaufsfläche je nach Format 80 bis 5.000 m².
- SPAR Daten & Fakten 2023: Ein SPAR-Markt hat im Schnitt etwa 800 m².
- Ladenbau-Literatur (lebensmittelpraxis.de): Obst & Gemüse am Eingang, Kühlung an der Rückwand.

Geschätzt sind die Aufteilung, die Regallängen und **alle Preise**. Die Preise sind plausibel auf etwa ±15 %, aber keine echten SPAR-Preise. Die Markennamen sind im österreichischen Handel üblich. Der Markt ist erfunden und bildet keine echte Filiale nach.

## Live-Ablauf

### A. Vorbereitung am Tag davor (Erik, eingeloggt als Admin, etwa 15 Minuten)

1. **Generalprobe** genau mit diesem Ablauf (Teil B), danach den Markt archivieren. Das Archivieren gibt die Beacons wieder frei. Für den echten Durchlauf `SPAR-Demo-Review-800` neu anlegen. Bei einem Archivierten Code einen neuen Code wählen, zum Beispiel `SPAR-Demo-Review-801`.
2. Smoke-Check ohne Login: `bash scripts/ops/smoke_check.sh https://it220209.cloud.htl-leonding.ac.at SPAR-Leonding-002 milch`. Erwartet 0 FAIL.
3. Bildschirmfotos jedes Schritts als Rückfall, falls LeoCloud ausfällt.

### B. Vor dem Review vorbereitet (Erik, etwa 6 Minuten, am Morgen)

Diese Schritte sind nur Klickarbeit und wirken in der Präsentation langweilig. Deshalb kommen sie vorher.

1. Stores → Neuer Store mit den Werten oben. Die Checkliste zeigt „1 von 7 Schritten“.
2. Beacons → „Bulk anlegen“:
   - UUID und Major eintragen.
   - Inhalt von `spar-markt-beacons-bulk.txt` einfügen.
   - Prüfen, dann speichern. Erwartet: 25 Beacons, keine Fehlerzeile.
3. Jedes Beacon `SPAR800-B01` bis `B25` über „Zuweisen“ dem Markt zuweisen. Am Markt sind dann 25 Beacons.

### C. Im Review live (etwa 8 Minuten)

| Min | Wo | Was Erik tut | Was das Publikum sieht | Akzeptanzkriterium |
|---|---|---|---|---|
| 0–1 | `/admin/next/` | Dashboard, Markt `SPAR-Demo-Review-800` öffnen | Markt mit Checkliste, 25 Beacons, kein Layout, keine Produkte | 1 |
| 1–2 | Pilot-Bereitschaft | Bereitschaft des neuen Markts | **Rot** mit konkreten Befunden: `NO_ACTIVE_LAYOUT`, `NO_STORE_PRODUCTS`, … | 2 |
| 2–3 | Editor | „JSON importieren“ → `spar-markt-layout.json`, als Version speichern, aktivieren | Grundriss mit 120 Regalen, 25 Beacons, Eingang, Kassen | 1 |
| 3–4 | Produkte → CSV-Import | `spar-markt-fehler.csv` wählen | Fehlertabelle: Zeile 21 (Regal 999/1), Zeile 101 (Preis fehlt). Import gesperrt, nichts gespeichert. | 1, 2 |
| 4–5 | Produkte → CSV-Import | `spar-markt.csv` wählen, importieren | „205 gespeichert“ | 1 |
| 5–6 | Pilot-Bereitschaft | Bereitschaft erneut prüfen | **Bereit (GREEN)**, 0 blockierende Befunde. Daneben der Testraum `SPAR-Leonding-002` mit konkreten Befunden. | 2 |
| 6 | Store-Seite | „Für Kunden freigeben“ | Markt erscheint in der Kunden-Marktliste | 1 |
| 6–8 | `/customer/` | Markt wählen, „Vollmilch“ suchen, dann „Vöslauer“. Danach Markt „Spar HTL Leonding“ (Testraum) mit derselben Suche. | Treffer nur aus dem gewählten Markt, Regal „Molkerei 2“ bzw. „Mineralwasser 2“. Im Testraum andere Regale. | 3 |
| 8 | Abschluss | Ehrliche Einordnung | „Bereit“ heißt: technisch vollständig konfiguriert. Ortungsgenauigkeit und echte Beacons misst der nächste Sprint. | – |

**Beweis für Kriterium 3 zusätzlich zur Oberfläche:** In den Entwicklertools den Netzwerk-Tab öffnen und `GET /api/products/search?q=vollmilch&storeCode=SPAR-Demo-Review-800` zeigen. Alle Treffer haben `storeCode: SPAR-Demo-Review-800`.

Ohne Login lässt sich dasselbe in einem Terminal zeigen:

```bash
curl -s "https://it220209.cloud.htl-leonding.ac.at/api/products/search?q=vollmilch&storeCode=SPAR-Demo-Review-800" | python3 -m json.tool | grep -E '"(name|storeCode|layoutCode)"'
```

**Suchproben (aus `dataset.json`):**

| Suche | Erwartetes Produkt | Regal | `layoutCode` |
|---|---|---|---|
| Vollmilch | SPAR Frische Vollmilch 1 l (dazu Schärdinger und Natur*pur) | Molkerei 2 | `240/2/1/1` |
| Vöslauer | Vöslauer still 1,5 l | Mineralwasser 2 | `410/2/1/1` |
| Spaghetti | Barilla Spaghetti N.5 500 g | Nudeln & Reis 1 | `560/1/1/1` |
| Manner | Manner Neapolitaner 400 g | Süßwaren 2 | `530/2/1/1` |
| Kotányi | Kotányi Paprika edelsüß 50 g | Gewürze 1 | `590/1/1/1` |

### D. Nach dem Review

1. Store-Seite → „Archivieren“. Der Markt verschwindet aus der Kunden-Marktliste, die Beacons werden frei.
2. Die 25 Beacons `SPAR800-B..` archivieren.
3. Die 205 Produkte bleiben im Index unter `storeCode SPAR-Demo-Review-800`. Ohne Markt sind sie unsichtbar (fail-closed). Ob sie gelöscht werden, entscheidet das Team später.

## Wenn etwas schiefgeht

| Problem | Ursache | Lösung |
|---|---|---|
| „Layout-Beacon ist dieser Filiale nicht zugeordnet“ beim Aktivieren | Nicht alle 25 Beacons sind zugewiesen | Beacons-Seite mit Filter „frei“ öffnen und den Rest zuweisen |
| Bulk anlegen: „Beacon-Code ist bereits vergeben“ | Beacons aus der Generalprobe noch aktiv | Die alten Beacons freigeben und wiederverwenden, nicht neu anlegen |
| Bereitschaft GELB statt GRÜN | Warnung, zum Beispiel ein Regal ohne Produkt | Befundliste vorlesen: Sie zeigt genau, was fehlt. Das erfüllt Kriterium 2 ebenfalls. |
| Markt fehlt in `/customer/` | Nicht freigegeben | „Für Kunden freigeben“ |
| LeoCloud nicht erreichbar | – | Bildschirmfotos aus der Generalprobe zeigen |
