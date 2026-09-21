# Indooro – Repository-, Swift- und OpenSpec-Audit

| Feld | Wert |
| --- | --- |
| Stand | 2026-09-17 |
| Git-Stand | `main` @ `63a42d4` („Increase upsell session prompt limit“) |
| Scope | Gesamtes Repository inkl. aller drei Swift-Projekte, Quarkus-Backend, Admin-Frontend, Deployment, OpenSpec |
| Ergebnis-Dokumente | [FSD](FSD.md) · [TSD](TSD.md) · [Architecture Blueprint](ARCHITECTURE_BLUEPRINT.md) · [Roadmap](ROADMAP.md) |

Dieses Dokument ist das Ergebnis von **Phase 1 (Discovery)** und **Phase 2 (OpenSpec-Audit)**. Jede Aussage ist gegen den Quellcode verifiziert (Dateipfad + Zeile, wo sinnvoll). Befunde tragen stabile IDs (`AUD-xx`), auf die Roadmap und OpenSpec-Changes verweisen.

---

## 1. Repository-Inventar

### 1.1 Top-Level-Struktur

| Pfad | Inhalt | Status |
| --- | --- | --- |
| `swift/indooro-EinkaeuferFinal/` | **Kanonische iOS-App** (Xcode-Scheme `MCindooroApp`, Bundle-ID `at.ac.htl.leonding.indooroswift2`, 52 Swift-Dateien, 16 687 LOC) | aktiv |
| `swift/indooro-/` | Vorgänger-„MC-Referenzprojekt“ (Scheme `MCindooroApp`, Bundle-ID `at.ac.htl.leonding.indooroswift`, 45 Dateien, 9 935 LOC) – ohne Rezepte/Upsell/Dashboard | Legacy |
| `swift/indooroApp/` | Ur-Projekt (Scheme `indooroApp`, gleiche Bundle-ID wie `indooro-`, 24 Dateien, 2 654 LOC) – nur BLE + Suche + Grid-A* | Legacy |
| `swift/indooro-EinkaeuferFinal.zip` | 246 KB Archiv des Final-Projekts | **untracked**, Artefakt |
| `backend/indooro_server/` | Quarkus 3.6.0 / Java 17, RESTEasy Reactive, Panache, Flyway, OpenSearch, OIDC, SmallRye OpenAPI, JaCoCo | aktiv |
| `backend/indooro_server/src/main/resources/META-INF/resources/admin/` | Statische Admin-Plattform (HTML/CSS/JS, Layout-Editor) | aktiv |
| `backend/indooro_server/src/main/resources/META-INF/resources/customer/` | Statische Kunden-Web-Seite | aktiv (klein) |
| `app/` | Legacy-Web-Konfigurator (v1/v2, `launch_supermarkt`, `uploadPdf`) | Legacy |
| `api-tests/httpyac/` | 7 httpYac-Suiten (Auth, Public, RBAC, Maintenance, Rollenmatrix, Rezepte, Upsell) | aktiv |
| `k8s/` | LeoCloud-Manifeste (Backend, Ingress, Keycloak, OpenSearch, Postgres, PVC) | aktiv |
| `docker-compose.yml` | Lokal: Keycloak 26.2, OpenSearch 2.9.0, Dashboards 2.9.0 (**kein Postgres**) | aktiv |
| `keycloak/realm/` | Realm-Import für lokale Entwicklung | aktiv |
| `.github/workflows/ci.yaml` | Build & Push Backend-Image nach GHCR (`-DskipTests`, JDK 21) | aktiv |
| `openspec/` | OpenSpec 1.3.1, Schema `spec-driven`, 16 Specs, 10 aktive Changes, 6 archivierte | aktiv |
| `documentation/` | Historische & Sprint-Dokumentation (API, Keycloak, Upsell, FSD-Fragerunde) | gemischt |
| `Beacons/`, `logos/`, `media/`, `assets/`, `presentations/` | Medien, Präsentationen | statisch |
| `.codex/skills/openspec-*` | Codex-Skills für den OPSX-Workflow | Tooling |

Nicht vorhanden: `Package.swift`, `.xcworkspace` außerhalb der Projekt-internen Workspaces, `specs/`, `.openspec/`, `docs/` (wurde mit diesem Audit angelegt).

### 1.2 Swift-Projekt `swift/indooro-EinkaeuferFinal` (kanonisch)

**Build-Einstellungen** (`MCindooroApp.xcodeproj/project.pbxproj`):

| Einstellung | Wert | Bewertung |
| --- | --- | --- |
| `objectVersion` | 77 (Xcode 16, `fileSystemSynchronizedGroups`) | modern |
| `IPHONEOS_DEPLOYMENT_TARGET` | 18.5 | **widerspricht** Spec „iOS 15 or later“ |
| `SWIFT_VERSION` | 5.0 | Swift-6-Sprachmodus nicht aktiv |
| `SWIFT_STRICT_CONCURRENCY` | nicht gesetzt (= minimal) | keine Compiler-Prüfung von Data Races |
| `TARGETED_DEVICE_FAMILY` | 1,2 (iPhone + iPad) | iPad-Layout nicht spezifiziert |
| Targets | nur `MCindooroApp` | **kein Test-Target** (siehe `TESTING.md`) |
| Swift Packages | keine | – |
| Signing | Automatic, Team `YVTW3J7XLC` | – |

**Info.plist / Berechtigungen:**

