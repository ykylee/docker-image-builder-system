<!-- standard-ai-workflow-kit: v0.11.21-beta -->

# Project Workflow Profile

- 문서 목적: 프로젝트 특화 규칙과 실행/검증 기준을 정의한다.
- 범위: 프로젝트 개요, 문서 구조, 기본 명령, 검증 포인트, 예외 규칙
- 대상 독자: 개발자, 운영자, AI agent, 프로젝트 온보딩 담당자
- 상태: draft
- 최종 수정일: 2026-07-03
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
- Step 06 구현 축 문서: docs/sdlc/06-implementation-axis-and-workstreams.md
- Step 07 구현 backlog 문서: docs/sdlc/07-implementation-backlog-baseline.md
- Step 08 기술 스택 문서: docs/sdlc/08-build-server-tech-stack-baseline.md
- Step 09 저장소 구조 문서: docs/sdlc/09-repository-package-structure-baseline.md
- Step 10 `PKG-002` 세분화 문서: docs/sdlc/10-pkg-002-build-server-request-intake-breakdown.md
- Step 11 `PKG-003` 세분화 문서: docs/sdlc/11-pkg-003-build-server-persistence-breakdown.md
- Step 12 `PKG-004` 세분화 문서: docs/sdlc/12-pkg-004-build-server-query-api-breakdown.md
- SDLC 리뷰 문서: docs/review/01-sdlc-review.md
- 과제 계획안: docs/report/01-assignment-plan.md
- 보고용 자료: docs/report/02-sdlc-review-report.html
- 공통 계약 기준 문서: docs/sdlc/contracts/01-shared-build-contract-baseline.md
- Step 05 baseline decisions: docs/sdlc/decisions/
- 설계 문서 1: docs/sdlc/design/01-system-context-and-responsibilities.md
- 설계 문서 2: docs/sdlc/design/02-domain-model-and-state-transitions.md
- 설계 문서 3: docs/sdlc/design/03-api-contract-design.md
- 설계 문서 4: docs/sdlc/design/04-data-model-design.md
- 설계 문서 5: docs/sdlc/design/05-build-and-preview-execution-flow.md
- 설계 문서 6: docs/sdlc/design/06-user-messaging-and-failure-handling.md

## 3. 기본 명령 (Commands)
- 설치: `pnpm install` (스캐폴드 생성 후 채움; 현 단계는 placeholder)
- 로컬 실행: `pnpm --filter build-server dev` (Fastify + Node worker baseline 기준; 스캐폴드 후 확정)
- 빠른 테스트: `pnpm -w test` (TypeScript 유닛 테스트 baseline; 스캐폴드 후 확정)
- 격리 테스트: `docker compose -f compose.dev.yaml up --abort-on-container-exit` (Build Server + Postgres 통합, 결정 후 확정)
- 실행 확인: `docs/PROJECT_PROFILE.md`, `state.json`, `session_handoff.md`, `work_backlog.md`의 current focus, 작업 상태, 참조 경로 정합성 점검
- 출처: `docs/sdlc/08-build-server-tech-stack-baseline.md`, `docs/sdlc/09-repository-package-structure-baseline.md`
- 메모: 현 placeholder 값은 TASK-017 `shared package` 또는 `apps/build-server` API 스캐폴드와 함께 실제 명령으로 좁히며, 본 셋업은 TASK-023에서 진행한다.

## 3.1 활성 워크플로우 자산 (Active Skills / MCPs)
- 본 프로젝트가 표준 워크플로우 키트(`ai-workflow/`)에서 active로 채택한 자산을 정리한다. 미채택 prototype은 명시적으로 deferred 처리한다.
- 출처: `docs/PROJECT_PROFILE.md` §2 문서 경로, `ai-workflow/harnesses/codex/apply_guide.md` §2.1/§2.2, `ai-workflow/skills/README.md`, `ai-workflow/mcp_servers/README.md`
- 관련 결정: TASK-023 workflow skill/MCP 셋업

### 3.1.1 Active Skills (`ai-workflow/skills/`)
- `session-start` — 세션 시작 시 `ai-workflow/memory/active/` 핵심 문서 + 본 프로젝트 문서 경로를 자동 복원
- `backlog-update` — `work_backlog.md` ↔ `backlog/<date>.md` 동기화
- `doc-sync` — 변경 파일에 영향받는 `docs/` 후보 추천 및 링크/메타 점검

### 3.1.2 Active MCP Servers (`ai-workflow/mcp_servers/`)
- `latest-backlog` — 가장 최신 날짜의 backlog markdown 경로 조회
- `check-doc-links` — 상대 링크 무결성 검사
- `check-doc-metadata` — markdown 메타데이터 누락 검사

### 3.1.3 Deferred (현재 미채택)
- Skills: `merge-doc-reconcile`, `validation-plan`, `code-index-update` — 본 프로젝트는 아직 merge conflict/대규모 인덱싱 단계가 아니므로 보류
- MCP: `create-backlog-entry`, `suggest-impacted-docs`, `check-quickstart-stale-links` — 위 active 3종으로 먼저 운영 자동화를 검증한 뒤 활성 검토

### 3.1.4 Transport / 노출 상태
- 키트 prototype의 실제 MCP transport 계층은 표준 키트 측에서 미구현 상태이며, 본 프로젝트는 `.codex/config.toml.example`을 additive로 유지한다 (`transport_ready=false` 명시).
- 전역 `~/.codex/config.toml`에 프로젝트별 명령이나 backlog 경로를 직접 넣지 않는다 (`apply_guide.md` §2.3, §8).

## 4. 검증 포인트 (Validation)
- 코드 변경: 현재 단계에서는 해당 사항 없음. 구현 전에는 도메인 경계와 책임 분리가 문서로 먼저 확정되어야 함
- 문서 변경: README, `docs/sdlc/01-mvp-onboarding.md`, `docs/sdlc/02-concept-refinement.md`, `docs/sdlc/contracts/01-shared-build-contract-baseline.md`, handoff, backlog, state가 같은 현재 focus와 canonical 상태 모델을 가리켜야 함
- UI 변경: 해당 사항 없음. Preview portal 논의가 생기면 별도 기준 정의
- 배포/운영: Docker 실행 권한, preview URL 노출 정책, 컨테이너 수명 정책이 문서로 합의되기 전에는 운영 판단 금지

## 5. 예외 규칙 (Policy)
- 병합: 현재 단계에서는 구현보다 컨셉 문서 정합성을 우선한다
- 승인: Docker 보안 정책, registry 연동, 외부 preview 도메인 정책은 운영자 승인 필요
- 제약: 애플리케이션 코드와 실행 명령이 아직 없으며 문서 기반 설계 상태다
- 기타: 현재 다음 단계는 shared package(`packages/shared-contract`, `packages/shared-config`, `packages/db`) 또는 `apps/build-server` API 스캐폴드 진입이다

## 다음에 읽을 문서
- [세션 인계 문서](../ai-workflow/memory/active/session_handoff.md)
- [작업 백로그](../ai-workflow/memory/active/work_backlog.md)
