#!/bin/sh
# Beacon-Eintraege des Testraums pruefen (nur lesend). Siehe check_testroom_beacons.py.
#   scripts/field/check_testroom_beacons.sh [--values DATEI] [--readiness-json DATEI] [--base-url URL] [--store ID]
# Optional: INDOORO_ADMIN_TOKEN als Umgebungsvariable fuer die Bereitschaft.
# Exit: 0 keine Blocker, 1 Blocker, 2 Aufruf- oder Netzfehler.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
exec python3 -I "$here/check_testroom_beacons.py" "$@"
