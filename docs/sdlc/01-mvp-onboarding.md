# Docker Build And Deployment Automation Platform SDLC Step 01 - MVP Onboarding

- 문서 목적: 외부 컨셉 문서를 저장소의 SDLC 시작 기준으로 정리한다.
- 범위: 문제 정의, MVP 범위, 시스템 책임 분리, 초기 제품 방향
- 대상 독자: 프로젝트 리드, AI 에이전트, 온보딩 참여자
- 상태: draft
- 최종 수정일: 2026-07-03
- 관련 문서: `docs/sdlc/02-concept-refinement.md`, `docs/PROJECT_PROFILE.md`

## 1. 문제 정의

외부 사용자 또는 비개발자 사용자는 Dockerfile, 이미지 빌드, 컨테이너 실행, 외부 시스템 배포 같은 세부 기술을 몰라도 AI 에이전트를 통해 만든 앱을 자동으로 검증하고 전달할 수 있어야 한다.

이 프로젝트는 다음 사용자 요청을 현실화하는 것을 목표로 한다.

```text
"배포해줘"
```

## 2. 제품 한 줄 정의

Skill/MCP가 배포 입력물을 준비하고, Build Server와 Runner가 Docker 이미지를 빌드한 뒤, 컨테이너 동작 테스트와 외부 시스템 배포까지 자동으로 수행하는 플랫폼

## 3. MVP의 두 트랙

### Track 1. Docker Build & Deployment Server

- 빌드 요청 수신
- 동일 `userId + appName` 기준 active build 중복 방지
- 빌드 요청과 상태를 DB에 저장
- Runner가 소비할 큐 역할 수행
- 빌드 로그와 test/deploy 결과 저장
- polling 또는 notification을 통한 결과 제공

### Track 2. Docker Build Skill / MCP 세트

- 사용자 배포 요청 감지
- 현재 앱 산출물 위치 파악
- `Dockerfile` 확인 또는 생성 정책 적용
- `.dockerignore` 확인 또는 생성
- Git URL 또는 Zip 입력 정규화
- Build Server 요청 전송
- 빌드 상태 polling
- 테스트 결과 또는 실패 원인 안내

## 4. 핵심 설계 원칙

- 사용자는 Docker를 몰라도 배포 요청을 할 수 있어야 한다.
- Skill/MCP는 입력물 준비와 사용자 상호작용을 담당한다.
- 실제 빌드와 상태 관리는 Build Server와 Runner가 담당한다.
- 모든 빌드는 DB에 기록되고 상태와 로그를 추적할 수 있어야 한다.
- 초기 버전은 단일 Runner 기반 순차 처리로 시작한다.
- MVP의 가장 큰 사용자 가치는 "실행 검증과 외부 전달까지 자동으로 닫히는 것"이다.

## 5. 상태 모델 기준

주요 빌드 상태:

```text
RECEIVED -> QUEUED -> PREPARING_SOURCE -> VALIDATING -> BUILDING -> BUILD_SUCCESS -> TESTING -> TEST_SUCCESS -> DEPLOYING -> DEPLOY_SUCCESS -> COMPLETED
```

종료 상태:

```text
FAILED
CANCELLED
```

중복 빌드 방지 대상 active 상태:

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

## 6. MVP 경계

우선 확정 대상:

- 도메인 모델: `build_request`, `build_log`, `build_test`, `deployment_attempt`
- API 최소 집합: `POST /builds`, `GET /builds/{buildId}`, `GET /builds/{buildId}/logs`, `GET /jobs/{jobId}`
- Runner 처리 단계와 실패 복구 지점
- Skill/MCP가 서버에 보내는 요청 payload 형식

후순위 항목:

- 모든 배포 프로토콜 동시 지원
- Reverse proxy 기반 URL 라우팅
- 다중 Runner 병렬 처리
- 완전한 멀티테넌트 격리 모델

## 7. 현 단계 결론

- 제품 컨셉은 충분히 구체적이며 MVP 경계도 선명하다.
- 저장소는 문서와 코드가 함께 진화하는 단계이므로, 첫 작업은 계약과 상태 모델을 먼저 닫는 방향이 적절하다.
