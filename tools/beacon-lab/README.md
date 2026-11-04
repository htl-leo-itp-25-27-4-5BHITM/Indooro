# Indooro Positioning Lab

Ein lokales Forschungswerkzeug, mit dem das Team BLE-Beacon-Feldtests und Indoor-Positionierungsverfahren für Indooro reproduzierbar auswertet.

**Import → Datenqualität → Kalibrierung → Algorithmus → Fehleranalyse → Visualisierung → Bericht/Export**

- Läuft vollständig im Browser. Es gibt kein Backend, keinen Login und keine Verbindung zum produktiven Indooro-System.
  Messdaten bleiben lokal (IndexedDB) oder in Dateien, die das Team selbst exportiert.
- Importiert das echte Aufzeichnungsformat der iOS-App (`NavigationRecorder`, JSON Lines) sowie CSV und JSON.
- Der Lab erfindet keine Ergebnisse. Alle Kennzahlen werden aus den importierten Daten berechnet. Synthetische Daten sind überall
  als **SYNTHETISCH** gekennzeichnet.
- Ohne bestätigten Maßstab zeigt der Lab Distanzen in Layout-Einheiten (LE), nicht in Metern.

> Die Ziel-Genauigkeit von etwa 4–5 m ist ein Entwicklungsziel. Bisher hat dieses Werkzeug keine Messung mit echter
> Hardware ausgewertet. Die mitgelieferten Daten sind synthetisch.

## Schnellstart

Voraussetzung: Node.js 22.13 oder neuer (wie `admin-ui`).

```bash
cd tools/beacon-lab
npm ci
npm run dev          # http://localhost:4317
```

Im Browser auf **„Demo-Kampagne laden (synthetisch)“** klicken. Die Demo-Kampagne enthält einen fiktiven Markt mit 10 Beacons, 2 Kalibrierungsläufe und 4 Evaluationsläufe
(gute Abdeckung, starkes Rauschen, Beacon-Ausfall, Gang-Lauf).

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Entwicklungsserver (Port 4317) |
| `npm run build` | Typprüfung + Produktions-Build nach `dist/` |
| `npm run preview` | Build lokal ausliefern (Port 4318) |
| `npm test` | Unit- und Integrationstests (Vitest) |
| `npm run test:e2e` | Browser-Tests (Playwright, Desktop + Mobile) |
| `npm run typecheck` | TypeScript-Prüfung |

## Funktionen

| Bereich | Inhalt |
| --- | --- |
| Messkampagnen | Anlegen, Metadaten (Markt, Gerät, Bedingungen), Export/Import als JSON-Bundle, Demo-Kampagne |
| Grundriss & Beacons | Indooro-Layout-JSON importieren, fiktiver Demo-Markt, Maßstab konfigurieren und bestätigen, Beacon-Positionen und -Status |
| Messdaten | Import von CSV, JSON und Indooro-JSONL mit Spaltenzuordnung, Validierung mit Zeilennummern und protokollierten Transformationen; Rollen *Kalibrierung* und *Evaluation*; deterministischer Generator für synthetische Daten (8 Szenarien) |
| RSSI-Analyse | Statistik je Beacon, Zeitverlauf roh vs. gefiltert, Histogramme, Lücken und Ausreißer, Signal je Messposition, Filterwirkung |
| Kalibrierung | Fit des Log-Distance-Pfadverlustmodells (A, n) aus Kalibrierungsläufen, je Beacon, mit Erkennung von Zensierung durch die Empfangsgrenze |
| Positionierung | Stärkster Beacon, gewichteter Schwerpunkt, Trilateration (robust, Levenberg-Marquardt), kNN-Fingerprinting; RSSI-Filter; zeitliche Stabilisierung (EMA, Kalman, Geschwindigkeitsgrenze) |
| Fehleranalyse | Mittel, Median, RMSE, P90, P95, Max, Anteil ≤ 2/3/5, Ausfallrate, Sprungrate, Verzögerung, Präzision vs. Bias |
| Vergleich | Mehrere Konfigurationen auf derselben Messreihe, zusätzlich auf der gemeinsamen Epochenmenge, Parameter-Sweep, CDF, Export |
| Heatmaps | RSSI, Positionsfehler, Beacon-Abdeckung, Messpunktdichte; als Punkte, Raster oder IDW-Interpolation (gekennzeichnet, mit Reichweitengrenze) |
| Replay | Zeitliche Wiedergabe von Ground Truth und Schätzung, aktive Beacons, aktueller Fehler, Geschwindigkeit, Einzelschritte, Algorithmuswechsel |
| Bericht | Druckbarer HTML-Bericht (PDF über den Druckdialog), JSON/CSV-Export, automatisch erzeugte Grenzen der Aussagekraft, Reproduzierbarkeitsangaben |

