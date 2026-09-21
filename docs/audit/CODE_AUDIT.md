# Indooro – Code Audit (Phase 2: Gap Analysis, Tech Debt & Code Smells)

| Feld | Wert |
| --- | --- |
| Stand | 2026-09-17, `main` @ `63a42d4` |
| Grundlage | [SYSTEM_MAP.md](SYSTEM_MAP.md); iOS-Vorarbeit [docs/specs/AUDIT.md](../specs/AUDIT.md) (IDs `AUD-xx`, `C1–C10`) |
| Methode | Manuelles Review aller Backend-, Admin-, Kunden-Web-, Infrastruktur- und Swift-Quellen; Belege als `Datei:Zeile`; Messläufe: `mvn -o test` (70/70 grün, JaCoCo 31 % Zeilen), `xcodebuild` mit `SWIFT_STRICT_CONCURRENCY=complete` (120 Diagnosen) |
| Nicht durchgeführt | Aktive Tests gegen das Produktivsystem (LeoCloud), Login mit Demo-Zugangsdaten, Lasttests. Befunde, die davon abhängen, sind als **„zu verifizieren“** markiert. |

## 0. Management Summary

### 0.1 Schweregrade

| Stufe | Bedeutung |
| --- | --- |
| **P0** | Sicherheitslücke mit direkter Ausnutzbarkeit oder Datenverlust/Totalausfall; vor der nächsten Demo beheben |
| **P1** | Funktionsfehler, Vertragsbruch oder Performance-Problem mit Nutzerwirkung; im nächsten Sprint |
| **P2** | Technische Schuld, Wartbarkeit, Hygiene |

### 0.2 Top 13

| # | ID | Befund | Stufe |
| --- | --- | --- | --- |
| 1 | SEC-01 | Produktions-Keycloak importiert Demo-Benutzer mit festen Passwörtern; Backend-Migration V4 gibt dieser Subject-ID volle Admin-Rechte | **P0** |
| 2 | SEC-02 | Stored XSS im Layout-Editor; im Legacy-Modus ist die Quelle anonym beschreibbar (`POST /api/layout/current`) → Übernahme einer Admin-Session | **P0** |
| 3 | SEC-03 | Keycloak-Master-Admin `admin/admin`, `start-dev`, flüchtige `dev-file`-DB auf öffentlichem Host | **P0** |
| 4 | SEC-04 | OpenSearch ohne Authentifizierung als NodePort-Service | **P0** |
| 5 | SEC-05 | Anonymer PDF-Export mit nutzergesteuerter Schleifengrenze (`layoutCode` „1/1/2000000000/1“) → CPU-/Speicher-DoS | **P0** |
| 6 | SEC-06 / AUD-20–22 | Anonyme bzw. rollenlose Schreib-/Wartungsrouten (bereits als Change `protect-legacy-write-endpoints` erfasst) | **P0** |
| 7 | PERF-01 | `UpsellSuggestionService.plan()` hält eine DB-Transaktion über den OpenAI-Aufruf (≤ 12 s) offen → Connection-Pool-Erschöpfung durch anonyme Anfragen | **P0** |
| 8 | BUG-13 | „Rezept bearbeiten“ im Admin löscht Beschreibung, Bild-URL, Bild-Alt-Text und alle Tags des Rezepts | **P0** |
| 9 | PERF-02 | Öffentliche Rezeptliste: N+1 über DB **und** OpenSearch (bis ~160 DB-Queries + ~160 OpenSearch-GETs pro Seite) | P1 |
| 10 | SEC-07 | Jeder 4xx/5xx – auch anonym auslösbar – erzeugt eine `error_logs`-Zeile mit Stacktrace (≤ 20 KB), ohne Retention | P1 |
| 11 | API-11 | Admin-Logout ruft `/logout` auf, konfiguriert ist `/admin/logout` → Session bleibt bestehen | P1 |
| 12 | API-12 | Admin-Listen laden nur die erste Serverseite (20 Einträge); 26 Rezepte im Seed → 6 unsichtbar | P1 |
| 13 | BUG-01 | Upsell-Dismissals werden gespeichert, aber nie gelesen; zudem schlägt jeder iOS-Dismiss mit HTTP 400 fehl (C1) | P1 |

### 0.3 Befundstatistik

| Kapitel | P0 | P1 | P2 | Summe |
| --- | --- | --- | --- | --- |
| 1 Dead Code & Orphaned Assets (DC-01…25) | 0 | 1 | 24 | 25 |
| 2 Security & Data Leaks (SEC-01…26) | 6 | 15 | 5 | 26 |
| 3 API Integrity & Contract Mismatches (API-01…27) | 1 | 17 | 9 | 27 |
| 4 Performance Bottlenecks (PERF-01…09, 10…15, 20…33) | 1 | 14 | 14 | 29 |
| 5 Korrektheit & Code Smells (BUG-01…16, SMELL-01…04) | 1 | 9 | 10 | 20 |
| **Gesamt** | **9** | **56** | **62** | **127** |

---

## 1. Dead Code & Orphaned Assets

### 1.1 Swift

| ID | Artefakt | Beleg | Empfehlung | Stufe |
| --- | --- | --- | --- | --- |
| DC-01 | `Utilities/Pathfinder.swift` (185 LOC, Grid-A* aus dem Ur-Projekt) | 1 Referenz = eigene Deklaration | löschen | P2 |
| DC-02 | `Views/Main/HeaderView.swift` (252 LOC) inkl. Button „Ich stehe hier“, auf den `ARNavViewController.swift:506` verweist | nicht instanziiert | löschen, AR-Hinweistext anpassen (AUD-37) | P2 |
| DC-03 | `Views/Main/SearchOverlayView.swift`, `Views/Main/LayoutSelectionSheet.swift`, `Views/Components/MapHeaderView.swift` | je 1 Referenz (Deklaration) | löschen oder Layout-Auswahl bewusst reaktivieren | P2 |
| DC-04 | `UpsellRequest`, `UpsellSuggestionResponse` in `Models/UpsellModels.swift` | nie verwendet; Backend-Endpunkt `/api/mobile/upsell/suggestions` hat keinen Client | Modelle löschen oder Endpunkt nutzen (siehe DC-23) | P2 |
| DC-05 | `BeaconManager.searchProducts/searchResults/isSearching`, `setFixedTargetIfNeeded` (`fixedTargetCategory = nil`) | Legacy-Suche, von `ProductSearchStore` abgelöst | entfernen | P2 |
| DC-06 | `ShoppingList.isArchived` | wird nie auf `true` gesetzt; nur in `ShoppingListManager.swift:967` gefiltert | Feld entfernen oder Archiv-Feature bauen | P2 |
| DC-07 | Bundle-Ballast: 6 ungenutzte Layout-JSONs, `README.md`, `presentation-airdrop-swift/*` im App-Target (File-System-Synchronized Group) | `Resources/`, Projektordner | aus dem Target ausschließen | P2 |
| DC-08 | Legacy-Projekte `swift/indooro-`, `swift/indooroApp` (12 589 LOC) + `swift/indooro-EinkaeuferFinal.zip` (untracked) + 10 versionierte `xcuserdata`-Dateien | `git ls-files swift` | archivieren (Tag/Branch), aus `main` entfernen, `xcuserdata` in `.gitignore` | P2 |

