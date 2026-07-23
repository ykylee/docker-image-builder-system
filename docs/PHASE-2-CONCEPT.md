# Phase 2 개발 컨셉 — preview-era 청산 → 배포 능력 완성

- 문서 목적: Phase 2 의 축·범위·마일스톤·완료 기준을 하나의 기준으로 정의한다. Phase 1 종료(v0.2.0/v0.2.1) 이후의 개발 방향 단일 출처.
- 범위: 컨셉 근거(원 설계 대비 격차 실측), 마일스톤 P2-M1~M5, 순서와 완료 기준, 리스크
- 대상 독자: 프로젝트 리드, 각 계층 구현자, AI agent
- 상태: draft (**P2-M1 완료** 반영)
- 최종 수정일: 2026-07-23
- 진입 baseline: **v0.2.1** (2026-07-23)
- 관련 문서: [Phase 1 회고](./PHASE-1-RETROSPECTIVE.md), [Step 15 로드맵](./sdlc/15-refactoring-roadmap-and-milestones.md), [CHANGELOG](../CHANGELOG.md)

## 1. 컨셉 한 줄

**preview-era 잔재를 청산해 `build → container test → deploy → result delivery` 모델로 코드를 정렬하고, 그 위에 외부 배포 능력을 올린다.**

## 2. 왜 이 축인가

제품 목적은 *"외부 사용자 또는 AI 에이전트가 전달한 앱 산출물을 받아 Docker build → 컨테이너 테스트 → **외부 시스템 배포** → 결과 전달까지 자동화"* 다. Phase 1 은 앞 두 단계와 그 주변 인프라(모니터 UI · 운영 가드 · 문서 · e2e)를 만들었고, **뒤 두 단계는 아직 없다.**

동시에 코드는 문서 canonical 모델을 따라가지 못하고 **하이브리드**에 멈춰 있다:

```
착수 전:  … DOCKER_BUILD_COMPLETED → PREVIEW_QUEUED → PREVIEW_READY → DEPLOYMENT_STARTED → …
                                      └── preview-era 잔재 ──┘        └── 신 모델 ──┘

TASK-158: … DOCKER_BUILD_COMPLETED → CONTAINER_TEST_STARTED → CONTAINER_TEST_PASSED → DEPLOYMENT_STARTED → …
```

`CONTAINER_TEST_*` phase 가 없어 **"컨테이너 테스트"가 1급 개념이 아니었다** — 제품 목적의 한 단계가 모델에 존재하지 않았다. **P2-M1 Step 1(TASK-158)에서 해소**했고 e2e 가 10 phase 를 실증한다.

Step 15 로드맵 §3 이 이 상황을 정확히 경고한다:

> 기능 추가와 리팩토링을 분리하되, **새 기능이 기존 preview-era 구조 위에 쌓이지 않도록 먼저 기반 refactor 를 연다.**

따라서 순서는 **정합 먼저, 배포 나중**이다. 외부 배포를 하이브리드 위에 얹으면 청산 비용이 계층마다 곱해진다.

## 3. 실측 — 청산 대상의 크기

2026-07-23 기준 preview-era 심볼(`previewStatus` / `previewUrl` / `previewTtlMinutes` / `TestDeployment` / `TEST_READY` / `PREVIEW_QUEUED` / `PREVIEW_READY`) 출현 수:

> **주의**: 최초 측정치 407 은 빌드 산출물(`dist/`)을 포함해 부풀려진 값이었다. 아래는 **소스만** 재측정한 값이다.

| 계층 | 출현(소스) | 성격 |
|---|---:|---|
| `packages/shared-contract/src` | **26** | 계약 원천 — 여기부터 바꿔야 나머지가 컴파일 타임에 끌려온다 |
| `apps/build-server` (src 124 + tests 52) | **176** | repository / service / routes / openapi |
| `apps/skill_mcp` | **65** | AI 에이전트 진입점. `preview_readiness_checker` 등 이름까지 preview-era |
| `apps/build-monitor/react` | **50** | PhaseTimeline / StatusPill / BuildDetail |
| `apps/runner` | **24** | phase 보고 순서 |
| `packages/db/src` | **4** | legacy 컬럼 + `test-deployment.ts` 스키마 |
| **합계** | **345** | (이 중 44 는 TASK-158 에서 처리됨) |

### 3.1 이미 끝난 것 (중복 작업 방지)

