# Demo-Ablauf: Markt einrichten, Sortiment importieren, Bereitschaft prüfen, Suche je Markt

Stand: 2026-11-04 · Dauer etwa 8 Minuten · Grundlage: Abschnitt G des Sprint-Reviews (`docs/reviews/SPRINT_STORE_ONBOARDING_REVIEW.md`, Branch `review/sprint-store-onboarding`) und Aufgabe T9.

Diese Dateien gehören zum Demo-Kit:

| Datei | Inhalt |
|---|---|
| `demo-layout.json` | Grundriss 6 × 10 m (1 Zelle = 1 m), 1 Eingang, 6 beschriftete Regale, 4 Beacon-Plätze `DEMO-B1` bis `DEMO-B4` |
| `demo-markt.csv` | 15 Produkte, Spalten `id;name;kategorie;meter;fach;reihe;preis`, passt vollständig zum Layout |
| `demo-markt-fehler.csv` | Dieselben 15 Zeilen, aber Zeile 11 (Datei-Zeile, Produkt 10) zeigt auf das Regal `230/1`, das es nicht gibt |

## Regale im Demo-Layout

| Regal (`category`) | Bezeichnung | Produkte in `demo-markt.csv` |
|---|---|---|
| `110/1` | Obst & Gemüse | Bio Äpfel Gala 1kg, Bananen Fairtrade 1kg, Salatgurke |
| `120/1` | Brot & Backwaren | Bauernbrot 500g, Salzstangerl 6 Stück |
| `210/1` | Milchprodukte | **SPAR Frische Vollmilch 1L**, Naturjoghurt 500g, Teebutter 250g |
| `220/1` | Getränke | **Vöslauer Mineralwasser still 1.5L**, Apfelsaft naturtrüb 1L |
| `310/1` | Nudeln & Konserven | **Barilla Spaghetti N.5 500g**, Tomaten gehackt 400g, Basmatireis 1kg |
| `320/1` | Snacks & Süßes | Salzbrezeln 200g, Zartbitterschokolade 100g |

Die drei fett gesetzten Namen gibt es auch im Testraum-Katalog (`demoproducts.ndjson`), dort aber in anderen Regalen (Vollmilch `520/1`, Mineralwasser `510/1`, Spaghetti `430/1`). So zeigt dieselbe Suche je Markt ein anderes Regal. „Vollmilch“ trifft im Demo-Markt genau ein Produkt.

Beacon-Plätze (Meter, Ursprung oben links): `DEMO-B1` (0,5 | 3), `DEMO-B2` (5,5 | 3), `DEMO-B3` (0,5 | 7), `DEMO-B4` (5,5 | 7). Mit dem Standardradius von 8 m erreichen alle begehbaren Zellen mindestens drei Beacons.

## Vor der Demo (Generalprobe, etwa 30 Minuten, 1 bis 2 Tage vorher)

1. Login als Admin vorher erledigen, nichts davon in der Demo tippen.
2. Vier Beacons vorbereiten und **mit den Beacon-Codes `DEMO-B1` bis `DEMO-B4`** in der Beacon-Verwaltung führen, mit echter UUID (nicht `0000…`), Major und Minor. Nur so passen sie zu den Plätzen im Layout.
3. Ablauf einmal mit einem Wegwerf-Markt durchspielen, Zeiten messen, danach archivieren.
4. Prüfen, dass der Smoke-Check 0 FAIL zeigt und dass Beacons dem Markt frei zugeordnet werden können.
5. Rückfall: Screenshots oder Readiness-Export jedes Schritts, falls LeoCloud ausfällt.

**Beacon-Identität im Editor setzen:** `demo-layout.json` nennt die Beacons nur über ihren Code (`DEMO-B1` bis `DEMO-B4`), ohne UUID, Major und Minor. Die echten Werte stehen erst nach dem Ablesen fest. Nach dem Import im Editor deshalb für jeden Beacon-Platz einmal „Zugeordneter Beacon“ wählen. Der Editor trägt dann `uuid`, `major`, `minor` und `identityKey` ein. Ohne diesen Schritt bleibt die Bereitschaft rot (`NO_BEACONS`, `BEACON_WITHOUT_IDENTITY`). Gefunden im lokalen Komplettlauf vom 2026-11-07 (`scripts/ops/full_run/`). Der SPAR-Demo-Markt (`../spar-markt/`) hat die Identität bereits in der JSON-Datei.

**Reihenfolge beachten:** Das Backend aktiviert ein Layout nur, wenn jedes Beacon darin dem Markt bereits zugeordnet ist (`Layout-Beacon ist dieser Filiale nicht zugeordnet`). Deshalb steht die Beacon-Zuordnung vor dem Aktivieren des Layouts. Das weicht von der Reihenfolge in Abschnitt G ab (dort Editor vor Beacons).

Wo die Demo läuft, entscheidet Erik. Empfohlen: live mit dem Markt `DEMO-Review-001`, danach archivieren (löschen geht nicht, der Markt erscheint bis dahin in der Kunden-Marktliste). Alternative: lokal auf dem Docker-Compose-Stack.

## Ablauf

