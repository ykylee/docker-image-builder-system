# Docker Image Builder System

비개발자 사용자가 AI 에이전트에게 "배포해줘"라고 요청하면, 소스 준비부터 Docker 이미지 빌드와 테스트용 미리보기 URL 제공까지 이어지는 흐름을 지원하는 플랫폼이다.

현재 저장소는 구현 전 온보딩 단계이며, 제품 컨셉과 MVP 범위를 먼저 문서화한 상태다.

## Product Direction

- SDLC Step 01: `docs/sdlc/01-mvp-onboarding.md`
- SDLC Step 02: `docs/sdlc/02-concept-refinement.md`
- SDLC Step 03: `docs/sdlc/03-requirements-baseline.md`
- SDLC Step 04: `docs/sdlc/04-design-structure.md`
- SDLC Step 05 Entry: `docs/sdlc/05-design-closure-and-step-05-entry.md`
- SDLC Step 06: `docs/sdlc/06-implementation-axis-and-workstreams.md`
- SDLC Step 07: `docs/sdlc/07-implementation-backlog-baseline.md`
- Shared Contract Baseline: `docs/sdlc/contracts/01-shared-build-contract-baseline.md`
- SDLC Step 08: `docs/sdlc/08-build-server-tech-stack-baseline.md`
- SDLC Step 09: `docs/sdlc/09-repository-package-structure-baseline.md`
- SDLC Step 10: `docs/sdlc/10-pkg-002-build-server-request-intake-breakdown.md`
- SDLC Step 11: `docs/sdlc/11-pkg-003-build-server-persistence-breakdown.md`
- Step 04 Design 01: `docs/sdlc/design/01-system-context-and-responsibilities.md`
- Step 04 Design 02: `docs/sdlc/design/02-domain-model-and-state-transitions.md`
- Step 04 Design 03: `docs/sdlc/design/03-api-contract-design.md`
- Step 04 Design 04: `docs/sdlc/design/04-data-model-design.md`
- Step 04 Design 05: `docs/sdlc/design/05-build-and-preview-execution-flow.md`
- Step 04 Design 06: `docs/sdlc/design/06-user-messaging-and-failure-handling.md`
- SRS 우선순위 매트릭스: `docs/sdlc/SRS/01-priority-matrix.md`
- SRS 기능 요구사항: `docs/sdlc/SRS/02-functional-requirements.md`
- SRS 비기능 요구사항: `docs/sdlc/SRS/03-non-functional-requirements.md`
- SRS 정책 및 제약: `docs/sdlc/SRS/04-policy-and-constraints.md`
- SRS 미결정 항목: `docs/sdlc/SRS/05-open-issues-and-decisions.md`
- SRS MVP 필수 확정본: `docs/sdlc/SRS/06-mvp-must-requirements.md`
- Step 05 baseline decisions: `docs/sdlc/decisions/`
- 프로젝트 운영 프로파일: `docs/PROJECT_PROFILE.md`
- 세션 인계: `ai-workflow/memory/active/session_handoff.md`
- 작업 백로그: `ai-workflow/memory/active/work_backlog.md`
- 저장소 상태 평가: `ai-workflow/memory/active/repository_assessment.md`

## MVP Scope

- Track 1: Docker Image Build Server
- Track 2: Docker Build Skill / MCP 세트
- 공통 목표: Docker 지식이 없는 사용자에게 테스트 URL까지 이어지는 배포 경험 제공

## Current Focus

- 외부 컨셉 문서를 저장소 기준 문서로 흡수
- SDLC Step 04 설계 문서 6종과 Step 05 진입 기준 문서를 정리
- build queue와 preview service queue를 분리하는 운영 모델 반영
- `PKG-003` persistence 세분화까지 반영했고, 다음 단계는 shared package 스캐폴드 또는 `PKG-004` 조회 계층 세분화다
