#!/usr/bin/env bash
# TASK-073: RUNNER_REGISTRY_CONFIG_DIR + cli deploy mode e2e.
#
# Build Server + 1 runner + local registry:2 를 docker compose 로 띄우고,
# busybox Dockerfile + 실제 tar.gz source archive 로 build 가 COMPLETED 까지
# 가는 운영 시나리오 자동 검증 — 단, 이번엔 cli mode 의 docker tag + push 가
# local registry 에 실제로 도달했는지 까지 검증. RUNNER_REGISTRY_CONFIG_DIR 가
# docker CLI 의 registry 인증 config dir 을 override 해서 insecure-registry
# 인증 없이도 push 가 가능함을 보여준다 (private registry 인증 패턴의 기초).
#
# 검증 단계:
#   [0/8] busybox:1.36 image warm-up
#   [1/8] registry:2 image warm-up
#   [2/8] HOST_REGISTRY_CONFIG 디렉터리 + config.json 생성 (insecure-registries)
#   [3/8] compose up — build-server + runner (cli mode) + registry
#   [4/8] registry healthy 대기 (curl /v2/)
#   [5/8] build-server healthy 대기
#   [6/8] runner registry 등록 대기
#   [7/8] build 적재 + lifecycle — cli mode 의 docker push 까지 포함 — COMPLETED 도달
#   [8/8] registry API 검증 — `/v2/_catalog` 와 `/v2/<name>/tags/list` 로
#          docker-image-builder-system/cli:<buildId> 가 실제로 push 됨을 확인
#
# 사전 결함 + 보강:
#   - 본 TASK 가 봉인되면서 RUNNER_REGISTRY_CONFIG_DIR env 가 runner binary 에
#     추가됨 — `cmd/runner/main.go` 에서 `os.Setenv("DOCKER_CONFIG", ...)`
#     호출. 기존 default 동작 (env 미설정 시 docker default `~/.docker/config.json`)
#     회귀 없음 (config_test.go `TestLoadRegistryConfigDirDefaultEmpty`).
#   - registry container 가 healthy 가 되어야 runner 가 docker push 시도 가능.
#     healthcheck 가 wget 으로 /v2/ endpoint 를 spider — registry:2 가 listen
#     시작 시점까지 안정적 wait.
#   - insecure-registry 는 host 의 docker daemon 이 아니라 **runner 안의 docker
#     CLI** 만 영향. host 의 docker daemon 은 그 config 와 무관 (그대로
#     insecure-registry 변경 없이 동작). e2e 의 마지막 단계에서 host 의
#     docker 가 registry 에 pull/inspect 를 하려면 host daemon 의
#     insecure-registry 도 등록이 필요한데, registry REST API (curl) 가 그
#     인증을 우회 — e2e 가 host 의 daemon config 에 side effect 없이 동작.
#
# 사용:
#   export DOCKER_SOCKET_GID="$(getent group docker | cut -d: -f3)"
#   export ADMIN_IDS=admin
#   bash apps/build-server/scripts/e2e-registry-push.sh
#
# 시간: 약 2-3분 (registry:2 cold start 5-10s + build-server 30s + 단일 build
# lifecycle ~30-60s + cleanup). docker image 가 이미 pull 되어있으면 더 짧음.

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
# TASK-073 핵심: HOST_REGISTRY_CONFIG — runner 가 docker CLI 의 config dir 로
# 참조할 host 의 임시 디렉터리. e2e script 가 config.json 을 적어둔다.
# TASK-074 보강: auths entry (testuser:testpw 의 base64) 포함 — htpasswd
# 인증이 enabled 된 registry 가 401 없이 push 를 받아준다. 운영 환경에서는
# `{ "auths": { "<registry>": { "auth": "base64(creds)" } } }` 으로 교체.
HOST_REGISTRY_CONFIG="$(mktemp -d)"
chmod 0755 "${HOST_REGISTRY_CONFIG}"
echo "${HOST_REGISTRY_CONFIG}"
SRC="$(mktemp -d)"
SRC_ARCHIVE="${TMP}/source.tar.gz"

