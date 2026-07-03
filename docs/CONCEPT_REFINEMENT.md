<!-- standard-ai-workflow-kit: v0.11.21-beta -->

> **⚠ Superseded (2026-07-03)**
> 이 문서는 초기 컨셉 단계의 잔재입니다. canonical 기준선은 [`docs/sdlc/02-concept-refinement.md`](../sdlc/02-concept-refinement.md)이며, 본 파일은 참고용으로만 보관합니다.
> 자세한 인덱스: [`docs/report/README.md`](../report/README.md) 및 [`docs/review/01-sdlc-review.md`](../review/01-sdlc-review.md) §P2.

# Docker Build Preview Platform Concept Refinement

- 문서 목적: MVP 온보딩 문서를 바탕으로 제품 컨셉을 더 정교하게 정의한다.
- 범위: 사용자 모델, 책임 경계, 운영 정책, 미결정 항목, 문서화 우선순위
- 대상 독자: 프로젝트 리드, AI 에이전트, 설계 참여자
- 상태: draft
- 최종 수정일: 2026-07-03
- 관련 문서: `docs/sdlc/02-concept-refinement.md`, `docs/PROJECT_PROFILE.md`, `docs/PREVIEW_POLICY.md`, `docs/IDENTITY_MODEL.md`, `docs/GLOSSARY_AND_STATE_MODEL.md`, `docs/REQUIREMENTS_BASELINE.md`, `ai-workflow/memory/active/work_backlog.md`

## 1. 이번 단계의 목표

이번 단계는 구현 착수가 아니라 아래 질문에 답하는 것이다.

- 이 플랫폼이 누구를 위해 존재하는가
- Skill/MCP와 Build Server의 경계는 어디까지인가
- MVP에서 반드시 제공해야 하는 사용자 가치는 무엇인가
- 어떤 운영 정책이 먼저 정해져야 구현이 흔들리지 않는가

## 2. 사용자와 역할 정의

### 2.1 1차 사용자

- 비개발자 사용자
  - 앱 개발은 AI 에이전트와 함께 수행한다
  - Docker 지식 없이 "배포해줘"라고 요청한다
  - 최종적으로 preview URL에서 실행 결과를 확인한다

### 2.2 시스템 행위자

- AI 에이전트
  - 사용자 요청 해석
  - 앱 산출물 위치 파악
  - Dockerfile/.dockerignore 준비
  - Build Server 요청 및 상태 안내

- Build Server
  - 빌드 요청 접수
  - 상태 저장
  - 중복 빌드 방지
  - Runner 조정용 데이터 허브 역할

- Runner
  - 실제 docker build / docker run 수행
  - 로그와 상태 갱신
  - preview 컨테이너 수명 관리의 실행 주체

## 3. MVP 핵심 가치 재정의

이 MVP의 핵심은 "빌드 성공" 자체가 아니라 "사용자가 테스트 가능한 URL을 받는 것"이다.

따라서 MVP 판단 기준은 다음 순서로 둔다.

1. 사용자가 배포 요청을 자연어로 할 수 있는가
2. 시스템이 요청을 추적 가능한 빌드 작업으로 바꿀 수 있는가
3. 빌드 완료 후 preview URL을 안정적으로 제공할 수 있는가
4. 실패 시 사용자가 이해 가능한 설명을 받을 수 있는가

## 4. 책임 경계 정교화

### Skill/MCP가 해야 하는 일

- 사용자 요청을 배포 작업으로 해석
- 앱 이름과 소스 루트 결정
- Dockerfile 존재 여부 점검
- 소스 압축과 metadata 준비
- 빌드 상태를 사용자 친화적 문장으로 번역

### Skill/MCP가 하지 말아야 하는 일

- 서버 밖에서 직접 docker build 수행
- 운영 정책을 임의로 결정
- preview 인프라 상태를 임의로 복구

### Build Server가 해야 하는 일

- 요청 수신과 상태 저장
- active build 판정
- archive 및 결과 metadata 관리
- Runner가 신뢰할 수 있는 작업 큐 제공

### Runner가 해야 하는 일

- 실제 Docker 실행
- 상태 전이와 로그 기록
- preview 실행/중지/정리

## 5. 구현 전에 먼저 확정해야 할 정책

### 5.1 preview 노출 정책

- 포트 직접 노출로 시작할지
- reverse proxy path 기반으로 시작할지
- 사용자에게 보여줄 URL 규칙을 어떻게 통일할지

### 5.2 preview 수명 정책

- 기본 TTL을 얼마로 둘지
- 새 빌드 성공 시 이전 preview를 즉시 중지할지
- 사용자의 연장 요청을 허용할지

### 5.3 Dockerfile 생성 정책

- 기본 템플릿 우선인지
- 앱 타입 자동 감지 우선인지
- 생성 후 사용자에게 확인을 요구할지

### 5.4 보안 및 격리 정책

- 어떤 base image를 허용할지
- 네트워크/볼륨 권한을 어떻게 제한할지
- 환경 변수와 secret을 어떤 경로로 주입할지

## 6. 아직 풀지 않은 질문

- `userId`는 어떤 시스템의 사용자 식별자를 기준으로 할 것인가
- `appName`은 사용자가 직접 정하는가, 에이전트가 제안하는가
- source archive는 Build Server가 직접 업로드 받는가, 별도 object storage를 두는가
- preview URL은 빌드 단위인지 앱 단위인지
- 실패 요약은 서버가 일부 제공하는가, Skill/MCP가 전적으로 생성하는가

## 7. 다음 문서화 우선순위

### Priority A

- 용어집: build, preview, deployment, active build, completed build
- 상태 전이 규칙
- 중복 빌드 방지 규칙

### Priority B

- API 계약 초안
- preview lifecycle 정책
- archive metadata 스키마

### Priority C

- Dockerfile generation policy
- failure summarization policy
- future registry/deployment integration notes

## 8. 이번 턴 산출물

- `docs/PREVIEW_POLICY.md`
- `docs/IDENTITY_MODEL.md`
- `docs/GLOSSARY_AND_STATE_MODEL.md`
- `docs/REQUIREMENTS_BASELINE.md`

## 9. 현 시점 결론

- 구현으로 바로 넘어가기보다 컨셉을 한 단계 더 고도화하는 판단이 맞다.
- 특히 preview 정책, 식별자 모델, 책임 경계를 먼저 문서로 확정해야 이후 설계와 구현이 흔들리지 않는다.
- 다음 태스크는 코드 스캐폴드가 아니라 컨셉 세부 문서의 분화다.