### 1.2 Admin- und Kunden-Frontend

| ID | Artefakt | Beleg | Empfehlung | Stufe |
| --- | --- | --- | --- | --- |
| DC-09 | `admin/server-logs/server-logs.js` + `server-logs.css` | `admin/server-logs/index.html:11` lädt `app.js`, nicht diese Dateien | löschen | P2 |
| DC-10 | `state.cache` in `admin/app.js:33` | nie gelesen/geschrieben | entfernen | P2 |
| DC-11 | `API.freeBeacons` (`core.js:20`) → `GET /api/beacons/free` | vom UI nie aufgerufen (Dashboard filtert selbst) | Konstante entfernen; Endpunkt behalten oder UI darauf umstellen | P2 |
| DC-12 | `localStorage.setItem('indooro_live_layout', …)` in `editor.js:632` | kein Leser im Repo | entfernen | P2 |
| DC-13 | Store-Detail-„Tabs“ (`app.js:271-276`) | Buttons ohne Handler | implementieren oder entfernen | P2 |
| DC-14 | Legacy-Web `app/` (v1, v2, launch_supermarkt, uploadPdf, configurator-demo, MySQL-Schema `app/db/indooro.sql`); `app/uploadPdf/index.html:285` ruft das nicht existierende `/api/convert/pdf-to-csv` | nicht deployt, nicht referenziert | in Archiv-Branch verschieben | P2 |
| DC-15 | `Beacons/` (Express-BLE-Logger, Python-Skripte), `convert_to_ndjson.py`, `scripts/programB.js` (1 Zeile), `.backend.pid` (versioniert) | Prototypen | archivieren; `.backend.pid` in `.gitignore` | P2 |

### 1.3 Backend

| ID | Artefakt | Beleg | Empfehlung | Stufe |
| --- | --- | --- | --- | --- |
| DC-16 | `ExampleResource` (`GET /hello`) + `ExampleResourceTest`/`IT` | Quarkus-Template | löschen | P2 |
| DC-17 | `at.htl.DTO.ProductJson` | 0 Verwendungen; Duplikat von `ImportResource.ProductJson` | löschen | P2 |
| DC-18 | `src/main/java/at/code.zip` (Quellcode-Archiv inkl. `__MACOSX`) im Java-Quellbaum | `unzip -l` | löschen | P2 |
| DC-19 | `PdfImportRunner` (`main`-Methode mit Pfad `mein_plan.pdf`), `PdfImportService.importProductsFromPdf/importFromPdfAsJson`, `PdfExportService.extractText/printExtractedTextToConsole/hasExtractableText/dumpDecompressedPageContentStreamsToConsole` (schreiben per `System.out`) | nur Deklarationen bzw. Runner | in Testwerkzeug verschieben oder löschen | P2 |
| DC-20 | `OpenSearchService.searchProducts(String, Integer)` (2-Parameter-Überladung) | kein Aufrufer im Main-Code | entfernen | P2 |
| DC-21 | `IngredientSynonymEntity` + `IngredientSynonymRepository` (Tabelle wird in V7 geseedet) | Repository nie injiziert | Synonym-Suche implementieren oder Tabelle/Entity entfernen | P2 |
| DC-22 | `RecipeIngredientRepository.listByRecipe`, `RecipeStepRepository.listByRecipe`, `RecipeTagRepository.listActive` | nur Deklarationen | entfernen | P2 |
| DC-23 | Ungenutzter Endpunkt `POST /api/mobile/upsell/suggestions` (+ ~300 LOC Einzel-Ranking in `UpsellSuggestionService.suggestions()`) | kein Client (iOS nutzt `/plan`) | als deprecated markieren, nach Umstellung entfernen | P1 |
| DC-24 | Backend-Hilfsdateien im Modulroot: `Belegplan_ocr.pdf`, `Demo_Belegplan.pdf`, `mein_plan.pdf`, `belegplan*.json`, `*_export.csv/json` | Testdaten ohne Referenz aus Tests | nach `src/test/resources` oder löschen | P2 |

### 1.4 Datenbank, Infrastruktur, Doku

| ID | Artefakt | Beleg | Empfehlung | Stufe |
| --- | --- | --- | --- | --- |
| DC-25 | Index `idx_upsell_suggestion_cache_lookup` (V11) | Lesezugriffe erfolgen ausschließlich über `context_hash` (eigener Unique-Index) | in neuer Migration droppen | P2 |
| — | Tabelle `ingredient_synonyms` | siehe DC-21 | – | – |
| — | Migrationen V5/V6 mit umgebungsspezifischen Daten (Demo-Zuweisungen per Namen, Koordinaten per fester Store-ID) | auf frischer DB wirkungslos | nicht löschen (Flyway-Checksumme), aber künftige Seeds in `R__`/Dev-Profil auslagern | – |
| — | `k8s/volume-claim.yaml` (`opensearch-pvc`) | von keinem Deployment referenziert (`opensearch.yaml` nutzt `opensearch-data`) | löschen | – |
| — | `backend/indooro_server/build.sh` pusht `indooro-backend` (ohne `-v2`) | CI und Deployment nutzen `indooro-backend-v2` | angleichen oder löschen | – |
| — | `api-tests/httpyac/README.md` referenziert `.env.example` | Datei existiert nicht; `.gitignore` enthält fälschlich `.env.example/` | Vorlage committen | – |

> Die mit „—“ markierten Zeilen sind Hygiene-Hinweise ohne eigene ID; sie sind im Blueprint unter „Repository-Hygiene“ zusammengefasst.

---

## 2. Security & Data Leaks

### 2.1 Authentifizierung & Identität

