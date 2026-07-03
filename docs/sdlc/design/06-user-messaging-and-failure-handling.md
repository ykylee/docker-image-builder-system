# Step 04 Design 06 - User Messaging And Failure Handling

- 문서 목적: Docker Build And Deployment Automation Platform MVP의 사용자 안내 메시지와 실패 처리 원칙을 정의한다.
- 범위: 상태 메시지 변환 규칙, test/deploy 안내 방식, 실패 요약 구조, 내부 정보 경계, 다음 조치 패턴
- 대상 독자: 설계자, 구현 담당자, AI 에이전트, 프로젝트 리드
- 상태: draft
- 최종 수정일: 2026-07-03
- 관련 문서: `docs/sdlc/design/03-api-contract-design.md`, `docs/sdlc/design/05-build-and-preview-execution-flow.md`, `docs/sdlc/SRS/06-mvp-must-requirements.md`, `docs/sdlc/SRS/04-policy-and-constraints.md`

## 1. 문서 목표

이 문서는 Build Server와 Runner가 기록한 상태/오류 정보를 사용자와 AI 에이전트가 어떻게 해석하고 전달해야 하는지 고정하기 위한 설계 문서다.

## 2. 메시지 설계 원칙

- 사용자 메시지는 Docker 내부 용어보다 사용자 행동 중심 표현을 우선한다.
- 상태 코드는 시스템 간 계약용으로 유지하고, 사용자에게는 자연어 설명으로 번역한다.
- 실패 메시지는 "무엇이 실패했는지"와 "다음에 무엇을 하면 되는지"를 함께 제공해야 한다.
- 내부 디버깅 정보는 그대로 노출하지 않고 요약된 원인 설명으로 변환한다.

## 3. 메시지 계층 모델

### 3.1 시스템 상태 계층

- source: `build_request.status`, `build_test.status`, `deployment_attempt.status`, `error_code`

예시:

```text
BUILDING
TEST_SUCCESS
DEPLOY_PUSH_FAILED
```

### 3.2 에이전트 해석 계층

- 목적: 사용자에게 보여줄 메시지 템플릿 선택

예시:

```text
이미지를 만드는 중입니다.
실행 검증은 끝났고 배포를 진행 중입니다.
배포 대상 시스템 연결에 실패했습니다.
```

### 3.3 사용자 메시지 계층

```text
배포 요청을 접수했고 지금 이미지를 만들고 있어요.
앱 실행 검증은 끝났고 결과물을 외부 시스템에 전달하는 중입니다.
배포가 완료되지 않았어요. 배포 대상 시스템 연결 상태를 먼저 확인해 주세요.
```

## 4. 상태 메시지 변환 규칙

| 내부 상태 | 사용자 메시지 의미 | 안내 톤 예시 |
| --- | --- | --- |
| `QUEUED` | 요청 접수 후 대기 중 | `배포 요청을 접수했고 곧 작업을 시작할 예정입니다.` |
| `PREPARING_SOURCE` | 소스 준비 중 | `배포에 필요한 소스와 설정을 준비하고 있습니다.` |
| `VALIDATING` | 입력 검증 중 | `실행에 필요한 설정과 파일을 확인하고 있습니다.` |
| `BUILDING` | 이미지 빌드 중 | `앱을 실행 가능한 이미지로 만드는 중입니다.` |
| `BUILD_SUCCESS` | 빌드 성공, 테스트 전 | `이미지 빌드는 끝났고 실행 검증을 준비하고 있습니다.` |
| `TESTING` | 컨테이너 테스트 중 | `앱이 실제로 정상 실행되는지 확인하고 있습니다.` |
| `TEST_SUCCESS` | 테스트 성공 | `앱 실행 검증은 끝났고 배포를 준비하고 있습니다.` |
| `DEPLOYING` | 외부 배포 중 | `결과물을 외부 시스템에 전달하는 중입니다.` |
| `DEPLOY_SUCCESS` | 배포 성공 직후 handoff | `배포는 성공했고 최종 결과를 정리하고 있습니다.` |
| `COMPLETED` | 전체 성공 종료 | `배포가 완료되었습니다.` |
| `FAILED` | 실패 | `배포가 완료되지 않았습니다. 원인을 확인해 수정이 필요합니다.` |

