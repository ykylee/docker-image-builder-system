# Docker Build And Deployment Automation Platform SDLC Step 05 Entry - Design Closure And Transition

- 문서 목적: Step 04 설계 산출물을 닫기 위한 의사결정 순서, traceability 규칙, Step 05 진입 조건을 정의한다.
- 범위: 미결정 항목 우선순위, 문서 간 추적 규칙, Step 04 종료 기준, Step 05 준비 체크리스트
- 대상 독자: 프로젝트 리드, 설계자, 구현 담당자, AI 에이전트
- 상태: draft
- 최종 수정일: 2026-07-03
- 관련 문서: `docs/sdlc/04-design-structure.md`, `docs/sdlc/SRS/05-open-issues-and-decisions.md`, `docs/sdlc/SRS/06-mvp-must-requirements.md`, `docs/sdlc/design/`

## 1. 현재 위치 요약

- 요구사항 기준선 문서
- SRS 우선순위/기능/비기능/정책/미결정/MVP Must 문서
- Step 04 설계 문서 6종

남아 있는 일은 크게 세 가지다.

- 미결정 항목의 닫는 순서 확정
- 설계-요구사항 traceability 표기 규칙 확정
- Step 05 진입 전에 필요한 최소 정책 결론 정리

## 2. 미결정 항목 의사결정 순서

권장 의사결정 순서:

1. `OI-001 userId source system`
2. `input normalization boundary`
3. `deploy target protocol`
4. `runtime host structure`
5. `runtime cleanup ownership`
6. `concurrency limit and service queue policy`
7. `OI-008 Dockerfile 생성 정책`
8. `OI-009 실패 요약 생성 책임`

## 3. 순서 선정 이유

- 식별자와 입력 경계가 닫혀야 API 계약과 데이터 모델이 흔들리지 않는다.
- deploy target protocol이 닫혀야 Runner 최종 범위와 데이터 모델이 안정된다.
- cleanup ownership과 concurrency policy가 닫혀야 test runtime 운영 정책이 완결된다.

## 4. 설계-요구사항 Traceability 규칙

각 설계 문서는 최소한 아래 세 종류의 ID를 문서 상단 또는 별도 섹션에서 표기한다.

- 기능 요구사항 ID: `MVP-FR-*`
- 비기능 요구사항 ID: `MVP-NFR-*`
- 정책/데이터 요구사항 ID: `MVP-PR-*`, `MVP-DR-*`

## 5. 현재 문서 묶음 기준 매핑

| 설계 문서 | 핵심 요구사항 묶음 |
| --- | --- |
| `01-system-context-and-responsibilities.md` | `MVP-FR-001`~`024`, `MVP-NFR-001`~`002`, `MVP-NFR-007`~`008` |
| `02-domain-model-and-state-transitions.md` | `MVP-FR-009`~`024`, `MVP-NFR-003`~`008`, `MVP-DR-001`~`004` |
| `03-api-contract-design.md` | `MVP-FR-007`~`013`, `021`~`024` |
| `04-data-model-design.md` | `MVP-FR-008`~`024`, `MVP-NFR-003`~`008`, `MVP-DR-001`~`004` |
| `05-build-and-preview-execution-flow.md` | `MVP-FR-014`~`024`, `MVP-NFR-004`, `MVP-NFR-007`, `MVP-PR-001`, `MVP-PR-004`, `MVP-PR-005` |
| `06-user-messaging-and-failure-handling.md` | `MVP-FR-021`~`024`, `MVP-NFR-001`~`002` |

## 6. Step 04 종료 기준

- 설계 문서 6종 초안이 모두 존재한다.
- 각 문서의 책임 범위가 중복 없이 구분된다.
- 미결정 항목 우선순위가 명시된다.
- 요구사항-설계 traceability 규칙이 문서화된다.

## 7. Step 05 진입 조건

- `OI-001`, 입력 정규화 경계, deploy target protocol, cleanup ownership, concurrency policy에 대한 임시 결정 또는 baseline 결정 존재
- 구현 시작 단위의 작업 분해 기준 존재
- Build Server / Runner / Skill-MCP 중 어디서 시작할지 우선 구현 축 결정
- 문서 기준 `source of truth`가 `docs/sdlc/`로 정렬되어 있음

## 8. Step 05 첫 작업 제안

1. 식별자 / 입력 경계 / deploy target baseline decision 정리
2. Build Server 우선 구현 여부 확정
3. 구현용 backlog 초안 작성
4. 컴포넌트별 작업 패키지 분해

## 9. 현 단계 결론

- Step 04는 설계 본문 작성 단계에서 마감 정리 단계로 전환되었고, 본 문서로 종료 기준과 다음 단계 진입 조건이 정리되었다.
- 다음 단계의 핵심은 새 설계 문서를 더 추가하는 것이 아니라, 상위 미결정 항목을 baseline decision으로 닫고 구현 가능한 작업 단위로 분해하는 것이다.
