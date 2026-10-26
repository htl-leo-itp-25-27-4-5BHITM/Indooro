# Sprint-Review: Store-Onboarding, Bereitschaftsprüfung, marktbezogene Suche

Stand: 2026-10-26. Geprüft: `origin/main` = `e93ebdc` (Worktree `review/sprint-review`), Live-System https://it220209.cloud.htl-leonding.ac.at.
Reine Analyse: kein Anwendungscode geändert, keine Live-Daten geändert, kein Deploy.

User Story: *Als Betreiber eines Supermarkts möchte ich meinen Markt mit Sortiment, Regalen und Beacons ins System bringen und sehen, ob er startklar ist, damit Kunden darin Produkte finden und hinnavigiert werden.*

Pfadkürzel in diesem Bericht:

- `B/` = `backend/indooro_server/src/main/java/at/htl/`
- `BT/` = `backend/indooro_server/src/test/java/at/htl/`
- `UI/` = `admin-ui/src/`
- `CW/` = `backend/indooro_server/src/main/resources/META-INF/resources/customer/`
- `IOS/` = `swift/indooro-EinkaeuferFinal/indooroApp/`

## Wie geprüft wurde

| Quelle | Umfang | Grenzen |
|---|---|---|
| Code | Vier Haiku-Lese-Analysen (Backend, Admin-UI, OpenSpec und Status, Kundensuche und iOS). Kritische Aussagen hat die Hauptsession selbst im Code nachgelesen; sie sind unten mit Zeilennummern belegt. | – |
| Tests lokal | `StoreReadinessEvaluatorTest`, `StoreProductSourceTest`, `CoverageRuleTest`, `ShelfMatchingTest`, `StoreReadinessServiceProfileTest`: 74 Tests, 0 Fehler. | Keine Quarkus-Integrationstests gegen OpenSearch gestartet. |
| Lokaler Zwei-Markt-Test | Wegwerf-OpenSearch 2.9.0 mit dem Repo-Mapping `products-index.json`, zwei Märkte mit gleichem Produktnamen und Umlaut-Code (siehe Abschnitt „Lokaler Zwei-Markt-Test“). | Nachgebaute Filterabfrage, nicht der laufende Quarkus-Server. |
| Live, öffentlich | `curl` auf `/api/mobile/*` und `/api/products*` für alle vier Märkte, Smoke-Check `scripts/ops/smoke_check.sh`, Kunden-Web im Browser (Marktwahl, Suche, Umlaut-Markt, Netzwerk-Requests). | Nur GET-Anfragen. |
| Live, Admin | **Nicht live geprüft.** Im eingebauten Browser und in Chrome lag keine eingeloggte Sitzung vor; beide zeigten die Keycloak-Anmeldeseite. Es wurde nicht eingeloggt. | Aussagen zu Admin-Seiten stammen aus Code und Playwright-Tests (alle mit Mocks). |
| Image | `k8s/backend.yaml:30` = `6278040`. `git diff 6278040 e93ebdc` ändert nur Doku und `k8s/backend.yaml`; der Code auf `main` entspricht also dem Live-Image. | Live-Image nicht per `kubectl` geprüft (kein Versions-Endpunkt; `/q/info` liefert 404). Das Live-Verhalten passt aber zu #197. |

Hinweis zum Sprint: `docs/pilot-readiness/team/SPRINT_02.md:3` nennt den Zeitraum 02.11.–13.11.2026, nicht Planning 21.10. und Abnahme 04.11. Das Wort „startklar“ kommt im Repo nicht vor. Die Oberfläche zeigt „Bereit“, „Bereit mit Hinweisen“ und „Nicht bereit“ (`UI/readiness.ts:13-17`).

---

## A. Gesamturteil

| # | Kriterium | Urteil |
|---|---|---|
| 1 | Ein neuer Markt lässt sich ohne Entwickler anlegen und befüllen. | **TEILWEISE ERFÜLLT** |
| 2 | Die Bereitschaftsprüfung zeigt „startklar“ oder eine Liste mit konkreten Fehlern. | **TEILWEISE ERFÜLLT** |
| 3 | Die Suche findet nur Produkte des gewählten Markts. | **ERFÜLLT** für Kunden-Web und für die iOS-App mit gewähltem Markt. Ein Restrisiko bleibt bei Anfragen ohne Markt (P1). |

Kurzbegründung:

1. **Kriterium 1:** Mit der Rolle `admin` gehen Markt, Layout, Regale, Eingang, Beacons, CSV-Import und Suchindex komplett über die Oberfläche. Drei Dinge fehlen:
   - Ein neuer Betreiber bekommt Zugang nur über die Keycloak-Konsole **und** eine SQL-Zeile in `user_access_assignments`.
   - Ein `store-manager` darf weder einen Markt anlegen noch Produkte importieren.
   - Einzelne Produkte lassen sich live nicht speichern oder löschen (HTTP 409), solange die 153 Altdokumente im Index liegen.
2. **Kriterium 2:** Die Prüfung liefert bei echten Fehlern eine konkrete, deutschsprachige Liste. Sie hat aber eine Lücke, die den Sinn des Kriteriums trifft: Ein Markt **ohne Regale und ohne Produkte** wird grün und als „Bereit“ angezeigt. Ein Unit-Test schreibt das sogar als erwartet fest. Ein Markt ohne Produkte oder ganz ohne Beacons wird nur gelb, und Gelb heißt in der Oberfläche „Bereit mit Hinweisen“. Live gibt es noch keinen Markt, der grün ist.
3. **Kriterium 3:** Der Filter läuft serverseitig als `term` auf dem `keyword`-Feld `storeCode`. Kunden-Web und iOS senden den Markt mit, sobald er gewählt ist. Live bestätigt: Altdokumente ohne Markt tauchen in marktbezogenen Ergebnissen nicht auf. Die Umlaut-URL `Spar-Hörsching-001` wird korrekt kodiert. Ohne `storeCode` filtert der Server dagegen gar nicht und mischt alle Märkte. Das trifft die iOS-App, solange sie noch keinen Markt kennt.

## B. Akzeptanzkriterien-Matrix

