# 01 – Projekt-Audit: Bestandsaufnahme, Architektur, Feature-Matrix

Stand: 2026-10-15 · Untersuchte Stände: `main` (`99b802b`), `codex/stabilize-ios-navigation` (`2956fe6`, Worktree `../Indooro-nav`), `codex/admin-platform-rebuild` (`1b1dc63`, Worktree `~/.codex/worktrees/admin-rebuild/Indooro`). Branch-Details in [02_BRANCH_ANALYSIS.md](02_BRANCH_ANALYSIS.md).

Methode: Code gelesen (teilweise durch Hilfsagenten, kritische Stellen selbst geprüft), vorhandene Tests ausgeführt bzw. vorhandene Testberichte gelesen, keine Builds mit `xcodebuild`, keine Deployments, kein Zugriff auf die Live-Instanz. Es wurde **kein Anwendungscode verändert**.

Begriffe: `APP/` = `swift/indooro-EinkaeuferFinal/indooroApp/` (auf dem Stabilisierungs-Branch, falls nicht anders angegeben), `BE/` = `backend/indooro_server/src/main/java/at/htl/`.

---

## 1. Komponenten im Repository

| Komponente | Ort | Technik | Umfang | Stand |
|---|---|---|---|---|
| iOS-App (kanonisch) | `swift/indooro-EinkaeuferFinal` | Swift 5, SwiftUI, CoreLocation, CoreBluetooth, CoreMotion, ARKit | 17.431 Zeilen in 56 Dateien (Stabilisierung), 16.687 auf `main` | aktiv |
| Navigations-Testpaket | `swift/indooro-EinkaeuferFinal/Package.swift` (`IndooroNavigationCore`) | SwiftPM, XCTest | 77 Tests, 1.631 Zeilen | nur Stabilisierungs-Branch |
| Ältere iOS-Apps | `swift/indooroApp` (Jan.), `swift/indooro-` (Apr.) | SwiftUI | 2.654 bzw. 9.935 Zeilen | Archiv |
| Backend | `backend/indooro_server` | Quarkus 3.6, Java 17 (Docker-Image JDK 25, CI JDK 21), Hibernate, Flyway V1–V11 | ca. 50 REST-Endpunkte, 142 Tests | aktiv |
| Datenbank | PostgreSQL 16 | Stores, Regionen, Beacons, Layout-Versionen, Rezepte, Upsell, Audit- und Fehlerlogs | – | aktiv |
| Suchindex | OpenSearch 2.9 | **Produkte und Kategorien** (nicht in Postgres) | 153 Demo-Produkte, 17 Kategorien | aktiv |
| Authentifizierung | Keycloak (Realm `indooro`) | Rollen admin, region-manager, store-manager; nur Admin, nicht App | – | aktiv |
| Admin-Web (Legacy) | `backend/.../META-INF/resources/admin` | Vanilla JS | – | auf `main` live |
| Admin-Web (Neu) | `admin-ui/` (nur Admin-Branch) | React 19, TypeScript, Vite, Playwright | 69 Unit-, 99 Browser-Tests (gemockt) | nicht deployt |
| Alte Web-Prototypen | `app/v1`, `app/v2`, `app/launch_supermarkt`, `app/configurator-demo`, `app/uploadPdf` | HTML/JS | – | weitgehend veraltet; `uploadPdf` ruft einen nicht existierenden Endpunkt auf |
| Infrastruktur | `k8s/`, `docker-compose.yml`, `keycloak/` | LeoCloud (Kubernetes der Schule), Host `it220209.cloud.htl-leonding.ac.at` | – | live laut DEPLOYMENT.md (nicht neu geprüft) |
| BLE-Messwerkzeug | `Beacons/` | Node/Express + Socket.IO + Python `bleak` | RSSI-Logger für Indooro1–5 | Entwicklerwerkzeug |
| API-Tests | `api-tests/httpyac` | httpyac | 8 Dateien, ca. 96 Requests gegen LeoCloud | nicht ausgeführt |
| Spezifikationen | `openspec/`, `docs/specs`, `docs/audit` | OpenSpec 1.3.1 | 30 Specs, 10 offene Changes, 17 archivierte | umfangreich |
| Werbefilm, Website | `indooro-motion`, `indooro-ad-v2`, `origin/website` | Remotion, Blender, statisches HTML | – | nicht pilotrelevant |