## Dokumentation

| Dokument | Inhalt |
| --- | --- |
| [docs/FIELD_GUIDE.md](docs/FIELD_GUIDE.md) | **Anleitung für die erste echte Messkampagne** |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architektur, Module, Schnittstellen, Grundsätze |
| [docs/IMPORT_FORMATS.md](docs/IMPORT_FORMATS.md) | Importformate, Felder, Validierungsregeln, Fehlercodes |
| [docs/ALGORITHMS.md](docs/ALGORITHMS.md) | Filter, Verfahren, Kalibrierung, Bezug zur iOS-App |
| [docs/METRICS.md](docs/METRICS.md) | Definition aller Kennzahlen, Fehlschlag-Politik, Einheiten |
| [docs/MAP_AND_HEATMAPS.md](docs/MAP_AND_HEATMAPS.md) | Koordinatensystem, Heatmap-Regeln, Replay |
| [docs/SYNTHETIC_DATA.md](docs/SYNTHETIC_DATA.md) | Simulationsmodell, Szenarien, Seeds |
| [docs/REPORTING.md](docs/REPORTING.md) | Berichtsaufbau, Exporte, korrektes Zitieren |
| [docs/IOS_INTEGRATION_SPEC.md](docs/IOS_INTEGRATION_SPEC.md) | Was die iOS-App heute aufzeichnet und welche Erweiterungen sinnvoll sind |
| [docs/TESTING.md](docs/TESTING.md) | Teststrategie und Ausführung |
| [samples/README.md](samples/README.md) | Beispieldateien (synthetisch) |

## Datenschutz und Datenqualität

- Daten verlassen den Browser nur über einen Export, den das Team selbst auslöst. Der Speicher lässt sich über die Browser-Einstellungen
  löschen (Website-Daten für `localhost:4317`).
- Aufnahmen aus der App vor der Weitergabe mit `scripts/field/anonymize_recording.py` anonymisieren.
- Rohdaten werden nach dem Import nie verändert. Filter arbeiten auf Kopien. Jede Umwandlung beim Import
  (z. B. ms → s, Sortierung, Dezimalkomma, Entfernen exakter Duplikate) wird in der Provenienz der Messreihe festgehalten.
- Kalibrierung und Fingerprints verwenden ausschließlich Läufe mit der Rolle *Kalibrierung*. Die Auswertung läuft ausschließlich auf
  *Evaluation*. Die Pipeline erzwingt diese Trennung (`LeakageError`).

## Bekannte Einschränkungen

- Bisher sind ausschließlich synthetische Daten verfügbar. Aussagen über die echte Genauigkeit sind erst nach Feldmessungen möglich.
- Die Simulation ist vereinfacht (Log-Distance-Modell mit Shadowing, Paketverlust und vereinfachtem Mehrwegeeffekt). Wände,
  Körperabschattung und Geräteunterschiede werden nicht physikalisch modelliert.
- Die iOS-Pipeline (Gauss-Newton mit Huber-Gewichtung, Pose-Fusion, Map-Matching auf den Graphen) wird angenähert und
  nicht 1:1 portiert. Ein direkter Vergleich mit der App ist über den Replay in `scripts/field` möglich.
- Nur eine Etage. Rotation von Layout-Elementen wird dargestellt, Wände als Hindernisse für die Ausbreitung werden nicht berücksichtigt.
- Die Ground Truth stammt aus dem Antippen auf der Karte (iOS-Protokoll). Ihre Genauigkeit begrenzt die Aussagekraft im Bereich
  von Dezimetern.
- Die Berechnungen laufen synchron im Haupt-Thread. Das reicht für typische Läufe (30 min × 10 Beacons × 5 Hz in unter 0,5 s).
  Ein Web Worker war bisher nicht nötig.
- Die Daten liegen in IndexedDB pro Browser und werden nicht zwischen Geräten synchronisiert. Zum Austausch dienen Exporte.

## Stand der iOS-Integration

Die App zeichnet heute RSSI und Ground Truth nur in **DEBUG-Builds** auf. Gerätemodell, Szenario und Laufrolle stehen
nicht in der Datei. Details und Vorschläge enthält [docs/IOS_INTEGRATION_SPEC.md](docs/IOS_INTEGRATION_SPEC.md). Die App wurde für dieses Werkzeug
nicht verändert.
