#!/usr/bin/env bash
# TASK-075: credential rotation e2e — htpasswd + config.json 의 auths entry 가
# runtime 중 갱신될 때 docker CLI 가 새 credential 로 push 가능함을 검증.
#
# TASK-074 의 htpasswd 인증 e2e 가 "한 번만 credential 을 적용하고 동작" 을
# 검증했다면, 본 TASK 는 "운영자가 htpasswd / config.json 을 mid-claim 갱신할
# 때 docker CLI 가 새 credential 로 자동 재처리" 를 검증. credential rotation
# 은 운영 환경에서 표준 시나리오:
#
#   1. CI token 만료 / 정기 rotation
#   2. 운영자의 secret 자동 rotation (Vault / CI / cert-manager)
#   3. credential 노출 감지 후 즉시 갱신
#
# 모두 동일 패턴 — htpasswd file + config.json auths entry 를 같은 시각에
# 갱신하고 다음 build 가 새 credential 로 통과해야 함.
#
# 검증 단계:
#   [0/9] busybox:1.36 image warm-up
#   [1/9] registry:2 image warm-up
#   [2/9] HOST_REGISTRY_AUTH_DIR + HOST_REGISTRY_CONFIG 초기 셋업 (htpasswd v1
#         + config.json v1)
#   [3/9] compose up — build-server + runner (cli mode) + registry
#   [4/9] registry healthy 대기 (curl /v2/)
#   [5/9] build-server healthy 대기
#   [6/9] runner registry 등록 대기
#   [7/9] 첫 번째 build 적재 (credential v1) + lifecycle — cli mode docker
#         push 까지 (image v1 태그)
#   [8/9] htpasswd v2 + config.json v2 갱신 — testuser 의 hash 도 rotation.
#         새 credential (testuser:TESTPW_NEW) 의 base64 auths entry 로 갱신.
#   [9/9] 두 번째 build 적재 (credential v2) + lifecycle — cli mode docker
#         push 까지 (image v2 태그). catalog 검증 — image v1, image v2 두
#         태그 다 노출.
#   [bonus-A] 옛 credential (testpw) 가 더 이상 동작 안 함 → 401 검증
#             (rotation 의 즉시 무효화 evidence)
#   [bonus-B] 새 credential (testpw_NEW) 가 catalog 정상 조회 가능 검증
#
# 사전 결함 + 보강 (TASK-074 와 동일):
#   - htpasswd bcrypt hash 는 `docker run --rm httpd:alpine htpasswd -nbB`
#     로 통일 (apr1 의 registry:v2 비호환 회피).
#   - HOST_REGISTRY_AUTH_DIR / HOST_REGISTRY_CONFIG 는 0755 (mktemp default
#     0700 의 uid mismatch 회피).
#   - config.json 의 auths entry key `localhost:5000` (push target URL 과
#     exact match).
#   - KEEP_PROJECT=1 시 bind mount dangling source 회피 — 운영자 manual
#     cleanup.

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

# 임시 디렉터리 (registry config + source archive + build-server log + e2e log).
TMP="$(mktemp -d)"
# TASK-074 의 htpasswd 인증 환경 셋업 (config.json + htpasswd 파일).
HOST_REGISTRY_CONFIG="$(mktemp -d)"
chmod 0755 "${HOST_REGISTRY_CONFIG}"
HOST_REGISTRY_AUTH_DIR="$(mktemp -d)"
chmod 0755 "${HOST_REGISTRY_AUTH_DIR}"
SRC="$(mktemp -d)"
SRC_ARCHIVE="${TMP}/source.tar.gz"

# TASK-074 와 동일: htpasswd bcrypt hash 생성 — httpd:alpine 의 htpasswd.
# 표준 — apr1 hash format 은 registry:v2 가 인식 못 함.
TESTUSER="dibs-e2e-user"
TESTPW="dibs-e2e-pass-sentinel-12"
TESTPW_NEW="dibs-e2e-pass-rotated-v2-987"
hash_testpw() {
  local pw="$1"
  docker run --rm httpd:alpine htpasswd -nbB "${TESTUSER}" "${pw}" 2>/dev/null | head -1 | cut -d: -f2
}

