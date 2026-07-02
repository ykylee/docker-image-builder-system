# Step 04 Design 05 - Build And Preview Execution Flow

- 문서 목적: Docker Build Preview Platform MVP의 Runner 중심 실행 흐름을 단계별로 정의한다.
- 범위: queue pickup, source prepare, validation, docker build, preview run, readiness check, 상태 기록, 실패 처리
- 대상 독자: 설계자, 구현 담당자, Runner 설계자, 프로젝트 리드
- 상태: draft
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/sdlc/design/02-domain-model-and-state-transitions.md`, `docs/sdlc/design/03-api-contract-design.md`, `docs/sdlc/design/04-data-model-design.md`, `docs/sdlc/SRS/06-mvp-must-requirements.md`

## 1. 문서 목표

이 문서는 Runner가 `QUEUED` build를 실제 preview URL 제공 상태까지 어떻게 처리할지 실행 순서 기준으로 고정하기 위한 설계 문서다.

이 문서가 답해야 하는 질문:

- Runner는 어떤 순서로 build를 처리하는가
- 각 단계에서 어떤 상태를 기록하는가
- 로그와 오류 정보는 언제 저장하는가
- preview 준비 완료는 어떤 조건으로 판정하는가

## 2. 실행 흐름 설계 원칙

- 실행 흐름의 source of truth는 `build_request.status`다.
- preview lifecycle 정보는 `test_deployment`에 분리 저장하되, build 흐름 안에서 함께 갱신한다.
- 각 주요 단계 진입 시 상태 전이와 `current_phase`를 기록해야 한다.
- 실패는 가능한 한 단계별 오류 코드와 함께 terminal 상태로 닫아야 한다.
- MVP 범위에서는 queue 처리 단위를 단일 build job으로 본다.
- preview 실행은 build queue와 별도 preview service queue를 통해 자원 상한 안에서 제어할 수 있어야 한다.

## 3. 상위 실행 시퀀스

권장 상위 시퀀스:

```text
1. queue pickup
2. source prepare
3. request validation
4. docker build
5. preview service queue admission
6. preview deployment reservation
7. preview container start
8. readiness check
9. preview ready publish
10. build completion close
```

## 4. 단계별 실행 흐름

### 4.1 Queue Pickup

목적:

- `QUEUED` 상태 build 하나를 가져와 실행 소유권을 확보한다.

입력 조건:

- `build_request.status = QUEUED`

권장 처리:

- 생성 시각 기준 oldest-first 선택
- DB transaction + row lock으로 중복 pickup 방지
- pickup 성공 시 `started_at`과 `updated_at` 기록

권장 상태 전이:

```text
QUEUED -> PREPARING
```

권장 기록:

- `build_request.status = PREPARING`
- `build_request.current_phase = queue pickup`
- 로그 1건 이상 추가

실패 처리:

- lock 충돌이나 대상 없음은 오류가 아니라 재시도 가능한 공회전으로 처리
- pickup 이후 상태 저장 실패는 운영 예외로 남기고 job 실행을 중단

### 4.2 Source Prepare

목적:

- source archive와 metadata를 실행 가능한 작업 디렉터리로 준비한다.

입력 데이터:

- `source_archive_ref`
- 요청 metadata

권장 처리:

- archive fetch
- 작업 디렉터리 생성
- source unpack
- 예상 `Dockerfile` 경로 확인

권장 상태:

```text
PREPARING
```

권장 기록:

- `build_request.current_phase = source prepare`
- source prepare 시작/완료 로그 저장

실패 예시:

- `SOURCE_ARCHIVE_NOT_FOUND`
- `SOURCE_EXTRACT_FAILED`

실패 시 처리:

```text
PREPARING -> FAILED
```

저장 항목:

- `error_code`
- `error_message`
- `finished_at`

### 4.3 Request Validation

목적:

- 빌드 실행 전에 최소 실행 가능성을 점검한다.

검증 항목:

- `Dockerfile` 존재 여부
- runtime port 유효성
- 필수 파일 접근 가능 여부

권장 상태 전이:

```text
PREPARING -> VALIDATING
```

권장 기록:

- `build_request.status = VALIDATING`
- `build_request.current_phase = request validation`
- 검증 시작/완료 로그 저장

정책 메모:

- `Dockerfile` 부재 시 자동 생성 여부는 아직 미결정이다.
- 현재 MVP 설계에서는 기본적으로 실패 처리 가능성을 열어둔다.

실패 예시:

- `DOCKERFILE_NOT_FOUND`
- `INVALID_RUNTIME_PORT`
- `INVALID_BUILD_INPUT`

### 4.4 Docker Build

목적:

- 준비된 source로 Docker 이미지를 빌드한다.

권장 상태 전이:

```text
VALIDATING -> BUILDING
```

권장 처리:

- `docker build` 실행
- stdout/stderr를 `build_log`에 순차 저장
- 성공 시 이미지 식별값 기록

성공 시 기록:

- `build_request.status = IMAGE_BUILT`
- `build_request.current_phase = docker build completed`
- `image_name`
- `image_tag`
- 필요 시 `image_digest`

실패 시 기록:

- `build_request.status = FAILED`
- `build_request.current_phase = docker build`
- `error_code = DOCKER_BUILD_FAILED`
- `error_message`
- `finished_at`

로그 원칙:

- build 단계 로그는 가장 상세한 로그 구간이다.
- 로그 저장 실패가 전체 build 실패로 이어질지 여부는 구현 시 결정이 필요하지만, MVP에서는 가능한 한 저장 지속을 우선한다.

### 4.5 Preview Service Queue Admission

목적:

- build 성공 후 preview 실행 슬롯이 있는지 확인하고, 없으면 service queue에 대기시킨다.

권장 상태 전이:

```text
IMAGE_BUILT -> TEST_DEPLOYING
```

권장 처리:

- 현재 실행 중 preview service 수 확인
- 상한 도달 시 `test_deployment.status = QUEUED`
- 슬롯 여유가 있으면 바로 reservation 단계로 진행

권장 기록:

- `build_request.status = TEST_DEPLOYING`
- `build_request.current_phase = preview service queued` 또는 `preview reservation`
- `test_deployment.status = QUEUED` 또는 `RESERVED`

설계 메모:

- preview service queue에 들어간 상태는 build queue와 별도다.
- build 자체는 이미지 생성까지 완료되었지만, 사용자 preview는 아직 준비되지 않았다.

### 4.6 Preview Deployment Reservation

목적:

- preview 실행 전에 사용할 host/port와 배포 레코드를 준비한다.

권장 상태 전이:

```text
IMAGE_BUILT -> TEST_DEPLOYING
```

권장 처리:

- 사용 가능한 host/port 선택
- `test_deployment` 레코드 생성 또는 초기화
- preview URL 조합에 필요한 값 기록

`test_deployment` 권장 초기 상태:

```text
RESERVED
```

권장 기록:

- `build_request.status = TEST_DEPLOYING`
- `build_request.current_phase = preview reservation`
- `test_deployment.status = RESERVED`

실패 예시:

- `PREVIEW_PORT_UNAVAILABLE`
- `PREVIEW_RESERVATION_FAILED`

### 4.7 Preview Container Start

목적:

- 빌드된 이미지를 preview 컨테이너로 실행한다.

권장 처리:

- `docker run` 또는 동등 실행 명령 수행
- container reference 저장
- 내부 포트와 host port 매핑 확정

권장 상태:

- `build_request.status = TEST_DEPLOYING`
- `test_deployment.status = STARTING`

권장 기록:

- `build_request.current_phase = preview container start`
- `test_deployment.container_ref`
- `test_deployment.started_at`

실패 예시:

- `PREVIEW_CONTAINER_START_FAILED`
- `PREVIEW_PORT_BIND_FAILED`

실패 시 처리:

- `build_request.status = FAILED`
- `test_deployment.status = FAILED`
- 실패 단계와 오류 코드 기록

### 4.8 Readiness Check

목적:

- preview가 실제 접근 가능한 상태인지 점검한다.

권장 처리:

- host/port 기준 health check 또는 HTTP probe 수행
- 제한된 재시도 허용
- 성공 시 `preview_url` 확정

권장 상태:

- `build_request.status = TEST_DEPLOYING`
- `test_deployment.status = STARTING`

성공 조건:

- 지정된 probe가 성공
- preview URL이 사용자에게 전달 가능한 형식으로 조합됨

성공 시 상태 전이:

```text
TEST_DEPLOYING -> TEST_READY
STARTING -> READY
```

성공 시 기록:

- `build_request.current_phase = preview ready`
- `test_deployment.status = READY`
- `test_deployment.preview_url`
- `test_deployment.health_status = healthy`
- `test_deployment.expires_at`

후속 처리:

```text
TEST_READY -> COMPLETED
```

권장 기록:

- `build_request.status = COMPLETED`
- `build_request.finished_at`

실패 예시:

- `PREVIEW_HEALTHCHECK_FAILED`
- `PREVIEW_START_TIMEOUT`

실패 시 처리:

- `build_request.status = FAILED`
- `test_deployment.status = FAILED`
- 필요 시 preview 컨테이너 정리 시도

## 5. 최종 상태 정리 규칙

### 5.1 MVP 기준 성공 종료

MVP에서는 preview가 준비되고 success handoff가 끝나면 아래 상태를 성공 종료로 본다.

```text
build_request.status = COMPLETED
test_deployment.status = READY
```

설계 메모:

- `PUSHING`, `REGISTERING`은 후속 확장 경로로 남겨둔다.
- `TEST_READY`는 preview URL 제공 직전/직후의 짧은 handoff 상태다.
- build queue 점유 해제는 `COMPLETED` 기준으로 본다.

### 5.2 실패 종료

어느 단계에서든 복구 불가 오류가 발생하면 아래를 공통 적용한다.

- `build_request.status = FAILED`
- `build_request.error_code` 기록
- `build_request.error_message` 기록
- `build_request.finished_at` 기록

preview 레코드가 이미 생성된 경우:

- `test_deployment.status = FAILED`
- `test_deployment.error_code`
- `test_deployment.error_message`

## 6. 상태 기록 시점 권장안

주요 상태 기록 시점:

| 단계 | build_request.status | current_phase | test_deployment.status |
| --- | --- | --- | --- |
| queue pickup 직후 | `PREPARING` | `queue pickup` | 없음 |
| source prepare 중 | `PREPARING` | `source prepare` | 없음 |
| validation 시작 | `VALIDATING` | `request validation` | 없음 |
| docker build 중 | `BUILDING` | `docker build` | 없음 |
| image build 성공 | `IMAGE_BUILT` | `docker build completed` | 없음 |
| preview 대기열 등록 | `TEST_DEPLOYING` | `preview service queued` | `QUEUED` |
| preview 예약 | `TEST_DEPLOYING` | `preview reservation` | `RESERVED` |
| container start | `TEST_DEPLOYING` | `preview container start` | `STARTING` |
| readiness success | `TEST_READY` | `preview ready` | `READY` |
| success close | `COMPLETED` | `preview ready` | `READY` |
| any unrecoverable error | `FAILED` | 실패 단계 값 유지 | 필요 시 `FAILED` |

## 7. 로그 저장 시점 권장안

최소 로그 포인트:

- queue pickup 시작
- source prepare 시작/완료
- validation 시작/결과
- docker build 출력
- preview service queue 대기/선점 결과
- preview reservation 결과
- preview container start 결과
- readiness check 시작/재시도/성공 또는 실패

로그 설계 원칙:

- 사람이 읽는 운영 로그와 API 노출용 `build_log`는 최소한 phase와 message를 공유해야 한다.
- 사용자 직접 노출이 아닌 만큼 원본 중심으로 남기되, 메시지 후처리는 별도 계층에서 수행한다.

## 8. 실패 처리 분류

### 8.1 입력/준비 실패

- source 없음
- `Dockerfile` 없음
- 잘못된 metadata

대표 오류 코드:

- `SOURCE_ARCHIVE_NOT_FOUND`
- `DOCKERFILE_NOT_FOUND`
- `INVALID_BUILD_INPUT`

### 8.2 빌드 실패

- dependency install 실패
- image layer build 실패
- base image fetch 실패

대표 오류 코드:

- `DOCKER_BUILD_FAILED`

### 8.3 preview 실행 실패

- 포트 충돌
- 컨테이너 시작 실패
- health check timeout

대표 오류 코드:

- `PREVIEW_PORT_UNAVAILABLE`
- `PREVIEW_CONTAINER_START_FAILED`
- `PREVIEW_HEALTHCHECK_FAILED`

## 9. 미결정 항목과 설계 영향

- `OI-001 userId source system`
  - 실행 흐름 자체에는 직접 영향이 작지만 audit 맥락과 ownership 표시에 영향이 있다.
- `OI-004 preview host 구조`
  - host 선택 방식과 `preview_url` 조합 규칙에 직접 영향이 있다.
- `OI-005 preview 인증 정책`
  - readiness 성공 조건과 사용자 안내 메시지에 영향이 있다.
- `OI-007 preview cleanup ownership`
  - `expires_at` 이후 정리 프로세스의 책임 경계에 영향이 있다.
- `OI-010 preview concurrency limit and queue policy`
  - `QUEUED` 상태 진입 기준과 slot 해제 규칙에 직접 영향이 있다.
- `OI-008 Dockerfile 생성 정책`
  - validation 실패 처리인지 자동 보정 흐름인지에 직접 영향이 있다.

## 10. 후속 설계 문서로 넘길 포인트

- 사용자 친화 메시지 변환 규칙은 `06-user-messaging-and-failure-handling.md`
- cleanup, TTL 연장, 인증 정책은 운영 설계 또는 후속 아키텍처 문서에서 닫아야 한다.
- build 단계와 requirement ID의 traceability 표기는 다음 단계에서 공통 규칙으로 보완할 필요가 있다.

## 11. 현 단계 결론

- MVP 실행 흐름의 핵심은 `QUEUED` build를 단계별 상태 전이와 로그 기록으로 추적하고, preview는 별도 service queue를 거쳐 `COMPLETED + READY` 상태까지 안정적으로 끌고 가는 것이다.
- preview URL 제공이 성공 기준이고, 실패는 반드시 단계 정보와 오류 코드를 남기는 구조가 적절하다.
