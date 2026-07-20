# standard-ai-workflow-kit: v0.15.19-beta

"""Stage Gate Runtime (v0.6.5) — runtime helper for skill output integration.

11종 skill 의 output dict 에 StageCompletion 을 자동 merge. 기존 smoke test
(schema 엄격 검증) 와 호환되도록 **optional field** 로 추가 — 있어도 PASS, 없어도 PASS.

핵심 기능:
- build_stage_completion() — stage_name, stage_status, artifacts, next_stage 으로부터
  StageCompletion 객체 생성. approval_* field 는 미승인 상태 (None) 으로 시작.
- merge_into_result() — 기존 skill result dict 에 stage_completion merge.
  기존 field 는 보존 (status, warnings, source_context, ...).
- emit_and_log() — 2-option completion message stdout emit + audit log append (optional).
  approval_recorded=True 시 audit log 에 approved entry.

v0.6.5 runtime migration 의 1차 인프라. 실제 11 skill 의 run_*.py 변경은
별도 commit 으로. 본 helper 가 spec (stage_gate_pattern.md §4, §6) 의
runtime enforcement 담당.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, cast

from workflow_kit.common.contracts.stage_gate import (
    ApprovalActor,
    StageCompletion,
    StageStatus,
    append_audit_log,
    emit_completion_message,
)


def build_stage_completion(
    stage_name: str,
    stage_status: StageStatus,
    artifacts: list[str] | None = None,
    next_stage: str | None = None,
    notes: list[str] | None = None,
    requested_changes: list[str] | None = None,
    approval_timestamp: str | None = None,
    approval_actor: ApprovalActor | None = None,
) -> dict[str, Any]:
    """StageCompletion dict 생성. dataclass 를 거치지 않고 직접 dict 반환.

    기존 run_*.py 가 result dict 를 직접 다루므로 dict 반환이 자연스러움.
    """
    sc = StageCompletion(
        stage_name=stage_name,
        stage_status=stage_status,
        artifacts=artifacts or [],
        next_stage=next_stage,
        notes=notes or [],
        requested_changes=requested_changes or [],
        approval_timestamp=approval_timestamp,
        approval_actor=approval_actor,
    )
    return _stage_completion_to_dict(sc)


def _stage_completion_to_dict(sc: StageCompletion) -> dict[str, Any]:
    """StageCompletion → dict (JSON serializable)."""
    return {
        "stage_name": sc.stage_name,
        "stage_status": sc.stage_status,
        "next_stage": sc.next_stage,
        "requested_changes": list(sc.requested_changes),
        "approval_timestamp": sc.approval_timestamp,
        "approval_actor": sc.approval_actor,
        "artifacts": list(sc.artifacts),
        "notes": list(sc.notes),
    }


def merge_into_result(
    result: dict[str, Any],
    stage_completion: dict[str, Any],
    *,
    overwrite: bool = False,
) -> dict[str, Any]:
    """기존 skill result dict 에 stage_completion merge.

    Args:
        result: 기존 skill output dict (status, warnings, source_context, ...)
        stage_completion: build_stage_completion() 의 dict 반환값
        overwrite: True 이면 기존 result['stage_completion'] 가 있어도 덮어씀.
                   False (default) 이면 기존 것이 우선 (idempotent).

    Returns:
        merged dict. 원본 result 는 변경 안 함 (copy 반환).

    Notes:
        - v0.7.0 부터 `stage_completion` 은 **required field** (12/12 일관성 달성).
          모든 skill/MCP output 에 반드시 포함되어야 함.
        - 기존 52 smoke test 와 호환: stage_completion 없는 legacy result 도
          이 함수를 통해 추가 가능 (idempotent).
        - `status`, `tool_version`, `warnings`, `source_context` 등 공통 field 는 보존
    """
    merged = dict(result)
    existing = merged.get("stage_completion")
    if existing and not overwrite:
        # 기존 것이 있으면 보존. 단 새 artifact 가 추가됐으면 merge (artifacts 합집합).
        if isinstance(existing, dict) and isinstance(stage_completion, dict):
            merged_artifacts = list(set(existing.get("artifacts", []) + stage_completion.get("artifacts", [])))
            stage_completion = {
                **stage_completion,
                "artifacts": merged_artifacts,
            }
    merged["stage_completion"] = stage_completion
    return merged


def ensure_stage_completion(
    result: dict[str, Any],
    stage_name: str,
    *,
    next_stage: str | None = None,
    artifacts: list[str] | None = None,
    notes: list[str] | None = None,
) -> dict[str, Any]:
    """v0.7.0 신규. result dict 에 stage_completion 이 없으면 *자동 생성*.

    12/12 일관성 달성 후 모든 skill 의 result 가 stage_completion 을 가져야 함.
    그러나 legacy code path (error early-exit 등) 에서 stage_completion 이 빠질 수 있는
    케이스를 보호. ensure_stage_completion() 이 lazy fallback.

    Args:
        result: 기존 skill output dict
        stage_name: 자동 생성 시 사용할 stage 식별자
        next_stage, artifacts, notes: build_stage_completion() 의 args

    Returns:
        stage_completion 이 있으면 그대로, 없으면 자동 생성 후 merge 한 dict.
    """
    if is_stage_completion_present(result):
        return result
    sc = build_stage_completion(
        stage_name=stage_name,
        stage_status="ok" if result.get("status") in ("ok", "success") else "warning" if result.get("status") == "warning" else "error",
        artifacts=artifacts or [],
        next_stage=next_stage,
        notes=notes or ([result.get("summary", "")[:200]] if result.get("summary") else []),
    )
    return merge_into_result(result, sc, overwrite=False)


def emit_and_log(
    stage_name: str,
    artifacts: list[str],
    next_stage: str | None,
    *,
    stage_status: StageStatus = "ok",
    notes: list[str] | None = None,
    audit_log_path: Path | str | None = None,
    approval_timestamp: str | None = None,
    approval_actor: ApprovalActor | None = None,
) -> str:
    """2-option completion message stdout emit + (optional) audit log append.

    Args:
        stage_name: stage 식별자
        artifacts: 검토 대상 artifact path list
        next_stage: 다음 stage 이름. None 이면 workflow end.
        stage_status: stage 실행 결과 (emoji 결정)
        notes: 1-3 line AI summary
        audit_log_path: audit log file 경로. None 이면 audit log 안 적음.
        approval_timestamp, approval_actor: 승인 정보. audit log 에 기록.
            둘 다 있어야 audit log entry 가 'approved' 상태.

    Returns:
        markdown 형식 completion message string.
    """
    msg = emit_completion_message(
        stage_name=stage_name,
        artifacts=artifacts,
        next_stage=next_stage,
        notes=notes,
        stage_status=stage_status,
    )

    if audit_log_path is not None:
        sc = StageCompletion(
            stage_name=stage_name,
            stage_status=stage_status,
            artifacts=artifacts,
            next_stage=next_stage,
            notes=notes or [],
            approval_timestamp=approval_timestamp,
            approval_actor=approval_actor,
        )
        append_audit_log(audit_log_path, sc)

    return msg


def is_stage_completion_present(result: dict[str, Any]) -> bool:
    """result dict 에 stage_completion field 가 있고, 8 field 가 모두 채워져 있는지.

    Returns:
        True if stage_completion 가 8 field 모두 가진 dict.
    """
    sc = result.get("stage_completion")
    if not isinstance(sc, dict):
        return False
    required_fields = {
        "stage_name", "stage_status", "next_stage",
        "requested_changes", "approval_timestamp", "approval_actor",
        "artifacts", "notes",
    }
    return required_fields.issubset(set(sc.keys()))


def get_stage_status_from_result(result: dict[str, Any]) -> StageStatus | None:
    """result dict 에서 stage_status 추출 (status field 와 stage_completion 둘 다 지원)."""
    # 1순위: stage_completion.stage_status
    sc = result.get("stage_completion")
    if isinstance(sc, dict) and "stage_status" in sc:
        return cast(StageStatus, sc["stage_status"])
    # 2순위: result['status'] (legacy)
    status = result.get("status")
    if status in ("ok", "warning", "error"):
        return cast(StageStatus, status)
    return None
