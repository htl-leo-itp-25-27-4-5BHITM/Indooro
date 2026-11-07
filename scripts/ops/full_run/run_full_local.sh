#!/usr/bin/env bash
# Lokaler End-to-End-Durchlauf der Markt-Einrichtung. Aufruf:
#   scripts/ops/full_run/run_full_local.sh [dataset-dir] [out-dir]
# Default: docs/pilot-readiness/kit/demo. Kein Kontakt zum Live-System, keine Anmeldung.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DATASET="${1:-$ROOT/docs/pilot-readiness/kit/demo}"
DATASET="$(cd "$DATASET" && pwd)"
NAME="$(basename "$DATASET")"
OUT="${2:-$ROOT/target-full-run/$NAME}"
mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"

PG_PORT="${FULLRUN_PG_PORT:-55432}"
OS_PORT="${FULLRUN_OS_PORT:-59200}"
SUFFIX="$$"
PG_NAME="indooro-fullrun-pg-$SUFFIX"
OS_NAME="indooro-fullrun-os-$SUFFIX"
# Wegwerf-Passwort: nur in dieser Prozessumgebung, wird nie ausgegeben.
FULLRUN_DB_PASSWORD="$(openssl rand -hex 16)"
export FULLRUN_DB_PASSWORD

cleanup() { docker rm -f "$PG_NAME" "$OS_NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "== Container starten (postgres:16 auf 127.0.0.1:$PG_PORT, opensearch 2.9.0 auf 127.0.0.1:$OS_PORT)"
docker run -d --name "$PG_NAME" -p "127.0.0.1:$PG_PORT:5432" \
  -e POSTGRES_USER=indooro -e POSTGRES_DB=indooro -e POSTGRES_PASSWORD="$FULLRUN_DB_PASSWORD" postgres:16 >/dev/null
docker run -d --name "$OS_NAME" -p "127.0.0.1:$OS_PORT:9200" -e discovery.type=single-node \
  -e plugins.security.disabled=true -e DISABLE_INSTALL_DEMO_CONFIG=true \
  -e OPENSEARCH_JAVA_OPTS="-Xms512m -Xmx512m" opensearchproject/opensearch:2.9.0 >/dev/null

echo "== prepare.mjs ($NAME)"
if [ ! -d "$ROOT/admin-ui/node_modules" ]; then (cd "$ROOT/admin-ui" && npm ci --no-audit --no-fund); fi
(cd "$ROOT/admin-ui" && node --import tsx ../scripts/ops/full_run/prepare.mjs --dataset "$DATASET" --out "$OUT")

echo "== Auf Container warten"
for i in $(seq 1 90); do
  if docker exec "$PG_NAME" pg_isready -U indooro -d indooro >/dev/null 2>&1 \
     && curl -fsS "http://127.0.0.1:$OS_PORT/_cluster/health" >/dev/null 2>&1; then READY=1; break; fi
  sleep 2
done
[ "${READY:-0}" = 1 ] || { echo "Container wurden nicht rechtzeitig bereit"; exit 1; }
sleep 3  # Postgres initialisiert nach dem ersten pg_isready noch kurz neu

echo "== Quarkus-IT StoreOnboardingFullRunIT"
cd "$ROOT/backend/indooro_server"
sh ./mvnw -B test -Dtest=StoreOnboardingFullRunIT -Dsurefire.failIfNoSpecifiedTests=false \
  -Dfullrun.payload="$OUT/payload.json" -Dfullrun.out="$OUT" \
  -Dfullrun.db.url="jdbc:postgresql://127.0.0.1:$PG_PORT/indooro" -Dfullrun.db.user=indooro \
  -Dfullrun.os.port="$OS_PORT" 2>&1 | tee "$OUT/maven.log" | grep -E "STEP |Tests run|BUILD|ERROR|FAIL" || true
if grep -q "BUILD SUCCESS" "$OUT/maven.log" && ! grep -q "Tests are skipped\|Skipped: [1-9]" "$OUT/maven.log"; then
  echo "== FULL RUN GRUEN. Bericht: $OUT/report.md"
else
  echo "== FULL RUN ROT oder uebersprungen. Log: $OUT/maven.log"; exit 1
fi