| ID | Befund | Beleg | Angriffsszenario | Maßnahme | Stufe |
| --- | --- | --- | --- | --- | --- |
| **SEC-01** | Das **Produktions**-Realm wird aus einer ConfigMap importiert, die drei Benutzer mit festen, nicht temporären Passwörtern anlegt (`indooro-admin`/`admin`, `indooro-region`/`region`, `indooro-store`/`store`) und feste IDs `1111…`, `2222…`, `3333…` vergibt. Migration V4 legt für Subject `11111111-1111-1111-1111-111111111111` eine aktive `admin`-Zuweisung an. | `k8s/keycloak.yaml` (ConfigMap `indooro-keycloak-realm`), `V4__user_access_assignments.sql` | Jeder, der das Repo kennt, meldet sich unter `https://it220209…/admin/` als Vollzugriffs-Admin an. **Zu verifizieren**, ob die Passwörter in LeoCloud manuell geändert wurden – wegen SEC-03 (flüchtige DB + Re-Import) ist davon auszugehen, dass sie nach jedem Pod-Neustart wieder gelten. | Demo-Benutzer nur im Dev-Realm; Prod-Realm ohne Benutzer oder mit `temporary: true` + Passwort-Policy; Subject-Zuweisungen per Admin-Workflow statt Migration | **P0** |
| **SEC-03** | Keycloak läuft in LeoCloud mit `start-dev`, `KC_DB=dev-file` **ohne Volume**, Bootstrap-Admin `admin`/`admin` aus einem im Repo stehenden Secret, Version 24.0.5. | `k8s/keycloak.yaml` | Master-Realm-Admin-Konsole unter `/keycloak/admin/` mit Standardpasswort → vollständige Übernahme der Identitätsverwaltung; jede Änderung geht beim Neustart verloren. | `start --optimized` mit PostgreSQL-Backend, Secrets außerhalb Git, aktuelle 26.x, Admin-Konsole nicht öffentlich routen | **P0** |
| SEC-08 | Client `indooro-admin-web` erlaubt im Prod-Realm `directAccessGrantsEnabled: true` (Resource Owner Password Grant); `bruteForceProtected` und `passwordPolicy` sind nicht gesetzt; Redirect-URIs enthalten `http://localhost:8080/*`. | `k8s/keycloak.yaml`; genutzt von `api-tests/httpyac/00-auth.http` | Passwort-Raten direkt gegen den Token-Endpunkt ohne Sperre. | ROPC nur im Dev-Realm; Brute-Force-Schutz, Passwort-Policy; `localhost`-Redirects nur lokal | P1 |
| SEC-09 | OIDC-Client-Secret `indooro-admin-secret` steht im Repo (K8s-Secret und `application.properties:43` als Default). | s. o. | Mit bekanntem Client-Secret lässt sich der vertrauliche Client imitieren (z. B. Token-Austausch, ROPC). | Secret rotieren; kein Default im `prod`-Profil (bereits in `protect-legacy-write-endpoints`) | P1 |
| SEC-10 | Audit-Trail ohne Akteur: `AuditLogService.log` setzt immer `actorRole="SYSTEM"`, `actorLabel="system"`; Layout-Versionen `createdByRole="SYSTEM"`; Rezepte `createdByRole="admin"`. Rezept-Tag-Mutationen (`createTag`, `updateTag`, `archiveTag`) sowie Produkt- und Kategorie-Mutationen (OpenSearch) erzeugen **gar keinen** Audit-Eintrag. | `AuditLogService.java:35-36`, `StoreLayoutAdminService.java:96-97`, `RecipeService.java:119-120` | Missbrauch (z. B. über SEC-01/02) ist nicht zurechenbar; verletzt den Zweck von „audit logs for traceability“ (Spec `domain-model`). | `CurrentAdminUser` (Subject, Username, Rolle) in `log()` übernehmen | P1 |

### 2.2 Autorisierung & Angriffsfläche

| ID | Befund | Beleg | Stufe |
| --- | --- | --- | --- |
| **SEC-06** | Bereits erfasst (AUD-20/21/22, Change `protect-legacy-write-endpoints`): anonymes `POST /api/layout/current`, anonyme PDF-Routen, Index-Löschung ohne `admin`-Rolle. Zusätzlich verifiziert: `AdminResource` baut Fehler-JSON per String-Konkatenation mit `e.getMessage()` (`AdminResource.java:35,53`). | `application.properties:51,56`, `LayoutResource.java:43`, `ImportResource.java`, `ExportResource.java`, `AdminResource.java` | **P0** |
| **SEC-05** | `POST /api/export/pdf` ist anonym, akzeptiert eine unbegrenzte Produktliste und nutzt den Regalboden aus `layoutCode` als Schleifengrenze: `for (int level = maxLevel; level >= 1; level--)` mit Filter über alle Produkte je Iteration. Ein einzelnes Produkt mit `layoutCode: "1/1/2000000000/1"` erzeugt ~2·10⁹ Iterationen mit PDF-Zeichenoperationen. Zeichen außerhalb WinAnsi (z. B. Emoji im Namen) werfen `IllegalArgumentException` → 500. | `PdfExportService.java:139`, `:213-221`, `ExportResource.java:25` | **P0** |
| SEC-11 | `POST /api/convert/pdf-to-json`: keine Größen-/Seitenbegrenzung, PDFBox 3.0.1 (aktuell 3.0.8), Regex `ITEM_ANYWHERE` mit `DOTALL` und lazy `.+?` über den gesamten extrahierten Text (quadratisches Worst-Case-Verhalten), `Integer.parseInt` auf beliebig lange Ziffernfolgen. | `PdfImportService.java:37-38,118-123` | P1 (P0 solange anonym) |
| SEC-12 | Upsell-Endpunkte sind anonym, ohne Rate-Limit, lösen OpenAI-Kosten aus (AUD-31). Zusätzlich: `UpsellPlanRequest.opportunities` ist **nicht** mit `@Valid` annotiert → `@NotBlank`/`@Size` der verschachtelten `UpsellOpportunityRequest` werden nicht geprüft; `currentListProductIds`/`completedProductIds` sind unbegrenzt. Nutzereingaben (`triggerProductNames`) fließen in den LLM-Prompt (Prompt-Injection; Ausgabe wird aber auf Kandidaten-IDs und 180 Zeichen begrenzt, Cache-Key enthält die Namen → keine Fremd-Vergiftung). | `UpsellDtos.java:61-77`, `MobileUpsellResource.java`, `UpsellSuggestionService.java:1736ff` | P1 |
| SEC-13 | `POST /api/mobile/upsell/events` schreibt anonym beliebig viele Zeilen (`metadataJson` bis 4 000 Zeichen, `eventType` frei) ohne Retention. | `UpsellSuggestionService.java:516-531` | P1 |
| SEC-14 | Store-Manager dürfen ihren Store **archivieren** und die **Identität** (UUID/Major/Minor) zugewiesener Beacons ändern. Ob das fachlich gewollt ist, lässt die Spec offen („only if the existing domain validation rules allow“). | `StoreAdminService.java:145-146`, `BeaconAdminService.java:97-101` | P2 (Fachentscheidung) |

