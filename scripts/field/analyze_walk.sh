#!/bin/sh
# Eine Aufnahme vom iPhone in einem Befehl auswerten (Feldtag Testraum). Siehe analyze_walk.py.
#   scripts/field/analyze_walk.sh [AUFNAHME.jsonl] [--site testraum] [--layout LAYOUT.json] [--markers SITE.md]
# Ohne AUFNAHME: neueste *.jsonl in swift/indooro-EinkaeuferFinal/NavigationFixtures/incoming/.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
exec python3 -I "$here/analyze_walk.py" "$@"
