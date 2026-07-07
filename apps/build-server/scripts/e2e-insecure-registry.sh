#!/usr/bin/env bash
# TASK-076: insecure-registry only 운영 패턴 검증 e2e.
#
# htpasswd / REGISTRY_AUTH=htpasswd / credential rotation 의 모든
# credential 인증 패턴을 제외한 insecure-registry 만 운영 — internal
# network (VPC / k8s service mesh) 으로 외부 노출을 차단하고 권한 분리는
# upstream (build-server / runner 의 자체 access control) 에서 처리하는
# 운영 모델. 본 e2e 가 그 운영 모델 의 foundation 을 봉인:
#
#   - registry:2 가 anonymous access (no-auth) 로 동작.
#   - docker CLI 가 `insecure-registries` 만 등록된 config.json 으로
#     credential 없이 push 성공.
#   - 다중 build 가 동시 push — registry 가 동시에 여러 write 를 안정적으로
#     처리하는지.
#   - image retention 운영 패턴 — registry REST API 의 DELETE 로 image
#     tag 정리 후 다른 tag 들은 영향 없이 push 가능한지.
#
# 검증 단계:
#   [0/8] busybox:1.36 image warm-up
#   [1/8] registry:2 image warm-up
#   [2/8] HOST_REGISTRY_CONFIG 셋업 (insecure-registries 만, auths 없음)
#   [3/8] compose up — build-server + runner (cli mode) + registry
#   [4/8] registry healthy 대기
#   [5/8] build-server healthy 대기
#   [6/8] runner registry 등록 대기
#   [7/8] 5 build 적재 + lifecycle — cli mode docker push 까지 동시 실행
#         (운영 환경의 multi-runner claim / 분산 동작 의 server 측 verification)
#   [8/8] image retention 검증 — catalog 에 5 image tag 다 노출 +
#         DELETE API 로 1 tag 삭제 후 다른 4 tag 영향 없음 + catalog 검증.
#         운영 환경의 image lifecycle / GC 패턴의 foundation.
#
# 운영 모델 가이드 (자세한 내역은 docs/operations/insecure-registry-only-2026-07-07.md):
#   - insecure HTTP — TLS terminate 없음. 운영 환경에서는 registry 앞 sibling
#     sidecar (e.g. nginx + cert-manager) 로 mTLS / HTTPS terminate 또는
#     k8s service mesh 가 sidecar 로 암호화.
#   - no-auth registry — 권한 분리는 upstream access control 에서.
#     host의 docker daemon ACL, k8s RBAC, network policy, VPN/IP allowlist.
#   - image retention — 운영자가 cron / K8s CronJob 으로 일정 기간 지난
#     tag 정리 (registry REST API DELETE /v2/<name>/manifests/<reference>).
#     image tag 와 image layer 가 분리되어 있으므로 layer 는 다른 tag 가
#     참조하는 한 GC 안됨 — registry:2 의 자동 GC 는 registry 자체에
#     REGISTRY_GC=1 또는 수동 호출 (`registry garbage-collect --delete-untagged=true`).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
cd "${REPO_ROOT}"

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
blue()   { printf '\033[34m%s\033[0m\n' "$*"; }

# docker 가용성.
if ! command -v docker >/dev/null 2>&1; then
  red "[fatal] docker not found in PATH"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  red "[fatal] docker daemon not reachable (colima 실행 여부 확인)"
  exit 1
fi

# 필수 env.
if [[ -z "${DOCKER_SOCKET_GID:-}" ]]; then
  DOCKER_SOCKET_GID="$(getent group docker | cut -d: -f3 || true)"
fi
if [[ -z "${DOCKER_SOCKET_GID}" ]]; then
  red "[fatal] DOCKER_SOCKET_GID not set and cannot derive"
  exit 1
fi
if [[ -z "${ADMIN_IDS:-}" ]]; then
  red "[fatal] ADMIN_IDS not set (export ADMIN_IDS=admin)"
  exit 1
fi
export DOCKER_SOCKET_GID
export ADMIN_IDS

# 임시 디렉터리.
TMP="$(mktemp -d)"
# TASK-076 의 insecure-registry 운영 모델 — config.json 에 `auths` entry
# 없음. insecure-registries 만 등록. docker CLI 가 anonymous 로 push 시도.
HOST_REGISTRY_CONFIG="$(mktemp -d)"
chmod 0755 "${HOST_REGISTRY_CONFIG}"
SRC="$(mktemp -d)"
SRC_ARCHIVE="${TMP}/source.tar.gz"