### 2.3 Cross-Site Scripting & Frontend-Sicherheit

| ID | Befund | Beleg | Stufe |
| --- | --- | --- | --- |
| **SEC-02** | **Stored XSS im Layout-Editor.** `editor.js` schreibt `el.label` und `el.beaconId` ungefiltert per `innerHTML` (`:789`, `:880`), ebenso Store-Name und Beacon-Code/-Identität (`:279`, `:286-287`). Quelle ist das geladene Layout-JSON: im Legacy-Modus `GET /api/layout/current` (anonym beschreibbar, SEC-06), im Store-Modus die Layout-Version eines Store-Managers. **Kette:** anonymer `POST /api/layout/current` mit `"label":"<img src=x onerror=…>"` → Admin öffnet `/admin/editor/` → Script läuft im Admin-Origin mit Session-Cookie → beliebige Admin-API-Aufrufe (Produkte löschen, Stores archivieren, Error-Logs mit Stacktraces lesen). Zusätzlich Privilegieneskalation Store-Manager → Admin über Store-Layouts. | `admin/editor.js`, `LayoutResource.java:43` | **P0** |
| SEC-15 | XSS in der öffentlichen Kunden-Seite: `el.beaconId`, `el.label` (`customer/app.js:126,161`) und `product.name` (`:235`) ungefiltert in `innerHTML`. Quelle wie SEC-02. | `customer/app.js` | P1 |
| SEC-16 | Kunden-Seite lädt `https://cdn.tailwindcss.com` (Play-CDN, laut Anbieter nicht für Produktion) ohne Subresource Integrity; auch `app/uploadPdf`. | `customer/index.html:7` | P1 |
| SEC-17 | Keine Security-Header (CSP, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, HSTS) – weder in Quarkus (`quarkus.http.header.*`) noch im Ingress. Eine CSP würde SEC-02/15 entschärfen. | `application.properties`, `k8s/*-ingress.yaml` | P1 |
| SEC-18 | CORS `origins=*` mit `authorization`-Header (AUD-30). Credentials werden bei Wildcard nicht freigegeben, CSRF über JSON ist daher derzeit blockiert – **zu verifizieren** am Live-System (Preflight-Antwort, `SameSite` des OIDC-Cookies). Eine explizite CSRF-Absicherung für Cookie-Sessions fehlt. | `application.properties:31-34` | P1 |
| SEC-19 | Admin-UI interpoliert `storeId` aus der Query unkodiert in API-Pfade (`app.js` `renderStoreDetail`: `${API.stores}/${storeId}`) – nur Same-Origin-GET-Pfadmanipulation. | `app.js:255-258` | P2 |

### 2.4 Informationsabfluss & Logging

| ID | Befund | Beleg | Stufe |
| --- | --- | --- | --- |
| SEC-07 | Globale Exception-Mapper protokollieren **jede** `WebApplicationException` inkl. 400/401/404 aus öffentlichen Mobile-Routen mit vollem Stacktrace (bis 12 KB + 8 KB Nachricht) in `error_logs`. Keine Retention, kein Sampling. Anonyme Angreifer können die Tabelle beliebig füllen (Disk-DoS auf 2-Gi-PVC). | `ApiWebApplicationExceptionMapper.java:42`, `ErrorLogService.java` | P1 |
| SEC-20 | `ApiThrowableExceptionMapper` gibt `exception.getMessage()` unverändert an Clients zurück (z. B. Hibernate-/Constraint-/Parser-Meldungen) und protokolliert ohne `try/catch` – fällt die DB aus, wirft der Mapper selbst. | `ApiThrowableExceptionMapper.java:36-40` | P1 |
| SEC-21 | `POST /api/mobile/upsell/plan` liefert an anonyme Clients ein `debug`-Objekt (Modellname, Token-Verbrauch, Latenzen, Fallback-Gründe). | `UpsellDtos.UpsellPlanDebug` | P2 |
| SEC-22 | Log-Injection/PII-Risiko: Suchbegriffe werden ungefiltert auf INFO geloggt (`ProductResource.java:50`); OpenAI-Antworten werden bis 1 200 Zeichen geloggt; iOS loggt Request-/Response-Bodies per `print` in Release-Builds (AUD-19). | s. o. | P2 |
| SEC-23 | `quarkus.log.category."com.indoor.navigation".level=DEBUG` betrifft kein existierendes Paket (Code liegt in `at.htl`). | `application.properties:69` | P2 |

### 2.5 Infrastruktur & Secrets

| ID | Befund | Beleg | Stufe |
| --- | --- | --- | --- |
| **SEC-04** | OpenSearch mit `plugins.security.disabled=true` und Dashboards ohne Security laufen als **NodePort**-Services. Wer einen Cluster-Knoten erreicht, kann Indizes lesen/löschen. **Zu verifizieren**, ob LeoCloud NodePorts nach außen freigibt. | `k8s/opensearch.yaml` | **P0** |
| SEC-24 | DB-Passwort `indooro` im Klartext in zwei Manifesten; Backend-Service ebenfalls NodePort; keine `NetworkPolicy`; Container laufen als root (`eclipse-temurin:25-jdk`, kein `securityContext`); `:latest` mit `imagePullPolicy: Always` ohne Digest. | `k8s/backend.yaml`, `k8s/postgres.yaml`, `Dockerfile` | P1 |
| SEC-25 | Veraltete Komponenten mit öffentlich dokumentierten Sicherheitskorrekturen in Nachfolgeversionen: Quarkus 3.6.0 (EOL), Keycloak 24.0.5, OpenSearch 2.9.0, PDFBox 3.0.1. Kein Dependency- oder Image-Scan in CI. | `pom.xml`, `k8s/*.yaml` | P1 |
| SEC-26 | iOS: `NSAllowsArbitraryLoads = true` (AUD-29), obwohl alle Aufrufe HTTPS sind. | `Info.plist:22` | P1 |

**Positiv:** Kein OpenAI-Key im Repo oder in der Git-Historie (Suche nach `sk-…`, AWS-, GitHub-Token- und Private-Key-Mustern ohne Treffer); `.env`-Dateien korrekt ignoriert; Bean Validation auf allen Admin-DTOs; parametrisierte HQL-Queries (keine SQL-Injection gefunden); iOS benötigt keine Tokens (kein Keychain-Bedarf); Admin-UI escaped in `app.js` konsequent.

