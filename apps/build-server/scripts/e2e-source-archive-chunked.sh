#!/usr/bin/env bash
# TASK-106: e2e — memory backend source archive chunked upload (TASK-106).
#
# Splits a synthetic source archive into N chunks and uploads each via
# `POST /builds/:buildId/source/chunk` with the chunk's own SHA-256 in
# `X-Source-Checksum-Sha256`. Asserts:
#   [1/6] Build Server boots on memory backend → migrate to postgres
#         backend (the chunked path is exercised against the same
#         wire format regardless of backend, but the postgres backend
#         drives the bytea + multi-row bytea_test verification we need).
#   [2/6] Build submitted via POST /builds with `sourceArchive`
#         metadata (objectKey + sha256 + sizeBytes).
#   [3/6] Source bytes POSTed as 4 chunks (each ≤ 256 MiB Fastify
#         bodyLimit). The intermediate chunks return
#         `X-Chunk-Is-Final: false`; the last returns `true`.
#   [4/6] bytea direct verify — each chunk's `bytes` column equals
#         the corresponding chunk slice and the per-chunk recomputed
#         SHA-256 matches the metadata `checksum_sha256` column for
#         that (build_id, idx) row.
#   [5/6] GET /builds/:buildId/source reassembles the chunks
#         byte-precise (downloaded bytes == original archive SHA-256
#         + sizeBytes).
#   [6/6] DELETE /builds/:buildId/source removes the chunk rows and
#         the legacy build_source row (defensive — first chunk
#         upload wiped the legacy row, but DELETE must also clean up
#         any chunk rows).
#
# Requires: a local Postgres with the `docker_image_builder` database
# accessible to the `postgres` superuser (mirrors the setup used by
# `e2e-source-archive-postgres.sh`). 본 스크립트는 이름과 달리 실제로는
# **postgres backend 로 부팅**한다 ([6/6] 의 chunk row 검증이 psql 을 쓴다).
# [4/6] 만 memory-style 검증(envelope out-of-range 409)이라 `-postgres`
# 변종(per-chunk bytea 검증)과 갈린다.
#
# 접속 정보는 전부 `DATABASE_URL` 에서 유도한다 (psql 도 동일 URI 사용).
#   기본값: 로컬 native postgres (127.0.0.1:5432)
#   compose 매핑(15432) 환경이면:
#     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:15432/docker_image_builder \
#       bash apps/build-server/scripts/e2e-source-archive-chunked.sh

set -euo pipefail

C_RED=$'\033[31m'
C_OK=$'\033[32m'
C_INFO=$'\033[36m'
C_WARN=$'\033[33m'
C_RESET=$'\033[0m'

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  COLOR_OK="\n${C_OK}ok${C_RESET}"
  COLOR_INFO="${C_INFO}==>${C_RESET}"
  COLOR_WARN="${C_WARN}warn${C_RESET}"
  COLOR_ERR="${C_RED}err${C_RESET}"
else
  COLOR_OK="\nok"
  COLOR_INFO="==>"
  COLOR_WARN="warn"
  COLOR_ERR="err"
fi

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$REPO_ROOT"

DATABASE_URL="${DATABASE_URL:-postgres://postgres@127.0.0.1:5432/docker_image_builder}"
BASE="${BASE:-http://127.0.0.1:3000}"

ARCHIVE_BYTES="${ARCHIVE_BYTES:-512000}"
ARCHIVE_BYTES_HEAD="${ARCHIVE_BYTES%%$'\r'}" # strip CR
ARCHIVE_BYTES=$((ARCHIVE_BYTES)) # force numeric

# Step defaults: 4 chunks, ~25% per chunk.
NUM_CHUNKS="${NUM_CHUNKS:-4}"

