<!-- standard-ai-workflow-kit: v1.0.0-beta -->

# Output Schema Guide

- 문서 목적: 현재 저장소의 skill, runner, 우선순위 1 MCP 프로토타입 JSON 출력 계약을 공통 규칙으로 정리한다.
- 범위: 공통 출력 원칙, skill 공통 필드, MCP 공통 필드, 개별 도구별 필수/선택 필드, 경고/실패 출력 규칙
- 대상 독자: AI workflow 설계자, skill/MCP 구현자, 운영자, 테스트 작성자
- 상태: draft
- 최종 수정일: 2026-07-21
- 관련 문서: `./workflow_kit_roadmap.md`, `./workflow_skill_catalog.md`, `./workflow_mcp_candidate_catalog.md`, `../skills/README.md`, `../mcp_servers/README.md`, `../workflow_kit/contract_v1/__init__.py`, `../workflow_kit/common/contracts/`, `../workflow_kit/common/schemas/`

## 1. 목적

이 문서는 현재 저장소에 있는 실행형 프로토타입의 JSON 출력을 공통 규칙으로 설명하기 위한 가이드다.

현재 단계에서는 정식 schema 파일보다 아래 목표가 더 중요하다.

- 같은 성격의 출력 필드를 일관된 이름으로 유지
- 경고와 실패를 구조화해서 사람이 재검토하기 쉽게 만들기
- 개별 프로토타입 출력을 이후 통합 runner 나 MCP server 로 승격하기 쉽게 만들기

현재 저장소에는 위 목표를 보조하기 위한 정적 계약 초안 [../schemas/output_sample_contracts.json](../schemas/output_sample_contracts.json) 과 generated JSON Schema 묶음 [../schemas/generated_output_schemas.json](../schemas/generated_output_schemas.json) 이 포함된다.
정적 계약 파일은 문서와 smoke test 가 공유하는 기준선이고, generated schema 는 런타임 계약에서 재생성되는 기계 검증용 draft 로 사용한다.
주요 error payload 의 `source_context` 는 정적 계약의 `error_field_shapes` 와 런타임 계약에서 success shape 와 분리해 관리한다.
read-only bundle entrypoint 자체 오류는 개별 tool family 가 아니라 `read_only_entrypoint` family 로 분리해 검증한다.

## 2. 공통 원칙

- 모든 프로토타입은 JSON 객체를 출력한다.
- 사람이 읽을 수 있는 텍스트와 후속 자동화가 읽을 수 있는 구조를 함께 고려한다.
- 문서 자동 확정이 위험한 경우, 성공 결과보다 경고와 초안을 우선 출력한다.
- 실패 가능한 상황이라도 가능한 한 부분 결과를 남기는 방향을 권장한다.
- 경고는 숨기지 말고 `warnings` 필드로 구조화한다.

## 3. 공통 필드 규칙

### 3.1 전역 공통 필드

가능하면 아래 필드를 공통으로 사용한다.

| 필드 | 의미 | 타입 |
| --- | --- | --- |
| `status` | 성공/부분성공/실패 상태 (`ok`, `warning`, `error`) | `str` |
| `tool_version` | 현재 프로토타입 또는 패키지 버전 식별자 | `str` |
| `warnings` | 부분 실패, 불확실성, 수동 확인 필요 항목 | `list[str]` |
| `source_context` | 입력 경로 또는 입력 요약 | `object` |
| `confidence_notes` | 보수적 추정, 추천 강도, 불확실성 설명 | `list[str]` |

권장 규칙:

- 정상 종료 시에는 `status: "ok"` 를 기본값으로 사용한다.
- 경고가 있어도 결과를 신뢰 가능한 구조로 남길 수 있으면 `status: "ok"` 를 유지하고, 메시지는 `warnings` 에 넣는다.
- 부분 결과만 남기고 재검토가 강하게 필요한 경우 `status: "warning"` 을 사용할 수 있다.
- 실패 시에는 `status: "error"` 와 `error`, `error_code` 를 함께 사용한다.
- 현재 저장소의 실행형 프로토타입은 정상 출력에 `workflow_kit.__version__` 값을 공통 `tool_version` 으로 사용한다.
- 대표 JSON 샘플과 smoke test 도 같은 `workflow_kit.__version__` 값을 기준으로 검증한다.
- `stale_warnings`, `stale_index_warnings` 같은 도메인 전용 경고 필드를 쓰더라도, 같은 메시지를 `warnings` 에도 함께 반영해 공통 파이프라인이 읽을 수 있게 한다.

