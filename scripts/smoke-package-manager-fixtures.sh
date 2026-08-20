#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/compose.artifact-factory-fixture.yaml"
BASE_URL="${ARTIFACT_FACTORY_FIXTURE_URL:-http://127.0.0.1:8090}"
TOKEN="${ARTIFACT_FACTORY_TOKEN:-fixture-token}"

cleanup() { docker compose -f "$COMPOSE_FILE" down --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker compose -f "$COMPOSE_FILE" up -d --build >/dev/null
for attempt in $(seq 1 30); do
  curl -fsS "$BASE_URL/health" >/dev/null && break
  [ "$attempt" -eq 30 ] && exit 1
  sleep 1
done

auth=(-H "Authorization: Bearer $TOKEN")
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"; cleanup' EXIT

curl -fsS "${auth[@]}" "$BASE_URL/v1/packages/python/simple/fixture-package/" | grep -q 'fixture-package-1.0.0.tar.gz'
curl -fsS "${auth[@]}" "$BASE_URL/v1/packages/npm/fixture-package" | grep -q '"latest":"1.0.0"'
curl -fsS "${auth[@]}" "$BASE_URL/v1/packages/go/example.com/fixture/@v/list" | grep -qx 'v1.0.0'
curl -fsS "${auth[@]}" "$BASE_URL/v1/packages/rust/index/fi/xt/fixture-package" | grep -q '"vers":"1.0.0"'

for ecosystem in python npm go rust; do
  case "$ecosystem" in
    python) url="$BASE_URL/v1/packages/python/files/fixture-package-1.0.0.tar.gz" ;;
    npm) url="$BASE_URL/v1/packages/npm/fixture-package/-/fixture-package-1.0.0.tgz" ;;
    go) url="$BASE_URL/v1/packages/go/example.com/fixture/@v/v1.0.0.zip" ;;
    rust) url="$BASE_URL/v1/packages/rust/api/v1/crates/fixture-package/1.0.0/download" ;;
  esac
  curl -fsS "${auth[@]}" -o "$tmp/$ecosystem" "$url"
  digest="sha256:$(sha256sum "$tmp/$ecosystem" | awk '{print $1}')"
  test "${#digest}" -eq 71
  echo "package manager fixture ecosystem=$ecosystem: ok"
done

echo "package manager fixture smoke: ok"
