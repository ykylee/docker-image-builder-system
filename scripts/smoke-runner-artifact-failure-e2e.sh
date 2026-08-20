#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT_DIR/compose.dev.yaml" -f "$ROOT_DIR/compose.dev.artifact-factory.yaml")

cleanup() {
  ADMIN_IDS=admin AUTH_SECRET=local-secret AUTH_MODE=disabled BUILD_REPOSITORY_BACKEND=memory DOCKER_SOCKET_GID=0 \
    RUNNER_AUTH_TOKEN=wrong-token "${COMPOSE[@]}" down --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT
ADMIN_IDS=admin AUTH_SECRET=local-secret AUTH_MODE=disabled BUILD_REPOSITORY_BACKEND=memory DOCKER_SOCKET_GID=0 \
  RUNNER_AUTH_TOKEN=wrong-token "${COMPOSE[@]}" down --remove-orphans >/dev/null 2>&1 || true
ADMIN_IDS=admin AUTH_SECRET=local-secret AUTH_MODE=disabled BUILD_REPOSITORY_BACKEND=memory DOCKER_SOCKET_GID=0 \
  RUNNER_AUTH_TOKEN=wrong-token "${COMPOSE[@]}" up -d --build artifact-factory build-server runner >/dev/null

for attempt in $(seq 1 40); do
  curl -fsS http://127.0.0.1:3000/health >/dev/null && break
  [ "$attempt" -eq 40 ] && exit 1
  sleep 1
done

srcdir="$(mktemp -d /tmp/dib-runner-failure.XXXXXX)"
archive="${srcdir}.tar.gz"
printf 'FROM scratch\n' >"$srcdir/Dockerfile"
tar -czf "$archive" -C "$srcdir" Dockerfile
checksum="$(shasum -a 256 "$archive" | awk '{print $1}')"
size="$(wc -c <"$archive" | tr -d ' ')"
payload="$(printf '{"appName":"runner-artifact-auth-failure","requestedBy":"yklee","sourceArchive":{"objectKey":"src/failure.tar.gz","checksumSha256":"%s","sizeBytes":%s},"entrypointPath":"Dockerfile","artifactProfile":{"version":1,"ecosystem":"npm","mode":"required","factoryUrl":"http://artifact-factory:8090","prefetchEnabled":true,"maxBuildRetries":1}}' "$checksum" "$size")"
response="$(curl -fsS -X POST http://127.0.0.1:3000/builds -H 'Content-Type: application/json' -d "$payload")"
build_id="$(printf '%s' "$response" | sed -n 's/.*"buildId":"\([^"]*\)".*/\1/p')"
curl -fsS -X POST "http://127.0.0.1:3000/builds/$build_id/source" \
  -H 'Content-Type: application/octet-stream' --data-binary @"$archive" >/dev/null

for attempt in $(seq 1 45); do
  result="$(curl -fsS "http://127.0.0.1:3000/builds/$build_id")"
  if printf '%s' "$result" | grep -q '"status":"FAILED"'; then break; fi
  [ "$attempt" -eq 45 ] && { echo "build did not fail as expected: $result" >&2; exit 1; }
  sleep 1
done
printf '%s' "$result" | grep -q 'FACTORY_AUTH_FAILED'
printf '%s' "$result" | grep -q '"code":"UNKNOWN_ERROR"'
if docker logs dibs-runner 2>&1 | grep -q 'wrong-token'; then
  echo "artifact credential leaked in runner logs" >&2
  exit 1
fi
echo "runner artifact auth failure e2e: ok"
