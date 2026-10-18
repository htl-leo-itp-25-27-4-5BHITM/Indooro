# Indooro Deployment

Stand: 2026-04-08

Dieses Dokument beschreibt den aktuellen LeoCloud-Stand von Indooro und den Weg, wie das Backend unter `https://it220209.cloud.htl-leonding.ac.at/` erreichbar gemacht wird.

## LeoCloud Kontext

- Kubernetes Context: `leocloud`
- Namespace: `student-it220209`
- Benutzer: `it220209`
- Gewuenschter Hostname: `it220209.cloud.htl-leonding.ac.at`

## Aktueller Live-Stand

Im Cluster laufen aktuell diese Deployments:

- `indooro-backend`
- `opensearch`
- `dashboards`
- `postgres`

Im Namespace `student-it220209` wurde der `Ingress` `indooro-backend-ingress` erfolgreich angelegt. Der Test auf `/api/admin/health` liefert bereits `{"status":"UP"}`.

Das bedeutet:

- das Backend ist jetzt ueber die LeoCloud-URL erreichbar
- fuer die App und externe Clients soll ab jetzt die URL `https://it220209.cloud.htl-leonding.ac.at/` verwendet werden
- die Web-Oberflaechen werden jetzt ebenfalls ueber dasselbe Backend ausgeliefert

## Wichtige Repo-Dateien

- `k8s/opensearch.yaml`
- `k8s/postgres.yaml`
- `k8s/backend.yaml`
- `backend/indooro_server/.mvn/jvm.config`
- `.github/workflows/ci.yaml`
- `backend/indooro_server/build.sh`

## Was aktuell zusammenpasst

- Das Backend-Image im Cluster ist `ghcr.io/htl-leo-itp-25-27-4-5bhitm/indooro-backend-v2` mit festem Tag = Commit-SHA (live aktuell `a47c5e6`). `:latest` wird nicht mehr verwendet. Rollout/Rollback siehe `docs/pilot-readiness/operations/RELEASE_RUNBOOK.md`
- Die GitHub Action baut ebenfalls `.../indooro-backend-v2`
- `k8s/backend.yaml` zeigt ebenfalls auf `.../indooro-backend-v2:a47c5e6` (fester Commit-SHA-Tag)
- Das Backend spricht in Production intern mit dem Kubernetes-Service `opensearch`
- Das Admin-Datenmodell nutzt PostgreSQL ueber den internen Kubernetes-Service `postgres`

## Was aktuell nicht sauber zusammenpasst

- `backend/indooro_server/build.sh` pusht noch `ghcr.io/htl-leo-itp-25-27-4-5bhitm/indooro-backend:latest` ohne `-v2`
- `build.sh` kennt den neuen PostgreSQL-/Admin-Stack noch nicht explizit, auch wenn das Quarkus-Backend jetzt darauf vorbereitet ist

## Wie das Deployment aktuell funktioniert

### 1. Backend Image bauen und pushen

Bei einem Push auf `main` oder `master` baut GitHub Actions automatisch das Backend-Image und pusht es nach GHCR.

Relevant ist:

- Workflow: `.github/workflows/ci.yaml`
- Ziel-Image: `ghcr.io/htl-leo-itp-25-27-4-5bhitm/indooro-backend-v2:<Commit-SHA>` (fester Tag, siehe `docs/pilot-readiness/operations/RELEASE_RUNBOOK.md`)

### 2. Kubernetes Manifeste anwenden

Die bestehenden Manifeste werden im Namespace `student-it220209` angewendet:

```bash
kubectl apply -n student-it220209 -f k8s/postgres.yaml
kubectl apply -n student-it220209 -f k8s/opensearch.yaml
kubectl apply -n student-it220209 -f k8s/backend.yaml
```

Ein neues Backend-Image wird nicht per `rollout restart` ausgerollt, sondern per festem SHA-Tag. Ablauf, Pruefungen und Rollback stehen in `docs/pilot-readiness/operations/RELEASE_RUNBOOK.md`. Kern:

```bash
kubectl -n student-it220209 set image deployment/indooro-backend indooro-backend=ghcr.io/htl-leo-itp-25-27-4-5bhitm/indooro-backend-v2:<SHA>
kubectl -n student-it220209 rollout status deployment/indooro-backend --timeout=300s
```

## Wie die URL ueber LeoCloud funktioniert

Bei der anderen Projektgruppe wurde die URL nicht direkt ueber `NodePort` verwendet, sondern ueber ein `Ingress`.

Das Muster war:

- Host: `it22....cloud.htl-leonding.ac.at`
- `Ingress` mit `ingressClassName: nginx`
- Weiterleitung auf einen internen Service

Fuer Indooro bedeutet das:

- Host: `it220209.cloud.htl-leonding.ac.at`
- Ziel-Service: `indooro-backend`
- Ziel-Port: `8080`

## Empfohlenes Ingress fuer Indooro

Die Datei liegt unter `k8s/backend-ingress.yaml` und routet:

- `/` (Prefix) auf `indooro-backend:8080`
- `/keycloak/realms/` und `/keycloak/resources/` (Prefix) auf `indooro-keycloak:8080`

Die Keycloak-Admin-Konsole (`/keycloak/admin/`) und der restliche Keycloak-Pfad sind **nicht** ueber das Ingress erreichbar.

Anwenden mit:

```bash
kubectl apply -n student-it220209 -f k8s/backend-ingress.yaml
```

## Welche URL danach gelten sollte

Wenn das `Ingress` aktiv ist, sollte das Backend unter diesen URLs erreichbar sein:

- `https://it220209.cloud.htl-leonding.ac.at/api/admin/health`
- `https://it220209.cloud.htl-leonding.ac.at/api/products`
- `https://it220209.cloud.htl-leonding.ac.at/api/products/search?q=test`

Wichtig: Das Backend selbst hat seine Endpunkte bereits unter `/api/...`, daher reicht im `Ingress` der Pfad `/`.

## Gehostete Web-Oberflaechen

Die statischen Seiten werden jetzt direkt vom Quarkus-Backend ausgeliefert. Dadurch braucht es in LeoCloud keinen extra Web-Container fuer Admin oder Kundenseite.

Diese Pfade sind vorgesehen:

- `https://it220209.cloud.htl-leonding.ac.at/` fuer die Startseite mit Auswahl
- `https://it220209.cloud.htl-leonding.ac.at/admin/` fuer den Admin-Editor
- `https://it220209.cloud.htl-leonding.ac.at/customer/` fuer die Kundensuche

## Layout am Server speichern

Der Admin-Editor exportiert das Layout jetzt nicht nur als Download, sondern speichert es auch serverseitig.

Dafuer gibt es diese API:

- `GET /api/layout/current`
- `POST /api/layout/current`

Damit koennen diese Clients dasselbe Layout verwenden:

- der Admin-Editor
- die gehostete Kundensuche
- die Swift-App

## Neue Admin-Plattform Grundlage

Das Backend hat jetzt zusaetzlich eine relationale Grundlage fuer die neue Admin-Plattform:

- `regions`
- `stores`
- `beacons`
- `beacon_assignments`
- `layout_versions`
- `audit_logs`

Die Datenbank-Migration liegt unter:

- `backend/indooro_server/src/main/resources/db/migration/V1__admin_platform_foundation.sql`

Neue REST-Endpunkte wurden fuer den Sprint vorbereitet:

- `/api/regions`
- `/api/stores`
- `/api/beacons`
- `/api/stores/{storeId}/layout/...`
- `/api/mobile/stores/...`

Damit ist die Grundlage fuer:

- Filialverwaltung
- Beacon-Verwaltung
- filialspezifische Layouts
- spaetere iOS-Filialerkennung per Beacon

bereits im Backend angelegt.

## Produktdaten importieren

Damit die App Produkte anzeigen kann, muss der OpenSearch-Index auch wirklich mit Daten befuellt sein.

Aktuell ist das Deployment erreichbar, aber ein laufendes Backend allein bedeutet noch nicht, dass schon Produktdaten im Index liegen.

Im Repo liegt eine passende JSON-Datei:

- `backend/indooro_server/belegplan.json`

