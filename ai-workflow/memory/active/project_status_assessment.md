<!-- standard-ai-workflow-kit: v0.11.21-beta -->

# Project Workflow Maturity Assessment

- 문서 목적: 프로젝트의 AI 워크플로우 도입 수준을 자가 진단하고 개선 포인트를 도출한다.
- 범위: 기본 문서화, 도구 활용도, 프로세스 준수도, 지능화 수준
- 대상 독자: 프로젝트 리드, AI 에이전트, 온보딩 담당자
- 상태: stable
- 최종 수정일: 2026-07-03
- 관련 문서: [공통 표준](../core/global_workflow_standard.md)

## 1. 진단 요약 (Executive Summary)

- **현재 레벨**: Beta
- **핵심 강점**:
  - canonical source가 `docs/sdlc/`와 shared contract baseline으로 단일화되어 있고, root 개념 문서(STATE_MODEL, IDENTITY_MODEL)와 정합성 보정이 끝났다.
  - 21개 TASK 중 20개가 done으로 닫혀 있고, session_handoff / work_backlog / state.json / 일별 백로그가 같은 current focus를 가리킨다.
  - Step 04~12 SDLC 문서, 5개 baseline decision, SDLC 리뷰/보고 패키지, 발표용 HTML 데크까지 일관된 흐름으로 정리되어 있다.
- **개선 필요 항목**:
  - 자동화된 workflow lint와 session-start 스킬이 없어 문서 정합성은 수동 점검에 머물러 있다.
  - 실행 명령/검증 절차가 placeholder 상태이며, 구현 스캐폴드(TASK-017) 진입 시점에 한 번 더 좁혀야 한다.
  - medium priority decision과 `OI-006`/`OI-008`/`OI-009` 후속 결정이 미정 상태로 남아 있다.
- **차기 목표**:
  - TASK-017 shared package 또는 `apps/build-server` API 스캐폴드 착수와 함께 placeholder를 실제 명령으로 교체
  - `state.json.commands`와 `docs/PROJECT_PROFILE.md §3`을 같은 baseline으로 묶고, 자동 lint 1차 도입 검토

---

## 2. 진단 매트릭스 (Assessment Matrix)

| 구분 | 진단 항목 | 현황 (0~3) | 비고 |
| --- | --- | --- | --- |
| **기본 문서** | `PROJECT_PROFILE.md`가 최신 상태인가? | 2 | 명령 placeholder는 이번 브랜치에서 좁힘 |
| | `session_handoff.md`가 매 세션 갱신되는가? | 2 | 일별 백로그와 함께 갱신되지만 일부 일자에 follow-up 표기 잔존 |
| | `work_backlog.md`가 실제 작업과 동기화되는가? | 3 | TASK 상태와 1:1 동기화 확인 |
| **도구 활용** | MCP 도구를 사용하여 문서를 조회/수정하는가? | 1 | 세션 단위 수동 활용 위주 |
| | `workflow-linter`를 주기적으로 실행하는가? | 0 | 미도입 |
| | `session-start` 스킬로 컨텍스트를 복원하는가? | 0 | 미도입, 본 assessment 문서가 그 역할 일부 수행 |
| **프로세스** | 작업 전 브리핑 및 계획 수립을 수행하는가? | 2 | TASK-### 단위로 Plan/Act/Validate/Result 기록 |
| | 검증(Validate) 단계를 반드시 거치는가? | 2 | 문서 단계는 정합성 점검, 런타임 검증은 구현 후 도입 |
| | 작업 모드(Task Modes)를 명시하여 최적화하는가? | 1 | Analysis/Planning/Documentation 등 라벨은 있으나 worker 분배는 정례화 전 |
| **품질/거버넌스** | `maturity_matrix.json`과 문서가 동기화되는가? | 1 | 본 assessment 문서가 그 자리 대체 |
| | 릴리즈 노트 형식을 준수하여 배포하는가? | 0 | 첫 배포 전 단계 |

*점수 가이드: 0(미도입), 1(수동 도입), 2(부분 자동화), 3(완전 정착)*

---

## 3. 레벨별 정의 (Level Definitions)

### [Alpha] 도입 단계
- 기본 운영 문서(`memory/`)가 존재함.
- 에이전트가 문서를 수동으로 읽고 갱신함.
- 검증 절차가 정의되어 있으나 누락되는 경우가 있음.

### [Beta] 가속 단계
- MCP 도구 및 표준 스킬을 적극 활용함.
- 세션 간 인계(`handoff`)가 정형화됨.
- **작업 모드**를 인지하여 효율적으로 작업을 분담함.

### [Stable] 최적화 단계
- 워크플로우 린트가 자동화되어 문서 정합성이 상시 보장됨.
- 성숙도 매트릭스에 기반한 지능형 작업 분배가 이루어짐.
- 프로젝트 특화 스킬 및 도구가 커스텀 개발되어 적용됨.

---

## 4. 향후 개선 계획 (Roadmap to Next Level)

- [ ] TASK-017 착수 시 `state.json.commands`와 `docs/PROJECT_PROFILE.md §3`의 placeholder를 실제 명령으로 좁히기
- [ ] `docs/MVP_ONBOARDING.md`, `docs/CONCEPT_REFINEMENT.md` legacy 루트 문서 superseded 배너 적용 또는 archive 이동
- [ ] `docs/sdlc/decisions/` 외 medium priority decision 후속 처리(`OI-006`, `OI-008`, `OI-009`)
- [ ] workflow-lint 또는 session-start 보조 스크립트 1차 도입 검토

## 다음에 읽을 문서
- [공통 표준](../core/global_workflow_standard.md)
