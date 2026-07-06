# 2026-07-06 Dogfood E2E 리뷰 + 보완 계획

- 문서 목적: 직전 세션의 self-dogfood 운영 검증 결과(`docs/operations/dogfood-e2e-2026-07-06.md`)를 리뷰하고, 보완해야 할 항목의 우선순위·순서·검증 기준을 다음 세션이 그대로 가져갈 수 있게 정리한다.
- 범위: 검증된 항목 / 식별된 결함 / 미검증 gap / 보완 계획 (P0~P3) / 권장 다음 action
- 대상 독자: 다음 세션 Codex, 운영자, AI 에이전트
- 상태: draft
- 작성일: 2026-07-06
- 1차 출처: `docs/operations/dogfood-e2e-2026-07-06.md`, `ai-workflow/memory/active/session_handoff.md` §"2026-07-06 운영 검증 메모", `ai-workflow/memory/active/backlog/2026-07-06.md` §4, `ai-workflow/memory/active/state.json` `current_focus`, `docs/PROJECT_PROFILE.md` §3

## 1. 검증 결과 분류

### 1.1 PASS — 충분히 검증됨

| # | 검증 항목 | 증거 | 비고 |
|---|---|---|---|
| P-1 | 단일 port reverse proxy (TASK-075) — backend + frontend 동시 노출 | `GET /`, `/admin/login`, `/docs/`, `/openapi.json`, `/api/builds` 모두 200 OK | TASK-075 신규 도입 직후 e2e |
| P-2 | admin 진입점 (TASK-076) + AdminTabs (TASK-077) | `admin`, `yklee` 계정 로그인 후 `Builds` / `New Build` / `API Console` / `OpenAPI` / `Docs` / `admin/*` 진입 | TASK-076/077 main 합류 직후 |
| P-3 | 단일 build happy path (full lifecycle) | `bab5995f-…-95d53684263d` (`hello-e2e-1783341662`) → COMPLETED + preview `:32770/health` → `{"status":"ok"}` + build detail 4 block (container test / deployment / result delivery) 모두 SUCCESS + build logs `REQUEST_ACCEPTED → ... → COMPLETED` 10 phase verify | TASK-066/067/068/071a end-to-end |
| P-4 | queue 처리 — 단일 runner 3건 순차 | `9562dc11` → `854fda1b` → `12ea7282` (preview `:32771`, `:32772`, `:32773` 모두 응답) | TASK-069 runner registry + 1대 runner |
| P-5 | container self-dogfood 7 PHASE (TASK-078) | `/docs` 16 paths / 39 schemas / Admin 가드 5/5 + USER `app@1500` / HEALTHCHECK / Runner backoff 1×5s → 2×10s → 3×20s (5min cap) | PR #28 (`661925a`) main 합류 |

### 1.2 FAIL — 재현된 결함 (운영 차단 후보)

| # | 결함 | 영향 build | 재현 경로 |
|---|---|---|---|
| F-1 | **source upload race** — `POST /builds` 직후 runner 가 너무 빨리 claim 하면 `GET /builds/:id/source` → `404 Source archive not found for build.` | `d4b86bb8-…-ea4574796b1c`, `b20f5746-…-3ab361786660`, `b9d6d047-…-a0c39bc3e3f9` (3건) | 현재 회피: `runner DISABLED → POST /builds → POST /builds/:id/source → runner ACTIVE` |
| F-2 | admin UI navigation hierarchy 중첩 (global header + page-level AdminTabs) | 시각적 — UX만 저하, 기능 결함 아님 | `/admin/builds` 진입 시 두 nav 동시 노출 |
| F-3 | admin 화면의 시각 톤 / 밀도 — Build Request / Build Detail 대비 일관성 부족 | 시각적 | `/admin/builds`, `/admin/users`, `/admin/admins`, `/admin/runners` 4개 페이지 |

### 1.3 NOT-TESTED — 검증되지 않은 항목 (gap)

