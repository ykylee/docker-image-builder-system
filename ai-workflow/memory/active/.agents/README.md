# Project-Local Codex Entry (`.agents/` mirror)

- 문서 목적: Codex가 이 저장소를 열 때 자동으로 읽는 project-local 진입 메모. 표준 워크플로우 키트 `ai-workflow/` 의 prototype skill/MCP를 우리 프로젝트 운영에 어떻게 묶었는지 한 곳에서 안내한다.
- 범위: active skill/MCP 목록, 세션 시작 순서, 자동화 진입점
- 대상 독자: Codex, 프로젝트 온보딩 담당자
- 상태: stable
- 최종 수정일: 2026-07-03
- 관련 문서: [`../../../../AGENTS.md`](../../../../AGENTS.md), [`../../../../docs/PROJECT_PROFILE.md` §3.1](../../../../docs/PROJECT_PROFILE.md), [`../../../../ai-workflow/harnesses/codex/apply_guide.md`](../../../../ai-workflow/harnesses/codex/apply_guide.md)

## 1. 시작 순서 (Codex가 이 저장소에서 자동 실행)

1. 루트 [`AGENTS.md`](../../../../AGENTS.md) → 워크플로우 진입 규칙을 먼저 읽는다.
2. `ai-workflow/memory/active/` 아래의 운영 문서를 순서대로 복원한다.
   - `state.json`
   - `session_handoff.md`
   - `work_backlog.md`
   - `backlog/<latest_date>.md`
   - `repository_assessment.md`
   - `project_status_assessment.md`
3. 본 프로젝트의 제품/요구사항/설계 canonical source는 `docs/PROJECT_PROFILE.md` §2 와 `docs/sdlc/` 계층이다.
4. 명령 placeholder, current focus, handoff의 next actions가 서로 어긋나면 `state.json` 과 `backlog/<latest_date>.md` 를 우선한다.

## 2. Active Skills (prototype → 운영 진입)

- 출처: `docs/PROJECT_PROFILE.md` §3.1.1
- 호출 진입점: `ai-workflow/skills/<name>/SKILL.md`
- 본 프로젝트 active 3종: `session-start`, `backlog-update`, `doc-sync`

## 3. Active MCP Servers (prototype → 운영 진입)

- 출처: `docs/PROJECT_PROFILE.md` §3.1.2, `.codex/config.toml.example`
- 호출 진입점: `ai-workflow/mcp_servers/<name>/MCP.md`
- 본 프로젝트 active 3종: `latest-backlog`, `check-doc-links`, `check-doc-metadata`
- `transport_ready = false` 이므로 실제 호출은 표준 키트 측 transport가 준비된 이후에 활성화한다. 그 전까지는 동일한 입력/출력 계약을 따라 수동 절차를 유지한다.

## 4. 변경 시 갱신 순서

- 본 메모(`.agents/README.md`)는 active/deferred 목록을 바꾸거나 MCP transport가 준비될 때만 수정한다.
- 갱신 후에는 같은 변경을 `docs/PROJECT_PROFILE.md` §3.1, `state.json`, `session_handoff.md` 에 반영하고 `backlog/<today>.md` plan/act/result에 남긴다.