추가 메모:

- 정적 계약 파일인 `schemas/output_sample_contracts.json` 은 `tool_version_source` 메타데이터로만 단일 출처를 표시한다.
- 실제 샘플 JSON 의 `tool_version` 값 일치 검증은 `tests/check_output_samples.py` 가 런타임 `workflow_kit.__version__` 과 직접 비교해 수행한다.

### 3.2 skill 출력 공통 필드

skill 류 프로토타입은 아래 성격의 필드를 우선 사용한다.

| 필드 | 의미 |
| --- | --- |
| `summary` | 현재 상태 요약 또는 결과 요약 |
| `recommended_next_action` | 다음 행동 한 줄 제안 |
| `recommended_review_order` | 검토 문서/단계 순서 |
| `fields_requiring_confirmation` | 사람이 직접 확인해야 하는 값 |
| `validation_notes` 또는 `validation_follow_up` | 검증 결과 또는 검증 필요 메모 |
| `reasoning_notes` | 추천 또는 분류 근거 |

### 3.3 MCP 출력 공통 필드

MCP 류 프로토타입은 아래 성격의 필드를 우선 사용한다.

| 필드 | 의미 |
| --- | --- |
| `checked_files` | 검사 대상 파일 목록 |
| `candidates` | 후보 경로 또는 선택 후보 목록 |
| `draft_entry` | 생성 초안 |
| `reasoning_notes` | 추천 또는 판단 근거 |

### 3.4 stage_completion 공통 필드 (v0.6.4 신규, v0.7.0 부터 required)

skill/MCP output 의 stage 끝에 사용자 explicit approval 을 받기 위한 공통 필드. AIDLC 의 2-option completion message 패턴을 차용한 우리 표준. 자세한 형식/적용/예외는 [`./stage_gate_pattern.md`](./stage_gate_pattern.md) 참조.

| 필드 | 의미 | 타입 |
| --- | --- | --- |
| `stage_name` | stage 식별자 (예: `code-generation`, `requirements-analysis`) | `str` |
| `stage_status` | stage 자체의 실행 결과 (`ok`, `warning`, `error`) | `Literal` |
| `next_stage` | 다음 stage 이름. workflow 끝이면 `None` | `str \| None` |
| `requested_changes` | 사용자가 요청한 변경 사항 free text list | `list[str]` |
| `approval_timestamp` | 사용자 승인 시각 (ISO 8601). 미승인이면 `None` | `str \| None` |
| `approval_actor` | 승인 주체 (`user`, `orchestrator`, `auto`) | `str \| None` |
| `artifacts` | 검토 대상 artifact path list | `list[str]` |
| `notes` | AI 가 사용자에게 보여주는 1-3 line 요약 | `list[str]` |

권장 규칙:

- **v0.7.0 부터 required**: 모든 skill/MCP output 은 `stage_completion` 필드를 *반드시* 포함해야 한다 (11종 skill + 8+ MCP). 12/12 일관성 달성 후 격상. `stage_gate_runtime.ensure_stage_completion()` 으로 lazy fallback 보장.
- `requested_changes` 가 비어있고 `approval_timestamp` 가 None 이면 stage gate 미통과. 자동 다음 stage 진행 ❌.
- `approval_actor: "auto"` 는 CI/CD timeout / cron / P0 hotfix 에서만 허용. production 코드 변경 / state 문서 갱신 / release 는 user approval mandatory.
- audit log (`ai-workflow/memory/active/audit.md`) 에 append-only 기록 필수. ISO 8601 timestamp, raw user input, stage context.

마이그레이션 가이드 (v0.6.5 → v0.7.0):

1. **runtime layer**: 모든 skill 의 `run_*.py` success path + error path 에 `stage_completion` 자동 merge. v0.6.5 batch + pilot + follow-up 으로 12/12 적용 완료. v0.7.0 부터 mandatory.
2. **sample output**: `workflow-source/examples/output_samples/*.json` 의 legacy sample (stage_completion 없는) 들은 v0.7.0 에서 자동 migration (별도 follow-up). 그 전까지는 legacy 호환.
3. **MCP server** (8+): read_only bundle 의 stage_completion 적용은 v0.7.1+ 후보. 본 commit 범위 외.