| Key | Wert |
| --- | --- |
| `NSBluetoothAlwaysUsageDescription` | „Wir benötigen Bluetooth, um Beacons in der Nähe zu finden.“ |
| `NSLocationWhenInUseUsageDescription` | „Standort wird benötigt, um iBeacon-Signale für die Indoor-Navigation zu messen.“ |
| `NSCameraUsageDescription` | „Die Kamera wird für die AR-Navigation im Markt verwendet.“ |
| `NSMotionUsageDescription` | „Bewegungssensoren werden für die Indoor-Ortung und die AR-Ausrichtung verwendet.“ |
| `NSAppTransportSecurity.NSAllowsArbitraryLoads` | **`true`** (unnötig, alle Aufrufe HTTPS) |
| `UTExportedTypeDeclarations` | `at.ac.htl.leonding.indooro.shopping-list`, Extension `indoorolist`, MIME `application/vnd.indooro.shopping-list+json`, konform zu `public.json` |
| `CFBundleDocumentTypes` | „Indooro Einkaufsliste“, Rolle Editor, Rank Owner |
| `LSSupportsOpeningDocumentsInPlace` | `YES` |

**Gebündelte Ressourcen** (durch `fileSystemSynchronizedGroups` automatisch im App-Bundle): `Resources/layout.json` (einzig verwendete), `layout-klasse(reverse).json`, `layout4*7.json`, `layout_old_raum.json`, `layout-demosupermarkt.json`, `layout-klass.json`, `layout_newwer room.json`, außerdem ungewollt `README.md` und `presentation-airdrop-swift/{index.html,main.js,styles.css,TASKS.md}`. **Kein `Assets.xcassets`** (kein App-Icon, keine AccentColor) – im Legacy-Projekt `indooro-` vorhanden.

**Modul-/Dateiinventar:**

| Schicht | Datei | LOC | Verantwortung |
| --- | --- | --- | --- |
| App | `App/indooroAppApp.swift` | 17 | `@main`, `WindowGroup { ContentView() }` |
| Models | `Models/Product.swift` | 15 | `Product` (`id: Int`, `name`, `price: Double`, `layoutCode: String`) |
| | `Models/IndooroBeacon.swift` | 17 | Laufzeit-Beacon mit RSSI, Distanz, Qualität, Position |
| | `Models/LayoutData.swift` | 361 | `LayoutData`, `GridSize`, `LayoutElement` (tolerantes Decoding, Aliase `uuid/major/minor/beaconCode/identityKey`), `LayoutVersionSummary`, `LayoutSelectionMode`, `LayoutTimestampFormatter`, `BeaconUUIDNormalizer` |
| | `Models/MobileStoreModels.swift` | 220 | `MobileStoreSummary` (tolerante Koordinaten: `latitude/lat`, `longitude/lng/lon`, verschachtelt `coordinate/location`), `MatchedBeaconSummary`, `StoreByBeaconResponse`, `MobileLayoutResponse`, `MobileStoresEnvelope`, `StoreDetectionBeaconCatalog` |
| | `Models/ShoppingModels.swift` | 382 | `ShoppingListItemStatus`, `ShoppingRouteMode`, `ShoppingListItem` (inkl. Rezept-/Upsell-Metadaten, rückwärtskompatibles Decoding), `ShoppingList`, `ShoppingStop`, `ShoppingRouteSnapshot`, `ShoppingSessionBanner` |
| | `Models/ShoppingTransferModels.swift` | 114 | `ShoppingTransferKind`, `ShoppingTransferItem`, `ShoppingShareSelection`, `ShoppingTransferPackage` (Version 1) |
| | `Models/RecipeModels.swift` | 274 | `RecipeTag`, `RecipeSummary`, `RecipeDetail`, `RecipeIngredient`, `RecipeStep`, `RecipeProductMappingResponse`, `RecipeIngredientMappingStatus`, `RecipeMappingState`, `MappedRecipeProduct`, `RecipePageResponse<T>`, Umlaut-Reparatur `recipeDisplayText` |
| | `Models/UpsellModels.swift` | 139 | `UpsellRequest`, `UpsellProductSummary`, `UpsellSuggestion`, `UpsellSuggestionResponse`, `UpsellPlanRequest`, `UpsellOpportunityRequest`, `UpsellPlanResponse`, `UpsellOpportunityResponse`, `UpsellPlanDebug`, `UpsellEventRequest`, `UpsellDismissRequest`, `UpsellPrompt` |
| Managers | `Managers/BeaconManager.swift` | 2 735 | **God Object**: CoreBluetooth-Scan, CoreLocation-iBeacon-Ranging, Heading, CoreMotion, Store-Erkennung, Store-/Layout-/History-Netzwerk, Layout-Fallback-Kaskade, Navigations-Pipeline, Debug-Log, Legacy-Produktsuche |
| | `Managers/ShoppingListManager.swift` | 1 157 | `ShoppingStopResolver`, `MultiStopRoutePlanner`, `ShoppingListManager` (CRUD, Rezept-Merge, Transfer), `ShoppingSessionManager` (Tour-Lebenszyklus) |
| | `Managers/UpsellSuggestionStore.swift` | 829 | `@MainActor`: Plan-Preload, Cache, Pending-Opportunities, Prompt-Throttling, Events, Dismissals |
| | `Managers/RecipeStore.swift` | 198 | `@MainActor`: Liste, Suche, Detail, Mapping |
| | `Managers/ProductSearchStore.swift` | 148 | Freitextsuche und Kategorie-Browse (clientseitiger Prefix-Filter) |
| Utilities | `Utilities/StabilizedNavigationConfig.swift` | 82 | Alle Tuning-Parameter (Beacon, Fusion, Display, MapMatcher, Route, Confidence) |
| | `Utilities/BeaconPositionSolver.swift` | 235 | Gewichtete Trilateration (Gauss-Newton, 10 Iterationen) + Konfidenz |
| | `Utilities/KalmanFilter.swift` | 68 | 1-D-Kalman-Filter pro Beacon |
| | `Utilities/PoseFusionService.swift` | 260 | Positions-/Heading-Fusion, Prädiktion |
| | `Utilities/MapMatcher.swift` | 199 | Snap auf Graph-Kanten mit Kosten-Scoring |
| | `Utilities/IndoorGraph.swift` | 453 | Graph, Projektionen, A* (Set-basiert), `IndoorGraphBuilder` (1-m-Raster) |
| | `Utilities/RouteManager.swift` | 403 | Zielroute, Off-Route-Erkennung, Reroute-Cooldown, Fortschritts-Lock |
| | `Utilities/NavigationStateMachine.swift` | 128 | Modi `tracking/manualCalibration/lowConfidence/reRouting` |
| | `Utilities/ShoppingTransferService.swift` | 122 | `.indoorolist` schreiben/lesen, `UTType.indooroShoppingList` |
| | `Utilities/Pathfinder.swift` | 185 | **Dead Code** (Grid-A* aus Ur-Projekt, nicht referenziert) |
| AR | `AR/ARNavViewController.swift` | 704 | `ARView`/`ARSession`, Marker-Pool, HUD |
| | `AR/ARAlignmentService.swift` | 384 | Map↔World-Transformation, Boden-Schätzung, Yaw |
| | `AR/ARRouteTypes.swift` | 236 | `ARRouteRenderConfiguration`, `RouteResampler`, `ARNavigationHUDModel` |
| | `AR/ARRoutePreviewPlanner.swift` | 113 | Begrenzte Wegpunkt-Vorschau |
| | `AR/RouteMarkerPool.swift` | 187 | Wiederverwendbare RealityKit-Entities |
| | `AR/ARNavContainerView.swift` | 139 | SwiftUI-Wrapper + HUD |
| | `AR/ARStoreNavigationModels.swift` | 48 | `ARCalibrationSource`, `ARAlignmentSnapshot`, `ARPreviewWaypoint`, `ARRoutePreviewPlan`, `ARPresentationState` |
| Views | `Views/Main/ContentView.swift` | 234 | `TabView` (Start, Planung, Rezepte, Einkaufen, Karte), Upsell-Sheet, `onOpenURL` |
| | `Views/Main/HomeDashboardView.swift` | 461 | Start-Dashboard + Tutorial-Sheet |
| | `Views/Main/ShoppingFeatureViews.swift` | 1 770 | `ShoppingStopMarker`, `ShoppingSessionPanel`, `UpsellPromptSheet`, `ProductsPage` (Planung), `ShoppingListsPage` (Einkaufen) |
| | `Views/Main/RecipeFeatureViews.swift` | 710 | `RecipesPage`, `RecipeListView`, `RecipeDetailView`, `AddRecipeToShoppingListSheet`, `IngredientMappingStatusView`, `RecipeCard` … |
| | `Views/Main/StoreMapPage.swift` | 1 083 | Filial-Übersicht (MapKit) + Indoor-Karte + Ziel-/Tour-Karten |
| | `Views/Main/MapView.swift` | 410 | Indoor-Canvas in `UIScrollView`-Zoom-Wrapper |
| | `Views/Main/ShoppingTransferViews.swift` | 319 | Import-Vorschau, Artikel-Teilen-Auswahl |
| | `Views/Main/SettingsSheet.swift` | 72 | Tracking-Modus, Kartenzoom, „Tap setzt Ziel“, AR-Start |
| | `Views/Main/HeaderView.swift`, `SearchOverlayView.swift`, `LayoutSelectionSheet.swift` | 447 | **Dead Code** (nicht referenziert) |
| | `Views/Components/*` | ~590 | `ShelfView`, `MapZonePalette`, `BeaconMapItem`, `UserLocationMarker`, `TargetMapMarker`, `ProductSearchRow`, `GridLines`, `MapAxes`, `ShareSheet`, `MapHeaderView` (**Dead Code**) |

