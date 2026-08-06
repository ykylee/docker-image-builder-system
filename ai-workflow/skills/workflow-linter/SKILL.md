# Skill: workflow-linter

- 문서 목적: 워크플로우 핵심 문서(`state.json`, `handoff`, `backlog`) 간의 데이터 정합성을 검사하는 스킬을 설명한다.
- 범위: 입력 및 출력 계약, 검사항목, 정합성 유지 규칙
- 대상 독자: AI 에이전트, 워크플로우 운영자
- 상태: stable (v0.11.20 stable 승격)
- 최종 수정일: 2026-07-01
- 관련 문서: `ai-workflow/memory/active/state.json`, `ai-workflow/memory/active/sessions`

## 1. 개요

에이전트가 여러 세션을 거치며 문서를 갱신하다 보면 섹션 누락, 상태 불일치, 링크 오류 등이 발생할 수 있다. 이 스킬은 자동화된 검사를 통해 컨텍스트의 오염을 방지한다.

## 2. 입력 및 출력

### 입력 (Inputs)
- `project-root`: 프로젝트 루트 경로 (기본값: `.`)
- `state-json-path`: `state.json` 파일 경로 (선택)
- `handoff-path`: `session_handoff.md` 파일 경로 (선택)
- `latest-backlog-path`: 최신 백로그 파일 경로 (선택)
- `json`: 표준 JSON 형식 출력 여부 (선택)

### 출력 (Outputs - JSON 모드 시)
- `status`: "ok" 또는 "issues_found"
- `issues`: 발견된 문제 목록 (type, code, description, severity, fix_suggestion)
- `summary`: 검사 결과 요약 (total_issues, sync_errors, broken_links 등)
- `warnings`: 파싱 중 발생한 경고

## 3. 주요 검사 항목

1. **상태 동기화 (`task_status_mismatch`)**: `backlog`의 `in_progress` 작업이 `handoff`와 `state.json`에도 동일하게 반영되어 있는가?
2. **링크 유효성 (`file_not_found`)**: 문서 내에서 참조하는 상대 경로가 실제로 존재하는가?
3. **로테이션 체크 (`handoff_bloat`)**: `handoff`의 완료 목록이 너무 길지 않은가? (10개 초과 시 경고)

## 4. 예시 실행 (v0.11.20 stable 정합)

```bash
# 기본 실행 (텍스트 리포트)
python3 skills/workflow-linter/scripts/run_workflow_linter.py

# JSON 출력 (오케스트레이터용)
python3 skills/workflow-linter/scripts/run_workflow_linter.py --json

# 특정 경로 지정
python3 skills/workflow-linter/scripts/run_workflow_linter.py \
  --project-profile-path docs/PROJECT_PROFILE.md \
  --state-json-path ai-workflow/memory/active/state.json \
  --handoff-path ai-workflow/memory/active/sessions

# maturity matrix + auto-fix (--apply)
python3 skills/workflow-linter/scripts/run_workflow_linter.py --maturity --apply
```


## v0.6.5 Stage Completion

본 skill 의 출력은 v0.6.5 부터 v0.6.4 의 [Stage Gate Pattern](../../../core/stage_gate_pattern.md) 의 `stage_completion` 필드를 포함한다.

| Field | 값 |
|---|---|
| `stage_name` | `workflow-linter` |
| `next_stage` | `(workflow end)` |
| `approval_actor` | `user` mandatory (state 문서 영향) |
| `approval_timestamp` | ISO 8601 |

자세한 spec: [`core/stage_gate_pattern.md`](../../../core/stage_gate_pattern.md), [`core/output_schema_guide.md §3.4`](../../../core/output_schema_guide.md).
