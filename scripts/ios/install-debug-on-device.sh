#!/bin/sh
# Baut den DEBUG-Build von MCindooroApp fuer ein echtes iPhone und installiert ihn.
#
#   scripts/ios/install-debug-on-device.sh            # erstes verfuegbares iPhone
#   scripts/ios/install-debug-on-device.sh <GERAET>   # Name oder Identifier aus `xcrun devicectl list devices`
#   NO_LAUNCH=1 scripts/ios/install-debug-on-device.sh # nur installieren, nicht starten
#
# Voraussetzung (nur ein Mensch kann das): iPhone per Kabel anstecken, entsperren,
# "Diesem Computer vertrauen" bestaetigen, Entwicklermodus aktivieren
# (Einstellungen > Datenschutz & Sicherheit > Entwicklermodus). Das Geraet muss in
# `xcrun devicectl list devices` den Status "available (paired)" oder "connected" haben.
# Signing nutzt DEVELOPMENT_TEAM aus dem Xcode-Projekt (Automatic Signing).
set -eu

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PROJECT="$ROOT/swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj"
SCHEME="MCindooroApp"
BUNDLE_ID="at.ac.htl.leonding.indooroswift2"
DERIVED="${DERIVED_DATA_PATH:-$ROOT/swift/indooro-EinkaeuferFinal/.build/device-derived}"
WANTED="${1:-}"

TMP_JSON=$(mktemp -t indooro-devices.XXXXXX)
trap 'rm -f "$TMP_JSON"' EXIT
xcrun devicectl list devices --json-output "$TMP_JSON" >/dev/null 2>&1 || {
  echo "devicectl list devices ist fehlgeschlagen (Xcode 15+ noetig)." >&2
  exit 1
}

# Waehlt das passende iPhone/iPad: erst "connected"/"available", sonst Abbruch mit Liste.
DEVICE_ID=$(python3 - "$TMP_JSON" "$WANTED" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
wanted = sys.argv[2].lower()
devices = data.get("result", {}).get("devices", [])
def state(d):
    cp = d.get("connectionProperties", {})
    return cp.get("tunnelState", "") or d.get("deviceProperties", {}).get("state", "")
def usable(d):
    hw = d.get("hardwareProperties", {})
    if hw.get("platform", "") not in ("iOS", "iPadOS"):
        return False
    # devicectl zeigt "available (paired)" als tunnelState "disconnected" + pairingState "paired";
    # nicht erreichbare Geraete haben tunnelState "unavailable".
    paired = d.get("connectionProperties", {}).get("pairingState", "") == "paired"
    return paired and state(d) in ("connected", "disconnected", "available")
rows = [d for d in devices if usable(d)]
if wanted:
    rows = [d for d in rows
            if wanted in d.get("deviceProperties", {}).get("name", "").lower()
            or wanted == d.get("identifier", "").lower()
            or wanted == d.get("hardwareProperties", {}).get("udid", "").lower()]
if not rows:
    sys.exit(3)
print(rows[0]["identifier"])
PY
) || {
  echo "Kein verfuegbares iPhone gefunden. iPhone anstecken, entsperren, vertrauen; dann nochmal." >&2
  xcrun devicectl list devices >&2 || true
  exit 2
}

echo "Geraet: $DEVICE_ID"
echo "Baue Debug-Build ..."
xcodebuild build \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Debug \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$DERIVED" \
  -skipPackagePluginValidation \
  -allowProvisioningUpdates

APP="$DERIVED/Build/Products/Debug-iphoneos/$SCHEME.app"
[ -d "$APP" ] || { echo "App nicht gefunden: $APP" >&2; exit 1; }

echo "Installiere $APP ..."
xcrun devicectl device install app --device "$DEVICE_ID" "$APP"

if [ -z "${NO_LAUNCH:-}" ]; then
  echo "Starte $BUNDLE_ID ..."
  xcrun devicectl device process launch --device "$DEVICE_ID" "$BUNDLE_ID" || \
    echo "Start fehlgeschlagen (Geraet gesperrt?). App manuell oeffnen." >&2
fi
echo "Fertig."