**State Management:** ausschließlich `ObservableObject` + `@Published` + `@StateObject`/`@ObservedObject` (Combine-Runtime). Kein `@Observable`, kein TCA, kein `@EnvironmentObject`. Alle 7 Stores werden in `ContentView` als `@StateObject` erzeugt und explizit an jede Seite durchgereicht.

**Concurrency:** `RecipeStore` und `UpsellSuggestionStore` sind `@MainActor`; `BeaconManager`, `ShoppingListManager`, `ShoppingSessionManager`, `ProductSearchStore` sind es nicht und verlassen sich auf `DispatchQueue.main.async`. Netzwerk ausschließlich über `URLSession.shared.dataTask` mit Completion-Handlern. **Kein** `async/await`, keine `Task`-Cancellation, keine Actors.

**Persistenz:** `UserDefaults` – `shoppingListStore.v1` (JSON aller Listen), `shoppingSession.activeListID`, `shoppingSession.routeMode`, `selectedLayoutMode`, `selectedLayoutId`. Temporäre Exportdateien im `FileManager.default.temporaryDirectory`. **Kein** SwiftData/Core Data/Realm, **kein** Keychain, **kein** persistenter Layout-Cache.

**Plattform-Features:** CoreBluetooth (Scan ohne Service-Filter, Duplikate erlaubt), CoreLocation (iBeacon-Ranging mit `CLBeaconIdentityConstraint`, Heading), CoreMotion (DeviceMotion 20 Hz), MapKit (SwiftUI `Map`, `UserAnnotation`, `Annotation`), ARKit + RealityKit, UniformTypeIdentifiers, Document Types + `onOpenURL`, `fileImporter`, `UIActivityViewController`. **Nicht genutzt:** Push Notifications, Background Tasks, Keychain, NFC, CryptoKit, App Attest, Widgets, App Intents.