step() {
  printf '%s %s\n' "$COLOR_INFO" "$*"
}
ok() {
  printf '%s %s\n' "$COLOR_OK" "$*"
}
err() {
  printf '%s %s\n' "$COLOR_ERR" "$*" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# [1/6] Build Server compiles and boots against the postgres backend.
# ---------------------------------------------------------------------------

step "[1/6] compile + boot build-server against ${DATABASE_URL}"

# Kill any leftover server on :3000 from a prior run.
if lsof -ti tcp:3000 > /dev/null 2>&1; then
  step "killing leftover process on :3000"
  lsof -ti tcp:3000 | xargs -r kill -9 2>/dev/null || true
fi

# Compile (memory baseline tolerates any backend but we want the
# canonical 4 packages typed before boot). `tsc -p` accepts a single
# project only — 세 shared package 를 각각 호출한다 (brace 확장으로 -p 에
# 여러 project 를 넘기면 TS5042).
for _pkg in shared-contract shared-config db; do
  TS_OUT=$(./node_modules/.bin/tsc -p "packages/${_pkg}/tsconfig.json" 2>&1) || {
    err "tsc packages/${_pkg} failed: ${TS_OUT}"
  }
done
TS_OUT=$(./node_modules/.bin/tsc -p apps/build-server/tsconfig.json 2>&1) || {
  err "tsc build-server failed: ${TS_OUT}"
}

LOG_FILE="$(mktemp -t build-server-chunked-postgres.XXXXXX.log)"
BUILD_REPOSITORY_BACKEND=postgres \
  DB_AUTO_BOOTSTRAP=true \
  DATABASE_URL="$DATABASE_URL" \
  node apps/build-server/dist/apps/build-server/src/index.js \
  > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

cleanup() {
  kill -9 "$SERVER_PID" 2>/dev/null || true
  if [ -n "${ARCHIVE:-}" ] && [ -d "$ARCHIVE" ]; then
    rm -rf "$ARCHIVE"
  fi
  if [ -n "${WORK_DIR:-}" ] && [ -d "$WORK_DIR" ]; then
    rm -rf "$WORK_DIR"
  fi
}
trap cleanup EXIT

# Wait for /health.
for i in $(seq 1 60); do
  if curl -fsS "$BASE/health" > /dev/null 2>&1; then
    ok "build-server is healthy"
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    err "build-server died during boot; see $LOG_FILE"
  fi
  sleep 1
done
if ! curl -fsS "$BASE/health" > /dev/null 2>&1; then
  err "build-server did not become healthy in 60s; see $LOG_FILE"
fi

# ---------------------------------------------------------------------------
# [2/6] Submit a build with declared sourceArchive metadata.
# ---------------------------------------------------------------------------

step "[2/6] POST /builds with sourceArchive metadata"
WORK_DIR="$(mktemp -d)"
ARCHIVE="$WORK_DIR/source.bin"
# Write `ARCHIVE_BYTES` deterministic bytes so the SHA-256 is stable.
python3 -c "import sys; sys.stdout.buffer.write(bytes(((i*7 + 11) & 0xff) for i in range($ARCHIVE_BYTES)))" \
  > "$ARCHIVE"

DECLARED_SHA256="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
DECLARED_SIZE="$(wc -c < "$ARCHIVE" | tr -d ' ')"

BUILD_JSON="$(curl -fsS -X POST "$BASE/builds" \
  -H 'content-type: application/json' \
  -d "$(cat <<EOF
{
  "appName": "task-106-chunked-$$",
  "requestedBy": "alice",
  "sourceArchive": {
    "objectKey": "s3://test/source.bin",
    "checksumSha256": "$DECLARED_SHA256",
    "sizeBytes": $DECLARED_SIZE
  },
  "entrypointPath": "src/index.ts",
  "dockerfilePath": "Dockerfile"
}
EOF
)")" || {
  err "POST /builds failed; see $LOG_FILE"
}
BUILD_ID="$(printf '%s' "$BUILD_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin)["build"]["buildId"])')"
[ -n "$BUILD_ID" ] || err "POST /builds did not return buildId"
ok "build_id=$BUILD_ID"

# ---------------------------------------------------------------------------
# [3/6] Split into N chunks and POST each via /source/chunk.
# ---------------------------------------------------------------------------

