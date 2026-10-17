#!/usr/bin/env python3
"""Erstellt einen PostgreSQL-Dump (Custom-Format) der LeoCloud-Datenbank.

Aufruf (Beispiel):
    python3 scripts/ops/backup_postgres.py                # schreibt backups/<UTC-Datum>-indooro.dump
    python3 scripts/ops/backup_postgres.py --dry-run      # nur Befehl und Ziel anzeigen

Der Dump laeuft als `kubectl exec deploy/<deployment> -- pg_dump -Fc` und wird direkt in die
Datei gestreamt (nicht im Speicher gesammelt). Danach werden Exit-Code, Magic PGDMP und
Mindestgroesse geprueft; sonst wird die Datei entfernt. Nur Standardbibliothek.
backups/ ist git-ignoriert: nie committen, Kopie auf einen sicheren Datentraeger.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import shlex
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional, Sequence

DEFAULT_NAMESPACE = "student-it220209"
DEFAULT_DEPLOYMENT = "postgres"
DEFAULT_OUT_DIR = "backups"
MAGIC = b"PGDMP"
MIN_DUMP_BYTES = 1024
HASH_CHUNK = 1024 * 1024
PG_DUMP_SCRIPT = 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"'
NAME_PATTERN = re.compile(r"^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$")

Runner = Callable[..., Any]


# ---------------------------------------------------------------------------
# Argumente und reine Logik
# ---------------------------------------------------------------------------

def _k8s_name(value: str) -> str:
    if not NAME_PATTERN.match(value):
        raise argparse.ArgumentTypeError("nur Kleinbuchstaben, Ziffern und Bindestriche (DNS-Name)")
    return value


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Erstellt einen pg_dump (Custom-Format) aus dem LeoCloud-Postgres nach backups/.",
    )
    parser.add_argument("--namespace", type=_k8s_name, default=DEFAULT_NAMESPACE,
                        help=f"Kubernetes-Namespace (Standard: {DEFAULT_NAMESPACE})")
    parser.add_argument("--deployment", type=_k8s_name, default=DEFAULT_DEPLOYMENT,
                        help=f"Deployment mit PostgreSQL (Standard: {DEFAULT_DEPLOYMENT})")
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR,
                        help=f"Zielverzeichnis (Standard: {DEFAULT_OUT_DIR})")
    parser.add_argument("--dry-run", action="store_true",
                        help="Nur den kubectl-Befehl und das Ziel anzeigen, nichts ausfuehren")
    return parser


def build_pg_dump_command(namespace: str, deployment: str) -> list[str]:
    return ["kubectl", "-n", namespace, "exec", f"deploy/{deployment}", "--",
            "sh", "-c", PG_DUMP_SCRIPT]


def dump_file_path(out_dir: Path, now: datetime) -> Path:
    """backups/<UTC-Datum>-indooro.dump; bei Existenz -HHMMSS anhaengen."""
    stem = f"{now:%Y-%m-%d}-indooro"
    plain = out_dir / f"{stem}.dump"
    if not plain.exists():
        return plain
    return out_dir / f"{stem}-{now:%H%M%S}.dump"


def validate_dump_file(path: Path) -> list[str]:
    """Liste der Fehler; leer heisst: Datei ist ein gueltiger Dump-Kopf."""
    if not path.is_file():
        return [f"Datei fehlt: {path}"]
    problems: list[str] = []
    size = path.stat().st_size
    if size <= MIN_DUMP_BYTES:
        problems.append(f"Datei zu klein: {size} Byte (mehr als {MIN_DUMP_BYTES} erwartet)")
    with path.open("rb") as handle:
        head = handle.read(len(MAGIC))
    if head != MAGIC:
        problems.append("Falsche Dateikennung: Magic PGDMP fehlt (kein pg_dump -Fc)")
    return problems


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(HASH_CHUNK), b""):
            digest.update(chunk)
    return digest.hexdigest()


def format_command(command: Sequence[str]) -> str:
    if os.name == "nt":
        return subprocess.list2cmdline(list(command))
    return shlex.join(command)


def _discard(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        pass


# ---------------------------------------------------------------------------
# Ablauf
# ---------------------------------------------------------------------------

def main(argv: Optional[Sequence[str]] = None, runner: Runner = subprocess.run,
         now: Optional[datetime] = None) -> int:
    args = build_parser().parse_args(argv)
    moment = now or datetime.now(timezone.utc)
    command = build_pg_dump_command(args.namespace, args.deployment)
    out_dir = Path(args.out_dir)

    if args.dry_run:
        print("Dry-Run, es wird nichts ausgefuehrt.")
        print(f"Befehl: {format_command(command)}")
        print(f"Ziel:   {dump_file_path(out_dir, moment)}")
        return 0

    out_dir.mkdir(parents=True, exist_ok=True)
    target = dump_file_path(out_dir, moment)
    try:
        # "x": nie vorhandene Datei ueberschreiben.
        with target.open("xb") as handle:
            result = runner(command, stdout=handle, stderr=None, check=False)
    except FileExistsError:
        print(f"FEHLER: Ziel existiert bereits: {target}", file=sys.stderr)
        return 1
    except OSError as exc:
        _discard(target)
        print(f"FEHLER: kubectl konnte nicht gestartet werden: {exc}", file=sys.stderr)
        return 1

    if result.returncode != 0:
        _discard(target)
        print(f"FEHLER: kubectl/pg_dump beendet mit Code {result.returncode}; Datei entfernt.",
              file=sys.stderr)
        return 1

    problems = validate_dump_file(target)
    if problems:
        _discard(target)
        for problem in problems:
            print(f"FEHLER: {problem}", file=sys.stderr)
        print("Die Datei wurde entfernt.", file=sys.stderr)
        return 1

    print(f"Backup:  {target}")
    print(f"Groesse: {target.stat().st_size} Byte")
    print(f"SHA-256: {sha256_of(target)}")
    print("Hinweis: backups/ ist git-ignoriert. Nie committen; Kopie auf sicheren Datentraeger legen.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