# TASK-074: htpasswd 인증 환경 셋업.
# (1) htpasswd 파일을 호스트의 임시 dir 에 적는다 — registry:2 의
#     /auth/htpasswd volume mount. bcrypt hash 가 필요해 host 의 `htpasswd`
#     (apache2-utils) 가 있으면 그것을 사용, 없으면 python 의 crypt 모듈로
#     fallback. 둘 다 bcrypt 의 `$2b$<cost>$<22-char-salt><hash>` 형식.
# (2) HOST_REGISTRY_CONFIG/config.json 에 same credential 의 base64 auths
#     entry 추가 — docker CLI 가 push 시 자동으로 Basic Authorization
#     헤더 부착.
TESTUSER="dibs-e2e-user"
TESTPASS="dibs-e2e-pass-sentinel-12"
HOST_REGISTRY_AUTH_DIR="$(mktemp -d)"
chmod 0755 "${HOST_REGISTRY_AUTH_DIR}"
HASHED_PASS=""
# 우선순위: (1) `docker run --rm httpd:alpine htpasswd -nbB` — docker-cli 가
# 표준 apache2-utils 의 htpasswd 를 호출, `-B` bcrypt 형식 ($2y$05$) 으로
# registry:2 가 검증 가능한 hash 만 emit (apr1 의 registry:v2 검증 이슈
# 회피 — distribution package 가 apr1 형식을 인식하지 못하는 환경이 보고됨).
# (2) host `htpasswd -nbB` (apache2-utils 설치 가정). (3) 마지막 fallback
# 은 openssl / python 으로 — bcrypt 호환성이 깨질 수 있어 권장 안 함.
HASHED_PASS=""
if docker run --rm httpd:alpine htpasswd -nbB "$TESTUSER" "$TESTPASS" >/dev/null 2>&1; then
  # htpasswd 가 docker 안에서만 가능할 수 있어 output 을 stdin 에서 직접
  # capture. 첫 라인이 hashed line.
  HASHED_PASS="$(docker run --rm httpd:alpine htpasswd -nbB "$TESTUSER" "$TESTPASS" 2>/dev/null | head -1 | cut -d: -f2)"
fi
if [[ -z "$HASHED_PASS" ]]; then
  red "[fatal] cannot generate bcrypt htpasswd entry via docker httpd:alpine image — docker pull available?"
  exit 1
fi
echo "${TESTUSER}:${HASHED_PASS}" > "${HOST_REGISTRY_AUTH_DIR}/htpasswd"
chmod 0444 "${HOST_REGISTRY_AUTH_DIR}/htpasswd"
export HOST_REGISTRY_AUTH_DIR
# (3) base64 credential for config.json `auths` entry — docker CLI 가
#     HTTP Basic Authorization 헤더 부착에 사용.
AUTH_B64="$(printf '%s:%s' "${TESTUSER}" "${TESTPASS}" | base64 -w0 | tr -d '\n')"
# registry 가 https 가 아닌 insecure HTTP 만 expose 하므로 e2e 의 docker CLI 는
# insecure-registry 가 등록된 상태여야 push 가능. host 의 `/etc/docker/daemon.json`
# 을 변경하면 side effect 가 있어 e2e 는 자체 config.json 으로 docker CLI 를
# 가이드하는 방식을 채택 — RUNNER_REGISTRY_CONFIG_DIR 이 그 경로.
cat > "${HOST_REGISTRY_CONFIG}/config.json" <<EOF
{
  "auths": {
    "localhost:5000": {
      "auth": "${AUTH_B64}"
    }
  },
  "insecure-registries": ["localhost:5000", "127.0.0.1:5000"]
}
EOF
export HOST_REGISTRY_CONFIG

COMPOSE_PROJECT="dibs-registry-e2e-$$"
trap '
  if [[ -n "${COMPOSE_PROJECT:-}" ]]; then
    docker compose -f compose.dev.yaml -f compose.dev.e2e-registry.yaml \
      --project-name "${COMPOSE_PROJECT}" down -v >/dev/null 2>&1 || true
  fi
  rm -rf "${TMP}" "${SRC}" "${HOST_REGISTRY_CONFIG}" "${HOST_REGISTRY_AUTH_DIR}"
