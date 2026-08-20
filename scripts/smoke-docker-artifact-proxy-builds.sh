#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURE_ROOT="$ROOT_DIR/apps/runner/internal/docker/testdata/artifact-proxies"

for ecosystem in python npm go rust; do
  case "$ecosystem" in
    python) proxy_var=PIP_INDEX_URL ;;
    npm) proxy_var=NPM_CONFIG_REGISTRY ;;
    go) proxy_var=GOPROXY ;;
    rust) proxy_var=CARGO_REGISTRIES_CRATES_IO_INDEX ;;
  esac
  image="dib-artifact-proxy-$ecosystem:smoke"
  docker build --pull=false --file "$FIXTURE_ROOT/$ecosystem/Dockerfile" \
    --tag "$image" \
    --build-arg "ARTIFACT_ECOSYSTEM=$ecosystem" \
    --build-arg "ARTIFACT_PACKAGE_PROXY_URL=http://artifact-factory:8090/$ecosystem" \
    --build-arg "$proxy_var=http://artifact-factory:8090/$ecosystem" \
    "$FIXTURE_ROOT/$ecosystem"
  echo "docker artifact proxy build ecosystem=$ecosystem: ok"
done