| Kriterium | Status | Codebelege | Testbelege | Live-Belege | Was fehlt? |
|---|---|---|---|---|---|
| 1 Markt ohne Entwickler anlegen und befüllen | TEILWEISE | Markt anlegen: `UI/StoreCreatePage.tsx`, `POST /api/stores` (`B/resource/admin/StoreAdminResource.java:55-59`), nur `admin` und `region-manager` (`B/admin/service/AdminAccessService.java:166-174`). Layout-Editor mit Entwurf, Aktivieren und Versionen (`UI/EditorRoute.tsx:79-95`). Beacons (`UI/BeaconsPage.tsx:68-91`). CSV-Import mit Zeilenprüfung (`UI/catalogSheet.ts:7-10,193-220`, `UI/catalogCsvImport.ts:152-157`). Checkliste mit 7 Schritten (`UI/storeSetup.ts:131-136`). | Playwright `store-create.spec.ts`, `editor-route.spec.ts`, `beacons.spec.ts`, `products.spec.ts`, `store-setup.spec.ts`. **Alle mit `page.route`-Mocks**, kein echter Backend-Lauf. Backend: kein Test ruft `POST/PUT/PATCH /api/stores` auf. | Admin nicht live geprüft (Login). `/api/mobile/stores` listet 4 aktive Märkte. Testraum hat 74 eigene Produkte (`/api/products?storeCode=SPAR-Leonding-002`). | Zugangsvergabe ohne SQL. Klare Rolle „Betreiber“. Einzelprodukt-Korrektur trotz Altbestand (409). Ein End-to-End-Nachweis auf echtem Stack. |
| 2 Bereitschaft „startklar“ oder konkrete Fehler | TEILWEISE | 18 Befundcodes, davon 9 blockierend (`B/admin/readiness/StoreReadinessEvaluator.java:65-279`). Ampel `RED/YELLOW/GREEN` (`:310-312`). Kein Befund bei 0 Regalen oder 0 Produkten (`:105-142`). 0 Beacons ergeben nur eine Warnung (`:189`). Ohne eigene Produkte prüft der Code gegen den globalen Katalog (`B/admin/readiness/StoreProductSource.java:84-85`). Labels: `UI/readiness.ts:13-17`. | 74 Unit-Tests grün, sie prüfen Inhalte. `BT/admin/readiness/StoreReadinessEvaluatorTest.java:325` erwartet **GREEN für einen leeren Raum** (Eingang plus 9 Beacons, 0 Regale, 0 Produkte). `BT/resource/admin/StoreReadinessResourceTest.java:60-66` erwartet YELLOW bei 0 Beacons. | Laut `RELEASE_2026-10-18.md:44` Testraum rot: 4 blockierende Befunde, 2 Warnungen, 5/7 Schritte. Nicht selbst live geprüft (Login). | Blockierende Befunde für „keine Regale“, „keine eigenen Produkte“ und „keine Beacons“. Echte Beacon-Werte und ein Eingang im Testraum, damit live einmal grün zu sehen ist. |
| 3 Suche nur im gewählten Markt | ERFÜLLT (mit Restrisiko) | Filter `term storeCode` in `bool.filter` (`B/service/OpenSearchService.java:964-970`). Mapping `keyword` (`products-index.json:140-146`). Ohne Markt wird nicht gefiltert (`B/resource/ProductResource.java:249-257`). Kunden-Web sucht nur mit gewähltem Markt (`CW/app.js:328,337`, `CW/api.js:53-56`). iOS sendet `storeCode`, sobald ein Markt bekannt ist (`IOS/Managers/ProductSearchStore.swift:86`). | `OpenSearchStoreScopeTest` prüft nur die DSL gegen einen gemockten Client. `ProductStoreReadTest` und `ProductDefaultStoreTest` prüfen nur Argumente. `ProductWriteVisibilityIntegrationTest` wird ohne OpenSearch übersprungen (`:88-91`), und die CI startet kein OpenSearch (`.github/workflows/ci.yaml`, Job `backend-test`). Playwright `customer-finder.spec.mjs` prüft nur Request-Parameter. **Kein automatisierter Test mit zwei Märkten und gleichem Produktnamen.** | `q=milch` ohne Markt: 8 Treffer (6 ohne Markt, 2 Testraum). Mit `SPAR-Leonding-002`: 2 Treffer, beide eigene. Die drei anderen Märkte, ein unbekannter Code und ein klein geschriebener Code liefern jeweils `200 []`. Kunden-Web: Testraum zeigt 2 Treffer; `Spar-H%C3%B6rsching-001` zeigt „Nichts gefunden für ‚milch‘“, Request korrekt kodiert. `storeId` eines anderen Markts plus `storeCode`: 0 Treffer. | Ein dauerhafter Isolationstest gegen echtes OpenSearch. Fail-closed-Verhalten ohne `storeCode`. |

## C. Was bereits funktioniert und nicht mehr angefasst werden muss

- **Marktbezogener Index:** `storeCode` und `storeId` sind `keyword`, und der Filter steht im `bool.filter`. Das alte Problem mit `text`-Mapping und leerem Filter ist behoben. Live liefert der Testraum ausschließlich eigene Produkte, die 153 Altdokumente erscheinen dort nicht.
- **Kunden-Web (`/customer/`):**
  - Marktwahl per Liste oder `?store=`.
  - Ohne gewählten Markt wird nicht gesucht (`CW/app.js:328`).
  - Beim Marktwechsel werden laufende Anfragen abgebrochen und die Ergebnisse geleert (`CW/app.js:191-193,284-310`).
  - Umlaute werden über `URLSearchParams` korrekt kodiert (live geprüft).
  - Kein Such-Cache (`CW/api.js:18`).
- **CSV-Bulk-Import:**
  - Schreibt direkt in `opensearch.index` = `products_live` mit `refresh=wait_for`, laut Backend-Analyse (`B/service/OpenSearchService.java:40,76`). Neue Produkte sind also **ohne Reindex** sofort suchbar.
  - Doku-ID `<storeCode>:<id>`: Gleiche Produkt-IDs in zwei Märkten kollidieren nicht. Ein zweiter Import überschreibt (Upsert).
  - Die Oberfläche prüft Zeilen, Regal-Existenz im aktiven Layout und doppelte IDs. Sie blockiert den Commit, solange Fehler bestehen (`UI/catalogSheet.ts:193-220`, `UI/catalogCsvImport.ts:152-157`).
