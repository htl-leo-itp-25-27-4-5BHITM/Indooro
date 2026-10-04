# Bestandsaufnahme und Beleggrenzen

## Methode und Quellen

Statische Analyse auf `501e2f76e404f749ee5e0c6353f765c83aff189f`; Zeilen/Symbole in der Matrix beziehen sich darauf. Gelesen wurden README, RUNBOOK, SYSTEM_MAP, CODE_AUDIT, iOS AUDIT und Root-config, die einschlägigen ios-*/mobile-*/shared-api-/Katalog-/Layout-/Rezeptspezifikationen sowie die acht offenen Root-Changes. Aussagen zu Kernverhalten wurden gegen aktive Swift-Manager, Modelle, View-Aufrufpfade, Navigations-/AR-Utilities und konsumierte Java-Resources/DTOs/Services abgeglichen. [Dateiinventar](SOURCE_INVENTORY.md) erfasst sämtliche Swift-Dateien und Build-/Permissionreferenzen mit Hash; bloße Inventarisierung ist kein Laufzeitnachweis.

**im Code verifiziert** = statischer Nachweis der genannten Stelle, kein bestandener Gerätetest. **aus Dokumentation** = bestehende Spec/Audit oder offizielle Dokumentation. **Annahme** = vorgeschlagene Android-Entscheidung, die Tests/Abnahme noch bestätigen müssen. **nicht feststellbar** = ohne Laufzeit-/Hardware-/Produktentscheidung nicht beweisbar. In Matrix und Abnahme sind alle Android-Testfälle geplant, nicht ausgeführt.

Keine Swift-/Android-App gebaut, kein Sensor-/AR-Test durchgeführt, kein Produktionspayload abgefragt. Vorhandene Audit-Buildberichte sind historische Fremdevidenz. Die Xcode-Projektdatei enthält einen App-Target, iOS 18.5, Swift 5.0, keine Test-Targets; TESTING.md bestätigt die Testlücke. Repository-Tests für Backend/httpYac sind keine Android-Paritätstests.

## Erreichbare Oberfläche

| Bereich | Aktive Oberfläche und Übergänge |
| --- | --- |
| Start | HomeDashboard, aktuelle Liste/Statistik, aktive Tour, Planung/Rezept/Karte-Einstieg; Tutorial-Sheet mit Planung/Karte und Fertig |
| Planung | Produkte suchen, Ergebnisse/Navigieren/Einplanen, Kategorie-/Kennzeichnungsfilter, statische Chips, sieben offene Vorschauitems, Alle-Link, Löschen |
| Rezepte | Liste/Suche/Refresh, Navigation zu Detail, Bilder/Zeiten/Tags/Zutaten/Schritte/Mappingstatus, Zutatenübernahme-Sheet mit Listenwahl/Selektion/freien Zutaten |
| Einkaufen | Listenwahl, Erstellen/Umbenennen/Löschen, offene/ungeklärte/erledigte Items, Mengen/Notizen/Status/Umordnen, Tourstart/Fortsetzen/Beenden, Export/Importer |
| Karte | Outdoor-Map mit Pins/Karten/Reload/Fit; manuelle Auswahl/Beaconwechsel→Indoor; Suche, Zielkarte, Tourpanel, Zoom/Pan, Position/Ziel setzen über Einstellungen, Settings-Sheet, AR fullscreen |
| Transfer | Importvorschau Neu/Merge/Abbrechen; Teilmengenauswahl Alle/Keine/Kopie/Aus Liste senden; natives Share-Sheet, Fehlermeldung; externer URL-Einstieg nach Einkaufen |
| Upsell | App-weites Sheet: bis drei Vorschläge, Hinzufügen, Nein danke, Nicht mehr für dieses Produkt; Auslöser Liste oder Stationsabschluss |
| AR | ARRouteContainerView/Controller: Tracking-HUD, Distanz, Kalibrierungs-/Qualitätshinweise, Zurück |

