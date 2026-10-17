# Evidence: add-store-pilot-readiness-check (lokaler Vollstack, 2026-10-16)

Stack: Quarkus Dev-Modus (Branch `pilot/store-readiness`), PostgreSQL 17, OpenSearch 2.9, Keycloak 26 (Realm-Import aus `keycloak/realm`), alles nur auf localhost und getrennt von anderen lokalen Stacks. Daten: `python3 scripts/dev/seed_readiness_demo.py` (Region, zwei Stores, Layout, 5 Beacons, 12 Produkte).

| Datei | Zeigt |
|---|---|
| `api-readiness-demo-mitte.json` | echte Antwort von `GET /api/stores/{id}/readiness?radius=8` (Admin): Status RED, 2 blockierend (Produkte ohne Regal), 2 Warnungen (Regal ohne Produkte, Beacon-Abdeckung) |
| `api-readiness-demo-leer.json` | Store ohne aktives Layout: `NO_ACTIVE_LAYOUT` |
| `01-readiness-demo-mitte.png` | Seite „Pilot-Bereitschaft“ mit genau diesen Antworten gerendert |
| `02-readiness-demo-leer.png` | Leerzustand |

Zugriff: Admin 200, Store-Manager ohne Zuordnung zu diesem Store 403, ohne Token 302 (Login). Die Screenshots entstanden mit dem gebauten Admin gegen die echten JSON-Antworten (Routen-Mock im Browser); der Login im echten Browser wurde dabei nicht durchgespielt.

Gefunden und behoben: Die Abdeckung zeigte bei 563 von 564 Zellen „100 %“ (gerundet); jetzt eine Nachkommastelle („99,8 %“).

Hinweis zum Seed: Der Index `products` muss mit `keyword`-Mapping für `storeId`/`storeCode` existieren (Endpunkt `createIndex` in `OpenSearchService`). Ein dynamisch angelegter Index mappt beide Felder als `text`, dann findet der `term`-Filter von `StoreProductSource` nichts. Der Seed legt den Index entsprechend an.
