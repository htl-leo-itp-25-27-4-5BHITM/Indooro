# Katalog-Migration auf store-scoped Produkte

## Zweck

Stand 2026-10-17 liegen alle 153 Live-Produkte ohne Markt (`storeId` und `storeCode` leer) im OpenSearch-Index `products` mit Doc-ID `<id>`. Das neue Backend schreibt store-scoped: Doc-ID `<storeCode>:<id>`, und jeder Schreibzugriff braucht einen Markt. Diese Anleitung überführt den Bestand in einen Markt und entfernt danach die Altdokumente.

Die Produkte liegen nur im OpenSearch-Index, nicht in Postgres. Ein Postgres-Dump (`backup_postgres.py`) sichert sie deshalb nicht. Das Backup ist der Produkt-Export mit `export_products.py`.

Werkzeug: `scripts/ops/migrate_products_to_store.py` (Standard: Dry-Run; Schreiben nur mit `--apply`, Löschen nur mit `--delete-legacy --yes`).

Platzhalter: `<DEMO_STORE_CODE>` ist der Markt-Code des Demo-Markts. Diese Entscheidung ist offen. Markt-Codes stehen in der Datenbank-Tabelle `stores`. Pilotmarkt ist `SPAR-Leonding-001`.

## Vorbedingungen

- Backup nach `BACKUP_RESTORE.md`. Die Datei liegt im Branch `pilot/release-backend` unter `docs/pilot-readiness/operations/BACKUP_RESTORE.md` und ist auf diesem Branch noch nicht vorhanden.
- Python 3.10+ und `kubectl` mit gültiger LeoCloud-Anmeldung (Namespace `student-it220209`).
- Admin-Token mit Admin-Rolle, aus einer eingeloggten Sitzung bzw. über Keycloak. Das Token wird nur in die Umgebungsvariable `INDOORO_ADMIN_TOKEN` gelegt, nie in eine Datei, nie in die Befehlszeile und nie in den Chat. Vor dem Schreiben im Terminal verdeckt einlesen und nach dem Lauf mit `unset INDOORO_ADMIN_TOKEN` entfernen.
- Backups liegen in `backups/` und werden nie committet.

## Reihenfolge

1. **Backup.** Produkt-Export als NDJSON:

   ```bash
   python3 scripts/ops/export_products.py --base-url https://it220209.cloud.htl-leonding.ac.at
   ```

   Ergebnis: `backups/<UTC-Datum>-products.ndjson`. Die Datei ist die Grundlage für alle folgenden Schritte und für den Rollback. Eine Kopie auf einen sicheren Datenträger legen.

2. **Backend-Release mit Store-Katalog ausrollen.** Ablauf wie im Release-Runbook (`RELEASE_RUNBOOK.md`, Branch `pilot/release-backend`). Die Variable `CATALOG_DEFAULT_STORE_CODE` wird jetzt noch **nicht** gesetzt.

3. **Dry-Run.** Die Export-Datei als Quelle verwenden, nicht die Live-Daten:

   ```bash
   python3 scripts/ops/migrate_products_to_store.py --store-code <DEMO_STORE_CODE> \
       --input backups/<UTC-Datum>-products.ndjson
   ```

   Erwartet: `Produkte gesamt: 153`, `Ohne Markt (zu migrieren): 153`, kein `FEHLER`, Exit 0. Die Datei `backups/<UTC-Datum>-products-<DEMO_STORE_CODE>.ndjson` enthält die Produkte mit `storeCode`. Es werden keine Schreibzugriffe ausgeführt.

4. **Migration schreiben (`--apply`).** Das Token muss in der Umgebungsvariable stehen:

   ```bash
   python3 scripts/ops/migrate_products_to_store.py --store-code <DEMO_STORE_CODE> \
       --input backups/<UTC-Datum>-products.ndjson \
       --apply --base-url https://it220209.cloud.htl-leonding.ac.at
   unset INDOORO_ADMIN_TOKEN
   ```

   Das Skript sendet in Blöcken à 100 an `POST /api/products/bulk?storeCode=<DEMO_STORE_CODE>`. Enthält ein Block Zeilen mit Fehler oder unbekanntem Ergebnis, bricht es ab und sendet keine weiteren Blöcke. Der Bulk-Import ist nicht atomar. Ein erneuter Lauf mit derselben Export-Datei ist sicher, weil die Doc-IDs deterministisch sind (`<storeCode>:<id>`).

   Nach dem Schreiben nicht mehr mit `--base-url` (Live-Daten) prüfen. Während der Übergangszeit existieren `<id>` und `<storeCode>:<id>` nebeneinander. Das Skript meldet die doppelten IDs dann als Fehler (Exit 1). Das ist beabsichtigt. Für Kontrollen gilt Schritt 5.

