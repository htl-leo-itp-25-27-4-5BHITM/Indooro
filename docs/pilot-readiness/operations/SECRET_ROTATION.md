# Secrets anlegen und rotieren (LeoCloud)

Gilt für den Namespace `student-it220209`. **Dieses Dokument wird erst in Phase B ausgeführt** (erster Pilot-Release, durch die Person mit Cluster-Zugang). Coding-Agenten führen nichts davon aus.

Warum: Die bisherigen Zugangsdaten (Keycloak-Demo-Benutzer, Client-Secret, Datenbank-Passwort, Bootstrap-Admin) standen im Klartext in Manifesten, `DEPLOYMENT.md` und `keycloak/realm/indooro-realm.json`. Sie stecken weiterhin in der **Git-Historie** und gelten als öffentlich. Rotation ist deshalb Pflicht vor dem Pilot, auch wenn die aktuellen Dateien sauber sind.

Regeln:

- Neue Werte werden zufällig erzeugt und nie ausgegeben, nie in Git, Chat, Tickets oder Shell-Historie geschrieben. Die Befehle unten halten sie nur in Shell-Variablen.
- Alte Werte werden nicht in dieses Repo kopiert. Sie stehen im Cluster (`kubectl get secret …`) und in der Git-Historie.
- Alle neuen Werte kommen in den Passwortmanager des Teams (Erik).

## Secrets im Überblick

| Secret | Key | Verwendet von | Hinweis |
|---|---|---|---|
| `indooro-postgres-secret` | `POSTGRES_PASSWORD` | Deployments `postgres`, `indooro-backend` (`DB_PASSWORD`) | Postgres liest den Wert nur beim ersten Initialisieren des Datenverzeichnisses. Ändern geht zusätzlich per `ALTER USER` |
| `indooro-keycloak-secret` | `bootstrap-admin-username`, `bootstrap-admin-password` | Keycloak-Adminkonsole | wird bei frischer Keycloak-Datenbank angelegt |
| | `admin-web-client-secret` | Keycloak-Realm (Client `indooro-admin-web`) **und** Backend (`QUARKUS_OIDC_CREDENTIALS_SECRET`) | beide Seiten lesen denselben Key |
| | `demo-admin-password`, `demo-region-password`, `demo-store-password` | Keycloak-Realm-Import (Benutzer `indooro-admin`, `indooro-region`, `indooro-store`) | |
| `indooro-openai-secret` | `OPENAI_API_KEY` | Backend-Upsell | unverändert, nicht Teil der Rotation (stand nie im Repo) |

Vorlage mit Platzhaltern: `k8s/secrets.example.yaml` (nur lesen, nicht anwenden).

**Wichtig zu Keycloak auf LeoCloud:** `k8s/keycloak.yaml` startet `start-dev` mit `KC_DB=dev-file` ohne Volume. Bei jedem Neustart des Keycloak-Pods wird die Datenbank leer neu aufgebaut und der Realm aus der ConfigMap importiert. Die Werte aus dem Secret werden dabei per `${…}`-Platzhalter eingesetzt. Konsequenzen:

- Passwörter, die nur in der Keycloak-Konsole geändert wurden, gehen beim Neustart verloren. Dauerhaft gilt nur der Wert im Secret.
- Eine Rotation ist ein Secret-Update plus Neustart von Keycloak (und des Backends wegen des Client-Secrets). Alle Admin-Sitzungen enden.
- Benutzer-IDs bleiben (feste UUIDs im Realm), die Zuordnungen in `user_access_assignments` bleiben gültig.

## 0. Voraussetzungen

```bash
NS=student-it220209
kubectl config current-context        # muss der LeoCloud-Kontext sein
kubectl -n $NS get deploy,secret      # alles da?
```

Backup zuerst (siehe `BACKUP_RESTORE.md`):

```bash
python3 scripts/ops/backup_postgres.py --namespace $NS
python3 scripts/ops/export_products.py --base-url https://it220209.cloud.htl-leonding.ac.at
```

Und den Realm-Stand sichern, falls zwischenzeitlich Benutzer in der Konsole angelegt wurden (sie verschwinden sonst beim Neustart):

```bash
kubectl -n $NS exec deploy/indooro-keycloak -- /opt/keycloak/bin/kc.sh export --realm indooro --file /tmp/indooro-realm-export.json
KC_POD=$(kubectl -n $NS get pod -l app=indooro-keycloak -o jsonpath='{.items[0].metadata.name}')
kubectl -n $NS cp $KC_POD:/tmp/indooro-realm-export.json backups/indooro-realm-export.json
```

(Die Exportdatei enthält Passwort-Hashes und gehört nie ins Repo; `backups/` ist ignoriert.)

