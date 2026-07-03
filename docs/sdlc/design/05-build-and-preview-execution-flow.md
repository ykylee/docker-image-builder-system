# Step 04 Design 05 - Build And Preview Execution Flow

- 문서 목적: Docker Build And Deployment Automation Platform MVP의 Runner 중심 실행 흐름을 단계별로 정의한다.
- 범위: queue pickup, source prepare, validation, docker build, container test, external deploy, 상태 기록, 실패 처리
- 대상 독자: 설계자, 구현 담당자, Runner 설계자, 프로젝트 리드
- 상태: draft
- 최종 수정일: 2026-07-03
- 관련 문서: `docs/sdlc/design/02-domain-model-and-state-transitions.md`, `docs/sdlc/design/03-api-contract-design.md`, `docs/sdlc/design/04-data-model-design.md`, `docs/sdlc/SRS/06-mvp-must-requirements.md`

## Traceability

- Functional: `MVP-FR-014` ~ `MVP-FR-024`
- Non-Functional: `MVP-NFR-004`, `MVP-NFR-007`, `MVP-NFR-008`
- Policy/Data: `MVP-PR-001`, `MVP-PR-004`, `MVP-PR-005`, `MVP-DR-003`, `MVP-DR-004`
- Open Issues: `OI-004`, `OI-005`, `OI-007`, `OI-008`, `OI-010`

## 1. 문서 목표

이 문서는 Runner가 `QUEUED` build를 실제 build/test/deploy 완료 상태까지 어떻게 처리할지 실행 순서 기준으로 고정하기 위한 설계 문서다.

이 문서가 답해야 하는 질문:

- Runner는 어떤 순서로 build를 처리하는가
- 각 단계에서 어떤 상태를 기록하는가
- 로그와 오류 정보는 언제 저장하는가
- 테스트 성공과 배포 성공은 어떤 조건으로 판정하는가

## 2. 실행 흐름 설계 원칙

- 실행 흐름의 source of truth는 `build_request.status`다.
- test/deploy lifecycle 정보는 build 흐름과 분리 저장할 수 있어야 하되, 상태 조회 응답에서는 함께 조립되어야 한다.
- 각 주요 단계 진입 시 상태 전이와 `current_phase`를 기록해야 한다.
- 실패는 가능한 한 단계별 오류 코드와 함께 terminal 상태로 닫아야 한다.
- MVP 범위에서는 queue 처리 단위를 단일 build job으로 본다.
- 컨테이너 테스트와 preview 실행은 build queue와 별도 service queue를 통해 자원 상한 안에서 제어할 수 있어야 한다.

## 3. 상위 실행 시퀀스

권장 상위 시퀀스:

```text
1. queue pickup
2. source prepare
3. request validation
4. docker build
5. container start
6. runtime validation test
7. external deployment
8. result publish
9. build completion close
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
QUEUED -> PREPARING_SOURCE
```

권장 기록:

- `build_request.status = PREPARING_SOURCE`
- `build_request.current_phase = queue pickup`
- 로그 1건 이상 추가

실패 처리:

- lock 충돌이나 대상 없음은 오류가 아니라 재시도 가능한 공회전으로 처리
- pickup 이후 상태 저장 실패는 운영 예외로 남기고 job 실행을 중단

### 4.2 Source Prepare

목적:

- Git clone, source archive, metadata를 실행 가능한 작업 디렉터리로 준비한다.

입력 데이터:

- Git repository URL 또는 source archive reference
- 요청 metadata

권장 처리:

- git clone 또는 archive fetch
- 작업 디렉터리 생성
- source unpack
- 예상 `Dockerfile` 경로 확인

권장 상태:

```text
PREPARING_SOURCE
```

권장 기록:

- `build_request.current_phase = source prepare`
- source prepare 시작/완료 로그 저장

실패 예시:

- `GIT_CLONE_FAILED`
- `SOURCE_ARCHIVE_NOT_FOUND`
- `SOURCE_EXTRACT_FAILED`

실패 시 처리:

```text
PREPARING_SOURCE -> FAILED
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
- deploy target 설정 유효성

권장 상태 전이:

```text
PREPARING_SOURCE -> VALIDATING
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
- `INVALID_DEPLOY_TARGET`

