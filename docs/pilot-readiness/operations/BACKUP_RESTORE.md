# Backup und Restore (PostgreSQL und Produkte)

Skripte: `scripts/ops/` (Python 3.10+, nur Standardbibliothek; macOS, WSL, Windows-PowerShell). Sie brauchen `kubectl` (Backup), `docker` (Restore-Probe) und Netzzugriff auf das Backend (Produkt-Export). Backups liegen in `backups/` und sind per `.gitignore` ausgeschlossen: **nie committen**, eine Kopie auf ein Schul-Laufwerk legen.

Wann: vor jedem Rollout, vor jeder Rotation (`SECRET_ROTATION.md`) und am Tag jeder Pilot-Sitzung. Die Restore-Probe läuft mindestens einmal vor der ersten Pilot-Sitzung im Markt.

## Backup

```bash
NS=student-it220209
python3 scripts/ops/backup_postgres.py --namespace $NS
python3 scripts/ops/export_products.py --base-url https://it220209.cloud.htl-leonding.ac.at
```

- `backup_postgres.py` führt `pg_dump -Fc` im Pod `deploy/postgres` aus und streamt das Ergebnis nach `backups/<UTC-Datum>-indooro.dump`. Das Skript prüft den Dateikopf (`PGDMP`) und die Mindestgröße und gibt Größe und SHA-256 aus. Bei einem Fehler löscht es die Datei und endet mit Exit-Code 1.
- `export_products.py` holt `GET /api/products?size=10000` und schreibt `backups/<UTC-Datum>-products.ndjson` (eine Zeile pro Produkt). Exit 1 bei leerem Ergebnis: dann ist der Produktindex leer und der Export kein gültiges Backup. Der Produktindex (OpenSearch) ist nicht Teil des Dumps; Produkte lassen sich aus der NDJSON-Datei über `POST /api/products/bulk` (Admin) wiederherstellen.
- `--dry-run` zeigt nur den `kubectl`-Befehl.

## Restore-Probe (lokal, Docker)

```bash
python3 scripts/ops/restore_postgres.py backups/<datum>-indooro.dump
```

Ablauf: eigenes Compose-Projekt `indooro-restore` (Postgres 16 auf `127.0.0.1:55432`, Datenbank in einem tmpfs), Warten auf `pg_isready`, `pg_restore --clean --if-exists --no-owner`, danach die Zeilenzahlen von `regions`, `stores`, `beacons`, `beacon_assignments`, `layout_versions`, `audit_logs`, `user_access_assignments`. Das Passwort ist zufällig und wird nicht ausgegeben. Soll das Backend dagegen laufen, vorher selbst ein Passwort setzen:

```bash
export RESTORE_PASSWORD=$(openssl rand -hex 12)
python3 scripts/ops/restore_postgres.py backups/<datum>-indooro.dump
cd backend/indooro_server
DB_HOST=localhost DB_PORT=55432 DB_PASSWORD="$RESTORE_PASSWORD" \
  OIDC_AUTH_SERVER_URL=http://localhost:1/realms/x QUARKUS_HTTP_PORT=18090 \
  java -jar target/opensearch-api-1.0.0-SNAPSHOT-runner.jar      # nach `sh ./mvnw package -DskipTests`
python3 scripts/ops/pilot_smoke.py http://localhost:18090 <storeId> milch
```

Aufräumen (Container und Netzwerk, **ohne** `-v`):

```bash
python3 scripts/ops/restore_postgres.py --down
```

Erwartung: Pilotmarkt, aktives Layout und Beacons sind vorhanden (Zeilenzahlen > 0, `pilot_smoke.py` zeigt Regale und Beacons). Der Produkt-Teil des Smoke-Checks braucht zusätzlich einen lokalen OpenSearch-Index (`docker-compose.yml`, Produkte aus der NDJSON-Datei einspielen).

### Ergebnis der Probe vom 2026-10-17

Lokal wiederholbar durchgeführt (Quelle: lokale Postgres-16-Datenbank mit allen 14 Flyway-Migrationen des Backends und Testdaten, kein LeoCloud-Dump):

| Schritt | Ergebnis |
|---|---|
| `backup_postgres.py` (mit `kubectl`-Shim auf `docker exec`) | Dump 59 660 Byte, Kopf `PGDMP`, SHA-256 ausgegeben, Exit 0 |
| `restore_postgres.py` | Projekt `indooro-restore`, 1 Region, 1 Markt, 2 Beacons, 2 Zuordnungen, 1 Layout, 1 Zugriffszuordnung |
| Backend (Jar, Profil prod) gegen die wiederhergestellte Datenbank | Flyway ohne Änderung, `/api/mobile/stores` 200 |
| `pilot_smoke.py` | Store gefunden, Layout 3 Regale und 2 Beacons; Suche und Kategorien scheiterten erwartungsgemäß (kein OpenSearch gestartet) |
| `--down` | Container und Netzwerk entfernt, nichts übrig |

Die Probe mit einem echten LeoCloud-Dump steht aus (Task 3.5, Mensch mit Cluster-Zugang).

## Restore ins Cluster (nur im Notfall)

Nur nötig, wenn ein fehlgeschlagenes Image Flyway-Migrationen ausgeführt hat oder Daten beschädigt wurden. Vorher ein frisches Backup des aktuellen Zustands ziehen und die Entscheidung mit Erik treffen.

```bash
kubectl -n $NS scale deployment/indooro-backend --replicas=0
kubectl -n $NS exec -i deploy/postgres -- sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backups/<datum>-indooro.dump
kubectl -n $NS scale deployment/indooro-backend --replicas=1
```

Danach `pilot_smoke.py` ausführen und das Ereignis in `RELEASES.md` eintragen.
