# Docker Build Preview Platform SDLC Step 05 Entry - Design Closure And Transition

- 문서 목적: Step 04 설계 산출물을 닫기 위한 의사결정 순서, traceability 규칙, Step 05 진입 조건을 정의한다.
- 범위: 미결정 항목 우선순위, 문서 간 추적 규칙, Step 04 종료 기준, Step 05 준비 체크리스트
- 대상 독자: 프로젝트 리드, 설계자, 구현 담당자, AI 에이전트
- 상태: draft
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/sdlc/04-design-structure.md`, `docs/sdlc/SRS/05-open-issues-and-decisions.md`, `docs/sdlc/SRS/06-mvp-must-requirements.md`, `docs/sdlc/design/`

## 1. 문서 목표

이 문서는 Step 04 설계 문서 초안을 단순 나열 상태에서 실제 다음 단계 입력으로 전환하기 위한 마감 문서다.

이 문서가 답해야 하는 질문:

- 어떤 미결정 항목부터 닫아야 하는가
- 요구사항과 설계 문서를 어떻게 연결해 관리할 것인가
- Step 04를 언제 종료로 볼 수 있는가
- Step 05에 들어가기 전에 무엇이 준비되어야 하는가

## 2. 현재 위치 요약

현재 기준으로 아래 산출물은 준비되었다.

- 요구사항 기준선 문서
- SRS 우선순위/기능/비기능/정책/미결정/MVP Must 문서
- Step 04 설계 문서 6종

남아 있는 일은 크게 세 가지다.

- 미결정 항목의 닫는 순서 확정
- 설계-요구사항 traceability 표기 규칙 확정
- Step 05 진입 전에 필요한 최소 정책 결론 정리

## 3. 미결정 항목 의사결정 순서

### 3.1 의사결정 원칙

- 실행 흐름을 흔드는 항목을 먼저 닫는다.
- 여러 문서에 동시에 영향을 주는 항목을 먼저 닫는다.
- 사용자 경험보다 인프라/식별자 기반을 먼저 닫고, 그 위에 메시지/자동화 정책을 올린다.

### 3.2 권장 의사결정 순서

1. `OI-001 userId source system`
2. `OI-004 preview host 구조`
3. `OI-005 preview 인증 정책`
4. `OI-007 preview cleanup ownership`
5. `OI-010 preview 동시 실행 상한과 service queue 정책`
6. `OI-008 Dockerfile 생성 정책`
7. `OI-009 실패 요약 생성 책임`
8. `OI-006 TTL 연장 요청 처리`
9. `OI-002 팀/조직 namespace 필요 여부`
10. `OI-003 branch/environment 단위 앱 분기 모델`

### 3.3 순서 선정 이유

#### `OI-001 userId source system`

- 중복 build 판정, ownership, audit, preview 네이밍 기준이 모두 여기에 묶인다.
- API 계약, 데이터 모델, 운영 경계에 공통 영향이 있다.

필요 산출물:

- `userId` 임시 source 규칙 1개
- 비로그인 환경에서의 fallback 규칙
- `appName`과 결합되는 canonical key 설명

#### `OI-004 preview host 구조`

- preview URL 생성 방식, readiness probe 대상, 배포 레코드 구조가 여기에 의존한다.
- `PR-001`, `PR-002`, 실행 흐름 설계와 직접 연결된다.

필요 산출물:

- 단일 host인지 풀(pool) 구조인지
- host 선택 위치
- `host + port` 조합 책임 위치

#### `OI-005 preview 인증 정책`

- URL 안내 문구, readiness success 정의, 공개 범위를 동시에 흔든다.
- 사용자 메시지 설계의 핵심 전제다.

필요 산출물:

- MVP에서 비공개/내부용/공개 중 어떤 모델인지
- 인증 미적용 시 허용 범위와 주의 문구

#### `OI-007 preview cleanup ownership`

- TTL 만료 후 정리 프로세스를 누가 담당하는지 정하지 않으면 preview lifecycle이 닫히지 않는다.
- `EXPIRED`, `STOPPED` 상태 활용 기준과 직접 연결된다.

필요 산출물:

- cleanup 주체
- cleanup 트리거
- 실패 시 재시도/운영자 개입 기준

#### `OI-010 preview 동시 실행 상한과 service queue 정책`

- build queue와 preview service queue를 분리 운영하려면 반드시 닫아야 하는 운영 기준이다.
- `TEST_READY` 이후 build를 완료 처리하더라도 preview 폭주를 막기 위한 핵심 정책이다.

필요 산출물:

- 동시에 실행 가능한 preview service 상한
- queue 진입 기준
- slot 해제 기준
- 대기 중 사용자 안내 원칙

#### `OI-008 Dockerfile 생성 정책`

- validation 단계에서 실패로 끝낼지 자동 보정 흐름을 둘지 결정한다.
- 사용자 경험에는 중요하지만 실행 기반 4개 항목보다 후순위다.

필요 산출물:

- `provided only`인지
- `missing -> fail`인지
- `missing -> agent generate` 허용 여부인지

#### `OI-009 실패 요약 생성 책임`

- 서버/Runner/Skill-MCP 중 어느 계층이 최종 문구를 만드는지의 경계를 닫는다.
- 메시징 품질과 운영 디버깅 균형에 영향이 있다.

필요 산출물:

- 오류 코드 생성 책임
- 기본 요약 책임
- 최종 사용자 문구 조립 책임

#### `OI-006 TTL 연장 요청 처리`

- TTL 정책의 확장 항목이므로 MVP Step 05 직전 필수 항목은 아니다.

#### `OI-002`, `OI-003`

- 향후 멀티 테넌시/브랜치 전략과 연관되며 MVP 구현 직전 필수 닫힘 항목은 아니다.

## 4. 미결정 항목 처리 방식

각 항목은 아래 형식으로 닫는 것을 권장한다.

```text
결정 ID
배경
선택지
이번 단계 채택안
채택 이유
영향 문서
후속 보류 항목
```

권장 문서 위치:

- 요구사항 단계에서 닫는 항목: `docs/sdlc/SRS/05-open-issues-and-decisions.md` 갱신
- 설계 단계에서 닫는 항목: 별도 ADR 성격 문서 추가 또는 Step 05 문서에서 통합 관리

## 5. 설계-요구사항 Traceability 규칙

### 5.1 목적

- 설계 문서가 어떤 요구사항을 소비하는지 빠르게 확인할 수 있어야 한다.
- 구현 단계에서 기능 누락이나 과설계를 줄여야 한다.
- 검증 단계에서 테스트/체크리스트의 출발점을 명확히 해야 한다.

### 5.2 최소 표기 규칙

각 설계 문서는 최소한 아래 세 종류의 ID를 문서 상단 또는 별도 섹션에서 표기한다.

- 기능 요구사항 ID: `MVP-FR-*`
- 비기능 요구사항 ID: `MVP-NFR-*`
- 정책/데이터 요구사항 ID: `MVP-PR-*`, `MVP-DR-*`

### 5.3 권장 표기 위치

문서 상단 메타 아래에 `Traceability` 섹션을 두는 방식을 권장한다.

예시:

```markdown
## Traceability