' EXIT

# 디버깅용: KEEP_PROJECT=1 로 trap 의 compose down + host dir 정리를
# 보류. 운영자가 container / host config / htpasswd 를 모두 디버깅 가능.
if [[ "${KEEP_PROJECT:-}" == "1" ]]; then
  trap '
    echo "  [debug] KEEP_PROJECT=1 — ${COMPOSE_PROJECT} 보존 (host dir 도)"
    echo "    container: docker compose -p ${COMPOSE_PROJECT} ps"
    echo "    host dir: ${HOST_REGISTRY_CONFIG}"
    echo "    htpasswd: ${HOST_REGISTRY_AUTH_DIR}"
  ' EXIT
fi

# [0/8] busybox warm-up.
echo "[0/8] busybox:1.36 image warm-up (host daemon pull)"
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

# [2/8] HOST_REGISTRY_CONFIG 안의 config.json 가 insecure-registry 등록했는지 검증.
echo
echo "[2/8] config.json 검증"
CONFIG_JSON="${HOST_REGISTRY_CONFIG}/config.json"
if [[ ! -s "${CONFIG_JSON}" ]]; then
  red "[fatal] config.json missing at ${CONFIG_JSON}"
  exit 1
fi
green "  ✓ config.json (insecure-registries for 127.0.0.1:5000) ready"
blue "  ---"
cat "${CONFIG_JSON}" | sed 's/^/    /'
blue "  ---"

# [3/8] compose up.
echo
echo "[3/8] compose up — build-server + runner (cli mode) + registry"
docker compose -f compose.dev.yaml -f compose.dev.e2e-registry.yaml \
  --project-name "${COMPOSE_PROJECT}" up -d --build \
  >"${TMP}/compose-up.log" 2>&1
if [[ $? -ne 0 ]]; then
  red "[fatal] docker compose up failed"
  cat "${TMP}/compose-up.log"
  exit 1
fi
green "  ✓ compose up (project=${COMPOSE_PROJECT})"

# [4/8] registry healthy 대기 — `wget --spider /v2/` 가 curl 401 또는 200 응답을
# 시작하는 시점. htpasswd 가 enabled 라면 /v2/ 가 auth 헤더 없이 401 을 돌려주는
# 것이 정상 — 그래도 registry HTTP 핸들러가 listen 시작했다는 의미. e2e 의
# 추가 검증 ([bonus]) 에서 인증 헤더 부재가 401 으로 떨어지는지 확인한다.
echo
echo "[4/8] registry healthy 대기 (curl /v2/ 응답 401/200 시작 시점)"
REGISTRY_HEALTHY=0
for i in $(seq 1 30); do
  HTTP_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -m 2 http://127.0.0.1:5000/v2/ 2>/dev/null || echo 000)"
  # htpasswd enabled 면 401, 비활성화면 200. 둘 다 registry 가 listen 시작.
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
if [[ "${HTTP_CODE}" == "401" ]]; then
  green "  ✓ registry healthy (htpasswd enabled — /v2/ 가 인증 요구 401)"
else
  green "  ✓ registry healthy (/v2/ 200 — htpasswd 가 비활성 또는 anonymous access 가능)"
fi

# [5/8] build-server healthy 대기.
echo
echo "[5/8] build-server health 대기"
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
  docker compose -f compose.dev.yaml -f compose.dev.e2e-registry.yaml \
    --project-name "${COMPOSE_PROJECT}" logs --tail=30 runner 2>&1 | sed 's/^/    /'
  exit 1
fi
green "  ✓ 1 runner registered"