Projektregeln: Kein `AGENTS.md` oder `CLAUDE.md` im Wurzelverzeichnis; nur `indooro-motion/AGENTS.md` (Filmprojekt). OpenSpec ist der dokumentierte Arbeitsprozess.

---

## 2. Architektur (tatsächlich)

```
┌──────────────────────────── iOS-App (anonym, keine Anmeldung) ─────────────────────────────┐
│ Tabs: Start · Planung (Produkte) · Rezepte · Einkaufen (Listen) · Karte                     │
│                                                                                            │
│ BeaconManager ──► BeaconMeasurementStore (Kalman je Beacon+Quelle)                          │
│   CoreLocation-Ranging + CoreBluetooth-Scan   ──► BeaconPositionSolver (Gauss-Newton/Huber)  │
│                                               ──► PoseFusionService (EMA + Sprung-Gate)      │
│                                               ──► WalkableProjector (Projektion auf Weg)     │
│ NavigationSession(Core) = einziger Besitzer von Tour, aktivem Stopp, Route, Fortschritt      │
│ TourPlanner (Distanzmatrix, NN + 2-opt, nur bei Ereignissen) · IndoorGraph (A*, 1-m-Raster)   │
│ ShoppingListManager (UserDefaults) · ProductSearchStore · RecipeStore · UpsellSuggestionStore │
└──────────────┬─────────────────────────────────────────────────────────────────────────────┘
               │ HTTPS, Basis-URL fest im Code (4 Stellen)
┌──────────────▼──────────────── Quarkus-Backend (LeoCloud) ─────────────────────────────────┐
│ öffentlich: /api/products/*, /api/mobile/stores/*, /api/mobile/recipes/*, /api/mobile/upsell/*│
│ Admin (Keycloak, Rollen): Stores, Regionen, Beacons, Layout-Versionen, Produkte, Rezepte      │
│ ungeschützt (Fehler): POST /api/convert/pdf-to-json, POST /api/export/pdf                     │
│ optional: OpenAI für Upsell (standardmäßig AUS)                                              │
└──────┬──────────────────────┬──────────────────────┬──────────────────────────────────────┘
   PostgreSQL 16          OpenSearch 2.9            Keycloak
 (Layouts, Beacons, …)  (Produkte, Kategorien,    (nur Admin)
                         Sicherheit deaktiviert)
```

Datenfluss Markt → App: Admin zeichnet Layout im Editor → speichert Entwurf → aktiviert Version → App lädt `GET /api/mobile/stores/{id}/layout/current`. Produkte sind über `layoutCode` = `Kategorie/Meter/Fach/Reihe` (z. B. `310/1/1/1`) an Regale gebunden; das Regal-Element im Layout trägt Kategorie und Meter. Kein Fremdschlüssel, nur Validierung im Editor.

---

## 3. Feature-Matrix

Status-Werte:
**T** = Implementiert und durch Tests belegt · **I** = Implementiert, aber nicht ausreichend validiert · **P** = Teilweise implementiert · **F** = Fehlerhaft · **G** = Nur geplant · **N** = Nicht vorhanden · **U** = Unbekannt / nicht überprüfbar

Pilotrelevanz: **A** zwingend · **B** wichtig, vereinfachbar · **C** optional · **D** später (siehe [03_PILOT_READINESS.md](03_PILOT_READINESS.md), Abschnitt 3)

### 3.1 iOS-App