### 1.3 Legacy-Swift-Projekte

| Merkmal | `swift/indooroApp` | `swift/indooro-` | `swift/indooro-EinkaeuferFinal` |
| --- | --- | --- | --- |
| Tabs/Shell | Einzelansicht mit Karte/Produkte/Einstellungen | Karte + Listen | Start/Planung/Rezepte/Einkaufen/Karte |
| BLE | RSSI-Name-Match, einfache Trilateration | iBeacon + Pipeline | iBeacon + Pipeline + Store-Detection-Refresh |
| Routing | `Pathfinder` (Grid-A*) | `IndoorGraph` + `RouteManager` | wie `indooro-` |
| Einkaufslisten | – | ja | ja + Rezept-/Upsell-Metadaten + Teilen mit Mengen |
| Rezepte / Upsell | – | – | ja |
| Bundle-ID | `…indooroswift` | `…indooroswift` (Kollision) | `…indooroswift2` |

Beide Legacy-Projekte werden nirgends mehr referenziert (keine OpenSpec-Tasks, kein CI). `openspec/config.yaml` bezeichnet dennoch `swift/indooro-` als „feature-rich current app“ – **veraltet** (AUD-01).

### 1.4 Backend-Endpunkte (Ist-Stand)

| Pfad | Methode | Auth (effektiv) | Konsument |
| --- | --- | --- | --- |
| `/api/mobile/stores` | GET | anonym | iOS |
| `/api/mobile/stores/beacon-identities` | GET | anonym | iOS |
| `/api/mobile/stores/by-beacon?uuid&major&minor` | GET | anonym | iOS |
| `/api/mobile/stores/{storeId}/layout/current` | GET | anonym | iOS |
| `/api/mobile/recipes?tag&page&size` | GET | anonym | iOS |
| `/api/mobile/recipes/search?q&page&size` | GET | anonym | iOS |
| `/api/mobile/recipes/{recipeId}` | GET | anonym | iOS |
| `/api/mobile/recipes/{recipeId}/product-mapping?storeId&storeCode` | GET | anonym | iOS |
| `/api/mobile/upsell/suggestions` | POST | anonym | (iOS-Modell vorhanden, nicht aufgerufen) |
| `/api/mobile/upsell/plan` | POST | anonym | iOS |
| `/api/mobile/upsell/events` | POST | anonym | iOS |
| `/api/mobile/upsell/dismiss` | POST | anonym | iOS |
| `/api/products/search?q&size&storeId&storeCode` | GET | anonym | iOS (ohne Store-Filter), Web |
| `/api/products?size` | GET | anonym | iOS (Kategorie-Browse), Web |
| `/api/products/{id}` | GET | anonym | Web |
| `/api/products`, `/api/products/bulk` | POST | `admin` | Admin |
| `/api/categories`, `/api/categories/{code}` | GET | anonym | Web |
| `/api/categories`, `PUT /{code}`, `/bulk` | POST/PUT | `admin` | Admin |
| `/api/layout/current` | GET | anonym | iOS (Default-Layout) |
| `/api/layout/current` | **POST** | **anonym** | Legacy-Editor – **Sicherheitslücke** (AUD-20) |
| `/api/layout/history?limit` | GET | anonym | iOS |
| `/api/layout/versions/{layoutId}` | GET | anonym | iOS |
| `/api/convert/pdf-to-json` | POST (multipart) | **anonym** (keine Permission) | Legacy (AUD-21) |
| `/api/export/pdf` | POST | **anonym** | Legacy (AUD-21) |
| `/api/admin/index/create`, `DELETE /api/admin/index` | POST/DELETE | nur „authenticated“, keine Rolle | Ops (AUD-22) |
| `/api/admin/health` | GET | authenticated | Ops |
| `/api/admin/me` | GET | alle Admin-Rollen | Admin |
| `/api/admin/logs`, `/api/admin/error-logs` | GET | `admin` | Admin |
| `/api/admin/products[/{id}]` | GET/POST/DELETE | `admin` | Admin |
| `/api/admin/recipes/**` (17 Operationen) | diverse | `admin` | Admin |
| `/api/admin/recipe-tags/**` | GET/POST/PUT/PATCH | `admin` | Admin |
| `/api/regions/**` | GET/POST/PUT/PATCH | Rollen + Scope | Admin |
| `/api/stores/**` inkl. `/audit`, `/beacons` | GET/POST/PUT/PATCH | Rollen + Scope | Admin |
| `/api/stores/{storeId}/layout/{current,versions,versions/{id},versions/{id}/activate,editor-context}` | GET/POST | Rollen + Scope | Admin-Editor |
| `/api/beacons/**` inkl. `/free`, `/bulk`, `/assign`, `/release`, `/archive` | GET/POST/PUT/PATCH | Rollen + Scope | Admin |
| `/hello` | GET | anonym | Beispiel-Resource (Dead Code) |
| `/q/openapi`, `/q/swagger-ui` | GET | abhängig vom Profil | SmallRye OpenAPI (vorhanden, ungenutzt für Codegen) |