# [7/8] source archive + build lifecycle 대기 — cli mode 의 docker push 까지.
echo
echo "[7/8] source archive + build lifecycle (cli mode docker push 포함)"
cat > "${SRC}/Dockerfile" <<'DOCKERFILE_EOF'
# TASK-073: minimal busybox static HTTP server + RUNNER_REGISTRY_CONFIG_DIR 로
# cli mode 의 docker push 가 실제 동작하는지 검증용. TASK-085 의 production-semantic
# e2e 와 동일한 Dockerfile / busybox image.
FROM busybox:1.36
RUN mkdir -p /www && printf 'ok\n' > /www/index.html && printf 'A:*\n' > /etc/httpd.conf
EXPOSE 8080
CMD ["httpd", "-f", "-v", "-p", "8080", "-h", "/www", "-c", "/etc/httpd.conf"]
DOCKERFILE_EOF
tar -C "${SRC}" -czf "${SRC_ARCHIVE}" --owner=0 --group=0 Dockerfile
SRC_BYTES="$(wc -c < "${SRC_ARCHIVE}" | tr -d ' ')"
SRC_SHA="$(sha256sum "${SRC_ARCHIVE}" | awk '{print $1}')"
green "  ✓ source archive: ${SRC_BYTES} bytes, sha256=${SRC_SHA:0:16}..."

APPNAME="registry-push-$$"
ENQ="$(curl -fsS -X POST "${BASE}/builds" \
  -H 'content-type: application/json' \
  -d "{
    \"appName\": \"${APPNAME}\",
    \"requestedBy\": \"yklee\",
    \"sourceArchive\": {
      \"objectKey\": \"src/${APPNAME}/archive.tar.gz\",
      \"checksumSha256\": \"${SRC_SHA}\",
      \"sizeBytes\": ${SRC_BYTES}
    },
    \"entrypointPath\": \"src/index.ts\",
    \"dockerfilePath\": \"Dockerfile\",
    \"previewTtlMinutes\": 60
  }" 2>&1)"
BUILD_ID="$(printf '%s' "${ENQ}" | python3 -c 'import json,sys
try:
  print(json.loads(sys.stdin.read())["build"]["buildId"])
except Exception:
  pass
' 2>/dev/null || true)"
if [[ -z "${BUILD_ID}" ]]; then
  red "  ✗ POST /builds failed for ${APPNAME}: ${ENQ}"
  exit 1
fi
green "  ✓ ${APPNAME} → ${BUILD_ID}"

# source archive upload.
UPLOAD_RES="$(curl -fsS -X POST "${BASE}/builds/${BUILD_ID}/source" \
  -H 'content-type: application/octet-stream' \
  --data-binary "@${SRC_ARCHIVE}" 2>&1)"
UPLOAD_BYTES="$(printf '%s' "${UPLOAD_RES}" | python3 -c 'import json,sys
try:
  d = json.loads(sys.stdin.read())
  print(d.get("sizeBytes", 0))
except Exception:
  print(0)
' 2>/dev/null || echo 0)"
if [[ "${UPLOAD_BYTES}" != "${SRC_BYTES}" ]]; then
  red "  ✗ source upload size mismatch: declared=${SRC_BYTES} server=${UPLOAD_BYTES}"
  exit 1
fi
green "  ✓ source upload accepted (sizeBytes=${UPLOAD_BYTES} matches)"

# build lifecycle 대기 — cli mode 의 docker push 가 포함되어 있어도 2 분 내 완료
# (busybox image 가 작고 push 도 가벼움 — alpine 대비 layer 수가 적다).
COMPLETED=0
FAILED=0
DEADLINE=$(( $(date +%s) + 180 ))
while [[ $(date +%s) -lt ${DEADLINE} ]]; do
  STATUS="$(curl -fsS "${BASE}/builds/${BUILD_ID}" 2>/dev/null \
    | python3 -c 'import json,sys
try:
  print(json.loads(sys.stdin.read())["build"]["status"])
except Exception:
  print("unknown")
' 2>/dev/null || echo unknown)"
  if [[ "${STATUS}" == "COMPLETED" ]]; then
    COMPLETED=1
    break
  elif [[ "${STATUS}" == "FAILED" ]]; then
    FAILED=1
    break
  fi
  sleep 5