---

## 3. API Integrity & Contract Mismatches

### 3.1 Swift ⇄ Backend

Die Befunde **C1–C10** aus [docs/specs/AUDIT.md §2](../specs/AUDIT.md) wurden stichprobenartig erneut verifiziert (C1: `UpsellSuggestionStore.swift:767` sendet `24 * 60`, DTO erlaubt `@Max(30)`; C5: `Product.swift` mit non-optionalem `price`/`layoutCode`; C10: 4 hartkodierte Base-URLs). Sie werden hier als API-01…API-10 geführt; der Change `fix-ios-contract-and-spec-drift` deckt sie ab.

| ID | Kurzfassung | Stufe |
| --- | --- | --- |
| API-01 (C1) | Dismiss sendet 1 440 Minuten, Backend erlaubt max. 30 → jede Anfrage HTTP 400 | **P0** (funktional) |
| API-02 (C2) | `MobileStoreSummary`: Backend `address`, Swift erwartet `street/zipCode/country` | P1 |
| API-03 (C3) | `MobileLayoutResponse.source/fallback` ignoriert | P1 |
| API-04 (C4) | Produktsuche ohne `storeId/storeCode` | P1 |
| API-05 (C5) | Ein Produkt ohne Preis/Layout-Code leert die gesamte Ergebnisliste | P1 |
| API-06 (C6) | ISO-8601 ohne Bruchteilsekunden im Upsell-Decoder – zu verifizieren | P1 |
| API-07 (C7) | `/upsell/suggestions` ohne Client | P2 |
| API-08 (C8) | Legacy-Layout-Historie ohne erreichbare UI | P2 |
| API-09 (C9) | HTTP-Status wird in `RecipeStore`/`ProductSearchStore` nicht geprüft | P1 |
| API-10 (C10) | Base-URL 4× hartkodiert | P1 |

**Neu in diesem Audit:**

| ID | Befund | Beleg | Stufe |
| --- | --- | --- | --- |
| API-13 | Produktsuche kodiert den Suchbegriff mit `.urlQueryAllowed`; `&`, `=` und `+` bleiben unkodiert. „Salz & Pfeffer“ wird zu `q=Salz%20` plus Parameter `%20Pfeffer`; `+` wird serverseitig als Leerzeichen gelesen. | `ProductSearchStore.swift:27` | P1 |
| API-14 | `GET /api/products` filtert `null`-Quellen nicht heraus (anders als `/search`) → JSON-Array kann `null` enthalten, was das Swift-Array-Decoding komplett scheitern lässt. | `OpenSearchService.java:134-136` | P1 |

### 3.2 Admin-Frontend ⇄ Backend

| ID | Befund | Beleg | Stufe |
| --- | --- | --- | --- |
| API-11 | Logout-Button navigiert zu `/logout`; Quarkus OIDC ist auf `quarkus.oidc.logout.path=/admin/logout` konfiguriert. `/logout` existiert nicht → Session bleibt aktiv. Verletzt Spec `admin-authentication` › „Logout ends admin session“. | `app.js:93`, `application.properties:48` | P1 |
| API-12 | Listen-Aufrufe ohne Paging-Parameter: `GET /api/admin/recipes` und `GET /api/stores` liefern Default `size=20`; das UI paginiert und filtert nur diese erste Seite. Seed enthält 26 Rezepte (V7 + V8) → 6 Rezepte sind in der Admin-Liste unsichtbar; Dashboard-Kennzahlen („Stores“, „Layouts offen“) zählen maximal 20. | `core.js:26`, `app.js:125-131,197-206,420-424`, `AdminApiSupport.normalizeSize` | P1 |
| API-15 | Produktliste fordert `size=1000` an (Backend-Maximum 1 000), Kategorien `size=1000` (Backend-Maximum **500**) → stille Abschneidung ohne Hinweis. | `core.js:21,24`, `CategoryService.java:57-62` | P1 |
| API-16 | `readinessForProduct` prüft `layoutCode` gegen `/^[A-Za-z0-9_.:-]{2,80}$/` – ohne `/`. **Jeder** gültige Code im dokumentierten Format `310/1/1/1` wird als „Layout-Code ist unklar“ markiert und im Readiness-Filter falsch einsortiert. Unit-/Smoke-Tests verwenden `A-01` und verdecken den Fehler. | `core.js:118`, `admin-core.test.mjs:53`, `serve-admin-smoke.mjs` | P1 |
| API-17 | Layout-Versionsliste im Store-Detail prüft `layout.active`; das Backend liefert `status: "ACTIVE"`. Aktive Versionen werden nie als „Aktiv“ angezeigt. | `app.js:1397`, `LayoutDtos.LayoutVersionSummary` | P1 |
| API-18 | Store-Liste wendet Region- und Layout-Filter **nach** der Pagination an → leere Seiten, falsche Zählung „x Einträge“. | `app.js:224-226` | P1 |
| API-19 | `recipeReadiness` erwartet `stepCount`, die Summary-DTO liefert keinen → fehlende Schritte werden in der Liste nie gewarnt. | `core.js:197`, `RecipeDtos.RecipeSummaryResponse` | P2 |
| API-20 | Produkt-Import nutzt die Legacy-Route `POST /api/products/bulk` statt `/api/admin/products`; zwei Schreibpfade mit unterschiedlicher Validierung (Legacy normalisiert keine Namen). | `core.js:23`, `ProductResource.java:127` | P2 |
| API-21 | Fehlerformat uneinheitlich: Admin-Mapper liefert `{status,error,…}`; Legacy-Ressourcen liefern handgebautes `{"error": "…"}`, `text/plain` (`ImportResource`, `ExportResource`) oder String-JSON mit unescaped Messages. | diverse | P2 |
| API-22 | Playwright-Mock weicht vom echten Vertrag ab (`stores.items` statt `content`, `layoutCode: "A-01"`, `user.role` ohne `subject`). Tests sind grün, obwohl API-12/16/17 im echten Betrieb auftreten. | `scripts/serve-admin-smoke.mjs` | P1 |

### 3.3 Kunden-Web ⇄ Backend

