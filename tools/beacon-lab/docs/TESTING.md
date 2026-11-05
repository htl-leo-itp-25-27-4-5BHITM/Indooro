# Teststrategie des Positioning Lab

Stand der Zahlen: Lauf vom 2026-11-05 (zweimal hintereinander grün, keine Wiederholungen nötig).

| Ebene | Werkzeug | Umfang |
| --- | --- | --- |
| Unit / Integration | Vitest (jsdom, fake-indexeddb, Testing Library) | **446 Tests in 36 Dateien** |
| End-to-End | Playwright (Chromium), gegen den Produktions-Build | **20 Tests** (17 Desktop 1440×900, 1 Mobil Pixel 7, 2 Screenshots) |

## Testpyramide

### Unit- und Integrationstests (Vitest)

Liegen neben dem Code als `*.test.ts(x)`. Bereiche:

- `src/core` – Typen, Einheiten und Maßstab (LE/Meter), Statistik.
- `src/data` – Import (CSV, Lab-JSON, Indooro-JSONL), Spaltenzuordnung, Zeitformate, Validierung und Qualitätsbericht, Export, Persistenz (IndexedDB), Beispieldateien unter `samples/`.
- `src/positioning` – Algorithmen (stärkster Beacon, gewichteter Schwerpunkt, Trilateration, kNN), RSSI- und Zeitfilter, Kalibrierung, Auswertung, Metriken, Referenzzuordnung, Datenleck-Schutz, Vergleich, Parameter-Sweep.
- `src/map` – Karte, Heatmap-Berechnung (Punkte, Raster, IDW), Overlays, Replay.
- `src/report` – Berichtsmodell, HTML-Rendering (Escaping, SVG-Bereinigung), Exporte.
- `src/ui` – Router, Komponenten, Diagramme, Seiten (Kampagnenliste, Daten, Positionierung, Bericht, Analyse).
- `src/integration` – Zusammenspiel mehrerer Schichten.

### End-to-End-Tests (Playwright, `e2e/`)

Jeder Test startet mit leerem Browser-Speicher (IndexedDB je Testkontext) und schlägt bei jedem `console.error` oder `pageerror` fehl.

`workflow.spec.ts` (12 Szenarien)
1. Kampagne über „Neue Messkampagne“ mit fiktivem Demo-Markt anlegen.
2. Synthetische Läufe erzeugen (Evaluation und Kalibrierung); Demo-Kampagne laden (6 Läufe).
3. RSSI-Seite: Beacon wählen, Statistik-Kacheln gefüllt, Filter ändern (kein Filter → EMA), Filterwirkung ändert sich, Streuung sinkt.
4. Positionierung: Algorithmus wählen, Fehlerstatistik (13 numerische Kacheln), Einheit LE bei unbestätigtem Maßstab, Fehlschläge, Synthetik-Warnung, veraltetes Ergebnis nach Einstellungsänderung.
5. Heatmaps: Punkte, IDW (Hinweis „INTERPOLIERT“), Raster.
6. Replay: Abspielen, Pause (Zeit steht), Epoche vor.
7. Algorithmusvergleich: Konfiguration ergänzen, Kennzahlen- und Gemeinsame-Epochen-Tabelle mit je einer Zeile pro Konfiguration, alle Ergebnisse speichern.
8. Bericht: Ergebnis speichern, auswählen, Vorschau enthält „SYNTHETISCH“, Config-Hash, Interpretation und Kennzahlen; Download von HTML, JSON und CSV.
9. Kalibrierung mit Maximaldistanz und Übernahme als Kampagnenmodell; Übersicht zeigt „kalibriert“.
10. Datenleck-Schutz: Positionierung und Vergleich bieten keine Kalibrierungsläufe an; Replay eines Kalibrierungslaufs zeigt einen Fehler statt zu rechnen.
11. Maßstab bestätigen verlangt eine Prüfnotiz; danach Meter statt LE.
12. Beacon in der Plankarte auswählen.

