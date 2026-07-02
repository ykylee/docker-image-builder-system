# Step 04 Design 01 - System Context And Responsibilities

- 문서 목적: Docker Build Preview Platform MVP의 시스템 경계와 컴포넌트 책임을 정의한다.
- 범위: 사용자/에이전트/서버/러너/preview 환경의 관계, 동기/비동기 경계, 책임 분리 원칙
- 대상 독자: 설계자, 구현 담당자, 프로젝트 리드, AI 에이전트
- 상태: draft
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/sdlc/04-design-structure.md`, `docs/sdlc/SRS/06-mvp-must-requirements.md`, `docs/sdlc/SRS/05-open-issues-and-decisions.md`

## 1. 문서 목표

이 문서는 MVP에서 어떤 컴포넌트가 어떤 책임을 가지는지 먼저 고정하기 위한 설계 문서다.

이 문서가 답해야 하는 질문:

- 사용자 요청은 어떤 경로로 처리되는가
- 어떤 컴포넌트가 동기 응답을 담당하고 어떤 컴포넌트가 비동기 처리를 담당하는가
- Build Server와 Runner의 경계는 어디까지인가
- AI 에이전트 / Skill / MCP는 무엇을 하고 무엇을 하지 않는가

## 2. 시스템 컨텍스트

### 2.1 상위 컨텍스트

MVP의 상위 흐름은 다음과 같다.

```text
[비개발자 사용자]
  -> [AI 에이전트 / Skill / MCP]
  -> [Build Server API]
  -> [Build Queue / DB]
  -> [Build Runner]
  -> [Preview Service Queue / DB]
  -> [Preview Service Worker]
  -> [Docker Engine]
  -> [Preview Runtime]
  -> [Preview URL]
```

### 2.2 핵심 원칙

- 사용자와 직접 상호작용하는 주체는 AI 에이전트다.
- Build Server는 요청 수신과 상태 추적의 중심이다.
- Runner는 실제 실행 책임을 가진 비동기 worker다.
- preview 환경은 사용자에게 노출되는 결과물이며, Docker 내부 세부사항을 직접 드러내지 않는다.

## 3. 컨텍스트 다이어그램

```text
사용자
  -> 배포 요청
AI 에이전트 / Skill / MCP
  -> 입력물 준비, 상태 안내
Build Server
  -> 요청 저장, 상태 API, 중복 판정
DB
  -> build_request, build_log, test_deployment
Build Runner / Preview Service Worker
  -> docker build, preview slot queue 처리, docker run, 상태 갱신
Preview Runtime
  -> 테스트 URL 제공
