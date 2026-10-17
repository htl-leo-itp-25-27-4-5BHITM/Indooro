#!/usr/bin/env python3
"""Spielt einen Dump in eine lokale Wegwerf-PostgreSQL ein (Restore-Probe).

Aufruf (Beispiel):
    python3 scripts/ops/restore_postgres.py backups/2026-10-17-indooro.dump
    python3 scripts/ops/restore_postgres.py --down        # Container des Projekts entfernen

Ablauf: docker compose up -d (eigener Projektname, Standard indooro-restore) -> warten bis
pg_isready (60 s) -> pg_restore per stdin -> Zeilenzahlen der wichtigsten Tabellen.
Der Container bleibt danach laufen, damit das Backend dagegen getestet werden kann.

Sicherheit:
  - Es werden nur Container/Netzwerk des eigenen Projekts (-p) angefasst.
  - --down ruft "docker compose -p <project> down" ohne Volume-Option auf. Die Datenbank liegt
    in einem tmpfs und verschwindet mit dem Container.
  - Das Passwort ist zufaellig (oder kommt aus RESTORE_PASSWORD). Es wird nur per Umgebungs-
    variable an docker compose uebergeben, nie in eine Datei geschrieben und nie ausgegeben.
Nur Standardbibliothek; keine Shell, keine Shell-Syntax.
"""

from __future__ import annotations

import argparse
import os
import re
import secrets
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Callable, Mapping, Optional, Sequence

DEFAULT_PROJECT = "indooro-restore"
DEFAULT_PORT = 55432
DEFAULT_IMAGE = "postgres:16-alpine"
SERVICE = "db"
DB_NAME = "indooro"
DB_USER = "indooro"
PASSWORD_ENV = "RESTORE_PASSWORD"
PORT_ENV = "RESTORE_PORT"
IMAGE_ENV = "RESTORE_IMAGE"
DOWN_PASSWORD_PLACEHOLDER = "not-used-for-down"
READY_TIMEOUT_SECONDS = 60.0
READY_POLL_SECONDS = 2.0
MAGIC = b"PGDMP"
COUNT_TABLES = (
    "regions",
    "stores",
    "beacons",
    "beacon_assignments",
    "layout_versions",
    "audit_logs",
    "user_access_assignments",
)
COMPOSE_FILE = Path(__file__).resolve().with_name("restore-compose.yml")
PROJECT_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,62}$")
IMAGE_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/:@-]*$")

Runner = Callable[..., Any]
Sleep = Callable[[float], None]
Clock = Callable[[], float]


# ---------------------------------------------------------------------------
# Argumente
# ---------------------------------------------------------------------------

def parse_port(value: str) -> int:
    try:
        port = int(value)
    except ValueError as exc:
        raise ValueError(f"Port ist keine Zahl: {value!r}") from exc
    if not 1024 <= port <= 65535:
        raise ValueError("Port muss zwischen 1024 und 65535 liegen")
    return port


def _port_arg(value: str) -> int:
    try:
        return parse_port(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(str(exc)) from exc


def _project_arg(value: str) -> str:
    if not PROJECT_PATTERN.match(value):
        raise argparse.ArgumentTypeError("nur Kleinbuchstaben, Ziffern, _ und - (max. 63 Zeichen)")
    return value


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Restore-Probe: Dump in einen lokalen Postgres-Container (docker compose) einspielen.",
    )
    parser.add_argument("dump", nargs="?",
                        help="Pfad zur .dump-Datei (pg_dump -Fc). Entfaellt bei --down.")
    parser.add_argument("--project", type=_project_arg, default=DEFAULT_PROJECT,
                        help=f"docker-compose-Projektname (Standard: {DEFAULT_PROJECT})")
    parser.add_argument("--port", type=_port_arg, default=None,
                        help=f"Host-Port auf 127.0.0.1 (Standard: Env {PORT_ENV} oder {DEFAULT_PORT})")
    parser.add_argument("--image", default=None,
                        help=f"Postgres-Image (Standard: Env {IMAGE_ENV} oder {DEFAULT_IMAGE})")
    parser.add_argument("--down", action="store_true",
                        help="Nur Container und Netzwerk des Projekts entfernen: "
                             "docker compose -p <project> down. Ohne Volume-Option; die "
                             "Wegwerf-Datenbank liegt in einem tmpfs.")
    return parser