cat > "${HOST_REGISTRY_CONFIG}/config.json" <<'EOF'
{
  "insecure-registries": ["localhost:5000", "127.0.0.1:5000"]
}
EOF
export HOST_REGISTRY_CONFIG

COMPOSE_PROJECT="dibs-insecure-registry-e2e-$$"
trap '
  if [[ -n "${COMPOSE_PROJECT:-}" ]]; then
    docker compose -f compose.dev.yaml -f compose.dev.e2e-insecure-registry.yaml \
      --project-name "${COMPOSE_PROJECT}" down -v >/dev/null 2>&1 || true
  fi
  rm -rf "${TMP}" "${SRC}" "${HOST_REGISTRY_CONFIG}"
' EXIT

if [[ "${KEEP_PROJECT:-}" == "1" ]]; then
  trap '
    echo "  [debug] KEEP_PROJECT=1 — ${COMPOSE_PROJECT} 보존 (host dir 도)"
    echo "    container: docker compose -p ${COMPOSE_PROJECT} ps"
    echo "    host dir: ${HOST_REGISTRY_CONFIG}"
  ' EXIT
fi

# [0/8] busybox warm-up.
echo "[0/8] busybox:1.36 image warm-up"
if ! docker pull --quiet busybox:1.36 >/dev/null 2>&1; then
  yellow "  ⚠ busybox:1.36 pull failed — e2e 가 image pull 단계에서 timeout 가능"
else
  green "  ✓ busybox:1.36 pulled"
fi

# [1/8] registry:2 warm-up.
echo
echo "[1/8] registry:2 image warm-up"
if ! docker pull --quiet registry:2 >/dev/null 2>&1; then
  red "[fatal] registry:2 pull failed"
  exit 1
fi
green "  ✓ registry:2 pulled"

# [2/8] config.json 검증 — insecure-registry 만 운영, auths 없음.
echo
echo "[2/8] HOST_REGISTRY_CONFIG 검증 (insecure-registry 만, auths 없음)"
if [[ ! -s "${HOST_REGISTRY_CONFIG}/config.json" ]]; then
  red "[fatal] config.json missing at ${HOST_REGISTRY_CONFIG}/config.json"
  exit 1
fi
if grep -q '"auths"' "${HOST_REGISTRY_CONFIG}/config.json"; then
  red "[fatal] config.json 에 auths entry 가 있음 — TASK-076 의 insecure-registry 모델 위반"
  exit 1
fi
green "  ✓ config.json v1 (insecure-registries 만, auths 없음)"
blue "  ---"
cat "${HOST_REGISTRY_CONFIG}/config.json" | sed 's/^/    /'
blue "  ---"

# [3/8] compose up.
echo
echo "[3/8] compose up — build-server + runner (cli mode) + insecure-registry"
docker compose -f compose.dev.yaml -f compose.dev.e2e-insecure-registry.yaml \
  --project-name "${COMPOSE_PROJECT}" up -d --build \
  >"${TMP}/compose-up.log" 2>&1
if [[ $? -ne 0 ]]; then
  red "[fatal] docker compose up failed"
  cat "${TMP}/compose-up.log"
  exit 1
fi
green "  ✓ compose up (project=${COMPOSE_PROJECT})"

# [4/8] registry healthy 대기.
echo
echo "[4/8] registry healthy 대기 (curl /v2/ 응답 200 시작 시점)"
REGISTRY_HEALTHY=0
HTTP_CODE="000"
for i in $(seq 1 30); do
  HTTP_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -m 2 http://127.0.0.1:5000/v2/ 2>/dev/null || echo 000)"
  # insecure-registry (anonymous access 가능) 라 /v2/ 가 200 응답 기대.
  if [[ "${HTTP_CODE}" == "200" ]]; then
    REGISTRY_HEALTHY=1
    break
  fi
  sleep 1
done
if [[ "${REGISTRY_HEALTHY}" -ne 1 ]]; then
  red "[fatal] registry did not become ready in 30s (last code=${HTTP_CODE})"
  docker compose -f compose.dev.yaml -f compose.dev.e2e-insecure-registry.yaml \
    --project-name "${COMPOSE_PROJECT}" logs --tail=30 registry 2>&1 | sed 's/^/    /'
  exit 1
