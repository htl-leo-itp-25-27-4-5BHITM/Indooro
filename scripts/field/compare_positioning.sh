#!/bin/sh
# Eine Aufnahme durch die aktuelle App-Pipeline und die PositioningEngine spielen und vergleichen. Siehe compare_positioning.py.
#   scripts/field/compare_positioning.sh [AUFNAHME.jsonl] --store SPAR-Leonding-002
#   scripts/field/compare_positioning.sh [AUFNAHME.jsonl] --layout LAYOUT.json
# Ohne AUFNAHME: neueste *.jsonl in swift/indooro-EinkaeuferFinal/NavigationFixtures/incoming/.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
exec python3 -I "$here/compare_positioning.py" "$@"