**Datenbank:** Flyway V1–V11 (`regions`, `stores` (+`latitude/longitude` V6), `beacons` (UUID als 32-stelliger Hex-String seit V3), `beacon_assignments`, `layout_versions` (JSONB, partieller Unique-Index „ein ACTIVE pro Store“), `audit_logs`, `error_logs`, `user_access_assignments`, `units`, `recipes`, `recipe_ingredients`, `recipe_steps`, `recipe_tags`, `recipe_tag_assignments`, `ingredient_product_mappings`, `ingredient_synonyms`, `upsell_suggestion_cache`, `upsell_events`, `upsell_dismissals`). **OpenSearch-Indizes:** `products` (`id`, `name`, `price`, `layoutCode`, `storeId`/`storeCode` als keyword), `categories`, `layouts` (Legacy-Global-Layouts + History).

**Tests:** Java – `UpsellSuggestionServiceTest`, `RecipeServiceTest`, `AdminRecipeResourceTest`, `AdminRecipeTagResourceTest`, `MobileUpsellResourceTest`, `MobileRecipeResourceTest`, `ExampleResourceTest/IT`; JS – `admin-core.test.mjs`; Playwright – `admin-redesign.spec.mjs`; httpYac – 7 Suiten. **Swift – keine Tests.** **CI führt keine Tests aus** (`-DskipTests`) und baut mit JDK 21, obwohl `maven.compiler.release=17`.

---

## 2. Integrationsanalyse Swift ⇄ Backend (Vertragsabgleich)

| # | Endpunkt | Backend-DTO | Swift-Modell | Abweichung | Schwere |
| --- | --- | --- | --- | --- | --- |
| C1 | `POST /api/mobile/upsell/dismiss` | `UpsellDismissRequest.suppressMinutes` mit `@Min(1) @Max(30)` | `UpsellSuggestionStore.reportDismissal` sendet `24 * 60 = 1440` | **Jede Dismissal-Anfrage scheitert mit HTTP 400** (Bean Validation). Service-Code klemmt dagegen auf `30 * 24 * 60` – das DTO-Limit ist offensichtlich ein Einheitenfehler. | **P0** |
| C2 | `GET /api/mobile/stores` | `MobileStoreSummary(id, storeCode, name, city, address, latitude, longitude)` | Erwartet `street`, `zipCode`, `country`; kennt `address` nicht | Adresse wird nie angezeigt; `displaySubtitle` enthält nur die Stadt. | P1 |
| C3 | `GET /api/mobile/stores/{id}/layout/current` | `MobileLayoutResponse(storeId, layoutId, source, fallback, layout)` | `MobileLayoutResponse(storeId, layoutId, layout)` | `fallback`/`source` werden ignoriert → App kann Default-Layout nicht von echtem aktiven Layout unterscheiden (verletzt Spec `store-layout-management`/Align-Change). | P1 |
| C4 | `GET /api/products/search` | unterstützt `storeId`, `storeCode` | `ProductSearchStore` sendet nur `q`, `size` | Suche ist bei mehreren Filialen nicht store-scoped (verletzt „Store-aware catalog data is preferred“). | P1 |
| C5 | `GET /api/products[/search]` | `Product.price`/`layoutCode` nullable | `Product.price: Double`, `layoutCode: String` (non-optional), Array-Decoding | Ein einziges Produkt ohne Preis/LayoutCode lässt **die ganze Ergebnisliste** leer werden. | P1 |
| C6 | Alle `Instant`-Felder (`expiresAt`, `publishedAt` …) | Jackson ISO-8601, bei Postgres-/JVM-Werten mit Bruchteilsekunden | `UpsellSuggestionStore` nutzt `.iso8601` (ohne Bruchteilsekunden) | Risiko: Plan-Response wird komplett verworfen, wenn `expiresAt` Mikrosekunden enthält. Rezept-Zeitstempel sind als `String` modelliert (unkritisch). **Zu verifizieren** mit Live-Payload. | P1 |
| C7 | `POST /api/mobile/upsell/suggestions` | implementiert | `UpsellRequest`/`UpsellSuggestionResponse` modelliert, aber nie aufgerufen | Toter Client-Code bzw. ungenutzter Endpunkt. | P2 |
| C8 | `GET /api/layout/history`, `/versions/{id}` | globale Legacy-Layouts | Nur noch als Fallback genutzt; UI zur Versionswahl (`LayoutSelectionSheet`) ist **nicht erreichbar** | Spec-Drift zu „persisted layout selection / selected version“. | P2 |
| C9 | Fehler-Payloads | `ApiWebApplicationExceptionMapper` liefert JSON-Fehler | Swift wertet Bodies nur als Debug-Text aus; `RecipeStore`/`ProductSearchStore` prüfen **keinen HTTP-Status** | 4xx/5xx-HTML/JSON wird als Decoding-Fehler gemeldet. | P1 |
| C10 | Base-URL | LeoCloud `https://it220209.cloud.htl-leonding.ac.at/api` | 4× hartkodiert | Keine lokale Entwicklung gegen `localhost:8080` ohne Codeänderung. | P1 |

---

## 3. Befundliste (AUD)

### 3.1 Struktur & Governance

