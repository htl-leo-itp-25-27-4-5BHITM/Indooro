# Release-Runbook Backend (LeoCloud)

Gilt für jeden Backend-Rollout im Pilot. Namespace `student-it220209`, Host `it220209.cloud.htl-leonding.ac.at`, Deployment `indooro-backend`, Image `ghcr.io/htl-leo-itp-25-27-4-5bhitm/indooro-backend-v2`.

Die Befehle führt die Person mit LeoCloud-Zugang aus (Erik). Coding-Agenten führen sie nicht aus, sie dokumentieren nur. Die Befehle enthalten keine Secret-Werte.

Kürzel in den Befehlen:

```bash
NS=student-it220209
IMG=ghcr.io/htl-leo-itp-25-27-4-5bhitm/indooro-backend-v2
BASE=https://it220209.cloud.htl-leonding.ac.at
```

## Grundregeln

- Deployt wird nur ein **fester Image-Tag** (7-stelliger Commit-SHA, z. B. `a47c5e6`), nie `:latest`. CI baut den Tag erst, nachdem `mvn verify` grün war.
- Vor **jedem** Rollout und am Tag jeder Pilot-Sitzung gibt es ein frisches Backup.
- Nach jedem Rollout und jedem Rollback läuft der Smoke-Check, und beides wird in `RELEASES.md` protokolliert.
- Rollout nicht während einer Pilot-Sitzung im Markt.
- Der Pod braucht ca. 50 s bis „started“. Die Startup-Probe erlaubt 120 s (TCP 8080, 24 × 5 s). Dauert es länger, nicht abbrechen, sondern Logs lesen.

## Bekannte Fallen

| Falle | Wirkung | Maßnahme |
|---|---|---|
| Env `QUARKUS_OIDC_TOKEN_STATE_MANAGER_STRATEGY` | `application.properties` setzt `keep-all-tokens` (nötig für `roles.source=accesstoken`). Steht im Deployment `id-refresh-tokens`, stirbt der Pod mit „Access token is required to check the roles …“ (Release 2026-10-16) | `k8s/backend.yaml` setzt `keep-all-tokens` und `SPLIT_TOKENS=true`. Beim Anpassen des Manifests diese Variablen nicht entfernen |
| Container-Logs gehen beim Rollback verloren | Ursache einer fehlgeschlagenen Version ist nicht mehr belegbar | Vor dem Rollback `kubectl logs --previous` und `describe pod` sichern (Schritt 7) |
| `kubectl apply -f k8s/backend.yaml` mit falschem Tag | Rollout auf unbeabsichtigtes Image | Vor dem Apply Tag im Manifest prüfen: `grep image: k8s/backend.yaml` |
| Neue Secret-Keys fehlen | Pod bleibt in `CreateContainerConfigError` | Secrets vor dem Apply anlegen, siehe `SECRET_ROTATION.md` |
| Flyway-Migration im neuen Image | Rollback des Images macht die Migration nicht rückgängig | Release-Notes prüfen (`ls backend/indooro_server/src/main/resources/db/migration`); bei neuer Migration Backup zusätzlich nach Schritt 1 mit `restore_postgres.py` testen |

## Rollout

### 1. Vorbereitung prüfen

- Pull Request ist in `main` gemergt, der CI-Lauf auf `main` ist grün (Test- **und** Build-Schritt).
- Der Tag existiert in der Registry:

```bash
git rev-parse --short=7 origin/main        # erwarteter Tag
docker manifest inspect $IMG:<tag> >/dev/null && echo "Image vorhanden"
```

### 2. Backup

```bash
python3 scripts/ops/backup_postgres.py --namespace $NS
python3 scripts/ops/export_products.py --base-url $BASE
```

Beide Dateien landen in `backups/` (git-ignoriert). Eine Kopie außerhalb des Laptops ablegen (Schul-Laufwerk). Details und Restore-Probe: `BACKUP_RESTORE.md`.

### 3. Rollback-Punkt festhalten

```bash
kubectl -n $NS get deployment indooro-backend -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
kubectl -n $NS get pods -l app=indooro-backend -o jsonpath='{.items[0].status.containerStatuses[0].imageID}{"\n"}'
```

