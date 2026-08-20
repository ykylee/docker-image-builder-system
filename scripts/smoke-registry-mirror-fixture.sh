#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/compose.artifact-factory-fixture.yaml"
BASE_URL="${ARTIFACT_FACTORY_FIXTURE_URL:-http://127.0.0.1:8090}"
TOKEN="${ARTIFACT_FACTORY_TOKEN:-fixture-token}"
DIGEST="sha256:abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd"

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

headers="$(mktemp)"
body="$(mktemp)"
trap 'rm -f "$headers" "$body"; cleanup' EXIT

curl -fsS -D "$headers" -o "$body" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Upstream-Host: registry.example.test' \
  "$BASE_URL/v2/fixture/base/manifests/$DIGEST"
grep -q '"schemaVersion":2' "$body"
grep -qi "Docker-Content-Digest: $DIGEST" "$headers"

curl -fsS -D "$headers" -o "$body" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Upstream-Host: registry.example.test' \
  "$BASE_URL/v2/fixture/base/blobs/$DIGEST"
grep -qi "Docker-Content-Digest: $DIGEST" "$headers"

if curl -sS -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Upstream-Host: denied.example.test' \
  "$BASE_URL/v2/fixture/base/manifests/$DIGEST" | grep -q '^403$'; then
  echo "registry mirror upstream deny: ok"
else
  echo "registry mirror upstream deny: failed" >&2
  exit 1
fi

if curl -sS -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/v2/fixture/base/manifests/sha256:bad" | grep -q '^404$'; then
  echo "registry mirror digest mismatch: ok"
else
  echo "registry mirror digest mismatch: failed" >&2
  exit 1
fi

echo "registry mirror fixture smoke: ok"
