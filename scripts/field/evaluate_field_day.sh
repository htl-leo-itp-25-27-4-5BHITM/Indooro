#!/bin/sh
# Feldtag in einem Befehl auswerten: alle Aufnahmen eines Ordners -> Entscheidung nach POSITIONING_DECISION.md. Siehe evaluate_field_day.py.
#   scripts/field/evaluate_field_day.sh ORDNER-MIT-AUFNAHMEN [--out DIR] [--no-lab-import] [--store CODE | --layout LAYOUT.json]
set -eu
here=$(cd "$(dirname "$0")" && pwd)
exec python3 -I "$here/evaluate_field_day.py" "$@"