Falls der Index leer oder fast leer ist, koennt ihr ihn mit dieser Datei befuellen:

```bash
curl -X POST https://it220209.cloud.htl-leonding.ac.at/api/products/bulk \
  -H "Content-Type: application/json" \
  --data @backend/indooro_server/belegplan.json
```

Danach testen mit:

```bash
curl https://it220209.cloud.htl-leonding.ac.at/api/products?size=20
```

Wenn dort viele Produkte zurueckkommen, sollte die Xcode-App ebenfalls Daten anzeigen.

## Xcode App auf die URL umstellen

In der iOS-App steht aktuell noch `http://localhost:8080/api` in `swift/indooroApp/indooroApp/Managers/BeaconManager.swift`.

Fuer den Zugriff auf die LeoCloud-Instanz muss dort diese Base-URL verwendet werden:

```swift
private let apiBase = "https://it220209.cloud.htl-leonding.ac.at/api"
```

Danach spricht die App direkt mit dem Backend in der LeoCloud.

## Service-Typ

`indooro-backend`, `indooro-keycloak`, `opensearch` und `dashboards` sind `ClusterIP`. Externer Zugriff laeuft ausschliesslich ueber das `Ingress` (`k8s/backend-ingress.yaml`). OpenSearch und Dashboards sind nur per `kubectl port-forward` erreichbar; Dashboards ist auf 0 Replikate skaliert.

## Praktische Reihenfolge fuer euch

Wenn ihr das heute neu oder sauber aufsetzen wollt:

1. Backend-Code auf `main` pushen
2. Warten, bis GitHub Actions das Image mit dem Commit-SHA gebaut hat; SHA-Tag in `k8s/backend.yaml` eintragen (siehe "Image-Tag")
3. Secrets anlegen, bevor Manifeste angewendet werden (siehe "Secrets")
4. `kubectl apply -n student-it220209 -f k8s/postgres.yaml`
5. `kubectl apply -n student-it220209 -f k8s/opensearch.yaml`
6. Datenbank `keycloak` anlegen (Job `k8s/keycloak-db-init-job.yaml` oder `psql`, siehe "Keycloak-Datenbank")
7. Realm-ConfigMap `indooro-keycloak-realm` anlegen (siehe "LeoCloud Keycloak")
8. `kubectl apply -n student-it220209 -f k8s/keycloak.yaml`
9. Keycloak per port-forward oeffnen und die Benutzer anlegen (siehe "Keycloak-Administration")
10. `kubectl apply -n student-it220209 -f k8s/backend.yaml` (vorher Image-Tag pruefen)
11. Reale Admin-Zuweisung setzen, bevor sich ein Admin anmeldet (siehe WARNUNG unten)
12. `kubectl apply -n student-it220209 -f k8s/backend-ingress.yaml`
13. NetworkPolicy nur nach Task 1.3 anwenden (siehe "NetworkPolicy")
14. Testen: `https://it220209.cloud.htl-leonding.ac.at/api/mobile/stores`

## Secrets

Alle Secrets per `kubectl create secret generic` anlegen, nie als Datei im Repo. Vorlage mit Platzhaltern: `k8s/secrets.example.yaml`. Details zur Rotation: `docs/pilot-readiness/operations/SECRET_ROTATION.md`.

```bash
kubectl -n student-it220209 create secret generic indooro-postgres-secret \
  --from-literal=POSTGRES_PASSWORD='<REPLACE_ME>'

kubectl -n student-it220209 create secret generic indooro-keycloak-secret \
  --from-literal=bootstrap-admin-username='<REPLACE_ME>' \
  --from-literal=bootstrap-admin-password='<REPLACE_ME>' \
  --from-literal=admin-web-client-secret='<REPLACE_ME>' \
  --from-literal=db-password='<REPLACE_ME>'

kubectl -n student-it220209 create secret generic indooro-openai-secret \
  --from-literal=OPENAI_API_KEY='<REPLACE_ME>'
```

