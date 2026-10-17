# Accessibility-Audit iOS-Client (improve-ios-accessibility)

Stand: nach dem Accessibility-Durchgang auf Branch `pilot/ios-accessibility-erik` (Commit `9362dd4`), Basis `87f4e3a`.

**Wichtig vorab:** Dies ist ein **statischer Audit** (Quelltext, Git-Historie, Rechnung). Der Xcode-Accessibility-Inspector wurde **weder vor noch nach** den Änderungen ausgeführt, und VoiceOver wurde weder auf Simulator noch auf Gerät getestet. Die „Vorher“-Werte stammen aus `git grep` auf dem Stand `87f4e3a`, nicht aus einer Inspector-Messung. Siehe Abschnitt 6.

---

## 1. Befunde vorher / nachher

Zählungen per `git grep` (Vorher) bzw. `grep -rn` (Nachher) über `swift/indooro-EinkaeuferFinal/indooroApp`.

| Bereich | Vorher (`87f4e3a`) | Nachher (`9362dd4`) | Bemerkung |
|---|---|---|---|
| `.accessibility…(`-Modifier | 20 | 56 | Proposal nennt 21; die gleiche Suche ergibt auf `87f4e3a` 20. Abweichung nicht geklärt. |
| Zeilen mit „accessibility“ | 20 | 58 | inkl. Kommentare und Hilfsdateien |
| Dateien mit Vorkommen von „accessibility“ (Kleinschreibung) | 8 | 9 | neu hinzu u. a. `Utilities/AccessibilityText.swift` und `Extensions/Color+AccessibilityPalette.swift` (Dateinamen tragen den Begriff groß) |
| Feste Schriftgrößen `.system(size:` | 23 | 16 | Proposal nennt 22; Abweichung wie oben. Verbleibende 16: Abschnitt 2 |
| `@ScaledMetric` | 0 | 8 | Icon-Größen skalieren mit Dynamic Type |
| Text-Styles (`.font(.headline)` usw.) | 209 | 209 | bereits vor dem Durchgang skalierbar, unverändert |
| `accessibilityIdentifier` | 6 | 8 | neu: `mapSummary`, `tourPanel` |
| Kartenzusammenfassung für VoiceOver | keine | ein Element `mapSummary` | Regale, Marker und Achsen sind in der Kartenebene `accessibilityHidden(true)` |
| Frames mit 44 pt (`frame(…44…)`) | 13 in 5 Dateien | 39 in 8 Dateien | Abschnitt 4 |
| Kontrast-Farben | Route-Blau 3.37:1, Orange 2.20:1, Sekundärtext ca. 3.4:1 | siehe Abschnitt 3 | |
| Unbeschriftete Karte | ja | nein | Zusammenfassung mit Ziel, Entfernung, Route ab |

---

## 2. Verbleibende feste Schriftgrößen (`.system(size:`)

Acht davon sind per `@ScaledMetric` skaliert (Wert ist die Basis, wächst mit Dynamic Type). Acht stehen in der Kartenebene, die für VoiceOver ausgeblendet ist, und skalieren mit dem Kartenmaßstab statt mit Dynamic Type.

| Datei:Zeile | Größe | Begründung |
|---|---|---|
| `Views/Scan/AnchorScannerView.swift:67` | `fallbackIconSize` | `@ScaledMetric(relativeTo: .title)` (Zeile 15) |
| `Views/Components/ProductSearchRow.swift:31` | `productIconSize` | `@ScaledMetric(relativeTo: .title)` (Zeile 12) |
| `Views/Main/ShoppingFeatureViews.swift:55` | `arrowIconSize` | `@ScaledMetric(relativeTo: .title)` (Zeile 48) |
| `Views/Main/HomeDashboardView.swift:111` | `heroIconSize` | `@ScaledMetric(relativeTo: .title)` (Zeile 12) |
| `Views/Main/StoreMapPage.swift:831` | `targetIconSize` | `@ScaledMetric(relativeTo: .title)` (Zeile 41) |
| `Views/Main/StoreMapPage.swift:1174` | `storeIconSize` | `@ScaledMetric(relativeTo: .body)` (Zeile 1154) |
| `Views/Main/RecipeFeatureViews.swift:661` | `fallbackIconSize` | `@ScaledMetric(relativeTo: .title)` (Zeile 624) |
| `Views/Main/RecipeFeatureViews.swift:695` | `iconSize` | `@ScaledMetric(relativeTo: .title)` (Zeile 690) |
| `Views/Components/MapAxes.swift:14, 27` | 8 pt | Achsenbeschriftung der Kartenzeichnung; Kartenebene ist `accessibilityHidden(true)` (MapView.swift, Gruppe um Regale/Marker/Achsen) |
| `Views/Components/ShelfView.swift:38, 46` | aus Kartengeometrie | Regalbeschriftung auf der Karte; Kartenebene ausgeblendet. Der Name des aktiven Stopps steht in `mapSummary`; Namen anderer Gänge sind für VoiceOver nicht erreichbar (offen, siehe unten) |
| `Views/Components/BeaconMapItem.swift:33, 38` | 12 pt, 8 pt | Beacon-Markierung auf der Karte; Kartenebene ausgeblendet |
| `Views/Components/UserLocationMarker.swift:27` | 27 pt | Positionsmarker; Kartenebene ausgeblendet, Position steht im Positionsbanner und in `mapSummary` |
| `Views/Components/TargetMapMarker.swift:17` | 34 pt | Zielmarker; Kartenebene ausgeblendet, Ziel steht in `mapSummary` |

