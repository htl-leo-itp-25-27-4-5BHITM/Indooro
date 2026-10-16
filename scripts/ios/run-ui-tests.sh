#!/bin/sh
# Fuehrt alle iOS-Tests aus (MCindooroAppTests und MCindooroAppUITests) gegen den Simulator.
# Vorher startet das Skript den Mobile-API-Mock mit dem Datensatz ui-test-store auf 127.0.0.1:18090;
# die UI-Tests brauchen ihn (siehe swift/indooro-EinkaeuferFinal/MCindooroAppUITests/UITestSupport.swift).
#
#   sh scripts/ios/run-ui-tests.sh
#   UI_TEST_DEVICE_UDID=<UDID> sh scripts/ios/run-ui-tests.sh   # bestimmter Simulator
#   DERIVED_DATA_PATH=<Pfad> sh scripts/ios/run-ui-tests.sh      # eigener Derived-Data-Ordner
#
# Simulator: laufender iPhone-Simulator, sonst der erste verfuegbare iPhone-Simulator.
# Exitcode ist der von `xcodebuild test`; der Mock wird am Ende beendet.
set -eu

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PROJECT="$ROOT/swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj"
SCHEME="MCindooroApp"
DERIVED="${DERIVED_DATA_PATH:-$ROOT/swift/indooro-EinkaeuferFinal/.build/ui-derived}"
MOCK_PORT=18090
MOCK_URL="http://127.0.0.1:$MOCK_PORT/api/mobile/stores"
PYTHON="${PYTHON:-python3}"

pick_device_udid() {
  if [ -n "${UI_TEST_DEVICE_UDID:-}" ]; then
    echo "$UI_TEST_DEVICE_UDID"
    return
  fi
  devices=$(xcrun simctl list devices available | grep -E '^[[:space:]]+iPhone' || true)
  udid=$(echo "$devices" | grep -E '\(Booted\)' | head -n 1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/' || true)
  if [ -z "$udid" ]; then
    udid=$(echo "$devices" | head -n 1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/' || true)
  fi
  if [ -z "$udid" ]; then
    echo "Kein iPhone-Simulator verfuegbar (xcrun simctl list devices available)." >&2
    exit 1
  fi
  echo "$udid"
}

if curl -fsS -o /dev/null "$MOCK_URL" 2>/dev/null; then
  echo "Port $MOCK_PORT antwortet bereits; laufenden Mock nicht uebernehmen, bitte erst beenden." >&2
  exit 1
fi

MOCK_LOG=$(mktemp -t indooro-ui-mock)
MOCK_PID=""
cleanup() {
  if [ -n "$MOCK_PID" ]; then
    kill "$MOCK_PID" 2>/dev/null || true
    wait "$MOCK_PID" 2>/dev/null || true
  fi
  rm -f "$MOCK_LOG"
}
trap cleanup EXIT

MOCK_DATASET=ui-test-store "$PYTHON" "$ROOT/scripts/dev/mock_mobile_api.py" "$MOCK_PORT" >"$MOCK_LOG" 2>&1 &
MOCK_PID=$!

attempts=0
until curl -fsS -o /dev/null "$MOCK_URL" 2>/dev/null; do
  if ! kill -0 "$MOCK_PID" 2>/dev/null; then
    echo "Mock ist beendet, bevor er antwortet. Log:" >&2
    cat "$MOCK_LOG" >&2
    exit 1
  fi
  attempts=$((attempts + 1))
  if [ "$attempts" -ge 50 ]; then
    echo "Mock antwortet nach $attempts Versuchen nicht. Log:" >&2
    cat "$MOCK_LOG" >&2
    exit 1
  fi
  sleep 0.2
done
echo "Mock laeuft auf 127.0.0.1:$MOCK_PORT (Datensatz ui-test-store)."

UDID=$(pick_device_udid)
echo "Simulator: $UDID"

set +e
xcodebuild test \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -destination "platform=iOS Simulator,id=$UDID" \
  -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO
status=$?
set -e

exit "$status"
