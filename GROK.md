<!-- standard-ai-workflow-kit: v1.0.0-beta -->

# GROK.md (Grok Build 진입점)

- 문서 목적: Grok Build (xAI CLI TUI) 가 이 저장소에서 매 세션 자동 read 하는 진입점 문서.
- 범위: 세션 복원, workflow state docs 참조 순서, 사용자 보고 언어, subagent / memory / MCP 운영 원칙
- 대상 독자: Grok Build, 저장소 관리자, 멀티 에이전트 운영자
- 상태: beta
- 최종 수정일: 2026-07-20
- 관련 문서: `AGENTS.md` (Codex 와 공통), `ai-workflow/memory/active/state.json`, `ai-workflow/memory/active/sessions`, `ai-workflow/memory/active/backlog`, `docs/PROJECT_PROFILE.md`

## 목적

이 저장소에서는 **Standard AI Workflow** 를 기준으로 작업한다. 세션 시작, backlog 갱신, 문서 동기화, 세션 종료는 `ai-workflow/` 아래 문서를 우선 기준으로 삼는다. Grok Build 는 메인 에이전트로 동작하고, 내장 subagent (`explore` / `plan`) 또는 custom agent (`.grok/agents/`) 로 bounded scope 작업을 위임해 컨텍스트를 절약한다.

## 항상 먼저 읽을 문서

- `AGENTS.md` (Codex 와 공통 진입점 — 한국어 baseline + worker 분리 원칙)
- `ai-workflow/memory/active/state.json`
- `ai-workflow/memory/active/sessions`
- `ai-workflow/memory/active/backlog`
- `docs/PROJECT_PROFILE.md`
- `ai-workflow/wiki/index.md` — R4 anchor 기반, AI agent query 시 먼저 로드

`ai-workflow/` 는 세션 복원과 workflow 상태 관리용 메타 레이어다. 프로젝트 코드나 프로젝트 문서를 탐색할 때는 이 경로를 기본 탐색 범위에 넣지 말고, workflow 문서 자체를 갱신하거나 현재 세션 상태를 복원할 때만 예외적으로 참조한다.

## AGENTS.md 와의 관계

- `AGENTS.md` 는 Codex 와 공통 진입점. 메인 에이전트의 한국어 baseline, worker 분리 원칙, `ai-workflow/memory/active/` 문서 참조 순서를 정의.
- 본 `GROK.md` 는 Grok Build 전용 *additive rule* — subagent 활용, MCP 등록, memory opt-in, skill 등록 절차만 추가. `AGENTS.md` 와 정합 유지.
- 두 문서가 가리키는 사실이 다르다면 `GROK.md` 가 우선 (Grok Build 세션에서 additive rule). 한국어 baseline 은 *동일하게 유지*.

## 진입 skill (TUI picker)

- `/` 입력 후 `standard-ai-workflow` 검색 → 본 하네스가 emit 한 `.grok/skills/standard-ai-workflow/SKILL.md` 가 표시됨.
- skill 본문: 세션 시작, 백로그 갱신, 문서 동기화 절차.

## 작업 원칙

- 작업을 시작하기 전에 목적, 범위, 영향 문서를 짧게 정리한다.
- 작업 상태는 `planned`, `in_progress`, `blocked`, `done` 중 하나로 관리한다.
- 검증하지 않은 결과는 완료로 확정하지 않는다.
- 세션 종료 전에는 `state.json`, `session_handoff.md`, 최신 backlog 를 갱신한다.
- 가능한 한 메인 에이전트는 조정과 통합에 집중하고, bounded scope 작업은 subagent / custom agent 에 위임한다.

## Subagent 운영 원칙 (Grok Build Multi-Agent Topology)

- **메인 에이전트**: 사용자 직접 소통, 작업 분해, subagent 호출/통합, `state.json`/`session_handoff`/`work_backlog` 동기화 전담. 도구 호출을 직접 떠안지 않는다.
- **내장 subagent `explore`** (read-only): 코드베이스 탐색, 파일 검색, grep 등 bounded scope read 작업. `--model grok-4.20-multi-agent` 같은 가벼운 모델로 분리 권장.
- **내장 subagent `plan`** (read-only): 작업 분해 / 영향 분석 / 구현 계획 작성. 메인 에이전트가 도구 호출 전에 plan 으로 점검.
- **custom agent** (`.grok/agents/`): doc / code / validation worker 처럼 *역할별 페르소나* 가 필요하면 정의.

