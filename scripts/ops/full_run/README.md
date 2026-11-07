# Lokaler Full-Run: Markt-Einrichtung (Story #194)

Ein Befehl, der den kompletten Einrichtungsweg eines Marktes lokal und reproduzierbar durchspielt, ohne Kontakt zum Live-System.

```
scripts/ops/full_run/run_full_local.sh                                   # Demo-Kit (docs/pilot-readiness/kit/demo)
scripts/ops/full_run/run_full_local.sh docs/pilot-readiness/kit/spar-markt   # anderer Datensatz
scripts/ops/full_run/run_full_local.sh <dataset-dir> <out-dir>            # Ausgabeordner wählen
```

Ausgabe: `target-full-run/<datensatz>/` mit `payload.json`, `report.md` (Schritte, Zeiten, Readiness vorher/nachher, Suchergebnisse) und `maven.log`. Zeilen `STEP n ok: …` erscheinen auch auf der Konsole.

Voraussetzungen: Docker, JDK 21, Node 22+ (`npm ci` in `admin-ui` läuft bei Bedarf automatisch), `openssl`. Das Skript startet Wegwerf-Container (`postgres:16` auf 127.0.0.1:55432, `opensearch:2.9.0` auf 127.0.0.1:59200, Security aus), erzeugt ein Zufallspasswort (wird nie ausgegeben) und löscht die Container am Ende (`trap`). Ports lassen sich mit `FULLRUN_PG_PORT` und `FULLRUN_OS_PORT` ändern.

## Was der Lauf beweist

1. `prepare.mjs` prüft Layout-JSON und CSVs mit dem echten Produktionscode des Admin-UI (`parseImportedDocument`, `reviewCsvImport`, `runCatalogImport` mit aufzeichnendem Adapter, also derselbe Bulk-Body, dieselbe Blockbildung, derselbe `Idempotency-Key` wie in der Oberfläche).
2. `StoreOnboardingFullRunIT` (Quarkus, echte PostgreSQL mit Flyway, echter OpenSearch mit Repo-Mapping) ruft nur echte REST-Endpunkte auf:
   Region und Markt anlegen, Beacons registrieren und zuordnen, Layout als Entwurf speichern und aktivieren, Readiness (erwartet RED mit `NO_STORE_PRODUCTS`), Fehler-CSV (genau die dokumentierten Zeilenfehler, danach 0 Produkte im Markt), gute CSV über `/api/admin/products/bulk` samt Idempotenz-Wiederholung, Readiness GREEN, Freigabe, Kundenliste `/api/mobile/stores`, Suche je Markt, Zweitmarkt mit gleichnamigen Produkten in anderen Regalen, Suche ohne Markt (keine marktgebundenen Dokumente).
3. Die Reihenfolge entspricht den Backend-Regeln (Beacons vor dem Aktivieren des Layouts).

## Was er nicht beweist

- Keine Klicks in der Browser-Oberfläche (die Commit-Sperre bei Fehlern kommt aus dem UI-Code, nicht aus dem Server; der Test prüft, dass `reviewCsvImport` die Fehler meldet und dass nichts gesendet wird).
- Keine Keycloak-Anmeldung: `@TestSecurity` (Rolle `admin`), `AdminAccessService` ist gemockt. Rollen und Marktbereiche (Scope) werden nicht geprüft.
- Kein echtes BLE, keine Ortungsgenauigkeit. GREEN heißt nur: technisch vollständig konfiguriert.
- Kein Ingress, kein Kubernetes, keine Live-Daten.

Die Klasse läuft nur mit `-Dfullrun.payload=…`; ohne diese Eigenschaft wird sie übersprungen. Der Name endet auf `IT`, passt also nicht auf die Surefire-Standardmuster, `mvn test` und die CI führen sie nicht aus.

## Befund: Layout-Beacons brauchen die Identity

Die Kit-Layouts nennen Beacons nur über den Code (`"beaconId": "DEMO-B1"`). Die Readiness zählt ein Beacon nur mit `uuid`/`major`/`minor`/`identityKey` im Layout-Element. Der Editor setzt diese Felder, wenn man im Feld „Zugeordneter Beacon“ wählt. Reines Importieren der JSON-Datei ergibt `NO_BEACONS` (RED) und `BEACON_WITHOUT_IDENTITY`. Der Full-Run holt die Identity deshalb aus `/layout/editor-context` und ergänzt sie wie der Editor (Schritt 3). In der echten Demo muss jeder Beacon-Platz im Editor einmal bestätigt werden, oder die Identity gehört in die JSON-Datei.

## Eigenen Datensatz einbinden

Ordner mit `dataset.json` und den Dateien anlegen und den Ordner als Argument übergeben. Schema:

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `storeCode` oder `store.storeCode` | ja | Marktcode, höchstens 50 Zeichen |
| `store` | ja | `name`, `street`, `zipCode`, `city`, `country`, optional `latitude`, `longitude` (fehlende Adressfelder bekommen Testwerte) |
| `files.layout`, `files.csv`, `files.errorCsv` | ja | Pfade relativ zum Ordner |
| `beacons[]` | ja | `code`, `uuid`, `major`, `minor`; jeder `beaconId` im Layout muss hier vorkommen |
| `expectedErrors[]` | ja | `line`, `field`, `message` der Fehler-CSV, exakt und in Reihenfolge (leer = keine) |
| `searchProbes[]` | ja | `query`, `expectProduct`, `expectLayoutCode` (Alias `expectedName`, `expectedLayoutCode`) |
| `expectedProductCount` | nein | erwartete Zahl gültiger Produkte der guten CSV |
| `region` | nein | `code`, `name` (Standard Testregion) |
| `secondMarket` | nein | `storeCode`, Adresse, `products[]` (`id`, `name`, `price`, `layoutCode`); Standard: Produkte der Suchsonden in Regalen `998/…` |
| `name`, `description` | nein | nur Anzeige |

Weitere Felder (`stats`, `expectShelfLabel`, `files.beacons`) werden ignoriert.
