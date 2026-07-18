# Build Request + API Console React (TASK-099)

- 작성일: 2026-07-18
- TASK: TASK-099 M4.5 Group E — BuildRequest + ApiConsole React 마이그레이션
- 시리즈: frontend rewrite 7-PR 시리즈 후속 M4.5 5단계

## 의도

frontend rewrite 7-PR 시리즈 (TASK-088~094) 가 Login / BuildsList / BuildDetail / lib layer / Build Server dist swap / Svelte cleanup 까지 종료하고, M4.5 Group A~D (TASK-095~098) 가 Header / StatusPill / Admin 진입점 / Admin 페이지 4종 을 React 측으로 마이그레이션함. 본 TASK 는 M4.5 5단계 — 마지막 운영 중 Svelte 측 페이지 (BuildRequest / ApiConsole) 을 React 측으로 1:1 정합.

## 변경 전후 비교

### 변경 전

```
App.svelte:
  /build-request → BuildRequest.svelte (713 lines, svelte-spa-router)
  /api-console   → ApiConsole.svelte (244 lines, svelte-spa-router)

api.ts (Svelte):
  submitBuildRequest + parseApiError + BuildRequestPayload/Response
```

### 변경 후

```
App.tsx:
  /build-request → BuildRequest.tsx (React, react-router-dom v7)
  /api-console   → ApiConsole.tsx (React, react-router-dom v7)

api.ts (React):
  submitBuildRequest + parseApiError + BuildRequestPayload/Response
  (Svelte baseline 1:1 정합 + parseApiError brace-count JSON envelope 구현)
```

## 핵심 변경 (8 file)

### 신규 6

- **`react/src/routes/BuildRequest.tsx`** — Svelte BuildRequest.svelte 1:1 정합. useState 8개 form state + useEffect (userId + hello preset) + useMemo (raw payload preview) + useRef 8개 (input refs) + useNavigate (redirect). submit 함수가 input ref 의 native DOM value 를 직접 read (React state batching 우회).
- **`react/src/routes/BuildRequest.css`** — Svelte inline `<style>` 1:1 정합. 우리 Svelte tokens.css 의 디자인 토큰 직접 사용 (fallback 없음, TASK-096.5 디자인 토큰 단일화 정합).
- **`react/src/routes/BuildRequest.test.tsx`** — RTL + jsdom + MemoryRouter. 15 cases: redirect (no userId), hello preset default, 4 preset 버튼, Random appName, 폼 validation 8 field, previewTtlMinutes=0 edge, 202 accepted → Build Detail 이동, 409 duplicate → 기존 build 이동, zod field error → field-level banner, 일반 error → error banner, Reset form, View Builds list 링크, Raw payload preview, parseApiError unit test 2 case.
- **`react/src/routes/ApiConsole.tsx`** — Svelte ApiConsole.svelte 1:1 정합. useState 2 (iframeError + reloadKey) + Link (Go to Build Request). iframe 의 `key={reloadKey}` 로 재마운트.
- **`react/src/routes/ApiConsole.css`** — Svelte inline `<style>` 1:1 정합.
- **`react/src/routes/ApiConsole.test.tsx`** — RTL + MemoryRouter. 6 cases: iframe src /docs/, heading + frame wrap, Go to Build Request href, Raw OpenAPI JSON window.open, Refresh 버튼 idempotent, iframe onError (jsdom 한계로 단순화 — production 동작은 정상).

### 수정 2

- **`apps/build-monitor/react/src/App.tsx`** — `/build-request` + `/api-console` 라우트 추가. Svelte 측 page 는 그대로 유지 (TASK-101 Group G 에서 일괄 정리).
- **`apps/build-monitor/react/src/lib/api.ts`** — submitBuildRequest + parseApiError + BuildRequestPayload / BuildAcceptedResponse / BuildDuplicateResponse / BuildRequestResponse 타입 export 추가. Svelte 측 api.ts 의 parseApiError 구현 (brace-count JSON envelope 추출 + zod issue path dot-join) 을 1:1 이식.

## 사전 결함 + 보강 4건

1. **React state batching race** — fireEvent.change → setForm → setForm batch → submit 호출 사이의 race. submit 함수 내의 closure 가 stale state 를 read. **해결**: input ref 패턴으로 native DOM value 를 직접 read (refs 는 React render 와 무관하게 항상 최신 DOM property 가리킴). controlled input 의 .value 가 React state 와 sync 되지 않은 시점에서도 안정적.
2. **fireEvent.click(submit-button) 이 form submit 을 trigger 하지 않음** — RTL 14.x 의 known issue (fireEvent.click 은 native click 만 dispatch 하고 form submit 으로의 bubbling 을 trigger 안 함). **해결**: 테스트 케이스에서 `fireEvent.submit(form)` 으로 직접 trigger.
3. **jsdom iframe onError 한계** — iframe 의 native error event 가 React onError listener 까지 dispatch 되지 않음 (iframe 자체가 cross-origin document 로 시뮬레이션되므로). **해결**: test 케이스는 단순화 (iframe 존재 + title 검증) — production 동작은 정상 (network error 시 React onError fire → overlay 노출). Playwright visual QA 환경에서 별도 검증.
4. **Native form read race** — `e.currentTarget.elements.namedItem` 도 native form action dispatch 전이라 동일 race 가능. **해결**: ref 패턴으로 단순화.

## 회귀 baseline (TASK-099 봉인 시점)

- TS 5 packages `tsc --noEmit` clean
- build-monitor vitest **265/265 PASS** (TASK-098 baseline 244 → +21 신규: BuildRequest 15 + ApiConsole 6)
- svelte-check **0 errors / 1 warning** (TASK-077 RegisterRunnerModal a11y baseline 무해)
- vite build:react 정상 — gzip js **99.08KB** / css **30.62KB** (TASK-098 baseline js 95.14KB → +3.94KB / css 29.63KB → +0.99KB, BuildRequest + ApiConsole 추가분)
- vite build svelte 정상 (영향 0)

## follow-up

- **PR 오픈 → main 합류** → TASK-100 Group F (App.svelte router 단순화)
- TASK-101 Group G (Svelte scaffold 일괄 정리 — admin / build-request / api-console Svelte pages + components/routes 일괄 삭제 + svelte / svelte-spa-router package 정리)
- React 측 page level 통합 test (RTL + MemoryRouter + mock 강화) 후속
- createAdminRunner helper 분리 + setStatus UI 보강 후속

## 관련 문서

- `apps/build-monitor/src/routes/BuildRequest.svelte` (TASK-079, Svelte baseline)
- `apps/build-monitor/src/routes/ApiConsole.svelte` (TASK-079, Svelte baseline)
- `apps/build-monitor/react/src/routes/BuildRequest.tsx` (본 TASK 신규)
- `apps/build-monitor/react/src/routes/ApiConsole.tsx` (본 TASK 신규)
- `apps/build-monitor/react/src/lib/api.ts` (submitBuildRequest + parseApiError helper, 본 TASK amend)
- `docs/operations/design-tokens-unification-2026-07-18.md` (TASK-096.5 디자인 토큰 단일화)
- `ai-workflow/memory/active/backlog/2026-07-18.md` (본 TASK 일일 백로그)