Kategorieshortcuts: 310 Obst/Gemüse, 520 Milchprodukte, 445 Backwaren, 510 Getränke, 470 Snacks, 530 Tiefkühlprodukte; weitere 525 Käse/Wurst, 430 Teigwaren/Nudeln, 420 Konserven/Saucen, 440 Müsli/Frühstück, 450 Öle/Essig, 610 Haushalt/Reinigung, 640 Körperpflege/Hygiene. Es handelt sich um Clientkonfiguration, nicht bestätigte dynamische Taxonomie.

Nicht aktiv instanziiert: HeaderView, MapHeaderView, SearchOverlayView, LayoutSelectionSheet. `Pathfinder.swift` ist ein alter Gridalgorithmus; tatsächlicher Pfad läuft über IndoorGraph/RouteManager. Alte UpsellRequest/SuggestionResponse-Typen bedeuten nicht Nutzung von `/suggestions`. Layout-History-Funktionen und persistierte Versions-ID bestehen, aber keine erreichbare Kundenversionswahl. Android übernimmt erreichbare Funktionen; Diagnose-/Demo-Parität wird getrennt gekennzeichnet.

## Verifizierte Korrekturen gegenüber bloßer Dokumentübernahme

- ProductSearchStore baut Requests ohne storeId/storeCode und prüft keinen HTTP-Status; Product hat zwingenden Preis/LayoutCode. Android übernimmt diesen Fehler nicht (R-B, R-SC).
- Backend GET /products unterstützt ausschließlich size; GET /products/search unterstützt Scope, kombiniert storeId UND storeCode. Vollständige Filialkategorien sind dadurch **nicht** gelöst, nur weil Freitext gefiltert wird (D03).
- MobileStoreSummary Swift kennt address nicht; MobileLayoutResponse Swift verwirft source/fallback. Java sendet beide. Server liefert ohne aktives Layout DEFAULT/fallback=true (A02/A04).
- StoreMapPage erzeugt Ersatzkoordinaten; Android verlangt echte Koordinaten. 2D-Karte zeigt unsichere Position ohne den nötigen Confidencezustand (R-B).
- GraphBuilder blockiert Achsenrechtecke, während ShelfView Rotation rendert. Resolver verwendet startsWith und Regalzentrum. Android korrigiert Kollision/Segmentmatch; accessAngle bleibt eine ungeklärte gemeinsame Semantik (D05).
- Backend resolveBeacon kann nach fehlendem exakten UUID/Major/Minor-Match auf einen anderen Beacon gleicher UUID fallen. R-DA behebt dies; Android prüft Rückgabematch zusätzlich.
- Upsell sendet 1440 suppressMinutes, DTO akzeptiert höchstens 30. R-B alleine reicht nicht: R-DA muss Dismissals tatsächlich anwenden. R-U4 benötigt terminale handled-Zustände und sichere Pre-AI-Retries.
- Share-v1 exportiert nur Artikel mit Produkt-ID, Preis und LayoutCode. Freie Zutaten und Rezept-/Upsellherkunft gehen nicht mit. Android zeigt diese Grenze ausdrücklich und erfindet kein inkompatibles v2.
- iOS zieht beim completed-Sharecallback Mengen ab; Android-Chooser kann lediglich Übergabe/Auswahl melden, kein Empfangsbeleg. Explizite lokale Entnahmebestätigung ist erforderlich.

## Offene Realität

Reale Funkgenauigkeit, Batteriebedarf, Tracking-/AR-Drift, Layoutnordung und richtige Regalseite sind nicht feststellbar aus Quelltext. Ebenso unbekannt: tatsächlich deployed Backendversion, externe Kartenvertragsfreigabe und endgültige Android-App-ID. Diese Punkte bleiben Gates mit konkreten Prüfaufträgen statt erfundenen Zusagen. Die README-Nichtziele beschreiben frühere Produktgrenzen; der aktive Code enthält deutlich weitergehende Touren, Rezepte und AR. Für diesen Auftrag bestimmt der verifizierte aktive Umfang die Android-Planung.