# ---------------------------------------------------------------------------
# Reine Logik (ohne Docker)
# ---------------------------------------------------------------------------

def validate_dump(path: Path) -> list[str]:
    """Liste der Fehler; leer heisst: Datei existiert und ist ein pg_dump -Fc."""
    if not path.is_file():
        return [f"Dump-Datei nicht gefunden: {path}"]
    with path.open("rb") as handle:
        head = handle.read(len(MAGIC))
    if head != MAGIC:
        return ["Keine PostgreSQL-Custom-Format-Datei (Magic PGDMP fehlt)"]
    return []


def resolve_port(cli_value: Optional[int], env: Mapping[str, str]) -> int:
    if cli_value is not None:
        return cli_value
    raw = env.get(PORT_ENV, "")
    return parse_port(raw) if raw else DEFAULT_PORT


def resolve_image(cli_value: Optional[str], env: Mapping[str, str]) -> str:
    image = cli_value or env.get(IMAGE_ENV, "") or DEFAULT_IMAGE
    if not IMAGE_PATTERN.match(image):
        raise ValueError(f"ungueltiger Image-Name: {image!r}")
    return image


def resolve_password(env: Mapping[str, str]) -> tuple[str, bool]:
    """Gibt (Passwort, vom Benutzer gesetzt?) zurueck."""
    raw = env.get(PASSWORD_ENV, "")
    if raw:
        if len(raw) < 8 or any(ch.isspace() for ch in raw):
            raise ValueError(f"{PASSWORD_ENV}: mindestens 8 Zeichen, ohne Leer- oder Steuerzeichen")
        return raw, True
    return secrets.token_urlsafe(24), False


def compose_env(password: str, port: int, image: str) -> dict[str, str]:
    env = dict(os.environ)
    env.update({PASSWORD_ENV: password, PORT_ENV: str(port), IMAGE_ENV: image})
    return env


def compose_cmd(project: str, compose_file: Path, *args: str) -> list[str]:
    return ["docker", "compose", "-p", project, "-f", str(compose_file), *args]


def build_up_cmd(project: str, compose_file: Path) -> list[str]:
    return compose_cmd(project, compose_file, "up", "-d")


def build_down_cmd(project: str, compose_file: Path) -> list[str]:
    # Bewusst ohne Volume-Option (Datenbank liegt in einem tmpfs).
    return compose_cmd(project, compose_file, "down")


def build_ready_cmd(project: str, compose_file: Path) -> list[str]:
    # TCP statt Socket: Der Init-Server der Postgres-Image lauscht nur auf dem Socket.
    return compose_cmd(project, compose_file, "exec", "-T", SERVICE,
                       "pg_isready", "-h", "127.0.0.1", "-U", DB_USER, "-d", DB_NAME)


def build_restore_cmd(project: str, compose_file: Path) -> list[str]:
    return compose_cmd(project, compose_file, "exec", "-T", SERVICE,
                       "pg_restore", "--no-owner", "--no-privileges", "--clean", "--if-exists",
                       "-U", DB_USER, "-d", DB_NAME)


def build_count_cmd(project: str, compose_file: Path, table: str) -> list[str]:
    if table not in COUNT_TABLES:
        raise ValueError(f"Tabelle nicht in der Zaehlliste: {table}")
    return compose_cmd(project, compose_file, "exec", "-T", SERVICE,
                       "psql", "-U", DB_USER, "-d", DB_NAME,
                       "-Atc", f"SELECT count(*) FROM {table}")


# ---------------------------------------------------------------------------
# Ablauf
# ---------------------------------------------------------------------------