Pydantic v2 schema (참고):

```python
from pydantic import BaseModel, Field
from typing import Literal

class StageCompletion(BaseModel):
    """v0.6.4 신규. skill/MCP output 의 stage completion 승인 필드."""
    stage_name: str = Field(..., description="stage 식별자")
    stage_status: Literal["ok", "warning", "error"]
    next_stage: str | None = Field(None, description="다음 stage 이름. workflow 끝이면 None")
    requested_changes: list[str] = Field(default_factory=list, description="user 요청 변경")
    approval_timestamp: str | None = Field(None, description="ISO 8601. 미승인이면 None")
    approval_actor: Literal["user", "orchestrator", "auto"] | None = Field(None)
    artifacts: list[str] = Field(default_factory=list, description="검토 대상 artifact path")
    notes: list[str] = Field(default_factory=list, description="AI 1-3 line summary")
```

## 4. 경고와 실패 규칙

### 4.1 경고 출력 규칙

- 경고는 `warnings` 에 넣는다.
- 경고 메시지는 “무엇이 불확실한지”와 “왜 수동 확인이 필요한지”가 드러나야 한다.
- 가능하면 다음 행동을 암시하는 표현을 사용한다.

좋은 예:

- `최신 backlog 경로를 backlog index 에서 확인하지 못했다.`
- `검증 결과가 없으므로 done 상태는 초안에서 in_progress 로 낮춘다.`

### 4.2 실패 출력 규칙

현재 프로토타입은 일부가 예외 종료 방식이지만, 이후에는 아래 구조를 권장한다.

| 필드 | 의미 |
| --- | --- |
| `status` | 항상 `error` |
| `error` | 실패 요약 |
| `error_code` | 비교 가능한 실패 코드 |
| `warnings` | 실패에 이르기 전 확인된 문제 |
| `source_context` | 어떤 입력으로 실패했는지 |

권장 실패 예시:

```json
{
  "status": "error",
  "tool_version": "prototype-v2",
  "error": "project_profile_path 를 읽을 수 없다.",
  "error_code": "missing_project_profile",
  "warnings": [
    "문서 구조를 해석할 수 없어 후속 판단을 중단한다."
  ],
  "source_context": {
    "project_profile_path": "/abs/path/PROJECT_PROFILE.md"
  }
}
```

현재 반영 상태:

- `session-start` 프로토타입은 누락 입력 또는 런타임 오류 시 위 구조를 따르는 `error` JSON 을 출력한다.
- `validation-plan` 프로토타입은 누락 변경 입력, 누락 문서, 런타임 오류 시 위 구조를 따르는 `error` JSON 을 출력한다.
- `code-index-update` 프로토타입은 누락 변경 입력, 누락 문서, 런타임 오류 시 위 구조를 따르는 `error` JSON 을 출력한다.
- `backlog-update`, `doc-sync`, `merge-doc-reconcile` 프로토타입도 누락 문서 또는 런타임 오류 시 위 구조를 따르는 `error` JSON 을 출력한다.
- 나머지 skill/MCP 프로토타입은 같은 패턴으로 순차 확장 예정이며, 그 전까지는 일부 예외 종료가 남아 있을 수 있다.

## 5. Skill 출력 계약

### 5.1 `session-start`

현재 출력 필드:

| 필드 | 필수 | 타입 | 의미 |
| --- | --- | --- | --- |
| `status` | 예 | `str` | 현재 실행 결과 상태 |
| `tool_version` | 예 | `str` | 프로토타입 버전 식별자 |
| `summary` | 예 | `list[str]` | 현재 기준선 요약 |
| `in_progress_items` | 예 | `list[str]` | 진행 중 작업 목록 |
| `blocked_items` | 예 | `list[str]` | 차단 작업 목록 |
| `latest_backlog_path` | 예 | `str \| null` | 최신 backlog 경로 |
| `next_documents` | 예 | `list[str]` | 다음에 읽을 문서 |
| `recommended_next_action` | 예 | `str` | 세션 직후 행동 |
| `warnings` | 예 | `list[str]` | 불일치 및 누락 경고 |
| `validation_notes` | 예 | `list[str]` | 현재는 빈 리스트 가능 |
| `environment_constraints` | 예 | `list[str]` | 환경 제약 요약 |
| `source_documents` | 예 | `object` | 사용한 입력 문서 경로 |

