# Step 04 Design 01 - System Context And Responsibilities

- 문서 목적: Docker Build And Deployment Automation Platform MVP의 시스템 경계와 컴포넌트 책임을 정의한다.
- 범위: 사용자/에이전트/서버/러너/테스트 환경/배포 시스템의 관계, 동기/비동기 경계, 책임 분리 원칙
- 대상 독자: 설계자, 구현 담당자, 프로젝트 리드, AI 에이전트
- 상태: draft
- 최종 수정일: 2026-07-03
- 관련 문서: `docs/sdlc/04-design-structure.md`, `docs/sdlc/SRS/06-mvp-must-requirements.md`, `docs/sdlc/SRS/05-open-issues-and-decisions.md`

## Traceability

- Functional: `MVP-FR-001` ~ `MVP-FR-024`
- Non-Functional: `MVP-NFR-001`, `MVP-NFR-002`, `MVP-NFR-005`, `MVP-NFR-006`, `MVP-NFR-007`, `MVP-NFR-008`
- Policy/Data: `MVP-PR-005`
- Open Issues: `OI-001`, `OI-004`, `OI-009`, `OI-010`

## 1. 문서 목표

이 문서는 MVP에서 어떤 컴포넌트가 어떤 책임을 가지는지 먼저 고정하기 위한 설계 문서다.

## 2. 시스템 컨텍스트

### 2.1 상위 컨텍스트

```text
[외부 사용자]
  -> [AI 에이전트 / Skill / MCP]
  -> [Build Server API]
  -> [Build Queue / DB]
  -> [Build Runner]
  -> [Docker Engine]
  -> [Test Runtime]
  -> [External Deployment System]
  -> [Polling API / Notification]
```

### 2.2 핵심 원칙

- 사용자와 직접 상호작용하는 주체는 AI 에이전트다.
- Build Server는 요청 수신과 상태 추적의 중심이다.
- Runner는 실제 실행 책임을 가진 비동기 worker다.
- 외부 배포 시스템은 결과물 최종 전달 대상이다.

## 3. 컨텍스트 다이어그램

```text
사용자
  -> 배포 요청
AI 에이전트 / Skill / MCP
  -> 입력물 준비, 상태 안내
Build Server
  -> 요청 저장, 상태 API, 중복 판정
DB
  -> build_request, build_log, build_test, deployment_attempt
Build Runner
  -> git clone / unzip, docker build, container test, deploy adapter 호출, 상태 갱신
External Deployment System
  -> 결과물 수신
```

## 4. 컴포넌트 정의와 책임

### 4.1 외부 사용자

책임:

- 앱 개발 결과를 배포하고 싶다는 목적을 전달
- 앱 이름 제안이나 확인에 참여
- 최종 테스트/배포 결과 확인

책임 아님:

- Dockerfile 작성 강제
- 빌드/런타임 명령 수행
- 포트/컨테이너/로그 직접 해석

### 4.2 AI 에이전트 / Skill / MCP

책임:

- 자연어 배포 요청 인식
- 소스 루트 확인
- 앱 이름 확인 또는 제안
- `Dockerfile` 존재 여부 점검
- `.dockerignore` 점검 또는 생성
- Git URL 또는 Zip 입력 정규화
- Build Server API 호출
- build 상태 polling 또는 알림 해석
- 상태/실패 정보를 사용자 친화적으로 번역

책임 아님:

- 서버 밖에서 직접 `docker build` 수행
- 테스트/배포 인프라 장애 복구를 독자적으로 수행
- 운영 정책을 임의로 변경

### 4.3 Build Server

책임:

- 빌드 요청 수신
- 요청 validation
- active build 판정
- build request 저장
- 상태 조회 API 제공
- 로그 조회 API 제공
- test/deploy 결과 조립 및 polling facade 제공

책임 아님:

- 실제 Docker 이미지 빌드 수행
- 실제 컨테이너 테스트 수행
- 실제 외부 배포 수행

### 4.4 Build Queue / DB

책임:

- build request 영속화
- 상태 전이 기록
- build log 저장
- test 결과 저장
- deployment 결과 저장
- Runner 선점 기준 제공

### 4.5 Runner

책임:

- `QUEUED` 작업 선점
- Git clone 또는 Zip 해제
- Docker 이미지 빌드
- 컨테이너 실행 및 테스트
- 외부 시스템 배포
- 상태/로그 갱신
- 실패 기록

책임 아님:

- 사용자 메시지 직접 생성
- 외부 사용자 인터페이스 제공

### 4.6 Docker Engine

책임:

- 이미지 빌드 실행
- 컨테이너 실행
- 실행 결과 반환

### 4.7 External Deployment System

책임:

- 배포 결과물 수신
- 필요 시 배포 결과 reference 또는 응답 반환

## 5. 동기/비동기 경계

### 5.1 동기 경계

- 사용자 요청 -> AI 에이전트 해석
- AI 에이전트 -> Build Server `POST /builds`
- Build Server -> 요청 접수 응답
- AI 에이전트 -> 상태 조회 `GET /builds/{buildId}` 또는 `GET /jobs/{jobId}`

### 5.2 비동기 경계

- Build Server가 DB에 `QUEUED` 등록
- Runner가 queue를 polling
- Git clone / unzip 수행
- Docker build 수행
- container test 수행
- external deployment 수행
- 상태/로그 갱신

## 6. 컴포넌트 간 주요 입력/출력

### 6.1 AI 에이전트 -> Build Server

입력:

- `userId`
- `appName`
- Git URL 또는 source package reference
- `Dockerfile` 관련 정보
- runtime hint
- deploy target hint

출력:

- `buildId`
- accepted 여부
- existing build 정보 또는 신규 queue 등록 결과

### 6.2 Build Server -> Runner

입력:

- `QUEUED` build row
- source location
- build metadata

출력:

- 상태 전이
- 로그
- test 결과
- deploy 결과

### 6.3 Runner -> Build Server/DB

출력:

- build status update
- build log rows
- test result 정보
- deploy result 정보
- error code/message

### 6.4 Build Server -> AI 에이전트

출력:

- build status
- test status
- deploy status
- error summary source data

## 7. 책임 분리 원칙

- 사용자 인터페이스 책임과 실행 책임을 분리한다.
- 요청 기록 책임과 실행 책임을 분리한다.
- build 상태와 test/deploy 상태를 분리한다.
- 운영 상세와 사용자 메시지를 분리한다.

## 8. 현재 설계 가정

- `userId`는 외부 인증 시스템과 매핑 가능한 문자열 식별자다.
- 테스트 실행 결과는 임시 `host + port`로 노출될 수 있다.
- Build Server는 DB를 build queue와 결과 저장소로 사용한다.
- Runner는 단일 인스턴스 순차 실행을 기본 가정으로 둔다.

## 9. 후속 설계 문서로 넘길 포인트

- 도메인 엔티티와 상태 전이 세부는 `02-domain-model-and-state-transitions.md`
- API request/response 구조는 `03-api-contract-design.md`
- DB 필드와 인덱스는 `04-data-model-design.md`
- Runner 단계별 실행 시퀀스는 `05-build-and-preview-execution-flow.md`
- 상태/실패 메시지 규칙은 `06-user-messaging-and-failure-handling.md`

## 10. 현 단계 결론

- MVP에서 가장 중요한 경계는 `AI 에이전트/Skill`과 `Build Server`, 그리고 `Build Server`와 `Runner` 사이의 분리다.
- 이 경계가 먼저 닫혀야 이후 도메인, API, 데이터 설계가 흔들리지 않는다.