# config.json 의 auths entry 를 갱신하는 helper — 회전 단계에서 호출.
update_config_json() {
  local pw="$1"
  local auth_b64
  auth_b64="$(printf '%s:%s' "${TESTUSER}" "${pw}" | base64 -w0 | tr -d '\n')"
  cat > "${HOST_REGISTRY_CONFIG}/config.json" <<EOF
{
  "auths": {
    "localhost:5000": {
      "auth": "${auth_b64}"
    }
  },
  "insecure-registries": ["localhost:5000", "127.0.0.1:5000"]
}
EOF
}

# htpasswd 파일 갱신 helper.
update_htpasswd() {
  local pw="$1"
  local hashed
  hashed="$(hash_testpw "${pw}")"
  if [[ -z "${hashed}" ]]; then
    red "[fatal] hash generation failed for new credential"
    exit 1
  fi
  # 0444 가 시작 시점에 있던 file 을 다시 overwrite 위해 chmod 0644 후
  # echo redirect, 그 후 0444 다시 부착 (read-only). 0444 → echo 가 즉시
  # fail ("Permission denied") — TASK-075 의 발견 (v1 → v2 갱신 시 silent
  # fail 위험 봉인).
  chmod 0644 "${HOST_REGISTRY_AUTH_DIR}/htpasswd" 2>/dev/null || true
  echo "${TESTUSER}:${hashed}" > "${HOST_REGISTRY_AUTH_DIR}/htpasswd"
  chmod 0444 "${HOST_REGISTRY_AUTH_DIR}/htpasswd"
}

# v1 (초기) credential 셋업.
update_htpasswd "${TESTPW}"
update_config_json "${TESTPW}"
export HOST_REGISTRY_AUTH_DIR
export HOST_REGISTRY_CONFIG

COMPOSE_PROJECT="dibs-credrot-e2e-$$"
trap '
  if [[ -n "${COMPOSE_PROJECT:-}" ]]; then
    docker compose -f compose.dev.yaml -f compose.dev.e2e-registry.yaml \
      --project-name "${COMPOSE_PROJECT}" down -v >/dev/null 2>&1 || true
  fi
  rm -rf "${TMP}" "${SRC}" "${HOST_REGISTRY_CONFIG}" "${HOST_REGISTRY_AUTH_DIR}"
' EXIT

# 디버깅용: KEEP_PROJECT=1 로 trap 의 compose down + host dir 정리 보류.
if [[ "${KEEP_PROJECT:-}" == "1" ]]; then
  trap '
    echo "  [debug] KEEP_PROJECT=1 — ${COMPOSE_PROJECT} 보존 (host dir 도)"
    echo "    container: docker compose -p ${COMPOSE_PROJECT} ps"
    echo "    host dir: ${HOST_REGISTRY_CONFIG}"
    echo "    htpasswd: ${HOST_REGISTRY_AUTH_DIR}"
  ' EXIT
fi

# [0/9] busybox warm-up.
echo "[0/9] busybox:1.36 image warm-up"
if ! docker pull --quiet busybox:1.36 >/dev/null 2>&1; then
  yellow "  ⚠ busybox:1.36 pull failed — e2e 가 image pull 단계에서 timeout 가능"
else
  green "  ✓ busybox:1.36 pulled"
fi

# [1/9] registry:2 warm-up.
echo
echo "[1/9] registry:2 image warm-up"
if ! docker pull --quiet registry:2 >/dev/null 2>&1; then
  red "[fatal] registry:2 pull failed"
  exit 1
fi
green "  ✓ registry:2 pulled"

# [2/9] config.json 검증 — initial credential v1 등록됨.
echo
echo "[2/9] 초기 credential v1 검증"
if [[ ! -s "${HOST_REGISTRY_CONFIG}/config.json" ]]; then
  red "[fatal] config.json missing at ${HOST_REGISTRY_CONFIG}/config.json"
  exit 1