**Offen:**
- Die Kartenebene ist für VoiceOver ausgeblendet, skaliert aber nicht mit Dynamic Type. Bei XXL bleibt der Kartenmaßstab gleich, weil die Karte geometrisch ist.
- Die Namen der übrigen Regale (nicht Ziel, nicht aktiver Stopp) sind per VoiceOver nicht erreichbar. Das ist ein bekannter Rest der Karten-Zusammenfassung, kein Fehler der Zählung.

---

## 3. Kontrast (WCAG 2.x, gegen Weiß)

Berechnet mit einem Python-Skript (Python, Formel der relativen Leuchtdichte; keine Abhängigkeit im Repo). Die Werte entsprechen `Utilities/AccessibilityPalette.swift`.

| Farbe | Wert (sRGB) | Verhältnis | Schwelle 4.5:1 | Verwendung |
|---|---|---|---|---|
| Route-Blau alt (`routeAccent`) | 0.15, 0.57, 0.88 | 3.37:1 | nicht erfüllt | vorher Text und Buttons |
| Route-Blau neu (`routeBlueText`) | 0.05, 0.38, 0.70 | 6.23:1 | erfüllt | Text, Buttons mit weißer Schrift |
| Orange alt (`.orange`, iOS-Systemfarbe hell) | 1.00, 0.584, 0.00 | 2.20:1 | nicht erfüllt | vorher Warnhinweise |
| Warmakzent alt (`warmAccent`) | 0.87, 0.63, 0.26 | 2.27:1 | nicht erfüllt | vorher Akzenttext |
| Warntext neu (`warningText`) | 0.70, 0.33, 0.00 | 5.03:1 | erfüllt | Warnhinweise, Akzenttext |
| Sekundärtext alt (`.secondary`) | ca. 138, 138, 142 | 3.44:1 | nicht erfüllt | vorher Sekundärtext |
| Sekundärtext neu (`secondaryText`) | 0.36, 0.36, 0.38 | 6.67:1 | erfüllt | Sekundärtext |
| Tertiärtext alt (`.tertiary`) | ca. 197, 197, 199 | 1.72:1 | nicht erfüllt | im Durchgang entfernt |
| Markengrün (`brandGreen`) | 0.00, 0.43, 0.36 | 6.23:1 | erfüllt | Akzentbuttons mit weißer Schrift |
| Tab-Tint (`Color(red:0.12,green:0.46,blue:0.39)`) | 0.12, 0.46, 0.39 | 5.53:1 | erfüllt | Tab-Leiste |

Hinweise:
- Die Alt-Werte für `.secondary`, `.tertiary` und `.orange` sind aus den iOS-Systemfarben im hellen Modus abgeleitet (die App erzwingt `.preferredColorScheme(.light)`). Sie sind Näherungen, keine Messung am Gerät.
- Nicht-Text-Kontrast (3:1 für Icons und Grenzen) ist in diesem Audit nicht geprüft.
- Der Kontrast des Kartenhintergrunds (Regale, Route-Linie) ist nicht gemessen.

---

## 4. Tippziele (mindestens 44 × 44 pt)

Die Zahl der Frames mit 44 pt ist von 13 auf 39 gestiegen (5 → 8 Dateien). Umgesetzt mit `frame(minWidth: 44, minHeight: 44)` plus `contentShape`, wo ein kleines Icon sichtbar bleiben sollte.

Je Datei (Zeilen mit 44-pt-Frame, nachher):

| Datei | Zeilen |
|---|---|
| `Views/Main/StoreMapPage.swift` | 14 |
| `Views/Main/ShoppingFeatureViews.swift` | 10 |
| `Views/Main/HomeDashboardView.swift` | 8 |
| `Views/Study/StudySessionView.swift` | 2 |
| `Views/Components/ProductSearchRow.swift` | 2 |
| `Views/Components/PilotIntroduction.swift` | 1 |
| `Views/Components/UserLocationMarker.swift` | 1 |
| `Views/Main/RecipeFeatureViews.swift` | 1 |

Bekannte Ausnahmen oder Prüfpunkte:
- **Einplanen** (`ProductSearchRow.swift`, Zeile 83): äußerer Frame 44 × 44, das Icon bleibt 30 pt. Dies ist der Wert, den `AccessibilityUITests.testControlsHaveMinimumTouchTarget` prüft.
- **Erledigt, Überspringen** (Tour-Panel, `ShoppingFeatureViews.swift`): `frame(height: 44)`; die Breite ergibt sich aus dem Layout. Bei XXL nicht gemessen.
- **Tab-Leiste**: System-Tabs (49 pt), nicht eigens gesetzt.
- **Kartenmarker** (Beacon, Zielmarker): nicht interaktiv bzw. durch die Kartenebene ausgeblendet; keine Tippziele.
- Nicht gemessen: Abstände zwischen benachbarten Zielen bei XXL.