| Funktion | Ort (Beleg) | Branch | Status | Befund | Pilot |
|---|---|---|---|---|---|
| Onboarding | `APP/Views/Main/HomeDashboardView.swift:350-420` (nur Hilfe-Sheet über „?“) | alle | **N** | Kein Erststart-Ablauf. Standort- und Bluetooth-Abfrage sofort beim Start (`BeaconManager.swift:278-280`). | B |
| Berechtigungen, Fehlerzustände | `BeaconManager.swift:1898`, `centralManagerDidUpdateState` | alle | **P** | Verweigerung nur als Statustext, kein Link zu Einstellungen, Bluetooth aus wird nicht angezeigt. | A |
| Marktauswahl | `StoreMapPage.swift:227ff`, `BeaconManager.refreshMobileStores:335` | alle | **I** | Liste vom Server, manuelle Wahl funktioniert laut Code. | A |
| Automatische Markterkennung | `BeaconManager.swift:1011-1128` | alle | **P** | Lädt ohne Rückfrage und überschreibt manuelle Wahl (`:1117`). Im Pilot mit einem Markt unkritisch, aber abschaltbar machen. | C |
| Grundrissdarstellung, Zoom | `MapView.swift:190ff`, `ShelfView.swift` | alle | **I** | Funktioniert im Simulator laut Projektdoku; Zoom 0,65–2,5. | A |
| Produktsuche | `ProductSearchStore.swift:21-50` | alle | **F** | Nur serverseitig, keine Unschärfe. **Bug:** `addingPercentEncoding(.urlQueryAllowed)` maskiert `&`, `+`, `=` nicht („Milch & Käse“ bricht). Fehler werden verschluckt (leere Liste). | A |
| Produktdaten | `Models/Product.swift:3-14` | alle | **I** | Nur `id`, `name`, `price`, `layoutCode`. Keine Marke, kein Bild, keine EAN, kein Bestand. Für Pilot ausreichend. | A |
| Regalanzeige als Text | `StoreMapPage.swift:621-624, 852-862` | alle | **P** | Karte zeigt „Gang“ = Kategoriecode (z. B. 310) und „Regal“ = Meter. **Im Markt für Kunden nicht lesbar** (es gibt dort keinen „Gang 310“). | A |
| Einkaufsliste | `ShoppingListManager.swift`, `UserDefaults` `shoppingListStore.v1` | alle | **I** | Mehrere Listen, Mengen, Teilen als Datei. Keine Tests. | A |
| Rezepte | `RecipeStore.swift`, `RecipeFeatureViews.swift` | alle | **I** | Backend-abhängig, Fehleranzeige vorhanden, keine Tests. | D |
| Upsell / Cross-Selling (KI serverseitig) | `UpsellSuggestionStore.swift`, Backend `UpsellSuggestionService` (ca. 2.200 Zeilen) | alle | **I** | Funktioniert nur mit Backend, LLM standardmäßig aus, 0/135 Tasks der Qualitäts-Change erledigt. | D (im Pilot ausschalten) |
| A*-Routing | `Utilities/IndoorGraph.swift` (Builder 441-511, A* mit Abbiegestrafe, Binary Heap 547) | Stabilisierung | **T** | 7 RoutingTests grün, deterministisch, ca. 5–8 ms pro Route (Debug). Auf `main`: **F** (instabile Treppenrouten, C.5). | A |
| Einkaufsreihenfolge (NN + 2-opt) | `Utilities/TourPlanner.swift:39-61, 159, 191-214` | Stabilisierung | **T** | 11 Tests grün, nur bei Ereignissen. 25 Stopps: −7,6 % Weg durch 2-opt. Auf `main`: nur NN, bei **jedem** Positionsupdate neu (**F**, C.1). | B |
| BLE-Positionierung | `BeaconManager.swift`, `PositioningPipeline.swift`, `BeaconPositionSolver.swift`, `BeaconMeasurementStore.swift` | Stabilisierung | **I** | Nur synthetisch und per Replay getestet (77 Tests). **Keine einzige echte Messung im Markt.** 13 Parameter als „provisional“ markiert. | B (Hybrid) |
| Positionsfilterung | `PoseFusionService.swift:34-60` | Stabilisierung | **I** | Sprung-Gate statt Geschwindigkeitsbremse, keine Prädiktion. Synthetisch: Nachlauf 0,5 m statt 5,9 m; im Stand weiterhin Zittern (23,7 m Weg in 27 s bei σ = 1 m). | B |
| Map-Matching / Projektion | `WalkableProjector.swift` (20 Zeilen) | Stabilisierung | **T** | Zustandslos, 5 Tests grün. Auf `main`: **F** (MapMatcher klebt dauerhaft, C.2). | B |
| Laufende Navigation (2D) | `StoreMapPage.swift:692`, `NavigationSession.remainingRoutePolyline` | Stabilisierung | **I** | Restroute, Restdistanz, Hinweis bei schwachem Signal. Keine Abbiegehinweise als Text. | A |
| Rerouting | `NavigationSessionCore.swift:195-209, 412-430` | Stabilisierung | **T** | Abweichung > 4 m für 2,5 s, nur Route zum aktiven Ziel neu. Tests grün. Synthetischer Replay: Erkennung nach 6,5–6,9 s. | B |
| Zielwechsel | `NavigationSessionCore.swift:225-232, 335-347` | Stabilisierung | **T** | Nur durch „Erledigt“/„Überspringen“/Listenänderung/„Neu planen“. 0 Wechsel bei 100 Jitter-Updates. | A |
| Erkennen „Produkt erreicht“ | – | alle | **N** | Bewusst manuell (Knopf). Für Pilot richtig. | – |
| Manuelle Positionskorrektur | `MapView.swift:43, 140-146` (Tippen auf Karte) | alle | **P** | Tippen setzt Position nur, wenn „Tippen setzt Ziel“ aus ist. Der Knopf „Ich stehe hier“ steckt in `HeaderView`, die **nirgends verwendet** wird (toter Code). | **A** (Hybrid-Pilot) |
| Modus ohne Beacons | `BeaconManager.swift:77-79`, `SettingsSheet.swift:21-24` | alle | **P** | Vorhanden, aber im Release-Build für Kunden umschaltbar („Debug (kein Beacon)“). | A (umbenennen, als „Ohne Ortung“ nutzen) |
| Recorder + Replay | `NavigationRecorder.swift` (DEBUG), `NavigationReplay.swift` | Stabilisierung | **T** (synthetisch) | 9 Replay-Tests grün. Im Feld nie benutzt. | **A** (für Messung) |
| AR-Navigation | `APP/AR/*` (1.813 Zeilen) | alle; Yaw-Lock auf AR-Branch | **P** | Experimentell, nur über Einstellungen, manuelles Alignment `nil` (`ARNavContainerView.swift:7` TODO), nicht auf Gerät getestet. | D |
| Offline-Verhalten | `BeaconManager.swift:1345-1407` | alle | **F** | Ohne Server fällt die App auf das Layout **„Test-Raum“ 4×7** zurück, nicht auf den Markt. Kein Layout-Cache. Suche braucht Netz. | A |
| Verhalten ohne Beacons / schlechtes Signal | `NavigationSessionCore.swift:106` | Stabilisierung | **I** | Weniger als 3 Beacons → keine Position; Hinweis „Signal schwach – Kalibrierung empfohlen“. Im Feld unbekannt. | A |
| Backend-Konfiguration | `ProductSearchStore.swift:7`, `RecipeStore.swift:14`, `UpsellSuggestionStore.swift:50`, `BeaconManager.swift:171` | alle | **P** | URL fest in 4 Dateien, keine Timeouts, ATS global deaktiviert. | B |
| Fehlerbehandlung allgemein | diverse `print()` | alle | **P** | Suche, Markterkennung, Upsell, Layout-Historie scheitern still. | A |
| Performance | Messung im Testpaket | Stabilisierung | **I** | Tourplanung 25 Stopps 56–89 ms (Debug, nur bei Ereignissen); `main`: 17–61 ms **pro Positionsupdate** auf dem Main-Thread. | B |
| Speicher, Akku | – | – | **U** | Nie gemessen. BLE-Scan mit Duplikaten + CoreMotion dauerhaft aktiv. | B (im Pilot messen) |
| Mobile UX / Sprache | `SettingsSheet.swift:20-81` | alle | **P** | Deutsch mit englischen Begriffen („Tracking“, „Beacon“, „Tap setzt Ziel“), wenig Barrierefreiheit (21 Accessibility-Modifier, 22 feste Schriftgrößen). | B |
| Stabilität (Absturzrisiko) | statische Prüfung | alle | **I** | Praktisch keine Force-Unwraps, kein `try!`, ein `fatalError` (AR-Stub). Gute Hygiene. Laufzeit-Abstürze unbekannt. | A |
| Deployment auf echten iPhones | `project.pbxproj`: Bundle `at.ac.htl.leonding.indooroswift2`, iOS 18.5, Team-ID gesetzt | alle | **U** | **Kein `Assets.xcassets` in `EinkaeuferFinal`** (nur in den alten Apps) → kein App-Icon, TestFlight-Upload wird voraussichtlich abgelehnt. Deployment-Ziel iOS 18.5 schließt ältere iPhones aus. Ordner-Synchronisation packt README und Präsentationsdateien ins App-Bundle. | A |
| Tests der App selbst | – | alle | **N** | Kein XCTest-Target im Xcode-Projekt. Rezepte, Upsell, Listen ohne Tests. | B |