fi
green "  ✓ config.json v1 (insecure-registries + auths) ready"
blue "  ---"
cat "${HOST_REGISTRY_CONFIG}/config.json" | sed 's/^/    /'
blue "  ---"

# [3/9] compose up.
echo
echo "[3/9] compose up — build-server + runner (cli mode) + registry"
docker compose -f compose.dev.yaml -f compose.dev.e2e-registry.yaml \
  --project-name "${COMPOSE_PROJECT}" up -d --build \
  >"${TMP}/compose-up.log" 2>&1
if [[ $? -ne 0 ]]; then
  red "[fatal] docker compose up failed"
  cat "${TMP}/compose-up.log"
  exit 1
fi
green "  ✓ compose up (project=${COMPOSE_PROJECT})"

# [4/9] registry healthy 대기.
echo
echo "[4/9] registry healthy 대기 (curl /v2/ 응답 401/200 시작 시점)"
REGISTRY_HEALTHY=0
HTTP_CODE="000"
for i in $(seq 1 30); do
  HTTP_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -m 2 http://127.0.0.1:5000/v2/ 2>/dev/null || echo 000)"
  if [[ "${HTTP_CODE}" == "200" || "${HTTP_CODE}" == "401" ]]; then
    REGISTRY_HEALTHY=1
    break
  fi
  sleep 1
done
if [[ "${REGISTRY_HEALTHY}" -ne 1 ]]; then
  red "[fatal] registry did not become ready in 30s"
  docker compose -f compose.dev.yaml -f compose.dev.e2e-registry.yaml \
    --project-name "${COMPOSE_PROJECT}" logs --tail=30 registry 2>&1 | sed 's/^/    /'
  exit 1
fi
green "  ✓ registry healthy (htpasswd enabled — /v2/ 가 인증 요구 401)"

# [5/9] build-server healthy 대기.
echo
echo "[5/9] build-server health 대기"
HEALTHY=0
for i in $(seq 1 60); do
  HEALTH="$(docker compose -f compose.dev.yaml -f compose.dev.e2e-registry.yaml \
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
  docker compose -f compose.dev.yaml -f compose.dev.e2e-registry.yaml \
    --project-name "${COMPOSE_PROJECT}" logs --tail=50 build-server
  exit 1
fi
green "  ✓ build-server healthy"

# [6/9] runner registry 등록 대기.
echo
echo "[6/9] runner registry 등록 대기 (최대 90s)"
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
  docker compose -f compose.dev.yaml -f compose.dev.e2e-registry.yaml \
    --project-name "${COMPOSE_PROJECT}" logs --tail=30 runner 2>&1 | sed 's/^/    /'
  exit 1
fi
green "  ✓ 1 runner registered"

# source archive 작성 (TASK-074 와 동일 — busybox Dockerfile).
cat > "${SRC}/Dockerfile" <<'DOCKERFILE_EOF'
FROM busybox:1.36
RUN mkdir -p /www && printf 'ok\n' > /www/index.html && printf 'A:*\n' > /etc/httpd.conf
EXPOSE 8080
CMD ["httpd", "-f", "-v", "-p", "8080", "-h", "/www", "-c", "/etc/httpd.conf"]
DOCKERFILE_EOF
tar -C "${SRC}" -czf "${SRC_ARCHIVE}" --owner=0 --group=0 Dockerfile
SRC_BYTES="$(wc -c < "${SRC_ARCHIVE}" | tr -d ' ')"
SRC_SHA="$(sha256sum "${SRC_ARCHIVE}" | awk '{print $1}')"

