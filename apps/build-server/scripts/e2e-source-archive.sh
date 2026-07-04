#!/usr/bin/env bash
# TASK-066 happy-path e2e smoke for the source archive endpoints.
#
# This script verifies the round-trip:
#
#   1. Build Server (memory backend) starts on a free port.
#   2. `POST /builds` enqueues a build with declared `SourceArchive`
#      metadata (objectKey + sha256 + sizeBytes).
#   3. `POST /builds/:buildId/source` uploads a real tar.gz whose
#      body, when re-hashed, matches the declared sha256.
#   4. `GET /builds/:buildId/source` returns the same bytes plus
#      the `X-Source-Checksum-Sha256` response header.
#   5. A second build with a tampered body is rejected with HTTP
#      400 + a `checksum_mismatch` error envelope.
#
# The script is a thin shell over the running Build Server. It
# exits non-zero on any failed step so it can be wired into a
# pre-PR gate (`bash scripts/e2e-source-archive.sh`).

set -euo pipefail

# Pick a free TCP port via Python so multiple e2e runs don't
# collide on the same machine. PORT env still overrides for CI
# pinning.
if [[ -z "${PORT:-}" ]]; then
  PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1]); s.close()')"
fi
BASE="http://127.0.0.1:${PORT}"
TMP="$(mktemp -d)"
# Wait for the server to actually exit before nuking TMP — node
# holds an open file descriptor to the redirected stdout, so
# removing TMP while the process is alive produces a noisy
# "file not found" error from libuv before the server exits.
trap '
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
  rm -rf "${TMP}"
' EXIT

# Start the Build Server in the background. `tsc` has already been
# run by the user; we just exec the compiled entry point.
echo "[e2e] starting build server on :${PORT}"
PORT="${PORT}" BUILD_REPOSITORY_BACKEND=memory \
  node apps/build-server/dist/apps/build-server/src/index.js >"${TMP}/server.log" 2>&1 &
SERVER_PID=$!

# Wait for /health to come up.
for i in $(seq 1 30); do
  if curl -fsS "${BASE}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done
if ! curl -fsS "${BASE}/health" >/dev/null 2>&1; then
  echo "[e2e] server failed to start; last log lines:"
  tail -20 "${TMP}/server.log" || true
  exit 1
fi
echo "[e2e] server up"

# 1. Build a real tar.gz on disk so the SHA-256 + size match the
#    declared metadata exactly.
SRC="${TMP}/src"
mkdir -p "${SRC}"
cat >"${SRC}/Dockerfile" <<'EOF'
FROM scratch
COPY hello.txt /hello.txt
EOF
echo "hello-source-archive" >"${SRC}/hello.txt"
ARCHIVE="${TMP}/source.tar.gz"
tar -czf "${ARCHIVE}" -C "${TMP}" src
SHA="$(sha256sum "${ARCHIVE}" | awk '{print $1}')"
SIZE="$(wc -c <"${ARCHIVE}")"
echo "[e2e] archive sha256=${SHA} size=${SIZE}"