- `indooro-postgres-secret`: `POSTGRES_PASSWORD` fuer den Superuser `indooro` der PostgreSQL-Instanz; wird von Postgres und Backend gelesen.
- `indooro-keycloak-secret`: `bootstrap-admin-*` (Keycloak-Master-Admin, nur fuer port-forward-Administration), `admin-web-client-secret` (Client `indooro-admin-web`, Keycloak und Backend), `db-password` (DB-Benutzer `keycloak`).
- Demo-Passwoerter gibt es im Produktionsmanifest nicht mehr; sie gehoeren nur ins lokale Dev-Realm.

## Keycloak Admin Login

Der Admin-Bereich ist ab dem Keycloak-Sprint nicht mehr anonym nutzbar.

Geschuetzte Pfade:

- `https://it220209.cloud.htl-leonding.ac.at/admin/`
- `https://it220209.cloud.htl-leonding.ac.at/admin/editor/`
- `https://it220209.cloud.htl-leonding.ac.at/admin/server-logs/`
- `/api/admin/logs`
- `/api/admin/error-logs`
- `/api/admin/me`
- `/api/regions`
- `/api/stores`
- `/api/beacons`
- `/api/stores/{storeId}/layout/...`

Oeffentliche Pfade bleiben fuer App/Kundensicht erreichbar:

- `/api/mobile/stores`
- `/api/mobile/stores/by-beacon`
- `/api/mobile/stores/{storeId}/layout/current`
- `/api/products`
- `/api/categories`
- `/api/layout`

### Lokaler Keycloak-Start

Der lokale Realm liegt unter:

- `keycloak/realm/indooro-realm.json`

Passwoerter und Secrets kommen ausschliesslich aus `.env`, nicht aus dem Repo. Vorlage ist `.env.example`; die Werte setzt man selbst. Betrieb auf LeoCloud siehe `docs/pilot-readiness/operations/SECRET_ROTATION.md`.

Start mit Docker Compose:

```bash
cp .env.example .env
docker compose up keycloak
```

Keycloak ist lokal unter `http://localhost:8180/` erreichbar. Der Realm ist:

- Realm: `indooro`
- Client: `indooro-admin-web`
- Client Secret: aus `.env` (`KC_ADMIN_WEB_CLIENT_SECRET`)
- Auth Server URL fuer Quarkus: `http://localhost:8180/realms/indooro`

Demo-Benutzer (Passwoerter: `KC_DEMO_ADMIN_PASSWORD`, `KC_DEMO_REGION_PASSWORD`, `KC_DEMO_STORE_PASSWORD` aus `.env`):

| Benutzer | Keycloak-Rolle | Subject |
| --- | --- | --- |
| `indooro-admin` | `admin` | `11111111-1111-1111-1111-111111111111` |
| `indooro-region` | `region-manager` | `22222222-2222-2222-2222-222222222222` |
| `indooro-store` | `store-manager` | `33333333-3333-3333-3333-333333333333` |

Die Migration `V4__user_access_assignments.sql` legt den Admin-Demozugang automatisch an. Fuer `region-manager` und `store-manager` muessen nach dem Anlegen von Region und Filiale passende Indooro-Scope-Zuordnungen gesetzt werden, weil diese Rollen echte Domain-IDs brauchen.

Beispiel-SQL fuer eine Region und eine Filiale:

```sql
INSERT INTO user_access_assignments (
  id, keycloak_subject, username, email, role, region_id, store_id, status, created_at, updated_at
)
SELECT gen_random_uuid(), '22222222-2222-2222-2222-222222222222',
       'indooro-region', 'region@indooro.local', 'region-manager',
       r.id, NULL, 'ACTIVE', NOW(), NOW()
FROM regions r
WHERE r.code = 'AT-NORD'
ON CONFLICT DO NOTHING;

INSERT INTO user_access_assignments (
  id, keycloak_subject, username, email, role, region_id, store_id, status, created_at, updated_at
)
SELECT gen_random_uuid(), '33333333-3333-3333-3333-333333333333',
       'indooro-store', 'store@indooro.local', 'store-manager',
       NULL, s.id, 'ACTIVE', NOW(), NOW()
FROM stores s
WHERE s.store_code = 'SPAR-LNZ-001'
ON CONFLICT DO NOTHING;
```

