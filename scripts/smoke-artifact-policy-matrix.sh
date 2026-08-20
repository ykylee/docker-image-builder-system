#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/compose.artifact-factory-fixture.yaml"
BASE_URL="${ARTIFACT_FACTORY_FIXTURE_URL:-http://127.0.0.1:8090}"
TOKEN="${ARTIFACT_FACTORY_TOKEN:-fixture-token}"
DIGEST="sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

cleanup() { docker compose -f "$COMPOSE_FILE" down --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker compose -f "$COMPOSE_FILE" up -d --build >/dev/null
for attempt in $(seq 1 30); do
  curl -fsS "$BASE_URL/health" >/dev/null && break
  [ "$attempt" -eq 30 ] && exit 1
  sleep 1
done

headers="$(mktemp)"
body="$(mktemp)"
trap 'rm -f "$headers" "$body"; cleanup' EXIT

# Cache hit: prefetch materializes the manifest, then lookup/content avoid a miss.
curl -fsS -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -X POST "$BASE_URL/v1/prefetch" \
  -d '{"ecosystem":"npm","coordinate":"npm/example","lockfileDigest":"'$DIGEST'","recipeDigest":"'$DIGEST'"}' >/dev/null
curl -fsS -H "Authorization: Bearer $TOKEN" "$BASE_URL/v1/artifacts/npm/npm/example" | grep -q '"coordinate":"npm/example"'
echo "artifact policy cache hit: ok"

# Cache miss: an unknown coordinate never falls through to an arbitrary host.
if curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/v1/artifacts/npm/npm/missing" | grep -q '^404$'; then
  echo "artifact policy cache miss: ok"
else
  echo "artifact policy cache miss: failed" >&2
  exit 1
fi

# Upstream deny applies to package-manager paths as well as the registry mirror.
if curl -sS -o /dev/null -w '%{http_code}' -H 'X-Upstream-Host: denied.example.test' \
  "$BASE_URL/v1/packages/npm/fixture-package" | grep -q '^403$'; then
  echo "artifact policy upstream deny: ok"
else
  echo "artifact policy upstream deny: failed" >&2
  exit 1
fi

# Corruption keeps the advertised digest but changes bytes; the verifier must reject it.
curl -fsS -D "$headers" -o "$body" "$BASE_URL/v1/packages/npm/fixture-package/-/fixture-package-1.0.0.tgz?corrupt=1"
advertised="$(awk -F': ' 'tolower($1)=="x-artifact-digest" {gsub("\r", "", $2); print $2}' "$headers")"
actual="sha256:$(sha256sum "$body" | awk '{print $1}')"
if [ "$advertised" != "$actual" ]; then
  echo "artifact policy integrity mismatch: ok"
else
  echo "artifact policy integrity mismatch: failed" >&2
  exit 1
fi

echo "artifact policy matrix smoke: ok"
