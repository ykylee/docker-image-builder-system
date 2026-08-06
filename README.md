# Docker Image Builder System

외부 사용자 또는 AI 에이전트가 "배포해줘"라고 요청하면, 소스 입력부터 Docker 이미지 빌드, 컨테이너 동작 테스트, 외부 시스템 배포, 결과 전달까지 이어지는 자동화 흐름을 지원하는 플랫폼이다.

현재 저장소는 SDLC 기준선과 초기 구현 스캐폴드가 함께 존재하는 단계이며, `docs/sdlc/`가 제품/설계의 canonical source다.

## Product Direction

- Wiki Index: `ai-workflow/wiki/index.md` (R4 anchor)

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
- SDLC Step 12: `docs/sdlc/12-pkg-004-build-server-query-api-breakdown.md`
- SDLC Review: `docs/review/01-sdlc-review.md`
- Assignment Plan: `docs/report/01-assignment-plan.md`
- Review Report: `docs/report/02-sdlc-review-report.html`
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

- Track 1: Docker Build And Deployment Server
- Track 2: Docker Build Skill / MCP 세트
- 공통 목표: Docker 지식이 없는 사용자에게 build -> test -> deploy -> result delivery 경험 제공

## Current Focus

- 외부 요구사항을 `docs/sdlc/` 기준 문서군으로 흡수
- preview-first 서사를 build -> container test -> external deployment -> result delivery 모델로 재정렬
- Build Server / Runner / Skill-MCP 경계를 구현 가능한 수준까지 문서화
- 다음 단계는 문서 정합성 마감 후 shared package, API, Runner 연동 축을 계속 구현하는 것이다
