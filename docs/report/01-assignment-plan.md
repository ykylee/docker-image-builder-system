# Docker Image Builder System 프로젝트 기획안

- 문서 목적: 프로젝트 개요부터 구현 진입 계획과 예상 산출물까지 한 번에 설명하는 기획 기준 문서를 제공한다.
- 범위: 프로젝트 배경, 목표, 구성, 단계별 추진 전략, 예상 산출물, 리스크
- 대상 독자: 과제 수행자, 지도/검토자, 프로젝트 리드
- 상태: draft
- 최종 수정일: 2026-07-03
- 관련 문서: `docs/sdlc/01-mvp-onboarding.md`, `docs/sdlc/03-requirements-baseline.md`, `docs/sdlc/07-implementation-backlog-baseline.md`, `docs/review/01-sdlc-review.md`

## 1. 프로젝트 개요

Docker Image Builder System은 비개발자 사용자가 AI 에이전트와 함께 만든 애플리케이션을 별도의 Docker 전문 지식 없이 build, container test, external deployment까지 자동으로 처리할 수 있도록 돕는 플랫폼이다.

이 프로젝트가 해결하려는 핵심 문제는 명확하다. 사용자는 앱 생성까지는 AI의 도움을 받을 수 있지만, 실제 실행 검증과 외부 전달을 위해 필요한 Docker 이미지 빌드, 컨테이너 실행, 로그 확인, 실패 대응, 배포 연계는 여전히 높은 진입 장벽으로 남아 있다.

이 시스템은 사용자의 자연어 요청을 Build Server 기반의 추적 가능한 작업으로 전환하고, 최종적으로 테스트 결과와 배포 결과를 전달하는 흐름을 설계 대상으로 삼는다.

## 2. 추진 배경과 필요성

- AI 에이전트가 생성한 앱 결과물을 바로 검증하고 외부 시스템으로 전달할 수 있는 실행 환경이 필요하다.
- 비개발자 사용자는 Dockerfile, port mapping, runtime 설정을 직접 다루기 어렵다.
- 단순 빌드 성공보다 "실행 검증과 결과 전달까지 닫히는 자동화"가 사용자 가치에 더 직접적이다.
- 빌드와 테스트/배포 실행을 표준화하면 Skill/MCP, Build Server, Runner 간 책임 분리가 쉬워진다.

## 3. 프로젝트 목표

### 3.1 최종 목표

- 사용자가 자연어로 배포를 요청할 수 있는 경험을 만든다.
- AI 에이전트가 배포 입력물을 준비하고 서버 요청까지 연결할 수 있게 한다.
- Build Server가 빌드 요청, 상태, 로그, test/deploy 결과를 일관되게 관리하게 한다.
- 테스트 결과와 외부 배포 결과를 사용자 또는 외부 시스템에 안정적으로 전달하는 MVP를 설계하고 구현 착수 기반을 만든다.

### 3.2 이번 단계 목표

- SDLC 기준 문서를 바탕으로 구현 착수용 계획을 다시 정렬한다.
- 전체 프로젝트를 설명하는 발표/보고용 기획 문서 구조를 정리한다.
- 다음 실작업인 shared package 또는 Build Server API 스캐폴드 진입 기준을 명확히 한다.

## 4. 프로젝트 구성

### 4.1 사용자 관점 구성

1. 사용자가 AI 에이전트에게 배포를 요청한다.
2. AI 에이전트가 앱 산출물과 Docker 관련 준비물을 점검한다.
3. Build Server가 요청을 접수하고 상태를 관리한다.
4. Runner가 실제 이미지 빌드, 컨테이너 테스트, 외부 시스템 배포를 수행한다.
5. 사용자는 테스트 결과, 배포 결과, 또는 실패 안내를 받는다.

### 4.2 시스템 관점 구성

- Skill / MCP
  - 사용자 요청 해석
  - 앱 산출물 확인
  - `Dockerfile`, `.dockerignore` 준비
  - Build Server 요청 및 상태 안내
- Build Server
  - 빌드 요청 수신
  - active build 중복 방지
  - 상태, 로그, metadata 저장
  - Runner용 작업 허브 제공
- Runner
  - `docker build`, `docker run` 실행
  - 상태 전이 및 로그 적재
  - 테스트 runtime 및 배포 실행 관리

### 4.3 구현 Workstream 구성