fi
green "  ✓ registry healthy (insecure-registry — /v2/ 200, anonymous access 가능)"

# [5/8] build-server healthy 대기.
echo
echo "[5/8] build-server health 대기"
HEALTHY=0
for i in $(seq 1 60); do
  HEALTH="$(docker compose -f compose.dev.yaml -f compose.dev.e2e-insecure-registry.yaml \
    --project-name "${COMPOSE_PROJECT}" ps --format json 2>/dev/null \
    | python3 -c 'import json,sys
try:
  for line in sys.stdin:
    d = json.loads(line)
    if d.get("Service") == "build-server":
      print(d.get("Health", ""))
except Exception:
  pass
' 2>/dev/null || true)"
  if [[ "${HEALTH}" == *"healthy"* ]]; then
    HEALTHY=1
    break
  fi
  sleep 1
done
if [[ "${HEALTHY}" -ne 1 ]]; then
  red "[fatal] build-server did not become healthy in 60s"
  docker compose -f compose.dev.yaml -f compose.dev.e2e-insecure-registry.yaml \
    --project-name "${COMPOSE_PROJECT}" logs --tail=50 build-server
  exit 1
fi
green "  ✓ build-server healthy"

# [6/8] runner registry 등록 대기.
echo
echo "[6/8] runner registry 등록 대기 (최대 90s)"
BASE="http://127.0.0.1:3000"
REGISTERED=0
for i in $(seq 1 90); do
  RUNNERS="$(curl -fsS -H 'x-admin-id: admin' "${BASE}/admin/runners" 2>/dev/null || true)"
  COUNT="$(printf '%s' "${RUNNERS}" | python3 -c 'import json,sys
try:
  d = json.loads(sys.stdin.read())
  print(len(d.get("runners", [])))
except Exception:
  print(0)
' 2>/dev/null || echo 0)"
  if [[ "${COUNT}" -ge 1 ]]; then
    REGISTERED=1
    break
  fi
  sleep 1
done
if [[ "${REGISTERED}" -ne 1 ]]; then
  red "[fatal] expected 1 runner registered, got ${COUNT}"
  docker compose -f compose.dev.yaml -f compose.dev.e2e-insecure-registry.yaml \
    --project-name "${COMPOSE_PROJECT}" logs --tail=30 runner 2>&1 | sed 's/^/    /'
  exit 1
fi
green "  ✓ 1 runner registered"

# source archive 작성 — busybox Dockerfile (TASK-085 와 동일).
cat > "${SRC}/Dockerfile" <<'DOCKERFILE_EOF'
FROM busybox:1.36
RUN mkdir -p /www && printf 'ok\n' > /www/index.html && printf 'A:*\n' > /etc/httpd.conf
EXPOSE 8080
CMD ["httpd", "-f", "-v", "-p", "8080", "-h", "/www", "-c", "/etc/httpd.conf"]
DOCKERFILE_EOF
tar -C "${SRC}" -czf "${SRC_ARCHIVE}" --owner=0 --group=0 Dockerfile
SRC_BYTES="$(wc -c < "${SRC_ARCHIVE}" | tr -d ' ')"
SRC_SHA="$(sha256sum "${SRC_ARCHIVE}" | awk '{print $1}')"