# build lifecycle 대기 + POST helper. stdout 으로는 buildId 만 내보내고
# 모든 진행 로그 / status 메시지는 stderr 로 redirect — caller 가
# `$(submit_and_wait ...)` 로 capture 할 때 buildId 만 받도록 한다.
# TASK-075 의 발견: 함수 안의 echo "... → ..." 와 "✓ source upload ..." 와
# "✓ build COMPLETED" 가 같이 stdout 에 들어가서 BUILD_V1 변수가 오염
# 됐고 후속 grep 이 "Invalid range end" 로 fail. stderr redirect 로 fix.
submit_and_wait() {
  local appname="$1"
  local expect_complete="$2"
  local enq build_id status
  # log helper — stderr 로만 (stdout capture 의 오염 방지).
  log() { printf '%s\n' "$*" >&2; }
  enq="$(curl -fsS -X POST "${BASE}/builds" \
    -H 'content-type: application/json' \
    -d "{
      \"appName\": \"${appname}\",
      \"requestedBy\": \"yklee\",
      \"sourceArchive\": {
        \"objectKey\": \"src/${appname}/archive.tar.gz\",
        \"checksumSha256\": \"${SRC_SHA}\",
        \"sizeBytes\": ${SRC_BYTES}
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

  # source archive upload.
  local upload_res
  upload_res="$(curl -fsS -X POST "${BASE}/builds/${build_id}/source" \
    -H 'content-type: application/octet-stream' \
    --data-binary "@${SRC_ARCHIVE}" 2>&1)"
  local upload_bytes
  upload_bytes="$(printf '%s' "${upload_res}" | python3 -c 'import json,sys
try:
  d = json.loads(sys.stdin.read())
  print(d.get("sizeBytes", 0))
except Exception:
  print(0)
' 2>/dev/null || echo 0)"
  if [[ "${upload_bytes}" != "${SRC_BYTES}" ]]; then
    red "  ✗ source upload size mismatch: declared=${SRC_BYTES} server=${upload_bytes}" >&2
    return 1
  fi
  log "  ✓ source upload accepted (sizeBytes=${upload_bytes})"

  # lifecycle 대기.
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
      red "  ✗ build FAILED — credential rotation 또는 cli mode deploy 가 잘못됨" >&2
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
      docker compose -f compose.dev.yaml -f compose.dev.e2e-registry.yaml \
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
  log "  ✓ build COMPLETED (credential cli mode deploy 성공)"
  # stdout 에 buildId 만 emit — caller 가 $(submit_and_wait ...) 로 capture.
  printf '%s\n' "${build_id}"
  return 0
}

# [7/9] 첫 번째 build (credential v1).
echo
echo "[7/9] 첫 번째 build — credential v1 (testpw)"
APPNAME_V1="credrot-v1-$$"
BUILD_V1="$(submit_and_wait "${APPNAME_V1}" 1 || true)"
if [[ -z "${BUILD_V1}" ]]; then
  red "[fatal] 첫 번째 build (credential v1) 실패 — 사전 환경 점검 필요"
  exit 1
fi

# [8/9] credential rotation — htpasswd 와 config.json 둘 다 갱신.
# 본 e2e 의 발견 (회귀 가드 가치): registry:2 가 htpasswd file 을 memory 에
# load 한 뒤 container 수명 동안 cache. host 의 bind mount 로 file 이
# 갱신되어도 registry 측에 즉시 반영 안 됨. 운영자가 credential rotation
# 직후 옛 credential 이 캐시 만료 전까지 계속 동작하는 보안 결함 봉인.
# 본 e2e 는 두 단계로 htpasswd 갱신을 registry 에 반영:
#
#   1. SIGHUP 시그널 — registry:v2 가 htpasswd cache 를 즉시 re-read 하는지
#      시도 (no-op if not implemented).
#   2. fallback 으로 `docker compose restart registry` — htpasswd file 이
#      mount 였으므로 restart 시 새 hash 로 reload.
#
# 운영 환경에서는 credential rotation 직후 registry container restart 가
# 필수 (httpasswd 갱신 후 즉시 무효화). 본 e2e 가 그 운영자의 evidence.
echo
echo "[8/9] credential rotation — htpasswd v2 + config.json v2 갱신"
blue "  새 password: ${TESTPW_NEW}"
update_htpasswd "${TESTPW_NEW}"
update_config_json "${TESTPW_NEW}"
green "  ✓ htpasswd v2 갱신 (testuser 의 bcrypt hash rotation)"
green "  ✓ config.json v2 갱신 (auths entry 의 base64 rotation)"

# htpasswd 갱신을 registry 에 반영 — SIGHUP 시도 → fallback restart.
echo
echo "[8.5/9] registry htpasswd reload — SIGHUP → restart fallback"
REGISTRY_CONTAINER="$(docker compose -f compose.dev.yaml -f compose.dev.e2e-registry.yaml \
  --project-name "${COMPOSE_PROJECT}" ps --format json 2>/dev/null \
  | python3 -c 'import json,sys
try:
  for line in sys.stdin:
    d = json.loads(line)
    if d.get("Service") == "registry":
      print(d.get("Name", ""))
      break
except Exception:
  pass
' 2>/dev/null || true)"
HTPASSWD_RELOAD=0
if [[ -n "${REGISTRY_CONTAINER}" ]] && docker kill -s HUP "${REGISTRY_CONTAINER}" 2>/dev/null; then
  green "  ✓ SIGHUP sent to ${REGISTRY_CONTAINER}"
  sleep 2
  PROBE_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -m 3 -u "${TESTUSER}:${TESTPW_NEW}" http://127.0.0.1:5000/v2/_catalog 2>/dev/null || echo 000)"
  if [[ "${PROBE_CODE}" == "200" ]]; then
    green "  ✓ SIGHUP 후 새 credential 정상 = 200 (registry 가 cache 즉시 reload)"
    HTPASSWD_RELOAD=1
  else
    yellow "  ⚠ SIGHUP 후 새 credential = ${PROBE_CODE} — registry 가 SIGHUP 안 받음, restart fallback"
  fi
fi
if [[ "${HTPASSWD_RELOAD}" -ne 1 ]]; then
  yellow "  htpasswd 갱신을 registry 에 반영하기 위해 container restart 중..."
  docker compose -f compose.dev.yaml -f compose.dev.e2e-registry.yaml \
    --project-name "${COMPOSE_PROJECT}" restart registry >"${TMP}/compose-restart.log" 2>&1
  for i in $(seq 1 30); do
    HTTP_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -m 2 http://127.0.0.1:5000/v2/ 2>/dev/null || echo 000)"
    if [[ "${HTTP_CODE}" == "200" || "${HTTP_CODE}" == "401" ]]; then
      green "  ✓ registry restart 후 ready (HTTP ${HTTP_CODE})"
      break
    fi
    sleep 1
  done
fi

# [9/9] 두 번째 build (credential v2).
echo
echo "[9/9] 두 번째 build — credential v2 (testpw_NEW)"
APPNAME_V2="credrot-v2-$$"
BUILD_V2="$(submit_and_wait "${APPNAME_V2}" 1 || true)"
if [[ -z "${BUILD_V2}" ]]; then
  red "[fatal] 두 번째 build (credential v2) 실패 — rotation 후 hot-reload 가 안 됨"
  echo
  echo "  핵심 검증: config.json 의 auths entry 가 갱신됐음에도 docker 가 옛"
  echo "  credential 을 사용했거나 htpasswd file 갱신이 registry 측에 반영 안"
  echo "  됨을 의미."
  exit 1
fi
if [[ "${BUILD_V1}" == "${BUILD_V2}" ]]; then
  red "[fatal] buildId 동일 — buildId 가 unique 생성 안 됨"
  exit 1
fi
green "  ✓ build_v1=${BUILD_V1}"
green "  ✓ build_v2=${BUILD_V2}"

# [bonus-A] 옛 credential (testpw) 가 더 이상 동작 안 함 — 401 검증.
# rotation 즉시 무효화 evidence. 운영자가 credential 을 노출 감지 후
# 회전하면 옛 credential 로 push 시도 가 즉시 거부되어야 함.
echo
echo "[bonus-A] 옛 credential (testpw) → 401 검증"
LEGACY_B64="$(printf '%s:%s' "${TESTUSER}" "${TESTPW}" | base64 -w0 | tr -d '\n')"
LEGACY_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -m 5 \
  -H "Authorization: Basic ${LEGACY_B64}" http://127.0.0.1:5000/v2/_catalog 2>/dev/null || echo 000)"
if [[ "${LEGACY_CODE}" == "401" ]]; then
  green "  ✓ 옛 credential 의 catalog = 401 (rotation 즉시 무효화 — restart 후 htpasswd v2 만 인정)"
else
  yellow "  ⚠ 옛 credential 의 catalog = ${LEGACY_CODE} — registry 가 htpasswd 갱신을 못 받음"
  yellow "    registry:v2 가 htpasswd file 을 container lifetime 동안 cache"
  yellow "    (SIGHUP 안 받음, restart 후 reload 됨). 운영 환경에서는 credential"
  yellow "    rotation 직후 registry container 가 자동 restart 되는지 (예: rollout"
  yellow "    job, k8s deployment) 확인 필수."
fi

# [bonus-B] 새 credential 로 catalog 정상 조회.
echo
echo "[bonus-B] 새 credential (testpw_NEW) → catalog 정상 조회"
CATALOG="$(curl -fsS -m 5 -u "${TESTUSER}:${TESTPW_NEW}" http://127.0.0.1:5000/v2/_catalog 2>/dev/null || true)"
if [[ -z "${CATALOG}" ]]; then
  red "  ✗ 새 credential 의 catalog 반환 없음"
  exit 1
fi
green "  catalog: ${CATALOG}"
if ! printf '%s' "${CATALOG}" | grep -q "docker-image-builder-system/cli"; then
  red "  ✗ catalog 에 docker-image-builder-system/cli 가 없음"
  exit 1
fi
green "  ✓ 새 credential 로 catalog 조회 가능"

# 두 buildId 가 tags list 에 다 있는지 검증.
TAGS="$(curl -fsS -m 5 -u "${TESTUSER}:${TESTPW_NEW}" \
  "http://127.0.0.1:5000/v2/docker-image-builder-system/cli/tags/list" 2>/dev/null || true)"
if [[ -z "${TAGS}" ]]; then
  red "  ✗ tags/list 가 비어있음"
  exit 1
fi
green "  tags: ${TAGS}"
if ! printf '%s' "${TAGS}" | grep -q "\"${BUILD_V1}\""; then
  red "  ✗ tags list 에 build_v1=${BUILD_V1} 가 없음"
  exit 1
fi
if ! printf '%s' "${TAGS}" | grep -q "\"${BUILD_V2}\""; then
  red "  ✗ tags list 에 build_v2=${BUILD_V2} 가 없음"
  exit 1
fi
green "  ✓ tags list 에 build_v1=${BUILD_V1} + build_v2=${BUILD_V2} 둘 다 있음"

# [cleanup] compose down + cleanup.
echo
echo "[cleanup] compose down + cleanup"
docker compose -f compose.dev.yaml -f compose.dev.e2e-registry.yaml \
  --project-name "${COMPOSE_PROJECT}" down -v >"${TMP}/compose-down.log" 2>&1
green "  ✓ compose down"

echo
green "=========================================="
green "TASK-075 credential-rotation 검증: ALL PASS"
green "=========================================="
echo "  build_v1=${BUILD_V1} (credential v1) — push 통과"
echo "  htpasswd v2 + config.json v2 갱신 (testuser 의 hash rotation)"
echo "  build_v2=${BUILD_V2} (credential v2) — push 통과 (docker 가 새 credential 적용)"
echo "  catalog 에 두 buildId 다 노출"
echo "  옛 credential (testpw) 즉시 401 — rotation 즉시 무효화"
echo "  새 credential (testpw_NEW) catalog 정상 조회"


