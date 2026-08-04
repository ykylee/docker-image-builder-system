#!/usr/bin/env bash
# TASK-174: Dockerfile auto mode full API -> claim -> Runner lifecycle e2e.
#
# Verifies that dockerfileMode=auto survives the public API and claim payload,
# then drives the real Runner through generated Dockerfile build, container
# test, deploy skeleton, and terminal status for static and Node sources. A
# third source intentionally exercises the unsupported-source failure path.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
cd "${REPO_ROOT}"

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

command -v docker >/dev/null 2>&1 || { red "[fatal] docker not found"; exit 1; }
docker info >/dev/null 2>&1 || { red "[fatal] docker daemon unavailable"; exit 1; }
command -v curl >/dev/null 2>&1 || { red "[fatal] curl not found"; exit 1; }
command -v python3 >/dev/null 2>&1 || { red "[fatal] python3 not found"; exit 1; }

if [[ -z "${DOCKER_SOCKET_GID:-}" ]]; then
  DOCKER_SOCKET_GID="$(getent group docker 2>/dev/null | cut -d: -f3 || true)"
fi
if [[ -z "${DOCKER_SOCKET_GID}" && -S /var/run/docker.sock ]]; then
  # macOS does not ship getent; the socket group is the value compose needs.
  DOCKER_SOCKET_GID="$(stat -f '%g' /var/run/docker.sock 2>/dev/null || true)"
fi
if [[ -z "${DOCKER_SOCKET_GID}" ]]; then
  DOCKER_HOST_PATH="$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null | sed 's#^unix://##' || true)"
  if [[ -S "${DOCKER_HOST_PATH}" ]]; then
    DOCKER_SOCKET_GID="$(stat -f '%g' "${DOCKER_HOST_PATH}" 2>/dev/null || true)"
  fi
fi
# On Colima/Docker Desktop the host socket GID can differ from the GID visible
# after the socket is mounted into a Linux container. Measure the latter when
# possible; this is the value group_add must use for the runner.
MOUNTED_SOCKET_GID="$(docker run --rm -v /var/run/docker.sock:/var/run/docker.sock alpine:3.20 \
  stat -c '%g' /var/run/docker.sock 2>/dev/null || true)"
if [[ "${MOUNTED_SOCKET_GID}" =~ ^[0-9]+$ ]]; then
  DOCKER_SOCKET_GID="${MOUNTED_SOCKET_GID}"
fi
[[ -n "${DOCKER_SOCKET_GID}" ]] || { red "[fatal] DOCKER_SOCKET_GID is required"; exit 1; }
[[ -n "${ADMIN_IDS:-}" ]] || { red "[fatal] ADMIN_IDS is required"; exit 1; }
export DOCKER_SOCKET_GID ADMIN_IDS

TMP="$(mktemp -d)"
COMPOSE_PROJECT="dibs-auto-lifecycle-$$"
export COMPOSE_PROJECT
AUTO_E2E_HOST_PORT="${AUTO_E2E_HOST_PORT:-3300}"
export AUTO_E2E_HOST_PORT
export BUILD_SERVER_HOST_PORT="${AUTO_E2E_HOST_PORT}"
BASE="${BUILD_SERVER_URL:-http://127.0.0.1:${AUTO_E2E_HOST_PORT}}"
COMPOSE_OVERRIDE="${TMP}/compose.auto.override.yaml"
# The base compose file uses fixed container_name values for local dogfooding.
# Override them for this isolated e2e so an existing developer stack does not
# prevent the test from starting.
cat > "${COMPOSE_OVERRIDE}" <<'YAML'
services:
  build-server:
    container_name: "dibs-auto-build-server-${COMPOSE_PROJECT}"
  runner:
    container_name: "dibs-auto-runner-${COMPOSE_PROJECT}"
    environment:
      HOST_SERVER_BASE_URL: "http://127.0.0.1:${AUTO_E2E_HOST_PORT}"
YAML
COMPOSE_FILES=(-f compose.dev.yaml -f compose.dev.e2e-production.yaml -f "${COMPOSE_OVERRIDE}")
cleanup() {
  docker compose "${COMPOSE_FILES[@]}" --project-name "${COMPOSE_PROJECT}" down -v >/dev/null 2>&1 || true
  rm -rf "${TMP}"
}
trap cleanup EXIT