## 5. 결과 안내 규칙

### 5.1 테스트 결과 안내

- `build_test.status = SUCCESS`일 때 실행 검증 통과를 안내할 수 있다.
- 임시 실행 URL이 있으면 부가 정보로 제공할 수 있지만, 최종 성공 기준은 아니다.

### 5.2 배포 결과 안내

- `deployment_attempt.status = SUCCESS`
- `result_ref` 또는 동등 결과 참조 존재

권장 예시:

```text
배포가 완료되었습니다.
외부 시스템에서 결과를 확인할 수 있습니다.
필요하면 buildId를 기준으로 진행 내역을 다시 조회할 수 있습니다.
```

## 6. 실패 메시지 설계 원칙

모든 실패 메시지는 아래 구조를 권장한다.

```text
1. 결과 요약
2. 실패 단계
3. 사용자가 할 수 있는 다음 조치
4. 필요 시 buildId
```

## 7. 실패 유형별 사용자 안내 패턴

### 7.1 입력/준비 실패

- `SOURCE_ARCHIVE_NOT_FOUND`
- `DOCKERFILE_NOT_FOUND`
- `INVALID_BUILD_INPUT`
- `INVALID_RUNTIME_PORT`

권장 메시지:

```text
배포 준비 단계에서 필요한 파일이나 설정을 확인하지 못했습니다.
Dockerfile 위치와 입력 정보를 먼저 점검한 뒤 다시 요청해 주세요.
```

### 7.2 빌드 실패

- `DOCKER_BUILD_FAILED`

권장 메시지:

```text
앱 이미지를 만드는 단계에서 문제가 발생했습니다.
의존성 설치나 빌드 명령이 실패했을 수 있으니 build 로그를 함께 확인해 주세요.
```

### 7.3 컨테이너 테스트 실패

- `CONTAINER_START_FAILED`
- `PORT_NOT_OPEN`
- `HEALTHCHECK_FAILED`

권장 메시지:

```text
이미지는 만들어졌지만 앱 실행 검증 단계에서 문제가 발생했습니다.
앱이 지정한 포트에서 정상적으로 실행되는지와 health check 경로를 먼저 확인해 주세요.
```

### 7.4 외부 배포 실패

- `DEPLOY_TARGET_UNAVAILABLE`
- `DEPLOY_PUSH_FAILED`
- `DEPLOY_REGISTRATION_FAILED`

권장 메시지:

```text
앱 실행 검증은 끝났지만 외부 시스템에 결과를 전달하는 단계에서 문제가 발생했습니다.
배포 대상 시스템 연결 상태나 등록 API 설정을 먼저 확인해 주세요.
```

## 8. 내부 정보와 사용자 정보의 경계

사용자에게 직접 보여줄 수 있는 정보:

- build 진행 상태
- test/deploy 결과 요약
- 오류의 범주화된 요약
- 사용자가 시도할 다음 조치
- 필요 시 `buildId`

기본적으로 직접 노출하지 않는 정보:

- container reference
- 내부 host 선택 로직
- raw Docker daemon 오류 전문
- object storage reference
- 내부 파일 시스템 경로

## 9. 다음 조치 안내 규칙

- `Dockerfile` 위치 확인
- 실행 포트 설정 확인
- 앱 빌드 명령/의존성 점검
- 배포 대상 시스템 설정 확인

## 10. 메시지 생성 책임 분담

### 10.1 Build Server 책임

- 구조화된 상태와 오류 코드 제공
- 최소 공통 메시지 필드 제공 가능

### 10.2 Runner 책임

- 실패 단계와 실행 로그를 충분히 남김
- 오류를 분류 가능한 코드로 기록

### 10.3 Skill/MCP 또는 AI 에이전트 책임

- 사용자 문맥에 맞춘 최종 문장 조립
- 중복 build 응답을 자연스럽게 설명
- test/deploy 안내와 실패 후속 행동 제안

## 11. 현 단계 결론

- MVP 사용자 경험의 핵심은 build/test/deploy 상태를 사용자가 이해하고 다음 행동을 선택할 수 있는 문장으로 바꾸는 것이다.
- 실패 처리는 내부 상세 정보를 안전하게 숨기면서도, 원인 범주와 다음 조치를 분명히 안내하는 구조가 적절하다.
