# Single-Port React Mount (TASK-093)

- 작성일: 2026-07-08
- TASK: TASK-093 Build Server dist swap (React 빌드 mount 전환)
- 시리즈: Svelte → React frontend rewrite 7-PR 시리즈 6단계

## 의도

TASK-075 의 단일 포트 reverse proxy (Build Server 가 Build Monitor 의 vite
build 산출물을 정적 mount + SPA fallback 으로 함께 노출) 위에서, Svelte 빌드를
React 빌드로 swap. React 가 primary SPA — 운영자가 단일 origin (`http://host:3000`)
에서 React Build Monitor + Build Server API 를 모두 사용. Svelte 빌드는 legacy
deep link 호환을 위해 `/svelte` + `/svelte/` GET 만 raw stream 으로 응답 — TASK-094
의 Svelte 코드 정리까지 보존.

## 사용 절차

### 1) Build Monitor 의 두 빌드 모두 생성

```bash
# repo root 에서
./apps/build-monitor/node_modules/.bin/vite build  # Svelte dist/
(cd apps/build-monitor && ./node_modules/.bin/vite build --config vite.react.config.ts)  # React dist-react/
```

확인:
- `apps/build-monitor/dist/index.html` (Svelte)
- `apps/build-monitor/dist-react/index.html` (React)

### 2) Build Server 부팅 (memory backend 예시)

```bash
# env 둘 다 기본값 — React primary
./node_modules/.bin/tsc -p packages/{shared-contract,shared-config,db}/tsconfig.json && \
  ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json && \
  BUILD_REPOSITORY_BACKEND=memory \
  node apps/build-server/dist/apps/build-server/src/index.js
```

postgres backend 는 §3.5 (TASK-085) 의 운영 절차 + `BUILD_REPOSITORY_BACKEND=postgres`
+ `DATABASE_URL` + `DB_AUTO_BOOTSTRAP=true` 추가.

### 3) 단일 port 검증

```bash
# React primary SPA — index.html 이 `#app-react` div 포함
curl -s http://127.0.0.1:3000/ | grep -E 'app-react|index-.*\.js'

# Svelte legacy deep link — index.html 이 `#root` div 포함
curl -s http://127.0.0.1:3000/svelte | grep -E 'build-monitor-svelte-stub|root'

