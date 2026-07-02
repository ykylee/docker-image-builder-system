# SRS 06 - MVP Must Requirements

- 문서 목적: `Must` 우선순위 요구사항만 따로 묶어 MVP 확정 범위의 기준 문서로 사용한다.
- 범위: MVP 필수 기능, 필수 품질 요구사항, 필수 정책/데이터 요구사항, 제외 범위
- 대상 독자: 프로젝트 리드, 기획자, 설계자, 구현 담당자
- 상태: draft
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/sdlc/SRS/01-priority-matrix.md`, `docs/sdlc/SRS/02-functional-requirements.md`, `docs/sdlc/SRS/03-non-functional-requirements.md`, `docs/sdlc/SRS/04-policy-and-constraints.md`

## 1. 문서 목적

이 문서는 SRS 문서 중 `Must`에 해당하는 요구사항만 재정리한 MVP 확정 범위 문서다.

이 문서의 용도:

- Step 04 설계 단계의 직접 입력
- MVP 범위 논의 시 기준선
- `Should`, `Could`, `Open`과의 경계 확인

## 2. MVP 사용자 가치 선언

MVP는 다음 사용자 가치를 반드시 충족해야 한다.

1. 사용자는 자연어로 배포 요청을 할 수 있어야 한다.
2. 시스템은 그 요청을 추적 가능한 build 작업으로 바꿀 수 있어야 한다.
3. build가 성공하면 사용자는 테스트 가능한 preview URL을 받아야 한다.
4. 실패하면 사용자는 이해 가능한 실패 안내를 받아야 한다.

이 네 가지 중 하나라도 빠지면 MVP는 미완성으로 본다.

## 3. MVP 필수 기능 요구사항

### 3.1 배포 요청 준비

- `MVP-FR-001` 시스템은 사용자의 자연어 배포 요청을 인식해야 한다.
  - 원문 대응: `FR-001`

- `MVP-FR-002` 시스템은 현재 개발 산출물의 소스 루트를 식별해야 한다.
  - 원문 대응: `FR-002`

- `MVP-FR-003` 시스템은 앱 이름을 확인하거나 제안해야 한다.
  - 원문 대응: `FR-003`

- `MVP-FR-004` 시스템은 `Dockerfile` 존재 여부를 확인해야 한다.
  - 원문 대응: `FR-004`

- `MVP-FR-005` 시스템은 `.dockerignore`를 확인하거나 생성해야 한다.
  - 원문 대응: `FR-006`

- `MVP-FR-006` 시스템은 빌드에 필요한 소스와 metadata를 패키징해야 한다.
  - 원문 대응: `FR-007`

주의:

- `Dockerfile` 자동 생성 자체는 현재 `Should`로 남긴다.
- 다만 `Dockerfile`이 없는 경우를 어떻게 처리할지는 설계 전에 운영/정책 결정을 추가로 해야 한다.

### 3.2 Build Server 필수 기능

- `MVP-FR-007` Build Server는 빌드 요청을 수신해야 한다.
  - 원문 대응: `FR-008`

- `MVP-FR-008` Build Server는 빌드 요청을 DB에 저장해야 한다.
  - 원문 대응: `FR-009`

- `MVP-FR-009` Build Server는 동일 `userId + appName` 기준 active build 존재 여부를 판정해야 한다.
  - 원문 대응: `FR-010`

- `MVP-FR-010` active build가 있으면 신규 build를 생성하지 않고 기존 작업 정보를 반환해야 한다.
  - 원문 대응: `FR-011`

- `MVP-FR-011` active build가 없으면 신규 build를 `QUEUED` 상태로 등록해야 한다.
  - 원문 대응: `FR-012`

- `MVP-FR-012` Build Server는 build 상태 조회 API를 제공해야 한다.
  - 원문 대응: `FR-013`

- `MVP-FR-013` Build Server는 build 로그 조회 API를 제공해야 한다.
  - 원문 대응: `FR-014`

### 3.3 Runner 필수 기능

- `MVP-FR-014` Runner는 `QUEUED` 상태 작업을 순차적으로 가져와 처리해야 한다.
  - 원문 대응: `FR-016`

- `MVP-FR-015` Runner는 상태 전이를 기록하면서 Docker 이미지 빌드를 수행해야 한다.
  - 원문 대응: `FR-017`, `FR-019`

- `MVP-FR-016` Runner는 빌드 로그를 저장해야 한다.
  - 원문 대응: `FR-020`

- `MVP-FR-017` Runner는 빌드 성공 후 preview 컨테이너를 실행해야 한다.
  - 원문 대응: `FR-021`

- `MVP-FR-018` Runner는 preview URL 생성에 필요한 host/port 정보를 기록해야 한다.
  - 원문 대응: `FR-022`

- `MVP-FR-019` Runner는 실패 시 오류 코드/메시지와 실패 단계를 기록해야 한다.
  - 원문 대응: `FR-024`

- `MVP-FR-023` 시스템은 preview 실행 슬롯이 부족할 때 preview 시작 요청을 service queue에 등록해야 한다.
  - 원문 대응: `FR-028`

- `MVP-FR-024` 시스템은 service queue에서 대기 중인 preview 요청을 실행 가능해지면 시작해야 한다.
  - 원문 대응: `FR-029`

### 3.4 사용자 안내 필수 기능

- `MVP-FR-020` 시스템은 build 상태를 사용자 친화적 메시지로 번역해야 한다.
  - 원문 대응: `FR-025`

- `MVP-FR-021` 시스템은 preview URL을 사용자에게 안내해야 한다.
  - 원문 대응: `FR-015`, `FR-026`

- `MVP-FR-022` 시스템은 실패 시 원인 요약과 다음 조치를 안내해야 한다.
  - 원문 대응: `FR-027`

## 4. MVP 필수 비기능 요구사항

- `MVP-NFR-001` 사용자는 Docker 지식을 요구받지 않아야 한다.
  - 원문 대응: `NFR-001`

- `MVP-NFR-002` 사용자 메시지는 상태 코드보다 행동 가능한 설명을 우선해야 한다.
  - 원문 대응: `NFR-002`

- `MVP-NFR-003` 모든 build는 고유 `buildId`로 추적 가능해야 한다.
  - 원문 대응: `NFR-003`

- `MVP-NFR-004` 주요 상태 전이는 DB에 기록 가능해야 한다.
  - 원문 대응: `NFR-004`

- `MVP-NFR-005` 동일 `userId + appName`에 대해 동시에 하나의 active build만 허용해야 한다.
  - 원문 대응: `NFR-006`

- `MVP-NFR-006` build 상태와 preview 상태는 분리되어 관리되어야 한다.
  - 원문 대응: `NFR-007`

- `MVP-NFR-007` 동시에 실행 가능한 preview service 수는 운영 기준에 따라 제한 가능해야 한다.
  - 원문 대응: `NFR-012`

- `MVP-NFR-008` build queue와 preview service queue는 독립적으로 관측 가능해야 한다.
  - 원문 대응: `NFR-013`

## 5. MVP 필수 정책 및 데이터 요구사항

- `MVP-PR-001` MVP preview URL은 우선 `host + port` 방식으로 제공할 수 있어야 한다.
  - 원문 대응: `PR-001`

- `MVP-PR-002` preview URL 데이터 모델은 미래 URL 전략 변경에 중립적이어야 한다.
  - 원문 대응: `PR-002`

- `MVP-PR-003` 사용자 입력 이름과 시스템 정규화 이름은 구분되어야 한다.
  - 원문 대응: `PR-005`

- `MVP-PR-004` 동시에 실행 가능한 preview service 수는 운영 상한값으로 제한 가능해야 한다.
  - 원문 대응: `PR-006`

- `MVP-PR-005` build queue와 preview service queue는 분리 운영할 수 있어야 한다.
  - 원문 대응: `PR-007`

- `MVP-DR-001` 시스템은 최소 `build_request`, `build_log`, `test_deployment` 수준의 데이터 모델을 가져야 한다.
  - 원문 대응: `DR-001`

- `MVP-DR-002` build 상태 모델은 `RECEIVED`부터 terminal 상태까지 추적 가능해야 한다.
  - 원문 대응: `DR-002`

- `MVP-DR-003` preview 상태 모델은 `QUEUED`, `RESERVED`, `STARTING`, `READY`, `FAILED`, `STOPPED`, `EXPIRED`를 다룰 수 있어야 한다.
  - 원문 대응: `DR-003`

- `MVP-DR-004` `TEST_READY`는 build 성공 handoff 상태이며 build queue 점유 상태로 유지하지 않아야 한다.
  - 원문 대응: `DR-004`

## 6. MVP에서 명시적으로 제외하는 항목

다음은 중요하지만 현재 MVP 확정 범위에는 넣지 않는다.

- `Dockerfile` 자동 생성 정책 확정
- preview TTL 연장 기능
- reverse proxy 또는 subdomain 기반 preview URL
- registry push
- deployment registration
- 다중 Runner 확장
- branch 단위 앱 분기

## 7. 설계 단계로 넘기기 전 체크포인트

- `userId` source system이 최소한 임시 정책 수준으로는 정리되어야 한다.
- preview host 구조가 최소 임시 운영 모델 수준으로는 정리되어야 한다.
- `Dockerfile`이 없는 경우의 처리 방식이 사용자 경험 차원에서 결정되어야 한다.
- 실패 요약의 책임 경계가 최소 원칙 수준으로는 정리되어야 한다.
- preview service 동시 실행 상한과 queue 정책이 최소 baseline 수준으로는 정리되어야 한다.

## 8. 현 단계 결론

- MVP 확정 범위는 "배포 요청 -> build 추적 -> preview URL 제공 -> 실패 안내"의 최소 폐루프로 정의한다.
- 이때 preview 제공 과정은 build queue와 별도 preview service queue 관점으로 분리해 운영할 수 있어야 한다.
- Step 04 설계는 이 문서를 기준으로 인터페이스와 상태 전이, 데이터 구조를 구체화하면 된다.