## 1. Umstellung auf Secret-Referenzen ohne Wertänderung

Das neue Manifest erwartet Keys, die im Cluster noch nicht existieren. Deshalb zuerst die Secrets mit den **aktuellen** Werten ergänzen, dann Manifeste anwenden. So ändert sich beim Umstellen nichts.

Aktuell gilt: Datenbank-Passwort = bisheriger Standardwert aus der Git-Historie (`k8s/postgres.yaml` vor diesem Change), Keycloak-Werte = bisherige Werte des Secrets und des Realms. Die Keycloak-Werte aus dem Cluster ablesen und in Shell-Variablen halten (nicht ausgeben):

```bash
KC_BOOT_USER=$(kubectl -n $NS get secret indooro-keycloak-secret -o jsonpath='{.data.bootstrap-admin-username}' | base64 -d)
KC_BOOT_PW=$(kubectl -n $NS get secret indooro-keycloak-secret -o jsonpath='{.data.bootstrap-admin-password}' | base64 -d)
KC_CLIENT=$(kubectl -n $NS get secret indooro-keycloak-secret -o jsonpath='{.data.admin-web-client-secret}' | base64 -d)
```

Die drei Demo-Passwörter und das bisherige Datenbank-Passwort stehen in der Git-Historie (`git show a47c5e6:k8s/keycloak.yaml`, `git show a47c5e6:k8s/postgres.yaml`). Als Shell-Variablen `DEMO_ADMIN_PW`, `DEMO_REGION_PW`, `DEMO_STORE_PW`, `PG_PW` setzen (aus der Historie ablesen, nicht in neue Dateien kopieren).

```bash
kubectl -n $NS create secret generic indooro-postgres-secret \
  --from-literal=POSTGRES_PASSWORD="$PG_PW" --dry-run=client -o yaml | kubectl apply -f -

kubectl -n $NS create secret generic indooro-keycloak-secret \
  --from-literal=bootstrap-admin-username="$KC_BOOT_USER" \
  --from-literal=bootstrap-admin-password="$KC_BOOT_PW" \
  --from-literal=admin-web-client-secret="$KC_CLIENT" \
  --from-literal=demo-admin-password="$DEMO_ADMIN_PW" \
  --from-literal=demo-region-password="$DEMO_REGION_PW" \
  --from-literal=demo-store-password="$DEMO_STORE_PW" \
  --dry-run=client -o yaml | kubectl apply -f -
```

Danach nach `RELEASE_RUNBOOK.md` die Manifeste anwenden (Postgres, OpenSearch, Keycloak, Backend) und den Smoke-Check ausführen. Erst wenn alles läuft, weiter mit Schritt 2.

## 2. Rotation

Maintenance-Fenster wählen (nicht während einer Pilot-Sitzung, ca. 5–10 Minuten Admin-Ausfall; die iOS-App liest weiter aus ihrem Layout-Cache, neue Layouts und die Suche brauchen das Backend nach dem Neustart wieder).

### 2.1 Neue Werte erzeugen (nur in der Shell)

```bash
NEW_PG=$(openssl rand -hex 24)
NEW_CLIENT=$(openssl rand -hex 24)
NEW_BOOT_PW=$(openssl rand -base64 24 | tr -d '/+=')
NEW_ADMIN_PW=$(openssl rand -base64 18 | tr -d '/+=')
NEW_REGION_PW=$(openssl rand -base64 18 | tr -d '/+=')
NEW_STORE_PW=$(openssl rand -base64 18 | tr -d '/+=')
```

Die Werte jetzt direkt in den Passwortmanager übernehmen (z. B. `printf '%s' "$NEW_ADMIN_PW" | pbcopy`), nicht mit `echo` im Terminal anzeigen.

### 2.2 Datenbank-Passwort

Reihenfolge: erst in der Datenbank ändern, dann das Secret, dann Backend neu starten. Zwischen den Schritten kann das Backend kurz keine neuen Datenbankverbindungen aufbauen.

```bash
kubectl -n $NS exec -i deploy/postgres -- sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<EOF
ALTER USER indooro PASSWORD '$NEW_PG';
EOF
kubectl -n $NS create secret generic indooro-postgres-secret \
  --from-literal=POSTGRES_PASSWORD="$NEW_PG" --dry-run=client -o yaml | kubectl apply -f -
kubectl -n $NS rollout restart deployment/indooro-backend
kubectl -n $NS rollout status deployment/indooro-backend --timeout=300s
```

### 2.3 Keycloak: Client-Secret, Bootstrap-Admin, Demo-Benutzer

