# CI 통합 (TASK-149)

- 문서 목적: PR 단계가 아니라 nightly / main push / 수동 트리거에 도는 **B층 가드(실브라우저) + 문서 무결성 가드** 의 운영 통합 — compose 스택, 워크플로, 트리거 정책, 한계.
- 범위: `compose.ci.yaml` / `compose.ci.postgres.yaml` / `scripts/run-b-layer-guards.sh` / `.github/workflows/nightly-b-layer.yml` + 기존 `docker-build.yml` 과의 역할 분담
- 대상 독자: 개발자, AI agent, 운영자
- 상태: stable
- 최종 수정일: 2026-07-22
- 관련 문서: [B층 가드 오버레이 확장](b-layer-overlay-extension-2026-07-22.md), [테마별 시각 회귀 가드](theme-contrast-guard-2026-07-21.md), [PROJECT_PROFILE](../PROJECT_PROFILE.md)

## 1. 왜 하는가

TASK-133 / TASK-145 / TASK-146 / TASK-148 의 B층 가드 두 종류와 TASK-131 의 문서 무결성 가드는 모두 **앱이 떠 있어야 하거나 git history 가 필요한** 검사다. PR 단계에 끼우면 매 PR 마다 `pnpm install` + `vite build` + `node dist/index.js` + (B층의 경우) Chrome 설치·구동까지 기다려야 해서 PR 시간이 길어진다.

그래서 두 개의 분리로 운영한다.

| 구분 | 가드 | 트리거 | CI 의존성 |
|---|---|---|---|
| **정적 / 빠름** | `tsc 5 packages` / `vitest 277` / `node --test 178` / `go test 8/8` / `docs 무결성 staged` | PR + main push | 도커 불요 |
| **실측 / 느림** | B층 대비 / B층 CSS 유출 / `docs 무결성 --range` | nightly + nightly-b-layer 관련 main push + 수동 | 도커 + Chrome |

정적 가드는 기존 `docker-build.yml` (PR + main push). 실측 가드는 본 TASK 의 `nightly-b-layer.yml` (nightly + main push + 수동).

## 2. compose 스택

### 2.1 `compose.ci.yaml` (default: memory backend)

- `build-server` — `node:22-bookworm-slim` + pnpm install + build-server build + tsx 실행. `/health` 통과 시 healthy.
- `guard` — `mcr.microsoft.com/playwright:v1.55.0-jammy`. Chrome + Playwright 가 들어있는 베이스 이미지. `build-server` healthy 가 될 때까지 대기 후 `sleep infinity`. 가드 스크립트는 `docker compose exec -T guard` 로 호출.
- `postgres` — `--profile postgres` 시에만 활성 (postgres:18-alpine). DB `dibs/dibs/dibs` + healthcheck.
- 볼륨: named volume 4종 — `build-server-node-modules` / `build-server-pnpm-store` / `build-monitor-node-modules` / `ci-postgres-data`. 매 실행마다 `down -v` 로 정리.

**중요한 결정**: 호스트 docker socket 을 mount 하지 않는다. CI 환경(GitHub Actions ubuntu-latest) 에서 docker-in-docker 가 필요해지므로 self-dogfood runner 를 띄우지 않고, 가드 목적(SPA + build-server 의 실브라우저 감사) 에만 집중.

### 2.2 `compose.ci.postgres.yaml` (override)

- postgres profile + override. `build-server` 의 `BUILD_REPOSITORY_BACKEND=postgres`, `DATABASE_URL`, `DB_AUTO_BOOTSTRAP=true` 주입.
- 사용: `docker compose -f compose.ci.yaml --profile postgres -f compose.ci.postgres.yaml up -d`.

### 2.3 사용법 (로컬 dry-run)

```bash
# 1) memory backend 로 띄우기
docker compose -f compose.ci.yaml up -d

# 2) build-server healthy 까지 대기 (compose healthcheck 가 자동 처리)
docker compose -f compose.ci.yaml ps

# 3) 가드 실행
docker compose -f compose.ci.yaml exec -T guard \
  bash /workspace/scripts/run-b-layer-guards.sh

# 4) 정리
docker compose -f compose.ci.yaml down -v
```

## 3. 가드 wrapper: `scripts/run-b-layer-guards.sh`

세 가드를 직렬 실행하고 종료 코드 / 소요 시간을 요약한다.