### 3.2 Administration

| Frage | Antwort (Beleg) | Status | Pilot |
|---|---|---|---|
| Neuen Markt anlegen? | Admin-Rebuild: `StoreCreatePage` → `POST /api/stores` (benötigt Region). Legacy-Admin auf `main` ebenfalls Stores/Regionen. | **I** | A |
| Grundriss einspielen? | Nur zeichnen im Layout-Editor (Regale, Wände, Gänge, Eingang, Kasse, Beacon, Navigationsknoten, Vorlagen 15×20 / 40×60 / 60×80, Undo/Redo, JSON-Import/-Export). **Kein Import von Bild oder PDF als Vorlage.** | **I** | A |
| Einheit des Rasters | Nirgends dokumentiert, numerisch plausibel 1 Einheit = 1 m. Der Positions-Solver setzt Meter voraus. | **U** | A (festlegen) |
| Regale und Wege | Regale als Rechtecke mit Kategorie und Meter; begehbar = jede freie Zelle (1-m-Raster). | **I** | A |
| Navigationsgraph | Wird in der App aus dem Layout erzeugt (`IndoorGraphBuilder`), nicht im Admin gepflegt. | **T** (App-Seite) | – |
| Produkte positionieren | über `layoutCode` je Produkt (Produktformular, Upsert per `POST`, kein `PUT`). Editor validiert Regaladressen beim Veröffentlichen (Admin-Branch). | **I** | A |
| CSV-Import | **Nein.** Import nur als JSON-Array/NDJSON (`CatalogImport.tsx`, `POST /api/products/bulk`) oder als „Belegplan“-PDF in einem festen Format (`PdfImportService:33-38`). Ein CSV-**Export** existiert (`regalplan_export.csv`). | **N** (CSV) / **I** (JSON) | B |
| Aufwand für einen Markt | Schätzung Agent + eigene: 2–4 Personentage für einen ganzen Markt; Pilotbereich mit 100–200 Produkten ca. 1–2 Tage. Engpass: Produkt-Regal-Zuordnung. | – | – |
| Kann Marktpersonal das bedienen? | Editor und Produktpflege sind für Entwickler gebaut (Kategoriecodes, Meter, Fach, Reihe). Ohne Schulung nicht realistisch. | **P** | C |
| Fehler korrigieren | Layout-Versionen mit Historie und Wiederherstellen (Admin-Branch, Tests). | **I** | B |
| Änderungen sofort in der App? | Ja, nach Aktivieren der Version und Neuladen in der App (kein Push, kein Cache). | **I** | B |
| Mehrere Standorte | Ja: Regionen, Stores, Scopes je Rolle. | **T** (Backend-Tests) | D |
| Beacons verwalten | UUID + Major + Minor, Massenanlage, Zuweisung an Store, Platzierung im Editor. | **I** | A |