| # | 검증 안 된 항목 | 위험도 |
|---|---|---|
| G-1 | **러너 2대 이상 병렬 claim** — concurrent claim 시 한 build 가 두 runner 에 동시 할당되지 않는지 (atomic 보장) | high — multi-runner 운영 시 데이터 정합 |
| G-2 | **postgres backend dogfood e2e** — 동일 happy path / queue / race 가 postgres 에서도 같은 결과인지 | medium — postgres 경로 운영 신뢰성 |
| G-3 | **build failure path** — Dockerfile invalid / source fetch fail / runner mid-build down / docker daemon 끊김 시 BuildStatus + logs + admin view 노출 | medium — 운영 진단 가능성 |
| G-4 | **admin 가드 deep link UX** — 비-admin user 가 `/admin/*` 직접 진입 시 backend 401/403 → 화면 UX (에러 패널 vs redirect) | medium — TASK-076 후속 |
| G-5 | **container port 자동화** — TASK-067 `pickFreePort` 가 동시 build 간 서로 다른 host port 배정 보장 | low — TASK-067 unit test 일부만, e2e 검증 부족 |
| G-6 | **Preview cleanup TTL** — preview sweeper (TASK-037 후속) 의 실제 동작 | low — 메모리 누수 / port 누적 |
| G-7 | **result delivery 실제 전달 경로** — `resultDelivery=SUCCESS` 의 의미 (외부 시스템 URL / Slack / webhook?) | low — 표시만 됐고 실제 전달 검증 부족 |
| G-8 | **build logs streaming** — 클라이언트 측 WebSocket / SSE streaming 또는 polling 동작 | low |
| G-9 | **mountBuildMonitorDist env unset fallback** — TASK-075 의 "env 미설정 시 mount skip" 경로 dogfood 검증 | low |
| G-10 | **retry/backoff 검증** — TASK-078 의 Runner claimBackoff exponential 가 실제 multi-runner 운영 시 효과 있는지 | medium |

## 2. 결함 상세 분석 — F-1 source upload race

### 2.1 재현 시퀀스

```
T0  client → POST /builds        → build_id X, 202 Accepted
T1  client ← 202 + build_id X
T2  runner (polling) → POST /builds/claim → build_id X 할당 (즉시 응답)
T3  runner → GET /builds/X/source → 404 (client가 아직 source 미업로드)
T4  runner → phase: FAILED (source fetch error)
T5  client → POST /builds/X/source → 이미 FAILED build 에 source 적재 (또는 무시)
```

### 2.2 근본 원인 후보

- (A) `claimNextBuild` 가 source row 부재 여부와 무관하게 build 를 claim — `build_source` row 가 아직 없을 수 있는데 claim 가능.
- (B) `POST /builds` 직후 source row 가 lazy insert 되도록 설계되어 있으나 runner 가 그 전 claim.
- (C) 둘 다 — claim 조건에 source 필수 + client 가 source upload 까지 waiting.

### 2.3 영향 평가

- **운영 영향**: source archive upload 까지 한 호흡으로 진행하는 skill 측 automation 은 race 위험에 노출. 현재 회피 절차 (DISABLED → POST → source → ACTIVE) 는 운영자 수동 개입 필요.
- **데이터 정합**: FAILED build 의 source row 가 적재되어도 row 만 남고 lifecycle 영향 없음 — 데이터 손상 ❌. 단지 retry 불가 + 운영자가 재요청 필요.
- **TASK 의존성**: TASK-066 (source archive storage) 의 claim 조건 보강 누락.

## 3. 보완 계획 (P0 ~ P3)

### 3.1 P0 — 운영 차단 결함 해소 (즉시 진행)

#### TASK-080: source upload race mitigation

