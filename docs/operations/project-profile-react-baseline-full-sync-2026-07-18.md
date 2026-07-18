# Project Profile React Baseline Full Sync (TASK-101 follow-up batch 2)

- 작성일: 2026-07-18
- TASK: TASK-101 follow-up batch 2 — `docs/PROJECT_PROFILE.md` §3.5~§3.11 회귀 baseline + §3.12 trailing context + §4 + §5 React baseline 동기화
- 시리즈: frontend rewrite 7-PR + M4.5 8-PR 시리즈 + 디자인 토큰 단일화 (TASK-096.5) + PROJECT_PROFILE React baseline 동기화 (PR #57) 후속

## 의도

PR #57 (PROJECT_PROFILE.md React baseline 동기화) 의 batch 1 에서 §3 frontend 관련 4 섹션 (§3.2 Admin / §3.3 Build Monitor UI 정합 / §3.4 Admin 가드 / §3.12 React 빌드 mount) 을 Svelte baseline → React baseline 으로 동기화 완료. 본 TASK (batch 2) 에서는 §3.5~§3.11 (Backend / Runner 측 TASK-073~077 + e2e-multi-runner TASK-086 + Production semantic TASK-085) 의 회귀 baseline 을 Svelte 측 baseline (`svelte-check 0/0` + `vite build OK`) → TASK-101 React baseline (`vitest 130/130` + `vite build:react 99.01KB css 30.62KB`) 으로 동기화. §3.12 trailing context + §4 (검증 포인트) 의 "UI 변경" 항목 + §5 (예외 규칙) 의 "TASK-101 baseline 추가" + 다음에 읽을 문서 (본 세션의 5개 운영 가이드 reference) 도 동시 갱신.

## 변경 (1 file / +50 / -40)

### 수정 1

- `docs/PROJECT_PROFILE.md` — §3.5~§3.11 (7 섹션) 의 회귀 baseline 일괄 React baseline 동기화. §3.12 의 trailing context (회귀 baseline 라인). §4 "UI 변경" 항목 React baseline 정합. §5 "TASK-101 baseline 추가" + 본 세션의 5개 운영 가이드 reference 를 "다음에 읽을 문서" 에 추가.

## 핵심 정합 (7 섹션 회귀 baseline)

| 섹션 | 변경 전 (Svelte baseline) | 변경 후 (TASK-101 React baseline) |
|---|---|---|
| **§3.5 Production semantic (TASK-085)** | `svelte-check 0/0` + `vite build OK` | `svelte-check script 제거 (TASK-101)` + `vite build:react 정상 (gzip js 99.01KB / css 30.62KB)` + `build-monitor vitest 130/130 PASS` |
| **§3.6 e2e-multi-runner (TASK-086)** | `svelte-check 0/0` + `build-monitor vitest 135/135 동일` | `svelte-check script 제거` + `build-monitor vitest 130/130 동일` (React baseline) + `vite build:react 정상` |
| **§3.7 Private registry (TASK-073)** | `svelte-check 0/0` + `build-monitor vitest 135/135 동일` | `svelte-check script 제거` + `build-monitor vitest 130/130 동일` (React baseline) + `vite build:react 정상` |
| **§3.8 htpasswd registry (TASK-074)** | `svelte-check 0/0` + `build-monitor vitest 135/135 동일` | `svelte-check script 제거` + `build-monitor vitest 130/130 동일` (React baseline) + `vite build:react 정상` |
| **§3.9 Credential rotation (TASK-075)** | `svelte-check 0/0` + `build-monitor vitest 135/135 동일` | `svelte-check script 제거` + `build-monitor vitest 130/130 동일` (React baseline) + `vite build:react 정상` |
| **§3.10 Insecure-registry (TASK-076)** | `svelte-check 0/0` + `build-monitor vitest 135/135 동일` | `svelte-check script 제거` + `build-monitor vitest 130/130 동일` (React baseline) + `vite build:react 정상` |
| **§3.11 Admin-initiated runner (TASK-077)** | `svelte-check 0 errors (1 warning)` + `vite build OK` + `build-monitor vitest 135 → 140 PASS` | `svelte-check script 제거 (TASK-101)` + `vite build:react 정상 (gzip js 99.01KB / css 30.62KB)` + `build-monitor vitest 130/130 PASS` (RegisterRunnerModal React 측 modal 정합) |

## §3.12 / §4 / §5 정합

### §3.12 trailing context

- **변경 전 (TASK-093+094 baseline)**: `build-server node:test 131 → 142 PASS (TASK-075 baseline 131 + 신규 회귀 가드 11), build-monitor vitest 178 → 173 PASS (PhaseTimeline.test.ts 5건 제거), Go 76/76 동일, svelte-check 0/1`
- **변경 후 (TASK-093+094+100+101 baseline)**: `build-server node:test 131 → 143 PASS (TASK-075 baseline 131 + TASK-093 신규 12 + TASK-101 Svelte scaffold 정리 영향 0), build-monitor vitest 130/130 PASS (TASK-101 Svelte 135 case 일괄 삭제), Go 7 packages 모두 PASS. svelte-check script 제거 (TASK-101 Svelte scaffold 정리).`

### §4 검증 포인트 — UI 변경

- **변경 전**: "해당 사항 없음. 테스트 runtime 또는 결과 조회 UI 논의가 생기면 별도 기준 정의"
- **변경 후**: "React 측 (TASK-088~101) — Svelte 측 src/ 일괄 폐기 (TASK-101). React 단일 SPA 운영 baseline: vitest 130/130 PASS, vite build:react 정상 (gzip js 99.01KB / css 30.62KB), TS 5 packages tsc --noEmit clean. 디자인 토큰 단일화 (TASK-096.5) — Svelte tokens.css 가 단일 source-of-truth, React 측 tokens.css 사본. Astryx Theme 컴포넌트 보호용 theme.css 별도 layer 분리."

### §5 예외 규칙 — TASK-101 baseline 추가

- **변경 전**: §5 는 §1~§4 baseline 으로 작성 — 본 세션의 frontend rewrite + M4.5 8-PR 시리즈 + 디자인 토큰 단일화 + Svelte scaffold 정리 + PROJECT_PROFILE 동기화 미반영.
- **변경 후**: §5 끝에 `> TASK-101 baseline 추가 (2026-07-18)` blockquote 추가. 운영 baseline (vitest 130/130 / build-server 143/143 / Go 7+ packages / Svelte 의존성 일괄 폐기 / `apps/build-monitor/src/` 일괄 폐기) 명시.

### 다음에 읽을 문서

- **추가**: TASK-096.5 / TASK-099 / TASK-100 / TASK-101 / TASK-101 follow-up 의 5개 운영 가이드 reference (모두 2026-07-18).

## 사전 결함 + 보강 1건

1. **§3 frontend baseline 누락 (batch 1) — §3.5~§3.11 + §3.12 trailing + §4 + §5 baseline 누락 (batch 2)** — PR #57 batch 1 에서 §3 frontend 관련 4 섹션만 동기화. Backend / Runner 측 TASK-073~077 + e2e-multi-runner + Production semantic 의 회귀 baseline 이 모두 Svelte 측 baseline 으로 작성되어 있어 운영자가 잘못된 정보로 운영 판단 위험. **해결**: batch 2 에서 §3.5~§3.11 (7 섹션) 의 회귀 baseline + §3.12 trailing context + §4 UI 변경 + §5 TASK-101 baseline 추가 + 다음에 읽을 문서 (5개 운영 가이드 reference) 동시 갱신.

## 회귀 baseline (변경 없음, docs only)

- TS 5 packages `tsc --noEmit` clean
- build-monitor vitest **130/130 PASS**
- vite build:react 정상 — gzip js **99.01KB** / css **30.62KB**
- build-server node:test **143/143 PASS**
- Go 7+ packages 모두 PASS
- main HEAD `baa7383` (PR #57 main 합류 회수 sync)

운영 영향 0 (docs only).

## follow-up

- **§3.5~§3.11 의 의도 / 핵심 변경 / 사전 결함 + 보강 부분** 은 frontend rewrite 와 무관 — Backend / Runner 측 TASK 의 본질 정합. 본 TASK (batch 2) 의 scope 외 (변경 범위 큼).
- **§1 (프로젝트 개요) / §2 (문서 구조) / 다음에 읽을 문서 (본 TASK batch 2 에서 5개 reference 추가 완료)** 는 본 TASK 범위 외 — 일반적인 운영 baseline 이라 정합성 회복 불필요.

## 관련 문서

- `docs/PROJECT_PROFILE.md` (본 TASK amend)
- `docs/operations/project-profile-react-baseline-2026-07-18.md` (PR #57 batch 1 운영 가이드)
- `docs/operations/project-profile-react-baseline-full-sync-2026-07-18.md` (본 TASK batch 2 운영 가이드)
- `docs/operations/svelte-scaffold-cleanup-2026-07-18.md` (TASK-101)
- `docs/operations/app-router-simplify-2026-07-18.md` (TASK-100)
- `docs/operations/build-request-api-console-react-2026-07-18.md` (TASK-099)
- `docs/operations/design-tokens-unification-2026-07-18.md` (TASK-096.5)"
