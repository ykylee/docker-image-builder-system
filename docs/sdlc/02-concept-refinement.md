# Docker Build Automation Platform SDLC Step 02 - Concept Refinement

- 문서 목적: MVP 온보딩 결과를 바탕으로 제품 컨셉과 정책 경계를 더 정교하게 정의한다.
- 범위: 사용자 모델, 책임 경계, 운영 정책, 미결정 항목, 문서화 우선순위
- 대상 독자: 프로젝트 리드, AI 에이전트, 설계 참여자
- 상태: draft
- 최종 수정일: 2026-07-03
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
  - 최종적으로 build 결과, 컨테이너 테스트 결과, 배포 결과를 이해 가능한 형태로 확인한다

### 2.2 시스템 행위자

- AI 에이전트
  - 사용자 요청 해석
  - 앱 산출물 위치 파악
  - Git URL 또는 source archive 준비
  - Dockerfile/.dockerignore 준비
  - Build Server 요청 및 상태 안내

- Build Server
  - 빌드 요청 접수
  - 상태 저장
  - 중복 빌드 방지
  - Runner 조정용 데이터 허브 역할

- Runner
  - 실제 source 준비, docker build, docker run 수행
  - 로그와 상태 갱신
  - 테스트 runtime 및 배포 실행의 주체

## 3. MVP 핵심 가치 재정의

이 MVP의 핵심은 "이미지가 만들어졌다"가 아니라 "입력된 산출물이 검증 가능한 실행 결과와 배포 결과로 이어진다"는 것이다.

판단 기준:

1. 사용자가 배포 요청을 자연어로 할 수 있는가
2. 시스템이 요청을 추적 가능한 빌드 작업으로 바꿀 수 있는가
3. 빌드 완료 후 최소 동작 테스트 결과를 신뢰 가능하게 제공할 수 있는가
4. 테스트 성공 시 외부 시스템 배포 결과를 추적할 수 있는가
5. 실패 시 사용자가 이해 가능한 설명을 받을 수 있는가

## 4. 책임 경계 정교화

### Skill/MCP가 해야 하는 일

- 사용자 요청을 빌드 작업으로 해석
- 앱 이름과 소스 입력 방식 결정
- Dockerfile 존재 여부 점검
- source archive 와 metadata 준비
- 빌드/테스트/배포 상태를 사용자 친화적 문장으로 번역

### Skill/MCP가 하지 말아야 하는 일

- 서버 밖에서 직접 docker build 수행
- 운영 정책을 임의로 결정
- 테스트 runtime 또는 배포 인프라 상태를 임의로 복구

### Build Server가 해야 하는 일

- 요청 수신과 상태 저장
- active build 판정
- 로그, artifact metadata, 배포 결과 관리
- Runner가 신뢰할 수 있는 작업 큐 제공

### Runner가 해야 하는 일

- 실제 source 준비와 Docker 실행
- 상태 전이와 로그 기록
- 컨테이너 테스트 실행과 외부 시스템 배포
- 임시 runtime 자원 실행/중지/정리

## 5. 우선 정책 주제

- 테스트 runtime 노출 정책
- runtime 수명 및 정리 정책
- Dockerfile 생성 정책
- 보안 및 격리 정책
- 외부 배포 대상 프로토콜 정책
- 식별자 및 naming 모델

## 6. 이번 단계 산출물

- `docs/sdlc/SRS/01-priority-matrix.md`
- `docs/sdlc/SRS/02-functional-requirements.md`
- `docs/sdlc/SRS/03-non-functional-requirements.md`
- `docs/sdlc/SRS/04-policy-and-constraints.md`
- `docs/sdlc/SRS/05-open-issues-and-decisions.md`

## 7. 현 단계 결론

- 구현으로 바로 넘어가기보다 컨셉을 요구사항 언어로 변환하는 판단이 맞다.
- build, test, deploy, result delivery 경계를 먼저 문서로 확정해야 이후 설계와 구현이 흔들리지 않는다.
- 임시 runtime URL은 여전히 유효한 운영 수단이지만, MVP 성공 기준 전체를 대표하는 단일 산출물로 두지는 않는다.