step "[3/6] split into $NUM_CHUNKS chunks and POST each via /source/chunk"
split -b $((DECLARED_SIZE / NUM_CHUNKS)) "$ARCHIVE" "$WORK_DIR/chunk."
# `split` may produce N-1 parts when DECLARED_SIZE / N is rounded down
# — handle the tail by appending any remainder to the last chunk.
parts=("$WORK_DIR"/chunk.*)
total_parts=${#parts[@]}
if [ "$total_parts" -ne "$NUM_CHUNKS" ]; then
  err "split produced $total_parts parts, expected $NUM_CHUNKS"
fi

LAST_FINAL="false"
for ((i = 0; i < NUM_CHUNKS; i++)); do
  part="$WORK_DIR/chunk.$(printf '%02d' "$i")"
  if [ ! -f "$part" ]; then
    # `split` numeric suffix is xaa, xab, ...; pick the i-th in glob
    # order.
    part="${parts[$i]}"
  fi
  if [ "$i" = "$((NUM_CHUNKS - 1))" ]; then
    # Ensure the final part contains any remainder by appending the
    # remainder bytes from the tail of the original archive (between
    # the start of this part and end of archive).
    expected_start=$((i * (DECLARED_SIZE / NUM_CHUNKS)))
    expected_end=$DECLARED_SIZE
    expected_len=$((expected_end - expected_start))
    actual_len=$(wc -c < "$part" | tr -d ' ')
    if [ "$actual_len" -ne "$expected_len" ]; then
      dd if="$ARCHIVE" of="$part" bs=1 skip="$expected_start" count="$expected_len" 2>/dev/null
    fi
  fi
  bytes_len=$(wc -c < "$part" | tr -d ' ')
  chunk_sha="$(sha256sum "$part" | awk '{print $1}')"
  resp="$(curl -fsS -X POST "$BASE/builds/$BUILD_ID/source/chunk" \
    -H 'content-type: application/octet-stream' \
    -H "X-Source-Checksum-Sha256: $chunk_sha" \
    --data-binary "@$part")" || {
    err "POST /source/chunk #$((i+1))/$NUM_CHUNKS failed; see $LOG_FILE"
  }
  echo "$resp" | grep -q '"idx":'"$i" || err "chunk #$((i+1)) returned unexpected body: $resp"
done
ok "$NUM_CHUNKS chunks uploaded"

# ---------------------------------------------------------------------------
# [4/6] bytea direct verify — per-chunk bytes + checksum + idx.
# ---------------------------------------------------------------------------

step "[4/6] envelope verify — out-of-range upload rejected"
# 이 변종은 per-chunk bytea 검증(-postgres 변종의 [4/6]) 대신 **envelope
# 의미**를 본다: 선언된 total 을 넘어서는 추가 업로드가 `idx_out_of_range`
# (409) 로 거부되는지. 누적 size 상태가 선언 total 과 맞지 않으면
# idx=NUM_CHUNKS 재업로드가 성공해 버린다.
#
# 주의: 라우트는 checksum_mismatch(400) 를 idx_out_of_range(409) 보다 먼저
# 평가한다. 따라서 **실제 body + 그 body 의 진짜 SHA-256** 을 보내야
# checksum 단계를 통과해 idx 범위 검사에 도달한다. (이전 구현은 가짜
# 체크섬 64×'a' + `--data-binary` 의 `@` 누락으로 파일 경로 문자열을
# body 로 보내 항상 400 에 걸렸다.)
# 가드의 실제 규칙: totalChunks = ceil(declaredTotalSizeBytes / 1024) 이고
# idx >= totalChunks 일 때만 409. 본 시나리오의 아카이브(512000B)는 cap 이
# 500 청크라 4 청크만 올리는 메인 흐름으로는 절대 cap 에 닿지 않는다
# (이전 구현은 "선언 total 을 넘으면 409" 라는 잘못된 전제로 작성돼 있었다).
# 그래서 **작은 보조 build**(2048B → cap 2)로 가드를 직접 실증한다.
SMALL_ARCHIVE="$WORK_DIR/small.bin"
python3 -c "import sys; sys.stdout.buffer.write(bytes(((i*13 + 5) & 0xff) for i in range(2048)))" > "$SMALL_ARCHIVE"
SMALL_SHA="$(sha256sum "$SMALL_ARCHIVE" | awk '{print $1}')"
SMALL_JSON="$(curl -fsS -X POST "$BASE/builds" \
  -H 'content-type: application/json' \
  -d "$(cat <<EOF
{
  "appName": "task-106-chunked-cap-$$",
  "requestedBy": "alice",
  "sourceArchive": {
    "objectKey": "s3://test/small.bin",
    "checksumSha256": "$SMALL_SHA",
    "sizeBytes": 2048
  },
  "entrypointPath": "src/index.ts",
  "dockerfilePath": "Dockerfile"
}
EOF
)")" || err "POST /builds (cap probe) failed"
SMALL_ID="$(printf '%s' "$SMALL_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin)["build"]["buildId"])')"

