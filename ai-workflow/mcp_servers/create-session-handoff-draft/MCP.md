# Create-Session-Handoff-Draft MCP

- 문서 목적: `create_session_handoff_draft` MCP 프로토타입의 역할과 구현 진입점을 정리한다.
- 범위: 목적, 연결 카탈로그, 예상 입력/출력, 읽기/쓰기 성격, 구현 메모
- 대상 독자: MCP 구현자, AI agent 설계자, 운영자
- 상태: prototype
- 최종 수정일: 2026-06-09
- 관련 문서: `../../core/workflow_mcp_candidate_catalog.md`, `../../skills/session-start/SKILL.md`, `../git-history-summarizer/MCP.md`

## 1. 목적

최신 백로그와 Git 커밋 이력을 조합하여 `session_handoff.md` 의 초안을 자동 생성한다. `git-history-summarizer` MCP 와 연계하여 커밋 기반 작업 요약을 포함하며, 세션 종료 시점에 handoff 문서를 빠르게 준비할 수 있도록 보조한다.

`workflow_kit.common.read_only_bundle.create_session_handoff_draft_payload` 와 `workflow_kit.common.git.summarize_git_history` 기반으로 구현된 읽기 전용 프로토타입이다.

## 2. 연결 카탈로그

- 후보 카탈로그: [../../core/workflow_mcp_candidate_catalog.md](../../core/workflow_mcp_candidate_catalog.md)

## 3. 예상 입력

- `latest_backlog_path` (string, optional): 최신 백로그 파일 경로
- `git_range` (string, optional): 커밋 범위 (예: `HEAD~3..HEAD`)
- `repo_path` (string, optional): 대상 저장소 경로. 기본값: `.`

```json
{
  "latest_backlog_path": "ai-workflow/memory/active/backlog/2026-06-09.md",
  "git_range": "HEAD~3..HEAD",
  "repo_path": "."
}
```

## 4. 예상 출력

- `status`: `"ok"` | `"error"`
- `session_handoff_draft`: (string) 생성된 handoff 초안 (markdown)
- `git_summary`: (string | null) 커밋 기반 작업 요약 (`git_range` 지정 시)
- `tool_version`: workflow_kit 버전
- `warnings`: (list) 경고 메시지

```json
{
  "status": "ok",
  "session_handoff_draft": "# 세션 인계\n\n## 완료된 작업\n...",
  "git_summary": "## Git 요약 (HEAD~3..HEAD)\n- feat: ...",
  "tool_version": "0.5.10-beta",
  "warnings": []
}
```

## 5. 읽기/쓰기 성격

- 읽기 전용 (초안 생성만 수행, 파일 쓰기 없음)

## 6. 구현 메모

- `wrapped_payload` 함수가 `summarize_git_history` 호출 결과를 `create_session_handoff_draft_payload` 에 전달
- 실행 스크립트: `workflow-source/mcp_servers/create-session-handoff-draft/scripts/run_create_session_handoff_draft.py`
- `mcp_main` 을 통해 `tool_version` 이 출력 envelope 에 자동 주입됨

## 7. 현재 상태

- 실행 프로토타입 스크립트 있음
- `git-history-summarizer` 와 연계하여 동작

## 다음에 읽을 문서

- mcp 허브: [../README.md](../README.md)