5. **Kontrolle.** Suche im Demo-Markt:

   ```bash
   curl -s "https://it220209.cloud.htl-leonding.ac.at/api/products/search?q=milch&storeCode=<DEMO_STORE_CODE>"
   ```

   Erwartet: mindestens ein Treffer mit `storeCode` `<DEMO_STORE_CODE>`. Zusätzlich die Anzahl der Dokumente im Index prüfen (Schritt 6, Dry-Run zeigt die Zahlen).

6. **Legacy-Dokumente entfernen.** OpenSearch ist nicht öffentlich. Der Zugriff läuft über einen Port-Forward, in einem zweiten Terminal offen lassen:

   ```bash
   kubectl -n student-it220209 port-forward svc/opensearch 9200:9200
   ```

   Dry-Run, danach Löschen:

   ```bash
   python3 scripts/ops/migrate_products_to_store.py --store-code <DEMO_STORE_CODE> \
       --delete-legacy --opensearch-url http://127.0.0.1:9200
   python3 scripts/ops/migrate_products_to_store.py --store-code <DEMO_STORE_CODE> \
       --delete-legacy --opensearch-url http://127.0.0.1:9200 --yes
   ```

   Das Skript zählt Dokumente ohne `storeCode` (Legacy) und Dokumente im Markt. Es löscht nur, wenn Legacy > 0 und Migrierte ≥ Legacy. Sonst bricht es mit Exit 1 ab. Ohne `--yes` passiert nichts. Nur Loopback-Adressen sind als `--opensearch-url` erlaubt.

7. **Default-Markt setzen.** Erst jetzt `CATALOG_DEFAULT_STORE_CODE=<DEMO_STORE_CODE>` im Backend-Deployment setzen. Der Env-Eintrag in `k8s/backend.yaml` gehört zum Release (Schritt 2). Der Default-Markt wirkt auf Lesezugriffe ohne Markt-Parameter. Er soll erst greifen, wenn alle Dokumente im Markt liegen.

8. **Pilotmarkt-Produkte laden.** Die Produktdaten des Pilotmarkts (NDJSON ohne Markt, z. B. aus `scripts/pilot-data`) laufen über dasselbe Skript:

   ```bash
   python3 scripts/ops/migrate_products_to_store.py --store-code SPAR-Leonding-001 \
       --input <pilot-produkte>.ndjson --apply --base-url https://it220209.cloud.htl-leonding.ac.at
   ```

   Ist der Demo-Markt der Pilotmarkt, entfällt dieser Schritt, weil Schritt 4 die Produkte bereits geladen hat. Doppelte IDs im Bestand werden vom Skript abgelehnt.

9. **Rollback.**
   - Vor Schritt 6: Das Backend auf das vorherige Image zurücksetzen (Release-Runbook). Die Legacy-Dokumente `<id>` sind noch da, der alte Stand ist vollständig.
   - Ab Schritt 6: Der Bulk-Import ohne Markt ist nicht mehr möglich. Das alte Image zurücksetzen und den Index aus der Export-Datei neu befüllen. Die NDJSON-Datei muss vorher in ein JSON-Array umgewandelt werden (`jq -s . backups/<UTC-Datum>-products.ndjson > products-array.json`). Danach `POST /api/products/bulk` des alten Images mit `Authorization: Bearer $INDOORO_ADMIN_TOKEN` und `--data @products-array.json`.
   - Produkte, die in Schritt 8 hinzugekommen sind, fehlen im Export. Sie müssen aus ihrer Quelle erneut geladen werden.

## Lokale Probe

<!-- Ergebnis der lokalen Probe: wird nachgetragen. -->
