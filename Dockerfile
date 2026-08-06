# syntax=docker/dockerfile:1.7
# =============================================================================
#  docker-image-builder-system — Build Server image
# =============================================================================
#  Self-dogfood 용 single-image build server. monorepo(pnpm workspace)
#  구조에서 build-server + build-monitor + 그 workspace dependencies
#  (shared-contract / shared-config / db) 를 4-stage 로 빌드.
#
#  Stage 흐름:
#    1. builder     — devDeps 로 tsc/vite 호출, build artifacts 산출
#    2. prod-deps   — prodDeps 만 install (runtime 전용)
#    3. runtime     — 1 + 2 의 artifact 를 받아 non-root 로 실행
#
#  사용 예:
#    docker build -t dibs/build-server:dev -f Dockerfile .
#    docker run --rm -p 3000:3000 \
#      -e BUILD_REPOSITORY_BACKEND=memory \
#      -e ADMIN_IDS=admin,yky.lee \
#      -e BUILD_MONITOR_DIST_PATH=/app/apps/build-monitor/dist \
#      dibs/build-server:dev
#
#  주의 (production):
#    - ADMIN_IDS 는 default 없이 export. 운영자가 반드시 주입해야 함
#      (PROJECT_PROFILE §3 — admin secret 정책).
#    - HOST=0.0.0.0 은 dev/self-dogfood 용. 운영 환경에서는 NAT / LB 뒤에서
#      명시적으로 127.0.0.1 또는 pod network interface 로 바인딩 권장.
#
#  health:
#    curl -fsS http://127.0.0.1:3000/health
#
#  service DB policy:
#    service DB is opt-in through ServiceManifest.database. DATABASE_URL and
#    host/schema/role/password values are never baked into this image or a
#    generated Dockerfile; Build Server injects the service Secret at runtime.
# =============================================================================

# ---------- stage 1: builder (devDeps + tsc/vite) ----------
FROM node:20-alpine AS builder

WORKDIR /repo

# corepack 으로 pnpm@10.15.0 활성. pnpm lockfile 에 git dep 없음 (검증) — git 미설치.
RUN corepack enable \
 && corepack prepare pnpm@10.15.0 --activate

# workspace source 일괄 copy. package.json + tsconfig + src 전체.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/build-monitor/ apps/build-monitor/
COPY apps/build-server/  apps/build-server/
COPY docs/ docs/

# devDeps + prodDeps 모두 install. .bin shortcuts / pnpm store populate.
# build artifacts 산출 단계:
# - shared packages (contract / config / db): tsc 가 각각의 dist emit.
# - build-server: tsc 가 자체 dist emit. shared 의 dist 가 entry point.
# - build-monitor: vite build 가 dist (SPA) emit.
#
# `pnpm build` lifecycle 의 prebuild 훅 회피 — prebuild 가 live backend 를
# fetch 하려 하나 Docker build 환경엔 server 가 없어 ECONNREFUSED. repo 의
# commit 된 `.generated/openapi.d.ts` 가 source-of-truth. prebuild 우회 위해
# 직접 binary 호출.
#
# - `tsc` 는 workspace root 의 hoist 된 .bin (`node_modules/.bin/tsc`).
# - `vite` 는 apps/build-monitor 의 isolated .bin.
# - `vite build` (= package.json `build` script): TASK-153 통일로 build-monitor
#   는 단일 canonical `vite.config.ts`(root=react/, outDir=dist-react)만 갖는다.
#   Svelte 잔재(index.html/svelte.config.js/vite.react.config.ts)는 제거됐고
#   `vite.config.js` 는 .dockerignore 로 build context 에서도 제외 — plain
#   `vite build` 가 항상 vite.config.ts 를 잡는다. 산출물 dist-react/ → stage3 COPY.
RUN pnpm install --frozen-lockfile \
 && ./node_modules/.bin/tsc -p packages/shared-contract/tsconfig.json \
 && ./node_modules/.bin/tsc -p packages/shared-config/tsconfig.json \
 && ./node_modules/.bin/tsc -p packages/db/tsconfig.json \
 && ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json \
 && cd apps/build-monitor && ./node_modules/.bin/vite build

# ---------- stage 2: prod-deps (runtime 전용, prodDeps 만) ----------
# 별도 stage 로 분리하여 runtime image 에 devDependencies 가 새지 않도록.
# `--ignore-scripts` — package lifecycle scripts skip (CVE / supply-chain attack
# surface 축소). pnpm 자체의 bin shortcut 생성은 lifecycle 가 아니라 internal
# resolution 단계이므로 영향 없음.
FROM node:20-alpine AS prod-deps