---

## 5. VoiceOver: Beschriftungen und Lesereihenfolge (Notizen, nicht gemessen)

Beschriftet (Auswahl, aus dem Quelltext):
- **Tab-Leiste**: Tabnamen aus `Label("Start" | "Planung" | "Rezepte" | "Einkaufen" | "Karte")`. Keine eigenen Hinweise.
- **Planung**: Suchtreffer (`ProductSearchRow`): Icon ausgeblendet, „Zur Karte“ (Hinweis: „<Name> auf der Karte anzeigen“), „Einplanen“ bzw. „Noch eins“ (Hinweis: „<Name> zur Einkaufsliste hinzufügen“), „Auf der Einkaufsliste“ als Status.
- **Einkaufsliste**: Eintrag mit Wert „Offen“ bzw. „Erledigt“ und Trait `isButton`. „Suche löschen“, „Neue Einkaufsliste“, „Listenaktionen“, „Aus Planung entfernen“.
- **Start**: Überschriften als `isHeader`, Kacheln als kombinierte Elemente.
- **Karte**: Buttons „Filialen einpassen“, „Filialen neu laden“, „Einstellungen“, „Zur Filialübersicht“, „Ich bin hier“, „QR-Code scannen“, „Ziel entfernen“, „Erneut laden“. Layout-Kopfzeile kombiniert: „Layout <Name>. <Beschreibung>“.
- **Kartenzusammenfassung** (`mapSummary`): Beispiel „Ziel: Gang 4 links, 12 Meter entfernt. Route ab Standort.“; ohne Ziel „Kein Ziel gewählt.“; bei unsicherer Position „Position ungenau.“ (Texte in `Utilities/AccessibilityText.swift`, getestet in `AccessibilityTextTests`).
- **Tour-Panel** (`tourPanel`): „Erledigt“, „Überspringen“, „Einkaufsliste öffnen“.

Zu prüfen (Reihenfolge nicht am Gerät gelesen):
- Ob VoiceOver auf der Karte zuerst die Kopfzeile, dann `mapSummary`, dann die Schaltflächen liest.
- Ob „Route ab …“ im Tour-Panel und in `mapSummary` doppelt vorgelesen wird.
- Ob die Trefferzeile „Name, Regal“ bei jeder Suche den Regaltext enthält (`AccessibilityText.productRowLabel`).

---

## 6. Nicht geprüft

- **Kein Xcode-Accessibility-Inspector**, weder vor noch nach den Änderungen. Die Vorher-Zahlen sind aus Quelltext und Git. Eine Inspector-Baseline fehlt; sie ist in `tasks.md` 1.1 offen.
- **Kein VoiceOver**, weder im Simulator noch auf einem Gerät.
- **UI-Tests bei XXL** (`MCindooroAppUITests/AccessibilityUITests.swift`) laufen grün (4 Tests; Gesamtlauf `sh scripts/ios/run-ui-tests.sh`: 22 App-Tests und 16 UI-Tests, 0 Fehler). Sie prüfen Bedienbarkeit und Existenz, **nicht** visuell, ob Text abgeschnitten ist.
- **Layouts bei XXL** nicht visuell geprüft (keine Screenshots).
- **Kontrast**: Alt-Werte aus Systemfarben abgeleitet; Kartenhintergrund und Nicht-Text-Kontrast nicht gemessen.
- **Dynamic Type zwischen Standard und XXL**: nicht getestet; ob Text bei allen Stufen abgeschnitten wird, ist offen.
- **Kein Gerätetest**: keine Prüfung auf echter Hardware.

### Manuelle Prüfliste (für eine Person mit Gerät oder Simulator)

1. Xcode, Accessibility Inspector: App starten, Audit ausführen; Befunde in diese Datei übernehmen.
2. Einstellungen > Bedienungshilfen > Anzeige und Textgröße > Größere Schrift > größte Stufe. Planung, Karte, Einkaufen und Start durchgehen; prüfen, ob Text abgeschnitten wird.
3. VoiceOver aktivieren. Tab-Leiste durchwischen; jeden Tab einmal öffnen.
4. Planung: „Milch“ suchen, „Einplanen“ antippen, Ansage prüfen.
5. Karte mit Tour: `mapSummary` fokussieren und Satz prüfen; Tour-Panel: „Erledigt“ und „Überspringen“ antippen.
6. Kontrast-Stichprobe mit einem Farbwähler auf dem Gerät für Sekundärtext und Warnhinweise.
7. UI-Tests sind gelaufen (siehe oben); nach Änderungen erneut mit `scripts/ios/run-ui-tests.sh` ausführen.
