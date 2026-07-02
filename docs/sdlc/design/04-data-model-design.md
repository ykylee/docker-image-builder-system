# Step 04 Design 04 - Data Model Design

- 문서 목적: Docker Build Preview Platform MVP의 데이터 저장 구조를 정의한다.
- 범위: `build_request`, `build_log`, `test_deployment`의 필드, 관계, 인덱스, 조회 패턴, 무결성 규칙
- 대상 독자: 설계자, 구현 담당자, DB 설계자, 프로젝트 리드
- 상태: draft
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/sdlc/design/02-domain-model-and-state-transitions.md`, `docs/sdlc/design/03-api-contract-design.md`, `docs/sdlc/SRS/06-mvp-must-requirements.md`

## Traceability

- Functional: `MVP-FR-008` ~ `MVP-FR-024`
- Non-Functional: `MVP-NFR-003`, `MVP-NFR-004`, `MVP-NFR-005`, `MVP-NFR-006`, `MVP-NFR-007`, `MVP-NFR-008`
- Policy/Data: `MVP-PR-004`, `MVP-PR-005`, `MVP-DR-001`, `MVP-DR-002`, `MVP-DR-003`, `MVP-DR-004`
- Open Issues: `OI-001`, `OI-007`, `OI-010`

## 1. 문서 목표

이 문서는 MVP의 핵심 도메인 엔티티를 실제 저장 구조로 어떻게 표현할지 정의한다.

이 문서가 답해야 하는 질문:

- 어떤 테이블이 필요한가
- 각 테이블의 필수 필드는 무엇인가
- 어떤 조회를 빠르게 지원해야 하는가
- 상태 추적과 중복 build 판정을 위해 어떤 인덱스가 필요한가

## 2. 데이터 모델 개요

MVP에서 기본 저장 단위는 아래 세 테이블이다.

```text
build_request
build_log
test_deployment
```

역할:

- `build_request`: build lifecycle의 기준 테이블
- `build_log`: 실행 로그 append-only 저장소
- `test_deployment`: preview lifecycle 저장소

## 3. 공통 설계 원칙

- 모든 주요 테이블은 생성/수정 시각을 가져야 한다.
- build 상태와 preview 상태는 서로 다른 필드/테이블에서 관리한다.
- `buildId`는 외부 API와 내부 저장을 관통하는 공통 식별자다.
- `userId + appName`은 중복 build 판정과 최신 preview 교체 정책의 기준 키다.

## 4. `build_request`

### 4.1 목적

- build 요청 접수와 상태 추적의 기준 테이블

### 4.2 권장 필드

식별/소유:

- `id` bigint or uuid internal primary key
- `build_id` string unique
- `user_id` string
- `app_name` string

입력 메타데이터:

- `source_archive_ref` string
- `dockerfile_mode` string nullable
- `detected_app_type` string nullable
- `runtime_port` integer nullable
- `request_payload_json` json nullable

상태/결과:

- `status` string
- `current_phase` string nullable
- `image_name` string nullable
- `image_tag` string nullable
- `image_digest` string nullable
- `result_json` json nullable
- `error_code` string nullable
- `error_message` string nullable

시각:

- `created_at` timestamp
- `queued_at` timestamp nullable
- `started_at` timestamp nullable
- `finished_at` timestamp nullable
- `updated_at` timestamp

### 4.3 무결성 규칙

- `build_id`는 유일해야 한다.
- `status`는 build 상태 enum 범위 안에 있어야 한다.
- `finished_at`은 terminal 상태에서만 채워지는 것을 권장한다.
- `error_code`, `error_message`는 실패 계열 상태에서 주로 사용한다.

### 4.4 조회 패턴

- `build_id`로 단건 조회
- `user_id + app_name` 기준 active build 존재 확인
- `status = QUEUED` 기준 oldest-first 조회

### 4.5 권장 인덱스

- unique index on `build_id`
- index on `(user_id, app_name, status)`
- index on `(status, created_at)`

## 5. `build_log`

### 5.1 목적

- build 실행 과정의 로그 이벤트를 시간순으로 저장

### 5.2 권장 필드

- `id` bigint or uuid internal primary key
- `build_id` string
- `seq` integer
- `phase` string
- `stream` string
- `message` text
- `created_at` timestamp

### 5.3 무결성 규칙

- `build_id + seq`는 유일해야 한다.
- `phase`는 build 상태 또는 실행 phase 이름과 호환되어야 한다.
- `message`는 원본 로그를 최대한 보존하되, 필요시 truncation 정책은 별도 설계한다.

### 5.4 조회 패턴

- `build_id` 기준 시간순 전체 조회
- 특정 build의 마지막 로그 조회

### 5.5 권장 인덱스

- unique index on `(build_id, seq)`
- index on `(build_id, created_at)`

## 6. `test_deployment`

### 6.1 목적

- preview 실행 결과와 lifecycle 저장

### 6.2 권장 필드

식별/소유:

- `id` bigint or uuid internal primary key
- `build_id` string
- `user_id` string
- `app_name` string

실행 정보:

- `status` string
- `host` string nullable
- `host_port` integer nullable
- `internal_port` integer nullable
- `preview_url` string nullable
- `container_ref` string nullable

수명/헬스:

- `health_status` string nullable
- `queue_position` integer nullable
- `service_requested_at` timestamp nullable
- `reserved_at` timestamp nullable
- `expires_at` timestamp nullable
- `stopped_at` timestamp nullable

오류:

- `error_code` string nullable
- `error_message` string nullable

시각:

- `created_at` timestamp
- `started_at` timestamp nullable
- `updated_at` timestamp

### 6.3 무결성 규칙

- 기본적으로 하나의 `build_id`는 최대 하나의 대표 `test_deployment`를 가진다고 가정한다.
- `status`는 preview 상태 enum 범위 안에 있어야 한다.
- `preview_url`은 URL 전략과 무관하게 일반 문자열 필드로 유지한다.

### 6.4 조회 패턴

- `build_id` 기준 단건 조회
- `user_id + app_name` 기준 최신 preview 조회
- `status = QUEUED` 기준 preview service 대기열 조회
- 만료 예정 preview 조회

### 6.5 권장 인덱스

- unique index on `build_id`
- index on `(user_id, app_name, status)`
- index on `(status, created_at)`
- index on `(expires_at)`

## 7. 관계 모델

권장 관계:

```text
build_request 1 --- N build_log
build_request 1 --- 0..1 test_deployment
```

설계 메모:

- `build_request`와 `test_deployment`는 lifecycle 분리를 위해 별도 테이블로 둔다.
- `build_log`는 append-only event stream에 가깝다.

## 8. Active Build 판정과 데이터 모델

active build 판정 쿼리는 `build_request` 기준으로 수행한다.

의도:

- `user_id + app_name` 조합에 대해 active 상태가 존재하는지 확인
- 존재하면 신규 요청을 queue에 넣지 않음

상태 범위:

```text
QUEUED
PREPARING
VALIDATING
BUILDING
IMAGE_BUILT
TEST_DEPLOYING
PUSHING
REGISTERING
```

설계 메모:

- 이 판정은 `test_deployment`가 아니라 `build_request.status`를 기준으로 한다.
- 이유: 도메인상 build가 상위 lifecycle이고, preview는 하위 결과물이기 때문이다.

## 9. Queue 처리 관점 데이터 요구사항

Runner의 queue pickup을 위해 아래 패턴을 지원해야 한다.

예시:

```sql
SELECT id
FROM build_request
WHERE status = 'QUEUED'
ORDER BY created_at ASC
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

