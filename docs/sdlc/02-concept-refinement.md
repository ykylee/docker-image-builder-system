# Docker Build Preview Platform SDLC Step 02 - Concept Refinement

- 문서 목적: MVP 온보딩 결과를 바탕으로 제품 컨셉과 정책 경계를 더 정교하게 정의한다.
- 범위: 사용자 모델, 책임 경계, 운영 정책, 미결정 항목, 문서화 우선순위
- 대상 독자: 프로젝트 리드, AI 에이전트, 설계 참여자
- 상태: draft
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/sdlc/01-mvp-onboarding.md`, `docs/sdlc/03-requirements-baseline.md`, `docs/sdlc/SRS/`

## 1. 이번 단계의 목표

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

판단 기준:

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

## 5. 우선 정책 주제

- preview 노출 정책
- preview 수명 정책
- Dockerfile 생성 정책
- 보안 및 격리 정책
- 식별자 및 naming 모델

## 6. 이번 단계 산출물

- `docs/sdlc/SRS/01-priority-matrix.md`
- `docs/sdlc/SRS/02-functional-requirements.md`
- `docs/sdlc/SRS/03-non-functional-requirements.md`
- `docs/sdlc/SRS/04-policy-and-constraints.md`
- `docs/sdlc/SRS/05-open-issues-and-decisions.md`

## 7. 현 단계 결론

- 구현으로 바로 넘어가기보다 컨셉을 요구사항 언어로 변환하는 판단이 맞다.
- preview 정책, 식별자 모델, 책임 경계를 먼저 문서로 확정해야 이후 설계와 구현이 흔들리지 않는다.
