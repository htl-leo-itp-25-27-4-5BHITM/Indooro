# Brief T1: Readiness meldet leere Märkte nicht als bereit

Für eine Claude-Umsetzungssession. Grundlage ist der Befund D1 in `docs/reviews/SPRINT_STORE_ONBOARDING_REVIEW.md`. Priorität P0 für Akzeptanzkriterium 2: „Die Bereitschaftsprüfung zeigt ‚startklar‘ oder eine Liste mit konkreten Fehlern.“

## Rahmen

- **Worktree und Branch:**
  - Eigener Git-Worktree von `origin/main` (nach `git fetch origin`).
  - Branch `fix/readiness-empty-store`.
  - Ein PR gegen `main`. Nicht selbst mergen, kein Auto-Merge, kein Push auf `main`.
- **Nicht anfassen:** den Checkout `/Users/erikbergi/Documents/htl/Indooro` selbst.
- **Grenzen:**
  - Keine Änderungen an iOS, Navigation, Positionierung, Produktsuche oder Prüfprofilen.
  - Kein Deploy.
  - Die Suche ohne `storeCode` ist eigene Aufgabe T3, nicht Teil dieses PR.
- **Keine Lockerung:** Bestehende Regeln, Schwellen und Radien (`testroom` 10 m, `market` 8 m, 3 Beacons pro Zelle, 5 %) bleiben unverändert.

## Problem (belegt)

Pfadkürzel: `R/` = `backend/indooro_server/src/main/java/at/htl/admin/readiness/`.

- **Leerer Raum wird grün:** Ein aktives Layout mit genau einem Eingang und genug registrierten Beacons, aber **ohne Regale und ohne Produkte**, ergibt `GREEN`. Die Oberfläche zeigt dafür „Bereit“ (`admin-ui/src/readiness.ts:13-17`). Der Test `StoreReadinessEvaluatorTest.java:325` (`emptyTestRoomWithNineBeaconsIsGreenInTheTestroomProfile`) erwartet das ausdrücklich.
- **Leere Regale werden gelb:** Regale ohne Produkte ergeben nur Warnungen `SHELF_WITHOUT_PRODUCTS`. Der Status ist `YELLOW`, angezeigt als „Bereit mit Hinweisen“ (`R/StoreReadinessEvaluator.java:130-142`).
- **Keine Beacons wird gelb:** Ohne Beacons gibt es nur die Warnung `LOW_BEACON_COVERAGE`. Status `YELLOW`, geprüft in `StoreReadinessResourceTest.java:60-66`.
- **Falscher Katalog bei Märkten ohne eigene Produkte:** Ein solcher Markt wird gegen den globalen Altkatalog geprüft (`R/StoreProductSource.java:84-85`). Die Kundensuche filtert aber immer nach `storeCode` und zeigt diese Produkte dort nie.

## Gewünschtes Verhalten

Drei neue **blockierende** Befunde. Die Texte sind deutsch, aus Sicht eines Betreibers geschrieben, und nennen den nächsten Schritt. Die Befunde werden nur geprüft, wenn ein aktives Layout existiert; ohne Layout bleibt es bei `NO_ACTIVE_LAYOUT`.

| Code | Bedingung | Beispieltext |
|---|---|---|
| `NO_SHELVES` | Kein Element erfüllt `isShelf` (`R/StoreReadinessEvaluator.java:335-339`). | „Das Layout hat keine Regale. Regale im Layout-Editor anlegen und beschriften.“ |
| `NO_STORE_PRODUCTS` | Der Markt hat 0 eigene Produkte. | „Der Markt hat noch keine eigenen Produkte. Sortiment per CSV-Import laden.“ Wenn `skippedGlobalProducts > 0`, zusätzlich: „(N Produkte ohne Markt wurden nicht mitgezählt.)“ |
| `NO_BEACONS` | Kein platziertes Beacon-Element mit vollständiger Identität (`identityKey != null`). | „Im Layout ist kein Beacon mit UUID, Major und Minor platziert. Beacons zuordnen und im Editor platzieren.“ |

Einzelheiten:

1. **`StoreProductSource.select`:**
   - Ohne eigene Produkte liefert die Methode eine **leere** Produktliste.
   - `skippedGlobalProducts` ist dann die Zahl der geladenen globalen Produkte.
   - Der Rückfall auf den globalen Katalog entfällt.
   - Mit eigenen Produkten bleibt alles wie bisher.
   - Den Javadoc der Klasse anpassen.