subagent 호출 시 의도와 책임 경계를 명확히 적는다 (`agent_id`, `task_description`, `input_files`, `output_files`, `constraints`, `context_summary`).

## MCP 등록 (`.grok/config.toml`)

- 본 하네스가 emit 한 `.grok/config.toml.example` 를 `.grok/config.toml` 로 `cp` 후 사용.
- 절대 경로 보정 필수:
  - `PYTHONPATH = "/ABSOLUTE/PATH/TO/standard_ai_workflow/workflow-source"`
  - `STANDARD_AI_WORKFLOW_ROOT = "/ABSOLUTE/PATH/TO/<project_root>"`
- `--enable-mcp` 시 `[mcp_servers.standardAiWorkflowReadOnly]` 블록이 자동 emit.
- `--mcp-bridge jsonrpc-bridge|stdio-sdk` 로 transport 선택. 기본값은 `jsonrpc-bridge` (안정).

### 호환성 자동 import

Grok Build 는 다음 호환 파일을 자동 로드 (config > claude > cursor > mcp 우선순위).

| Source | Format | Location |
|---|---|---|
| `config.toml` | Native Grok config | `~/.grok/config.toml`, `.grok/config.toml` |
| `.claude.json` | Claude Code format | `~/.claude.json` |
| `.cursor/mcp.json` | Cursor format | `~/.cursor/mcp.json`, `<project>/.cursor/mcp.json` |
| `.mcp.json` | MCP standard | Project root |

→ 기존 workflow MCP 등록이 Claude / Cursor / 표준 MCP 소스에 있으면 자동 import. **단, 동일 alias 의 `[mcp_servers]` 가 여러 소스에 있으면 config.toml 이 우선** 이므로 의도치 않은 override 가능.

## Memory (opt-in)

- `~/.grok/memory/` 는 `--experimental-memory` 또는 `GROK_MEMORY=1` 로 opt-in.
- opt-in 없이 memory 디렉터리를 신뢰하지 않는다.
- `[memory]` 설정: `enabled`, `[memory.session] save_on_end`, `[memory.search] max_results`, `[memory.initial_injection] min_score`.

## 언어와 컨텍스트 원칙

- 사용자에게 직접 보이는 작업 보고, 상태 요약, 문서 갱신 문안은 기본적으로 한국어로 작성한다.
- 코드, 명령어, 파일 경로, 설정 key, 외부 시스템 고유 명칭은 필요할 때 원문 그대로 유지한다.
- 내부 사고 과정과 임시 분류는 모델이 가장 효율적인 방식으로 처리하되, 사용자에게는 필요한 결론과 다음 행동만 짧게 전달한다.
- 장문의 중간 reasoning, 중복 요약, 불필요한 자기 설명을 피한다.
- handoff 와 backlog 에는 다음 세션에 필요한 핵심 사실만 남겨 불필요한 컨텍스트 누적을 줄인다.

## 프로젝트 실행 기본값

- 설치: `npm install`
- 로컬 실행: `TODO: 로컬 실행 명령 입력`
- 빠른 테스트: `TODO: 빠른 테스트 명령 입력`
- 격리 테스트: `TODO: 격리 테스트 명령 입력`
- 실행 확인: `node --version`

## 문서 작업 기준

- 문서 위키 홈: `README.md`
- 운영 문서 위치: `ai-workflow/memory/active/`
- backlog 위치: `ai-workflow/memory/active/backlog/`
- session handoff 위치: `ai-workflow/memory/active/session_handoff.md`

## Grok Build 전용 메모

- Grok Build 는 `AGENTS.md` 와 `GROK.md` 모두를 root 진입점으로 자동 read. 정책 충돌 시 `GROK.md` 가 우선하되, 두 문서가 같은 사실을 가리키는 방향으로 동기화.
- `.grok/config.toml.example` 는 사용자 환경 설정(`~/.grok/config.toml` 또는 프로젝트 로컬 `.grok/config.toml`)에 복사해 사용. 절대 경로 보정 필수.
- subagent / custom agent 호출 시 위험한 외부 작업(예: 데이터베이스 마이그레이션, 프로덕션 배포, 시크릿 회전)은 사용자 명시적 승인을 먼저 받는다.
- 기존 코드베이스 분석 결과를 반영한 초안이다. 추정 명령과 문서 경로는 실제 저장소 기준으로 수정할 수 있다.
