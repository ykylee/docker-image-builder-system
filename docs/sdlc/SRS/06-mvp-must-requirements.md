# SRS 06 - MVP Must Requirements

- 문서 목적: `Must` 우선순위 요구사항만 따로 묶어 MVP 확정 범위의 기준 문서로 사용한다.
- 범위: MVP 필수 기능, 필수 품질 요구사항, 필수 정책/데이터 요구사항, 제외 범위
- 대상 독자: 프로젝트 리드, 기획자, 설계자, 구현 담당자
- 상태: draft
- 최종 수정일: 2026-07-03
- 관련 문서: `docs/sdlc/SRS/01-priority-matrix.md`, `docs/sdlc/SRS/02-functional-requirements.md`, `docs/sdlc/SRS/03-non-functional-requirements.md`, `docs/sdlc/SRS/04-policy-and-constraints.md`

## 1. 문서 목적

이 문서는 SRS 문서 중 `Must`에 해당하는 요구사항만 재정리한 MVP 확정 범위 문서다.

## 2. MVP 사용자 가치 선언

MVP는 다음 사용자 가치를 반드시 충족해야 한다.

1. 사용자는 자연어로 배포 요청을 할 수 있어야 한다.
2. 시스템은 그 요청을 추적 가능한 build 작업으로 바꿀 수 있어야 한다.
3. build가 성공하면 시스템은 컨테이너 테스트를 수행하고 외부 시스템에 결과물을 전달해야 한다.
4. 실패하면 사용자는 이해 가능한 실패 안내를 받아야 한다.

## 3. MVP 필수 기능 요구사항

### 3.1 배포 요청 준비

- `MVP-FR-001` 시스템은 사용자의 자연어 배포 요청을 인식해야 한다.
- `MVP-FR-002` 시스템은 현재 개발 산출물의 소스 루트를 식별해야 한다.
- `MVP-FR-003` 시스템은 앱 이름을 확인하거나 제안해야 한다.
- `MVP-FR-004` 시스템은 `Dockerfile` 존재 여부를 확인해야 한다.
- `MVP-FR-005` 시스템은 `.dockerignore`를 확인하거나 생성해야 한다.
- `MVP-FR-006` 시스템은 Git URL 또는 Zip 입력을 공통 build 입력 계약으로 정규화해야 한다.

### 3.2 Build Server 필수 기능

- `MVP-FR-007` Build Server는 빌드 요청을 수신해야 한다.
- `MVP-FR-008` Build Server는 빌드 요청을 DB에 저장해야 한다.
- `MVP-FR-009` Build Server는 동일 `userId + appName` 기준 active build 존재 여부를 판정해야 한다.
- `MVP-FR-010` active build가 있으면 신규 build를 생성하지 않고 기존 작업 정보를 반환해야 한다.
- `MVP-FR-011` active build가 없으면 신규 build를 `QUEUED` 상태로 등록해야 한다.
- `MVP-FR-012` Build Server는 build 상태 조회 API를 제공해야 한다.
- `MVP-FR-013` Build Server는 build 로그 조회 API를 제공해야 한다.

### 3.3 Runner 필수 기능

- `MVP-FR-014` Runner는 `QUEUED` 상태 작업을 순차적으로 가져와 처리해야 한다.
- `MVP-FR-015` Runner는 상태 전이를 기록하면서 Docker 이미지 빌드를 수행해야 한다.
- `MVP-FR-016` Runner는 빌드 로그를 저장해야 한다.
- `MVP-FR-017` Runner는 빌드 성공 후 컨테이너를 실행하고 최소 동작 테스트를 수행해야 한다.
- `MVP-FR-018` Runner는 테스트 결과와 필요한 host/port 정보를 기록해야 한다.
- `MVP-FR-019` Runner는 테스트 성공 시 외부 시스템 배포를 수행해야 한다.
- `MVP-FR-020` Runner는 실패 시 오류 코드/메시지와 실패 단계를 기록해야 한다.

### 3.4 사용자 안내 필수 기능