```

## 4. 컴포넌트 정의와 책임

### 4.1 비개발자 사용자

책임:

- 앱 개발 결과를 테스트하고 싶다는 목적을 전달
- 앱 이름 제안이나 확인에 참여
- preview URL에서 결과 확인

책임 아님:

- Dockerfile 작성
- 빌드/런타임 명령 수행
- 포트/컨테이너/로그 직접 해석

### 4.2 AI 에이전트 / Skill / MCP

책임:

- 자연어 배포 요청 인식
- 소스 루트 확인
- 앱 이름 확인 또는 제안
- `Dockerfile` 존재 여부 점검
- `.dockerignore` 점검 또는 생성
- 소스와 metadata 패키징
- Build Server API 호출
- build 상태 polling
- 상태/실패 정보를 사용자 친화적으로 번역

책임 아님:

- 서버 밖에서 직접 `docker build` 수행
- preview 인프라 장애 복구를 독자적으로 수행
- 운영 정책을 임의로 변경

설계 메모:

- AI 에이전트 / Skill / MCP는 "입력물 준비와 사용자 인터페이스 계층"으로 본다.
- MVP에서는 실행 엔진이 아니라 orchestration + messaging 계층이다.

### 4.3 Build Server

책임:

- 빌드 요청 수신
- 요청 validation
- active build 판정
- build request 저장
- preview service queue 상태 조회 기준 제공
- 상태 조회 API 제공
- 로그 조회 API 제공
- preview URL과 상태 정보 노출

책임 아님:

- 실제 Docker 이미지 빌드 수행
- 실제 preview 컨테이너 기동 수행

설계 메모:

- Build Server는 system-of-record 역할을 가진다.
- 동기 요청/응답과 상태 조회는 이 컴포넌트가 책임진다.

### 4.4 Build Queue / DB

책임:

- build request 영속화
- 상태 전이 기록
- build log 저장
- preview deployment 상태 저장
- Runner 선점 기준 제공
- preview service 대기열 상태 저장

설계 메모:

- 초기 MVP는 별도 메시지 브로커 대신 DB 기반 queue 패턴을 사용한다.
- build queue와 preview service queue는 같은 DB를 사용하더라도 논리적으로 분리한다.

### 4.5 Runner

책임:

- `QUEUED` 작업 선점
- 소스 준비
- Docker 이미지 빌드
- preview service queue 등록 또는 선점
- preview 컨테이너 실행
- 상태/로그 갱신
- 실패 기록

책임 아님:

- 사용자 메시지 직접 생성
- 외부 사용자 인터페이스 제공

설계 메모:

- Runner는 build 작업과 preview service 작업을 처리하는 실행 worker다.
- 사용자 경험은 Build Server와 AI 에이전트가 노출하고, Runner는 실행 사실만 기록한다.

### 4.6 Docker Engine

책임:

- 이미지 빌드 실행
- 컨테이너 실행
- 실행 결과 반환

설계 메모:

- Docker Engine은 플랫폼 외부 의존성으로 본다.
- Step 04에서는 엔진 추상화보다 실행 경계와 입력/출력에 초점을 둔다.

### 4.7 Preview Runtime

책임:

- 사용자 테스트를 위한 실행 환경 제공
- preview URL 접근 가능 상태 유지

설계 메모:

- MVP에서는 `host + port` 노출이 기본 가정이다.
- 장기적으로 reverse proxy 기반으로 바뀌어도 상위 컴포넌트 책임은 유지된다.

## 5. 동기/비동기 경계

### 5.1 동기 경계

동기 처리 구간:

- 사용자 요청 -> AI 에이전트 해석
- AI 에이전트 -> Build Server `POST /builds`
- Build Server -> 요청 접수 응답
- AI 에이전트 -> 상태 조회 `GET /builds/{buildId}`

이 구간의 목표:

- 빠른 확인 가능성
- 요청이 접수되었는지 명확한 피드백 제공

### 5.2 비동기 경계

비동기 처리 구간:

- Build Server가 DB에 `QUEUED` 등록
- Runner가 queue를 polling
- Docker build 수행
- preview service queue polling 및 preview run 수행
- 상태/로그 갱신

이 구간의 목표:

- 긴 실행 시간을 사용자 상호작용과 분리
- 재시도/실패 기록의 기반 확보

## 6. 컴포넌트 간 주요 입력/출력

### 6.1 AI 에이전트 -> Build Server

입력:

- `userId`
- `appName`
- source package reference 또는 archive
- `Dockerfile` 관련 metadata
- runtime hint 예: port

출력:

- `buildId`
- accepted 여부
- existing build 정보 또는 신규 queue 등록 결과

### 6.2 Build Server -> Runner

입력:

- `QUEUED` build row
- source package location
- build metadata

출력:

- 상태 전이
- 로그
- preview deployment 정보

### 6.3 Runner -> Build Server/DB

입력:

- 실행 결과

출력:

- build status update
- build log rows
- preview URL 관련 정보
- preview queue 상태 정보
- error code/message

### 6.4 Build Server -> AI 에이전트

입력:

- 상태 조회 요청

출력:

- build status
- preview status
- preview URL
- error summary source data

## 7. 책임 분리 원칙

이 설계에서 반드시 유지해야 할 원칙:

- 사용자 인터페이스 책임과 실행 책임을 분리한다.
- 요청 기록 책임과 실행 책임을 분리한다.
- build 상태와 preview 상태를 분리한다.
- build queue와 preview service queue를 분리한다.
- 운영 상세와 사용자 메시지를 분리한다.

## 8. 현재 설계 가정

아직 미결정이지만 이 문서는 아래 임시 가정을 둔다.

- `userId`는 외부 인증 시스템과 매핑 가능한 문자열 식별자다.
- preview는 단일 서버 기반 `host + port`로 노출한다.
- Build Server는 DB를 build queue와 preview service queue로 나눠 사용한다.
- Runner는 단일 인스턴스 순차 실행을 기본 가정으로 둔다.

이 가정은 후속 의사결정에 따라 조정될 수 있다.

## 9. 요구사항 추적 메모

이 문서가 직접 대응하는 요구사항 묶음:

- `MVP-FR-001` ~ `MVP-FR-024`
- `MVP-NFR-001`
- `MVP-NFR-002`

특히 강하게 연결되는 항목:

- `MVP-FR-007` ~ `MVP-FR-019`
- `MVP-FR-020` ~ `MVP-FR-024`
- `MVP-NFR-005`
- `MVP-NFR-006`
- `MVP-NFR-007`
- `MVP-NFR-008`

## 10. 후속 설계 문서로 넘길 포인트

- 도메인 엔티티와 상태 전이 세부는 `02-domain-model-and-state-transitions.md`
- API request/response 구조는 `03-api-contract-design.md`
- DB 필드와 인덱스는 `04-data-model-design.md`
- Runner 단계별 실행 시퀀스는 `05-build-and-preview-execution-flow.md`
- 상태/실패 메시지 규칙은 `06-user-messaging-and-failure-handling.md`

## 11. 현 단계 결론

- MVP에서 가장 중요한 경계는 `AI 에이전트/Skill`과 `Build Server`, 그리고 `Build Server`와 `Runner` 사이의 분리다.
- 이 경계가 먼저 닫혀야 이후 도메인, API, 데이터 설계가 흔들리지 않는다.
