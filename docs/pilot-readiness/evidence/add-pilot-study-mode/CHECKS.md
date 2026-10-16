# Prüfungen 2026-10-16

Geprüfter Source-Stand a9635fe, danach nur Evidence/Status. Xcode über DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer.

| Prüfung | Ergebnis |
|---|---|
| Baseline nach A-Fallback-Merge | 77 + 9 Tests, 0 Fehler; BUILD SUCCEEDED |
| Finale Swift-Tests | 77 Navigation + 14 eigener Support = 91, 0 Fehler |
| vorgeschriebener Debug-Simulator-Build | BUILD SUCCEEDED, Exit 0 |
| UI: Kundenbuild, StudyMode false | 1 Test, 0 Fehler; Testleitung fehlt |
| UI: T01, 3 synthetische Aufgaben | 1 Test, 0 Fehler; 2 app + 1 ohne_app; Export angeboten |
| Dateien aus Simulator-Container geprüft | 16 CSV-Spalten, 3 Datenzeilen, 6 JSONL-Events, UTC-Zeiten, 1 Dezimalstelle, Ergebnis/Modus korrekt |
| DEBUG Export-Netzwerklog | begin 18:58:37.503, end 18:58:37.513; 0 gemeinsame Backend-Anfragen dazwischen |
| OpenSpec Change strict | valid |
| OpenSpec all strict | 64 passed, 0 failed |
| git diff --check | grün |

## UI-Evidence

- study-off-settings.png: Kundenflag false, kein Testleitung-Einstieg.
- study-session.png: lokale Sitzung und Aufgaben.
- study-running-map.png: laufende App-Aufgabe und Abschlussknöpfe. Absichtlich unerreichbare lokale API: keine aktive Filiale, deshalb Übersicht; keine Innenraum-Navigation behauptet. Sichtbarer englischer Filialfehler stammt aus Eriks unveränderter StoreMapPage und bleibt Eigentums-Gate A.
- study-export.png: fertig erzeugte Exporte nach drei Aufgaben.
- study-share-sheet.png: System-Share-Sheet nach Animation separat per simctl aufgenommen; CSV und JSONL angeboten, kein Versand an Personen.

Der erste erweiterte UI-Lauf scheiterte am noch verdeckten Export-Button; nach Scrollschritt ist B-study2 grün. Der ursprüngliche XCTest-Screenshot direkt nach dem Share-Tap war zu früh; ersetzt durch tatsächlich geöffnetes System-Sheet.

## Grenzen

Simulator iPhone 17/iOS 27; kein reales Leihgerät, keine BLE-Messung, kein Pilotprodukt, keine echte Route. store_code ist im synthetischen Export leer, weil keine Filiale ausgewählt. Fehlende Navigationszähler „-“ sind keine gemessenen Nullen. C muss das Beispiel in den Kit-Pfad übernehmen. Detailprüfung in VERIFY.md.