| ID | Befund | Beleg | Konsequenz |
| --- | --- | --- | --- |
| AUD-01 | `openspec/config.yaml` nennt `swift/indooro-` als aktuelle App; tatsächlich ist `swift/indooro-EinkaeuferFinal` kanonisch (alle Upsell-/Rezept-Tasks referenzieren es). | `config.yaml` „Mobile frontend“; `stabilize-upsell…/tasks.md` 13.3 | **Behoben** in diesem Audit (config aktualisiert). |
| AUD-02 | Drei Swift-Projekte, zwei mit identischer Bundle-ID; Zip-Artefakt untracked; `UserInterfaceState.xcuserstate` versioniert. | `project.pbxproj`, `git status` | Verwechslungsgefahr; Roadmap P1-10. |
| AUD-03 | Keine Swift-Tests, kein iOS-CI. | `TESTING.md`, `.github/workflows/ci.yaml` | Regressionen in Navigation/Upsell unentdeckt; Roadmap P0-05. |
| AUD-04 | Sieben abgeschlossene Changes sind nicht archiviert (`add-backend-jacoco-coverage-reporting`, `align-openspec-audit-findings`, `improve-recipe-product-mapping-selection`, `redesign-admin-platform-layout-editor`, `split-admin-platform-pages` vollständig; `add-recipe-shopping-list-integration` 3 offene manuelle Tests; `add-upsell-cross-sell-suggestions` 1 offener manueller Test). | `tasks.md` | Permanente Specs enthalten **weder** `recipe-catalog-shopping` **noch** `mobile-upsell-suggestions` – die Single Source of Truth ist unvollständig. Roadmap P0-01. |
| AUD-05 | `improve-upsell-candidate-ranking` (deterministisches Pro-Opportunity-Scoring, 25 offene Tasks) steht im **Widerspruch** zu `harden-upsell-prefilter-quality` (AI-first, keine deterministischen Fallbacks) und `stabilize-upsell-quality-and-request-lifecycle`. | Proposals | Muss als „superseded“ geschlossen werden, sonst widersprüchliche Requirements beim Archivieren. Roadmap P0-02. |
| AUD-06 | Das Swift-Projekt war in `openspec/specs/` nur über 4 grobe `mobile-*`-Capabilities abgedeckt; es fehlten App-Shell, Netzwerk-Vertrag, Planung, Karte, Rezepte-UI, Session-UX, Persistenz, Berechtigungen, Tuning-Parameter. | `openspec/specs/mobile-*` | **Behoben** durch Change `integrate-ios-client-specs` (archiviert) mit 5 neuen Capabilities. |
| AUD-07 | Spec `mobile-positioning-navigation` fordert „iOS 15 or later“; Projekt ist auf iOS 18.5 gesetzt und nutzt iOS-17+-APIs (`onChange(of:initial:)`, `Map(position:)`, `MapCameraPosition`). | pbxproj, `StoreMapPage.swift` | **Behoben** (MODIFIED Requirement). |

### 3.2 Spec-Drift (Code verletzt bestehende Requirements)

| ID | Requirement (Spec) | Ist-Verhalten | Beleg |
| --- | --- | --- | --- |
| AUD-08 | `mobile-store-detection` › „Store map uses persisted coordinates … without city-based or deterministic-offset fallback“ | `StoreMapPage.fallbackCoordinate(for:)` setzt Stores ohne Koordinaten per Stadt-Lookup (Leonding/Hagenberg/Hörsching/Linz) plus Hash-Offset auf die Karte. **Regression:** Der archivierte Change `2026-05-19-add-real-store-coordinates` hat den Fallback nur in `swift/indooro-` entfernt (0 Treffer), das kanonische Final-Projekt enthält ihn weiterhin (2 Treffer). | `StoreMapPage.swift:789-827` |
| AUD-09 | `mobile-positioning-navigation` › „Fewer than three usable beacons … must not present the position as a fully trusted Blue Dot“ / „shows degraded/low-confidence behavior“ | `MapView` zeigt `userPosition ?? rawUserPosition` immer gleich an; `isLowConfidence` und `navigationStatusMessage` werden nur in der AR-Ansicht und im toten `HeaderView` dargestellt. | `MapView.swift:21,110-122` |
| AUD-10 | `mobile-positioning-navigation` › „uses the best available cached, historical, or bundled layout fallback and clearly distinguishes fallback state“ | Kein persistenter Cache; Fallback-Kette ist Store-Layout → (nur Default-Pfad) History-Latest → Bundle. Bei Store-Layout-Fehler wird **kein** Fallback-Layout geladen, nur Statusmeldung. Fallback-Flag des Servers ignoriert (C3). | `BeaconManager.swift:1619-1835` |
| AUD-11 | `mobile-positioning-navigation` › „Product search requires network … handles unavailable network as a search error“ | Netzwerkfehler führen zu leerer Ergebnisliste ohne Fehlermeldung (`ProductSearchStore`). | `ProductSearchStore.swift:41-47` |
| AUD-12 | `store-layout-management` › Layout-JSON bewahrt `rotation`, `accessAngle` | App rendert `rotation`, aber `IndoorGraphBuilder` blockiert achsenparallele Zellen (ignoriert Rotation), `accessAngle` wird nirgends genutzt – und hat im Editor keine definierte Semantik (neue Elemente 90, Export-Fallback 0, kein Bedienelement); Ziele sind Regalmitten (blockiert) → Routing endet am nächstgelegenen freien Knoten, ggf. auf der falschen Regalseite. | `IndoorGraph.swift:351-372`, `ShoppingListManager.swift:215-221` |
| AUD-13 | `product-catalog-search` › „Store-aware catalog data is preferred“ | Siehe C4. | `ProductSearchStore.swift:30` |

### 3.3 Qualität, Architektur, Performance

