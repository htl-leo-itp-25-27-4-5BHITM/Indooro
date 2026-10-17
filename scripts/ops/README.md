# Betriebsskripte (scripts/ops)

Python-Skripte für Backup, Restore-Probe, Produkt-Export und Smoke-Check des Pilot-Backends
(LeoCloud, Namespace `student-it220209`). Nur Standardbibliothek; `kubectl` und `docker`
werden über `subprocess` aufgerufen. Läuft unter macOS, WSL und Windows-PowerShell
(`python` bzw. `py` statt `python3` verwenden, Pfade mit `\` oder `/`).

Voraussetzungen: Python 3.10+, `kubectl` mit gültiger LeoCloud-Anmeldung, Docker mit Compose v2.

## Skripte

```text
python3 scripts/ops/backup_postgres.py --dry-run     # zeigt nur den kubectl-Befehl
python3 scripts/ops/backup_postgres.py               # -> backups/<UTC-Datum>-indooro.dump
python3 scripts/ops/export_products.py --base-url https://it220209.cloud.htl-leonding.ac.at
                                                     # -> backups/<UTC-Datum>-products.ndjson
python3 scripts/ops/restore_postgres.py backups/2026-10-17-indooro.dump
                                                     # lokaler Postgres auf 127.0.0.1:55432
python3 scripts/ops/restore_postgres.py --down       # Container des Projekts entfernen
python3 scripts/ops/pilot_smoke.py https://it220209.cloud.htl-leonding.ac.at <storeId> apfel
```

- `backup_postgres.py`: `pg_dump -Fc` über `kubectl exec deploy/postgres`, Streaming in die Datei,
  danach Prüfung auf Magic `PGDMP` und Mindestgröße. Ausgabe: Pfad, Größe, SHA-256.
- `export_products.py`: `GET /api/products?size=…`, eine JSON-Zeile pro Produkt. Wiederholt bei
  5xx und Netzwerkfehlern (`--retries`). Nur http/https.
- `restore_postgres.py`: startet `restore-compose.yml` mit eigenem Projektnamen
  (`-p indooro-restore`), wartet auf Postgres (60 s), spielt den Dump per `pg_restore` ein und
  zählt die Zeilen der Kerntabellen. Das Passwort ist zufällig, wird nur an docker compose
  übergeben und nicht ausgegeben. Setze `RESTORE_PASSWORD` selbst, wenn das Backend lokal
  dagegen laufen soll. Port und Image: `--port`/`RESTORE_PORT`, `--image`/`RESTORE_IMAGE`.
  Der Container bleibt laufen. `--down` entfernt Container und Netzwerk **ohne** Volume-Option;
  die Wegwerf-Datenbank liegt in einem tmpfs und verschwindet mit dem Container.
- `pilot_smoke.py`: prüft Stores, Layout (Regale, Beacons) und Suche mit HTTP 200 und Inhalt;
  `/api/categories` ist nur Information (5xx zählt als Fehler). Exit 0 nur bei OK.

## Tests

Aus dem Repo-Root, ohne Netzwerk, ohne kubectl, ohne docker:

```text
python3 -I -m unittest discover scripts/ops -v
```

## Regeln

- `backups/` ist in `.gitignore` eingetragen. Dumps und NDJSON-Exporte enthalten echte Daten:
  **nie committen**, nicht in Chats oder Tickets einfügen. Kopie auf einen sicheren
  Schul-Datenträger legen.
- Keine Befehle gegen LeoCloud (`backup_postgres.py`, `export_products.py`, `pilot_smoke.py`
  gegen die echte URL) ohne Freigabe ausführen.
- Keine Passwörter oder Tokens in Dateien dieses Ordners ablegen. Die Skripte lesen Secrets
  nur aus der Umgebung.