대표 샘플:

- [../examples/output_samples/session_start.acme_delivery_platform.json](../examples/output_samples/session_start.acme_delivery_platform.json)
- [../examples/output_samples/session_start.error.missing_document.json](../examples/output_samples/session_start.error.missing_document.json)

### 5.2 `backlog-update`

현재 출력 필드:

| 필드 | 필수 | 타입 | 의미 |
| --- | --- | --- | --- |
| `status` | 예 | `str` | 현재 실행 결과 상태 |
| `tool_version` | 예 | `str` | 프로토타입 버전 식별자 |
| `operation_type` | 예 | `str` | `create_entry`, `update_entry`, `create_daily_backlog`, `cannot_determine` |
| `target_backlog_path` | 예 | `str` | 대상 backlog 경로 |
| `task_id` | 예 | `str` | 작업 ID |
| `task_found` | 예 | `bool` | 기존 항목 발견 여부 |
| `draft_entry` | 예 | `list[str]` | backlog 항목 초안 |
| `status_recommendation` | 예 | `object` | 상태 제안과 이유 |
| `fields_requiring_confirmation` | 예 | `list[str]` | 직접 확인 필드 |
| `warnings` | 예 | `list[str]` | 상태 확정 위험 및 경로 경고 |
| `index_update_note` | 아니오 | `str \| null` | index 후속 메모 |
| `handoff_update_note` | 아니오 | `str \| null` | handoff 후속 메모 |
| `validation_note` | 아니오 | `str \| null` | 검증 메모 |
| `source_context` | 예 | `object` | 입력 경로와 탐색 상태 |

대표 샘플:

- [../examples/output_samples/backlog_update.acme_delivery_platform.json](../examples/output_samples/backlog_update.acme_delivery_platform.json)
- [../examples/output_samples/backlog_update.error.missing_document.json](../examples/output_samples/backlog_update.error.missing_document.json)

### 5.3 `doc-sync`

현재 출력 필드:

| 필드 | 필수 | 타입 | 의미 |
| --- | --- | --- | --- |
| `status` | 예 | `str` | 현재 실행 결과 상태 |
| `tool_version` | 예 | `str` | 프로토타입 버전 식별자 |
| `impacted_documents` | 예 | `list[str]` | 영향 문서 후보 |
| `hub_update_candidates` | 예 | `list[str]` | 허브/인덱스 후보 |
| `status_doc_candidates` | 예 | `list[str]` | 상태 문서 후보 |
| `validation_doc_candidates` | 예 | `list[str]` | 결과 기록 후보 |
| `stale_warnings` | 예 | `list[str]` | stale 가능성 경고 |
| `reasoning_notes` | 예 | `list[str]` | 추천 근거 |
| `recommended_review_order` | 예 | `list[str]` | 검토 순서 |
| `follow_up_actions` | 예 | `list[str]` | 후속 행동 |
| `confidence_notes` | 예 | `list[str]` | 추천 강도 또는 불확실성 |
| `source_context` | 예 | `object` | 변경 파일과 입력 요약 |

대표 샘플:

- [../examples/output_samples/doc_sync.acme_delivery_platform.json](../examples/output_samples/doc_sync.acme_delivery_platform.json)
- [../examples/output_samples/doc_sync.error.missing_change_input.json](../examples/output_samples/doc_sync.error.missing_change_input.json)

### 5.4 `merge-doc-reconcile`

현재 출력 필드:

| 필드 | 필수 | 타입 | 의미 |
| --- | --- | --- | --- |
| `status` | 예 | `str` | 현재 실행 결과 상태 |
| `tool_version` | 예 | `str` | 프로토타입 버전 식별자 |
| `reconcile_targets` | 예 | `list[str]` | 재확인 대상 문서 |
| `state_conflicts` | 예 | `list[str]` | 상태 충돌 목록 |
| `reconfirmation_points` | 예 | `list[str]` | 재확정 포인트 |
| `draft_reconcile_notes` | 예 | `list[str]` | 재정리 메모 초안 |
| `recommended_review_order` | 예 | `list[str]` | 검토 순서 |
| `warnings` | 예 | `list[str]` | 병합 후 검증/경로 경고 |
| `handoff_update_note` | 아니오 | `str \| null` | handoff 후속 메모 |
| `backlog_update_note` | 아니오 | `str \| null` | backlog/index 후속 메모 |
| `hub_update_note` | 아니오 | `str \| null` | 허브 후속 메모 |
| `validation_follow_up` | 예 | `str` | 병합 후 검증 메모 |
| `source_context` | 예 | `object` | 병합 요약과 변경 파일 |

대표 샘플:

- [../examples/output_samples/merge_doc_reconcile.acme_delivery_platform.json](../examples/output_samples/merge_doc_reconcile.acme_delivery_platform.json)
- [../examples/output_samples/merge_doc_reconcile.error.missing_document.json](../examples/output_samples/merge_doc_reconcile.error.missing_document.json)

### 5.5 `validation-plan`

현재 출력 필드:

| 필드 | 필수 | 타입 | 의미 |
| --- | --- | --- | --- |
| `status` | 예 | `str` | 현재 실행 결과 상태 |
| `tool_version` | 예 | `str` | 프로토타입 버전 식별자 |
| `detected_change_types` | 예 | `list[str]` | 감지된 변경 유형 |
| `recommended_validation_levels` | 예 | `list[str]` | 권장 검증 수준 |
| `recommended_commands` | 예 | `list[object]` | 바로 실행 가능한 검증 명령과 이유 |
| `commands_requiring_confirmation` | 예 | `list[object]` | 환경/권한 확인 후 실행할 명령 |
| `documentation_checks` | 예 | `list[str]` | 문서화/운영 체크 항목 |
| `evidence_expectations` | 예 | `list[str]` | 남겨야 할 증빙 또는 기록 형태 |
| `deferred_validation_items` | 예 | `list[object]` | 미실행 항목과 권장 기록 위치 |
| `warnings` | 예 | `list[str]` | 환경 제약, 승인 제약, 보수적 경고 |
| `confidence_notes` | 예 | `list[str]` | 추천 강도 및 해석 근거 |
| `source_context` | 예 | `object` | 프로젝트 프로파일과 변경 입력 요약 |

대표 샘플:

- [../examples/output_samples/validation_plan.acme_delivery_platform.json](../examples/output_samples/validation_plan.acme_delivery_platform.json)
- [../examples/output_samples/validation_plan.docs_primary.acme_delivery_platform.json](../examples/output_samples/validation_plan.docs_primary.acme_delivery_platform.json)
- [../examples/output_samples/validation_plan.error.missing_change_input.json](../examples/output_samples/validation_plan.error.missing_change_input.json)

추가 메모:

- docs-primary 변경에서도 프로젝트 프로파일의 빠른 테스트 명령이 있으면 `recommended_commands` 에 기본 회귀 확인용으로 포함할 수 있다.

### 5.6 `code-index-update`

현재 출력 필드:

| 필드 | 필수 | 타입 | 의미 |
| --- | --- | --- | --- |
| `status` | 예 | `str` | 현재 실행 결과 상태 |
| `tool_version` | 예 | `str` | 프로토타입 버전 식별자 |
| `index_update_candidates` | 예 | `list[str]` | 재확인할 색인/허브 문서 후보 |
| `priority_index_candidates` | 예 | `list[str]` | 우선순위가 높은 색인 후보 |
| `stale_index_warnings` | 예 | `list[str]` | 색인 stale 가능성 경고 |
| `reasoning_notes` | 예 | `list[str]` | 분류 및 추천 근거 |
| `suggested_index_actions` | 예 | `list[str]` | 후속으로 취할 색인 관련 행동 |
| `document_structure_signals` | 예 | `list[str]` | 문서 구조 변화 신호 |
| `missing_index_candidates` | 예 | `list[str]` | 프로파일 기준으로 추정했지만 현재 확인되지 않은 색인 경로 |
| `confidence_notes` | 예 | `list[str]` | 추천 강도 및 한계 |
| `source_context` | 예 | `object` | 프로젝트 프로파일과 변경 입력 요약 |

대표 샘플:

- [../examples/output_samples/code_index_update.research_eval_hub.json](../examples/output_samples/code_index_update.research_eval_hub.json)
- [../examples/output_samples/code_index_update.error.missing_change_input.json](../examples/output_samples/code_index_update.error.missing_change_input.json)

## 6. Runner 출력 계약

통합 runner 출력은 개별 skill/MCP 단계 결과를 그대로 중첩하면서, 오케스트레이터 관점의 상위 메타데이터를 추가하는 방식을 권장한다.

runner 공통 필드:

| 필드 | 의미 |
| --- | --- |
| `status` | runner 실행 결과 상태 |
| `tool_version` | 현재 runner 버전 식별자 |
| `warnings` | 하위 단계에서 집계한 상위 경고 목록 |
| `orchestration_plan` | 메인 오케스트레이터와 worker 분배 메타데이터 |
| `source_context` | runner 입력 경로와 step 실패 시점 추적 정보 |

runner 실패 규칙:

- 하위 skill/MCP step 이 `status: "error"` 를 반환하거나 비정상 종료하면 runner 도 `status: "error"` 로 감싼다.
- 이때 runner 의 `error_code` 는 상위 분류용 코드로 유지하고, 실제 실패 step 이름과 upstream `error_code` 는 `source_context.failed_step`, `source_context.upstream_error_code` 로 남긴다.
- 자식 step 이 이미 `warnings` 를 반환했다면 runner 실패 출력에서도 그대로 승계한다.

샘플/계약 검증 권장 규칙:

- `examples/output_samples/*.json` 은 단순 예시가 아니라 smoke test 기준선으로도 사용한다.
- 대표 skill/runner 샘플은 최소 핵심 필드 계약을 검사하는 smoke test 와 함께 유지한다.
- 샘플의 `tool_version` 은 문서 문자열이 아니라 실제 `workflow_kit.__version__` 값과 같아야 한다.
- 정적 계약 초안이 필요할 때는 [../schemas/output_sample_contracts.json](../schemas/output_sample_contracts.json) 을 갱신한다.
- runtime contract 변경 뒤에는 [../schemas/generated_output_schemas.json](../schemas/generated_output_schemas.json) 도 함께 재생성 상태인지 확인한다.

### 6.1 `run_demo_workflow.py`

현재 출력 필드:

| 필드 | 필수 | 타입 | 의미 |
| --- | --- | --- | --- |
| `status` | 예 | `str` | 현재 실행 결과 상태 |
| `tool_version` | 예 | `str` | 프로토타입 버전 식별자 |
| `warnings` | 예 | `list[str]` | 하위 단계에서 집계한 상위 경고 |
| `example_project` | 예 | `str` | 사용한 예시 프로젝트 이름 |
| `project_profile_path` | 예 | `str` | 기준 프로젝트 프로파일 경로 |
| `orchestration_plan` | 예 | `object` | 권장 worker 분배와 모델 분할 |
| `latest_backlog` | 예 | `object` | latest backlog 단계 결과 |
| `session_start` | 예 | `object` | session-start 단계 결과 |
| `backlog_update` | 예 | `object` | backlog-update 단계 결과 |
| `doc_sync` | 예 | `object` | doc-sync 단계 결과 |
| `validation_plan` | 예 | `object` | validation-plan 단계 결과 |
| `code_index_update` | 예 | `object` | code-index-update 단계 결과 |
| `suggest_impacted_docs` | 예 | `object` | suggest-impacted-docs 단계 결과 |
| `merge_doc_reconcile` | 예 | `object` | merge-doc-reconcile 단계 결과 |
| `workflow_summary` | 예 | `object` | 상위 요약 필드 묶음 |
| `source_context` | 예 | `object` | runner 입력 요약과 재현용 인자 묶음 |

대표 샘플:

- [../examples/output_samples/demo_workflow.acme_delivery_platform.json](../examples/output_samples/demo_workflow.acme_delivery_platform.json)
- [../examples/output_samples/demo_workflow.error.missing_document.json](../examples/output_samples/demo_workflow.error.missing_document.json)

### 6.2 `run_existing_project_onboarding.py`

현재 출력 필드:

| 필드 | 필수 | 타입 | 의미 |
| --- | --- | --- | --- |
| `status` | 예 | `str` | 현재 실행 결과 상태 |
| `tool_version` | 예 | `str` | 프로토타입 버전 식별자 |
| `warnings` | 예 | `list[str]` | 하위 단계에서 집계한 상위 경고 |
| `onboarding_mode` | 예 | `str` | 현재 온보딩 흐름 식별자 |
| `orchestration_plan` | 예 | `object` | 온보딩 초기 worker 분배와 모델 분할 |
| `repository_assessment` | 예 | `object` | assessment 경로와 요약 |
| `latest_backlog` | 예 | `object` | latest backlog 단계 결과 |
| `session_start` | 예 | `object` | session-start 단계 결과 |
| `validation_plan` | 예 | `object` | validation-plan 단계 결과 |
| `code_index_update` | 예 | `object` | code-index-update 단계 결과 |
| `onboarding_summary` | 예 | `object` | 상위 후속 작업 요약 |
| `source_context` | 예 | `object` | runner 입력 경로와 변경 입력 요약 |

대표 샘플:

- [../examples/output_samples/existing_project_onboarding.acme_delivery_platform.json](../examples/output_samples/existing_project_onboarding.acme_delivery_platform.json)
- [../examples/output_samples/existing_project_onboarding.error.missing_document.json](../examples/output_samples/existing_project_onboarding.error.missing_document.json)

## 7. MCP 출력 계약

### 7.1 `latest_backlog`

| 필드 | 필수 | 타입 | 의미 |
| --- | --- | --- | --- |
| `status` | 예 | `str` | 현재 실행 결과 상태 |
| `tool_version` | 예 | `str` | 프로토타입 버전 식별자 |
| `latest_backlog_path` | 예 | `str \| null` | 최신 backlog 경로 |
| `candidates` | 예 | `list[str]` | backlog 후보 목록 |
| `warnings` | 예 | `list[str]` | 탐색 경고 |

대표 샘플:

- [../examples/output_samples/latest_backlog.acme_delivery_platform.json](../examples/output_samples/latest_backlog.acme_delivery_platform.json)

### 7.2 `check_doc_metadata`

| 필드 | 필수 | 타입 | 의미 |
| --- | --- | --- | --- |
| `status` | 예 | `str` | 현재 실행 결과 상태 |
| `tool_version` | 예 | `str` | 프로토타입 버전 식별자 |
| `checked_files` | 예 | `list[str]` | 검사 대상 파일 |
| `missing_metadata` | 예 | `list[object]` | 누락 파일과 필드 |
| `warnings` | 예 | `list[str]` | 추가 경고 |

대표 샘플:

- [../examples/output_samples/check_doc_metadata.examples.json](../examples/output_samples/check_doc_metadata.examples.json)

### 7.3 `check_doc_links`

| 필드 | 필수 | 타입 | 의미 |
| --- | --- | --- | --- |
| `status` | 예 | `str` | 현재 실행 결과 상태 |
| `tool_version` | 예 | `str` | 프로토타입 버전 식별자 |
| `checked_files` | 예 | `list[str]` | 검사 대상 파일 |
| `broken_links` | 예 | `list[object]` | 깨진 링크 목록 |
| `warnings` | 예 | `list[str]` | 추가 경고 |

대표 샘플:

- [../examples/output_samples/check_doc_links.examples.json](../examples/output_samples/check_doc_links.examples.json)

### 7.4 `create_backlog_entry`

| 필드 | 필수 | 타입 | 의미 |
| --- | --- | --- | --- |
| `status` | 예 | `str` | 현재 실행 결과 상태 |
| `tool_version` | 예 | `str` | 프로토타입 버전 식별자 |
| `draft_entry` | 예 | `list[str]` | backlog 항목 초안 |
| `warnings` | 예 | `list[str]` | 생성 경고 |

대표 샘플:

- [../examples/output_samples/create_backlog_entry.sample.json](../examples/output_samples/create_backlog_entry.sample.json)

### 7.5 `suggest_impacted_docs`

| 필드 | 필수 | 타입 | 의미 |
| --- | --- | --- | --- |
| `status` | 예 | `str` | 현재 실행 결과 상태 |
| `tool_version` | 예 | `str` | 프로토타입 버전 식별자 |
| `impacted_documents` | 예 | `list[str]` | 영향 문서 후보 |
| `reasoning_notes` | 예 | `list[str]` | 추천 근거 |
| `warnings` | 예 | `list[str]` | 입력 부족 또는 경고 |