2. **Warnungen bei 0 eigenen Produkten:** Dann **keine** einzelnen `SHELF_WITHOUT_PRODUCTS`-Warnungen pro Regal ausgeben, nur `NO_STORE_PRODUCTS`, damit die Liste konkret bleibt. Ab einem eigenen Produkt gibt es die Warnungen wie bisher.
3. **Abdeckung:** `LOW_BEACON_COVERAGE` und `COVERAGE_NOT_COMPUTED` bleiben unverändert und kommen bei fehlenden Beacons zusätzlich zu `NO_BEACONS`.
4. **Status:** Die Ableitung (`R/StoreReadinessEvaluator.java:310-312`) bleibt gleich: RED bei mindestens einem blockierenden Befund.
5. **Zähler:** `ReadinessCounts` behält seine Felder. `products` zählt nur noch eigene Produkte.

## Betroffene Dateien

- **Backend:**
  - `R/StoreReadinessEvaluator.java`
  - `R/StoreProductSource.java`
  - gegebenenfalls `R/ReadinessDtos.java` (nur Kommentare und Javadoc)
- **Backend-Tests:**
  - `backend/indooro_server/src/test/java/at/htl/admin/readiness/StoreReadinessEvaluatorTest.java`
  - `.../readiness/StoreProductSourceTest.java`
  - `backend/indooro_server/src/test/java/at/htl/resource/admin/StoreReadinessResourceTest.java`
- **Vertrag:**
  - `openspec/specs/shared-api/openapi.yaml`
  - Enum `ReadinessFinding.code` (etwa Zeile 3205): die drei neuen Codes ergänzen.
  - **Außerdem die heute fehlenden vorhandenen Codes:** `COVERAGE_NOT_COMPUTED`, `BEACON_UUID_ALL_ZERO`, `BEACON_MAJOR_MINOR_MISSING`, `BEACON_IDENTITY_DUPLICATE`, `BEACON_IDENTITY_MISMATCH` und `LAYOUT_BEACON_NOT_REGISTERED`. Das Backend liefert sie schon, der Vertrag kennt sie nicht (Vertragsdrift).
  - Die Beschreibung von `GET /api/stores/{storeId}/readiness` (ab etwa Zeile 1850) anpassen; der Satz zum globalen Katalog muss raus.
- **Generierte Typen:** nicht von Hand ändern, mit `npm run contract:types` im Repo-Root neu erzeugen.
  - `admin-ui/src/api/generated/schema.d.ts`
  - `backend/indooro_server/src/main/resources/META-INF/resources/admin/types/api.d.ts`, falls vom Skript erzeugt (Kopfzeile „Generated by scripts/contract/generate-types.mjs“).
- **Admin-UI:**
  - `admin-ui/src/storeSetup.ts:96-107`: Schritt „Sortiment“ liest für den Hinweis „gemeinsamer Katalog ohne Markt“ heute `readiness.counts.products`. Nach der Änderung ist das 0, also stattdessen `counts.skippedGlobalProducts` verwenden.
  - `admin-ui/src/storeSetup.test.ts` anpassen.
  - Die Playwright-Specs `admin-ui/tests/browser/readiness.spec.ts` und `store-setup.spec.ts` um einen Fall ergänzen: RED mit `NO_STORE_PRODUCTS` erscheint in der Liste „blockierend“.
- **Doku:** `docs/pilot-readiness/operations/MARKT_EINRICHTEN.md`, Tabelle „Befunde lesen“: drei Zeilen für die neuen Codes mit „Was tun“.
- **OpenSpec:** nach Teampraxis wie bei #189, #191 und #197 eine kleine Change, zum Beispiel `block-incomplete-store-readiness`. Sie enthält `proposal.md`, `tasks.md` und ein Delta zu `store-layout-management` mit je einem Szenario für leere Regale, null eigene Produkte und null Beacons. Erik vorher fragen, falls unklar.

## Tests

Bestehende Tests, die nur wegen leerer Regale oder Produkte grün oder gelb waren, **nicht einfach auf RED umstellen**. Stattdessen ein Minimal-Regal und ein passendes Produkt ergänzen, damit sie weiter ihre eigentliche Regel prüfen. Bekannte Kandidaten:

- `shelfWithoutProductsIsWarning`, ab etwa Zeile 131: ein zweites Regal mit Produkt ergänzen. Die Warnung für `s9` bleibt, der Status bleibt YELLOW.
- `emptyTestRoomWithNineBeaconsIsGreenInTheTestroomProfile`, Zeile 325:
  - In zwei Tests aufteilen.
  - (a) Die Abdeckungsaussage (400 begehbare Zellen, 8 unterversorgt, kein `LOW_BEACON_COVERAGE`) bleibt; dazu ein Regal und ein Produkt ergänzen. Die Zellzahlen ändern sich dann; neu berechnen und die Werte im Kommentar begründen.
  - (b) Neuer Test: gleicher Raum ohne Regale und Produkte ergibt RED mit `NO_SHELVES` und `NO_STORE_PRODUCTS`.
- `StoreProductSourceTest.storeWithoutOwnProductsKeepsTheGlobalCatalog`, ab etwa Zeile 53: umbenennen. Erwartet jetzt 0 Produkte und `skippedGlobalProducts == 2`.
- `StoreReadinessResourceTest`, Zeilen 60-66: Bei 0 Beacons RED mit `NO_BEACONS` erwarten.

Neue Tests:

- Regale ohne Produkte: RED mit genau einem `NO_STORE_PRODUCTS` und keinen `SHELF_WITHOUT_PRODUCTS`.
- Beacon-Elemente ohne vollständige Identität: `NO_BEACONS` plus die bestehenden `BEACON_WITHOUT_IDENTITY`-Warnungen.
- `readyStoreIsGreenWithoutFindings` bleibt **unverändert GREEN**. Das ist der Gegenbeweis, dass ein vollständiger Markt weiter „Bereit“ ist.

Ausführen, alle grün:

```bash
cd backend/indooro_server && sh ./mvnw test
cd admin-ui && npm ci && npm test && npm run typecheck && npm run test:browser
npm ci && npm run contract:check && npm run contract:test
npx -y @fission-ai/openspec@1.3.1 validate --all --strict
```

`mvnw` ist im Repo nicht ausführbar, deshalb `sh ./mvnw`. Die Dateirechte nicht ändern.

CI muss grün sein: `backend-test`, `contract`, `mobile-contract`, `swift-tests`, `build-and-push`.

- Meldet der Breaking-Change-Check im Job `contract` (oasdiff) die neuen Enum-Werte, nicht umgehen. Im PR begründen und Erik entscheiden lassen.
- Bekannte CI-Störungen (Docker Hub 500, wackeliger `AnchorScanUITests`): zuerst den Job neu starten, nicht den Code ändern.

## Fertig heißt

1. Ein Markt mit Eingang und Beacons, aber ohne Regale und ohne Produkte, ist **RED** mit `NO_SHELVES` und `NO_STORE_PRODUCTS`.
2. Ein Markt mit Regalen, aber 0 eigenen Produkten (auch bei vorhandenem Altkatalog), ist **RED** mit `NO_STORE_PRODUCTS`.
3. Ein Markt ohne platzierte, vollständige Beacons ist **RED** mit `NO_BEACONS`.
4. Ein vollständiger Markt bleibt **GREEN**. Keine Regel wurde gelockert.
5. OpenAPI-Enum, generierte Typen, Checkliste und `MARKT_EINRICHTEN.md` sind konsistent.
6. Alle oben genannten Tests und alle CI-Jobs sind grün.
7. Der PR ist offen gegen `main` und nicht gemergt. Die PR-Beschreibung enthält:
   - Vorher und Nachher als Tabelle, die drei Fälle plus „vollständiger Markt“.
   - Die erwartete Live-Wirkung nach dem Deploy: `SPAR-Leonding-001`, `Spar-Hörsching-001` und `HA-01` werden RED mit `NO_STORE_PRODUCTS`. Der Testraum `SPAR-Leonding-002` bekommt keine neuen Befunde, weil er Regale, 74 eigene Produkte und 4 Beacons hat.
   - Den Hinweis, dass Deploy (T4) und Manifest-PR (T10) danach folgen.

## Rückmeldung an die Hauptsession

Kurzbericht mit:

- PR-Link
- Liste der geänderten Dateien
- Testergebnissen (Anzahl grün, Auffälligkeiten)
- offenen Fragen, zum Beispiel ob oasdiff etwas gemeldet hat oder ob die OpenSpec-Change angelegt wurde
