<!-- source: /Users/yklee/Downloads/docker-build-preview-platform-concept.md -->

# Docker Build Preview Platform MVP Onboarding

- 문서 목적: 외부 컨셉 문서를 이 저장소의 초기 개발 기준으로 정리한다.
- 범위: 문제 정의, MVP 범위, 시스템 책임 분리, 초기 구현 순서
- 대상 독자: 온보딩 개발자, AI 에이전트, 프로젝트 리드
- 상태: draft
- 최종 수정일: 2026-07-02
- 관련 문서: `README.md`, `docs/PROJECT_PROFILE.md`, `ai-workflow/memory/active/work_backlog.md`

## 1. 문제 정의

비개발자 사용자는 Dockerfile, 이미지 빌드, 포트 매핑, 컨테이너 실행 같은 세부 기술을 몰라도 AI 에이전트를 통해 만든 앱을 테스트 가능한 상태로 배포할 수 있어야 한다.

이 프로젝트는 다음 사용자 요청을 현실화하는 것을 목표로 한다.

```text
"배포해줘"
```

## 2. 제품 한 줄 정의

Skill/MCP가 배포 입력물을 준비하고, Build Server와 Runner가 Docker 이미지를 순차적으로 빌드한 뒤, 테스트용 컨테이너를 실행해 미리보기 URL을 제공하는 플랫폼

## 3. MVP의 두 트랙

### Track 1. Docker Image Build Server

- 빌드 요청 수신
- 동일 `userId + appName` 기준 active build 중복 방지
- 빌드 요청과 상태를 DB에 저장
- Runner가 소비할 큐 역할 수행
- 빌드 로그와 결과 저장
- 테스트 컨테이너 실행 정보와 preview URL 제공

### Track 2. Docker Build Skill / MCP 세트

- 사용자 배포 요청 감지
- 현재 앱 산출물 위치 파악
- `Dockerfile` 확인 또는 생성
- `.dockerignore` 확인 또는 생성
- 소스 압축 및 Build Server 요청 전송
- 빌드 상태 polling
- 테스트 URL 또는 실패 원인 안내

## 4. 핵심 설계 원칙

- 사용자는 Docker를 몰라도 배포 요청을 할 수 있어야 한다.
- Skill/MCP는 입력물 준비와 사용자 상호작용을 담당한다.
- 실제 빌드와 상태 관리는 Build Server와 Runner가 담당한다.
- 모든 빌드는 DB에 기록되고 상태와 로그를 추적할 수 있어야 한다.
- 초기 버전은 단일 Runner 기반 순차 처리로 시작한다.
- MVP의 가장 큰 사용자 가치는 "테스트 가능한 URL 제공"이다.

## 5. 상태 모델 기준

주요 빌드 상태:

```text
RECEIVED -> QUEUED -> PREPARING -> VALIDATING -> BUILDING -> IMAGE_BUILT -> TEST_DEPLOYING -> TEST_READY -> COMPLETED
```

종료 상태:

```text
FAILED
CANCELLED
```

중복 빌드 방지 대상 active 상태:

```text
QUEUED
PREPARING
VALIDATING
BUILDING
IMAGE_BUILT
TEST_DEPLOYING
TEST_READY
PUSHING
REGISTERING
```

## 6. 초기 구현 경계

이번 온보딩 단계에서는 다음을 우선 확정한다.

- 도메인 모델: `build_request`, `build_log`, `test_deployment`
- API 최소 집합: `POST /builds`, `GET /builds/{buildId}`, `GET /builds/{buildId}/logs`, `POST /builds/{buildId}/cancel`
- Runner 처리 단계와 실패 복구 지점
- Skill/MCP가 서버에 보내는 요청 payload 형식

이번 단계에서 아직 확정하지 않는 항목:

- Registry push 세부 정책
- Reverse proxy 기반 preview URL 라우팅
- 다중 Runner 병렬 처리
- 배포 시스템 등록 플로우

## 7. 저장소 구현 권장 구조

현재 저장소에는 애플리케이션 코드가 없으므로, 첫 구현 스프린트에서 아래와 같은 모듈 분리를 권장한다.

```text
apps/
  build-server/
  build-runner/
packages/
  domain/
  sdk/
  dockerfile-templates/
tools/
  skill-mcp/
docs/
```

의도:

- `apps/build-server`: API, persistence, 상태 관리
- `apps/build-runner`: queue polling, docker build/run orchestration
- `packages/domain`: 상태 모델, DTO, validation
- `packages/sdk`: Skill/MCP에서 사용할 서버 client
- `packages/dockerfile-templates`: 앱 타입별 Dockerfile 템플릿
- `tools/skill-mcp`: 에이전트용 skill 또는 MCP 엔트리포인트

## 8. 첫 개발 스프린트 제안

### Sprint A. 도메인/계약 고정

- 상태 enum 정의
- API request/response 스키마 정의
- DB 스키마 초안 작성
- active build 중복 판정 규칙 문서화

### Sprint B. Build Server 골격

- `POST /builds`
- `GET /builds/{buildId}`
- 요청 저장과 status `QUEUED` 등록
- archive 메타데이터 처리

### Sprint C. Runner 골격

- DB polling
- `FOR UPDATE SKIP LOCKED` 기반 선점
- 상태 전이 처리
- 로그 저장 인터페이스

### Sprint D. Skill/MCP 골격

- 앱 루트 감지
- `Dockerfile` 검사
- `.dockerignore` 기본 생성
- build request 전송과 polling

## 9. 현재 온보딩 결론

- 제품 컨셉은 충분히 구체적이며 MVP 경계도 선명하다.
- 저장소는 아직 구현 전 상태이므로, 첫 작업은 코드보다 계약과 구조 고정이 적절하다.
- 다음 착수 단위는 Build Server와 Skill/MCP를 동시에 만들기보다, 공통 도메인 계약부터 고정하는 것이 좋다.