1. 환경 점검 — node, Chrome, 가드 스크립트 존재, `CI_BASE_URL/health` 응답.
2. B층 대비 가드 (`check-theme-contrast.mjs`) — `--url $CI_BASE_URL`.
3. B층 CSS 유출 가드 (`check-css-leak.mjs`) — `--url $CI_BASE_URL`.
4. 문서 무결성 가드 (`check-doc-integrity.sh --range main..HEAD`) — guard container 에 `.git` 까지 mount 돼야 함.
5. 종료 코드 / 소요 시간 요약.

**fail-open vs fail-fast**: wrapper 는 첫 실패에서 멈추지 않고 모든 가드를 끝까지 돌린다. 한 가드의 실패가 다른 가드를 가리는 일을 막기 위함.

## 4. GitHub Actions: `nightly-b-layer.yml`

| 트리거 | backend | 비고 |
|---|---|---|
| `cron: 0 3 * * *` (매일 UTC 03:00) | memory | 기본 nightly |
| main push (관련 경로만) | memory | compose / 가드 / build-monitor src 변경 시 |
| `workflow_dispatch` (수동) | memory / postgres 선택 | 운영자가 postgres 회귀 검증 시 사용 |

`paths` 필터로 compose / 가드 / build-monitor src 가 바뀐 main push 만 trigger. 무관한 PR 이 main 에 머지돼도 안 돈다.

`concurrency: nightly-b-layer-${{ github.ref }}, cancel-in-progress: true` 로 같은 ref 의 동시 실행은 이전 것을 취소.

PR 단계가 아닌 워크플로이므로 `docker-build.yml` 과 **완전히 분리** — PR 시간에 영향 0.

## 5. 운영 주의

### 5.1 실측 가드의 본질적 한계

- **앱이 떠 있어야** 한다. CI 환경에서 build-server 가 90 초 안에 healthy 가 안 되면 워크플로가 실패한다. `compose.ci.yaml` 의 healthcheck 가 `start_period: 60s, retries: 30, interval: 5s` 라 최대 90 초.
- **Chrome 이 설치돼 있어야** 한다. `mcr.microsoft.com/playwright:v1.55.0-jammy` 이미지에 포함돼 있어 별도 설치 불요.
- **playwright 번들 chromium 은 우리 네트워크에서 CDN ETIMEDOUT**. 그래서 `channel: "chrome"` 으로 설치된 Chrome 을 구동 (TASK-132/133 에서 확립된 방식).
- **Postgres profile 의 bootstrap 시간** — `applyMigrations` 가 schema 0001~0006 + `DB_AUTO_BOOTSTRAP=true` 자동 적용. CI 에선 memory 가 default 라 nightly 에선 보통 안 거치지만, 수동으로 postgres 트리거 시 schema 가 깨져있으면 fail.

### 5.2 실패 시 후속

- nightly 가드 실패 시 워크플로가 자동 exit 1. 사후 알림(Issue / Slack) 자동화는 후속 결정 — 본 TASK 의 범위 밖.
- 운영자는 로그를 보고 (a) main push 인지 (b) 외부 환경 변화(예: Astryx 새 버전) 인지 (c) 우리 코드 회귀인지 분류. (a/c) 면 hotfix, (b) 면 운영 가드 설정 검토.

### 5.3 비용

- GitHub Actions ubuntu-latest (분당 1달러 미만, public repo 면 무료). 매 PR 마다 돌면 비용 폭증하지만 본 TASK 는 nightly + main push + 수동만이라 **PR 비용 영향 0**.
- 컨테이너 빌드 캐시(`--frozen-lockfile` + pnpm store named volume) 로 2 회차부터는 install + build 시간이 ~2 분으로 줄어든다.

## 6. 후속 결정 (TASK-149 의 범위 밖)

- **사후 알림 자동화** — nightly 실패 시 Issue 자동 생성 / Slack webhook.
- **PR 단계 일부 opt-in** — B층 가드 중 가벼운 일부(예: login 한 라우트만) 를 PR 에 끼워 빠르게 잡는 절충안.
- **Postgres backend 자동 nightly** — 매주 1 회 같은 정기 schedule 로 postgres 도 같이 돌려 cross-backend 회귀 가드.
- **`docs/PROJECT_PROFILE.md` §3 의 §3.x** 에 본 통합 단일 출처 항목 추가.

## 7. 한 줄 요약

PR 단계 = 정적 가드만 (`docker-build.yml`). 그 외 = 실측 가드 (`nightly-b-layer.yml` + `compose.ci*.yaml` + 가드 wrapper). 역할 분리 완료.
