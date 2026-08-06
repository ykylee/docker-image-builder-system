<!-- standard-ai-workflow-kit: v1.0.0-beta -->

# AGENTS.md

- 문서 목적: Codex 가 이 저장소에서 먼저 읽어야 할 workflow 진입 규칙과 기본 작업 원칙을 제공한다.
- 범위: 세션 복원, workflow state docs 참조 순서, 사용자 보고 언어, 기본 실행/검증 명령
- 대상 독자: Codex, 저장소 관리자, workflow 설계자
- 상태: draft
- 최종 수정일: 2026-07-20
- 관련 문서: `ai-workflow/memory/active/state.json`, `ai-workflow/memory/active/sessions`, `ai-workflow/memory/active/backlog`, `docs/PROJECT_PROFILE.md`

## 목적

이 저장소에서는 표준 AI 워크플로우를 기준으로 작업한다. 세션 시작, backlog 갱신, 문서 동기화, 세션 종료는 `ai-workflow/` 아래 문서를 우선 기준으로 삼는다.

## 항상 먼저 읽을 문서

- `ai-workflow/memory/active/state.json`
- `ai-workflow/memory/active/sessions`
- `ai-workflow/memory/active/backlog`
- `docs/PROJECT_PROFILE.md`
- `ai-workflow/wiki/index.md` — R4 anchor 기반, AI agent query 시 먼저 로드

`ai-workflow/` 는 세션 복원과 workflow 상태 관리용 메타 레이어다. 프로젝트 코드나 프로젝트 문서를 탐색할 때는 이 경로를 기본 탐색 범위에 넣지 말고, workflow 문서 자체를 갱신하거나 현재 세션 상태를 복원할 때만 예외적으로 참조한다.

## 작업 원칙

- 작업을 시작하기 전에 목적, 범위, 영향 문서를 짧게 정리한다.
- 작업 상태는 `planned`, `in_progress`, `blocked`, `done` 중 하나로 관리한다.
- 검증하지 않은 결과는 완료로 확정하지 않는다.
- 세션 종료 전에는 `state.json`, `session_handoff.md`, 최신 backlog 를 갱신한다.

## 언어와 컨텍스트 원칙

- 사용자에게 직접 보이는 작업 보고, 상태 요약, 문서 갱신 문안은 기본적으로 한국어로 작성한다.
- 코드, 명령어, 파일 경로, 설정 key, 외부 시스템 고유 명칭은 필요할 때 원문 그대로 유지한다.
- 내부 사고 과정과 임시 분류는 모델이 가장 효율적인 방식으로 처리하되, 사용자에게는 필요한 결론과 다음 행동만 짧게 전달한다.
- 장문의 중간 reasoning, 중복 요약, 불필요한 자기 설명을 피한다.
- handoff 와 backlog 에는 다음 세션에 필요한 핵심 사실만 남겨 불필요한 컨텍스트 누적을 줄인다.

## 프로젝트 실행 기본값

아래는 2026-07-21 (TASK-131) 로컬 환경에서 실행 검증된 값이다. SSOT 는
`ai-workflow/memory/active/state.json` 의 `commands`.

- 설치: `pnpm install`
- 로컬 실행 (Postgres backend — default 개발 경로):
  `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/docker_image_builder BUILD_REPOSITORY_BACKEND=postgres node apps/build-server/dist/apps/build-server/src/index.js`
- 빠른 테스트: 각 tsconfig 에 `tsc --noEmit` (shared-contract / shared-config / db /
  build-server) + `apps/build-monitor` 의 `tsc --noEmit -p tsconfig.react.json`
- 격리 테스트: frontend `vitest run` (133) / build-server
  `node --import tsx --test tests/*.test.ts` (172) / runner `go test ./...` (8/8 package)
- 실행 확인: `GET /health` → `{"status":"ok"}` + `POST /builds` + `GET /builds` 로 Postgres 왕복

> 이 항목들은 `9c069a9` (2026-07-09 harness overlay) 가 실제 명령을 `TODO:`
> placeholder 로 덮어쓴 뒤 12일간 방치돼 있었다. TASK-131 의 문서 무결성 가드가
> 히스토리 스캔에서 이를 발견해 복구했다. 같은 계열 사고 (`docs/PROJECT_PROFILE.md`
> 302줄 유실) 는 TASK-124 참조.

## 문서 작업 기준

- 문서 위키 홈: `README.md`
- 운영 문서 위치: `ai-workflow/memory/active/`
- backlog 위치: `ai-workflow/memory/active/backlog/`
- session handoff 위치: `ai-workflow/memory/active/session_handoff.md`

## Codex 전용 메모

- Codex 는 프로젝트 루트의 `AGENTS.md` 를 읽으므로, 상세 정책은 본 문서에서 시작하고 세부 운영 기준은 `ai-workflow/` 문서를 참조한다.
- OpenAI 관련 질문이 나오면 OpenAI 문서 MCP 를 우선 사용하는 구성을 권장한다.
- 가능한 경우 메인 에이전트는 조정과 통합에 집중하고, bounded scope 의 읽기/쓰기/검증 작업은 worker 성격의 서브 에이전트로 분리하는 패턴을 권장한다.
- worker 에게는 책임 파일과 종료 조건을 명확히 넘기고, 메인 에이전트에는 핵심 사실과 결과만 다시 모은다.
- `main`/`small` 모델을 함께 운영한다면, 메인 에이전트는 난도 높은 판단과 통합에, worker 는 bounded scope 탐색/초안/검증에 우선 배치하는 편이 효율적이다.
- 기존 코드베이스 분석 결과를 반영한 초안이다. 추정 명령과 문서 경로는 실제 저장소 기준으로 수정할 수 있다.