| ID | Befund | Beleg | Stufe |
| --- | --- | --- | --- |
| API-23 | Suchergebnisse und Karten-Hervorhebung lesen `product.categoryCode` und `product.layout.meter` – das Produktmodell hat keines dieser Felder (Kategorie und Meter stecken im `layoutCode`). Folge: Anzeige „Kategorie undefined“ und **jede** Produkt-Hervorhebung endet mit dem `alert` „… nicht auf der Karte gefunden“. Die Kernfunktion der Kunden-Seite ist damit defekt. | `customer/app.js:227,255-262` | P1 |
| API-24 | `Number(product.price).toFixed(2)` bei `price = null` → „€NaN“. | `customer/app.js:236` | P2 |

### 3.4 Dokumentation/Spec ⇄ Code

| ID | Befund | Beleg | Stufe |
| --- | --- | --- | --- |
| API-25 | `openspec/config.yaml` nannte das Rollout-Kommando `deployment/indooro-backend-v2`; tatsächlich heißt das Deployment `indooro-backend` (nur das Image heißt `…-v2`). **In diesem Audit korrigiert.** | `config.yaml`, `k8s/backend.yaml` | P2 |
| API-26 | `docker-compose.yml` enthält kein PostgreSQL, obwohl das Backend es zwingend braucht; Keycloak lokal 26.2, remote 24.0.5. | `docker-compose.yml`, `k8s/keycloak.yaml` | P2 |
| API-27 | Kein maschinenlesbarer Vertrag im Repo; `quarkus-smallrye-openapi` ist eingebunden, der Output wird aber weder versioniert noch geprüft. Mit diesem Audit liegt erstmals `openspec/specs/shared-api/openapi.yaml` vor. | `pom.xml` | P2 |

---

## 4. Performance Bottlenecks

### 4.1 Swift (Main Thread & Algorithmen)

| ID | Befund | Beleg | Stufe |
| --- | --- | --- | --- |
| PERF-10 | CoreMotion liefert mit 20 Hz auf `.main`; im Callback laufen Pose-Prädiktion und Map-Matching. | `BeaconManager.swift:1040-1041` | P1 |
| PERF-11 | `ContentView` ruft `syncShoppingSession()` bei **jeder** Änderung von `userPosition` **und** `rawUserPosition`; `MultiStopRoutePlanner.order` baut dabei den kompletten Raster-Graphen neu (`IndoorGraphBuilder.fromLayout`) und führt pro Vergleich A*-Suchen aus. | `ContentView.swift:116-123`, `ShoppingListManager.swift:234-303` | P1 |
| PERF-12 | A* wählt den nächsten Knoten per `openSet.min(by:)` → O(V) je Schritt, O(V²) gesamt. | `IndoorGraph.swift:245` | P1 |
| PERF-13 | `BeaconManager` ist ein einziges `ObservableObject` mit vielen `@Published`-Properties; jede Positionsänderung invalidiert alle Views, die den Manager beobachten (5 Tabs). | `BeaconManager.swift:118-160` | P1 |
| PERF-14 | Alle Einkaufslisten werden bei jeder Mutation komplett JSON-kodiert und synchron in `UserDefaults` geschrieben. | `ShoppingListManager.swift:971-977` | P2 |
| PERF-15 | Kategorie-Browse lädt `GET /api/products?size=500` und filtert clientseitig (AUD-24). | `ShoppingFeatureViews.swift` | P2 |

### 4.2 Admin-Frontend (Re-Renders & Bundle)

| ID | Befund | Beleg | Stufe |
| --- | --- | --- | --- |
| PERF-20 | Jede Tastatureingabe im Suchfeld rendert die gesamte Seite per `innerHTML` neu (inkl. aller Zeilen), ohne Debounce; dadurch verliert das Eingabefeld zudem Fokus und Cursorposition. | `hydrateFilters` in `app.js:1269-1277` | P1 |
| PERF-21 | `actionRegistry` (Map mit Closures) wird bei jedem Render erweitert und nie geleert → Speicherleck bei längerer Nutzung; IDs per `Math.random()`. | `app.js:1253-1267` | P2 |
| PERF-22 | Seitenwechsel (`data-page`) triggert `renderRoute()` und damit **neue API-Aufrufe** statt nur neu zu paginieren. | `app.js:1295-1301` | P2 |
| PERF-23 | Produktseite lädt bis zu 1 000 Produkte vollständig in den Browser; Filter/Sortierung laufen je Tastendruck über alle. | `core.js:21` | P2 |
| PERF-24 | Kein Minifying/Bundling, Cache-Busting per manueller Query-Version; `editor.js` (61 KB) und `app.js` (68 KB) werden ungekürzt ausgeliefert; Quarkus liefert statische Dateien ohne explizite Cache-Header-Konfiguration. | `admin/*.html` | P2 |

### 4.3 Backend (N+1, Transaktionen, externe Aufrufe)

