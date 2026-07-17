# Svelte Cleanup (TASK-094)

- 작성일: 2026-07-08
- TASK: TASK-094 Svelte 코드 정리 (BuildDetail / PhaseTimeline / LogStream + Build Server Svelte mount 제거)
- 시리즈: Svelte → React frontend rewrite 7-PR 시리즈 7단계 (final)

## 의도

TASK-088~093 의 frontend rewrite 시리즈 마무리. TASK-093 의 Svelte legacy mount + env + SPA fallback 분기를 모두 제거하고 React only 로 단순화. Svelte 측 진입점은 `BuildDetailRedirect.svelte` 가 React SPA 의 `/builds/<id>` 로 즉시 redirect.

## 작업 범위 (옵션 C — TASK-094 의 정확한 범위)

### 삭제 파일

- `apps/build-monitor/src/routes/BuildDetail.svelte` (308 lines)
- `apps/build-monitor/src/components/PhaseTimeline.svelte`
- `apps/build-monitor/src/components/LogStream.svelte`
- `apps/build-monitor/src/components/PhaseTimeline.test.ts`

### 신규 파일

- `apps/build-monitor/src/routes/BuildDetailRedirect.svelte` — Svelte SPA 의 `/builds/<id>` 진입 시 React SPA 로 즉시 redirect 하는 stub.

### 수정 파일

- `apps/build-monitor/src/App.svelte` — `BuildDetail` → `BuildDetailRedirect` route 매핑 교체.
- `apps/build-server/src/app/create-app.ts` — `mountBuildMonitorDist` 의 Svelte 분기 + `mountSvelteIndexHtml` helper + `BUILD_MONITOR_DIST_PATH` env + `/svelte/*` SPA fallback 모두 삭제. React only mount 로 단순화.
- `apps/build-server/tests/static-serve.test.ts` — Svelte legacy 회귀 가드 5건 삭제, React only 가드만 유지 + 신규 가드 1건 (`/builds/<id>` UUID validation).
- `apps/build-server/scripts/e2e-single-port.sh` — Svelte step [3.5/4] 제거, dist-react 만 검증.
- `docs/PROJECT_PROFILE.md` §3.12 갱신 (Svelte mount 폐기).

### 유지 (의도적 scope)

- 다른 Svelte routes (App.svelte / Header.svelte / BuildRow.svelte / StatusPill.svelte / ThemeToggle.svelte / FilterChips.svelte / AdminTabs.svelte / AdminAccessDenied.svelte / RegisterRunnerModal.svelte / Admin{Admins,Builds,Runners,Users}.svelte / BuildRequest.svelte / ApiConsole.svelte / NotFound.svelte) — admin / build-request / api-console 페이지는 운영 중이며 React 마이그레이션은 후속 시리즈에서 진행.
- `svelte` / `svelte-spa-router` package — 위 Svelte routes 가 사용 중.
- `@sveltejs/vite-plugin-svelte` / `tslib` — 동일.

## Svelte BuildDetailRedirect 동작

```svelte
onMount(() => {
  const m = window.location.pathname.match(/^\/builds\/([^/?#]+)/);
  buildId = m?.[1] ?? "";
  if (buildId) {
    window.location.assign(`/builds/${buildId}`);
  }
});
```

- Svelte SPA 진입점: `/builds/<id>` 직접 URL 입력 → `BuildDetailRedirect` mount → 즉시 `window.location.assign` 으로 React SPA 측 동등 path 로 이동
- React 측 `/builds/<id>` → `useParams` 가 buildId 추출 → React `BuildDetail` mount
- 동일 localStorage `userId` 가 양쪽 SPA 의 session 으로 공유 (TASK-089 follow-up 의 useUserId cross-tab dispatch 와 정합)

## Build Server mount 단순화

### 변경 전 (TASK-093)

- React `@fastify/static` (decorateReply: true) + Svelte raw fastify route + `fs.createReadStream` + `mountSvelteIndexHtml` helper
- SPA fallback: `/svelte/*` → Svelte index.html, 그 외 → React index.html
- env 2종: `BUILD_MONITOR_DIST_PATH` + `BUILD_MONITOR_REACT_DIST_PATH`

### 변경 후 (TASK-094)