| ID | Befund | Beleg | Empfehlung |
| --- | --- | --- | --- |
| AUD-14 | `BeaconManager` vereint ≥ 8 Verantwortlichkeiten (2 735 LOC), ist nicht `@MainActor`, öffentlich mutierbare `@Published var`-Properties (`beacons`, `shelves`, `gridWidth`, `userPosition` …). | `BeaconManager.swift:118-160` | Aufteilen (Blueprint §3). |
| AUD-15 | Swift 5 Sprachmodus, minimale Concurrency-Prüfung; 4 von 6 Stores ohne Actor-Isolation; Completion-Handler statt `async/await`; kein Request-Cancelling (nur „latest request id“-Vergleich). | diverse | Swift 6 Migration (Roadmap P1-01…03). |
| AUD-16 | `MultiStopRoutePlanner.order` baut bei **jedem** `sync` den kompletten Raster-Graphen neu und führt pro Vergleich im `min(by:)` zwei A*-Suchen aus; `sync` wird bei jeder Positionsänderung (`userPosition`, `rawUserPosition`) aufgerufen. A* nutzt `Set.min` (O(V) je Iteration → O(V²)). | `ShoppingListManager.swift:233-303`, `IndoorGraph.swift:229-274`, `ContentView.swift:114-121` | Graph cachen, Distanzmatrix einmal je Snapshot, Binary-Heap. |
| AUD-17 | CoreMotion-Callback (20 Hz) auf Main Queue führt Pose-Prädiktion + Map-Matching aus. | `BeaconManager.swift:1033-1062` | Pipeline in eigenen Actor verlagern. |
| AUD-18 | Dead Code: `Pathfinder`, `HeaderView`, `MapHeaderView`, `SearchOverlayView`, `LayoutSelectionSheet`, `BeaconManager.searchProducts/searchResults/isSearching`, `setFixedTargetIfNeeded` (`fixedTargetCategory = nil`), `UpsellRequest`/`UpsellSuggestionResponse`, `ExampleResource`. | Referenzsuche | Entfernen oder bewusst reaktivieren. |
| AUD-19 | Upsell-Debug-Logging ist fest eingeschaltet (`debugEnabled = true`) und schreibt komplette Request-/Response-Bodies per `print` in Release-Builds; `BeaconManager` loggt jede HTTP-URL. | `UpsellSuggestionStore.swift:57` | `os.Logger` mit Privacy-Levels, nur DEBUG. |
| AUD-23 | App-Bundle enthält Präsentations-HTML/JS, README und 6 ungenutzte Layout-JSONs; kein Asset-Katalog (kein App-Icon). | Projektordner | Ressourcen bereinigen, `Assets.xcassets` ergänzen. |
| AUD-24 | Kategorie-Browse lädt `GET /api/products?size=500` und filtert clientseitig per `layoutCode`-Präfix; Bio/Demeter-Filter per Namens-Substring. Kategorie-Codes (310, 520, 445 …) sind im Client hartkodiert. | `ShoppingFeatureViews.swift:242-405, 929-941` | Server-seitiger Kategorie-Filter (future `GET /api/products?categoryCode=`). |
| AUD-25 | Persistenz aller Listen als ein JSON-Blob in `UserDefaults`; keine Schema-Versionierung außer Key-Suffix `.v1`; `try?` verschluckt Encode-/Decode-Fehler (bei Decode-Fehler gehen alle Listen verloren → neue Default-Liste überschreibt). | `ShoppingListManager.swift:961-977` | Dateibasierte, versionierte Persistenz mit Backup. |
| AUD-26 | Kein Offline-Cache für Rezepte, Stores oder Layouts; Mobile-Stores werden nur einmal pro Karten-Aufruf geladen. | Stores | Roadmap P1-07. |
| AUD-27 | Keine Lokalisierung (String Catalog fehlt), alle UI-Texte deutsch hartkodiert; teils ASCII-Umschreibungen in Fehlermeldungen („ungueltig“). `preferredColorScheme(.light)` erzwingt Light Mode. | Views | P2. |
| AUD-33 | Planungs-Abschnitt „Kunden kauften ebenfalls“ suggeriert Kaufdaten-Analyse, zeigt aber statische Chips. | `ShoppingFeatureViews.swift:809, 857-927` | Umbenennen (Change B). |
| AUD-34 | `align-openspec-audit-findings` modifiziert „Category maintenance supports lookup and protected bulk import“; die permanente Spec heißt „…lookup and bulk import“ → Archivieren scheitert ohne `RENAMED`-Abschnitt. | `changes/align-openspec-audit-findings/specs/catalog-maintenance-operations/spec.md` | Roadmap P0-06. |
| AUD-35 | `OpenSearchService.createIndex()` loggt „Index might already exist“ nur als Warnung und meldet Erfolg; Spec verlangt explizite Fehlermeldung. | `OpenSearchService.java:245-266` | Change D Task 2.8. |
| AUD-36 | Java-Versionen inkonsistent: Compile 17, CI JDK 21, Runtime-Image `eclipse-temurin:25-jdk`; CI baut mit `-DskipTests`. | `pom.xml`, `ci.yaml`, `Dockerfile` | Roadmap P1-01, P2-12. |
| AUD-37 | AR-Hinweis verweist auf den Button „Ich stehe hier“, der nur im toten `HeaderView` existiert. | `ARNavViewController.swift:506` | Change B 8.5. |
| AUD-38 | Kubernetes injiziert das OIDC-Secret bereits als `QUARKUS_OIDC_CREDENTIALS_SECRET`; der Default in `application.properties` greift nur, wenn das Secret fehlt – dennoch ein unsicherer Fallback. | `k8s/backend.yaml:72`, `application.properties:43` | Change D. |
| AUD-28 | Barrierefreiheit nur punktuell (`accessibilityLabel` an wenigen Stellen), Karte ohne VoiceOver-Beschreibung der Route. | Views | P2. |

### 3.4 Sicherheit