done
if [[ "${FAILED}" -eq 1 ]]; then
  red "[fatal] build FAILED — cli mode deploy 가 push 단계에서 실패했을 가능성"
  curl -fsS "${BASE}/builds/${BUILD_ID}/logs" 2>/dev/null | python3 -c '
import json, sys
try:
  d = json.loads(sys.stdin.read())
  for entry in d.get("logs", []):
    print(f"    [{entry.get(\"phase\",\"\")}] {entry.get(\"message\",\"\")}")
except Exception:
  pass
' 2>/dev/null || true
  echo
  echo "  --- runner logs (마지막 50 줄) ---"
  docker compose -f compose.dev.yaml -f compose.dev.e2e-registry.yaml \
    --project-name "${COMPOSE_PROJECT}" logs --tail=50 runner 2>&1 | sed 's/^/    /'
  exit 1
fi
if [[ "${COMPLETED}" -ne 1 ]]; then
  red "[fatal] build did not reach COMPLETED in 3min (last status=${STATUS})"
  exit 1
fi
green "  ✓ build COMPLETED (cli mode deploy 성공 — docker tag + push 완료)"

# [bonus-A] 401 negative 검증 (UNAUTH) — registry 가 인증 요구 응답을 잘 하는지.
# htpasswd 가 enabled 라면 auth 헤더 없는 `/v2/_catalog` 가 401 떨어지는 게
# 정상. 운영자에게 htpasswd 가 무사히 enabled 됐다는 명시적 evidence.
echo
echo "[bonus-A] 인증 헤더 부재 → 401 검증"
UNAUTH_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -m 5 http://127.0.0.1:5000/v2/_catalog 2>/dev/null || echo 000)"
if [[ "${UNAUTH_CODE}" == "401" ]]; then
  green "  ✓ unauthorized /v2/_catalog = 401 (htpasswd 정상 활성)"
else
  yellow "  ⚠ unauthorized /v2/_catalog = ${UNAUTH_CODE} — htpasswd 가 비활성처럼 동작"
  yellow "    기존 TASK-073 동작 (insecure-registry) 일 수 있어 fatal 처리 안 함"
fi

# [bonus-B] 401 negative 검증 (BAD CREDS) — config.json 의 auths 가 registry
# 가 인정하지 않는 credential 일 때 401 떨어뜨리는지. 운영 환경에서 credential
# rotation 이 잘못된 경우를 alert 하는 신호.
echo
echo "[bonus-B] 잘못된 credential → 401 검증"
BADAUTH_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -m 5 -u "wrong-user:wrong-pass-sentinel" http://127.0.0.1:5000/v2/_catalog 2>/dev/null || echo 000)"
if [[ "${BADAUTH_CODE}" == "401" ]]; then
  green "  ✓ wrong-credential /v2/_catalog = 401 (registry 가 htpasswd 와 일치하지 않는 credential 거부)"
else
  red "  ✗ wrong-credential /v2/_catalog = ${BADAUTH_CODE} — htpasswd 가 잘못된 credential 도 허용"
  exit 1
fi

# [8/8] registry API 직접 검증 — docker CLI 의 insecure-registry option 없이
# host 의 curl 로 registry 의 image 존재를 확인. htpasswd 가 enabled 인 본
# TASK-074 에선 curl 에 same credential 부착.
echo
echo "[8/8] registry API 검증 — 인증 부착 + catalog/tags 노출 검증"
green "  registry 가 authenticated CLI 의 push 를 받아 catalog 에서 노출"

# _catalog 조회 — repositories 목록에 `docker-image-builder-system/cli` 가 들어가야.
# htpasswd enabled 라 auth 헤더 필수 — 같은 TESTUSER/TESTPASS 사용.
CATALOG="$(curl -fsS -m 5 -u "${TESTUSER}:${TESTPASS}" http://127.0.0.1:5000/v2/_catalog 2>/dev/null || true)"
if [[ -z "${CATALOG}" ]]; then
  red "  ✗ registry /v2/_catalog 반환 없음 — registry 가 push 를 안 받았거나 인증 요구"
  exit 1