### 3.3 Backend und Datenhaltung

| Thema | Befund | Status | Pilot |
|---|---|---|---|
| Datenmodell | Postgres: Regionen, Stores, Beacons, Zuordnungen, Layout-Versionen (eine aktive je Store), Rezepte, Upsell, Logs. OpenSearch: Produkte, Kategorien. Zwei Speicher ohne gemeinsame Transaktion. | **I** | A |
| APIs | ca. 50 Endpunkte; Mobile lesend öffentlich. | **T** (142 Tests, letzter lokaler Lauf grün) | A |
| Authentifizierung | Keycloak für Admin; App anonym (für Pilot richtig). | **I** | A |
| Berechtigungen | Rollen mit Scope-Prüfung (`AdminAccessService`). | **T** | C |
| Ungeschützte Endpunkte | `POST /api/convert/pdf-to-json`, `POST /api/export/pdf` ohne Auth und ohne Größenlimit. Upsell-Events ohne Auth und Rate-Limit. | **F** | B |
| OpenSearch | Sicherheit deaktiviert, in Kubernetes als `NodePort` exponiert (`k8s/opensearch.yaml:26,51,76`). Wer den Knoten erreicht, kann Produkte ändern. | **F** | A (vor Pilot schließen) |
| Geheimnisse im Repo | Demo-Passwörter, Client-Secret und DB-Passwörter liegen im Klartext in versionierten Dateien (`keycloak/realm/indooro-realm.json`, `k8s/*.yaml`, `application.properties`, `DEPLOYMENT.md`, `docker-compose.yml`). Werte werden hier bewusst nicht wiedergegeben. | **F** | A (rotieren) |
| CORS | `*` bei Cookie-basierter Admin-Anmeldung, kein CSRF-Token gefunden. | **F** | B |
| Verfügbarkeit | 1 Replica auf LeoCloud, kein Monitoring außer `/api/admin/health`. Verfügbarkeit der Schul-Cloud am Wochenende/Ferien unbekannt. | **U** | B |
| Backup / Wiederherstellung | **Keines** (kein `pg_dump`, kein CronJob). Layouts und Beacon-Zuordnungen nur in einer Postgres-Instanz. | **N** | A (einfaches manuelles Backup) |
| Datenschutz | App sendet keine Position, keine Geräte-ID. Backend speichert Upsell-Ereignisse (Produkt-IDs, Session-Hash meist leer), protokolliert Suchbegriffe auf INFO-Level. Keine Analytics. | **I** | A (gut) |
| CI/CD | CI baut mit `-DskipTests` (Tests laufen nie in CI), Image-Tag `:latest`, kein Deploy-Schritt. | **P** | C |
| Betriebskosten | LeoCloud (Schule) 0 €; OpenAI nur bei aktiviertem Upsell. | – | – |
| Skalierung | Für einen Markt mehr als ausreichend. | – | – |