설계 영향:

- `status`
- `created_at`
- row locking 가능 DB

preview service queue 처리도 별도 패턴을 지원해야 한다.

예시:

```sql
SELECT id
FROM test_deployment
WHERE status = 'QUEUED'
ORDER BY created_at ASC
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

설계 영향:

- preview service queue는 build queue와 논리적으로 분리된다.
- preview concurrency limit 판정을 위한 운영 상태 조회가 필요하다.

## 10. API 계약과 데이터 필드 연결

### `POST /builds`

주요 저장 대상:

- `user_id`
- `app_name`
- `source_archive_ref`
- `dockerfile_mode`
- `runtime_port`
- `request_payload_json`

### `GET /builds/{buildId}`

주요 조회 대상:

- `build_request.status`
- `build_request.current_phase`
- `build_request.error_*`
- `test_deployment.status`
- `test_deployment.preview_url`
- `test_deployment.expires_at`

### `GET /builds/{buildId}/logs`

주요 조회 대상:

- `build_log.*`

## 11. 현재 설계 가정

- DB는 row locking과 transaction 처리가 가능한 관계형 DB를 가정한다.
- JSON 필드는 초기 MVP에서 유연성을 위해 허용한다.
- `build_id`는 외부 노출용 business key, `id`는 내부 PK로 분리 가능하다고 본다.

## 12. 후속 설계 문서로 넘길 포인트

- Runner 단계별 상태/로그 저장 타이밍은 `05-build-and-preview-execution-flow.md`
- preview 만료/정리 메시지 반영은 `06-user-messaging-and-failure-handling.md`

## 13. 현 단계 결론

- 데이터 모델의 핵심은 `build_request`를 상위 lifecycle의 source of truth로 두고, `test_deployment`를 preview lifecycle 전용으로 분리하는 것이다.
- 이 구조가 active build 판정, 상태 조회 API, preview 교체 정책을 안정적으로 받쳐준다.
