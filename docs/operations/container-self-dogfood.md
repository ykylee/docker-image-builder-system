# Container Self-Dogfood (TASK-078)

`docker-image-builder-system` 을 compose 로 띄워서 자체 시나리오를 그대로
수행하는 가이드. PR review 환경에서도 운영 환경과 동일한 흐름으로 validation
할 수 있도록 containerization.

## Quick Start

```bash
# 1) image build (root)
docker build -t dibs/build-server:dev -f Dockerfile .
docker build -t dibs/runner:dev -f apps/runner/Dockerfile .

# 2) compose up (memory backend)
DOCKER_SOCKET_GID=$(getent group docker | cut -d: -f3) \
  docker compose -f compose.dev.yaml up -d

# 3) 확인
docker compose -f compose.dev.yaml ps
curl -fsS http://127.0.0.1:3000/health
docker compose -f compose.dev.yaml logs runner --follow

# 4) tear down
docker compose -f compose.dev.yaml down -v
```

`DOCKER_SOCKET_GID` 가 host 의 docker group gid 와 일치해야 docker socket
R/W 가능. gid 조회 실패 시 999 fallback (대부분 우분투 계열 호스트에서는
실제 docker gid 로 덮어쓰지 않으면 동작 안 함 — 본인 환경에 맞춰 명시).

## Self-Dogfood 시나리오

### 1. Build Server 단독 시나리오 (memory backend)

```bash
BASE=http://127.0.0.1:3000

# Build server 엔드포인트들이 그대로 노출되는지 (TASK-075 단일 port reverse
# proxy 의 container 내 동작).
echo "1) health:"
curl -fsS $BASE/health

echo "2) OpenAPI:"
curl -fsS $BASE/openapi.json | jq '.paths | keys | length'   # → 16

echo "3) POST build (BuildRequest 양식 = scripts/smoke.sh 동일):"
APP="self-dogfood-$(date +%s)"
curl -fsS -X POST $BASE/builds -H "Content-Type: application/json" -d '{
  "requestedBy": "alice",
  "appName": "'$APP'",
  "sourceArchive": {"objectKey": "ref://github.com/example/repo", "checksumSha256": "0000000000000000000000000000000000000000000000000000000000000000", "sizeBytes": 12345},
  "entrypointPath": "src/index.ts",
  "dockerfilePath": "Dockerfile",
  "previewTtlMinutes": 30
}'

echo "4) GET build:"
curl -fsS $BASE/builds/<buildId>

echo "5) GET build list (memory backend 한정, container 갱신시 reset):"
curl -fsS $BASE/builds?limit=10

echo "6) Duplicate prevention:"
curl -sS -X POST $BASE/builds -H "Content-Type: application/json" -d '...' -w "HTTP %{http_code}\n"   # → 409

echo "7) Admin endpoints (allow-list 가드):"
curl -sS -o /dev/null -w "no header %{http_code}\n" $BASE/admin/builds                              # 401
curl -sS -o /dev/null -w "wrong id   %{http_code}\n" $BASE/admin/builds -H "X-Admin-Id: no"        # 403
curl -sS -o /dev/null -w "admin      %{http_code}\n" $BASE/admin/builds -H "X-Admin-Id: admin"     # 200
curl -sS -o /dev/null -w "yky.lee    %{http_code}\n" $BASE/admin/builds -H "X-Admin-Id: yky.lee"   # 200

echo "8) SPA (Build Monitor static):"
curl -fsS -o /dev/null -w "%{http_code} %{content_type}\n" $BASE/                                    # 200 text/html

echo "9) Swagger UI:"
curl -sS -o /dev/null -w "%{http_code}\n" $BASE/docs/                                              # 200
```

### 2. Build Server + Runner 통합 시나리오

`docker compose up -d` 가 둘 다 띄우면 runner 가 host docker 소켓을 공유해서
build/test/deploy 단계를 host 데몬에 RPC 호출한다.