- Workstream A: 공통 계약과 상태 모델 정리
- Workstream B: Build Server request intake 및 query API 설계
- Workstream C: persistence 계층과 migration baseline 정리
- Workstream D: Runner 연계 및 build/test/deploy 실행 흐름 준비
- Workstream E: 보고 자료와 SDLC 기준 문서 정합성 유지

## 5. 추진 범위

### 5.1 MVP 우선 범위

- `POST /builds`, `GET /builds/{buildId}`, `GET /builds/{buildId}/logs`
- `build_request`, `build_log`, `build_test`, `deployment_attempt` 도메인 모델
- active build 중복 방지 규칙
- 테스트 성공과 배포 성공까지의 상태 전이 모델
- Skill/MCP와 Build Server 간 요청 계약

### 5.2 후순위 범위

- registry push 세부 정책
- 다중 Runner 병렬 처리
- runtime exposure 방식 고도화
- production deployment 연계 확장

## 6. 추진 전략

### Phase 0. 기준선 정리

- SDLC 문서와 보고 문서의 source-of-truth를 `docs/sdlc/` 중심으로 통일한다.
- 상태 모델, 정책 제약, 용어 정의를 문서 전반에서 일치시킨다.

### Phase 1. 공통 기반 스캐폴드

- `packages/shared-contract/`
- `packages/shared-config/`
- `packages/db/`

이 단계의 목표는 구현보다 먼저 계약, 타입, schema 진입점을 고정하는 것이다.

### Phase 2. Build Server API 스캐폴드

- `apps/build-server` bootstrap
- request / response schema 연결
- route / service / repository 골격 구성

이 단계에서 Build Server P0 범위를 실제 코드 구조로 변환한다.

### Phase 3. persistence 및 조회 흐름 구현

- baseline migration
- build 저장/조회 repository
- 상태 및 로그 조회 contract 구현

### Phase 4. Runner 및 후속 결정 연계

- Runner claim skeleton 검토
- test/deploy execution 운영 모델 구체화
- 미결정 항목 `OI-006`, `OI-008`, `OI-009` 후속 정리

## 7. 예상 산출물

### 7.1 문서 산출물

- 프로젝트 기획안
- SDLC 단계별 기준 문서
- 요구사항 baseline 및 design 문서 세트
- 리뷰 문서와 보고용 발표 자료

### 7.2 설계 산출물

- 시스템 책임 분리안
- 상태 전이 모델
- API contract 초안
- 데이터 모델 및 persistence 기준

### 7.3 구현 산출물

- `packages/shared-contract`, `packages/shared-config`, `packages/db` 스캐폴드
- `apps/build-server` 초기 API 스캐폴드
- baseline migration 초안
- build 저장/조회 repository 기본 구조

### 7.4 검증 및 발표 산출물

- 구현 착수 기준 정리본
- 다음 단계 backlog와 실행 우선순위
- 발표용 보고자료 재구성 초안

## 8. 기대 효과

- 비개발자 사용자를 위한 배포 경험을 구조적으로 설명할 수 있다.
- 구현 전에 책임 경계와 계약을 정리해 재작업 위험을 줄일 수 있다.
- 발표와 과제 제출 관점에서 "무엇을 만들고 왜 필요한가"를 일관되게 전달할 수 있다.

## 9. 리스크와 대응

- 문서 기준선과 구현 구조가 다시 어긋날 수 있다.
  - 대응: `docs/sdlc/`를 canonical source로 유지한다.
- 스캐폴드만 먼저 열리고 실제 계약 의미가 약해질 수 있다.
  - 대응: `PKG-001`~`PKG-004` 문서와 1:1로 매핑해 생성한다.
- Runner/runtime/deployment 운영 정책이 늦게 확정되면 후속 설계가 지연될 수 있다.
  - 대응: 구현 차단 여부가 높은 결정부터 우선 닫는다.

## 10. 계획 결론

이 프로젝트의 핵심은 Docker 빌드 시스템 자체를 만드는 것이 아니라, AI 에이전트 기반 앱 제작 흐름을 실행 검증과 외부 전달이 가능한 운영 파이프라인으로 연결하는 것이다.

따라서 이번 기획안의 결론은 다음과 같다. 먼저 전체 프로젝트 구조와 산출물을 발표 가능한 형태로 정리하고, 그 다음 shared package와 Build Server API 스캐폴드를 여는 순서로 구현에 진입하는 것이 가장 안정적이다.
