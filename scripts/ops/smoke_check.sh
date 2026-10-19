#!/usr/bin/env bash
# Release-Smoke-Check fuer das Pilot-Backend. Nur lesende GET-Requests, keine Anmeldedaten.
#
# Aufruf:  scripts/ops/smoke_check.sh <base-url> [storeCode] [suchbegriff]
# Beispiel: scripts/ops/smoke_check.sh https://it220209.cloud.htl-leonding.ac.at
#
# Pflichtpruefungen (FAIL -> Exit 1): oeffentliche Endpunkte liefern 200, geschuetzte Endpunkte
# liefern ohne Anmeldung 401/403/302 und nie 200 oder 5xx. Mit storeCode muessen Produktliste und
# Suche des Markts mindestens 1 Treffer liefern (ein leerer Markt ist ein FAIL, auch bei 200).
# Ohne storeCode wird jeder Markt aus /api/mobile/stores geprueft; FAIL nur, wenn keiner Produkte hat.
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

# count_of <path>: Anzahl der Eintraege einer JSON-Liste (oder eines Objekts mit content/items/products).
# Gibt -1 aus, wenn die Antwort kein JSON mit Liste ist.
count_of() {
  body_of "$1" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    if isinstance(data, dict):
        data = next((data[k] for k in ("content", "items", "products") if isinstance(data.get(k), list)), None)
    print(len(data) if isinstance(data, list) else -1)
except Exception:
    print(-1)
' 2>/dev/null || echo -1
}

# check_items <label> <path>: Status 200 und mindestens 1 Eintrag (Pflicht).
check_items() {
  local label="$1" path="$2" code count
  code="$(status_of "$path")"
  [[ -z "$code" ]] && code="000"
  if [[ "$code" != "200" ]]; then
    echo "FAIL  $code  $label  ($path)  erwartet: 200"
    FAILS=$((FAILS + 1))
    return
  fi
  count="$(count_of "$path")"
  [[ -z "$count" ]] && count="-1"
  if [[ "$count" -ge 1 ]]; then
    echo "OK    $code  $label  ($path)  ${count} Eintraege"
    PASSES=$((PASSES + 1))
  elif [[ "$count" -eq 0 ]]; then
    echo "FAIL  $code  $label  ($path)  0 Eintraege, erwartet: mindestens 1 (Index leer oder falsch gemappt?)"
    FAILS=$((FAILS + 1))
  else
    echo "FAIL  $code  $label  ($path)  Antwort ist keine JSON-Liste"
    FAILS=$((FAILS + 1))
  fi
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
# quarkus.oidc.application-type=hybrid: a request without an access token gets the code flow,
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

# Ohne storeCode: alle Maerkte aus /api/mobile/stores pruefen. Pflicht ist, dass mindestens ein Markt
# Produkte hat (ein leerer erster Markt allein ist kein Fehler). Mit storeCode gilt die strenge Regel.
if [[ -n "$STORE_CODE" ]]; then
  echo
  echo "## Store-bezogen (storeCode=${STORE_CODE})"
  check_items "Produkte je Markt" "/api/products?size=5&storeCode=${STORE_CODE}"
  check_items "Suche je Markt"    "/api/products/search?q=${QUERY}&storeCode=${STORE_CODE}"
else
  STORE_CODES="$(body_of '/api/mobile/stores' | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    items = data if isinstance(data, list) else data.get("stores", [])
    for item in items:
        code = (item.get("storeCode") or "").strip()
        if code and all(c.isalnum() or c in "-_." for c in code):
            print(code)
except Exception:
    pass
' 2>/dev/null || true)"
  if [[ -z "$STORE_CODES" ]]; then
    echo
    echo "INFO  storeCode nicht ermittelbar, store-bezogene Pruefungen uebersprungen"
  else
    echo
    echo "## Store-bezogen (alle Maerkte, mindestens einer mit Produkten)"
    FULL_STORE=""
    while IFS= read -r code; do
      [[ -z "$code" ]] && continue
      n="$(count_of "/api/products?size=5&storeCode=${code}")"
      [[ -z "$n" ]] && n="-1"
      if [[ "$n" -ge 1 ]]; then
        echo "INFO  Produkte je Markt  storeCode=${code}: ${n} Eintraege"
        [[ -z "$FULL_STORE" ]] && FULL_STORE="$code"
      elif [[ "$n" -eq 0 ]]; then
        echo "INFO  Produkte je Markt  storeCode=${code}: 0 Eintraege"
      else
        echo "INFO  Produkte je Markt  storeCode=${code}: keine JSON-Liste"
      fi
    done <<< "$STORE_CODES"
    if [[ -n "$FULL_STORE" ]]; then
      echo "OK    200  Produkte je Markt  (storeCode=${FULL_STORE} hat Produkte)"
      PASSES=$((PASSES + 1))
      # Suche im Markt mit Produkten: Status 200 ist Pflicht, die Trefferzahl hier nur Information.
      check "Suche je Markt" "/api/products/search?q=${QUERY}&storeCode=${FULL_STORE}" "200"
      echo "INFO  Suche storeCode=${FULL_STORE}: $(count_of "/api/products/search?q=${QUERY}&storeCode=${FULL_STORE}") Eintraege fuer \"${QUERY}\""
    else
      echo "FAIL  ---  Produkte je Markt  kein Markt hat Produkte (Index leer oder falsch gemappt?)"
      FAILS=$((FAILS + 1))
    fi
  fi
fi

echo
echo "Ergebnis: ${PASSES} OK, ${FAILS} FAIL"
if [[ "$FAILS" -gt 0 ]]; then
  exit 1
fi
exit 0
