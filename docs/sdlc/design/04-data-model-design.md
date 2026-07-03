# Step 04 Design 04 - Data Model Design

- 문서 목적: Docker Build And Deployment Automation Platform MVP의 데이터 저장 구조를 정의한다.
- 범위: `build_request`, `build_log`, `build_test`, `deployment_attempt`의 필드, 관계, 인덱스, 조회 패턴, 무결성 규칙
- 대상 독자: 설계자, 구현 담당자, DB 설계자, 프로젝트 리드
- 상태: draft
- 최종 수정일: 2026-07-03
- 관련 문서: `docs/sdlc/design/02-domain-model-and-state-transitions.md`, `docs/sdlc/design/03-api-contract-design.md`, `docs/sdlc/SRS/06-mvp-must-requirements.md`

## Traceability

- Functional: `MVP-FR-008` ~ `MVP-FR-024`
- Non-Functional: `MVP-NFR-003`, `MVP-NFR-004`, `MVP-NFR-005`, `MVP-NFR-006`, `MVP-NFR-007`, `MVP-NFR-008`
- Policy/Data: `MVP-PR-004`, `MVP-PR-005`, `MVP-DR-001`, `MVP-DR-002`, `MVP-DR-003`, `MVP-DR-004`
- Open Issues: `OI-001`, `OI-007`, `OI-010`

## 1. 문서 목표

이 문서는 MVP의 핵심 도메인 엔티티를 실제 저장 구조로 어떻게 표현할지 정의한다.

## 2. 데이터 모델 개요

MVP에서 기본 저장 단위는 아래 네 테이블이다.

```text
build_request
build_log
build_test
deployment_attempt
```

역할:

- `build_request`: build lifecycle의 기준 테이블
- `build_log`: 실행 로그 append-only 저장소
- `build_test`: 컨테이너 테스트 lifecycle 저장소
- `deployment_attempt`: 외부 배포 lifecycle 저장소

## 3. 공통 설계 원칙

- 모든 주요 테이블은 생성/수정 시각을 가져야 한다.
- build 상태와 test/deploy 상태는 서로 다른 필드/테이블에서 관리한다.
- `buildId`는 외부 API와 내부 저장을 관통하는 공통 식별자다.
- `userId + appName`은 중복 build 판정의 기준 키다.

## 4. `build_request`

권장 필드:

- `id` uuid internal primary key
- `build_id` string unique
- `user_id` string
- `app_name` string
- `input_type` string
- `source_ref` string
- `dockerfile_mode` string nullable
- `runtime_port` integer nullable
- `request_payload_json` json nullable
- `status` string
- `current_phase` string nullable
- `image_name` string nullable
- `image_tag` string nullable
- `image_digest` string nullable
- `error_code` string nullable
- `error_message` string nullable
- `created_at` timestamp
- `queued_at` timestamp nullable
- `started_at` timestamp nullable
- `finished_at` timestamp nullable
- `updated_at` timestamp

조회 패턴:

- `build_id`로 단건 조회
- `user_id + app_name` 기준 active build 존재 확인
- `status = QUEUED` 기준 oldest-first 조회

권장 인덱스:

- unique index on `build_id`
- index on `(user_id, app_name, status)`
- index on `(status, created_at)`

## 5. `build_log`

권장 필드:

- `id` uuid internal primary key
- `build_id` string
- `seq` integer
- `phase` string
- `stream` string
- `message` text
- `created_at` timestamp

권장 인덱스:

- unique index on `(build_id, seq)`
- index on `(build_id, created_at)`

## 6. `build_test`

권장 필드:

- `id` uuid internal primary key
- `build_id` string unique
- `status` string
- `host` string nullable
- `host_port` integer nullable
- `internal_port` integer nullable
- `runtime_url` string nullable
- `container_ref` string nullable
- `health_check_passed` boolean nullable
- `port_open` boolean nullable
- `stability_window_passed` boolean nullable
- `error_code` string nullable
- `error_message` string nullable
- `created_at` timestamp
- `started_at` timestamp nullable
- `finished_at` timestamp nullable
- `updated_at` timestamp

조회 패턴:

- `build_id` 기준 단건 조회
- `status` 기준 진행 중 테스트 조회

권장 인덱스:

- unique index on `build_id`
- index on `(status, created_at)`

## 7. `deployment_attempt`

권장 필드:

- `id` uuid internal primary key
- `build_id` string unique
- `status` string
- `target_type` string
- `target_ref` string nullable
- `result_ref` string nullable
- `response_payload_json` json nullable
- `error_code` string nullable
- `error_message` string nullable
- `created_at` timestamp
- `started_at` timestamp nullable
- `finished_at` timestamp nullable
- `updated_at` timestamp

조회 패턴:

- `build_id` 기준 단건 조회
- `status = IN_PROGRESS` 기준 진행 중 배포 조회

권장 인덱스:

- unique index on `build_id`
- index on `(status, created_at)`

## 8. 관계 모델

```text
build_request 1 --- N build_log
build_request 1 --- 0..1 build_test
build_request 1 --- 0..1 deployment_attempt
```

## 9. Active Build 판정과 데이터 모델

active build 판정 쿼리는 `build_request` 기준으로 수행한다.

상태 범위:

```text
RECEIVED
QUEUED
PREPARING_SOURCE
VALIDATING
BUILDING
BUILD_SUCCESS
TESTING
TEST_SUCCESS
DEPLOYING
DEPLOY_SUCCESS
```

## 10. Queue 처리 관점 데이터 요구사항

Runner의 queue pickup을 위해 아래 패턴을 지원해야 한다.

```sql
SELECT id
FROM build_request
WHERE status = 'QUEUED'
ORDER BY created_at ASC
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

테스트 또는 배포 실행 상한을 둘 경우 하위 테이블의 진행 중 상태도 조회할 수 있어야 한다.

## 11. API 계약과 데이터 필드 연결

### `POST /builds`

- `user_id`
- `app_name`
- `input_type`
- `source_ref`
- `dockerfile_mode`
- `runtime_port`
- `request_payload_json`

### `GET /builds/{buildId}`

- `build_request.status`
- `build_request.current_phase`
- `build_request.error_*`
- `build_test.*`
- `deployment_attempt.*`

### `GET /builds/{buildId}/logs`

- `build_log.*`

## 12. 현재 설계 가정

- DB는 row locking과 transaction 처리가 가능한 관계형 DB를 가정한다.
- JSON 필드는 초기 MVP에서 유연성을 위해 허용한다.
- `build_id`는 외부 노출용 business key, `id`는 내부 PK로 분리 가능하다고 본다.

## 13. 현 단계 결론

- 데이터 모델의 핵심은 `build_request`를 상위 lifecycle의 source of truth로 두고, `build_test`와 `deployment_attempt`를 하위 결과물 테이블로 분리하는 것이다.
- 이 구조가 active build 판정, 상태 조회 API, test/deploy 추적 정책을 안정적으로 받쳐준다.