| Min | Seite | Was wir zeigen | Sichtbares Ergebnis |
|---|---|---|---|
| 0–1 | `/admin/next/` (als Admin angemeldet) | Rolle und Märkte | Dashboard mit Märkten |
| 1–2 | Stores → Neuer Store | `DEMO-Review-001` anlegen | Markt-Seite mit Checkliste „1 von 7 Schritten erledigt“ |
| 2–3 | Beacons | `DEMO-B1` bis `DEMO-B4` dem Markt zuordnen | Vier Beacons im Markt |
| 3–4 | Editor (Link aus Checkliste) | `demo-layout.json` über „JSON importieren“ laden, prüfen, als Version speichern und aktivieren. Haben die Beacons andere Codes: je Beacon-Platz im Editor „Zugeordneter Beacon“ wählen | Checkliste: Layout aktiv, Regale beschriftet, Beacons platziert |
| 4–5 | Produkte → CSV-Import | Erst `demo-markt-fehler.csv`: Fehlertabelle mit genau einer Zeile (Datei-Zeile 11, „Kein Regal 230/1 im aktiven Layout.“), Commit gesperrt. Dann `demo-markt.csv`: 15 gespeichert | Schritt „Sortiment“ erledigt |
| 5–6 | Pilot-Bereitschaft | Demo-Markt: „Bereit“ (GREEN). Dann ein Markt, der nicht bereit ist (siehe unten) | Beide Zustände nebeneinander |
| 6–8 | `/customer/` | Demo-Markt wählen, „Vollmilch“ suchen: ein Treffer im Regal Milchprodukte. Markt „Spar HTL Leonding“, gleiche Suche: anderes Regal. Markt „SPAR Speychal Hagenberg“: „Nichts gefunden“ | Gleicher Name, verschiedene Regale je Markt, kein Fremdtreffer |
| 8 | Abschluss | Ehrlich sagen: „Bereit“ heißt technisch vollständig konfiguriert. Die Ortungsgenauigkeit misst der nächste Sprint (Feldmessung). | – |

**Markt, der nicht bereit ist (Minute 5–6):** Zweiten Demo-Markt anlegen, dasselbe Layout importieren, im Editor den Eingang löschen und speichern. Die Bereitschaft zeigt dann `ENTRANCE_COUNT`. Für `BEACON_UUID_ALL_ZERO` braucht es zusätzlich ein Beacon mit Null-UUID in diesem Markt. Alternativ den Testraum vor T6 zeigen. Der zweite Markt wird ebenfalls archiviert.

**Beweis der Suche zusätzlich zur Oberfläche:** im Browser die Netzwerkanfrage zeigen: `GET /api/products/search?q=vollmilch&size=30&storeCode=DEMO-Review-001`. Alle Treffer haben `storeCode: DEMO-Review-001`.

**Nach der Demo:** `DEMO-Review-001` (und den zweiten Demo-Markt) archivieren.

## Regeln der CSV (zur Erklärung, falls jemand fragt)

- Trennzeichen `;`, UTF-8, Dezimalkomma. Pflichtspalten `name`, `kategorie`, `meter`, `fach`, `reihe`. Für den Import braucht jede Zeile zusätzlich einen `preis`.
- `kategorie` und `meter` müssen zu einem Regal im aktiven Layout passen (`category` = `kategorie/meter`). Der Produktcode wird zu `kategorie/meter/fach/reihe`.
- Die Prüfung läuft im Browser. Solange Fehler da sind, bleibt der Commit gesperrt. Es wird nichts halb gespeichert.
- Die Produkt-IDs `1` bis `15` sind fest vergeben. Ein zweiter Import derselben Datei überschreibt die Produkte und verlangt eine Bestätigung.

## Was lokal geprüft wurde (Stand 2026-11-04, Basis `main` `e93ebdc`)

| Prüfung | Ergebnis |
|---|---|
| `demo-layout.json` mit `parseImportedDocument` (Editor-Import) | akzeptiert, 11 Elemente, 6 × 10 |
| `demo-layout.json` mit `LayoutDocumentValidator` (Entwurf sowie Aktivierung: Regalrouting, Mobil-IDs, Anker) | akzeptiert |
| `demo-markt.csv` mit `reviewCsvImport` (Produktionscode des Admin-UI) gegen das Layout | 15 von 15 gültig, keine Fehler, Commit erlaubt |
| `demo-markt-fehler.csv` | 14 gültig, genau 1 Fehler (Zeile 11, `kategorie`, „Kein Regal 230/1 im aktiven Layout.“), Commit gesperrt |
| `StoreReadinessEvaluator` mit Layout, 15 Produkten und 4 zugeordneten Beacons mit vollständiger Identität (Radius 8 m) | GREEN, 0 Befunde, 48 begehbare Zellen, 0 mit zu wenig Abdeckung |

**Nicht geprüft:**

- Kein Durchlauf in der Oberfläche und kein Aufruf des Backends: Das erfordert eine Anmeldung, und dafür wurden keine Zugangsdaten verwendet. Der Docker-Compose-Stack wurde nicht gestartet.
- Die Readiness-Befunde `NO_SHELVES`, `NO_STORE_PRODUCTS`, `NO_BEACONS` kommen aus T1 und sind auf `main` noch nicht enthalten. Ob der Demo-Markt damit grün bleibt, ist offen. Das Layout enthält Regale, die CSV eigene Produkte und das Layout vier Beacons, die Bedingungen sind also erfüllt, sobald die Beacons registriert sind.
- Die Suche nach „Vollmilch“ gegen OpenSearch und die Regale der Bestandsmärkte „Spar HTL Leonding“ und „SPAR Speychal Hagenberg“ wurden nicht gelesen. Die Annahme zu den anderen Regalen stützt sich auf `demoproducts.ndjson`. Vor der Demo am echten Markt prüfen.