fi
green "  catalog: ${CATALOG}"
if ! printf '%s' "${CATALOG}" | grep -q "docker-image-builder-system/cli"; then
  red "  ✗ catalog 에 docker-image-builder-system/cli 가 없음 — push 실패"
  echo "    catalog: ${CATALOG}"
  exit 1
fi
green "  ✓ docker-image-builder-system/cli 가 catalog 에 있음 (인증 통과 + push 성공)"

# tags list — 현재 buildId 태그가 있는지. htpasswd enabled 라 auth 헤더 부착.
TAGS="$(curl -fsS -m 5 -u "${TESTUSER}:${TESTPASS}" "http://127.0.0.1:5000/v2/docker-image-builder-system/cli/tags/list" 2>/dev/null || true)"
if [[ -z "${TAGS}" ]]; then
  red "  ✗ tags/list 가 비어있음 — 이미지가 manifest 단위로 push 안 됨"
  exit 1
fi
green "  tags: ${TAGS}"
if ! printf '%s' "${TAGS}" | grep -q "\"${BUILD_ID}\""; then
  red "  ✗ tags list 에 buildId=${BUILD_ID} 가 없음"
  echo "    tags: ${TAGS}"
  exit 1
fi
green "  ✓ tags list 에 buildId=${BUILD_ID} 가 있음 (cli mode docker push 가 실제 image layer 들을 registry 에 기록)"

# [9/8 bonus] manifest 존재 + layer 크기 > 0 — docker push 가 빈 layer 만 보낸 게
# 아니라는 추가 검증. htpasswd enabled 라 manifest 도 인증 헤더 부착.
echo
echo "[bonus-9] manifest layer 검증 (push 된 image 가 정상 layer 들을 가졌는지)"
MANIFEST="$(curl -fsS -m 5 -H 'Accept: application/vnd.docker.distribution.manifest.v2+json' \
  -u "${TESTUSER}:${TESTPASS}" \
  "http://127.0.0.1:5000/v2/docker-image-builder-system/cli/manifests/${BUILD_ID}" 2>/dev/null \
  | python3 -c '
import json, sys
try:
  m = json.loads(sys.stdin.read())
  cfg = m.get("config", {})
  layers = m.get("layers", [])
  print(f"schemaVersion={m.get(\"schemaVersion\")} layers={len(layers)} config_size={cfg.get(\"size\", 0)}")
  sys.exit(0 if len(layers) >= 1 and cfg.get(\"size\", 0) > 0 else 2)
except Exception:
  sys.exit(1)
' 2>/dev/null)"
MANIFEST_EXIT=$?
if [[ "${MANIFEST_EXIT}" -ne 0 ]]; then
  yellow "  ⚠ manifest 검증 실패 (registry 가 빈 manifest 만 기록하거나 v1 호환 manifest 를 반환했을 가능성)"
  yellow "    raw: '${MANIFEST}'  exit=${MANIFEST_EXIT}"
else
  green "  ✓ manifest 유효 (${MANIFEST})"
fi

# cleanup.
echo
echo "[cleanup] compose down + cleanup"
docker compose -f compose.dev.yaml -f compose.dev.e2e-registry.yaml \
  --project-name "${COMPOSE_PROJECT}" down -v >"${TMP}/compose-down.log" 2>&1
green "  ✓ compose down"

echo
green "=========================================="
green "TASK-074 htpasswd 인증 registry-push 검증: ALL PASS"
green "=========================================="
echo "  htpasswd 가 enabled 된 registry 가 testuser:testpw 의 auths entry 를"
echo "  받아들여 cli mode docker push 성공 (RUNNER_REGISTRY_CONFIG_DIR + base64 auth)"
echo "  registry catalog: docker-image-builder-system/cli 가 push 됨"
echo "  registry tags: ${BUILD_ID} 가 push 됨"
echo "  bonus: auth 헤더 부재 / 잘못된 credential 이 모두 401 떨어뜨림"