---

## 4. Daten zu realen Märkten und Hardware im Repository

| Fund | Ort | Bedeutung |
|---|---|---|
| Layout `SparSupermarkt_Posttrasse` (40×60 Einheiten, 48 Regale, 6 Kassen, 1 Eingang, **0 Beacons**) | `app/launch_supermarkt/SparSupermarkt_Posttrasse_layout.json`, als `layout-demosupermarkt.json` in der App gebündelt, Backend-Default-Layout | Ein realer SPAR-Markt wurde offenbar schon nachgezeichnet. **Welcher Markt und mit wessen Erlaubnis, ist nicht dokumentiert.** |
| Belegplan-Scan (1 Seite, Adobe „Paper Capture“) und Regalplan-Exporte mit SPAR-Eigenmarken | `backend/indooro_server/Belegplan_ocr.pdf`, `regalplan_export.csv`, `mein_plan.pdf` | Echte Regalbelegungsdaten eines Marktes. Herkunft und Nutzungserlaubnis klären; das Repository liegt auf GitHub (Sichtbarkeit nicht geprüft). |
| Testraum-Layout (4×7, 4 Beacons in den Ecken, 1 Regal) | `APP/Resources/layout.json`, `documentation/Layoutplan-Testraum.pdf` (ca. 5 × 9 m) | Einzige Umgebung, in der je mit Beacons gearbeitet wurde. Größe in Layout und PDF passt nicht zusammen. |
| Beacon-Hardware | – | **Kein Hersteller, kein Modell dokumentiert.** Platzhalter-UUID `0000…` im Testraum-Layout. |
| Feldmessungen | – | **Keine.** Auf keinem Branch gibt es JSONL-Aufnahmen; `fsd_fragerunde1.md`: Tests bisher nur im eigenen Laborraum. |
| Genauigkeitsziel | `docs/specs/FSD.md:599` (NFR-01): „ca. 1 m praktische Positionsgenauigkeit bei ≥ 3 Beacons“ | **Ziel, kein Messwert.** Für RSSI-BLE in einem Supermarkt unrealistisch ehrgeizig (siehe 03). |