- **DB 스키마 분리는 완료** — migration `0003_build_test_and_deployment_attempt.sql` 로 `build_test` / `deployment_attempt` 테이블이 이미 존재한다 (TASK-053).
- 다만 `build_request` 의 `preview_status` / `preview_ttl_minutes` / `preview_url` 은 **의도적으로 남긴 shim** 이다. 스키마 주석이 그렇게 명시한다:
  > `// Legacy preview-era field. Retained during TASK-053 so the current …`
- 즉 **가산(신규 테이블)은 끝났고 감산(레거시 제거)이 남았다.** Phase 2 는 감산을 닫는다.

## 4. Phase 1 이 남긴 안전망 (이 리팩터가 가능한 이유)

345곳을 건드리는 리팩터를 감당할 수 있는 것은 Phase 1 의 자산 덕분이다:

| 자산 | 리팩터에서의 역할 |
|---|---|
| shared-contract 계약 컴파일 타임 고정 (TASK-130/151) | 계약을 바꾸면 **소비자 드리프트가 TSC 에서 즉시 잡힌다** |
| 회귀 테스트 277 / 181 / 8 pkg | 의미 변경의 부작용 검출 |
| **e2e 13종 + nightly 자동화** (TASK-156) | 프로덕션 경로(이미지 빌드·claim·실 컨테이너) 회귀 검출 |
| 운영 가드 4종 | UI 정렬 시 시각/CSS 회귀 방어 |
| 시각 QA baseline | PhaseTimeline 재구성의 시각 회귀 검출 |

> Phase 1 의 교훈 "**안 돌린 경로는 검증된 게 아니다**"(TASK-153/155)를 Phase 2 내내 적용한다 — 각 마일스톤 완료 판정에 e2e 를 포함한다.

## 5. 마일스톤

Step 15 의 M1~M5 잔여분을 Phase 2 기준으로 재정의한다.

### P2-M1 — 계약 청산 (Contract Reset 완결)

> **진행: P2-M1 완료.** Step 1 phase 이름 변경(TASK-158) / Step 2 legacy status 제거(TASK-159) / Step 3 legacy 응답 필드 + migration 0007(TASK-160).
>
> **P2-M2 로 넘긴 것** (엔드포인트 재설계와 결합돼 분리 불가): `previewUrl`→`runtimeUrl` 정렬 · `previewStatuses` enum · `TestDeployment` DTO 일가 · 저장소의 임시 어댑터 `executionToPreviewStatus` · `reportPreviewStatus`/`queueTestDeployment`/`getTestDeployment` 메서드명.
>
> **범위 정정**: 앞선 407 은 빌드 산출물(`dist/`)을 포함한 수치였다. 소스만 재측정한 실제 표면은 **345**(shared-contract/src 26 · build-server 176(src 124+tests 52) · skill_mcp 65 · build-monitor 50 · runner 24 · db 4). 계약 자체는 26 으로 작다.

- **대상**: `packages/shared-contract/src` (26)
- **내용**: ~~`PREVIEW_QUEUED`/`PREVIEW_READY` → **`CONTAINER_TEST_STARTED`/`CONTAINER_TEST_PASSED`**~~ **완료** — 컨테이너 테스트가 1급 phase 가 됐다(e2e 로 10 phase 실증). `TestDeployment` → canonical test 결과 모델. `previewUrl`/`previewTtlMinutes` 는 optional runtime artifact 로 격하.
- **완료 기준**: ✅ TS 5 packages clean / ✅ 잔여 legacy 범위를 위 note 에 명시 / ✅ `buildPhases` 단일 출처 유지 / ✅ e2e 13/13 PASS.

### P2-M2 — 서버 정렬
- **대상**: `apps/build-server/src` (117) + `packages/db` (12)
- **내용**: repository(memory/postgres 양쪽 동일 semantics) / service / routes / OpenAPI 재정렬. `build_request` 의 legacy preview 컬럼 제거 migration **0007**.
- **완료 기준**: memory·postgres 양 backend smoke 통과 / OpenAPI 재생성 / **e2e local+compose 11종 PASS** / migration up 검증.

### P2-M3 — Runner 정렬
- **대상**: `apps/runner` (28)
- **내용**: `claim → source prepare → build → container test → deploy → finalize` 순서 명문화. 컨테이너 테스트 결과를 `build_test` 에 first-class 로 보고.
- **완료 기준**: happy path + failed path 의 phase/error 일관성 / go test 통과 / **실이미지 e2e(production-semantic) PASS**.