echo "[1/6] base image warm-up"
docker pull --quiet nginx:1.27.4-alpine3.21 >/dev/null 2>&1 || yellow "  ⚠ nginx pull failed; build may fail later"
docker pull --quiet node:22.14.0-alpine3.21 >/dev/null 2>&1 || yellow "  ⚠ node pull failed; build may fail later"
green "  ✓ warm-up attempted"

echo "[2/6] compose up — real Docker build/run modes"
if ! docker compose "${COMPOSE_FILES[@]}" --project-name "${COMPOSE_PROJECT}" up -d --build >"${TMP}/compose-up.log" 2>&1; then
  red "[fatal] compose up failed"
  cat "${TMP}/compose-up.log"
  exit 1
fi
green "  ✓ compose up (${COMPOSE_PROJECT})"

echo "[3/6] build-server health + runner registration"
HEALTHY=0
for _ in $(seq 1 60); do
  if curl -fsS "${BASE}/health" >/dev/null 2>&1; then HEALTHY=1; break; fi
  sleep 1
done
[[ "${HEALTHY}" -eq 1 ]] || { red "[fatal] build-server unhealthy"; exit 1; }
REGISTERED=0
for _ in $(seq 1 90); do
  COUNT="$(curl -fsS -H 'x-admin-id: admin' "${BASE}/admin/runners" 2>/dev/null \
    | python3 -c 'import json,sys
try: print(len(json.load(sys.stdin).get("runners", [])))
except Exception: print(0)' 2>/dev/null || echo 0)"
  if [[ "${COUNT}" -ge 1 ]]; then REGISTERED=1; break; fi
  sleep 1
done
[[ "${REGISTERED}" -eq 1 ]] || { red "[fatal] runner not registered"; exit 1; }
green "  ✓ healthy + runner registered"