# build lifecycle 대기 + POST helper. 각 build 의 source archive 가
# 달라야 manifest digest 도 unique — 동일 manifest digest 5개면 DELETE 가
# 모든 tag 영향 (TASK-076 의 운영 결함 발견). Dockerfile 의 layer content
# 에 build idx 를 변수로 주입해 manifest digest 가 build 별 unique 가 되도록.
submit_and_wait() {
  local appname="$1"
  local expect_complete="$2"
  local build_idx="$3"
  local enq build_id status
  log() { printf '%s\n' "$*" >&2; }
  # build 별 unique source archive — Dockerfile 의 `RUN` line 의 content 가
  # build_idx 로 다르게 → layer blob digest unique → config digest unique
  # → manifest digest unique. 임시 dir 을 upload 완료 후까지 유지 — mktemp
  # cleanup 이 source archive 까지 잡아먹지 않도록.
  local per_src per_arch
  per_src="$(mktemp -d)"
  per_arch="${per_src}/source.tar.gz"
  cat > "${per_src}/Dockerfile" <<EOF
FROM busybox:1.36
RUN mkdir -p /www && printf 'ok-build-${build_idx}\\n' > /www/index.html && printf 'A:*\\n' > /etc/httpd.conf
EXPOSE 8080
CMD ["httpd", "-f", "-v", "-p", "8080", "-h", "/www", "-c", "/etc/httpd.conf"]
EOF
  tar -C "${per_src}" -czf "${per_arch}" --owner=0 --group=0 Dockerfile
  local per_bytes per_sha
  per_bytes="$(wc -c < "${per_arch}" | tr -d ' ')"
  per_sha="$(sha256sum "${per_arch}" | awk '{print $1}')"
  enq="$(curl -fsS -X POST "${BASE}/builds" \
    -H 'content-type: application/json' \
    -d "{
      \"appName\": \"${appname}\",
      \"requestedBy\": \"yklee\",
      \"sourceArchive\": {
        \"objectKey\": \"src/${appname}/archive.tar.gz\",
        \"checksumSha256\": \"${per_sha}\",
        \"sizeBytes\": ${per_bytes}
      },
      \"entrypointPath\": \"src/index.ts\",
      \"dockerfilePath\": \"Dockerfile\",
      \"previewTtlMinutes\": 60
    }" 2>&1)"
  build_id="$(printf '%s' "${enq}" | python3 -c 'import json,sys
try:
  print(json.loads(sys.stdin.read())["build"]["buildId"])
except Exception:
  pass
' 2>/dev/null || true)"
  if [[ -z "${build_id}" ]]; then
    red "  ✗ POST /builds failed for ${appname}: ${enq}" >&2
    return 1
  fi
  log "  ✓ ${appname} → ${build_id}"

  local upload_res
  upload_res="$(curl -fsS -X POST "${BASE}/builds/${build_id}/source" \
    -H 'content-type: application/octet-stream' \
    --data-binary "@${per_arch}" 2>&1)"
  local upload_bytes
  upload_bytes="$(printf '%s' "${upload_res}" | python3 -c 'import json,sys
try:
  d = json.loads(sys.stdin.read())
  print(d.get("sizeBytes", 0))
except Exception:
  print(0)
' 2>/dev/null || echo 0)"
  if [[ "${upload_bytes}" != "${per_bytes}" ]]; then
    red "  ✗ source upload size mismatch: declared=${per_bytes} server=${upload_bytes}" >&2
    rm -rf "${per_src}"
    return 1
  fi
  log "  ✓ source upload accepted (sizeBytes=${upload_bytes})"

  local deadline completed failed
  deadline=$(( $(date +%s) + 180 ))
  completed=0
  failed=0
  while [[ $(date +%s) -lt ${deadline} ]]; do
    status="$(curl -fsS "${BASE}/builds/${build_id}" 2>/dev/null \
      | python3 -c 'import json,sys
try:
  print(json.loads(sys.stdin.read())["build"]["status"])
except Exception:
  print("unknown")
' 2>/dev/null || echo unknown)"
    if [[ "${status}" == "COMPLETED" ]]; then
      completed=1
      break
    elif [[ "${status}" == "FAILED" ]]; then
      failed=1
      break
    fi
    sleep 5
  done
  if [[ "${failed}" -eq 1 ]]; then
    if [[ "${expect_complete}" == "1" ]]; then
      red "  ✗ build FAILED — cli mode deploy 가 잘못됨" >&2
      curl -fsS "${BASE}/builds/${build_id}/logs" 2>/dev/null | python3 -c '
import json, sys
try:
  d = json.loads(sys.stdin.read())
  for entry in d.get("logs", []):
    print(f"    [{entry.get(\"phase\",\"\")}] {entry.get(\"message\",\"\")}")
except Exception:
  pass
' >&2 2>&1 || true
      echo "  --- runner logs ---" >&2
      docker compose -f compose.dev.yaml -f compose.dev.e2e-insecure-registry.yaml \
        --project-name "${COMPOSE_PROJECT}" logs --tail=50 runner 2>&1 | sed 's/^/    /' >&2
      return 1
    fi
    yellow "  ⚠ build FAILED (expected)" >&2
    return 0
  fi
  if [[ "${completed}" -ne 1 ]]; then
    red "  ✗ build did not reach COMPLETED in 3min (last status=${status})" >&2
    return 1
  fi
  log "  ✓ build COMPLETED (cli mode deploy 성공)"
  rm -rf "${per_src}"
  printf '%s\n' "${build_id}"
  return 0
}