- Functional: `MVP-FR-014`, `MVP-FR-015`, `MVP-FR-016`
- Non-Functional: `MVP-NFR-004`
- Policy/Data: `MVP-PR-001`, `MVP-DR-002`
- Open Issues: `OI-004`, `OI-008`
```

### 5.4 현재 문서 묶음 기준 매핑

| 설계 문서 | 핵심 요구사항 묶음 | 주요 미결정 항목 |
| --- | --- | --- |
| `01-system-context-and-responsibilities.md` | `MVP-FR-001`~`024`, `MVP-NFR-001`~`002`, `MVP-NFR-007`~`008` | `OI-001`, `OI-004`, `OI-009`, `OI-010` |
| `02-domain-model-and-state-transitions.md` | `MVP-FR-009`~`024`, `MVP-NFR-003`~`008`, `MVP-DR-001`~`004` | `OI-001`, `OI-007`, `OI-010` |
| `03-api-contract-design.md` | `MVP-FR-007`~`013`, `021`~`024`, `MVP-PR-002`, `MVP-PR-005` | `OI-001`, `OI-004`, `OI-005`, `OI-010` |
| `04-data-model-design.md` | `MVP-FR-008`~`024`, `MVP-NFR-003`~`008`, `MVP-DR-001`~`004` | `OI-001`, `OI-007`, `OI-010` |
| `05-build-and-preview-execution-flow.md` | `MVP-FR-014`~`024`, `MVP-NFR-004`, `MVP-NFR-007`, `MVP-PR-001`, `MVP-PR-004`, `MVP-PR-005` | `OI-004`, `OI-007`, `OI-008`, `OI-010` |
| `06-user-messaging-and-failure-handling.md` | `MVP-FR-020`~`024`, `MVP-NFR-001`~`002`, `MVP-NFR-008` | `OI-005`, `OI-008`, `OI-009`, `OI-010` |

### 5.5 구현 단계 연결 규칙

Step 05 이후 구현 문서나 작업 항목은 아래 단위로 traceability를 이어받는 것을 권장한다.

- 기능 작업: `MVP-FR-*`
- 운영/품질 작업: `MVP-NFR-*`
- 설계 선택 또는 정책 반영 작업: `MVP-PR-*`, `MVP-DR-*`, `OI-*`

예시:

```text
TASK-005-A Build request API skeleton
Refs: MVP-FR-007, MVP-FR-008, MVP-FR-011, MVP-NFR-003
Depends on: 03-api-contract-design.md, 04-data-model-design.md
```

## 6. Step 04 종료 기준

Step 04는 아래 조건을 만족하면 종료로 본다.

- 설계 문서 6종 초안이 모두 존재한다.
- 각 문서의 책임 범위가 중복 없이 구분된다.
- 미결정 항목 우선순위가 명시된다.
- 요구사항-설계 traceability 규칙이 문서화된다.
- Step 05 진입 전에 필요한 정책 결론 목록이 정리된다.

현재 상태 판단:

- 설계 문서 6종: 충족
- 문서 책임 구분: 충족
- 미결정 항목 우선순위: 본 문서에서 충족
- traceability 규칙: 본 문서에서 충족
- Step 05 진입 조건: 아래 섹션에서 정리

따라서 현재 기준으로 Step 04는 종료 가능 상태로 본다.

## 7. Step 05 진입 조건

Step 05는 구현 또는 상세 기술 설계 착수 전 준비 단계로 본다.

최소 진입 조건:

- `OI-001`, `OI-004`, `OI-005`, `OI-007`, `OI-010`에 대한 임시 결정 또는 baseline 결정 존재
- 구현 시작 단위의 작업 분해 기준 존재
- Build Server / Runner / Skill-MCP 중 어디서 시작할지 우선 구현 축 결정
- 문서 기준 `source of truth`가 `docs/sdlc/`로 정렬되어 있음

권장 추가 조건:

- Step 05 작업 항목에 `Refs:` 규칙 적용
- 문서별 traceability 섹션 보강
- 구현 제외 범위 재확인

## 8. Step 05 첫 작업 제안

권장 순서:

1. `OI-001`, `OI-004`, `OI-005`, `OI-007`, `OI-010`에 대한 baseline decision 정리
2. Build Server 우선 구현 여부 확정
3. 구현용 backlog 초안 작성
4. 컴포넌트별 작업 패키지 분해

이 순서를 권장하는 이유:

- 식별자와 preview 운영 모델이 닫혀야 API/데이터 모델이 흔들리지 않는다.
- 구현 축이 먼저 정해져야 backlog가 의미 있는 단위로 쪼개진다.

## 9. 현 단계 결론

- Step 04는 설계 본문 작성 단계에서 마감 정리 단계로 전환되었고, 본 문서로 종료 기준과 다음 단계 진입 조건이 정리되었다.
- 다음 단계의 핵심은 새 설계 문서를 더 추가하는 것이 아니라, 상위 미결정 항목을 baseline decision으로 닫고 구현 가능한 작업 단위로 분해하는 것이다.
