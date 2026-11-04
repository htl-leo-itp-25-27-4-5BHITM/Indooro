# Altbestand ohne Markt entfernen (Task T5)

Anleitung für Erik. Claude Code führt diese Schritte nicht aus: Index-Löschungen bleiben beim Menschen mit Cluster-Zugang.

## Zwei Wege: curl oder Skript

Dieselbe Löschung geht von Hand (Schritte 3 bis 5 unten) oder mit `migrate_products_to_store.py --delete-legacy`. Das Skript wurde angepasst (geprüft am 2026-11-04, nur lesend): Es arbeitet auf `--index` (Standard `products_live`), löst den Alias auf den konkreten Index (`products_v1`) auf und löscht dort. Vor der Änderung zählte und löschte es fest im Index `products`, den das Backend seit 2026-10-19 nicht mehr liest.

Die Sicherung des Skripts (Markt-Dokumente ≥ Legacy-Dokumente) greift live weiter: 74 Dokumente in `SPAR-Leonding-002`, 153 ohne `storeCode`. Hier ist das gewollt anders. Mit `--allow-unmigrated-legacy --backup <Rohsicherung>` entfällt nur diese Prüfung, und nur wenn die Sicherung jede der 153 Legacy-IDs enthält (siehe „Löschen mit dem Skript“).

Die 79 Altprodukte ohne passendes Regal im Testraum werden in keinem Markt gebraucht. Sie bleiben im alten Index `products` und in der Sicherung erhalten.

## Stand vor dem Löschen (2026-11-04)

| Index | Dokumente | ohne `storeCode` | Markt |
|---|---|---|---|
| `products_v1` (Alias `products_live`, live) | 227 | 153 | `SPAR-Leonding-002`: 74 |
| `products` (alt, nicht mehr gelesen) | 227 | 153 | bleibt unverändert und dient als Rollback-Quelle |

## Was sich danach ändert

- Einzelne Produkte im Admin lassen sich wieder speichern und löschen; die Fehlermeldung 409 („Legacy products without storeCode still exist“) entfällt.
- Eine Suche oder Liste ohne Markt liefert `[]`. Kunden-Web und iOS senden den Markt mit, sobald einer gewählt ist.
- Der Smoke-Check ohne Markt meldet WARN für die drei Märkte ohne eigene Produkte. Das ist erwartet und kein FAIL.

## Ablauf

Alle Befehle im Repo-Wurzelverzeichnis. Zwei Terminals.

### 1. Sicherung

```bash
python3 scripts/ops/backup_postgres.py --namespace student-it220209
```

`export_products.py --base-url` reicht hier nicht: Seit Release `4cb1e03` liefert `GET /api/products` ohne Markt nur noch die Altdokumente. Den ganzen Index sichert `export_products.py --opensearch-url` (nach Schritt 2) oder die Rohsicherung in Schritt 3.

### 2. Port-Forward (Terminal 2, offen lassen)

```bash
kubectl -n student-it220209 port-forward svc/opensearch 9200:9200
```

### 3. Nur lesen: Zählen und Rohsicherung

```bash
O=http://127.0.0.1:9200
LEGACY='{"query":{"bool":{"must_not":{"exists":{"field":"storeCode"}}}}}'
curl -s "$O/_cat/aliases/products_live?h=alias,index"
curl -s -H 'Content-Type: application/json' "$O/products_v1/_count" -d "$LEGACY"
curl -s "$O/products_v1/_count"
curl -s "$O/products_v1/_search?size=1000" > "backups/$(date -u +%F)-products_v1-raw.json"
python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(len(d['hits']['hits']), 'Dokumente gesichert')" "backups/$(date -u +%F)-products_v1-raw.json"
```

Erwartet:
- Der Alias zeigt `products_live products_v1`.
- 153 Dokumente ohne Markt, 227 insgesamt.
- Die Rohsicherung enthält 227 Dokumente.

**Bei Abweichung hier aufhören.**

### 4. Löschen (der einzige Schreibschritt)

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  "$O/products_v1/_delete_by_query?refresh=true" -d "$LEGACY"
```

Erwartet in der Antwort: `"deleted":153` und `"failures":[]`. Den Index direkt (`products_v1`) angeben, nicht den Alias, und nie `products`.

### 5. Kontrolle

```bash
curl -s -H 'Content-Type: application/json' "$O/products_v1/_count" -d "$LEGACY"   # 0
curl -s "$O/products_v1/_count"                                                    # 74
B=https://it220209.cloud.htl-leonding.ac.at
curl -s "$B/api/products/search?q=milch"                                          # []
curl -s "$B/api/products/search?q=milch&storeCode=SPAR-Leonding-002"              # 2 Treffer
bash scripts/ops/smoke_check.sh "$B" SPAR-Leonding-002 milch                      # 0 FAIL
```

Im Admin (`/admin/next/`, als Admin eingeloggt): ein Testraum-Produkt öffnen und unverändert speichern. Erwartet: gespeichert, kein 409.

Danach den Port-Forward in Terminal 2 beenden.

### 6. Protokoll

In `docs/pilot-readiness/releases/RELEASE_2026-11-04.md` einen Nachtrag schreiben: Zählungen vorher und nachher, Name der Rohsicherung, Smoke-Check-Ergebnis.

## Löschen mit dem Skript

Statt Schritt 4 von Hand. Port-Forward (Schritt 2) offen. Die Vollsicherung des Index (Schritt 1 oder 3) liegt in `backups/`:

```bash
python3 scripts/ops/export_products.py --opensearch-url http://127.0.0.1:9200   # -> backups/<UTC-Datum>-products-all.ndjson
python3 scripts/ops/migrate_products_to_store.py --store-code SPAR-Leonding-002 --delete-legacy \
    --opensearch-url http://127.0.0.1:9200 --allow-unmigrated-legacy \
    --backup backups/<UTC-Datum>-products-all.ndjson            # Dry-Run
```

Erwartete Ausgabe: `Index: products_live -> products_v1`, `ohne storeCode 153, in Markt SPAR-Leonding-002 74`, `Sicherung ... enthaelt alle 153 Legacy-IDs.`, `DRY-RUN`. Bei Abweichung hier aufhören (Exit 1 heißt: nichts gelöscht). Erst dann mit `--yes` wiederholen. Die Rohsicherung aus Schritt 3 (`..._search`-Antwort) ist als `--backup` ebenso erlaubt.

## Rollback

Die 153 Dokumente aus dem alten Index zurückholen; die IDs bleiben gleich:

```bash
curl -s -X POST -H 'Content-Type: application/json' "$O/_reindex?refresh=true" -d '{
  "source": {"index": "products", "query": {"bool": {"must_not": {"exists": {"field": "storeCode"}}}}},
  "dest": {"index": "products_v1"}
}'
```

Erwartet: `"created":153`. Ist der alte Index nicht mehr da, aus der Rohsicherung von Schritt 3 die Treffer ohne `storeCode` per `_bulk` nach `products_v1` schreiben.

## Nicht tun

- Den Index `products` nicht löschen. Er ist die Rollback-Quelle.
- `CATALOG_DEFAULT_STORE_CODE` nicht setzen.
- `--index products` nicht angeben. Der Standard `products_live` ist der Index, den das Backend liest.
- `--allow-unmigrated-legacy` nicht ohne eine geprüfte Sicherung verwenden.