---

## 5. Tests – was wirklich belegt ist

| Bereich | Tests | Ergebnis | Quelle |
|---|---|---|---|
| iOS-Navigationskern (`IndooroNavigationCore`) | 77 (Tour 11, Session 16, Replay 9, Schätzer 10, Messwerte 8, Routing 7, Regalzuordnung 7, Projektion 5, Layout/Graph 4) | **77/77 grün**, in dieser Analyse ausgeführt (`swift test`, 21 s) | Stabilisierungs-Branch |
| iOS-App-Target | 0 | – | kein XCTest-Target |
| Backend | 142 in 23 Klassen (11 `@QuarkusTest`) | 142/0 Fehler laut Surefire-Reports vom 2026-10-15 (nicht neu ausgeführt); JaCoCo ca. 47 % | Admin-Branch |
| Admin-UI | 69 Unit, 99 Browser (Mock-API), 17 Live-Skripte | nicht ausgeführt | Admin-Branch |
| API (httpyac) | ca. 96 Requests | nicht ausgeführt | – |
| Feldtest Supermarkt | 0 | – | – |

Synthetische Replay-Metriken (aus dem Testlauf, Rauschen simuliert, künstliches Beacon-Raster 8 × 8 m):

| Szenario | Positionsnachlauf Mittel / 95 % | Reroutes | Zielwechsel ohne Ereignis |
|---|---|---|---|
| Gehen, sauber | 3,2 m / 5,0 m | 0 | 0 |
| Gehen mit Ausreißern | 3,1 m / 4,9 m | 0 | 0 |
| Beacon-Ausfall | 3,6 m / 5,7 m | 0 | 0 |
| Stillstand 60 s | 0,1 m / 0,2 m | 0 | 0 |
| Falscher Gang | 1,5 m / **17,1 m** (ein Sprung von 17 m) | 1 (nach 6,6 s) | 0 |
| Determinismus | 2,4 m / **17,1 m** (ein Sprung von 17 m) | 1 | 0 |

Die 17-m-Sprünge in zwei Szenarien sind in der Projektdoku nicht erklärt und sollten vor dem Feldtest untersucht werden (Aufgabe T-6 in [07_ACTION_PLAN.md](07_ACTION_PLAN.md)).

**Fazit Tests:** Die Navigationslogik ist erstmals reproduzierbar getestet – ein echter Fortschritt. Belegt ist damit aber nur: *Wenn* die Eingangsdaten so aussehen wie simuliert, verhält sich die Navigation stabil. *Ob* echte Beacon-Daten im Markt so aussehen, ist völlig offen.

---

## 6. Bewertung in einem Absatz

Indooro ist ein umfangreicher, technisch ernsthafter Prototyp mit drei Teilsystemen (iOS-App, Backend, Admin), viel Spezifikation und einer gerade erst stabilisierten Navigationslogik. Er ist **kein einsatzbereites Produkt**: Die Kernannahme – Kunden werden per BLE-Ortung zuverlässig zum Regal geführt – wurde nie außerhalb eines 45-m²-Klassenraums geprüft. Die Funktionen, die ein Kunde im Pilot tatsächlich braucht (Produkt suchen, verständlich sehen, wo es steht, Liste abarbeiten), sind zu 80 % vorhanden, haben aber mehrere kleine, sichtbare Fehler. Ein Großteil der Entwicklungszeit der letzten Monate floss in Funktionen, die für den ersten Pilot nicht nötig sind (Rezepte, KI-Upsell, AR, Admin-Neubau mit Rollenmodell, Werbefilm, Android-Planung).