- `MVP-FR-021` 시스템은 build/test/deploy 상태를 사용자 친화적 메시지로 번역해야 한다.
- `MVP-FR-022` 시스템은 polling 기반으로 최종 상태를 조회할 수 있게 해야 한다.
- `MVP-FR-023` 시스템은 이벤트 알림 방식이 채택되면 핵심 이벤트를 전송할 수 있어야 한다.
- `MVP-FR-024` 시스템은 실패 시 원인 요약과 다음 조치를 안내해야 한다.

## 4. MVP 필수 비기능 요구사항

- `MVP-NFR-001` 사용자는 Docker 지식을 요구받지 않아야 한다.
- `MVP-NFR-002` 사용자 메시지는 상태 코드보다 행동 가능한 설명을 우선해야 한다.
- `MVP-NFR-003` 모든 build는 고유 `buildId`로 추적 가능해야 한다.
- `MVP-NFR-004` 주요 상태 전이는 DB에 기록 가능해야 한다.
- `MVP-NFR-005` 동일 `userId + appName`에 대해 동시에 하나의 active build만 허용해야 한다.
- `MVP-NFR-006` build 상태, test 상태, deploy 상태는 분리되어 관리되어야 한다.
- `MVP-NFR-007` 동시에 실행 가능한 테스트 또는 preview service 수는 운영 기준에 따라 제한 가능해야 한다.
- `MVP-NFR-008` build queue와 service queue는 독립적으로 관측 가능해야 한다.

## 5. MVP 필수 정책 및 데이터 요구사항

- `MVP-PR-001` 테스트 실행 결과는 우선 `host + port` 방식으로 노출할 수 있어야 한다.
- `MVP-PR-002` 실행 결과 URL 데이터 모델은 미래 URL 전략 변경에 중립적이어야 한다.
- `MVP-PR-003` 사용자 입력 이름과 시스템 정규화 이름은 구분되어야 한다.
- `MVP-PR-004` 동시에 실행 가능한 테스트 또는 preview service 수는 운영 상한값으로 제한 가능해야 한다.
- `MVP-PR-005` build queue와 service queue는 분리 운영할 수 있어야 한다.
- `MVP-DR-001` 시스템은 최소 `build_request`, `build_log`, `build_test`, `deployment_attempt` 수준의 데이터 모델을 가져야 한다.
- `MVP-DR-002` build 상태 모델은 `RECEIVED`부터 terminal 상태까지 추적 가능해야 한다.
- `MVP-DR-003` test 상태 모델과 deploy 상태 모델은 각각 별도 추적 가능해야 한다.
- `MVP-DR-004` `DEPLOY_SUCCESS`는 build 성공 handoff 상태이며 build queue 점유 상태로 유지하지 않아야 한다.

## 6. MVP에서 명시적으로 제외하는 항목

- `Dockerfile` 자동 생성 정책 확정
- preview TTL 연장 기능
- reverse proxy 또는 subdomain 기반 URL
- 모든 배포 프로토콜 동시 지원
- 다중 Worker 확장
- branch 단위 앱 분기

## 7. 설계 단계로 넘기기 전 체크포인트

- `userId` source system이 최소한 임시 정책 수준으로는 정리되어야 한다.
- 테스트용 실행 host 구조가 최소 임시 운영 모델 수준으로는 정리되어야 한다.
- `Dockerfile`이 없는 경우의 처리 방식이 사용자 경험 차원에서 결정되어야 한다.
- deploy target 프로토콜이 최소 baseline 수준으로는 정리되어야 한다.
- 실행 자원 동시 상한과 queue 정책이 최소 baseline 수준으로는 정리되어야 한다.

## 8. 현 단계 결론

- MVP 확정 범위는 "배포 요청 -> build 추적 -> 컨테이너 테스트 -> 외부 시스템 전달 -> 실패 안내"의 최소 폐루프로 정의한다.
- Step 04 설계는 이 문서를 기준으로 인터페이스와 상태 전이, 데이터 구조를 구체화하면 된다.
