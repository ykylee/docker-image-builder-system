<!-- standard-ai-workflow-kit: v0.15.19-beta -->

---
name: standard-ai-workflow
description: Standard AI Workflow 진입 skill — 세션 시작, 백로그 갱신, 문서 동기화 절차를 한국어 baseline 으로 안내. Grok Build TUI picker 에서 `/standard-ai-workflow` 로 호출.
---

# Standard AI Workflow Skill (Grok Build)

- **역할**: Grok Build TUI picker 에서 호출되는 workflow 진입 skill. 세션 시작 / 백로그 갱신 / 문서 동기화 절차를 한 번에 안내.
- **위치**: `.grok/skills/standard-ai-workflow/SKILL.md`
- **호출**: TUI 에서 `/` 입력 후 `standard-ai-workflow` 검색 → Enter
- 대상 독자: Grok Build, 저장소 관리자
- 최종 수정일: 2026-07-20

## 1. 언제 이 skill 을 쓰는가

- 새 세션을 시작하면서 workflow baseline (`state.json` + `session_handoff.md` + `work_backlog.md`) 을 복원할 때
- 오늘 날짜 backlog 에 새 task 를 등록하거나 기존 task 상태를 갱신할 때
- 코드 / 문서 변경 후 영향 문서 동기화 (advisory) 가 필요할 때

## 2. 사전 확인

- 프로젝트 루트에 `AGENTS.md` 와 `GROK.md` 가 모두 존재
- `ai-workflow/memory/active/` 디렉터리에 `state.json`, `session_handoff.md`, `work_backlog.md` 가 존재
- `docs/PROJECT_PROFILE.md` 가 실제 저장소 기준으로 채워져 있음

## 3. 실행 절차

### 3.1 세션 시작 (baseline 복원)

```bash
# workflow state docs 우선 read
cat ai-workflow/memory/active/state.json
cat ai-workflow/memory/active/session_handoff.md
cat ai-workflow/memory/active/work_backlog.md
ls ai-workflow/memory/active/backlog/
cat docs/PROJECT_PROFILE.md
cat ai-workflow/wiki/index.md   # R4 anchor 기반
```

세션 시작 시 *반드시* 위 5개 문서를 read 후 작업 개시. 사용자에게 한국어 baseline + 다음 작업 후보 + 권장 다음 행동 보고.

### 3.2 백로그 갱신

```bash
# 오늘 날짜 backlog 파일에 task 추가/갱신
cat > ai-workflow/memory/active/backlog/2026-07-20.md <<EOF
# Backlog Index — 2026-07-20

- 문서 목적: ...
- 범위: ...
- 대상 독자: ...
- 상태: ...
- 최종 수정일: 2026-07-20

## Tasks

- **TASK-2026-07-20-001** [...] ... — ...
  - path: backlog/tasks/TASK-2026-07-20-001.md
EOF
```

### 3.3 문서 동기화 (advisory)

코드 / 문서 변경 후 영향 문서 자동 식별:

```bash
python3 ai-workflow/mcp_servers/check-doc-links/check_doc_links.py
python3 ai-workflow/mcp_servers/check-doc-metadata/check_doc_metadata.py
python3 ai-workflow/mcp_servers/suggest-impacted-docs/suggest_impacted_docs.py
```

(단, 본 skill 은 *advisory* — 자동 수정 안 함. 결과를 사용자가 검토 후 수동 반영.)

## 4. 세션 종료 절차

`global_workflow_standard.md` §8 정합 — `memory 갱신 → commit → push` 순서.

```bash
# 1. memory 갱신
python3 workflow-source/scripts/generate_workflow_state.py \
  --project-profile-path docs/PROJECT_PROFILE.md \
  --session-handoff-path ai-workflow/memory/session_handoff.md \
  --work-backlog-index-path ai-workflow/memory/work_backlog.md \
  --output-path ai-workflow/memory/state.json

# 2. commit
git add -A
git commit -m "..."

# 3. push
git push
```

## 5. 다음에 읽을 문서

- 진입점: `GROK.md` (root)
- 공통 진입점: `AGENTS.md` (root)
- 표준 문서: `ai-workflow/core/global_workflow_standard.md`
- 적용 가이드: `workflow-source/harnesses/grok-build/apply_guide.md`