| ID | Befund | Beleg | Schwere |
| --- | --- | --- | --- |
| AUD-20 | `POST /api/layout/current` ist über `quarkus.http.auth.permission.public.paths=…/api/layout/*` **anonym beschreibbar**; jeder kann das globale Default-Layout (Fallback aller Apps) überschreiben. | `application.properties:51`, `LayoutResource.java:43` | **P0** |
| AUD-21 | `/api/convert/pdf-to-json` (Datei-Upload, PDFBox-Parsing) und `/api/export/pdf` liegen in keiner Permission → in Quarkus standardmäßig **offen** (DoS-/Parser-Angriffsfläche). | `application.properties`, `ImportResource.java`, `ExportResource.java` | **P0** |
| AUD-22 | `/api/admin/index/create` und `DELETE /api/admin/index` verlangen nur Authentifizierung, **keine `admin`-Rolle** – ein Store-Manager könnte den Produktindex löschen. | `AdminResource.java` | **P0** |
| AUD-29 | `NSAllowsArbitraryLoads = true` deaktiviert ATS global. | `Info.plist` | P1 |
| AUD-30 | CORS `origins=*` inkl. `authorization`-Header für Cookie-/Hybrid-OIDC-Backend; Default-Client-Secret `indooro-admin-secret` als Fallback in `application.properties`. | `application.properties:31-43` | P1 |
| AUD-31 | Anonyme Upsell-Endpunkte (`plan` löst OpenAI-Kosten aus) haben kein Rate-Limit und keine App-Attestierung. | `MobileUpsellResource.java` | P1 (Kostenrisiko) |
| AUD-32 | `documentation/leocloud-openai-secret.local.md` enthält lokal einen API-Key, ist aber korrekt per `.gitignore` ausgeschlossen und **nicht** getrackt. Inhalt wurde im Audit nicht gelesen. | `.gitignore`, `git ls-files` | Info |

---

## 4. OpenSpec-Audit

### 4.1 Validierung

`npx -y @fission-ai/openspec@1.3.1 validate --all --strict` vor dem Audit: **26 passed, 0 failed** (16 Specs, 10 Changes); nach dem Audit: **34 passed, 0 failed** (21 Specs, 13 Changes). Stand 2026-09-21 nach Archivierung aller Altlasten und Ergänzung der Querschnitts-Specs: **38 passed, 0 failed** (30 Specs, 8 offene Changes). Formale Konformität war gegeben; die Lücken sind inhaltlich (AUD-04 bis AUD-13).

### 4.2 Capability-Abdeckung vor/nach dem Audit

| Capability | Vorher | Nachher |
| --- | --- | --- |
| `project-overview`, `domain-model`, `admin-*`, `catalog-maintenance-operations`, `customer-web-experience`, `deployment-operations`, `keycloak-deployment`, `pdf-catalog-import`, `product-catalog-search`, `store-layout-management` | vorhanden | unverändert (Backend-Sicherheitskorrektur als Change `protect-legacy-write-endpoints` vorgeschlagen) |
| `mobile-store-detection` | grob | + iOS-Erkennungspipeline (Refresh, RSSI-Schwelle, Cooldown, Constraints, Generationen) |
| `mobile-positioning-navigation` | grob, iOS 15 | + Pipeline-Parameter, Kalibrierung, Debug-Modus, Heading, Graph; iOS-18.5-Baseline |
| `mobile-shopping-lists` | grob | + Listenverwaltung, Session-Lebenszyklus, Persistenz-Keys, Teilen mit Mengen, Import-Merge |
| `mobile-ar-navigation` | grob | + Render-Grenzen, Tracking-Zustände, Kamera-Berechtigung, Rekalibrierung |
| `ios-client-architecture` | – | **neu**: Projekt-Baseline, App-Shell, State-Ownership, Berechtigungen, Ressourcen, Logging, Legacy-Projekte |
| `ios-backend-integration` | – | **neu**: Endpunkt-Katalog, Decoding-Toleranz, Stale-Response-Schutz, Fehlerbehandlung, Datenschutz |
| `ios-product-planning` | – | **neu**: Planung-Tab (Suche, Kategorien, Kennzeichnung, Vorschläge, geplante Artikel) |
| `ios-store-map-experience` | – | **neu**: Filial-Übersicht, Indoor-Karte, Marker, Zoom, Zielkarte, Tour-Panel, Einstellungen |
| `ios-recipe-experience` | – | **neu**: Rezeptliste, Suche, Detail, Mapping-Status, Zutatenauswahl |
| `recipe-catalog-shopping`, `mobile-upsell-suggestions`, `mobile-upsell-quality-gates`, `admin-recipe-product-mapping-selection`, `backend-test-coverage-reporting` | nur in aktiven Changes | **archiviert am 2026-09-21** (manuelle Tests vom Team bestätigt) – jetzt in `openspec/specs` |
| `mobile-upsell-quality-control` | nur im Change `stabilize-upsell-quality-and-request-lifecycle` | bleibt offen (0/135 Tasks, noch nicht umgesetzt) |

### 4.3 Neue Changes aus diesem Audit

| Change | Zweck | Status |
| --- | --- | --- |
| `integrate-ios-client-specs` (Kürzel A) | Dokumentiert den Ist-Zustand des Swift-Clients als permanente Specs (+84 Requirements, 1 modifiziert) | validiert und **archiviert** als `2026-09-17-integrate-ios-client-specs` |
| `fix-ios-contract-and-spec-drift` (B) | Behebt C1–C6, C9 sowie AUD-08 bis AUD-13 im Code | Proposal, offen |
| `modernize-ios-client-architecture` (C) | Swift 6, `@Observable`, `APIClient` (async/await), Modularisierung (SPM), Tests, Persistenz, Konfiguration, Performance, Security | Proposal, offen |
| `protect-legacy-write-endpoints` (D) | Schließt AUD-20 bis AUD-22 und AUD-30/38 im Backend | Proposal, offen |