WORKDIR /repo

RUN corepack enable \
 && corepack prepare pnpm@10.15.0 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared-contract/package.json packages/shared-contract/
COPY packages/shared-config/package.json  packages/shared-config/
COPY packages/db/package.json             packages/db/
COPY apps/build-monitor/package.json     apps/build-monitor/
COPY apps/build-server/package.json      apps/build-server/
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# ---------- stage 3: runtime ----------
FROM node:20-alpine AS runtime

WORKDIR /app

# curl 은 HEALTHCHECK + 운영자 e2e curl 호출용.
# tini 는 SIGTERM 전파 — child process 가 graceful shutdown.
# NOTE: corepack 미설치 — runtime 에서 pnpm 사용 안 함.
RUN apk add --no-cache curl kubectl tini

# 비-root 사용자 — Fastify 는 root 권한 없이 정상 동작 (port 3000 + filesystem
# read). alpine 의 reserved uid range 회피하기 위해 1500 대 explicit uid.
# (1000 은 alpine 의 useradd 가 default 첫 사용자로 잡는 경우 있어 회피)
RUN addgroup -S -g 1500 app \
 && adduser -S -u 1500 -G app app

# build artifacts — build-server ESM 은 dist 의 JS 만 import. tsconfig 도
# path mapping 으로 같이 필요. shared 패키지 디렉토리 전체 (package.json +
# src/ + tsconfig.json + dist/) — pnpm workspace 심볼릭 링크가 dist 안의
# entry 로 resolve.
COPY tsconfig.base.json ./
COPY --from=builder    /repo/apps/build-server/dist         apps/build-server/dist
COPY --from=builder    /repo/packages/shared-contract       packages/shared-contract
COPY --from=builder    /repo/packages/shared-config         packages/shared-config
COPY --from=builder    /repo/packages/db                    packages/db
# build-monitor: vite.react.config.ts 는 dist-react/ 로 emit. 런타임은
# BUILD_MONITOR_DIST_PATH=.../dist 를 서빙하므로 dist-react → dist 로 COPY.
COPY --from=builder    /repo/apps/build-monitor/dist-react   apps/build-monitor/dist
# build-monitor 의 `.generated/openapi.d.ts` — frontend client 의 type source.
COPY --from=builder    /repo/apps/build-monitor/.generated apps/build-monitor/.generated
# SQL migrations (postgres backend 일 때 applyMigrations 가 실행) — TASK-064.
COPY --from=builder    /repo/apps/build-server/migrations   apps/build-server/migrations

# prod deps 만 copy. devDependencies 제외 (tsc / vitest / @types/* 등) →
# image size ~309 MB → ~80 MB. workspace 심볼릭 링크와 pnpm store 가 모두
# 정상이어야 runtime ESM resolver 가 정상 동작.
COPY --from=prod-deps /repo/node_modules                        node_modules
COPY --from=prod-deps /repo/apps/build-monitor/node_modules    apps/build-monitor/node_modules
COPY --from=prod-deps /repo/apps/build-server/node_modules     apps/build-server/node_modules

# 운영자가 명시적으로 설정해야 하는 env (default 없음).
# - ADMIN_IDS: PROJECT_PROFILE §3 — admin secret 정책. default 가 image 에
#   박히면 image pull 받아서 그대로 실행한 누구나 admin 가능 → 운영자가
#   반드시 주입. self-dogfood 에서는 docker compose / k8s 가 env 전달.
# - BUILD_REPOSITORY_BACKEND=memory: the pre-deploy container test must run
#   without a service Secret. DB-enabled hosted deployments override this to
#   postgres alongside the platform-injected DATABASE_URL Secret.
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    BUILD_REPOSITORY_BACKEND=memory \
    BUILD_MONITOR_DIST_PATH=/app/apps/build-monitor/dist \
    BUILD_MONITOR_REACT_DIST_PATH=/app/apps/build-monitor/dist \
    DB_AUTO_BOOTSTRAP=true

EXPOSE 3000

# start_period 15s — postgres backend 의 cold start (applyMigrations 포함) 가
# 5초보다 길 수 있어 여유. start_period 안에서는 실패 카운트 안 됨.
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD curl -fsS http://127.0.0.1:3000/health || exit 1

# 비-root 실행. tini 가 PID 1 으로 SIGTERM propagation.
USER app

# tini 가 SIGTERM 을 child (node) 에 propagate → graceful shutdown.
# module 형태 (ESM) 진입점은 package.json `main` (`dist/apps/build-server/src/index.js`).
ENTRYPOINT ["/sbin/tini", "--", "node", "apps/build-server/dist/apps/build-server/src/index.js"]
