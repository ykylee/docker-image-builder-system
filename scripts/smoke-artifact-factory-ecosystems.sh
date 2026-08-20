#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/compose.artifact-factory-fixture.yaml"
BASE_URL="${ARTIFACT_FACTORY_FIXTURE_URL:-http://127.0.0.1:8090}"
TOKEN="${ARTIFACT_FACTORY_TOKEN:-fixture-token}"
DIGEST="sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
TMP_DIR="$(mktemp -d)"

cleanup() {
  docker compose -f "$COMPOSE_FILE" down --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
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
  manifest="$(curl -fsS -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/v1/artifacts/$ecosystem/$coordinate" \
    )"
  printf '%s' "$manifest" | grep -q "\"coordinate\":\"$coordinate\""
  expected_digest="$(printf '%s' "$manifest" | python3 -c 'import json,sys; print(json.load(sys.stdin)["contentDigest"])')"
  curl -fsS -D "$TMP_DIR/headers" -o "$TMP_DIR/content" \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/v1/artifacts/$ecosystem/$coordinate/content"
  actual_digest="sha256:$(sha256sum "$TMP_DIR/content" | awk '{print $1}')"
  header_digest="$(awk -F': ' 'tolower($1)=="x-artifact-digest" {gsub("\r", "", $2); print $2}' "$TMP_DIR/headers")"
  [ "$actual_digest" = "$expected_digest" ]
  [ "$header_digest" = "$expected_digest" ]
  echo "artifact fixture ecosystem=$ecosystem: ok"
done