Wenn Benutzer im Keycloak Admin UI neu angelegt werden, ist der stabile Wert fuer Indooro die Keycloak User-ID beziehungsweise der OIDC `sub` Claim. Die Admin UI zeigt den aktuell angemeldeten Benutzer ueber `/api/admin/me`.

### LeoCloud Keycloak

Das Manifest `k8s/keycloak.yaml` startet Keycloak 26.0.8 im Produktionsmodus (`start`) mit PostgreSQL (`KC_DB=postgres`, Datenbank `keycloak`). Es enthaelt weder Secrets noch Realm-Daten und keinen Ingress. Erstellt werden nur Deployment und Service `indooro-keycloak` (ClusterIP).

Vor dem Apply muessen vorhanden sein:

1. Datenbank `keycloak` mit Benutzer (siehe "Keycloak-Datenbank")
2. Secret `indooro-keycloak-secret` (siehe "Secrets")
3. Realm-ConfigMap aus der Produktions-Realm-Datei. Die Datei bleibt die einzige Quelle; die ConfigMap wird nicht im Manifest gepflegt:

```bash
kubectl -n student-it220209 create configmap indooro-keycloak-realm \
  --from-file=indooro-realm.json=k8s/keycloak-realm-prod.json
```

`k8s/keycloak-realm-prod.json` enthaelt keine Benutzer. Brute-Force-Schutz, Passwort-Policy (`length(12) and notUsername and passwordHistory(3)`), `sslRequired: external` und `directAccessGrantsEnabled: false` sind gesetzt; Redirect-URIs nur fuer `https://it220209.cloud.htl-leonding.ac.at`. Benutzer legt ein Admin nach dem Start in der Admin-Konsole an.

Anwenden:

```bash
kubectl apply -n student-it220209 -f k8s/keycloak.yaml
kubectl rollout status deployment/indooro-keycloak -n student-it220209
```

Vor dem Apply die neueste 26.x-Patchversion pruefen und den Image-Tag in `k8s/keycloak.yaml` anpassen.

Health-Probes laufen auf dem Management-Port 9000 (`/keycloak/health/live|ready`). Der Port ist nur als Container-Port deklariert, nicht im Service.

### Keycloak-Datenbank

Die Datenbank `keycloak` liegt in der bestehenden PostgreSQL-Instanz (Service `postgres`). Variante A ist der Job, Variante B die manuelle Ausfuehrung; beide sind idempotent bzw. bei Wiederholung unkritisch.

Variante A, Job:

```bash
kubectl -n student-it220209 delete job indooro-keycloak-db-init --ignore-not-found
kubectl -n student-it220209 apply -f k8s/keycloak-db-init-job.yaml
kubectl -n student-it220209 logs job/indooro-keycloak-db-init
```

Variante B, manuell (psql im Postgres-Pod als Superuser `indooro`):

```bash
kubectl -n student-it220209 exec -it deploy/postgres -- psql -U indooro -d indooro
```

```sql
CREATE ROLE keycloak LOGIN PASSWORD '<REPLACE_ME>';   -- Passwort = db-password aus indooro-keycloak-secret
CREATE DATABASE keycloak OWNER keycloak;
REVOKE ALL ON DATABASE keycloak FROM PUBLIC;
```

Existiert die Rolle oder Datenbank schon, meldet `psql` einen Fehler; dann nur das fehlende Statement weglassen. Passwort aendern: `ALTER ROLE keycloak WITH LOGIN PASSWORD '<REPLACE_ME>';`

### Keycloak-Administration (port-forward)

Die Admin-Konsole ist nicht oeffentlich erreichbar. Zugriff nur lokal ueber port-forward:

```bash
kubectl -n student-it220209 port-forward svc/indooro-keycloak 8081:8080
```

Dann im Browser `http://localhost:8081/keycloak/admin/` oeffnen und mit `bootstrap-admin-username` / `bootstrap-admin-password` anmelden. Realm `indooro` waehlen, Benutzer anlegen (temporaeres Passwort, Pflicht zum Aendern beim ersten Login).

