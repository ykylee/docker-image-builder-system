#!/usr/bin/env bash
# TASK-066 happy-path e2e smoke for the source archive
# endpoints over the **postgres** backend. Mirrors
# `e2e-source-archive.sh` (memory backend) but boots the Build
# Server against a freshly-created `dib_e2e_pg` database so the
# bytea round-trip is exercised on the real driver.
#
# Requirements (host):
#   - `psql` available on PATH
#   - a local PostgreSQL reachable as `postgres` superuser
#     on 127.0.0.1:5432 (Unix auth or password via PGHOST/PGPORT)
#
# Both the bootstrap DDL (from `packages/db/src/bootstrap.ts`)
# and the `0004` migration are applied so the script can be run
# against a fresh DB (the migration already runs idempotently
# in bootstrap, but the migration file's FK DO-block also runs
# so the constraint is added idempotently against a pre-existing
# table).
#
# Exit codes mirror `e2e-source-archive.sh` — non-zero on any
# failed step.

set -euo pipefail

# Pick a free port the same way the memory script does.
if [[ -z "${PORT:-}" ]]; then
  PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1]); s.close()')"
fi
BASE="http://127.0.0.1:${PORT}"
TMP="$(mktemp -d)"

PG_PORT="${PGPORT:-5432}"
PG_SUPERUSER="${PG_SUPERUSER:-postgres}"
DB_NAME="dib_e2e_pg_$$"
PG_CONN_ARGS=(-h 127.0.0.1 -p "$PG_PORT" -U "$PG_SUPERUSER")

psql_cmd() {
  psql "${PG_CONN_ARGS[@]}" "$@"
}

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
  # Drop the test database (best-effort — ignore failures so a
  # failing test still preserves the diagnostic output).
  psql_cmd -c "DROP DATABASE IF EXISTS ${DB_NAME};" >/dev/null 2>&1 || true
  rm -rf "${TMP}"
}
trap cleanup EXIT

echo "[e2e-pg] provisioning database ${DB_NAME} on :${PG_PORT}"
psql_cmd -c "DROP DATABASE IF EXISTS ${DB_NAME};" >/dev/null 2>&1
psql_cmd -c "CREATE DATABASE ${DB_NAME};" >/dev/null

echo "[e2e-pg] starting build server on :${PORT}"
DATABASE_URL="postgres://${PG_SUPERUSER}@127.0.0.1:${PG_PORT}/${DB_NAME}" \
  PORT="${PORT}" \
  BUILD_REPOSITORY_BACKEND=postgres \
  DB_AUTO_BOOTSTRAP=true \
  node apps/build-server/dist/apps/build-server/src/index.js >"${TMP}/server.log" 2>&1 &
SERVER_PID=$!

# Wait for /health. Postgres bootstrap can take a beat longer
# than the memory backend's instant startup.
for i in $(seq 1 60); do
  if curl -fsS "${BASE}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done
if ! curl -fsS "${BASE}/health" >/dev/null 2>&1; then
  echo "[e2e-pg] server failed to start; last log lines:"
  tail -30 "${TMP}/server.log" || true
  exit 1
fi
echo "[e2e-pg] server up"

# Stage a real archive on disk so we can verify SHA-256 + byte
# equality end-to-end against the bytea column.
SRC="${TMP}/src"
mkdir -p "${SRC}"
cat >"${SRC}/Dockerfile" <<'EOF'
FROM scratch
COPY hello.txt /hello.txt
EOF
echo "hello-postgres-archive" >"${SRC}/hello.txt"
ARCHIVE="${TMP}/source.tar.gz"
tar -czf "${ARCHIVE}" -C "${TMP}" src
SHA="$(sha256sum "${ARCHIVE}" | awk '{print $1}')"
SIZE="$(wc -c <"${ARCHIVE}")"
echo "[e2e-pg] archive sha256=${SHA} size=${SIZE}"