### 4.4 Docker Build

목적:

- 준비된 source로 Docker 이미지를 빌드한다.

권장 상태 전이:

```text
VALIDATING -> BUILDING
BUILDING -> BUILD_SUCCESS
```

권장 처리:

- `docker build` 실행
- stdout/stderr를 `build_log`에 순차 저장
- 성공 시 이미지 식별값 기록

성공 시 기록:

- `build_request.status = BUILD_SUCCESS`
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

### 4.5 Container Start

목적:

- 빌드된 이미지를 테스트용 컨테이너로 실행한다.

권장 처리:

- `docker run` 또는 동등 실행 명령 수행
- container reference 저장
- 내부 포트와 host port 매핑 확정

권장 기록:

- `build_request.current_phase = container start`
- 컨테이너 실행 로그 저장

실패 예시:

- `CONTAINER_START_FAILED`
- `PORT_BIND_FAILED`

### 4.6 Runtime Validation Test

목적:

- 컨테이너가 정상 실행 가능한지 최소 동작 테스트를 수행한다.

권장 상태 전이:

```text
BUILD_SUCCESS -> TESTING
TESTING -> TEST_SUCCESS
```

권장 처리:

- 컨테이너 실행 가능 여부 확인
- health check probe 수행
- 지정된 port open 여부 확인
- 일정 시간 정상 실행 여부 확인

권장 기록:

- `build_request.status = TESTING`
- `build_request.current_phase = runtime validation`
- test result 시작/완료 로그 저장

실패 예시:

- `CONTAINER_START_FAILED`
- `HEALTHCHECK_FAILED`
- `PORT_NOT_OPEN`
- `STABILITY_WINDOW_FAILED`

### 4.7 External Deployment

목적:

- 테스트 성공 후 외부 시스템으로 결과물을 전달한다.

권장 상태 전이:

```text
TEST_SUCCESS -> DEPLOYING
DEPLOYING -> DEPLOY_SUCCESS
```

권장 처리:

- deploy target 유형별 adapter 호출
- 배포 결과 식별자 또는 응답 reference 저장
- 외부 시스템 응답 로그 저장

권장 기록:

- `build_request.status = DEPLOYING`
- `build_request.current_phase = external deployment`
- `deploy_attempt.status = IN_PROGRESS`
- `deploy_attempt.target_type`
- `deploy_attempt.result_ref`

실패 예시:

- `DEPLOY_TARGET_UNAVAILABLE`
- `DEPLOY_PUSH_FAILED`
- `DEPLOY_REGISTRATION_FAILED`

실패 시 처리:

- `build_request.status = FAILED`
- `deploy_attempt.status = FAILED`
- 실패 단계와 오류 코드 기록

### 4.8 Result Publish

목적:

- 외부 사용자 또는 외부 시스템에 최종 결과를 전달한다.

권장 처리:

- polling API가 선택되면 `GET /jobs/{jobId}` 또는 `GET /builds/{buildId}`에서 최종 상태 노출
- notification 방식이 선택되면 build/test/deploy 이벤트 전송
- 성공/실패 시점의 최종 메시지 조립

성공 조건:

- 외부 시스템이 결과물을 수신했음이 확인됨
- polling 또는 notification으로 최종 결과가 조회/전달 가능함

성공 시 상태 전이:

```text
DEPLOY_SUCCESS -> COMPLETED
```

성공 시 기록:

- `build_request.current_phase = result published`
- 결과 전달 로그
- 필요 시 `notification_delivery` 또는 동등 상태 기록

## 5. 최종 상태 정리 규칙

### 5.1 MVP 기준 성공 종료

MVP에서는 배포 결과가 성공적으로 확인되고 결과 안내가 가능해지면 아래 상태를 성공 종료로 본다.

```text
build_request.status = COMPLETED
```

설계 메모:

- `TEST_SUCCESS`와 `DEPLOY_SUCCESS`는 사용자 가치 변화가 발생한 success handoff 상태다.
- build queue 점유 해제는 `COMPLETED` 기준으로 본다.

### 5.2 실패 종료

어느 단계에서든 복구 불가 오류가 발생하면 아래를 공통 적용한다.

