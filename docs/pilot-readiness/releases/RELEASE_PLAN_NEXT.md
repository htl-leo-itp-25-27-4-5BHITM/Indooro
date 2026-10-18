# Rollout-Plan: nächster Release (Entwurf)

Stand: 2026-10-18. Basis: `origin/pilot/first-store` (Merge #148, `2d28580`). Live läuft `ghcr.io/htl-leo-itp-25-27-4-5bhitm/indooro-backend-v2:a47c5e6` (Namespace `student-it220209`, Deployment `indooro-backend`, Schema V15). Vorlage: `RELEASE_2026-10-17.md`. Allgemeiner Ablauf: `../operations/RELEASE_RUNBOOK.md`.

Dieses Dokument ist **nur Planung**. Es wurde nichts gegen den Cluster ausgeführt. Alle `kubectl`-, `psql`- und Admin-Token-Schritte macht ein Mensch mit Cluster-Zugang (Abschnitt 6). Claude Code gibt keine Passwörter oder Tokens ein.

Platzhalter in `<…>` sind offen und müssen vor dem Lauf ersetzt werden. Es stehen keine Secret-Werte in diesem Dokument.

## 1. Was sich seit `a47c5e6` geändert hat

Quelle: `git log a47c5e6..origin/pilot/first-store --merges`. 29 Pull Requests. Spalte „Wirkung“ sagt, was beim Rollout zählt.

| PR | Inhalt | Wirkung |
|---|---|---|
| #110 | Admin-Parität (Editor, Seiten) | Admin-UI im Jar |
| #121 | iOS: bewegungsgestützte Positionierung hinter Flag | nur App-Build |
| #122 | iOS: Pilot-Build und Studienmodus (Integration Person A) | nur App-Build |
| #123 | Härtung Phase A (Release-Backend) | Backend, Konfiguration, k8s-Manifeste |
| #124 | Beacon-Platzierungsplaner | Werkzeug, Admin-Editor |
| #125 | Pilot-Auswertungswerkzeug | Werkzeug, kein Deploy-Effekt |
| #126 | Produkte pro Markt (`storeCode`) | Backend, Suchindex, **Katalog-Migration nötig** |
| #127 | Feldmessung: Protokoll und Skripte | Doku, Skripte |
| #128 | Bessere Produktsuche (deutsche Analyse, Reindex, Alias) | Backend, **Reindex nötig** |
| #129 | Store-Betrieb: Datenkonventionen, CSV-Konverter, Pilot-Kit | Doku, Skripte |
| #130 | iOS: Produktanfragen pro Markt | nur App-Build, setzt #126 voraus |
| #131 | CSV-Import im Admin | Backend, Admin-UI |
| #132 | Customer-Web: Produktfinder pro Markt (US-26) | `/customer/` im Jar |
| #133 | iOS: Barrierefreiheit | nur App-Build |
| #134 | Härtung Phase B (Release-Backend B) | Backend, Konfiguration |
| #135 | Beacon-Abdeckung im Editor (US-36) | Admin-UI |
| #136 | Merge `main` (Härtung A+B) in `pilot/first-store` | Sammelmerge von #123/#134 |
| #137 | OpenSpec: Sprint 2 archiviert | Doku |
| #138 | Schreibschutz für Legacy-Endpunkte | Backend: HTTP 409 auf Legacy-Schreibzugriffe, bis der Legacy-Katalog gelöscht ist |
| #139 | Admin-Dashboard: Vertragsdrift | Admin-UI |
| #140 | iOS: Ankunftsvorschlag | nur App-Build |
| #141 | Security-Baseline (Repo-Seite) | **V16, V17**, Secrets ohne Default, CORS, Auth-Regeln, k8s (`runAsNonRoot`, NetworkPolicy, Keycloak, Ingress) |
| #142 | Durchsetzbarer API-Vertrag | OpenAPI, Typen, Tests |
| #143 | iOS: Vertragsdrift | nur App-Build |
| #144 | Datenzugriff: N+1, Paging-Grenzen | **V18** (Indizes, Constraints) |
| #145 | iOS: UI-Test-Helper | nur Tests |
| #146 | Upsell: Qualitätsprüfung und Anfrage-Lebenszyklus | Backend, Rate-Limits |
| #147 | iOS: IndooroKit / IndooroNetworking | nur App-Build |
| #148 | LayoutElement-Vertrag (`id`/`meter`/`category`) | OpenAPI, Customer-Typen, Validator-Test |

Backend-Verhalten, das sich ändert und Clients treffen kann (`application.properties`):

- `DB_PASSWORD` und `OIDC_CLIENT_SECRET` haben **keinen Default** mehr. Fehlen sie im Pod, startet das Backend nicht.
- CORS ist nicht mehr `*`. Erlaubt sind `https://it220209.cloud.htl-leonding.ac.at`, `https://www.indooro.at`, `https://indooro.at` (überschreibbar mit `CORS_ORIGINS`). Andere Web-Herkunft bricht.
- `/api/products*` und `/api/layout*` sind nur noch für GET/HEAD öffentlich. POST/PUT/PATCH/DELETE brauchen Login. `%prod` lehnt nicht annotierte Endpunkte ab (`deny-unannotated-endpoints`).
- Neue Rate-Limits für Mobile-Upsell und schwere Endpunkte. Neue Retention für Fehlerlogs (30 Tage, 50 000 Zeilen).
- Neue Variablen: `OPENSEARCH_INDEX` (Default `products`), `OPENSEARCH_ALIAS` (Default `products_live`), `CATALOG_DEFAULT_STORE_CODE` (Default leer = kein Marktfilter).

Die iOS-Änderungen (#121, #122, #130, #133, #140, #143, #145, #147) kommen erst mit einem App-Build auf die Geräte. Sie sind nicht Teil des Cluster-Rollouts. #130 sendet `storeCode`; ältere Suchen ohne `storeCode` nutzen den Default-Markt.

## 2. Flyway-Migrationen seit V15

Live ist V15. Das neue Image führt V16–V18 beim Start aus (Flyway, in dieser Reihenfolge). Alle drei laufen automatisch beim ersten Start des neuen Pods.

| Version | Datei | Wirkung | Risiko | Vorabprüfung |
|---|---|---|---|---|
| V16 | `V16__audit_actor_subject.sql` | `audit_logs.actor_subject VARCHAR(120)`, nullable | niedrig. Spalte ist nullable, das alte Image ignoriert sie | keine |
| V17 | `V17__disable_demo_access_outside_dev.sql` | setzt die drei Demo-Zugänge aus V4/V5 auf `DISABLED`. Subjects `11111111-…` (admin), `22222222-…` (region), `33333333-…` (store). Der Platzhalter `demoAccess` ist in Prod `false` | **hoch: Aussperrung.** Danach hat nur noch eine echte, aktive Zeile in `user_access_assignments` Admin-Rechte. Ein Image-Rollback macht V17 **nicht** rückgängig | echten Admin anlegen (Schritt 2) |
| V18 | `V18__persistence_indexes_and_constraints.sql` | eindeutige Indizes auf `lower(code)` für `regions`, `recipe_tags`, `stores`, `beacons` (`beacon_code`), `recipes` (`slug`); `CHECK` major/minor 0..65535 auf `beacons`; Index `audit_logs(created_at)`; Upsell-Cache-/Dismissal-Indizes; alten Upsell-Lookup-Index gelöscht; `pg_trgm`-Indizes für Rezeptsuche | mittel. Die Migration **bricht ab**, wenn Groß-/Kleinschreibungs-Duplikate oder außerhalb liegende major/minor-Werte existieren. Der Pod geht dann in CrashLoop (PostgreSQL-DDL ist transaktional, es bleibt kein halber Stand). `pg_trgm` wird übersprungen, wenn `CREATE EXTENSION` nicht erlaubt ist (nur Hinweis) | Prüf-SQL unten |

Prüf-SQL für V18, **vor dem Rollout** lesend gegen die Live-Datenbank (Mensch, siehe Schritt 1). Alle Abfragen müssen 0 Zeilen liefern:

```sql
SELECT 'regions' AS t, lower(code) AS k, count(*) FROM regions GROUP BY lower(code) HAVING count(*) > 1
UNION ALL SELECT 'recipe_tags', lower(code), count(*) FROM recipe_tags GROUP BY lower(code) HAVING count(*) > 1
UNION ALL SELECT 'stores', lower(store_code), count(*) FROM stores GROUP BY lower(store_code) HAVING count(*) > 1
UNION ALL SELECT 'beacons', lower(beacon_code), count(*) FROM beacons GROUP BY lower(beacon_code) HAVING count(*) > 1
UNION ALL SELECT 'recipes', lower(slug), count(*) FROM recipes GROUP BY lower(slug) HAVING count(*) > 1;

SELECT beacon_code, major, minor FROM beacons
WHERE major NOT BETWEEN 0 AND 65535 OR minor NOT BETWEEN 0 AND 65535;
```

Zusätzlich zur Information: `SELECT version, success FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 3;` muss V15 mit `success = t` zeigen.

Rückwärts-Kompatibilität: Das alte Image (`:a47c5e6`) kennt V16–V18 nicht. Flyway ignoriert unbekannte neuere Migrationen standardmäßig (`ignoreMigrationPatterns=*:future`). Das ist **nicht getestet**. Bleibt der alte Pod nach Rollback in einem Flyway-Validierungsfehler hängen, hilft nur der DB-Restore aus dem Backup (Rollback Schritt 4).

## 3. Reihenfolge der Schritte

Wartungsfenster einplanen. Der Pod startet neu (kurze Unterbrechung). Für Katalog-Migration bis Aktivierung gilt ein **Schreibstopp** auf Produkte (Admin, CSV-Import).

Pfade im Dokument: `NS=student-it220209`, `BASE=https://it220209.cloud.htl-leonding.ac.at`.

### Schritt 0: Vorbereitung (kein Eingriff in den Cluster)

1. Release-PR `pilot/first-store` → `main` mergen (Mensch). Das CI baut auf `main` das Image (Admin-UI über `package:candidate`). Neuen Tag `<NEUER_TAG>` notieren (Commit-SHA, 7 Zeichen) und im GHCR prüfen.
2. Entscheiden: `<DEMO_STORE_CODE>` (Markt, der den bestehenden Katalog bekommt; Pilotmarkt ist `SPAR-Leonding-001`). Das ist laut `CATALOG_MIGRATION.md` noch offen.
3. Echten Admin-Benutzer festlegen: Keycloak-Benutzer, dessen Subject (`sub`) bekannt ist (Schritt 2).
4. Pre-Check der Live-Umgebung des Backends (nur Namen anzeigen, keine Werte):
   ```bash
   kubectl -n student-it220209 get deploy indooro-backend -o jsonpath='{range .spec.template.spec.containers[0].env[*]}{.name}{"\n"}{end}'
   ```
   `DB_PASSWORD` und `OIDC_CLIENT_SECRET` (bzw. `QUARKUS_OIDC_CREDENTIALS_SECRET`) müssen in der Liste stehen. Fehlt eine, nicht ausrollen.

### Schritt 1: Backup (vor jeder Änderung)

```bash
python3 scripts/ops/backup_postgres.py --dry-run
python3 scripts/ops/backup_postgres.py          # -> backups/<UTC-Datum>-indooro.dump
python3 scripts/ops/export_products.py --base-url https://it220209.cloud.htl-leonding.ac.at   # -> backups/<UTC-Datum>-products.ndjson
```

Ablauf wie im Vorgängerrelease: PGDMP-Magic, Größe, SHA-256 notieren, Dump außerhalb des Repos ablegen (`backups/` ist in `.gitignore`). Zusätzlich die V18-Prüf-SQL aus Abschnitt 2 ausführen. OpenSearch hat kein eigenes Backup: Der Produktexport (NDJSON) ist die Sicherung des Katalogs.

Zusätzlich den heutigen Image-Digest sichern (für Rollback):

```bash
kubectl -n student-it220209 get deploy indooro-backend -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
kubectl -n student-it220209 get pods -l app=indooro-backend -o jsonpath='{.items[0].status.containerStatuses[0].imageID}{"\n"}'
```

**Rollback:** nicht nötig (nur Lesen und Sichern).

### Schritt 2: Echten Admin in `user_access_assignments` anlegen (vor dem neuen Image)

V17 deaktiviert beim Start die Demo-Zugänge. Ohne echte Zeile ist danach **niemand** mehr Admin. Die Zeile muss **vorher** existieren und `ACTIVE` sein.

`<KEYCLOAK_SUB>` ist die Keycloak-User-ID (Claim `sub`) des echten Admins **in dem Realm, den das Backend zu dem Zeitpunkt benutzt**. Wechselt später der Realm (Keycloak-Umstellung, Abschnitt 5), ändert sich das Subject. Dann muss die Zeile neu angelegt werden.

```sql
INSERT INTO user_access_assignments
  (id, keycloak_subject, username, email, role, region_id, store_id, status, created_at, updated_at)
VALUES
  (gen_random_uuid(), '<KEYCLOAK_SUB>', '<USERNAME>', '<EMAIL>', 'admin', NULL, NULL, 'ACTIVE', now(), now());
```

Regeln aus dem Schema (V4): Rolle `admin` verlangt `region_id` und `store_id` NULL; pro `keycloak_subject` darf nur eine `ACTIVE`-Zeile existieren. Zugriff auf die DB: `kubectl -n student-it220209 exec -it deploy/postgres -- psql -U indooro -d indooro` (Mensch). Danach prüfen:

```sql
SELECT username, role, status FROM user_access_assignments WHERE role = 'admin' AND status = 'ACTIVE';
```

Mindestens eine Zeile muss ein echter Mensch sein, nicht ein Demo-Subject.

**Rollback:** `DELETE FROM user_access_assignments WHERE keycloak_subject = '<KEYCLOAK_SUB>';` (nur wenn die Zeile falsch war). Die Zeile schadet sonst nicht.

### Schritt 3: Neues Image (non-root) rollen

Das neue Image läuft als `USER 10001` (Dockerfile). Das alte `:a47c5e6` ist ein Root-Image: Es darf **nicht** mit den neuen Manifest-Einstellungen `runAsNonRoot` zusammen laufen. Immer den neuen Tag setzen.

Standardweg (wie am 2026-10-17, ändert nur das Image, übernimmt die Umgebung des laufenden Deployments):

```bash
kubectl -n student-it220209 set image deployment/indooro-backend indooro-backend=ghcr.io/htl-leo-itp-25-27-4-5bhitm/indooro-backend-v2:<NEUER_TAG>
kubectl -n student-it220209 rollout status deployment/indooro-backend --timeout=300s
kubectl -n student-it220209 logs deploy/indooro-backend --tail=300 | grep -iE 'ERROR|Exception|flyway|migrat'
```

Erwartung: Flyway meldet V16, V17, V18 als angewendet, kein ERROR, 0 Neustarts. Danach:

```bash
kubectl -n student-it220209 exec deploy/indooro-backend -- id -u          # erwartet 10001
```

Alternativ das Manifest anwenden (`k8s/backend.yaml`: `runAsNonRoot`, `readOnlyRootFilesystem`, Probes auf `/q/health/live` und `/q/health/ready`, `DB_PASSWORD` aus Secret, Service `ClusterIP`). Das **setzt Secret `indooro-postgres-secret` (Key `POSTGRES_PASSWORD`) voraus** und ändert mehr als das Image. Vorher in `k8s/backend.yaml` den Tag `a47c5e6` auf `<NEUER_TAG>` setzen. Empfehlung: erst Standardweg, `backend.yaml` später als eigener, bewusster Schritt (Abschnitt 4).

Wirkung beim ersten Start: V17 sperrt die Demo-Zugänge. Prüfen, dass sich der echte Admin einloggen kann (Smoke-Check Schritt 8, Teil „nach Login“).

**Rollback Schritt 3:** vorheriges Image zurücksetzen (Digest aus Schritt 1 oder `…:a47c5e6`):

```bash
kubectl -n student-it220209 set image deployment/indooro-backend indooro-backend=ghcr.io/htl-leo-itp-25-27-4-5bhitm/indooro-backend-v2@<VOLLSTAENDIGER_DIGEST_AUS_SCHRITT_1>
```

(Der Digest von `:a47c5e6` steht in `RELEASE_2026-10-17.md` nur gekürzt. Den vollständigen Wert aus Schritt 1 benutzen oder `…-v2:a47c5e6` als Tag setzen.) **V16–V18 und V17 bleiben bestehen.** Wurde V17 angewendet und ein Demo-Zugang wird für den Rollback gebraucht:
```sql
UPDATE user_access_assignments SET status = 'ACTIVE', updated_at = now()
WHERE keycloak_subject IN ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333');
```
Nur bewusst und nur vorübergehend, weil das Demo-Konto bekannte Zugangsdaten hat. Schlägt Flyway im alten Image fehl: DB-Restore aus Schritt 1 (`restore_postgres.py` prüft den Dump zuerst lokal; Einspielen in den Cluster per `pg_restore` ist ein Eingriff mit Freigabe).

### Schritt 4: Rollout prüfen (Basis)

```bash
scripts/ops/smoke_check.sh https://it220209.cloud.htl-leonding.ac.at
```

Das Skript ist nur lesend und ohne Anmeldung (Abschnitt 7). Alles ok, bevor es weitergeht. Pod-Digest, Neustarts und Logs wie in `RELEASE_2026-10-17.md` festhalten.

**Rollback:** wie Schritt 3.

### Schritt 5: Katalog-Migration

Quelle: `../operations/CATALOG_MIGRATION.md`. Der Admin-Token wird verdeckt gelesen und nie in Datei, CLI oder Chat abgelegt. `CATALOG_DEFAULT_STORE_CODE` bleibt bis Schritt 5.6 **ungesetzt**.

```bash
# 5.1 Dry-Run (keine Schreibzugriffe, erwartet alle Produkte, Exit 0)
python3 scripts/ops/migrate_products_to_store.py --store-code <DEMO_STORE_CODE> --input backups/<UTC-Datum>-products.ndjson

# 5.2 Apply (Mensch mit Admin-Token)
read -s INDOORO_ADMIN_TOKEN && export INDOORO_ADMIN_TOKEN
python3 scripts/ops/migrate_products_to_store.py --store-code <DEMO_STORE_CODE> --input backups/<UTC-Datum>-products.ndjson --apply --base-url https://it220209.cloud.htl-leonding.ac.at
unset INDOORO_ADMIN_TOKEN

# 5.3 Kontrolle
curl -s "https://it220209.cloud.htl-leonding.ac.at/api/products/search?q=milch&storeCode=<DEMO_STORE_CODE>"

# 5.4 Legacy-Produkte löschen (OpenSearch nur per Port-Forward, zweites Terminal offen lassen)
kubectl -n student-it220209 port-forward svc/opensearch 9200:9200
python3 scripts/ops/migrate_products_to_store.py --store-code <DEMO_STORE_CODE> --delete-legacy --opensearch-url http://127.0.0.1:9200
python3 scripts/ops/migrate_products_to_store.py --store-code <DEMO_STORE_CODE> --delete-legacy --opensearch-url http://127.0.0.1:9200 --yes

# 5.5 Optional: Pilotmarkt laden, wenn er nicht der Demo-Markt ist
python3 scripts/ops/migrate_products_to_store.py --store-code SPAR-Leonding-001 --input <pilot-produkte>.ndjson --apply --base-url https://it220209.cloud.htl-leonding.ac.at

# 5.6 Default-Markt setzen (löst einen Rollout aus)
kubectl -n student-it220209 set env deployment/indooro-backend CATALOG_DEFAULT_STORE_CODE=<DEMO_STORE_CODE>
kubectl -n student-it220209 rollout status deployment/indooro-backend --timeout=300s
```

Hinweise: Der Apply ist nicht atomar (Blöcke à 100), bricht bei einem Fehlerblock ab und ist wiederholbar (Dokument-ID `<storeCode>:<id>`). Nach 5.2 nicht mehr gegen die Live-URL dry-runnen (Doppel-IDs, Exit 1, gewollt). Bis die Legacy-Produkte weg sind, antworten Legacy-Schreibzugriffe mit HTTP 409 (#138). Die iOS-Suche ohne `storeCode` nutzt den Default-Markt; der Default darf erst der Pilotmarkt sein, wenn er geladen ist.

**Rollback Schritt 5:**
- Vor 5.4: Katalog bleibt im alten Index vollständig. `CATALOG_DEFAULT_STORE_CODE` entfernen (`kubectl -n student-it220209 set env deployment/indooro-backend CATALOG_DEFAULT_STORE_CODE-`) und bei Bedarf Image zurück (Schritt 3).
- Ab 5.4: Produkte aus `backups/<UTC-Datum>-products.ndjson` wiederherstellen: `jq -s . backups/<UTC-Datum>-products.ndjson > products-array.json`, dann mit dem Admin-Token per `POST /api/products/bulk` des **alten** Images einspielen (`Authorization: Bearer $INDOORO_ADMIN_TOKEN`, `--data @products-array.json`). Pilot-Produkte aus 5.5 fehlen im Export und müssen neu geladen werden.

### Schritt 6: Reindex und Activate

Quelle: `../operations/SEARCH_REINDEX.md`. Voraussetzung: Schritt 5 fertig, Schreibstopp auf Produkte aktiv, Backup vorhanden. Der Bestandsindex `products` bleibt unverändert (Rollback-Ziel).

```bash
BASE=https://it220209.cloud.htl-leonding.ac.at
read -s INDOORO_ADMIN_TOKEN && export INDOORO_ADMIN_TOKEN

# 6.1 Reindex in einen neuen Index products_vN (N = höchste Nummer + 1)
curl -s -X POST "$BASE/api/admin/index/reindex" -H "Authorization: Bearer $INDOORO_ADMIN_TOKEN" -H "Content-Type: application/json"
#   erwartet: {"source":"products","target":"products_v1","sourceCount":N,"targetCount":N,"status":"OK"}
#   sourceCount == targetCount prüfen. 500 "Reindex unvollständig": Schritt wiederholen, nicht umschalten.

# 6.2 Qualitäts-Gate (lokal, nicht gegen LeoCloud; OpenSearch 2.9.0 auf Port 9201)
cd backend/indooro_server && SEARCH_QUALITY_PORT=9201 SEARCH_QUALITY_MIN_HIT=0.85 sh ./mvnw -B test -Dtest=SearchQualityTest

# 6.3 Alias products_live auf den neuen Index umschalten
curl -s -X POST "$BASE/api/admin/index/activate?index=products_vN" -H "Authorization: Bearer $INDOORO_ADMIN_TOKEN" -H "Content-Type: application/json"
#   erwartet: {"alias":"products_live","index":"products_vN","previous":[]}
unset INDOORO_ADMIN_TOKEN
```

`activate` zählt vor dem Umschalten (Abweichung: 409, Alias bleibt). `force=true` nur bewusst. Das Umschalten ist atomar und löscht nichts. Nach `activate` liest das Backend noch **den alten Index**, bis Schritt 7 gesetzt ist.

**Rollback Schritt 6:** Vor Schritt 7 genügt es, nichts zu tun (das Backend liest weiter `products`). Nach dem Umschalten per `POST …/activate?index=products_vM` auf die Version aus `previous` zurück. Die erste Umschaltung hat kein `previous`: dann Schritt 7 zurücknehmen. Indizes nur nach manueller Freigabe löschen.

### Schritt 7: `OPENSEARCH_INDEX=products_live`

```bash
kubectl -n student-it220209 set env deployment/indooro-backend OPENSEARCH_INDEX=products_live
kubectl -n student-it220209 rollout status deployment/indooro-backend --timeout=300s
```

Der Schreibstopp endet erst nach diesem Rollout. Schreibvorgänge zwischen Reindex und Rollout fehlen sonst im neuen Index.

**Rollback Schritt 7:** `kubectl -n student-it220209 set env deployment/indooro-backend OPENSEARCH_INDEX=products` (der Bestandsindex ist unverändert; Schreibvorgänge nach Schritt 7 fehlen dort).

### Schritt 8: Smoke-Check (Ende)

Siehe Abschnitt 7. Ergebnis ins Release-Protokoll `../operations/RELEASES.md` eintragen (eine Zeile) und eine Datei `RELEASE_<Datum>.md` nach dem Muster von `RELEASE_2026-10-17.md` schreiben.

**Rollback:** keiner nötig (nur Lesen).

## 4. Kubernetes-Manifeste (`git diff a47c5e6 HEAD -- k8s`, 10 Dateien)

`secrets.example.yaml` **nie anwenden**: `kubectl apply` würde echte Secrets mit `<REPLACE_ME>` überschreiben.

| Datei | Änderung | Wann anwenden |
|---|---|---|
| `backend.yaml` | Image im Manifest `:a47c5e6` (Root-Image, nicht mit `runAsNonRoot` startbar → vorher auf `<NEUER_TAG>`); Pod `runAsNonRoot`, UID/GID 10001; `readOnlyRootFilesystem` mit `emptyDir` auf `/tmp`; Probes `/q/health/live`, `/q/health/ready`; `DB_PASSWORD` aus Secret `indooro-postgres-secret`; Service NodePort → ClusterIP. **Enthält weder `OPENSEARCH_INDEX` noch `CATALOG_DEFAULT_STORE_CODE`** | im Rollout (Schritt 3), mit neuem Tag. Ein späteres `apply` mit dem alten Manifest setzt `kubectl set env`-Werte zurück: erst Env in die Datei übernehmen (Abschnitt 8) |
| `postgres.yaml` | `POSTGRES_PASSWORD` aus Secret; Strategy `Recreate`; PVC unverändert | **getrennt**, Wartungsfenster: Env-Änderung startet den Pod neu (DB-Pause). Das Secret muss zum Passwort des vorhandenen Volumes passen (`POSTGRES_PASSWORD` wirkt nur bei `initdb`; das Volume wurde mit `indooro` angelegt), sonst Auth-Fehler bei Backend und Keycloak |
| `opensearch.yaml` | Services NodePort → ClusterIP; `dashboards` replicas 1 → 0 | **getrennt**, unkritisch. Danach kein externer Zugriff mehr auf OpenSearch/Dashboards. Port-Forward bleibt der Weg (Schritt 5.4) |
| `network-policy.yaml` | Default-Deny für eingehenden Verkehr; Freigaben: ingress-nginx → Backend/Keycloak, Backend/Keycloak/DB-Job → Postgres, Backend → OpenSearch | **getrennt, zuletzt, bewusst.** Vorher `kubectl get ns ingress-nginx --show-labels` (das Label `kubernetes.io/metadata.name=ingress-nginx` muss stimmen). Falsches Label sperrt jeden Zugriff auf Backend und Keycloak. Prüfen, ob das CNI Kubelet-Probes durchlässt und Port-Forward erlaubt |
| `keycloak-db-init-job.yaml` | neuer Job + ConfigMap: legt Rolle und Datenbank `keycloak` in Postgres an (idempotent) | **getrennt**, vor `keycloak.yaml`. Job ist unveränderlich: alten Job vorher löschen. Braucht `indooro-postgres-secret` und `indooro-keycloak-secret` (Key `db-password`) |
| `keycloak.yaml` | Keycloak 24.0.5 → 26.0.8; `start` statt `start-dev`; Postgres statt `dev-file`; `runAsNonRoot` (UID 1000); Bootstrap-Admin aus Secret; Health auf Port 9000; Secret, Realm-ConfigMap und Ingress aus dem Manifest entfernt | **getrennt, bewusst.** Login-Ausfall während `Recreate`; bestehende Tokens und Sessions werden ungültig. Voraussetzungen: DB-Init-Job fertig, Secret `indooro-keycloak-secret` mit den Keys `bootstrap-admin-username`, `bootstrap-admin-password`, `admin-web-client-secret`, `db-password`, ConfigMap `indooro-keycloak-realm` (Key `indooro-realm.json`, aus `keycloak-realm-prod.json`). Tag vorher auf aktuelle 26.x prüfen; die Health-Pfade auf Port 9000 mit Präfix `/keycloak` sind laut Manifest unverifiziert |
| `keycloak-realm-prod.json` | Realm `indooro` ohne Benutzer; `directAccessGrantsEnabled=false`; Client-Secret per Platzhalter; nur Produktions-Redirects; Brute-Force-Schutz; Passwort-Policy (12 Zeichen) | **nicht per `apply`**: nur als ConfigMap im Keycloak-Rollout (`kubectl create configmap indooro-keycloak-realm --from-file=indooro-realm.json=k8s/keycloak-realm-prod.json`; die alte ConfigMap vorher ersetzen). Import nur wenn der Realm fehlt. **Keine Benutzer = Aussperrung**, bis ein Benutzer mit Realm-Rolle `admin` existiert und seine Zeile in `user_access_assignments` steht (Schritt 2 mit neuem `sub`) |
| `backend-ingress.yaml` | neu: Pfade `/keycloak/realms/` und `/keycloak/resources/` → Keycloak | **getrennt**, zusammen mit dem Keycloak-Rollout. Im selben Schritt den alten Ingress `indooro-keycloak-ingress` löschen (`apply` löscht ihn nicht; die Admin-Konsole bliebe öffentlich) |
| `secrets.example.yaml` | Vorlage für `indooro-postgres-secret`, `indooro-keycloak-secret`, `indooro-openai-secret` | nie anwenden, nur Referenz. Secrets legt ein Mensch mit `kubectl create secret` an (Werte nicht in Chat oder Repo) |
| `volume-claim.yaml` | gelöscht (PVC `opensearch-pvc`, verwaist) | keine Aktion. Eine Löschung im Cluster nur nach `kubectl get pvc opensearch-pvc`, nur bewusst |

Reihenfolge, wenn die Manifeste (Sicherheitsstufe) angewendet werden: Secrets und Realm-ConfigMap anlegen/ersetzen → Postgres-Passwort abgleichen → `postgres.yaml` → DB-Init-Job (alten löschen, auf `Completed` warten) → `keycloak.yaml` + Admin-Benutzer im Realm → `backend.yaml` (neuer Tag) + `backend-ingress.yaml` + alten Keycloak-Ingress löschen → `opensearch.yaml` → `network-policy.yaml` zuletzt.

**Empfehlung für diesen Release:** Schritte 0–8 mit `set image`/`set env` (Backend, V16–V18, Katalog, Index). Die Keycloak-Umstellung (neue Version, Prod-Realm, Ingress), `postgres.yaml`, `opensearch.yaml` und `network-policy.yaml` als **eigene, getrennte Wartungsfenster danach**, jedes mit eigenem Backup und eigenem Rollback. Der Grund: Jede dieser Änderungen kann allein aussperren oder den Verkehr sperren. In einem Fenster mit Image, Migrationen und Katalog ist ein Fehler dann nicht mehr eindeutig zuzuordnen.

Rollback je Manifest: vorheriges Manifest (`git show a47c5e6:k8s/<datei>`) erneut anwenden; `network-policy.yaml` mit `kubectl -n student-it220209 delete networkpolicy default-deny-ingress allow-ingress-to-backend allow-ingress-to-keycloak allow-to-postgres allow-backend-to-opensearch` entfernen (sofort wirksam). Ein Keycloak-Rollback braucht den alten Realm (die alte ConfigMap vorher sichern: `kubectl -n student-it220209 get configmap indooro-keycloak-realm -o yaml > …` außerhalb des Repos) und den alten Ingress.

## 5. Offene Abhängigkeiten zwischen den Schritten

- **Subject und Realm:** Die Zeile aus Schritt 2 gilt nur für den Realm, der bei ihrem Anlegen benutzt wird. Nach der Keycloak-Umstellung hat der Prod-Realm keine Benutzer. Neuen Admin anlegen, `sub` lesen, neue Zeile einfügen. Bei einer Aussperrung ist der Weg die direkte Datenbank (`psql`, Schritt 2). Es gehen keine Daten verloren.
- **Dev-Realm bis dahin:** Solange Keycloak 24 mit Dev-Realm läuft, existieren die Demo-Benutzer mit bekannten Zugangsdaten weiter (Subjects aus V4/V5). V17 entzieht ihnen nur die Backend-Rechte. Der Dev-Realm sollte baldmöglichst durch den Prod-Realm ersetzt werden.
- **Passwörter:** Die alten Demo-Zugangsdaten stehen im Git-Verlauf. Rotation nach `../operations/SECRET_ROTATION.md` einplanen.
- **OpenAI-Secret:** Das Backend-Manifest referenziert `indooro-openai-secret` (Key `OPENAI_API_KEY`). Es muss existieren, wenn `backend.yaml` angewendet wird.

## 6. Nur ein Mensch mit Cluster-Zugang

Alles mit `kubectl` und Cluster-Datenbank, Tokens und Passwörtern. Claude Code führt davon nichts aus und gibt keine Passwörter ein.

- Alle `kubectl`-Befehle (`set image`, `set env`, `rollout`, `apply`, `create secret/configmap`, `delete`, `port-forward`, `exec`).
- `psql` in `deploy/postgres`: V18-Prüf-SQL, Admin-Zeile (Schritt 2), Rollback-Updates.
- Backup und Restore gegen LeoCloud (`backup_postgres.py`, `export_products.py`, `restore_postgres.py` mit Dump aus dem Cluster).
- Alle Schritte, die den Admin-Token brauchen: `migrate_products_to_store.py --apply`, `--delete-legacy` (Port-Forward), `POST /api/admin/index/reindex` und `activate`, Rollback per `POST /api/products/bulk`. Token nur per `read -s`, danach `unset`.
- Login-Test der Admin-Seiten (`/admin/next/`, Bereitschaft, QR-Codes drucken, CSV-Import, Editor-Abdeckung) und Prüfung des echten Admin-Zugriffs nach V17.
- Merge `pilot/first-store` → `main` und Freigabe des CI-Images.
- Keycloak-Admin-Konsole (Port-Forward), Benutzer und `sub`.
- Secrets anlegen oder rotieren.
- Entscheidung `<DEMO_STORE_CODE>`.
- Auslieferung des iOS-Builds (TestFlight/Gerät): getrennt vom Cluster.

## 7. Smoke-Check

Skript (lesend, ohne Anmeldung, nur GET): `scripts/ops/smoke_check.sh <base-url> [storeCode] [suchbegriff]`. Exit 0 nur, wenn alle Pflichtprüfungen bestehen. Das vorhandene `scripts/ops/pilot_smoke.py <base-url> <storeId> <query>` prüft zusätzlich Layout (Regale) und Suchtreffer eines Marktes. Beide vor und nach dem Rollout laufen lassen (mit Freigabe für die Live-URL).

```bash
scripts/ops/smoke_check.sh https://it220209.cloud.htl-leonding.ac.at
python3 scripts/ops/pilot_smoke.py https://it220209.cloud.htl-leonding.ac.at <storeId> milch
```

| Endpunkt | Erwartung ohne Login |
|---|---|
| `GET /api/mobile/stores` | 200, Liste der Märkte |
| `GET /api/categories` | 200 |
| `GET /api/products?size=5` | 200 |
| `GET /api/products/search?q=milch` | 200, nach Schritt 5 und 6 mit Treffern |
| `GET /api/products?size=5&storeCode=<code>` | 200 |
| `GET /api/products/search?q=milch&storeCode=<code>` | 200, Treffer |
| `GET /customer/` | 200 (Produktfinder, #132) |
| `GET /admin/`, `/admin/next/`, `/admin/next/stores/readiness/`, `/admin/next/stores/anchors/` | 302 zum Keycloak-Login |
| `GET /api/admin/me`, `/api/admin/products`, `/api/admin/logs`, `/api/admin/index` | 401 oder 403 (nie 200, nie 5xx) |
| `GET /q/health/live`, `/q/health/ready` | nur Hinweis; der Ingress kann sie sperren |
| `GET /keycloak/realms/indooro/.well-known/openid-configuration` | nur Hinweis; 200 erst nach der Ingress-Umstellung |

Zusätzlich vom Menschen mit Cluster-Zugang (Pod-Zustand, keine Passwörter):

```bash
kubectl -n student-it220209 get pods -l app=indooro-backend -o wide
kubectl -n student-it220209 logs deploy/indooro-backend --tail=300 | grep -ciE 'ERROR|Exception'     # erwartet 0
kubectl -n student-it220209 exec deploy/indooro-backend -- id -u                                       # erwartet 10001
```

Nach dem Login (Mensch): echter Admin sieht `/admin/next/` und die Seite „Pilot-Bereitschaft“; Demo-Benutzer `indooro-admin` bekommt „Forbidden“; CSV-Import und Editor mit Abdeckungs-Overlay laden; `GET /api/stores/{storeId}/readiness` mit Admin-Rolle liefert 200.

## 8. Offene Punkte nach dem Release (Folgearbeit, kein Teil dieses Plans)

- `k8s/backend.yaml` muss `OPENSEARCH_INDEX=products_live` und `CATALOG_DEFAULT_STORE_CODE=<DEMO_STORE_CODE>` enthalten und den Tag `<NEUER_TAG>` festschreiben. Sonst setzt ein späteres `kubectl apply` die per `set env` gesetzten Werte zurück.
- Entscheidungen: `<DEMO_STORE_CODE>`, Zeitpunkt der Keycloak-Umstellung, Rotation der Secrets.
- Flyway-Rückwärtsverhalten des alten Images (Abschnitt 2) und Keycloak-Health-Pfade auf Port 9000 sind ungeprüft.
- Das Release-Protokoll `../operations/RELEASES.md` nach dem Rollout um eine Zeile ergänzen.