`import.spec.ts` (5 Szenarien): CSV im Langformat (Zuordnung, Vorschau, Prüfung, Übernahme, Laufliste); Indooro-Aufnahme `.jsonl` in einer Kampagne mit importiertem Layout `layout-synthetic-testraum.json` (als synthetisch gekennzeichnet, Auswertbarkeit ausgewiesen); kaputte CSV ohne `rssi`-Spalte; kaputte CSV mit ungültigen Werten („übernehmen“ bleibt gesperrt); nicht unterstützte Dateiendung.

`mobile.spec.ts` (Pixel 7): Kampagnenliste, Übersicht, Daten, Positionierung, Vergleich, Bericht und weitere Seiten ohne horizontalen Überlauf (`scrollWidth <= clientWidth + 1`); Navigationsmenü öffnet und schließt nach Navigation.

`screenshots.spec.ts`: erzeugt die Bilder unter `docs/screenshots/` (siehe unten) und prüft nebenbei, dass dabei keine Konsolenfehler auftreten.

## Ausführen

```bash
npm test                 # Vitest, einmalig
npm run test:watch       # Vitest im Watch-Modus
npm run typecheck        # tsc
npx playwright test      # E2E, beide Projekte (baut und startet Preview auf Port 4318)
npx playwright test import --project=desktop   # einzelne Datei / einzelnes Projekt
```

Der E2E-Lauf baut die App (`npm run build`) und startet `vite preview` auf `127.0.0.1:4318`. Ein bereits laufender Server wird außerhalb von CI wiederverwendet. Fehlgeschlagene Tests legen unter `test-results/` einen Trace ab (`npx playwright show-trace <datei>`).

## Screenshots

`e2e/screenshots.spec.ts` schreibt bei jedem E2E-Lauf nach `docs/screenshots/*.png` (Desktop 1440×900, Mobil Pixel 7, jeweils `deviceScaleFactor: 2`):
`campaigns`, `overview`, `plan`, `data-import-result`, `signals`, `calibration`, `positioning`, `compare`, `heatmap-idw`, `replay`, `report`, `mobile-overview`, `mobile-positioning`.
Nur den Screenshot-Lauf: `npx playwright test screenshots --project=desktop`. Die Dateien ändern sich bei jedem Lauf geringfügig (Zeitstempel, Rendering); nur committen, wenn die Ansicht sich wirklich geändert hat.

## Umgebung

- Playwright nutzt Chromium. Die Konfiguration wählt den Browser in dieser Reihenfolge: `PW_CHROMIUM_PATH` (explizit gesetzt), erster Treffer `/opt/pw-browsers/chromium-*/chrome-linux*/chrome`, sonst Playwrights eigener Browser. Auf normalen Entwicklungsrechnern ist nichts zu setzen (`npx playwright install chromium` genügt).
- Beispiel: `PW_CHROMIUM_PATH=/usr/bin/chromium npx playwright test`.
- Node `^22.13.0 || ^24.0.0`.
- Hinweis zur Berichtsvorschau: Sie liegt in einem iframe mit `sandbox` ohne `allow-scripts` (bewusst). Playwright injiziert Skripte in jeden Frame, Chromium meldet dazu „Blocked script execution in 'about:srcdoc'“. Das ist mit einem nackten sandboxed iframe ohne die App reproduzierbar und wird in `e2e/helpers.ts` gezielt aus der Fehlerprüfung ausgenommen. Der Berichtsinhalt wird deshalb über das `srcdoc`-Attribut geprüft.

## Nicht getestet

- **Echte Hardware:** keine Messung mit realen BLE-Beacons oder Geräten; alle E2E-Daten sind synthetisch.
- **Echte iOS-Aufzeichnungen:** nur die synthetische Beispielaufnahme (`samples/synthetic-indooro-recording.jsonl`); reale Dateien, Gerätestreuung und Zeitstempelfehler sind nicht abgedeckt.
- **PDF-Ausgabe:** getestet wird das druckoptimierte HTML; die Ausgabe der Browser-Druckfunktion („Als PDF speichern“) wird nicht geprüft.
- Weitere Browser (Firefox, WebKit/Safari) und echte Mobilgeräte; die Mobilansicht ist Chromium-Emulation.
- Visuelle Regression: Screenshots werden erzeugt, aber nicht gegen Referenzbilder verglichen.
- Barrierefreiheit (automatisierte Audits) und Lasttests mit sehr großen Dateien.