submit_and_wait() {
  local label="$1" source_dir="$2" expected_status="$3" expected_error="$4"
  local archive="${TMP}/${label}.tar.gz" bytes checksum response build_id status body error_code logs
  # Use explicit file entries. The source extractor validates archive paths;
  # a synthetic `.` root entry is unnecessary and can be rejected as a
  # traversal-adjacent path by the same guard used in production uploads.
  (cd "${source_dir}" && tar -czf "${archive}" --owner=0 --group=0 -- *)
  bytes="$(wc -c < "${archive}" | tr -d ' ')"
  checksum="$(sha256sum "${archive}" | awk '{print $1}')"

  response="$(curl -fsS -X POST "${BASE}/builds" -H 'content-type: application/json' -d "{
    \"appName\": \"auto-${label}-$$\",
    \"requestedBy\": \"task-174\",
    \"sourceArchive\": {\"objectKey\": \"auto/${label}.tar.gz\", \"checksumSha256\": \"${checksum}\", \"sizeBytes\": ${bytes}},
    \"entrypointPath\": \"index.html\",
    \"dockerfilePath\": \"Dockerfile\",
    \"dockerfileMode\": \"auto\",
    \"runtimePort\": 8080
  }")" || true
  build_id="$(printf '%s' "${response}" | python3 -c 'import json,sys
try: print(json.load(sys.stdin)["build"]["buildId"])
except Exception: print("")' 2>/dev/null)"
  [[ -n "${build_id}" ]] || { red "  ✗ ${label}: POST /builds failed: ${response}"; return 1; }

  if ! curl -fsS -X POST "${BASE}/builds/${build_id}/source" \
    -H 'content-type: application/octet-stream' --data-binary "@${archive}" >/dev/null; then
    red "  ✗ ${label}: source upload failed"; return 1
  fi

  status="unknown"
  for _ in $(seq 1 180); do
    body="$(curl -fsS "${BASE}/builds/${build_id}" 2>/dev/null || true)"
    status="$(printf '%s' "${body}" | python3 -c 'import json,sys
try: print(json.load(sys.stdin)["build"]["status"])
except Exception: print("unknown")' 2>/dev/null)"
    [[ "${status}" == "COMPLETED" || "${status}" == "FAILED" ]] && break
    sleep 2
  done

  body="$(curl -fsS "${BASE}/builds/${build_id}" 2>/dev/null || true)"
  error_code="$(printf '%s' "${body}" | python3 -c 'import json,sys
try:
 d=json.load(sys.stdin); e=d.get("lastError") or {}; print(e.get("code", ""))
except Exception: print("")' 2>/dev/null)"
  if [[ "${status}" != "${expected_status}" ]]; then
    red "  ✗ ${label}: status=${status}, want ${expected_status} (build=${build_id})"
    FAILURE_LOGS="$(curl -fsS "${BASE}/builds/${build_id}/logs" 2>/dev/null || true)"
    FAILURE_LOGS="${FAILURE_LOGS}" python3 <<'PY' 2>/dev/null || true
import json, os
try:
    for entry in json.loads(os.environ["FAILURE_LOGS"]).get("logs", []):
        print(f"    [{entry.get('phase', '')}] {entry.get('message', '')}")
except Exception:
    pass
PY
    docker compose "${COMPOSE_FILES[@]}" --project-name "${COMPOSE_PROJECT}" logs --tail=80 runner 2>/dev/null || true
    return 1
  fi
  if [[ -n "${expected_error}" && "${error_code}" != "${expected_error}" ]]; then
    red "  ✗ ${label}: lastError.code=${error_code}, want ${expected_error}"; return 1
  fi
  if [[ -z "${expected_error}" && -n "${error_code}" ]]; then
    red "  ✗ ${label}: unexpected lastError.code=${error_code}"; return 1
  fi

  logs="$(curl -fsS "${BASE}/builds/${build_id}/logs" 2>/dev/null || true)"
  if [[ "${expected_status}" == "COMPLETED" ]]; then
    LOGS_JSON="${logs}" python3 <<'PY'
import json, os, sys
d = json.loads(os.environ["LOGS_JSON"])
phases = {entry.get("phase") for entry in d.get("logs", [])}
expected = {
    "REQUEST_ACCEPTED", "QUEUE_CLAIMED", "SOURCE_PREPARED",
    "DOCKER_BUILD_STARTED", "DOCKER_BUILD_COMPLETED",
    "CONTAINER_TEST_STARTED", "CONTAINER_TEST_PASSED",
    "DEPLOYMENT_STARTED", "DEPLOYMENT_COMPLETED", "COMPLETED",
}
missing = sorted(expected - phases)
if missing:
    print(f"missing phases: {missing}", file=sys.stderr)
    sys.exit(1)
PY
  fi
  green "  ✓ ${label}: status=${status}${error_code:+, lastError.code=${error_code}}" >&2
  LAST_BUILD_ID="${build_id}"
}

echo "[4/6] static source → generated nginx Dockerfile → COMPLETED"
mkdir -p "${TMP}/static"
printf '<h1>task-174-static</h1>\n' > "${TMP}/static/index.html"
submit_and_wait static "${TMP}/static" COMPLETED "" || exit 1
STATIC_ID="${LAST_BUILD_ID}"

echo "[5/6] Node source → generated Node Dockerfile → COMPLETED"
mkdir -p "${TMP}/node"
cat > "${TMP}/node/package.json" <<'JSON'
{"name":"task-174-node","version":"1.0.0","scripts":{"start":"node server.js"}}
JSON
cat > "${TMP}/node/server.js" <<'JS'
require("http").createServer((req, res) => { res.writeHead(200, {"content-type":"text/plain"}); res.end("task-174-node\n"); }).listen(8080, "0.0.0.0");
JS
submit_and_wait node "${TMP}/node" COMPLETED "" || exit 1
NODE_ID="${LAST_BUILD_ID}"

echo "[6/6] unsupported source → DOCKER_BUILD_FAILED"
mkdir -p "${TMP}/unsupported"
printf 'readme only\n' > "${TMP}/unsupported/README.txt"
submit_and_wait unsupported "${TMP}/unsupported" FAILED DOCKER_BUILD_FAILED || exit 1
UNSUPPORTED_ID="${LAST_BUILD_ID}"

green "ALL PASS — TASK-174 auto Dockerfile lifecycle (static=${STATIC_ID}, node=${NODE_ID}, unsupported=${UNSUPPORTED_ID})"