# 1. POST /builds
BUILD_BODY=$(cat <<EOF
{
  "appName": "e2e-pg-source-archive",
  "requestedBy": "yklee",
  "sourceArchive": {
    "objectKey": "e2e/source.tar.gz",
    "checksumSha256": "${SHA}",
    "sizeBytes": ${SIZE}
  },
  "entrypointPath": "src/hello.txt",
  "dockerfilePath": "src/Dockerfile"
}
EOF
)
ENQ="$(curl -fsS -X POST -H 'content-type: application/json' -d "${BUILD_BODY}" "${BASE}/builds")"
BUILD_ID="$(echo "${ENQ}" | python3 -c 'import sys, json; print(json.load(sys.stdin)["build"]["buildId"])')"
echo "[e2e-pg] build id=${BUILD_ID}"

# 2. POST /builds/:buildId/source
echo "[e2e-pg] uploading source archive (${SIZE} bytes)"
UPLOAD_STATUS="$(curl -sS -o "${TMP}/upload.json" -w '%{http_code}' \
  -X POST \
  -H 'content-type: application/octet-stream' \
  --data-binary "@${ARCHIVE}" \
  "${BASE}/builds/${BUILD_ID}/source")"
if [[ "${UPLOAD_STATUS}" != "201" ]]; then
  echo "[e2e-pg] upload failed: status=${UPLOAD_STATUS} body=$(cat "${TMP}/upload.json")"
  exit 1
fi
echo "[e2e-pg] upload ok"

# 3. Verify the bytea column directly with psql — this is the
#    specific check the memory backend cannot give us.
echo "[e2e-pg] verifying bytea storage in postgres"
DB_SHA="$(psql_cmd -d "${DB_NAME}" -tA -c "SELECT encode(sha256(bytes), 'hex') FROM build_source WHERE build_id = '${BUILD_ID}';")"
if [[ "${DB_SHA}" != "${SHA}" ]]; then
  echo "[e2e-pg] bytea sha256 mismatch: db=${DB_SHA} expected=${SHA}"
  exit 1
fi
DB_SIZE="$(psql_cmd -d "${DB_NAME}" -tA -c "SELECT size_bytes FROM build_source WHERE build_id = '${BUILD_ID}';")"
if [[ "${DB_SIZE}" != "${SIZE}" ]]; then
  echo "[e2e-pg] bytea size mismatch: db=${DB_SIZE} expected=${SIZE}"
  exit 1
fi
echo "[e2e-pg] bytea column sha256 + size match declared metadata"

# 4. GET /builds/:buildId/source — wire-format round-trip
curl -fsS -D "${TMP}/headers.txt" -o "${TMP}/download.tar.gz" \
  "${BASE}/builds/${BUILD_ID}/source"
DOWNLOAD_SHA="$(sha256sum "${TMP}/download.tar.gz" | awk '{print $1}')"
DOWNLOAD_SIZE="$(wc -c <"${TMP}/download.tar.gz")"
if [[ "${DOWNLOAD_SHA}" != "${SHA}" || "${DOWNLOAD_SIZE}" != "${SIZE}" ]]; then
  echo "[e2e-pg] wire-format bytes mismatch: dl_sha=${DOWNLOAD_SHA} dl_size=${DOWNLOAD_SIZE} expected_sha=${SHA} expected_size=${SIZE}"
  exit 1
fi
echo "[e2e-pg] wire-format round-trip ok"

# 5. DELETE /builds/:buildId/source — the row should be gone
#    from build_source (FK to build_request keeps the metadata
#    row intact).
DEL_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE "${BASE}/builds/${BUILD_ID}/source")"
if [[ "${DEL_STATUS}" != "204" ]]; then
  echo "[e2e-pg] delete failed: status=${DEL_STATUS}"
  exit 1
fi
COUNT_AFTER="$(psql_cmd -d "${DB_NAME}" -tA -c "SELECT count(*) FROM build_source WHERE build_id = '${BUILD_ID}';")"
if [[ "${COUNT_AFTER}" != "0" ]]; then
  echo "[e2e-pg] build_source row still present after delete: count=${COUNT_AFTER}"
  exit 1
fi
BUILD_COUNT_AFTER="$(psql_cmd -d "${DB_NAME}" -tA -c "SELECT count(*) FROM build_request WHERE id = '${BUILD_ID}';")"
if [[ "${BUILD_COUNT_AFTER}" != "1" ]]; then
  echo "[e2e-pg] build_request row was wrongly deleted: count=${BUILD_COUNT_AFTER}"
  exit 1
fi
echo "[e2e-pg] delete ok — source row gone, build row + metadata preserved"

echo "[e2e-pg] OK"