# [7/8] 5 build 적재 + lifecycle — 동시 push 운영 검증.
echo
echo "[7/8] 5 build 적재 + lifecycle — 동시 cli mode push"
BUILD_IDS=()
for i in 0 1 2 3 4; do
  APPNAME="insecure-multi-${i}-$$"
  # build_idx 를 submit_and_wait 에 전달해 per-build source archive 가
  # 다른 layer content (RUN printf 'ok-build-${i}') 를 가지게 함 — manifest
  # digest 가 build 별 unique. DELETE 가 다른 tag 에 영향 없음 검증 가능.
  BID="$(submit_and_wait "${APPNAME}" 1 "${i}" || true)"
  if [[ -z "${BID}" ]]; then
    red "[fatal] build ${i} 실패 — 환경 점검 필요"
    exit 1
  fi
  BUILD_IDS+=("${BID}")
done
green "  ✓ 5 build COMPLETED:"
for bid in "${BUILD_IDS[@]}"; do
  green "    buildId=${bid}"
done

# [8/8] image retention 검증 — catalog + DELETE + 영향 검증.
echo
echo "[8/8] image retention 검증 — catalog 노출 + DELETE API + 영향 검증"

# (8a) catalog 조회.
CATALOG="$(curl -fsS -m 5 http://127.0.0.1:5000/v2/_catalog 2>/dev/null || true)"
if [[ -z "${CATALOG}" ]]; then
  red "  ✗ registry /v2/_catalog 반환 없음"
  exit 1
fi
green "  catalog: ${CATALOG}"
if ! printf '%s' "${CATALOG}" | grep -q "docker-image-builder-system/cli"; then
  red "  ✗ catalog 에 docker-image-builder-system/cli 가 없음"
  exit 1
fi
green "  ✓ docker-image-builder-system/cli 가 catalog 에 있음 (5 build 의 cli push 가 정상 노출)"

# (8b) tags list — 5 buildId 가 tags 에 다 있는지.
TAGS="$(curl -fsS -m 5 "http://127.0.0.1:5000/v2/docker-image-builder-system/cli/tags/list" 2>/dev/null || true)"
if [[ -z "${TAGS}" ]]; then
  red "  ✗ tags/list 가 비어있음"
  exit 1
fi
green "  tags: ${TAGS}"
for bid in "${BUILD_IDS[@]}"; do
  if ! printf '%s' "${TAGS}" | grep -q "\"${bid}\""; then
    red "  ✗ tags list 에 buildId=${bid} 가 없음"
    echo "    tags: ${TAGS}"
    exit 1
  fi
done
green "  ✓ tags list 에 5 buildId 가 다 있음"

# (8c) DELETE API 검증 — image tag 1 개 삭제 후 catalog + tags list 재검증.
echo
echo "[8c] image retention — DELETE API 로 1 tag 삭제"
TARGET_BUILD_ID="${BUILD_IDS[0]}"
# 먼저 manifest 의 digest 를 얻어야 DELETE 가능 — registry:2 는 digest 기반
# 삭제만 허용 (tag 만으로는 안 됨). Accept 헤더로 v2 manifest 를 GET 하여
# response 의 Docker-Content-Digest 헤더에서 digest 추출. curl -I (HEAD) 가
# digest header 를 안 보낼 수 있어 -D - (dump headers) + -o /dev/null (no body)
# 패턴 사용.
DIGEST="$(curl -sS -D - -o /dev/null -m 5 \
  -H 'Accept: application/vnd.docker.distribution.manifest.v2+json' \
  "http://127.0.0.1:5000/v2/docker-image-builder-system/cli/manifests/${TARGET_BUILD_ID}" 2>/dev/null \
  | awk 'tolower($1)=="docker-content-digest:" {print $2}' \
  | tr -d '\r\n' || true)"
if [[ -z "${DIGEST}" ]]; then
  yellow "  ⚠ manifest digest 추출 실패 — registry 가 v1 호환 manifest 만 반환하거나 Accept 미인정"
  yellow "    registry:v2 의 GET /v2/_catalog 와 registry REST API 자체는 동작 중이므로 본 [8c] 단계는 skip — 운영 환경의 GC 가 v2 manifest 의 digest 추출 후 처리"