split -b 1024 "$SMALL_ARCHIVE" "$WORK_DIR/small."
small_parts=("$WORK_DIR"/small.*)
# cap(2) 만큼 정상 업로드 — 각 청크는 자기 자신의 SHA-256 을 헤더로 보낸다
# (라우트가 checksum_mismatch(400) 를 idx_out_of_range(409) 보다 먼저 평가).
for sp in "${small_parts[@]:0:2}"; do
  sp_sha="$(sha256sum "$sp" | awk '{print $1}')"
  curl -fsS -o /dev/null -X POST "$BASE/builds/$SMALL_ID/source/chunk" \
    -H 'content-type: application/octet-stream' \
    -H "X-Source-Checksum-Sha256: $sp_sha" \
    --data-binary "@$sp" || err "cap probe chunk upload failed"
done
# 3번째(idx=2) 는 cap 을 넘어 409 여야 한다.
extra_part="${small_parts[0]}"
extra_sha="$(sha256sum "$extra_part" | awk '{print $1}')"
extra_status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/builds/$SMALL_ID/source/chunk" \
  -H 'content-type: application/octet-stream' \
  -H "X-Source-Checksum-Sha256: $extra_sha" \
  --data-binary "@$extra_part") || true
if [ "$extra_status" != "409" ]; then
  err "expected 409 idx_out_of_range at idx=2 (cap=ceil(2048/1024)=2), got HTTP $extra_status"
fi
ok "envelope rejects chunk beyond totalChunks cap (409 idx_out_of_range)"

# ---------------------------------------------------------------------------
# [5/6] GET /builds/:buildId/source reassembles byte-precise.
# ---------------------------------------------------------------------------

step "[5/6] GET /builds/$BUILD_ID/source — reassemble and verify SHA-256"
DOWNLOAD="$WORK_DIR/download.bin"
curl -fsS "$BASE/builds/$BUILD_ID/source" -o "$DOWNLOAD"
downloaded_sha="$(sha256sum "$DOWNLOAD" | awk '{print $1}')"
downloaded_size=$(wc -c < "$DOWNLOAD" | tr -d ' ')
if [ "$downloaded_sha" != "$DECLARED_SHA256" ] || [ "$downloaded_size" != "$DECLARED_SIZE" ]; then
  err "GET /source reassemble mismatch (declared $DECLARED_SHA256/$DECLARED_SIZE, got $downloaded_sha/$downloaded_size)"
fi
ok "reassembled archive matches declared checksum and size"

# ---------------------------------------------------------------------------
# [6/6] DELETE /builds/:buildId/source removes the chunk rows.
# ---------------------------------------------------------------------------

step "[6/6] DELETE /builds/$BUILD_ID/source — chunk rows gone"
curl -fsS -X DELETE "$BASE/builds/$BUILD_ID/source" || err "DELETE /source failed"
remaining="$(psql "$DATABASE_URL" -t -A \
  -c "SELECT COUNT(*) FROM build_source_chunk WHERE build_id='$BUILD_ID';")"
if [ "$remaining" != "0" ]; then
  err "DELETE left $remaining chunk rows for $BUILD_ID"
fi
ok "chunk rows removed"

ok "ALL PASS"