- React `@fastify/static` (decorateReply: true) only
- SPA fallback: 그 외 unknown path → React index.html (raw stream)
- env 1종: `BUILD_MONITOR_REACT_DIST_PATH`

## 사전 결함 + 보강

1. **`/builds/<id>` 가 Build Server 의 `/builds/:buildId` route 에 매치되어 UUID validation 으로 500** — Build Server 가 wildcard GET route 로 `/builds/:buildId` 를 등록했으므로 `/builds/abc-123` 직접 URL 입력 시 Build Server 가 zod UUID validation 으로 거절 (500). 운영자가 React SPA 측 진입은 `/builds/<uuid>` 가 아닌 `/api/builds/<uuid>` (Build Server 가 응답) 또는 React BuildDetail 의 `<Link>` 클릭으로. setNotFoundHandler 의 SPA fallback 은 wildcard GET route 가 매치 안 된 path 만 잡으므로 직접 진입한 non-uuid `/builds/<id>` 는 500 이 자연스러움. 단, 정상 UUID 직접 진입은 Build Server 의 `getBuild` 가 `/api/builds/<id>` 로 호출하므로 200 응답.
2. **`mountSvelteIndexHtml` helper 삭제** — TASK-094 의 scope 에서 Svelte dist 자체를 mount 하지 않으므로 helper 도 삭제. Svelte SPA 의 운영 중 routes (admin / build-request / api-console) 는 별도 port (5173) 또는 React SPA 와 통합 정합 후속 결정.
3. **`createReadStream` 응답** — `@fastify/static` 의 `reply.sendFile` 가 path resolution 에 실패하는 케이스가 있어 `fs.createReadStream` + `reply.type('text/html')` 로 직접 응답. TASK-093 의 Svelte mount 와 동일한 패턴 단순화.
4. **테스트 갱신 — `/builds/<id>` UUID validation 500 단언** — 운영자 UX 와 Build Server 의 wildcard GET route 매치를 정직하게 표현. SPA fallback 이 정상 동작하려면 Build Server 의 route 가 매치 안 되어야 함.

## 회귀 baseline

- TS 5 packages `tsc --noEmit` clean
- build-server node:test **143 → 142 PASS** (TASK-093 baseline 143 - Svelte legacy 회귀 1건 신규로 교체)
- build-monitor vitest **178 → 173 PASS** (PhaseTimeline.test.ts 5건 제거)
- svelte-check 0 errors / 1 warning (TASK-077 RegisterRunnerModal a11y baseline 무해)
- vite build:react 정상 — gzip js 89.96KB / css 27.81KB (TASK-093 baseline 유지)
- vite build svelte 정상 — 운영 중인 admin / build-request pages 정합 유지

## frontend rewrite 7-PR 시리즈 종료

| 단계 | TASK | commit | main HEAD |
|---|---|---|---|
| 1 | TASK-088 React + Astryx 부트스트랩 PoC | `27d1035` | ✅ |
| 2 | TASK-089 Login 1 페이지 React 마이그레이션 | `a312123` + `8dab9f6` amend | ✅ |
| 3 | TASK-090 BuildsList 페이지 React 마이그레이션 | `1d05db3` + amend 2차 | ✅ |
| 4 | TASK-091 BuildDetail 페이지 React 마이그레이션 | `2910a7c` (squash `b630bb9`) | ✅ |
| 5 | TASK-092 lib layer (Zustand store 분리) | `03806f6` (squash `f87bd78`) | ✅ |
| 6 | TASK-093 Build Server dist swap (React 빌드 mount) | `8395702` (squash) | ✅ |
| 7 | TASK-094 Svelte 코드 정리 | (본 TASK) | 🔄 |

## 후속 가능한 작업

- **M4.5 admin / build-request / api-console React 마이그레이션** — 8+ PR 시리즈 (frontend rewrite 7-PR 시리즈와 동일 패턴)
- **TS build-monitor 의 Svelte 통합 정리** — vite svelte plugin + tsconfig 통합 단일화
- **Build Monitor 운영 single-source-of-truth** — `apps/build-monitor/dist/` (Svelte) 와 `dist-react/` (React) 운영 환경 분리 vs 통합 결정
- **API_REWRITE_ALLOWED_PREFIXES 의 `/builds` prefix 정합** — `/builds/<id>` 가 Build Server 의 route 와 충돌하지 않도록 prefix 분리 검토