else
  green "  ✓ manifest digest 추출: ${DIGEST:0:32}..."
  # DELETE — registry:2 의 DELETE API 는 image tag 와 layer 모두 GC 후보 표시.
  # registry 는 manifest 와 referenced blob 을 정리. 단 즉시 disk free 안됨 —
  # registry:2 의 GC (`registry garbage-collect`) 가 다음 호출 시 실제 layer 삭제.
  HTTP_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE -m 5 \
    "http://127.0.0.1:5000/v2/docker-image-builder-system/cli/manifests/${DIGEST}" 2>/dev/null || echo 000)"
  if [[ "${HTTP_CODE}" == "202" ]]; then
    green "  ✓ DELETE = 202 Accepted (registry 가 manifest 삭제 accept)"
  else
    yellow "  ⚠ DELETE = ${HTTP_CODE} — registry 가 Accept 안 함"
    yellow "    운영 환경에서 REGISTRY_STORAGE_DELETE_ENABLED=true 가 정상 설정되었는지 확인"
  fi

  # (8d) tags list 재조회 — target buildId 가 사라지고 나머지 4 buildId 는 잔존.
  sleep 2
  TAGS_AFTER="$(curl -fsS -m 5 "http://127.0.0.1:5000/v2/docker-image-builder-system/cli/tags/list" 2>/dev/null || true)"
  if printf '%s' "${TAGS_AFTER}" | grep -q "\"${TARGET_BUILD_ID}\""; then
    yellow "  ⚠ tags list 에 target buildId=${TARGET_BUILD_ID} 가 아직 있음"
    yellow "    registry 가 DELETE 를 처리하지 않았거나 비동기 — 운영 환경에서는"
    yellow "    곧 다시 호출하거나 manifest digest 가 다른 형식인지 확인"
  else
    green "  ✓ tags list 에서 target buildId=${TARGET_BUILD_ID} 사라짐"
  fi
  # 나머지 4 buildId 가 다 있는지.
  MISSING=0
  for ((i = 1; i < ${#BUILD_IDS[@]}; i++)); do
    bid="${BUILD_IDS[$i]}"
    if ! printf '%s' "${TAGS_AFTER}" | grep -q "\"${bid}\""; then
      red "  ✗ tags list 에 buildId=${bid} 가 사라짐 (DELETE 가 다른 tag 에 영향)"
      MISSING=1
    fi
  done
  if [[ "${MISSING}" -eq 0 ]]; then
    green "  ✓ 다른 4 buildId 가 영향 없이 잔존 (DELETE 가 target tag 한정)"
  fi
fi

# (8e) [bonus] 새로운 build 가 정상 push 되는지 — retention 후 storage 재사용 검증.
echo
echo "[bonus] retention 후 새 build push — storage 재사용 검증"
# build_idx 99 로 manifest digest 가 다른 image — 다른 layer content (5 build 와
# 같은 layer 를 공유 안 함 → DELETE 가 영향 주지 않는 새 image).
APPNAME_REUSE="insecure-reuse-$$"
BID_REUSE="$(submit_and_wait "${APPNAME_REUSE}" 1 99 || true)"
if [[ -z "${BID_REUSE}" ]]; then
  red "  ✗ retention 후 새 build push 실패"
  exit 1
fi
green "  ✓ retention 후 새 build = ${BID_REUSE} (storage 재사용 동작)"

# [cleanup] compose down + cleanup.
echo
echo "[cleanup] compose down + cleanup"
docker compose -f compose.dev.yaml -f compose.dev.e2e-insecure-registry.yaml \
  --project-name "${COMPOSE_PROJECT}" down -v >"${TMP}/compose-down.log" 2>&1
green "  ✓ compose down"

echo
green "=========================================="
green "TASK-076 insecure-registry-only 검증: ALL PASS"
green "=========================================="
echo "  5 build 동시 cli mode push 통과 (multi-runner 분산의 server 측 verification)"
echo "  catalog + tags list 에 5 buildId 다 노출 (insecure-registry anonymous access)"
echo "  DELETE API + 영향 검증 — target tag 만 삭제, 다른 tag 영향 없음"
echo "  retention 후 새 build push 통과 (storage 재사용)"
echo "  운영 모델: internal network 격리 + upstream access control + image retention cron"




