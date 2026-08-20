#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/compose.artifact-factory-fixture.yaml"
NETWORK="${ARTIFACT_FACTORY_DOCKER_NETWORK:-docker-image-builder-system_default}"
FACTORY_HOST="${ARTIFACT_FACTORY_DOCKER_HOST:-artifact-factory-fixture}"
FACTORY="http://${FACTORY_HOST}:8090"

cleanup() { docker compose -f "$COMPOSE_FILE" down --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker compose -f "$COMPOSE_FILE" up -d --build >/dev/null
for attempt in $(seq 1 30); do
  curl -fsS "${ARTIFACT_FACTORY_FIXTURE_URL:-http://127.0.0.1:8090}/health" >/dev/null && break
  [ "$attempt" -eq 30 ] && exit 1
  sleep 1
done

docker run --rm --network "$NETWORK" python:3.12-slim sh -euxc \
  "pip install --trusted-host $FACTORY_HOST --no-cache-dir --index-url $FACTORY/v1/packages/python/simple/ fixture-package==1.0.0"
echo "native install ecosystem=python: ok"

docker run --rm --network "$NETWORK" node:22-slim sh -euxc \
  "npm install --ignore-scripts --prefix /tmp/fixture-install --registry $FACTORY/v1/packages/npm/ fixture-package@1.0.0"
echo "native install ecosystem=npm: ok"

docker run --rm --network "$NETWORK" golang:1.23-alpine sh -euxc \
  "mkdir /tmp/fixture-go && cd /tmp/fixture-go && go mod init smoke.local && GOPROXY=$FACTORY/v1/packages/go GOSUMDB=off go mod download example.com/fixture@v1.0.0"
echo "native install ecosystem=go: ok"

docker run --rm --network "$NETWORK" rust:1.82-slim sh -euxc \
  "mkdir -p /tmp/fixture-rust/src /tmp/fixture-rust/.cargo && cd /tmp/fixture-rust && printf '[package]\\nname=\"smoke\"\\nversion=\"0.0.0\"\\nedition=\"2021\"\\n\\n[dependencies]\\nfixture-package=\"1.0.0\"\\n' > Cargo.toml && printf 'fn main() {}\\n' > src/main.rs && printf '[source.crates-io]\\nreplace-with=\"fixture\"\\n[source.fixture]\\nregistry=\"sparse+%s/v1/packages/rust/index/\"\\n' \"$FACTORY\" > .cargo/config.toml && cargo fetch"
echo "native install ecosystem=rust: ok"

echo "package manager native install smoke: ok"