```bash
kubectl -n $NS create secret generic indooro-keycloak-secret \
  --from-literal=bootstrap-admin-username="$KC_BOOT_USER" \
  --from-literal=bootstrap-admin-password="$NEW_BOOT_PW" \
  --from-literal=admin-web-client-secret="$NEW_CLIENT" \
  --from-literal=demo-admin-password="$NEW_ADMIN_PW" \
  --from-literal=demo-region-password="$NEW_REGION_PW" \
  --from-literal=demo-store-password="$NEW_STORE_PW" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n $NS rollout restart deployment/indooro-keycloak
kubectl -n $NS rollout status deployment/indooro-keycloak --timeout=300s
kubectl -n $NS rollout restart deployment/indooro-backend
kubectl -n $NS rollout status deployment/indooro-backend --timeout=300s
```

Keycloak braucht nach dem Start 1–2 Minuten, bis der Realm importiert ist.

### 2.4 Aufräumen

```bash
unset NEW_PG NEW_CLIENT NEW_BOOT_PW NEW_ADMIN_PW NEW_REGION_PW NEW_STORE_PW PG_PW DEMO_ADMIN_PW DEMO_REGION_PW DEMO_STORE_PW KC_CLIENT KC_BOOT_PW
```

Die neuen Passwörter an die Teammitglieder über den Passwortmanager weitergeben, nie per Git.

## 3. Prüfung

```bash
BASE=https://it220209.cloud.htl-leonding.ac.at
curl -s -o /dev/null -w "%{http_code}\n" $BASE/keycloak/realms/indooro/.well-known/openid-configuration   # 200
python3 scripts/ops/pilot_smoke.py $BASE <storeId> milch
```

Manuell (Human-Schritt):

1. `$BASE/admin/next/` öffnen, mit `indooro-admin` und dem **neuen** Passwort anmelden, eine Seite öffnen, abmelden.
2. Mit dem **alten** Passwort anmelden: muss scheitern.
3. Je einmal als `indooro-region` und `indooro-store` anmelden.
4. Von außerhalb des Clusters ist OpenSearch nicht erreichbar (`harden-platform-security-baseline` 8.2):

```bash
kubectl -n $NS get svc opensearch dashboards     # TYPE muss ClusterIP sein, keine NodePort-Spalte 9200:3xxxx
kubectl -n $NS get deploy dashboards             # 0/0
```

Von einem Rechner außerhalb des Schulnetzes (oder Hotspot) darf `<node-ip>:<früherer-node-port>` nicht mehr antworten. Die früheren NodePorts stehen vor dem Apply in `kubectl -n $NS get svc opensearch -o wide`; vorher notieren.

Optional die Rollen-Tests gegen LeoCloud mit den neuen Passwörtern in `api-tests/httpyac/.env` (lokal, nicht committen): `npm run api:test:public && npm run api:test:roles`.

## 4. Wenn der Login nicht funktioniert

1. Pod hängt in `CreateContainerConfigError`: ein Secret-Key fehlt (`kubectl -n $NS describe pod -l app=indooro-keycloak`). Key nachtragen (Schritt 1) und den Pod neu starten. Sonst die Logs lesen: `kubectl -n $NS logs deploy/indooro-keycloak --tail=200`.
2. Backend meldet 401 nach dem Login: Client-Secret in Keycloak und Backend weichen ab. Beide lesen `admin-web-client-secret`. Nach einer Änderung beide Deployments neu starten (Schritt 2.3).
3. Alten Stand wiederherstellen: die vor der Rotation notierten alten Werte (Schritt 1) erneut mit den `create secret … | apply`-Befehlen aus Schritt 1 einspielen und Keycloak und Backend neu starten. Datenbank: `ALTER USER indooro PASSWORD '<alt>'` wiederholen.
4. Notfall-Zugang zur Adminkonsole: `kubectl -n $NS port-forward deploy/indooro-keycloak 8081:8080`, dann `http://localhost:8081/keycloak/admin/` mit dem Bootstrap-Admin aus dem Secret.
5. Benutzer fehlen nach Neustart: Realm-Export aus Schritt 0 prüfen; Benutzer, die nur in der Konsole existierten, neu anlegen und danach in `keycloak/realm`/ConfigMap aufnehmen, sonst verschwinden sie beim nächsten Neustart wieder.

## 5. Nach der Rotation

- `harden-platform-security-baseline` 1.1/1.2 sind erledigt, sobald Schritt 2 und 3 durchlaufen sind. In `RELEASES.md` und `STATUS.md` mit Datum eintragen (ohne Werte).
- Offene Folgearbeit (nicht Pilot-kritisch): Keycloak mit persistenter Datenbank und `start` statt `start-dev` (`harden-platform-security-baseline` 2.1–2.4), Direct-Access-Grants im Realm abschalten, sobald die Token-Tests ohne Passwort-Grant laufen.
