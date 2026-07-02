# Docker Build Preview Platform Glossary And State Model

- 문서 목적: 용어 정의와 상태 모델을 같은 문서에서 통일해 초기 설계 언어를 고정한다.
- 범위: 핵심 용어, build 상태, preview 상태, 사용자 친화 메시지 원칙
- 대상 독자: 프로젝트 리드, AI 에이전트, API/도메인 설계자
- 상태: draft
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/MVP_ONBOARDING.md`, `docs/CONCEPT_REFINEMENT.md`, `docs/IDENTITY_MODEL.md`

## 1. 용어집

### build

사용자가 요청한 배포 작업을 처리하기 위한 단일 실행 단위다.  
하나의 build는 하나의 `buildId`를 가진다.

### build request

Skill/MCP가 Build Server에 전달한 빌드 요청 레코드다.  
이 문서는 build request를 저장/추적의 관점에서, build를 사용자 경험의 관점에서 함께 사용한다.

### preview

빌드 결과를 사용자가 테스트하기 위해 임시로 실행한 환경이다.  
MVP에서는 "테스트 가능한 URL을 제공하는 실행 결과"를 의미한다.

### active build

아직 같은 앱의 새 빌드를 받지 않도록 막아야 하는 진행 중 작업이다.  
MVP에서는 `TEST_READY`도 active build에 포함한다.

### completed build

사용자 관점에서 하나의 빌드 작업 맥락이 끝난 상태다.  
기본적으로 `COMPLETED`, `FAILED`, `CANCELLED`가 terminal 상태다.

### preview lifecycle

preview 컨테이너가 예약되고 시작되고 준비되고 종료되기까지의 상태 흐름이다.

## 2. Build 상태 모델

### 2.1 상태 목록

```text
RECEIVED
QUEUED
PREPARING
VALIDATING
BUILDING
IMAGE_BUILT
TEST_DEPLOYING
TEST_READY
PUSHING
REGISTERING
COMPLETED
FAILED
CANCELLED
```

### 2.2 상태 의미

- `RECEIVED`: 서버가 요청을 받았지만 아직 queue 등록 전 정리 단계
- `QUEUED`: Runner가 가져가기 전 대기열 상태
- `PREPARING`: 압축 해제, 작업 디렉터리 준비 단계
- `VALIDATING`: Dockerfile과 요청값을 검토하는 단계
- `BUILDING`: Docker 이미지 생성 단계
- `IMAGE_BUILT`: 이미지 생성 성공, 아직 preview 미기동
- `TEST_DEPLOYING`: 테스트 컨테이너 실행 단계
- `TEST_READY`: preview 접속 URL 제공 가능 상태
- `PUSHING`: 향후 registry 업로드 단계
- `REGISTERING`: 향후 배포 시스템 등록 단계
- `COMPLETED`: 전체 작업 종료
- `FAILED`: 처리 실패 종료
- `CANCELLED`: 취소 종료

### 2.3 권장 기본 흐름

```text
RECEIVED -> QUEUED -> PREPARING -> VALIDATING -> BUILDING -> IMAGE_BUILT -> TEST_DEPLOYING -> TEST_READY -> COMPLETED
```

### 2.4 상태 설계 원칙

- 상태는 Runner 내부 구현이 아니라 사용자 가치 변화를 반영해야 한다.
- `IMAGE_BUILT`와 `TEST_READY`를 분리해 "이미지 성공"과 "실행 가능"을 구분한다.
- 향후 단계인 `PUSHING`, `REGISTERING`은 미리 예약하지만 MVP 필수 경로로 강제하지 않는다.

## 3. Preview 상태 모델

### 3.1 상태 목록

```text
RESERVED
STARTING
READY
FAILED
STOPPED
EXPIRED
```

### 3.2 상태 의미

- `RESERVED`: 포트 또는 실행 슬롯을 예약한 상태
- `STARTING`: 컨테이너 시작 중
- `READY`: 사용자 접속 가능
- `FAILED`: preview 실행 실패
- `STOPPED`: 명시적 중지 또는 교체로 종료
- `EXPIRED`: TTL 만료로 종료

### 3.3 build 상태와 preview 상태 분리 이유

이미지 빌드는 성공했지만 preview 실행은 실패할 수 있다.  
따라서 `build status`와 `preview status`를 따로 관리해야 사용자와 운영자가 실패 원인을 더 정확히 이해할 수 있다.

예시:

```text
build status = IMAGE_BUILT
preview status = FAILED
```

## 4. 사용자 친화 메시지 원칙

상태값 그대로보다, 사용자가 이해할 수 있는 문장으로 번역해 전달한다.

예시:

- `QUEUED` -> 빌드 대기열에서 순서를 기다리고 있습니다.
- `BUILDING` -> Docker 이미지를 빌드하고 있습니다.
- `TEST_DEPLOYING` -> 테스트용 서비스로 실행 중입니다.
- `TEST_READY` -> 테스트 접속 URL이 준비되었습니다.
- `FAILED` -> 작업이 실패했습니다.

원칙:

- 상태 이름보다 현재 가능한 행동을 설명한다.
- 실패 시에는 다음 조치를 함께 안내한다.
- 내부 상태가 많아도 사용자에게는 최소 메시지 세트만 노출한다.

## 5. 현 단계 결론

- 용어집과 상태 모델을 먼저 고정하면 이후 API 문서와 DB 모델 초안이 안정된다.
- Build 상태와 preview 상태를 분리하는 것이 이 플랫폼의 핵심 설계 포인트다.
- `TEST_READY`를 active build에 포함하는 정책은 사용자 경험과 운영 모델 양쪽에서 일관성이 있다.