- `build_request.status = FAILED`
- `build_request.error_code` 기록
- `build_request.error_message` 기록
- `build_request.finished_at` 기록

test 또는 deploy 레코드가 이미 생성된 경우:

- 해당 하위 레코드에 `FAILED`
- `error_code`
- `error_message`

## 6. 상태 기록 시점 권장안

주요 상태 기록 시점:

| 단계 | build_request.status | current_phase | sub-status |
| --- | --- | --- | --- |
| queue pickup 직후 | `PREPARING_SOURCE` | `queue pickup` | 없음 |
| source prepare 중 | `PREPARING_SOURCE` | `source prepare` | 없음 |
| validation 시작 | `VALIDATING` | `request validation` | 없음 |
| docker build 중 | `BUILDING` | `docker build` | 없음 |
| image build 성공 | `BUILD_SUCCESS` | `docker build completed` | 없음 |
| container start | `BUILD_SUCCESS` | `container start` | 없음 |
| runtime validation | `TESTING` | `runtime validation` | test in progress |
| test success | `TEST_SUCCESS` | `runtime validation completed` | test success |
| external deployment | `DEPLOYING` | `external deployment` | deploy in progress |
| deploy success | `DEPLOY_SUCCESS` | `deploy completed` | deploy success |
| success close | `COMPLETED` | `result published` | final success |
| any unrecoverable error | `FAILED` | 실패 단계 값 유지 | 필요 시 `FAILED` |

## 7. 로그 저장 시점 권장안

최소 로그 포인트:

- queue pickup 시작
- source prepare 시작/완료
- validation 시작/결과
- docker build 출력
- container start 결과
- health check / port open / stability window 시작과 결과
- external deployment 시작/응답/성공 또는 실패
- result publish 시작/성공 또는 실패

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

### 8.3 컨테이너 테스트 실패

- 포트 충돌
- 컨테이너 시작 실패
- health check timeout

대표 오류 코드:

- `CONTAINER_START_FAILED`
- `PORT_NOT_OPEN`
- `HEALTHCHECK_FAILED`

### 8.4 외부 배포 실패

- 외부 시스템 연결 실패
- image push 실패
- 등록 API 응답 실패

대표 오류 코드:

- `DEPLOY_TARGET_UNAVAILABLE`
- `DEPLOY_PUSH_FAILED`
- `DEPLOY_REGISTRATION_FAILED`

## 9. 미결정 항목과 설계 영향

- `OI-004 preview host 구조`
  - 테스트용 컨테이너 URL 조합 규칙에 직접 영향이 있다.
- `OI-005 preview 인증 정책`
  - 테스트 성공 조건과 사용자 안내 메시지에 영향이 있다.
- `OI-007 preview cleanup ownership`
  - 테스트용 실행 자원 정리 책임 경계에 영향이 있다.
- `OI-010 concurrency limit and queue policy`
  - 테스트 실행 자원과 배포 실행 자원 상한 규칙에 직접 영향이 있다.
- `OI-008 Dockerfile 생성 정책`
  - validation 실패 처리인지 자동 보정 흐름인지에 직접 영향이 있다.
- `deploy target protocol decision`
  - HTTP API, Registry Push, SCP/SFTP 중 어떤 adapter를 MVP에 넣을지 결정해야 한다.

## 10. 후속 설계 문서로 넘길 포인트

- 사용자 친화 메시지 변환 규칙은 `06-user-messaging-and-failure-handling.md`
- cleanup, TTL 연장, 인증 정책, deploy adapter 선택은 운영 설계 또는 후속 아키텍처 문서에서 닫아야 한다.
- build 단계와 requirement ID의 traceability 표기는 다음 단계에서 공통 규칙으로 보완할 필요가 있다.

## 11. 현 단계 결론

- MVP 실행 흐름의 핵심은 `QUEUED` build를 단계별 상태 전이와 로그 기록으로 추적하고, build -> test -> deploy를 `COMPLETED`까지 안정적으로 끌고 가는 것이다.
- 테스트 성공과 배포 성공을 분리 기록해야 운영자가 어느 단계에서 멈췄는지 즉시 판단할 수 있고, 실패는 반드시 단계 정보와 오류 코드를 남기는 구조가 적절하다.