# Build Server API — JSON 응답 + 307 transparent redirect
curl -s http://127.0.0.1:3000/api/builds | jq .
curl -sI http://127.0.0.1:3000/api/health
```

## 환경 변수

| env | default | 역할 |
|---|---|---|
| `BUILD_MONITOR_DIST_PATH` | `apps/build-monitor/dist` | Svelte dist path (legacy deep link 호환). 빌드 부재 시 `/svelte/*` 404 |
| `BUILD_MONITOR_REACT_DIST_PATH` | `apps/build-monitor/dist-react` | React dist path (primary SPA). 빌드 부재 시 React SPA fallback skip |

## 운영 시나리오 매트릭스

| 시나리오 | svelte dist | react dist | `/` 응답 | `/svelte` 응답 | `/svelte/builds/<id>` 응답 |
|---|---|---|---|---|---|
| 정상 (TASK-093 기본) | 빌드됨 | 빌드됨 | React index.html | Svelte index.html (raw) | Svelte index.html (raw) |
| React only | 부재 | 빌드됨 | React index.html | 404 (`svelte_dist_not_mounted`) | 404 (`svelte_dist_not_mounted`) |
| Svelte only (legacy 운영 환경) | 빌드됨 | 부재 | 404 (`no_dist_mounted`) | Svelte index.html | Svelte index.html |
| Both 부재 (단위 테스트 환경) | 부재 | 부재 | Build Server 자체 route 만 | Build Server 자체 route 만 | Build Server 자체 route 만 |

## SPA fallback 우선순위

`setNotFoundHandler` 분기:

1. **`/api/*` registered prefix** → 307 transparent redirect (`/api/builds` → `/builds`)
2. **`/api/*` 미등록 prefix** → JSON 404 (Build Server 자체 응답 안 한 path)
3. **`/openapi` / `/docs` / `/health` prefix** → JSON 404 (probe / 모니터링 클라이언트 안전)
4. **`/svelte/*` deep link** → Svelte index.html (raw stream, svelte-spa-router 처리)
5. **그 외 unknown path** → React index.html (sendFile, react-router-dom 처리)

POST / PUT / PATCH / DELETE 는 SPA fallback 없이 Build Server 가 자체 응답하지 못하면
JSON 404 — SPA 가 아닌 소비자 (health probe / Skill / curl) 의 잘못된 요청을 SPA
HTML 로 응답해 데이터를 변조하는 사고 차단.

## 사전 결함 + 보강

1. **`@fastify/static` decorateReply decorator 충돌** — `decorateReply: true` 가 단일 dist 만 지원 (중복 등록 시 fastify 가 throw). React 만 `@fastify/static` 으로 mount + Svelte 는 raw fastify route + `fs.createReadStream` 으로 분기. 본 helper 가 `mountSvelteIndexHtml`.
2. **React favicon.svg 정합** — React 의 index.html 이 `<link href="/favicon.svg">` 참조. `@fastify/static` prefix `/` 가 모든 asset 정상 응답 (verified by static-serve.test.ts 의 `serves React favicon.svg verbatim`).
3. **`/svelte/` (trailing slash) 변형** — React router 가 redirect 처리하지만 fastify route 등록 시 `/svelte` 와 `/svelte/` 두 path 모두 handler (mountSvelteIndexHtml helper 가 두 route 등록).
4. **테스트 환경에서 legacy dist 부재** — `BUILD_MONITOR_DIST_PATH` 미설정 + svelte dist 디렉터리 부재 시 `mountSvelteIndexHtml` 자체가 skip, setNotFoundHandler 가 `/svelte/*` 에 JSON 404 (`svelte_dist_not_mounted`).

## 한계

- React 와 Svelte 의 SPA 가 동시에 같은 사용자 session (localStorage `userId`) 를 공유 — 의도된 동작. React 측 Login 시 localStorage 갱신 → Svelte 측에서도 storage 이벤트로 동기화 (TASK-089 follow-up 의 useUserId hook 의 cross-tab dispatch 와 정합).
- React 의 vite proxy 가 `/api/*` 를 `:3000` 으로 forward — production 의 Build Server 의 `/api/*` 307 redirect 와 의미상 동일.
- Svelte 의 sub-route (`/svelte/builds/<id>`) 가 react-router-dom 과 다른 path 구조 — 둘 다 동일 localStorage session 사용하므로 운영자 UX 는 일관.

## 빠른 재현

```bash
# 1. Svelte dist + React dist 빌드
./apps/build-monitor/node_modules/.bin/vite build && \
  (cd apps/build-monitor && ./node_modules/.bin/vite build --config vite.react.config.ts)

# 2. Build Server 부팅
./node_modules/.bin/tsc -p packages/{shared-contract,shared-config,db}/tsconfig.json && \
  ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json && \
  BUILD_REPOSITORY_BACKEND=memory \
  node apps/build-server/dist/apps/build-server/src/index.js &

# 3. 검증
curl -sf http://127.0.0.1:3000/health && echo "health OK"
curl -sf http://127.0.0.1:3000/ | grep -q app-react && echo "React SPA OK"
curl -sf http://127.0.0.1:3000/svelte/ | grep -q root && echo "Svelte SPA OK"
curl -sf http://127.0.0.1:3000/api/builds | jq '.builds | length'
```

## 다음 TASK

- **TASK-094** Svelte 코드 정리 — BuildDetail.svelte / PhaseTimeline.svelte /
  LogStream.svelte + components/routes 삭제 + package.json 정리. 본 TASK 의
  Svelte mount 가 옵션 A (legacy 보존) 와 옵션 B (즉시 삭제) 중 결정 필요.

## 결정 (옵션 비교)

- **A 즉시 swap** (Svelte dist/ 삭제 + Svelte code 삭제) — 운영 복잡성 ↓, legacy deep link 즉시 깨짐
- **B ✅ 단계적 swap** (TASK-093 + TASK-094 분리, Svelte legacy 보존) — TASK-093 에서 React primary swap, TASK-094 에서 Svelte 코드 정리. 운영자가 비교 검증 + legacy URL 보존.