Das Manifest setzt `--hostname-admin=http://localhost:8081/keycloak`, damit die Konsole ueber den Port-Forward funktioniert. Dieser Wert ist auf LeoCloud noch nicht getestet. Schlaegt der Login fehl, zuerst diesen Wert und den Port-Forward-Port abgleichen.

Die Keycloak-User-ID (`sub` im Token, in der Admin-Konsole unter den Benutzerdetails) ist der Wert fuer `keycloak_subject` in `user_access_assignments` (siehe WARNUNG unten).

Der Backend-Container bekommt die OIDC-Konfiguration ueber `k8s/backend.yaml`:

- `QUARKUS_OIDC_AUTH_SERVER_URL=https://it220209.cloud.htl-leonding.ac.at/keycloak/realms/indooro`
- `QUARKUS_OIDC_CLIENT_ID=indooro-admin-web`
- `QUARKUS_OIDC_CREDENTIALS_SECRET` aus `indooro-keycloak-secret` (Key `admin-web-client-secret`). **Pflicht in Produktion.**
- Lokal heisst die Variable `OIDC_CLIENT_SECRET` (aus `.env`, gleicher Wert wie `KC_ADMIN_WEB_CLIENT_SECRET`). Lokal braucht das Backend ausserdem `DB_PASSWORD` aus `.env`.
- `CORS_ORIGINS` (optional): kommaseparierte Liste erlaubter Browser-Origins. Default ist der LeoCloud-Host plus `https://www.indooro.at` und `https://indooro.at`. Setzen, falls die Kundenweb-App an einer anderen Adresse gehostet wird. Dev und Test erlauben nur `http://localhost:8080` und `http://localhost:5173`.

Die Werte werden nicht im Repo gepflegt. Anlage und Rotation: `docs/pilot-readiness/operations/SECRET_ROTATION.md`.

### Auth-Verifikation

Oeffentliche Route ohne Login:

```bash
curl -i https://it220209.cloud.htl-leonding.ac.at/api/mobile/stores
```

Admin-Route ohne Browser-Session:

```bash
curl -i https://it220209.cloud.htl-leonding.ac.at/api/regions
```

Erwartung: Die mobile Route bleibt ohne Keycloak-Login erreichbar. Die Admin-Route liefert keinen Admin-Datenbestand ohne gueltige Anmeldung.

Keycloak-Admin extern nicht erreichbar (muss 404 liefern, nicht die Konsole):

```bash
curl -i https://it220209.cloud.htl-leonding.ac.at/keycloak/admin/
```

Browser-Demo:

1. `https://it220209.cloud.htl-leonding.ac.at/admin/` oeffnen
2. Mit `indooro-admin` anmelden
3. Benutzerbox in der Admin UI pruefen
4. Regionen/Filialen/Beacons laden
5. `Logout` klicken
6. `/admin/` erneut oeffnen und den neuen Login-Flow pruefen

## WARNUNG: Demo-Zugaenge und reale Admin-Zuweisung

> **WARNUNG.** Die Flyway-Migration `V17__disable_demo_access_outside_dev.sql` setzt die drei Demo-Zuweisungen (Subjects `11111111-…`, `22222222-…`, `33333333-…`) auf `DISABLED`, sobald der Platzhalter `demoAccess` nicht `true` ist. Ausserhalb von `dev`/`test` ist das immer der Fall.
>
> Ohne eine **echte** aktive Admin-Zuweisung (Keycloak-User-ID des realen Admins) sperrt sich die Admin-UI nach dem Rollout aus. Die Zuweisung muss vor der ersten Anmeldung eines Admins existieren.
>
> Bei bestehender Datenbank: vor dem Backend-Rollout setzen. Bei frischer Datenbank legt Flyway die Tabelle erst beim ersten Backend-Start an; dann direkt danach und vor der ersten Admin-Anmeldung setzen.

Vorlage (Platzhalter ersetzen, nur einmal ausfuehren):

```sql
INSERT INTO user_access_assignments (
  id, keycloak_subject, username, email, role, region_id, store_id, status, created_at, updated_at
)
VALUES (gen_random_uuid(), '<REAL_SUBJECT>', '<USERNAME>', '<EMAIL>', 'admin', NULL, NULL, 'ACTIVE', NOW(), NOW())
ON CONFLICT DO NOTHING;
```