대표 샘플:

- [../examples/output_samples/suggest_impacted_docs.sample.json](../examples/output_samples/suggest_impacted_docs.sample.json)

### 7.6 `check_quickstart_stale_links`

| 필드 | 필수 | 타입 | 의미 |
| --- | --- | --- | --- |
| `status` | 예 | `str` | 현재 실행 결과 상태 |
| `tool_version` | 예 | `str` | 프로토타입 버전 식별자 |
| `checked_files` | 예 | `list[str]` | 점검한 quickstart 문서 |
| `broken_links` | 예 | `list[object]` | 깨진 상대 링크 목록 |
| `missing_expected_links` | 예 | `list[object]` | 빠진 핵심 진입 문서 링크 |
| `stale_link_warnings` | 예 | `list[str]` | quickstart stale 가능성 경고 |
| `reasoning_notes` | 예 | `list[str]` | 점검 근거 |
| `warnings` | 예 | `list[str]` | 추가 경고 |

대표 샘플:

- [../examples/output_samples/check_quickstart_stale_links.sample.json](../examples/output_samples/check_quickstart_stale_links.sample.json)

## 8. 다음 정리 권고

현재 가이드를 바탕으로 다음 작업을 권장한다.

1. nested object 와 enum 제약이 아직 느슨한 family 를 중심으로 output contract 를 계속 세분화
2. generated schema 를 MCP manifest 나 외부 소비 지점과 어떻게 연결할지 정리
3. `schemas/output_sample_contracts.json`, `schemas/generated_output_schemas.json`, `workflow_kit.common.output_contracts` 가 같은 기준을 보도록 함께 유지

## 9. Contract v1 Output Envelope (v0.5.6+)

v0.5.6 부터 orchestrator ↔ sub-agent delegation 에 contract v1 enforcement 가 적용되었다. contract v1 출력 envelope 는 아래 공통 필드를 포함한다.

| 필드 | 의미 | 타입 |
| --- | --- | --- |
| `status` | 성공/실패 상태 (`ok`, `error`) | `str` |
| `error` | 실패 요약 (실패 시) | `str \| null` |
| `error_code` | 비교 가능한 실패 코드 | `str \| null` |
| `warnings` | 실행 중 발생한 경고 | `list[str]` |
| `source_context` | 입력 출처 및 위임 경로 | `object` |
| `tool_version` | 도구 버전 식별자 | `str` |

contract v1 enforcement 는 `workflow_kit/contract_v1/` 아래 `output_validator`, `delegator.choose_role`, `delegator.choose_roles` (v0.5.7 multi-component fan-out) 로 제공된다.

### 9.1 Canonical Schema Generation Paths

contract v1 에서 사용하는 스키마는 아래 경로에서 Pydantic v2 기반으로 관리된다.

- **Contract enforcement**: `workflow-source/workflow_kit/contract_v1/`
- **Common contracts**: `workflow-source/workflow_kit/common/contracts/` (`base.py`, `errors.py`, `high_value.py`, `read_only.py`)
- **Common schemas**: `workflow-source/workflow_kit/common/schemas/` (`base.py`, `session.py`, `backlog.py`, `orchestration.py`, `worker.py`, `validation.py`, `index.py`, `reconcile.py`, `doc_sync.py`, `linter.py`, `read_only.py`, `git.py`)

### 9.2 Multi-component Fan-out (v0.5.7+)

`choose_roles` 를 통한 다중 sub-agent 위임 시, 각 sub-agent 로부터 반환된 contract v1 응답은 `validate_fanin_output` 으로 통합 검증된다. 통합 시 각 sub-agent 의 `delegation_id` 는 `{parent_id}-st-{N}` 형식의 parent-prefix rule 을 따른다 (v0.5.10).

## 다음에 읽을 문서

- 상위 로드맵: [./workflow_kit_roadmap.md](./workflow_kit_roadmap.md)
- skill 허브: [../skills/README.md](../skills/README.md)
- mcp 허브: [../mcp_servers/README.md](../mcp_servers/README.md)
- 출력 샘플 허브: [../examples/output_samples/README.md](../examples/output_samples/README.md)
