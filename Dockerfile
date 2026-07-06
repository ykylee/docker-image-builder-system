# syntax=docker/dockerfile:1.7
# =============================================================================
#  docker-image-builder-system — Build Server image
# =============================================================================
#  Self-dogfood 용 single-image build server. monorepo(pnpm workspace)
#  구조에서 build-server + build-monitor + 그 workspace dependencies
#  (shared-contract / shared-config / db) 를 multi-stage 로 빌드.
#
#  사용 예:
#    docker build -t dibs/build-server:dev -f Dockerfile .
#    docker run --rm -p 3000:3000 \
#      -e BUILD_REPOSITORY_BACKEND=memory \
#      -e ADMIN_IDS=admin,yky.lee \
#      -e BUILD_MONITOR_DIST_PATH=/app/apps/build-monitor/dist \
#      dibs/build-server:dev
#
#  health:
#    curl -fsS http://127.0.0.1:3000/health
#
#  알려진 한계 (self-dogfood 첫 PR; 후속 TASK):
#  1. runtime node_modules 에 devDependencies 포함됨 (image size 영향).
#     prod-only subset 분리하려면 별도 TASK (예: `pnpm deploy` 로 pnpm-deploy
#     방식 또는 `pnpm prune --prod` + layer 분리) — 사용자 후속 결정 시 적용.
#  2. prebuild `generate-openapi.ts` 가 live backend 를 fetch 하려 하나 Docker
#     build 환경엔 server 가 없음. `.generated/openapi.d.ts` 가 repo 에 commit
#     되어 있어 prebuild 가 cold cache 에서도 OK. runtime 은 backend 가 응답
#     하는 한 backend OpenAPI 와 sync 가정. (drift-checker 가 CI 로 별도 검증.)
# =============================================================================

# ---------- stage 1: deps + build ----------
FROM node:20-alpine AS builder

WORKDIR /repo

RUN apk add --no-cache git \
 && corepack enable \
 && corepack prepare pnpm@10.15.0 --activate

# workspace 전체 source 복사 (api 형을 위해 package.json + tsconfig 등 모두).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/build-monitor/ apps/build-monitor/
COPY apps/build-server/  apps/build-server/
COPY docs/ docs/

# pnpm install — 한 번만 (dev 포함). .bin shortcut / pnpm store 모두 populate.
RUN pnpm install --frozen-lockfile

# `pnpm build` lifecycle 의 prebuild/postbuild 훅 트리거 회피 — 직접 binary
# 호출. (prebuild `generate-openapi.ts` 가 live backend 를 fetch 하려 하나
# Docker build 환경엔 server 가 없어 ECONNREFUSED. .generated/openapi.d.ts 가
# source-of-truth. prebuild 가 cold cache 에서 정상 동작하려면 backend 가 살아
# 있어야 하지만, 이미 commit 된 `.generated/openapi.d.ts` 가 backend 의 상태를
# 반영한 스냅샷이므로 frontend type 의 source-of-truth.)
#
# - `tsc` 는 workspace root 의 hoist 된 .bin 에 존재 (`node_modules/.bin/tsc`).
# - `vite` 는 apps/build-monitor 의 isolated .bin 에 존재.
RUN ./node_modules/.bin/tsc -p packages/shared-contract/tsconfig.json \
 && ./node_modules/.bin/tsc -p packages/shared-config/tsconfig.json \
 && ./node_modules/.bin/tsc -p packages/db/tsconfig.json \
 && ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json \
 && cd apps/build-monitor && ./node_modules/.bin/vite build

# ---------- stage 2: runtime ----------
FROM node:20-alpine AS runtime

WORKDIR /app

# curl 은 HEALTHCHECK + 운영자 e2e curl 호출용.
# tini 는 SIGTERM 전파 — child process 가 graceful shutdown.
RUN apk add --no-cache curl tini

# build artifacts — build-server ESM 은 dist 의 JS 만 import. tsconfig 도
# path mapping 으로 같이 필요.
COPY tsconfig.base.json ./
# tsconfig.base.json 의 paths 가 shared packages 를 `src/index.ts` 로 매핑
# (`packages/shared-contract/src/index.ts` 등). 따라서 tsc 가 build-server
# 만 컴파일해도 dist emit 에는 별도 패키지 dist 가 없어도 됨 — runtime 이
# dist 안의 ESM 을 import 할 때 source 를 resolve 할 수 있어야 하므로 src 도
# 같이 복사. (`dist/` 디렉토리는 build-server 만 emit 되었으므로 shared
# packages 의 dist 는 COPY 시도 자체를 skip — 존재하지 않는 path 의 COPY 는
# docker 가 실패한다.)
COPY --from=builder /repo/apps/build-server/dist        apps/build-server/dist
# shared 패키지 dist + package.json + src + tsconfig. workspace root 의
# package.json 의 `main: dist/index.js` 가 runtime entry. pnpm workspace
# 심볼릭 링크 `apps/build-server/node_modules/@.../shared-config
# → ../../../../packages/shared-config` 가 dist 안의 entry 로 resolve.
COPY --from=builder /repo/packages/shared-contract     packages/shared-contract
COPY --from=builder /repo/packages/shared-config       packages/shared-config
COPY --from=builder /repo/packages/db                  packages/db
COPY --from=builder /repo/apps/build-monitor/dist      apps/build-monitor/dist

# build-monitor 의 `.generated/openapi.d.ts` — frontend client 의 type source.
COPY --from=builder /repo/apps/build-monitor/.generated apps/build-monitor/.generated

# SQL migrations (postgres backend 일 때 applyMigrations 가 실행) — TASK-064.
COPY --from=builder /repo/apps/build-server/migrations  apps/build-server/migrations

# node_modules 전체 (devDependencies 포함). self-dogfood 첫 PR 용 단순화 —
# runtime image size 최적화는 후속 TASK 에서 (위 코멘트 참조). 같은 stage 의
# build artifacts 와 함께 COPY 하면 layer cache 효율 ↑.
COPY --from=builder /repo/node_modules                 node_modules
COPY --from=builder /repo/apps/build-monitor/node_modules apps/build-monitor/node_modules
COPY --from=builder /repo/apps/build-server/node_modules  apps/build-server/node_modules

# 기본값 (운영자가 override): memory backend, admin allow-list, 단일 port
# 정적 mount path. health check 도 같은 port 기준.
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    BUILD_REPOSITORY_BACKEND=memory \
    ADMIN_IDS=admin,yky.lee \
    BUILD_MONITOR_DIST_PATH=/app/apps/build-monitor/dist \
    DB_AUTO_BOOTSTRAP=true

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD curl -fsS http://127.0.0.1:3000/health || exit 1

# tini 가 SIGTERM 을 child (node) 에 propagate → graceful shutdown.
# module 형태 (ESM) 진입점은 package.json `main` (`dist/apps/build-server/src/index.js`).
ENTRYPOINT ["/sbin/tini","--","node","apps/build-server/dist/apps/build-server/src/index.js"]