| ID | Befund | Beleg | Aufwand pro Request | Stufe |
| --- | --- | --- | --- | --- |
| **PERF-01** | `@Transactional` auf `UpsellSuggestionService.plan()` und `suggestions()` umschließt den synchronen OpenAI-Aufruf (Timeout 12 s in LeoCloud). Eine JDBC-Verbindung bleibt so lange belegt. Standard-Pool: 20 Verbindungen → 20 parallele anonyme Plan-Anfragen blockieren **alle** Admin- und Mobile-Endpunkte. | `UpsellSuggestionService.java:110,170`, `k8s/backend.yaml` (`OPENAI_UPSELL_TIMEOUT_MS=12000`) | 1 Verbindung × ≤ 12 s | **P0** |
| PERF-02 | Öffentliche Rezeptliste `GET /api/mobile/recipes`: je Rezept Lazy-Load von Zutaten und Tags; je Zutat `listActiveByIngredient` (1 Query) und je Mapping `openSearchService.getProductById` (1 HTTP-Aufruf) – nur um `mappedIngredientCount` zu berechnen, für das ein DB-Count genügt. | `RecipeService.java:411,657`, `:589-613` | 20 Rezepte × ~8 Zutaten ≈ 180 SQL + ~160 OpenSearch-GETs | P1 |
| PERF-03 | Upsell-Plan löst jede Trigger-Produkt-ID einzeln per OpenSearch-GET auf (`rankingInput` → `resolveTriggerProduct`); erlaubt sind 80 Opportunities × 20 IDs (Validierung greift wegen fehlendem `@Valid` nicht einmal). | `UpsellSuggestionService.java:739`, `UpsellDtos.java:68-75` | bis 1 600 OpenSearch-GETs | P1 |
| PERF-04 | Upsell-Kandidaten = erste 150 Dokumente eines `match_all` ohne Sortierung → bei > 150 Produkten willkürliche Auswahl (Qualitäts- **und** Effizienzproblem); bei Store-Filter mit wenig Treffern zweiter Voll-Scan. | `OpenSearchService.java:139-173`, `UpsellSuggestionService.java:569-591` | 1–2 Suchen à 150 Docs | P1 |
| PERF-05 | `StoreAdminService.listStores`: je Store `countActiveByStore` + `findActiveByStoreId` + Lazy-Load der Region; `size` ohne Obergrenze im Service (Resource begrenzt auf 100). | `StoreAdminService.java:216-217` | 2N + Regionen | P1 |
| PERF-06 | `BeaconAdminService.listBeacons`: lädt **alle** Beacons und **alle** aktiven Assignments, dann je Beacon `storeRepository.findByIdOptional` + `canSeeBeaconStore` → `currentUser()` (DB) + `requireStore` (DB). Keine Pagination. | `BeaconAdminService.java:47-60,236-242` | ~3N Queries | P1 |
| PERF-07 | `AdminAccessService.currentUser()` lädt die Zuweisung bei **jedem** Aufruf neu; viele Service-Methoden rufen es 2–4× pro Request (`effectiveRegionFilter` + `effectiveStoreFilter` + `requireStoreAccess` …). | `AdminAccessService.java:30-51` | 2–4 zusätzliche Queries | P1 |
| PERF-08 | `LayoutService.ensureLayoutIndex()` versucht bei **jedem** Lesezugriff `indices().create(...)` und fängt die Fehlermeldung ab; `CategoryService.ensureSeeded()` macht bei jedem GET `exists` + `count`. | `LayoutService.java:42,58,73,123-130`, `CategoryService.java:26,31,41-55` | +1 bis +2 OpenSearch-Roundtrips | P1 |
| PERF-09 | `GET /api/layout/history`: Suche mit `size = max(limit*3, 20)` über `match_all`, Filter und Sortierung im Java-Code nach String-Zeitstempel; `limit` unbegrenzt → `limit=10000` erzeugt eine 30 000er-Suche (OpenSearch-Fehler > `max_result_window`). Außerdem liefert die Abfrage bei mehr Dokumenten als `size` nicht zwingend die neuesten Versionen. | `LayoutService.java:72-95` | – | P1 |
| PERF-25 | `GET /api/products?size=` ohne Obergrenze im Legacy-Pfad (Admin-Pfad begrenzt auf 1 000); `size` negativ → OpenSearch-Fehler → 500. | `ProductResource.java:65`, `OpenSearchService.java:123-137` | – | P2 |
| PERF-26 | Default-Layout wird bei jeder Anfrage ohne aktives Layout vom Classpath gelesen und geparst – dreifach dupliziert. | `LayoutService.java:132`, `StoreLayoutAdminService.java:187`, `MobileStoreService.java:174` | Datei-I/O + Parse | P2 |
| PERF-27 | Pro OpenAI-Aufruf ein neuer `HttpClient` (eigener Selector-Thread, kein Connection-Reuse). | `UpsellSuggestionService.java:1500,1547` | TLS-Handshake je Anfrage | P2 |
| PERF-28 | `OpenSearchClient` wird als `@Dependent` produziert, ohne Disposer – jede Injektion erzeugt einen eigenen `RestClient` mit Connection-Pool, der nie geschlossen wird. | `OpenSearchClientConfig.java:22-35` | Ressourcen-Leck bei Hot-Reload | P2 |
| PERF-29 | Mobile-Layout-Antworten (bis mehrere 100 KB JSONB) ohne `ETag`/`Cache-Control`; iOS lädt bei jedem Store-Wechsel neu. | `MobileStoreResource.java:44-48` | volle Übertragung | P2 |

### 4.4 Datenbank-Indizes & Wachstum

| ID | Befund | Beleg | Stufe |
| --- | --- | --- | --- |
| PERF-30 | Suchen mit `lower(code)`, `lower(storeCode)`, `lower(beaconCode)`, `lower(slug)` – nur `idx_recipe_tags_status_name` und Rezepttitel haben funktionale Indizes; die Unique-Constraints sind case-sensitiv, die Anwendung prüft case-insensitiv (Race → DB akzeptiert „ABC“ und „abc“ parallel). | Repositories, V1/V7 | P2 |
| PERF-31 | Rezept-Freitextsuche `lower(description) like '%q%'` über TEXT-Spalten ohne Trigram-/Volltextindex. | `RecipeService.java:396` | P2 |
| PERF-32 | `audit_logs` und `error_logs` werden nach `created_at` sortiert gelesen; `audit_logs` hat nur einen zusammengesetzten Index `(entity_type, entity_id, created_at)` → globale „letzte Events“ = Seq-Scan + Sort. | `AuditLogRepository.listRecent`, V1 | P2 |
| PERF-33 | Unbegrenztes Wachstum: `layout_versions` (jede Speicherung eine volle JSONB-Kopie), `upsell_suggestion_cache` (abgelaufene Einträge bleiben), `upsell_events`, `upsell_dismissals`, `error_logs`, `audit_logs` (je Mutation vollständige `before/after`-Snapshots); OpenSearch-Index `layouts` wächst mit jeder anonymen Speicherung und hat dynamisches Mapping (Mapping-Explosion möglich). | Migrationen, `LayoutService.saveCurrentLayout` | P1 |

---

## 5. Korrektheit & weitere Code Smells