def wait_for_ready(runner: Runner, project: str, compose_file: Path, env: Mapping[str, str],
                   sleep: Sleep, clock: Clock) -> bool:
    deadline = clock() + READY_TIMEOUT_SECONDS
    command = build_ready_cmd(project, compose_file)
    while True:
        probe = runner(command, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if probe.returncode == 0:
            return True
        if clock() >= deadline:
            return False
        sleep(READY_POLL_SECONDS)


def print_counts(runner: Runner, project: str, compose_file: Path, env: Mapping[str, str]) -> None:
    print("Zeilen je Tabelle:")
    for table in COUNT_TABLES:
        result = runner(build_count_cmd(project, compose_file, table), env=env,
                        capture_output=True, text=True)
        value = (result.stdout or "").strip() if result.returncode == 0 else ""
        shown = value if value.isdigit() else "fehlt oder nicht lesbar"
        print(f"  {table:<26} {shown}")


def print_backend_hint(port: int, password_from_user: bool) -> None:
    print("")
    print("Backend lokal gegen diese Datenbank starten (Umgebungsvariablen setzen):")
    print(f"  DB_HOST=localhost DB_PORT={port} DB_NAME={DB_NAME} "
          f"DB_USERNAME={DB_USER} DB_PASSWORD=<{PASSWORD_ENV}>")
    if password_from_user:
        print(f"  {PASSWORD_ENV} ist gesetzt; der Wert wird hier nicht angezeigt.")
    else:
        print(f"  Das Passwort ist zufaellig und wird nicht ausgegeben. Fuer eine feste Verbindung "
              f"{PASSWORD_ENV} selbst setzen, bevor das Skript startet.")
    print("  Die Datenbank liegt in einem tmpfs; --down entfernt alles.")


def run_restore(project: str, dump: Path, port: int, env: Mapping[str, str], runner: Runner,
                sleep: Sleep, clock: Clock, password_from_user: bool) -> int:
    up = runner(build_up_cmd(project, COMPOSE_FILE), env=env)
    if up.returncode != 0:
        print(f"FEHLER: docker compose up beendet mit Code {up.returncode}.", file=sys.stderr)
        return 1
    print(f"Container laeuft (Projekt {project}, Port 127.0.0.1:{port}).")

    if not wait_for_ready(runner, project, COMPOSE_FILE, env, sleep, clock):
        print(f"FEHLER: Datenbank nach {READY_TIMEOUT_SECONDS:g} s nicht bereit. Container bleibt "
              f"fuer die Diagnose stehen; Entfernen mit --down.", file=sys.stderr)
        return 1
    print("Datenbank bereit, spiele Dump ein ...")

    with dump.open("rb") as handle:
        restore = runner(build_restore_cmd(project, COMPOSE_FILE), env=env, stdin=handle)
    restore_ok = restore.returncode == 0
    if not restore_ok:
        print(f"WARNUNG: pg_restore beendete mit Code {restore.returncode}. Meldungen oben pruefen; "
              f"die Zaehlungen folgen trotzdem.", file=sys.stderr)

    print_counts(runner, project, COMPOSE_FILE, env)
    print_backend_hint(port, password_from_user)
    return 0 if restore_ok else 1


def run_down(project: str, runner: Runner) -> int:
    env = compose_env(DOWN_PASSWORD_PLACEHOLDER, DEFAULT_PORT, DEFAULT_IMAGE)
    down = runner(build_down_cmd(project, COMPOSE_FILE), env=env)
    if down.returncode != 0:
        print(f"FEHLER: docker compose down beendet mit Code {down.returncode}.", file=sys.stderr)
        return 1
    print(f"Projekt {project}: Container und Netzwerk entfernt (Datenbank lag im tmpfs).")
    return 0


def main(argv: Optional[Sequence[str]] = None, runner: Runner = subprocess.run,
         sleep: Sleep = time.sleep, clock: Clock = time.monotonic) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.down:
        if args.dump:
            parser.error("--down und eine Dump-Datei schliessen sich aus")
        try:
            return run_down(args.project, runner)
        except OSError as exc:
            print(f"FEHLER: docker konnte nicht gestartet werden: {exc}", file=sys.stderr)
            return 1

    if not args.dump:
        parser.error("Dump-Datei angeben (oder --down verwenden)")

    try:
        port = resolve_port(args.port, os.environ)
        image = resolve_image(args.image, os.environ)
        password, password_from_user = resolve_password(os.environ)
    except ValueError as exc:
        print(f"FEHLER: {exc}", file=sys.stderr)
        return 1

    dump = Path(args.dump)
    problems = validate_dump(dump)
    if problems:
        for problem in problems:
            print(f"FEHLER: {problem}", file=sys.stderr)
        return 1

    env = compose_env(password, port, image)
    try:
        return run_restore(args.project, dump, port, env, runner, sleep, clock, password_from_user)
    except OSError as exc:
        print(f"FEHLER: docker konnte nicht gestartet werden: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