| 항목 | 내용 |
|---|---|
| 모드 | Code + Test |
| 우선순위 | P0 |
| 영향 파일 | `apps/build-server/src/repositories/{memory,postgres}-build-repository.ts` (claim 조건 보강), `apps/runner/internal/source/fetcher.go` (retry/backoff 강화), 신규 `apps/build-server/tests/source-race.test.ts`, `docs/PROJECT_PROFILE.md` §3 |
| 권장 옵션 | **옵션 B + C** — (B) build lifecycle 에 `SOURCE_UPLOAD_PENDING` 상태 추가, runner 가 그 상태 build 는 claim skip + (C) runner source fetch 1회 실패 시 exponential backoff 재시도 (1s/3s/9s, 3회) |
| 옵션 비교 | A: `POST /builds` 가 source 와 함께 multipart (UX 변화 큼) — ❌<br>B: lifecycle 상태 추가 + claim gate — ✅ (서버 측 단일 진실)<br>C: runner fetch retry — ✅ (transient failure 흡수)<br>D: build-server grace period — ❌ (timeout magic number 위험) |
| 검증 기준 | (1) race 재현 시나리오 (`POST /builds` 직후 100ms 안에 claim) 10회 시도 → 0 fail. (2) regression: happy path / queue 3건 모두 통과. (3) build-monitor vitest / build-server test / Go test 모두 회귀 없음. |
| 산출물 | PR `codex/task-080-source-upload-race-2026-07-06` branch → self-review → squash merge |
| 위험 | lifecycle 상태 추가는 schema 변경 가능성 → migration 1건 필요. claim gate 가 너무 strict 하면 정상 source 적재가 늦은 사용자도 fail → 옵션 C 의 retry 로 흡수. |

### 3.2 P1 — 운영 신뢰성 (병렬 / backend)

#### TASK-081: 다중 러너 병렬 claim 검증

| 항목 | 내용 |
|---|---|
| 모드 | Operations + Test + Documentation |
| 권장 진행 | 1) self-dogfood 2 runner 동시 띄우기 (compose.dev.yaml 의 runner service 복제), 2) build 5건 동시 POST, 3) claim 경합 관찰 |
| 검증 기준 | (1) 5 build × 3 runner → 5개 모두 1회만 claim (중복 claim 0). (2) 5 build 모두 COMPLETED. (3) claim latency p95 < 5s. (4) runner 별 phase report 가 build detail 에 정확히 노출. |
| 산출물 | `docs/operations/multi-runner-claim-2026-07-XX.md` (실 시나리오 결과) + 회귀 가드 test 1건 (concurrent claim N=10 race) |

#### TASK-082: postgres backend dogfood e2e

| 항목 | 내용 |
|---|---|
| 모드 | Operations + Documentation |
| 권장 진행 | `DATABASE_URL=postgres://... BUILD_REPOSITORY_BACKEND=postgres DB_AUTO_BOOTSTRAP=true node apps/build-server/dist/apps/build-server/src/index.js` 으로 부팅 후 memory backend 와 동일 시나리오 재현 |
| 검증 기준 | happy path 1건 + queue 3건 + source upload race 회피 (TASK-080) + admin 가드 모두 통과. bytea round-trip 직접 verify. |
| 산출물 | `docs/operations/postgres-dogfood-2026-07-XX.md` + e2e-postgres-dogfood.sh 신규 |

### 3.3 P2 — UX 일관성

#### TASK-083: admin UI visual + navigation 정합

| 항목 | 내용 |
|---|---|
| 모드 | Code + Design QA |
| 권장 진행 | 1) admin 4 페이지의 Build Request / Build Detail 대비 색상 / spacing / density 차이 매트릭스, 2) global header + AdminTabs 의 nav redundancy 정리 — 페이지 진입 시 global header 에서 admin 진입점 제거? 아니면 AdminTabs 를 페이지 상단 → global header 의 sub-tab 으로 이동? |
| 권장 옵션 | **옵션 a** — global header 의 admin 진입점은 그대로 (모든 페이지에서 admin 영역 진입 가능), 단 AdminTabs 의 active tab 시각 톤을 global header 와 통일 + admin 페이지의 `<h1>` 위 AdminTabs 의 spacing 을 Build Request 의 toolbar 와 정렬 |
| 검증 기준 | vitest visual snapshot (TASK-049 capture.py 활용) light + dark 양쪽 + 회귀 가드 |

### 3.4 P3 — 후속 보강

#### TASK-084: admin 가드 미허용 user deep link UX 검증