`<REAL_SUBJECT>` ist die Keycloak-User-ID des Admins (siehe "Keycloak-Administration"), `<USERNAME>` und `<EMAIL>` sind die Keycloak-Werte dieses Benutzers.

## NetworkPolicy

`k8s/network-policy.yaml` setzt Default-Deny fuer eingehenden Verkehr im Namespace und gibt nur frei: Ingress-Controller zu Backend und Keycloak (Port 8080), Backend und Keycloak sowie der DB-Init-Job zu Postgres (5432), Backend zu OpenSearch (9200).

**Vorbedingung:** Task 1.3 ist abgeschlossen. Das heisst: LeoCloud setzt NetworkPolicies durch, und das Namespace-Label des Ingress-Controllers ist geprueft.

```bash
kubectl get ns ingress-nginx --show-labels
kubectl -n student-it220209 apply -f k8s/network-policy.yaml
```

Pruefen: aus einem Debug-Pod im Namespace muss `opensearch:9200` antworten, von ausserhalb des Namespace nicht (erwartet: Timeout). Falls der Ingress-Controller nicht mehr erreichbar ist, die Policy `allow-ingress-to-backend` bzw. `allow-ingress-to-keycloak` sofort loeschen (`kubectl delete networkpolicy <name>`).

## Image-Tag

- Die CI baut `ghcr.io/htl-leo-itp-25-27-4-5bhitm/indooro-backend-v2:<Commit-SHA>`.
- `k8s/backend.yaml` nennt einen festen SHA-Tag, nie `latest`. Vor jedem `apply` den Tag pruefen.
- Der bisherige Tag `a47c5e6` ist ein Image mit altem Dockerfile (JDK 25, Benutzer root). Mit `runAsNonRoot` startet der Pod damit nicht. Vor dem Rollout des neuen Manifests muss ein CI-Image mit dem Nicht-root-Dockerfile gebaut und sein Tag eingetragen sein.
- Rollout und Rollback: `docs/pilot-readiness/operations/RELEASE_RUNBOOK.md`.

## Build-Hinweis fuer Java 24

Auf diesem Projekt laeuft Quarkus 3.6 aktuell nicht sauber auf Java 24 ohne Byte-Buddy-Flag.
Damit `sh mvnw package` lokal trotzdem funktioniert, liegt jetzt diese Datei im Repo:

- `backend/indooro_server/.mvn/jvm.config`

mit folgendem Inhalt:

```text
-Dnet.bytebuddy.experimental=true
```

Dadurch koennen lokale Builds auf neueren JDKs laufen, ohne dass bei jedem Aufruf manuell `MAVEN_OPTS` gesetzt werden muss.

## Muss man das jedes Mal machen

Nein, nicht alles.

Einmalig oder nur selten:

- `kubectl apply -n student-it220209 -f k8s/backend-ingress.yaml`
- nur wenn ihr den Host, den Namen oder die Ingress-Regeln aendert

Bei Backend-Code-Aenderungen:

- Code committen und auf `main` pushen
- GitHub Actions baut das Backend-Image automatisch neu und pusht es nach GHCR

Was noetig ist:

- Neuen Commit-SHA-Tag per `kubectl set image` setzen, siehe `RELEASE_RUNBOOK.md`

Das Image-Tag ist ein fester Commit-SHA. Ein neuer Pod entsteht daher nur, wenn der Tag geaendert wird. `:latest` wird nicht mehr verwendet.

Bei Daten-Aenderungen:

- Produktdaten werden nicht automatisch aus dem Repo in OpenSearch geladen
- wenn ihr neue oder andere Produktdaten wollt, muesst ihr sie aktiv importieren
- das betrifft die Datei `belegplan.json` oder andere Importquellen

## Offene Punkte

- `postgres` sollte ins Repo uebernommen werden, wenn es wirklich zu Indooro gehoert
- `build.sh` sollte auf `indooro-backend-v2` umgestellt werden