Beides in `RELEASES.md` unter „Vorheriger Stand“ eintragen. Der Digest (`@sha256:…`) ist auch dann gültig, wenn der Tag überschrieben würde.

### 4. Manifeste anwenden

Zuerst im Repo den Tag in `k8s/backend.yaml` auf den neuen SHA stellen (eigener Commit/PR, damit das Repo dem Cluster entspricht). Dann nur die geänderten Manifeste anwenden, in dieser Reihenfolge:

```bash
kubectl apply -n $NS -f k8s/postgres.yaml
kubectl apply -n $NS -f k8s/opensearch.yaml
kubectl apply -n $NS -f k8s/keycloak.yaml      # nur wenn geändert, startet Keycloak neu
kubectl apply -n $NS -f k8s/backend.yaml
kubectl apply -n $NS -f k8s/backend-ingress.yaml
```

Hinweise: Ein geänderter Env-Block in `k8s/postgres.yaml` oder `k8s/keycloak.yaml` startet den jeweiligen Pod neu (Postgres ca. 30 s, Keycloak 1–2 min inkl. Realm-Import; die Postgres-Strategie ist `Recreate`). Das Backend verliert dabei kurz die Datenbank bzw. die Anmeldung; in dieser Zeit keine Pilot-Sitzung.

Nur Image wechseln, ohne Manifeste:

```bash
kubectl -n $NS set image deployment/indooro-backend indooro-backend=$IMG:<tag>
```

### 5. Rollout abwarten

```bash
kubectl -n $NS rollout status deployment/indooro-backend --timeout=300s
kubectl -n $NS get pods -l app=indooro-backend
```

Erwartung: 1/1 ready, 0 Neustarts.

### 6. Smoke-Check

```bash
python3 scripts/ops/pilot_smoke.py $BASE <storeId> milch
```

Erwartung: Exit-Code 0, Ausgabe mit Stores, Regalen, Beacons und Produkten. Die `storeId` des Pilotmarkts steht in der Admin-Seite „Pilot-Bereitschaft“. Zusätzlich:

```bash
curl -s -o /dev/null -w "%{http_code}\n" $BASE/customer/
curl -s -o /dev/null -w "%{http_code}\n" $BASE/admin/next/        # 302 zum Keycloak-Login
```

Außerdem ein Admin-Login im Browser (Human-Schritt): Login, eine Seite, Logout.

### 7. Bei Fehler: Beweise sichern, dann Rollback

```bash
INC=backups/incident-$(date -u +%Y%m%dT%H%M)
mkdir -p "$INC"
kubectl -n $NS logs deployment/indooro-backend --tail=500 > "$INC/backend.log"
kubectl -n $NS logs deployment/indooro-backend --previous --tail=500 > "$INC/backend-previous.log" 2>&1
kubectl -n $NS describe pod -l app=indooro-backend > "$INC/describe.txt"
```

Rollback auf den in Schritt 3 notierten Stand (aktuell `:a47c5e6`):

```bash
kubectl -n $NS set image deployment/indooro-backend indooro-backend=$IMG:a47c5e6
kubectl -n $NS rollout status deployment/indooro-backend --timeout=300s
python3 scripts/ops/pilot_smoke.py $BASE <storeId> milch
```

Danach `k8s/backend.yaml` im Repo wieder auf den Rollback-Tag stellen (Revert-Commit). Datenbank-Restore ist nur nötig, wenn das fehlgeschlagene Image eine Flyway-Migration ausgeführt hat (siehe `BACKUP_RESTORE.md`, Abschnitt „Restore ins Cluster“).

### 8. Protokoll

Eine Zeile pro Rollout und pro Rollback in `RELEASES.md`: Datum (UTC), Commit, Image-Tag/Digest, angewendete Manifeste, Smoke-Ergebnis, Backup-Datei, Person.

## Stand vor dem ersten Pilot-Release

- Live seit 2026-10-17: `:a47c5e6` (Release #120). Vorheriger Stand `:248091e`, Digest in `docs/pilot-readiness/releases/RELEASE_2026-10-17.md`.
- Bis zur Rotation (`SECRET_ROTATION.md`) liegen die bisherigen Demo-Zugangsdaten noch im Cluster und in der Git-Historie.