- **Beacon-Konsistenzprüfungen (#189):** Null-UUID, fehlendes Major/Minor, doppelte Identität, Abweichung zwischen Layout und Registrierung sowie nicht registrierte Layout-Beacons sind alle blockierend (`StoreReadinessEvaluator.java:215-283`) und durch Tests abgedeckt.
- **Eingang:** Es muss genau ein Eingang da sein, sonst gibt es einen blockierenden Befund (`:91-95`). Der Editor verhindert zusätzlich das Veröffentlichen ohne Eingang (`UI/editor/validation.ts:69`, `editor-route.spec.ts:52`).
- **Produkt ohne passendes Regal:** Ergibt den blockierenden Befund `PRODUCT_NO_SHELF` (`:114-128`).
- **Prüfprofile (#191):** `testroom` und `market` mit 3 Beacons pro Zelle und maximal 5 % unterversorgten Zellen (`resources/readiness/coverage-rule.json`). Nur ein `admin` darf das Profil ändern (`B/admin/service/StoreAdminService.java:265-272`).
- **Einrichtungs-Checkliste (#196):** Sieben Schritte, verständliche deutsche Texte. Der Schritt „Sortiment“ erkennt den Fall „nur globaler Katalog, keine eigenen Produkte“ als Problem (`UI/storeSetup.ts:96-107`).
- **Smoke-Check (#188):** Funktioniert wie beabsichtigt. Live: 18 OK, 0 FAIL. Mit `storeCode` ist ein leerer Markt ein FAIL (`scripts/ops/smoke_check.sh:64-84,141-142`).
- **Suchindex-Seite (#190):** Reindex und Aktivieren gehen über die Oberfläche, ohne `force` (`UI/SearchIndexPage.tsx`). Für normale Importe ist sie nicht nötig.

## D. Technische und funktionale Lücken

### D1 – Readiness meldet leere Märkte als bereit (P0, Kriterium 2)

- **Problem:**
  - Eingang, Gitter und genug registrierte Beacons, aber 0 Regale und 0 Produkte: Status `GREEN`, angezeigt als „Bereit“.
  - Regale, aber 0 Produkte: nur Warnungen `SHELF_WITHOUT_PRODUCTS`, Status `YELLOW` („Bereit mit Hinweisen“).
  - 0 Beacons: nur die Warnung `LOW_BEACON_COVERAGE`, Status `YELLOW`.
- **Dateien:**
  - `B/admin/readiness/StoreReadinessEvaluator.java:105-142,160-195,310-312`
  - `B/admin/readiness/StoreProductSource.java:76-86`
  - `BT/admin/readiness/StoreReadinessEvaluatorTest.java:325-336`
  - `BT/resource/admin/StoreReadinessResourceTest.java:60-66`
  - `UI/readiness.ts:13-17`
- **Ursache:**
  - Die Produkt- und Regalschleifen erzeugen nur Befunde für vorhandene Elemente; Leere ist kein Befund.
  - Fehlende Beacons zeigen sich nur indirekt über die Abdeckung, und die ist nur eine Warnung.
  - Ein Markt ohne eigene Produkte wird gegen die 153 globalen Altprodukte geprüft. Die Kundensuche zeigt diese Produkte für diesen Markt aber nie, weil sie immer mit `storeCode` filtert.
- **Auswirkung:** Der Kern von Kriterium 2 ist verletzt: Ein unvollständiger Markt kann als startklar gelten. Die Checkliste fängt den Fall zwar über Schritt 5 ab, die Seite „Pilot-Bereitschaft“ selbst aber nicht.
- **Behebung:** Drei neue blockierende Befunde einführen:
  - `NO_SHELVES`: keine Regale im aktiven Layout.
  - `NO_STORE_PRODUCTS`: 0 eigene Produkte. Der Rückfall auf den globalen Katalog entfällt oder wird selbst blockierend.
  - `NO_BEACONS`: kein platziertes Beacon mit vollständiger Identität.

  Dazu die beiden Tests anpassen und die OpenAPI-Beschreibung nachziehen. Keine Prüfregel lockern.
- **Aufwand:** 0,5–1 Personentag.

### D2 – Zugang für einen neuen Betreiber nur über Keycloak-Konsole und SQL (P0, Kriterium 1, Entscheidung nötig)

- **Problem:** Ein Benutzer braucht eine Zeile in `user_access_assignments`. Dafür gibt es weder eine Oberfläche noch einen Schreib-Endpunkt. Die Doku beschreibt ein `INSERT` per `psql` (`DEPLOYMENT.md:318-345`, `docs/pilot-readiness/team/ADMIN_LOGIN.md:16-17`, `RELEASE_PLAN_NEXT.md:118-139`).
- **Dateien:**
  - `B/admin/repository/UserAccessAssignmentRepository.java:15-27` (liest nur)
  - `B/admin/service/AdminAccessService.java:50-58`
  - `resources/db/migration/V4__user_access_assignments.sql`
  - Admin-UI: keine Seite.
- **Ursache:** Die Rechtevergabe wurde nie als Funktion gebaut. Die Spezifikation `admin-role-access-control` hat keine Anforderung dafür.
- **Auswirkung:** „Ohne Entwickler“ gilt nur, wenn „Betreiber“ unser eigener Indooro-Admin ist. Ein echter Marktbetreiber braucht Erik (Datenbank).
- **Behebung:**
  1. Zuerst muss Erik mit dem Product Owner festlegen, wer „Betreiber“ ist.
  2. Ist es der Indooro-Admin, wird D2 P1, und die Demo läuft mit `admin`.
  3. Sonst kommt eine kleine Admin-Seite „Zugänge“ (nur `admin`): Zuordnung anlegen, ansehen und deaktivieren, mit Rolle, Region oder Markt und Keycloak-`sub`. Die „Forbidden“-Seite zeigt dem Benutzer seine eigene `sub` zum Kopieren.
  4. Den Keycloak-Benutzer legt der Admin weiter in der Keycloak-Konsole an. Das ist eine Oberfläche, kein Entwicklerwerkzeug.
- **Aufwand:** 1–1,5 Personentage.

### D3 – Einzelprodukte live nicht speicherbar oder löschbar (409) (P0, Kriterium 1, „Fehler korrigieren“)

- **Problem:** `POST /api/admin/products` und `DELETE /api/admin/products/{id}` antworten für **jeden** Markt mit 409, solange Dokumente ohne `storeCode` im Index liegen. Live sind das 153.
- **Dateien:**
  - `B/service/LegacyDocumentGuard.java:28-46`
  - `B/resource/admin/AdminProductResource.java:140,165`
  - `docs/pilot-readiness/operations/CATALOG_MIGRATION.md:103`
- **Ursache:** Die Sperre ist gewollt, sie soll doppelte Doku-IDs verhindern. Der Bulk-Import ist absichtlich nicht gesperrt.
- **Auswirkung:**
  - Ein Betreiber kann ein falsches Produkt nicht einzeln korrigieren und **gar nicht löschen**.
  - Korrigieren geht nur über einen erneuten CSV-Import mit derselben ID.
  - Live nicht selbst ausgelöst (kein Login, und es wäre ein Schreibzugriff). Aus Code und Doku eindeutig.
- **Behebung:**
  1. Den Altbestand nach `CATALOG_MIGRATION.md` Schritt 6 entfernen, mit Backup vorher. Das macht Erik selbst; für Codex ist `--delete-legacy` verboten.
  2. Vorher sollte D4 live sein, damit Anfragen ohne `storeCode` danach nicht alle Märkte mischen.
- **Aufwand:** 1–2 Stunden plus Backup und Smoke-Check.

### D4 – Suche ohne `storeCode` ist ungefiltert (P1, Kriterium 3)

- **Problem:** Fehlen `storeCode` und `storeId` und ist `CATALOG_DEFAULT_STORE_CODE` nicht gesetzt, liefert `/api/products` beziehungsweise `/search` Produkte **aller** Märkte. Live: 6 Alt- plus 2 Testraum-Treffer für „milch“.
- **Dateien:**
  - `B/resource/ProductResource.java:249-257`
  - `B/service/OpenSearchService.java:194`
  - `IOS/Managers/ProductSearchStore.swift:74-87`
  - `IOS/…/ProductSearchStoreTests.swift:10-16`
- **Ursache:** Der Filter ist opt-in. Die iOS-App sucht auch ohne bekannten Markt, etwa vor der Beacon-Erkennung oder im Pilot-Profil (`BeaconManager.swift:1181-1183`). Dann schickt sie keinen `storeCode`.
- **Auswirkung:** Das Kunden-Web ist nicht betroffen. In iOS sind Treffer aus anderen Märkten mit falschen Regalangaben möglich, sobald zwei Märkte Produkte haben. Mit gewähltem Markt ist Kriterium 3 erfüllt.
- **Behebung (fail-closed im Backend):** Ohne Markt und ohne Default nur Dokumente **ohne** `storeCode` liefern, also den Altbestand. Das alte Verhalten für alte App-Builds bleibt so erhalten. Nach D3 ist das Ergebnis leer statt gemischt. Keine Änderung an iOS-Routing oder Positionierung.
- **Aufwand:** 0,5 Personentag.

### D5 – Kein automatisierter Isolationsnachweis gegen echtes OpenSearch (P1, Kriterien 1 und 3)

- **Problem:** Alle Isolationstests mocken OpenSearch oder prüfen nur Request-Parameter. Die echten Integrationstests werden in der CI übersprungen, weil `backend-test` kein OpenSearch startet. Kein Test hat zwei Märkte mit gleichem Produktnamen.
- **Dateien:**
  - `BT/service/OpenSearchStoreScopeTest.java:128-140`
  - `BT/service/ProductWriteVisibilityIntegrationTest.java:88-91`
  - `.github/workflows/ci.yaml` (Job `backend-test`)
  - `backend/indooro_server/src/test/playwright/customer-finder.spec.mjs:49-57`
- **Auswirkung:** Eine spätere Regression, etwa ein Mapping zurück auf `text`, bliebe grün in der CI. Genau das ist früher passiert.
- **Behebung:**
  1. OpenSearch als Service-Container im Job `backend-test`. Alternativ den Integrationstest nicht mehr still überspringen lassen.
  2. Ein Isolationstest mit zwei Märkten (`SPAR-A`, `Spar-Hörsching-B`), gleichem Namen und gleicher ID, plus einem Altdokument. Prüfen: Liste, Suche und `getProductById` je Markt liefern nur eigene Inhalte.
- **Aufwand:** 0,5–1 Personentag.

### D6 – Rollenmodell passt nicht zur Story „Betreiber richtet Markt ein“ (P1, Kriterium 1)

- **Problem:**
  - `store-manager` darf keinen Markt anlegen (`AdminAccessService.java:166-174`).
  - Die Seite „Produkte“ und damit der CSV-Import ist im UI nur für `admin` (`UI/routes.ts:18,69-71`), obwohl das Backend Bulk-Import für den eigenen Markt erlaubt (`B/resource/admin/AdminProductResource.java:49,213`, `BT/resource/admin/AdminProductBulkTest.java:75-83`).
  - Beacons anlegen darf nur `admin` (`UI/BeaconsPage.tsx:448,454`).
  - Die Checkliste zeigt dem store-manager „Dafür ist ein Administrator nötig.“ (`UI/StoreSetupSection.tsx:15`).
- **Auswirkung:** Selbst mit Zugang kann ein Marktleiter seinen Markt nicht allein befüllen.
- **Behebung:** Hängt an der Entscheidung in D2. Falls nötig, die Produktseite und den CSV-Import marktbezogen für `store-manager` öffnen. Das Backend ist schon dafür eingerichtet.
- **Aufwand:** 0,5 Personentag.

### D7 – Testraum live noch rot (P0 für die Demo, bekannt)

- **Stand:**
  - `ENTRANCE_COUNT`: kein Eingang.
  - `BEACON_UUID_ALL_ZERO`: Indooro5.
  - `BEACON_MAJOR_MINOR_MISSING`: Indooro3, auch im Layout `major: null`.
  - `LAYOUT_BEACON_NOT_REGISTERED`: Layout-Beacon Indooro4 hat UUID `…c17`; diese UUID fehlt in `/api/mobile/stores/beacon-identities`.
- **Einordnung:** Kein neuer Befund. Er wartet auf die echten Beacon-Werte (nRF Connect).

### D8 – Kleinere Bedien- und Doku-Lücken (P2)

- Die Readiness-Seite zeigt Servertext und rohen Code. Der Sprung zum Element im Editor fehlt (TODO `UI/ReadinessPage.tsx:47`).
- Die CSV prüft `fach`, `reihe` und `meter` nur auf Ziffern, das Formular auf 1–7, 1–3 und 1–5 (`UI/catalogSheet.ts:193-197` gegen `UI/ProductsPage.tsx:149-151`).
- Keine CSV-Vorlage zum Herunterladen.
- `MARKT_EINRICHTEN.md:12` nennt `preis` optional, Backend und UI verlangen ihn (`B/service/ProductBulkService.java:150-151`).
- Veraltete Doku: `CATALOG_MIGRATION.md:107` (iOS sende kein `storeCode`), `ROADMAP.md:43`.
- Ein neuer Markt ist sofort `ACTIVE` und erscheint in der Kunden-Marktliste, bevor Layout oder Produkte existieren (`B/admin/service/StoreAdminService.java:151`, `MobileStoreService.java:103-113`). Live sieht ein Kunde drei Märkte, in denen jede Suche „Nichts gefunden“ ergibt.
- Smoke-Check im Auto-Modus: leere Märkte sind nur INFO. `pilot_smoke.py` sucht ohne Markt.
- `StoreProductSource` blättert mit `search_after` nur auf `id`. Gleiche IDs in mehreren Märkten können an einer Seitengrenze Dokumente überspringen (`StoreProductSource.java:54,65`). Relevant erst ab mehr als 500 Treffern.
- OpenSpec: `add-admin-search-index-page`, `add-beacon-consistency-readiness` und `add-smoke-check-store-gate` sind vollständig abgehakt, aber nicht archiviert. `add-readiness-coverage-profiles` 3.3 und `scope-readiness-to-own-catalog` 3.2 sind faktisch erledigt (`RELEASE_2026-10-18.md:41,44`), aber nicht abgehakt.

### Zu den Fragen aus dem Auftrag (Kriterium 1, Kurzantworten)

| # | Frage | Antwort |
|---|---|---|
| 1 | Zugang für neuen Betreiber | Keycloak-Konsole plus SQL. Nicht über die Oberfläche (D2). |
| 2 | Rolle je Schritt | Markt anlegen: `admin` oder `region-manager`. Layout und Editor: alle drei Rollen, marktbezogen. Beacon anlegen: `admin`; zuordnen und bearbeiten marktbezogen. CSV-Import und Suchindex: im UI nur `admin`. Ein store-manager kann seinen Markt nicht vollständig einrichten (D6). |
| 3 | Markt über UI anlegen | Ja (`UI/StoreCreatePage.tsx`). Nicht live geprüft. |
| 4 | Grundriss | Leere Vorlagen, JSON-Import, Hintergrundbild (`UI/editor/LayoutEditor.tsx:26-30,448-449`). Kein Import aus PDF oder CAD. |
| 5 | Regale, Eingang, begehbare Flächen | Regale und Eingang ja. Begehbare Fläche ist alles, was nicht belegt ist; es gibt keinen eigenen Elementtyp. Die Wegfindung prüft nur der Editor als Warnung (`UI/editor/validation.ts:161`), nicht die Readiness. |
| 6 | Beacons anlegen und platzieren | Ja: Anlage auf der Beacon-Seite, Platzierung im Editor nur mit zugeordneten Beacons (`LayoutEditor.tsx:145,546`). Die UI-Validierung lehnt eine Null-UUID nicht ab, die Readiness meldet sie aber blockierend. |
| 7 | CSV `id;name;kategorie;meter;fach;reihe;preis` | Ja. Das UI akzeptiert diese 7 Spalten und optional `marke`, `menge`, `regal_label` (`UI/catalogSheet.ts:7-24`). Trennzeichen werden erkannt, UTF-8 mit Fallback auf Windows-1252. |
| 8 | Zuordnung zu Regalen | Über `kategorie/meter`. Das UI prüft das Regal im aktiven Layout; die Readiness meldet `PRODUCT_NO_SHELF`. |
| 9 | Ungültige Daten | Das UI zeigt eine Fehlertabelle nach Zeile und Feld und blockiert den Commit. Das Backend prüft nur `name`, `preis` und einen nicht leeren `layoutCode`. |
| 10 | Nachträglich korrigieren | Layout: neue Version, Beacons: bearbeiten. Produkte: nur per erneutem CSV-Import; einzeln speichern oder löschen gibt live 409 (D3). |
| 11 | Speichern und wieder aufrufen | Ja: Layout-Versionen, Produkte im Index, Markt in Postgres. |
| 12 | Bereitschaft prüfen | Ja, Seite „Pilot-Bereitschaft“ und Checkliste. Fachliche Lücke siehe D1. |
| 13 | Reindex nach Import | Nicht nötig. Der Import schreibt über den Alias `products_live` direkt in den aktiven Index (`refresh=wait_for`). |

### Beacon-Abdeckung und die Grenze der Aussage

- Der Testraum misst 5 × 9 m (`gridSize` live). Er hat 8 Regale, die 14 Zellen belegen; es bleiben 31 begehbare Zellen.
- Die 4 Beacons stehen in den Ecken. Mit dem Profil `testroom` (10 m) liegt **jede** Zelle im Radius aller vier Beacons; die längste Strecke ist rund 9,6 m. Die Regel „3 Beacons pro Zelle“ kann in diesem Raum also nicht scheitern, solange 3 Beacons registriert sind.
- Das ist plausibel und nicht künstlich gelockert, weil `market` (8 m) unverändert bleibt und das Profil nur ein `admin` setzen darf.
- Das Grün beweist aber nur: Die Konfiguration ist vollständig und geometrisch plausibel.
- **Eine zuverlässige Ortung mit echten Beacons ist damit nicht bewiesen.** Das klärt erst die Feldmessung im nächsten Sprint (Mess-Kit #192).
- Für das Sprint-Review darf „Bereit“ deshalb nur als „technisch vollständig konfiguriert“ vorgestellt werden.
- Ein Risiko bleibt: Ein `admin` kann einem großen Markt das Profil `testroom` geben. Es gibt keine Warnung „Profil passt nicht zur Fläche“ (P2).

## E. Offene Nachweise (Implementierung vermutlich in Ordnung)

1. **Admin-Workflow live:** Markt anlegen, Layout veröffentlichen, Beacon zuordnen, CSV importieren. Bisher nur in Playwright mit Mocks belegt; `rebuild-admin-platform` 5.4 ist offen.
2. **Login und Rollen live:** store-manager im eigenen und im fremden Markt (`release-pilot-backend` 6.3, `RELEASE_2026-10-17.md:34,47`).
3. **Checkliste live auf dem Testraum** (`add-store-setup-checklist` 4.2).
4. **Isolationstest mit zwei Märkten gegen echtes OpenSearch** in der CI (D5). Der lokale Einmal-Nachweis steht unten.
5. **Ein Markt, der live grün ist** (D7), danach Screenshot oder Markdown-Export der Readiness als Abnahmebeleg.
6. **iOS mit Markt auf Gerät:** `storeCode` im Request. Das ist im Code belegt; laut `RELEASE_PLAN_NEXT.md:53` erreicht es Geräte erst mit einem neuen Build.

## Lokaler Zwei-Markt-Test

Einmaliger lokaler Nachweis, kein CI-Test. Er ersetzt T7 nicht.

**Aufbau:**

- Wegwerf-Container `opensearchproject/opensearch:2.9.0` auf `127.0.0.1:19299`, nach dem Test gestoppt.
- Index mit `backend/indooro_server/src/main/resources/opensearch/products-index.json` angelegt.
- Daten:
  - Markt `SPAR-Probe-A`: „SPAR Frische Vollmilch 1L“ (ID 1, Regal `520/1/1/1`) und „Bio Joghurt Natur“.
  - Markt `Spar-Hörsching-Probe`: **gleicher Name, gleiche ID 1**, Regal `310/2/1/1`, dazu „Käse Gouda Scheiben“.
  - Ein Altdokument ohne Markt („Vollmilch Legacy“).
- Abfrage: wie `OpenSearchService.applyStoreFilter`, also `term storeCode` im `bool.filter`, mit Fuzzy-`match` auf `name`.

| Suche | storeCode | Ergebnis |
|---|---|---|
| vollmilch | `SPAR-Probe-A` | nur A, Regal `520/1/1/1` |
| vollmilch | `Spar-Hörsching-Probe` | nur B, Regal `310/2/1/1` |
| vollmilch | (keiner) | Altdokument und A und B gemischt (entspricht D4) |
| käse | `SPAR-Probe-A` | `[]` |
| käse | `Spar-Hörsching-Probe` | nur „Käse Gouda Scheiben“ (Umlaut in Suche und Code) |
| vollmilch | `spar-hörsching-probe` (klein) | `[]` |
| vollmilch | `UNKNOWN` | `[]` |
| vollmilch | `Spar-Hörsching` (Präfix) | `[]` |

- Gemapptes Feld: `storeCode` = `{"type": "keyword"}`.
- Gegenprobe für T3: Mit dem Filter `must_not exists storeCode` liefert die Suche ohne Markt nur „Vollmilch Legacy“.

**Ergebnis:** Mit Markt ist die Trennung vollständig, auch bei gleichem Namen, gleicher ID und Umlaut-Code. Ohne Markt wird gemischt.

## F. Priorisierter Sprint-Restaufwand

| ID | Prio | Task | Wer | Aufwand | Abhängig von |
|---|---|---|---|---|---|
| T0 | P0 | Entscheidung: Wer ist „Betreiber“ im Sinne von Kriterium 1 (Indooro-Admin oder Marktleiter)? | Erik/Team mit PO | 15 min | – |
| T1 | P0 | Readiness: leere Märkte nie „Bereit“ (D1) | Claude-Session | 0,5–1 PT | – |
| T2 | P0* | Admin-Seite „Zugänge“ statt SQL (D2) | Claude-Session | 1–1,5 PT | T0 (*P1, wenn Betreiber = Admin) |
| T3 | P1 | Suche ohne Markt fail-closed (D4) | Claude-Session | 0,5 PT | – |
| T4 | P0 | Deploy von T1 und T3 (und T2) mit festem Tag | Codex | 1 h | T1, T3 |
| T5 | P0 | Altbestand entfernen, entsperrt Einzelprodukt-Korrektur (D3) | Erik | 1–2 h | T4 (T3 live) |
| T6 | P0 | Testraum korrigieren: Beacon-Werte und Eingang (D7) | Erik/Team (ablesen), Codex (Eingabe in Eriks Sitzung) | 1–2 h | nRF-Werte |
| T7 | P1 | Isolationstest gegen echtes OpenSearch in der CI (D5) | Claude-Session | 0,5–1 PT | – |
| T8 | P1 | Produkte und CSV für `store-manager` marktbezogen öffnen (D6) | Claude-Session | 0,5 PT | T0 |
| T9 | P1 | Demo-Daten (CSV, Layout) und Generalprobe | Claude-Session (Dateien), Erik/Team (Probe) | 0,5 PT | T1, T6 |
| T10 | P1 | `k8s/backend.yaml` und Release-Protokoll nach Deploy | Claude-Session | 0,5 h | T4 |
| T11 | P2 | Readiness-Texte für Betreiber und Sprung zum Element im Editor (D8) | Claude-Session | 0,5 PT | – |
| T12 | P2 | CSV-Regeln vereinheitlichen, Vorlage zum Download, Doku-Widersprüche (D8) | Claude-Session | 0,5 PT | – |
| T13 | P2 | Neue Märkte erst nach Freigabe in der Kunden-Marktliste; Smoke-Check meldet leere Märkte (D8) | Claude-Session | 1 PT | – |
| T14 | P2 | OpenSpec aufräumen: erledigte Changes abhaken und archivieren (D8) | Claude-Session | 0,5 h | – |

### Auftragstexte (P0 und P1)

**T1 – Claude-Session: Readiness meldet leere Märkte nicht als bereit**

> Arbeite in einem eigenen Worktree von `origin/main`, Branch `fix/readiness-empty-store`, PR gegen `main`, nicht mergen.
>
> Bereich: `backend/indooro_server/src/main/java/at/htl/admin/readiness/StoreReadinessEvaluator.java`, `StoreProductSource.java`, `ReadinessDtos.java`, Tests in `backend/indooro_server/src/test/java/at/htl/admin/readiness/` und `.../resource/admin/StoreReadinessResourceTest.java`, OpenAPI-Beschreibung von `GET /api/stores/{id}/readiness` in `openspec/specs/shared-api/openapi.yaml` sowie das generierte `admin-ui/src/api/generated/schema.d.ts`.
>
> Neue blockierende Befunde mit deutschem Text:
> - `NO_SHELVES`: kein Regal im aktiven Layout.
> - `NO_STORE_PRODUCTS`: Der Markt hat 0 eigene Produkte. Der Rückfall auf den globalen Katalog in `StoreProductSource.select` entfällt; die übersprungenen globalen Produkte werden weiter gezählt.
> - `NO_BEACONS`: kein platziertes Beacon mit vollständiger Identität.
>
> Keine bestehende Regel lockern, Profile `testroom` und `market` unverändert.
>
> Fertig heißt:
> - `emptyTestRoomWithNineBeaconsIsGreenInTheTestroomProfile` (`StoreReadinessEvaluatorTest.java:325`) ist umbenannt und erwartet RED mit `NO_SHELVES` und `NO_STORE_PRODUCTS`. Die Abdeckungsaussage des Tests bleibt erhalten.
> - Ein neuer Test zeigt: Markt mit Regalen, ohne Produkte ergibt RED. Markt ohne Beacons ergibt RED. `readyStoreIsGreenWithoutFindings` bleibt GREEN.
> - Die Checkliste (`admin-ui/src/storeSetup.ts`) zeigt weiterhin korrekte Schritte; Playwright `readiness.spec.ts` und `store-setup.spec.ts` sind angepasst, falls nötig.
>
> Tests: `./mvnw test` im Backend, `npm test` und `npx playwright test` in `admin-ui`. CI grün: `backend-test`, `contract`, `mobile-contract`, `swift-tests`, `build-and-push`. Keine Änderungen an iOS-Routing oder Positionierung.

**T2 – Claude-Session: Zugänge ohne SQL vergeben** (nur nach T0, falls Betreiber = Marktleiter)

> Eigener Worktree von `origin/main`, Branch `feat/admin-access-assignments`, PR gegen `main`, nicht mergen.
>
> Bereich:
> - Backend: neuer Endpunkt unter `/api/admin/access-assignments`, nur `@RolesAllowed("admin")`: auflisten, anlegen, deaktivieren. Nutzt die Tabelle `user_access_assignments` aus V4; keine neue Tabelle. Validierung: `store-manager` braucht `store_id`, `region-manager` braucht `region_id`, eine aktive Zeile pro `keycloak_subject`, jede Änderung im Audit-Log.
> - Admin-UI: Seite „Zugänge“ (nur `admin`).
> - Die „Forbidden“-Seite zeigt angemeldeten Benutzern ohne Zuordnung ihre eigene `sub` zum Kopieren.
> - Doku: `docs/pilot-readiness/team/ADMIN_LOGIN.md` und `docs/pilot-readiness/operations/MARKT_EINRICHTEN.md` ohne SQL-Schritt.
>
> Keycloak-Benutzer werden weiter in der Keycloak-Konsole angelegt; kein Keycloak-Admin-API-Zugriff aus dem Backend.
>
> Fertig heißt: Ein Admin legt über die Oberfläche einen store-manager für einen Markt an. Dieser sieht danach nur seinen Markt. Getestet mit Backend-Tests für Rollen und Validierung und mit Playwright für die Seite und die Rollensperre.
>
> CI grün (alle fünf Jobs).

**T3 – Claude-Session: Suche ohne Markt fail-closed**

> Eigener Worktree von `origin/main`, Branch `fix/unscoped-product-reads`, PR gegen `main`, nicht mergen.
>
> Bereich: `backend/indooro_server/src/main/java/at/htl/resource/ProductResource.java` (`effectiveStoreCode`), `service/OpenSearchService.java` (`applyStoreFilter`, `getAllProducts`, `searchProducts`, `getProductById`), Tests `ProductStoreReadTest`, `ProductDefaultStoreTest`, `OpenSearchStoreScopeTest`, OpenAPI-Beschreibung von `/api/products`, `/api/products/search`, `/api/products/{id}`.
>
> Fehlen `storeId` und `storeCode` und ist `indooro.catalog.default-store-code` leer, liefern die drei Lese-Endpunkte nur Dokumente **ohne** `storeCode`. Das ist ein `must_not exists storeCode` im Filter. Mit Markt ändert sich nichts.
>
> Fertig heißt: Ein Test belegt, dass eine Anfrage ohne Markt nie ein Produkt mit `storeCode` liefert; ein bestehender Test mit Markt bleibt unverändert grün. Kunden-Web und iOS-Code bleiben unverändert.
>
> CI grün (alle fünf Jobs).

**T4 – Codex: Deploy mit festem Tag**

> Ziel: das Backend-Image mit dem Commit-Tag des Merges von T1 und T3 auf LeoCloud ausrollen.
>
> 1. Nur-Lese-Vorprüfung:
>    - `kubectl -n student-it220209 get deploy indooro-backend -o jsonpath='{.spec.template.spec.containers[0].image}'` notieren (erwartet `…:6278040`).
>    - Prüfen, dass das neue Image in GHCR mit dem Tag existiert.
>    - `scripts/ops/smoke_check.sh https://it220209.cloud.htl-leonding.ac.at` vorher ausführen und sichern.
> 2. Backup: `scripts/ops/backup_postgres.py` nach `docs/pilot-readiness/operations/BACKUP_RESTORE.md`. Das vorherige Image in `backups/<datum>-previous-image.txt` schreiben.
> 3. Rollout: genau ein Befehl `kubectl -n student-it220209 set image deploy/indooro-backend indooro-backend=ghcr.io/htl-leo-itp-25-27-4-5bhitm/indooro-backend-v2:<commit>`, dann `kubectl rollout status`.
> 4. Nachprüfung: Smoke-Check mit `SPAR-Leonding-002`. Erwartet: 0 FAIL. Zusätzlich `curl '/api/products/search?q=milch'` ohne Markt: Ab T3 erwartet nur Treffer ohne `storeCode`.
> 5. Rollback-Regel: Bei FAIL im Smoke-Check oder einem nicht bereiten Pod sofort `kubectl set image` auf das notierte vorherige Image und melden.
> 6. Bericht: altes und neues Image, Backup-Datei, Smoke-Check vorher und nachher, Abweichungen.
>
> Verboten:
> - Passwörter oder Tokens ausgeben oder eingeben.
> - Andere `kubectl`-Schreibbefehle als dieses eine `set image` (und im Notfall das Rollback-`set image`).
> - `psql`-Schreibzugriffe, Index-Löschungen, `force=true`, `--delete-legacy`.
> - `CATALOG_DEFAULT_STORE_CODE` setzen.
> - Commits auf `main`.

**T5 – Erik: Altbestand entfernen**

> Nach T4 (T3 live). Ablauf nach `docs/pilot-readiness/operations/CATALOG_MIGRATION.md` Schritt 6:
> 1. Index-Snapshot oder Export mit `scripts/ops/export_products.py` und Postgres-Backup.
> 2. Löschen der 153 Dokumente ohne `storeCode`.
>
> Danach prüfen:
> - `countLegacyProducts` ist 0. `POST /api/admin/products` für den Testraum antwortet nicht mehr mit 409; als Probe ein bestehendes Produkt unverändert speichern.
> - Smoke-Check 0 FAIL.
>
> Kein Codex-Auftrag, weil `--delete-legacy` und Index-Löschungen für Codex verboten sind.

**T6 – Erik/Team und Codex: Testraum vervollständigen**

> **Erik/Team:** Mit nRF Connect UUID, Major und Minor von Indooro1 bis Indooro5 ablesen und notieren.
>
> **Codex, in Eriks eingeloggter Admin-Sitzung:**
> 1. Nur-Lese-Vorprüfung: Readiness-Export (Markdown) des Testraums sichern.
> 2. Auf `/admin/next/beacons/` die Werte von Indooro3 (Major/Minor) und Indooro5 (UUID) eintragen. Indooro4 mit UUID `…c17` registrieren oder im Layout korrigieren, je nach abgelesenem Wert.
> 3. Im Editor (`/admin/next/editor/?storeId=b0308337-1d4b-4096-b022-200e6118e86c`) genau einen Eingang setzen, als neue Version speichern und aktivieren.
> 4. Readiness neu laden.
>
> Erwartet: 0 blockierende Befunde. Bericht: Vorher- und Nachher-Export, geänderte Felder.
>
> Rollback-Regel: Bei unerwarteten Befunden die vorherige Layout-Version wieder aktivieren und melden.
>
> Verboten:
> - Passwörter oder Tokens ausgeben oder eingeben.
> - Jeglicher `kubectl`-Schreibbefehl.
> - `psql`-Schreibzugriffe, Index-Löschungen, `force=true`, `--delete-legacy`.
> - `CATALOG_DEFAULT_STORE_CODE` setzen.
> - Commits auf `main`.
> - Weitere Märkte ändern.

**T7 – Claude-Session: Isolationstest gegen echtes OpenSearch**

> Eigener Worktree von `origin/main`, Branch `test/store-isolation-opensearch`, PR gegen `main`, nicht mergen.
>
> Bereich: `.github/workflows/ci.yaml` (Job `backend-test`: OpenSearch-2.9.0-Service mit `plugins.security.disabled=true`), neuer Integrationstest unter `backend/indooro_server/src/test/java/at/htl/service/`, Muster wie `ProductWriteVisibilityIntegrationTest`.
>
> Daten:
> - Markt `SPAR-Iso-A` und Markt `Spar-Hörsching-Iso-B`, beide mit „SPAR Frische Vollmilch 1L“ unter derselben ID 1, aber mit verschiedenem `layoutCode`.
> - Ein Altdokument ohne Markt.
>
> Prüfen jeweils mit echtem Index und Repo-Mapping:
> - Liste, Suche und Abfrage per ID je Markt liefern nur die eigenen Dokumente.
> - Klein geschriebener und unbekannter Code liefern `[]`.
> - Ein Umlaut-Code funktioniert.
>
> In der CI darf der Test nicht still übersprungen werden.
>
> Fertig heißt: CI-Job `backend-test` führt den Test aus und er ist grün; ein absichtlich auf `text` geändertes Mapping lässt ihn lokal rot werden (im PR beschreiben).

**T8 – Claude-Session: Produkte und CSV für store-manager** (nur nach T0, falls Betreiber = Marktleiter)

> Eigener Worktree, Branch `feat/store-manager-catalog`, PR gegen `main`.
>
> Bereich:
> - `admin-ui/src/routes.ts` (Produkte für `store-manager` und `region-manager` erlauben)
> - `ProductsPage.tsx`, `ProductCsvImport.tsx` (Marktauswahl auf erlaubte Märkte begrenzen)
> - `storeSetup.ts` (Schritt 5 nicht mehr `adminOnly`)
> - Playwright `products.spec.ts` (store-manager importiert in eigenen Markt; fremder Markt gesperrt)
> - Doku `MARKT_EINRICHTEN.md:20`
>
> Das Backend bleibt unverändert; die Marktprüfung existiert schon (`AdminProductResource.java:213`).
>
> CI grün (alle fünf Jobs).

**T9 – Claude-Session und Erik/Team: Demo-Daten und Generalprobe**

> **Claude-Session:** Branch `docs/sprint-demo-kit`. `docs/pilot-readiness/kit/demo/` mit:
> - `demo-markt.csv`: 15 Produkte in den Spalten `id;name;kategorie;meter;fach;reihe;preis`. 3 Namen gleich wie im Testraum, zum Beispiel „SPAR Frische Vollmilch 1L“, mit anderem Regal. Eine absichtlich fehlerhafte Zeile in einer zweiten Datei `demo-markt-fehler.csv`.
> - `demo-layout.json`: 6 × 10 m, 6 beschriftete Regale, 1 Eingang, 4 Beacon-Plätze.
> - `DEMO_ABLAUF.md`: Ablauf aus Abschnitt G dieses Berichts.
>
> Kategorien und Meter müssen zu den Regalen im Layout passen. Lokal gegen den Docker-Compose-Stack prüfen: CSV-Import ohne Fehler, Readiness nach T1 grün, sobald die Beacons registriert sind.
>
> **Erik/Team:** Generalprobe, siehe G.

**T10 – Claude-Session: Manifest und Protokoll nachziehen**

> Nach T4: `k8s/backend.yaml` (`image:`) auf den neuen Tag setzen, Nachtrag in `docs/pilot-readiness/releases/` und `docs/pilot-readiness/team/STATUS.md`. PR gegen `main`. CI grün.

## G. Demo für das Sprint-Review (etwa 8 Minuten)

**Vorbedingungen:** T1 und T3 live, T6 erledigt (Testraum grün), Demo-Kit aus T9.

**Wo läuft die Demo?** Das entscheidet Erik.

- **Live (empfohlen):** einen Demo-Markt `DEMO-Review-001` anlegen und nach der Vorführung archivieren.
  - Löschen geht nicht; der Markt erscheint während der Demo auch in der Kunden-Marktliste.
  - Kein Problem, wenn er nach der Demo archiviert wird.
- **Lokal:** auf dem Docker-Compose-Stack, falls Live-Daten unberührt bleiben sollen.

| Min | Seite | Was wir zeigen | Sichtbares Ergebnis |
|---|---|---|---|
| 0–1 | `/admin/next/` (Login als Admin, vorher erledigt) | Rolle und Märkte | Dashboard mit Märkten |
| 1–2 | Stores → Neuer Store | `DEMO-Review-001` anlegen | Markt-Seite mit Checkliste „1 von 7 Schritten erledigt“ |
| 2–3 | Editor (Link aus Checkliste) | `demo-layout.json` importieren, Version speichern und aktivieren | Checkliste: Layout aktiv, Regale beschriftet |
| 3–4 | Beacons | 4 vorbereitete Beacons dem Markt zuordnen; im Editor platzieren | Schritt „Beacons“ erledigt |
| 4–5 | Produkte → CSV-Import | Erst `demo-markt-fehler.csv`: Fehlertabelle, Commit gesperrt. Dann `demo-markt.csv`: 15 gespeichert | Schritt „Sortiment“ und „Suche findet Produkte“ erledigt |
| 5–6 | Pilot-Bereitschaft | Demo-Markt: „Bereit“ (GREEN). Dann **fehlerhafter Markt:** Testraum vor T6 oder ein zweiter Demo-Markt ohne Eingang und mit Null-UUID-Beacon zeigt „Nicht bereit“ mit konkreter Liste (`ENTRANCE_COUNT`, `BEACON_UUID_ALL_ZERO`) | Beide Zustände nebeneinander |
| 6–8 | `/customer/` | Demo-Markt wählen, „Vollmilch“ suchen: Treffer mit Demo-Regal. Markt wechseln zu „Spar HTL Leonding“, gleiche Suche: anderes Regal. Markt „SPAR Speychal Hagenberg“: „Nichts gefunden“ | Gleicher Name, verschiedene Regale je Markt; kein Fremdtreffer |
| 8 | Abschluss | Ehrlich sagen: „Bereit“ heißt technisch vollständig konfiguriert. Die Ortungsgenauigkeit misst der nächste Sprint (Feldmessung). | – |

**Beweis der Suche zusätzlich zum UI:** im Browser die Netzwerkanfrage zeigen: `GET /api/products/search?q=vollmilch&size=30&storeCode=DEMO-Review-001`, alle Treffer mit `storeCode: DEMO-Review-001`.

**Generalprobe (1–2 Tage vorher, 30 min):**

1. Den gesamten Ablauf einmal mit einem Wegwerf-Markt durchspielen und danach archivieren.
2. Zeiten messen.
3. Prüfen, dass die CSV ohne Fehler importiert und der Demo-Markt grün wird.
4. Prüfen, dass der Login vor der Demo funktioniert, Beacons frei zugeordnet werden können und der Smoke-Check 0 FAIL zeigt.
5. Rückfall vorbereiten: Screenshots oder Readiness-Export jedes Schritts, falls LeoCloud ausfällt.

## H. Abschließende Entscheidung

**Könnten wir morgen alle drei Kriterien überzeugend nachweisen?** **Nein.**

- **Kriterium 3** ist überzeugend vorführbar, live und im Kunden-Web.
- **Kriterium 2** fällt bei einer kritischen Rückfrage („Was zeigt die Prüfung bei einem Markt ohne Produkte?“). Außerdem gibt es live keinen grünen Markt.
- **Kriterium 1** geht nur mit der Rolle `admin` und nur, wenn niemand ein Produkt einzeln korrigieren oder löschen will. Einen Betreiber-Zugang ohne SQL gibt es nicht.

**Exakt notwendige Arbeiten bis zur Abnahme:**

1. T0: Entscheidung „Wer ist Betreiber?“ (heute, 15 min).
2. T1: Readiness-Lücke schließen (1 Tag inklusive Review).
3. T3: Suche ohne Markt fail-closed (0,5 Tage, parallel zu T1).
4. T4 und T10: Deploy und Manifest (1 h).
5. T5: Altbestand entfernen (1–2 h, Erik).
6. T6: Testraum-Beacons und Eingang (1–2 h, sobald die nRF-Werte vorliegen).
7. T9: Demo-Kit und Generalprobe (0,5 Tage).
8. T2 und T8 nur, wenn der PO „Betreiber = Marktleiter“ verlangt (zusätzlich 1,5–2 Tage).

**Realistisch:**

- Mit „Betreiber = Indooro-Admin“ sind es etwa 2–3 Arbeitstage Durchlaufzeit, inklusive CI und Reviews. Das passt sicher vor den 04.11. und erst recht vor den 13.11.
- Mit „Betreiber = Marktleiter“ sind es 4–5 Arbeitstage. Das ist bis zum 04.11. knapp, bis zum 13.11. machbar.