| 항목 | 내용 |
|---|---|
| 모드 | Test + Documentation |
| 권장 진행 | 비-admin user (e.g., `alice` — ADMIN_IDS 부재) 가 `/admin/builds` 직접 진입 → backend 401/403 → 화면 UX 가 무엇인지 manual e2e. 필요 시 에러 패널 / redirect 통합. |
| 검증 기준 | (1) backend 거부 정상. (2) 화면에 "권한 없음" 에러 또는 redirect to `/` 의 의도 결정. |

#### TASK-085: container port conflict 검증

| 항목 | 내용 |
|---|---|
| 모드 | Test |
| 권장 진행 | 동시 build 2건의 internalPort 가 같을 때 host port 자동 배정 (`pickFreePort`) 의 실제 동작. TASK-067 unit test 외 dogfood 회귀 가드 추가. |

#### TASK-086: build failure path 검증

| 항목 | 내용 |
|---|---|
| 모드 | Test + Documentation |
| 권장 진행 | (1) invalid Dockerfile (syntax error), (2) source archive 누락, (3) runner mid-build down, (4) docker daemon 끊김 — 4 시나리오의 BuildStatus + phase history + admin view + user-facing logs 노출을 각각 verify |
| 산출물 | `docs/operations/failure-path-2026-07-XX.md` |

## 4. 권장 다음 action

### 4.1 즉시 (P0)

- **TASK-080 source upload race mitigation** — 옵션 B + C (lifecycle 상태 + runner retry). 본 결함은 운영자가 매번 DISABLED/ACTIVE 토글해야 하므로 skill 측 automation 의 1차 결함. 1 PR · 1 cycle 로 봉인 가능.

### 4.2 후속 (P1 → P2 → P3)

- TASK-081 / TASK-082 — TASK-080 봉인 직후 동일 dogfood 환경에서 진행 (multi-runner + postgres backend). PR 2건 또는 1건 통합.
- TASK-083 / TASK-084 — admin UX 후속. 사용자 직관 결정 (navigation hierarchy vs 에러 패널 통합) 필요.

### 4.3 운영 가이드 보강

- `docs/PROJECT_PROFILE.md` §3 의 source archive 라운드트립 항목에 race 회피 절차 + TASK-080 후속 결과 추가
- `docs/operations/dogfood-e2e-2026-07-06.md` 의 "## 4. 다음 세션 권장 시작점" 섹션을 본 보완 계획과 동기화 (또는 본 문서를 후속 권장 시작점으로 인용)

## 5. 권장 진행 흐름 (다음 세션 첫 30분)

1. 본 문서 + `docs/operations/dogfood-e2e-2026-07-06.md` 동시 읽기
2. TASK-080 옵션 B+C 의 정확한 claim gate 조건 결정 — `packages/shared-contract` 의 lifecycle status 확장 여부 / 기존 enum 에 `SOURCE_UPLOAD_PENDING` 추가 vs claim 단독 gate
3. branch `codex/task-080-source-upload-race-2026-07-06` 생성 → claim gate + runner retry 동시 구현
4. 회귀 가드: race 재현 시나리오 + happy path + queue 3건 모두 PASS 확인
5. PR self-review → squash merge → workflow meta sync
6. TASK-081 (multi-runner) 또는 TASK-082 (postgres) — 사용자 우선순위 결정 후 진입

## 6. 1차 출처 cross-check

- 검증된 항목 (PASS): `docs/operations/dogfood-e2e-2026-07-06.md` §2, `backlog/2026-07-06.md` §1~§3, `session_handoff.md` §"2026-07-06 운영 검증 메모", `state.json` `recent_done_items` (PR #27~#29)
- 결함 F-1: `docs/operations/dogfood-e2e-2026-07-06.md` §3.2, `session_handoff.md` Risks & Blockers
- 결함 F-2/F-3: `docs/operations/dogfood-e2e-2026-07-06.md` §3.2, `session_handoff.md` Next Actions
- TASK-066/067/068/071a 회귀 baseline: `state.json` `current_baseline`, `work_backlog.md` §"rev 56→57", §"rev 58→59"
- TASK-078 (container self-dogfood): `backlog/2026-07-06.md` §2 + `state.json` recent_done (PR #28)