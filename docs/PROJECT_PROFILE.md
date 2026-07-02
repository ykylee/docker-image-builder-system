<!-- standard-ai-workflow-kit: v0.11.21-beta -->

# Project Workflow Profile

- 문서 목적: 프로젝트 특화 규칙과 실행/검증 기준을 정의한다.
- 범위: 프로젝트 개요, 문서 구조, 기본 명령, 검증 포인트, 예외 규칙
- 대상 독자: 개발자, 운영자, AI agent, 프로젝트 온보딩 담당자
- 상태: draft
- 최종 수정일: 2026-07-02
- 관련 문서: [공통 표준](../ai-workflow/core/global_workflow_standard.md)

## 1. 프로젝트 개요
- 프로젝트명: Docker Image Builder System
- 프로젝트 목적: AI 에이전트가 비개발자 사용자의 앱 산출물을 빌드 서버로 전달하고, 테스트 가능한 preview URL까지 연결하는 Docker build preview platform을 설계한다.
- 주요 이해관계자: 비개발자 사용자, AI 에이전트 운영자, Build Server/Runner 설계자, 플랫폼 운영자

## 2. 문서 구조 (Path)
- 문서 위키 홈: README.md
- 운영 문서 홈: ai-workflow/memory/active/
- 백로그 위치: ai-workflow/memory/active/backlog/
- 세션 인계 문서: <ai-workflow/memory/active/session_handoff.md>
- 환경 기록 위치: <ai-workflow/memory/active/repository_assessment.md>
- 제품 온보딩 기준: docs/sdlc/01-mvp-onboarding.md
- 컨셉 고도화 문서: docs/sdlc/02-concept-refinement.md
- 요구사항 기준선: docs/sdlc/03-requirements-baseline.md
- 설계 구조 문서: docs/sdlc/04-design-structure.md
- Step 05 진입 문서: docs/sdlc/05-design-closure-and-step-05-entry.md
- 설계 문서 1: docs/sdlc/design/01-system-context-and-responsibilities.md
- 설계 문서 2: docs/sdlc/design/02-domain-model-and-state-transitions.md
- 설계 문서 3: docs/sdlc/design/03-api-contract-design.md
- 설계 문서 4: docs/sdlc/design/04-data-model-design.md
- 설계 문서 5: docs/sdlc/design/05-build-and-preview-execution-flow.md
- 설계 문서 6: docs/sdlc/design/06-user-messaging-and-failure-handling.md

## 3. 기본 명령 (Commands)
- 설치: 미정 - 애플리케이션 코드 미구현
- 로컬 실행: 미정 - 컨셉과 구조 정리 후 확정
- 빠른 테스트: 미정 - 구현 착수 이후 확정
- 격리 테스트: 미정 - Docker/Runner 통합 설계 이후 확정
- 실행 확인: 문서 간 현재 focus, 작업 상태, 참조 경로 정합성 점검

## 4. 검증 포인트 (Validation)
- 코드 변경: 현재 단계에서는 해당 사항 없음. 구현 전에는 도메인 경계와 책임 분리가 문서로 먼저 확정되어야 함
- 문서 변경: README, MVP_ONBOARDING, CONCEPT_REFINEMENT, handoff, backlog, state가 같은 현재 focus를 가리켜야 함
- UI 변경: 해당 사항 없음. Preview portal 논의가 생기면 별도 기준 정의
- 배포/운영: Docker 실행 권한, preview URL 노출 정책, 컨테이너 수명 정책이 문서로 합의되기 전에는 운영 판단 금지

## 5. 예외 규칙 (Policy)
- 병합: 현재 단계에서는 구현보다 컨셉 문서 정합성을 우선한다
- 승인: Docker 보안 정책, registry 연동, 외부 preview 도메인 정책은 운영자 승인 필요
- 제약: 저장소는 Git 미초기화 상태이며 애플리케이션 코드와 실행 명령이 아직 없다
- 기타: 현재 다음 단계는 Step 05 진입 전 baseline decision 정리와 구현 backlog 분해다

## 다음에 읽을 문서
- [세션 인계 문서](../ai-workflow/memory/active/session_handoff.md)
- [작업 백로그](../ai-workflow/memory/active/work_backlog.md)
