#!/usr/bin/env bash
# Release-Smoke-Check fuer das Pilot-Backend. Nur lesende GET-Requests, keine Anmeldedaten.
#
# Aufruf:  scripts/ops/smoke_check.sh <base-url> [storeCode] [suchbegriff]
# Beispiel: scripts/ops/smoke_check.sh https://it220209.cloud.htl-leonding.ac.at
#
# Pflichtpruefungen (FAIL -> Exit 1): oeffentliche Endpunkte liefern 200, geschuetzte Endpunkte
# liefern ohne Anmeldung 401/403/302 und nie 200 oder 5xx.
# Hinweise (INFO): Health-Pfade, die der Ingress evtl. nicht freigibt.
# Nicht geprueft: Seiten nach dem Login. Das macht ein Mensch (siehe RELEASE_PLAN_NEXT.md).
set -u

BASE_URL="${1:-}"
STORE_CODE="${2:-}"
QUERY="${3:-milch}"
TIMEOUT="${SMOKE_TIMEOUT:-15}"

if [[ -z "$BASE_URL" || "$BASE_URL" == "-h" || "$BASE_URL" == "--help" ]]; then
  sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi
if [[ ! "$BASE_URL" =~ ^https?://[^/[:space:]]+$ ]]; then
  echo "base-url muss http(s)://host[:port] ohne Pfad sein: $BASE_URL" >&2
  exit 2
fi

FAILS=0
PASSES=0

# status_of <path>: gibt den HTTP-Status aus ("000" bei Netzwerkfehler). Folgt keinen Redirects.
status_of() {
  curl -sS -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT" -X GET "${BASE_URL}$1" 2>/dev/null || true
}

# body_of <path>: Antwortkoerper (nur fuer 200er).
body_of() {
  curl -sS --max-time "$TIMEOUT" -X GET "${BASE_URL}$1" 2>/dev/null || true
}

# check <label> <path> <erlaubte-codes, getrennt durch |> [required|info]
check() {
  local label="$1" path="$2" allowed="$3" mode="${4:-required}" code
  code="$(status_of "$path")"
  [[ -z "$code" ]] && code="000"
  if [[ "|$allowed|" == *"|$code|"* ]]; then
    echo "OK    $code  $label  ($path)"
    PASSES=$((PASSES + 1))
  elif [[ "$mode" == "info" ]]; then
    echo "INFO  $code  $label  ($path)  erwartet: $allowed"
  else
    echo "FAIL  $code  $label  ($path)  erwartet: $allowed"
    FAILS=$((FAILS + 1))
  fi
}

echo "Smoke-Check gegen $BASE_URL (nur GET, ohne Anmeldung)"
echo

echo "## Oeffentliche Endpunkte"
check "Mobile Stores"           "/api/mobile/stores"               "200"
check "Kategorien"              "/api/categories"                  "200"
check "Produkte (Seite)"        "/api/products?size=5"             "200"
check "Produktsuche"            "/api/products/search?q=${QUERY}"  "200"
check "Customer Finder"         "/customer/"                       "200|301|302"

echo
echo "## Geschuetzt: ohne Login weder 200 noch 5xx"
check "Admin-Shell"             "/admin/"                          "301|302|401|403"
check "Admin Next"              "/admin/next/"                     "301|302|401|403"
check "Admin Bereitschaft"      "/admin/next/stores/readiness/"    "301|302|401|403"
check "Admin QR-Anker"          "/admin/next/stores/anchors/"      "301|302|401|403"
# quarkus.oidc.application-type=hybrid: a request without bearer token gets the code flow,
# so /api/admin/* answers 302 to the Keycloak login (seen live 2026-10-18). Never 200 or 5xx.
check "API admin/me"            "/api/admin/me"                    "302|401|403"
check "API admin/products"      "/api/admin/products"              "302|401|403"
check "API admin/logs"          "/api/admin/logs"                  "302|401|403"
check "API Search-Index"        "/api/admin/index"                 "302|401|403"

echo
echo "## Health (Hinweis, Ingress kann sie sperren)"
check "Quarkus live"            "/q/health/live"                   "200" info
check "Quarkus ready"           "/q/health/ready"                  "200" info

echo
echo "## Keycloak (Prod-Realm)"
check "Realm-Metadaten"         "/keycloak/realms/indooro/.well-known/openid-configuration" "200" info

# Stores aus der Liste lesen, wenn kein storeCode uebergeben wurde.
if [[ -z "$STORE_CODE" ]]; then
  STORE_CODE="$(body_of '/api/mobile/stores' | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    items = data if isinstance(data, list) else data.get("stores", [])
    print((items[0].get("storeCode") or "") if items else "")
except Exception:
    print("")
' 2>/dev/null || true)"
fi

if [[ -n "$STORE_CODE" ]]; then
  echo
  echo "## Store-bezogen (storeCode=${STORE_CODE})"
  check "Produkte je Markt"     "/api/products?size=5&storeCode=${STORE_CODE}"                 "200"
  check "Suche je Markt"        "/api/products/search?q=${QUERY}&storeCode=${STORE_CODE}"      "200"
else
  echo
  echo "INFO  storeCode nicht ermittelbar, store-bezogene Pruefungen uebersprungen"
fi

echo
echo "Ergebnis: ${PASSES} OK, ${FAILS} FAIL"
if [[ "$FAILS" -gt 0 ]]; then
  exit 1
fi
exit 0