# 2. POST /builds
BUILD_BODY=$(cat <<EOF
{
  "appName": "e2e-source-archive",
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
echo "[e2e] build id=${BUILD_ID}"

# 3. POST /builds/:buildId/source
echo "[e2e] uploading source archive (${SIZE} bytes)"
UPLOAD_STATUS="$(curl -sS -o "${TMP}/upload.json" -w '%{http_code}' \
  -X POST \
  -H 'content-type: application/octet-stream' \
  --data-binary "@${ARCHIVE}" \
  "${BASE}/builds/${BUILD_ID}/source")"
if [[ "${UPLOAD_STATUS}" != "201" ]]; then
  echo "[e2e] upload failed: status=${UPLOAD_STATUS} body=$(cat "${TMP}/upload.json")"
  exit 1
fi
echo "[e2e] upload ok: $(cat "${TMP}/upload.json")"

# 4. GET /builds/:buildId/source
echo "[e2e] downloading source archive"
HEADERS="${TMP}/headers.txt"
curl -fsS -D "${HEADERS}" -o "${TMP}/download.tar.gz" \
  "${BASE}/builds/${BUILD_ID}/source"
DOWNLOAD_SHA="$(sha256sum "${TMP}/download.tar.gz" | awk '{print $1}')"
DOWNLOAD_SIZE="$(wc -c <"${TMP}/download.tar.gz")"
if [[ "${DOWNLOAD_SHA}" != "${SHA}" ]]; then
  echo "[e2e] downloaded bytes sha mismatch: expected=${SHA} got=${DOWNLOAD_SHA}"
  exit 1
fi
if [[ "${DOWNLOAD_SIZE}" != "${SIZE}" ]]; then
  echo "[e2e] downloaded bytes size mismatch: expected=${SIZE} got=${DOWNLOAD_SIZE}"
  exit 1
fi
HEADER_SHA="$(grep -i '^x-source-checksum-sha256:' "${HEADERS}" | awk '{print $2}' | tr -d '\r')"
HEADER_SIZE="$(grep -i '^x-source-size-bytes:' "${HEADERS}" | awk '{print $2}' | tr -d '\r')"
if [[ "${HEADER_SHA}" != "${SHA}" ]]; then
  echo "[e2e] X-Source-Checksum-Sha256 header mismatch: expected=${SHA} got=${HEADER_SHA}"
  exit 1
fi
if [[ "${HEADER_SIZE}" != "${SIZE}" ]]; then
  echo "[e2e] X-Source-Size-Bytes header mismatch: expected=${SIZE} got=${HEADER_SIZE}"
  exit 1
fi
echo "[e2e] download ok: sha256=${DOWNLOAD_SHA} size=${DOWNLOAD_SIZE} headers match"

# 5. Tampered upload → 400 checksum_mismatch
TAMPERED="${TMP}/tampered.tar.gz"
cp "${ARCHIVE}" "${TAMPERED}"
echo "tampered" >>"${TMP}/tamper-pad.bin"
# Re-archive with a different file inside so the bytes differ but
# the new sha256/size is plausible.
mkdir -p "${TMP}/tamp"
echo "tampered" >"${TMP}/tamp/hello.txt"
tar -czf "${TAMPERED}" -C "${TMP}" tamp
TAMP_SHA="$(sha256sum "${TAMPERED}" | awk '{print $1}')"
TAMP_SIZE="$(wc -c <"${TAMPERED}")"
TAMPERED_BODY=$(cat <<EOF
{
  "appName": "e2e-tampered",
  "requestedBy": "yklee",
  "sourceArchive": {
    "objectKey": "e2e/tampered.tar.gz",
    "checksumSha256": "${TAMP_SHA}",
    "sizeBytes": ${TAMP_SIZE}
  },
  "entrypointPath": "tamp/hello.txt",
  "dockerfilePath": "Dockerfile"
}
EOF
)
TAMP_ENQ="$(curl -fsS -X POST -H 'content-type: application/json' -d "${TAMPERED_BODY}" "${BASE}/builds")"
TAMP_ID="$(echo "${TAMP_ENQ}" | python3 -c 'import sys, json; print(json.load(sys.stdin)["build"]["buildId"])')"
# Now upload the ORIGINAL archive bytes (which won't match the
# declared TAMP_SHA).
TAMP_STATUS="$(curl -sS -o "${TMP}/tamp.json" -w '%{http_code}' \
  -X POST \
  -H 'content-type: application/octet-stream' \
  --data-binary "@${ARCHIVE}" \
  "${BASE}/builds/${TAMP_ID}/source")"
if [[ "${TAMP_STATUS}" != "400" ]]; then
  echo "[e2e] tampered upload should have been 400, got ${TAMP_STATUS} body=$(cat "${TMP}/tamp.json")"
  exit 1
fi
if ! grep -q 'checksum' "${TMP}/tamp.json"; then
  echo "[e2e] tampered upload 400 body should mention 'checksum', got: $(cat "${TMP}/tamp.json")"
  exit 1
fi
echo "[e2e] tampered upload rejected: $(cat "${TMP}/tamp.json")"

# 6. 404 cases
NF_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' "${BASE}/builds/00000000-0000-0000-0000-000000000000/source")"
if [[ "${NF_STATUS}" != "404" ]]; then
  echo "[e2e] GET on missing buildId should be 404, got ${NF_STATUS}"
  exit 1
fi
NF_DEL_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE "${BASE}/builds/00000000-0000-0000-0000-000000000000/source")"
if [[ "${NF_DEL_STATUS}" != "404" ]]; then
  echo "[e2e] DELETE on missing buildId should be 404, got ${NF_DEL_STATUS}"
  exit 1
fi
echo "[e2e] 404 path confirmed (GET + DELETE)"

# 7. DELETE /builds/:buildId/source — drop the archive and
#    verify the build row itself is still queryable so the
#    Skill can re-upload under the same buildId.
DEL_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE "${BASE}/builds/${BUILD_ID}/source")"
if [[ "${DEL_STATUS}" != "204" ]]; then
  echo "[e2e] DELETE happy path should be 204, got ${DEL_STATUS}"
  exit 1
fi
GET_AFTER_DEL_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' "${BASE}/builds/${BUILD_ID}/source")"
if [[ "${GET_AFTER_DEL_STATUS}" != "404" ]]; then
  echo "[e2e] GET after DELETE should be 404, got ${GET_AFTER_DEL_STATUS}"
  exit 1
fi
REUPLOAD_STATUS="$(curl -sS -o "${TMP}/reupload.json" -w '%{http_code}' \
  -X POST \
  -H 'content-type: application/octet-stream' \
  --data-binary "@${ARCHIVE}" \
  "${BASE}/builds/${BUILD_ID}/source")"
if [[ "${REUPLOAD_STATUS}" != "201" ]]; then
  echo "[e2e] re-upload after DELETE should be 201, got ${REUPLOAD_STATUS}"
  exit 1
fi
echo "[e2e] DELETE + re-upload ok"

echo "[e2e] OK"
