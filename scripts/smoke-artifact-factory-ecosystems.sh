#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/compose.artifact-factory-fixture.yaml"
BASE_URL="${ARTIFACT_FACTORY_FIXTURE_URL:-http://127.0.0.1:8090}"
TOKEN="${ARTIFACT_FACTORY_TOKEN:-fixture-token}"
DIGEST="sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

cleanup() {
  docker compose -f "$COMPOSE_FILE" down --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose -f "$COMPOSE_FILE" up -d --build >/dev/null
for attempt in $(seq 1 30); do
  if curl -fsS "$BASE_URL/health" >/dev/null; then break; fi
  [ "$attempt" -eq 30 ] && exit 1
  sleep 1
done

for ecosystem in python npm go rust; do
  coordinate="$ecosystem/example"
  curl -fsS -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -X POST "$BASE_URL/v1/prefetch" \
    -d "{\"ecosystem\":\"$ecosystem\",\"coordinate\":\"$coordinate\",\"lockfileDigest\":\"$DIGEST\",\"recipeDigest\":\"$DIGEST\"}" \
    | grep -q "\"ecosystem\":\"$ecosystem\""
  curl -fsS -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/v1/artifacts/$ecosystem/$coordinate" \
    | grep -q "\"coordinate\":\"$coordinate\""
  echo "artifact fixture ecosystem=$ecosystem: ok"
done