```bash
echo "1) Runner 부팅 확인:"
docker compose -f compose.dev.yaml logs runner
# → "runner started: id=runner-compose-1 host=http://build-server:3000 poll=5s"

echo "2) Build 요청:"
APP="runner-dogfood-$(date +%s)"
RESP=$(curl -fsS -X POST http://127.0.0.1:3000/builds -H "Content-Type: application/json" -d '{
  "requestedBy": "compose-test",
  "appName": "'$APP'",
  "sourceArchive": {"objectKey": "ref://github.com/example/repo", "checksumSha256": "0000000000000000000000000000000000000000000000000000000000000000", "sizeBytes": 12345},
  "entrypointPath": "src/index.ts",
  "dockerfilePath": "Dockerfile",
  "previewTtlMinutes": 30
}')
BUILD_ID=$(echo "$RESP" | jq -r .build.buildId)
echo "  → buildId: $BUILD_ID"

echo "3) Runner 가 build 를 claim 하고 SOURCE_PREPARED 단계 까지 진행:"
sleep 6
docker compose -f compose.dev.yaml logs runner --tail=20
# → "processing build <id>"
# → "reported phase: phase=SOURCE_PREPARED"
# → source.Fetcher: download attempt 1 failed ... 404 (source 미업로드)
# → "reported phase: phase=FAILED"

echo "4) phase history 가 build server 메모리 backend 에 기록:"
curl -fsS http://127.0.0.1:3000/builds/$BUILD_ID | jq .build.status       # → "FAILED"
curl -fsS http://127.0.0.1:3000/builds/$BUILD_ID | jq '.phaseHistory[].phase'
# → ["QUEUE_CLAIMED","SOURCE_PREPARED","FAILED"]

echo "5) admin endpoint 에서도 동일 buildId 가 FAILED 로 노출:"
curl -fsS http://127.0.0.1:3000/admin/builds -H "X-Admin-Id: admin" | jq '.builds | length'
```

이는 실제 시나리오의 일부로 source archive 가 upload 되지 않아 source fetch
가 404 로 실패하는 상황까지를 실행해 본 것이다. source 가 있으면 runner 가
image build → container test → external deployment 단계를 진행한다. (실제
container 는 host docker 데몬에 spawn 되어 같은 호스트에서 동작.)

## PostgreSQL Backend

postgres backend + schema_migrations 자동 bootstrap 을 함께 검증하려면
`--profile postgres` 로 compose 실행.

```bash
docker compose -f compose.dev.yaml --profile postgres up -d
docker compose -f compose.dev.yaml exec postgres psql -U dibs -d dibs -c "\dt"
docker compose -f compose.dev.yaml logs build-server --tail  # applyMigrations 자동 적용 확인
```

## 알려진 한계 (TASK-078 PR 본문에서 정리)

1. **runtime image size 309MB** — node_modules 에 devDependencies 가 모두 포함.
   prod-only subset 분리(`pnpm deploy` / 별도 stage 분리)는 후속 TASK.
2. **runner 의 docker socket 공유** — host docker 데몬과 동등 권한. 운영
   환경에서는 rootless runner 또는 DinD 도입 권장. (본 compose 의 의도는
   self-dogfood — 운영 가이드 아님.)
3. **postgres profile 의 host 의존성 없음** — 정상 검증 가능.

## Resource Footprint (2026-07-06 검증 시점)

| Image                       | Size    | Memory (idle) | Memory (active) | Notes                  |
| --------------------------- | ------- | ------------- | --------------- | ---------------------- |
| `dibs/build-server:dev`     | 309 MB  | 36 MiB        | (1 build) ≤ 60  | Node 20-alpine base    |
| `dibs/runner:dev`           | 42.7 MB | 12 MiB        | (build 중) ≤ 60 | Alpine 3.20 + docker-cli |

## Follow-up (후속 TASK 후보)

- `pnpm deploy` 로 prod-only subset 분리 → build-server image 150 MB 이하 목표.
- runner DinD / rootless 모드 — host docker dependency 제거.
- Build Monitor 의 `.generated/openapi.d.ts` 를 CI 에서 build-server 의 live
  `/openapi.json` 으로 자동 갱신하는 workflow 추가 (현재는 repo commit 으로 운영).
- container image registry push workflow (ghcr.io 와 GitHub Actions).