### P2-M4 — 소비자 정렬
- **대상**: `apps/build-monitor/react` (50) + `apps/skill_mcp` (77)
- **내용**: PhaseTimeline/StatusPill/BuildDetail 을 새 phase 모델로. `DESIGN.md` v3. skill_mcp 의 preview-era 이름 정리(`preview_readiness_checker` → 컨테이너 테스트 기준 명명) + payload 재정렬.
- **완료 기준**: vitest / skill_mcp pytest 통과 / 시각 QA 구조 검증 통과 / **skill_mcp 가 실서버 대상으로 검증**(현재는 단위 테스트만 — §7 리스크).

### P2-M5 — 배포 능력 (제품 목적 완성)
- **대상**: `apps/runner/internal/deploy` + build-server 결과 전달
- **내용**: **외부 배포 adapter v1** (최소 1종) + **결과 전달**(webhook/notification). 현재 `RUNNER_DEPLOY_MODE` 기본은 `skeleton` 이고 `cli` 도 레지스트리 push 까지다.
- **완료 기준**: deploy success/failure 가 Build Server status query 에 반영 / 운영자가 end-to-end 확인 가능한 smoke 문서와 명령 존재 / **신규 e2e 1종 추가**.

## 6. 순서와 원칙

```
P2-M1 계약  →  P2-M2 서버  →  P2-M3 runner  →  P2-M4 소비자  →  P2-M5 배포
   (contract/persistence 선행, UI 나중 — 로드맵 §3)
```

- **contract 가 항상 선행한다.** 계약을 먼저 바꾸면 나머지 계층의 드리프트가 TSC 에서 끌려 나온다(Phase 1 의 TASK-130 자산).
- **memory / postgres 는 항상 같은 semantics 로 함께 바꾼다** (TASK-155 의 교훈 — 한쪽만 고치면 backend 별로 동작이 갈린다).
- **각 마일스톤 완료 판정에 e2e 를 포함한다.** 단위 테스트 green 은 프로덕션 경로 보증이 아니다.
- **한 마일스톤 = 한 sync commit 단위**로 봉인하고 workflow meta 를 갱신한다(Phase 1 규약 유지).

## 7. 리스크

| 리스크 | 완화 |
|---|---|
| 345곳 동시 변경의 폭발 | 계층 단위 마일스톤으로 분할 + 계약 선행으로 컴파일러가 잔여를 지목하게 함 |
| **regex 일괄 치환의 다중 동시 결함** (TASK-130/151 재발 패턴) | read + 1:1 치환 원칙. 대량 변경일수록 regex 금지 |
| `skill_mcp` 가 단위 테스트만 통과 (실서버 미검증) | P2-M4 에서 실서버 대상 검증 경로를 신설 |
| ~~runner e2e 2종의 약한 신호~~ | **해소 (TASK-157)** — hard assertion 화 + 근본 결함 3건 수정 |
| 배포 adapter 의 대상 선택 미정 | P2-M5 진입 전 별도 결정 필요 — §8 |

## 8. 진입 전 결정 대기

1. **외부 배포 adapter 의 1호 대상** — compose / k8s / remote host(ssh) / 기존 레지스트리 push 확장 중 무엇인가.
2. **결과 전달 채널** — webhook / Slack / Nextcloud Tasks(기존 후보) 중 무엇을 1호로.
3. ~~**deprecated alias 유지 기간**~~ — **결정됨(2026-07-23)**: 외부 소비자가 없으므로 **즉시 제거**(유예 없음).
4. **visual baseline 의 외부 LFS 정책** (Phase 1 이월) — P2-M4 의 시각 회귀 판정 강도에 영향.

## 9. Phase 2 완료 판정

- 코드에 preview-era 심볼 **0** (deprecated alias 정책상 잔존분은 문서에 명시).
- `build → container test → deploy → result delivery` 4단계가 모두 **1급 phase** 로 존재하고 e2e 로 검증됨.
- 외부 배포 adapter 1종 + 결과 전달 1종이 동작하고 운영 문서가 존재.
- 회귀 baseline 이 Phase 1 대비 후퇴하지 않음(테스트 수 · e2e 13종 이상 · 가드 4종).
