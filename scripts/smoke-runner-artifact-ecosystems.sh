#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT_DIR/compose.dev.yaml" -f "$ROOT_DIR/compose.dev.artifact-factory.yaml")

cleanup() {
  ADMIN_IDS=admin AUTH_SECRET=local-secret BUILD_REPOSITORY_BACKEND=memory DOCKER_SOCKET_GID=0 \
    "${COMPOSE[@]}" down --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

ADMIN_IDS=admin AUTH_SECRET=local-secret BUILD_REPOSITORY_BACKEND=memory DOCKER_SOCKET_GID=0 \
  "${COMPOSE[@]}" down --remove-orphans >/dev/null 2>&1 || true
ADMIN_IDS=admin AUTH_SECRET=local-secret BUILD_REPOSITORY_BACKEND=memory DOCKER_SOCKET_GID=0 \
  "${COMPOSE[@]}" up -d --build artifact-factory build-server runner >/dev/null

for attempt in $(seq 1 40); do
  if curl -fsS http://127.0.0.1:3000/health >/dev/null; then break; fi
  [ "$attempt" -eq 40 ] && exit 1
  sleep 1
done

for ecosystem in python npm go rust; do
  srcdir=$(mktemp -d "/tmp/dib-runner-$ecosystem.XXXXXX")
  printf 'FROM scratch\n' >"$srcdir/Dockerfile"
  archive="/tmp/dib-runner-$ecosystem.tar.gz"
  tar -czf "$archive" -C "$srcdir" Dockerfile
  checksum=$(shasum -a 256 "$archive" | awk '{print $1}')
  size=$(wc -c <"$archive" | tr -d ' ')
  payload=$(printf '{"appName":"runner-%s-e2e","requestedBy":"yklee","sourceArchive":{"objectKey":"src/runner-%s.tar.gz","checksumSha256":"%s","sizeBytes":%s},"entrypointPath":"Dockerfile","artifactProfile":{"version":1,"ecosystem":"%s","mode":"fallback","factoryUrl":"http://artifact-factory:8090","prefetchEnabled":true,"maxBuildRetries":1}}' "$ecosystem" "$ecosystem" "$checksum" "$size" "$ecosystem")
  response=$(curl -fsS -X POST http://127.0.0.1:3000/builds -H 'Content-Type: application/json' -d "$payload")
  build_id=$(printf '%s' "$response" | sed -n 's/.*"buildId":"\([^"]*\)".*/\1/p')
  curl -fsS -X POST "http://127.0.0.1:3000/builds/$build_id/source" \
    -H 'Content-Type: application/octet-stream' --data-binary @"$archive" >/dev/null
  for attempt in $(seq 1 30); do
    if docker logs dibs-runner 2>&1 | grep -q "artifactID=fixture:$ecosystem:npm/example"; then break; fi
    [ "$attempt" -eq 30 ] && exit 1
    sleep 1
  done
  echo "runner artifact preflight ecosystem=$ecosystem: ok"
done