| ID | Befund | Beleg | Stufe |
| --- | --- | --- | --- |
| BUG-01 | Upsell-Dismissals sind wirkungslos: `upsell_dismissals.suppressed_until` wird geschrieben, aber an keiner Stelle gelesen (Kandidatenfilter ignoriert es). | `UpsellSuggestionService.java:533-554`, Grep `suppressedUntil` | P1 |
| BUG-02 | `UpsellDismissalRepository.findMatching` vergleicht nullable Spalten mit `= ?` → bei `suggestedProductId`/`storeId`/`sessionHash = null` nie ein Treffer → jede Dismissal erzeugt eine neue Zeile, `dismissal_count` bleibt 1. | `UpsellDismissalRepository.java:13-27` | P1 |
| BUG-03 | Nicht-atomare Versionsnummer: `nextVersionNo` = `max+1` ohne Sperre; zwei parallele Speicherungen verletzen `uk_layout_version_store_no` → 500 statt 409. Gleiches Muster bei Aktivierung (partieller Unique-Index) und bei allen „check-then-insert“-Duplikatprüfungen (Region-/Store-/Beacon-Codes, Slugs, Positionen). | `LayoutVersionRepository.java`, Services | P1 |
| BUG-04 | `LayoutService.saveCurrentLayout` schreibt Versions- und Current-Dokument in zwei getrennten Aufrufen – Teilzustand bei Fehler. | `LayoutService.java:107-117` | P2 |
| BUG-05 | `confirmMutation` und die Submit-Handler der Region-, Store-, Beacon-, Zuweisungs-, Produkt-, Kategorie- und Rezept-Drawer behandeln Fehler nicht: schlägt der API-Aufruf fehl, bleibt der Drawer/Dialog offen, es erscheint kein Toast, die Promise-Rejection ist unbehandelt; Doppelklick löst Mutationen doppelt aus. Nur der Import-Drawer fängt Fehler ab. | `app.js:1317-1335`, `:485-700`, `:775-810` | P1 |
| BUG-06 | `RecipeService.applyTagRequest` nutzt `RecordStatus.valueOf` ohne Fehlerbehandlung → ungültiger Status ergibt 500 statt 400. | `RecipeService.java:505-511` | P2 |
| BUG-07 | `normalizeSlug` kann einen leeren String liefern (z. B. Slug „!!!“) → Konflikt/Constraint-Fehler statt Validierungsmeldung. | `RecipeService.java:820-822` | P2 |
| BUG-08 | iBeacon-Major/Minor sind `UInt16`; weder DTO noch DB begrenzen auf 0…65 535 → nie auffindbare Beacons möglich. Admin-UI prüft nur `< 0`. | `BeaconDtos.java`, V1, `core.js:151-152` | P1 |
| BUG-09 | `MobileStoreService.resolveBeacon`: wird eine exakte UUID/Major/Minor-Kombination nicht gefunden, fällt die Suche auf UUID-only zurück und liefert ggf. einen **anderen** Beacon/Store. | `MobileStoreService.java:117-131` | P1 |
| BUG-10 | Seitenzahl-Überlauf: `page=Integer.MAX_VALUE` → `page*size` überläuft → Hibernate-Fehler → 500 (öffentliche Rezept-Route). | `MobileRecipeResource.java:63-65` | P2 |
| BUG-11 | `OpenSearchService.createIndex()`/`deleteIndex()` schlucken alle Fehler und melden Erfolg (AUD-35). | `OpenSearchService.java:245-277` | P1 |
| BUG-12 | `ProductResource` und `AdminResource` bauen JSON per String-Konkatenation mit Exception-Texten → ungültiges JSON bei Anführungszeichen. | `ProductResource.java:44,55,72,96,114,118,140,144` | P2 |
| BUG-13 | **Datenverlust beim Bearbeiten von Rezepten.** Die Liste übergibt die Summary-DTO (ohne `description`, `imageAlt`, Zutaten, Schritte) an den Drawer; der Speichern-Handler sendet `description` leer bzw. `null`, **kein** `imageUrl`/`imageAlt` und `tagIds: []`. `applyRecipeRequest` übernimmt die `null`-Werte, `assignTags` leert die Tag-Zuordnungen immer (auch bei `tagIds = null`). Jede Bearbeitung eines der 26 Seed-Rezepte entfernt Bild, Beschreibung und Tags. | `app.js:446,775-795`, `RecipeService.java:428-430,488-493` | **P0** |
| BUG-14 | Beim Bearbeiten werden Zutaten- und Schrittänderungen verworfen (nur `PUT` der Metadaten), die Validierung verlangt aber trotzdem mindestens eine Zutat mit Produkt und einen Schritt – der Drawer zeigt für bestehende Rezepte leere Zeilen. | `app.js:771-797` | P1 |
| BUG-15 | Beacon-Bulk-Drawer wandelt ein leeres Major-Feld per `Number("")` in `0` um; der Produkt-Drawer schlägt als Layout-Code-Beispiel `A-01` statt des dokumentierten Formats `310/1/1/1` vor. | `app.js:586`, `:620` | P2 |
| BUG-16 | Region- und Store-Drawer besitzen kein `data-error-summary`-Element: `showErrors` blockiert das Speichern, zeigt aber keine Meldung – der Nutzer klickt „Speichern“ und nichts passiert. | `app.js:1341-1346`, `:504-536` | P1 |
| SMELL-01 | God Classes: `UpsellSuggestionService` (2 231 LOC, deterministisches Klassifikationsregelwerk, Prompt-Bau, HTTP, Cache, Events), `BeaconManager.swift` (2 735), `admin/app.js` (1 488), `admin/editor.js` (1 824), `ShoppingFeatureViews.swift` (1 770). | – | P2 |
| SMELL-02 | Paketstruktur spiegelt Verantwortung nicht: öffentliche Mobile-Services und globale Exception-Mapper liegen unter `admin`; Legacy-Paket `at.htl.DTO` in Großbuchstaben; Maven-Koordinaten `com.indoor.navigation:opensearch-api`. | – | P2 |
| SMELL-03 | Hartkodierte Produktdomäne im Code: Kategorie-Codes (Swift), Produktfamilien- und Synonymregeln (Upsell-Enums), OpenAI-URL, Default-Layout. | – | P2 |
| SMELL-04 | Deutsch/Englisch-Mix und ASCII-Umschreibungen in Fehlermeldungen („ungueltig“, „Loeschen“); keine i18n im Admin. | – | P2 |

---

## 6. Abdeckung durch bestehende OpenSpec-Changes

| Befund(e) | Abgedeckt durch | Lücke |
| --- | --- | --- |
| SEC-06, SEC-09, SEC-18 (teilw.), SEC-11 (teilw.) | `protect-legacy-write-endpoints` | SEC-05 (Schleifengrenze), PDF-Seitenlimit |
| API-01…API-10, AUD-08…13 | `fix-ios-contract-and-spec-drift` | API-13, API-14 |
| PERF-10…15, SEC-26, DC-01…08 | `modernize-ios-client-architecture` | – |
| SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-07, SEC-10, SEC-12/13, SEC-15/16/17/20/21, SEC-24 | **neu:** `harden-platform-security-baseline` | – |
| API-11, API-12, API-15…API-19, API-22, API-23, BUG-05, BUG-13…16, PERF-20…22 | **neu:** `fix-admin-dashboard-contract-drift` | – |
| PERF-01…09, PERF-25…33, BUG-01/02/03/08/09/11 | **neu:** `optimize-backend-data-access` | – |
| API-20, API-21, API-27, Versionierung, Codegen | **neu:** `establish-shared-api-contract` | – |
| DC-09…25, SMELL-01…04 | Blueprint Phase „Code Quality“ | kein eigener Change (Aufräumarbeiten) |
