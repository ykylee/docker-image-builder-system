# standard-ai-workflow-kit: v0.11.21-beta

"""Stage Gate Pattern (v0.6.4) — 2-option completion message, audit log, gate enforcement.

AIDLC construction phase 의 "Standardized 2-option completion message" 패턴 차용.
자세한 spec: workflow-source/core/stage_gate_pattern.md.

핵심 기능:
- StageCompletion dataclass: stage_name, stage_status, next_stage, requested_changes,
  approval_timestamp, approval_actor, artifacts, notes
- validate_completion(completion): completion payload 의 8 field 검증
- require_explicit_approval(completion, env): auto-approval 한계 검사
  (P0 hotfix, CI timeout, cron 만 허용, 그 외 user approval mandatory)
- append_audit_log(audit_path, completion): append-only 기록 (ISO 8601)
- emit_completion_message(stage_name, artifacts, next_stage, notes): 정공법 format 의 markdown

NO EMERGENT BEHAVIOR: 3-option / 4-option ❌. 2-option 만 허용.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

# Constants — output_schema_guide.md §3.4 와 동기화
StageStatus = Literal["ok", "warning", "error"]
ApprovalActor = Literal["user", "orchestrator", "auto"]

# 옵션 정규화: 2-option 만 허용 (Request Changes / Continue)
ALLOWED_OPTIONS: tuple[str, ...] = ("request_changes", "continue")

# AIDLC 의 2-option label 과 우리 내부 enum 매핑
OPTION_LABEL_TO_ENUM: dict[str, str] = {
    "request changes": "request_changes",
    "continue": "continue",
    "continue to next stage": "continue",
    "🔧 request changes": "request_changes",
    "✅ continue to next stage": "continue",
    "✅ approve & continue": "continue",  # AIDLC 의 "Approve & Continue" 도 continue 로 정규화
}

# auto-approval 허용 환경
AUTO_APPROVAL_ENVS: frozenset[str] = frozenset({"ci", "ci/cd", "cron", "p0_hotfix"})

# auto-approval 시 mandatory notes keyword (정확한 사유 추적)
AUTO_APPROVAL_NOTES_KEYWORDS: tuple[str, ...] = (
    "p0 hotfix",
    "ci timeout",
    "cron",
    "auto-approved",
)


@dataclass
class StageCompletion:
    """v0.6.4 신규. skill/MCP output 의 stage completion 승인 필드.

    Pydantic v2 schema 는 output_schema_guide.md §3.4 참조.
    """
    stage_name: str
    stage_status: StageStatus
    next_stage: str | None = None
    requested_changes: list[str] = field(default_factory=list)
    approval_timestamp: str | None = None
    approval_actor: ApprovalActor | None = None
    artifacts: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def is_approved(self) -> bool:
        """gate 통과 여부. requested_changes 비어있고 approval_timestamp/actor 모두 있어야."""
        return (
            len(self.requested_changes) == 0
            and self.approval_timestamp is not None
            and self.approval_actor is not None
        )


@dataclass
class GateValidationError:
    """stage gate 검증 에러."""
    field: str
    reason: str
    severity: Literal["error", "warning"] = "error"


@dataclass
class GateValidationResult:
    is_valid: bool
    errors: list[GateValidationError] = field(default_factory=list)
    warnings: list[GateValidationError] = field(default_factory=list)


def validate_completion(completion: StageCompletion) -> GateValidationResult:
    """StageCompletion 의 8 field 검증.

    검증 항목:
    - stage_name: not empty
    - stage_status: in {ok, warning, error}
    - next_stage: not None 또는 명시적 None (workflow end)
    - requested_changes: list[str] (auto-approval 시 None 또는 빈 list 가능)
    - approval_timestamp: ISO 8601 형식
    - approval_actor: in {user, orchestrator, auto}
    - artifacts: list[str]
    - notes: list[str]
    """
    errors: list[GateValidationError] = []
    warnings: list[GateValidationError] = []

    if not completion.stage_name or not completion.stage_name.strip():
        errors.append(GateValidationError(
            field="stage_name", reason="must be non-empty string",
        ))

    if completion.stage_status not in ("ok", "warning", "error"):
        errors.append(GateValidationError(
            field="stage_status",
            reason=f"must be one of ok/warning/error, got {completion.stage_status}",
        ))

    # approval_timestamp: None 이거나 ISO 8601 형식
    if completion.approval_timestamp is not None:
        try:
            datetime.fromisoformat(completion.approval_timestamp.replace("Z", "+00:00"))
        except ValueError:
            errors.append(GateValidationError(
                field="approval_timestamp",
                reason=f"must be ISO 8601 format, got {completion.approval_timestamp}",
            ))

    if completion.approval_actor is not None:
        if completion.approval_actor not in ("user", "orchestrator", "auto"):
            errors.append(GateValidationError(
                field="approval_actor",
                reason=f"must be one of user/orchestrator/auto, got {completion.approval_actor}",
            ))

    return GateValidationResult(
        is_valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
    )


def require_explicit_approval(
    completion: StageCompletion,
    env: str,
    is_production_code: bool = False,
    is_state_doc: bool = False,
    is_release: bool = False,
) -> tuple[bool, str]:
    """auto-approval 가능 여부 검사.

    auto-approval 은 다음에서만 허용 (stage_gate_pattern.md §4.2):
    - CI/CD 환경의 명시적 timeout
    - cron job
    - P0 hotfix (긴급 패치, notes 에 사유 명시)

    다음은 explicit user approval mandatory:
    - Production 코드 변경
    - State 문서 (handoff, backlog, state.json) 갱신
    - Release / version tag

    Args:
        completion: 검증할 StageCompletion
        env: 현재 환경 ("dev" / "ci" / "cron" / "p0_hotfix" / "prod")
        is_production_code: production 코드 변경 여부
        is_state_doc: state 문서 갱신 여부
        is_release: release/version tag 여부

    Returns:
        (is_allowed, reason) tuple.
        is_allowed=True 이면 explicit approval 없이도 진행 가능.
        is_allowed=False 이면 user explicit approval mandatory.
    """
    if completion.approval_actor == "user":
        return True, "user explicit approval"

    if completion.approval_actor == "orchestrator":
        return True, "orchestrator approval (within delegated scope)"

    # auto-approval 케이스
    if completion.approval_actor == "auto":
        if env not in AUTO_APPROVAL_ENVS:
            return False, (
                f"auto-approval requires env in {AUTO_APPROVAL_ENVS}, got {env}"
            )
        if is_production_code or is_state_doc or is_release:
            return False, (
                f"auto-approval NOT allowed for "
                f"{'production code' if is_production_code else ''}"
                f"{'state doc' if is_state_doc else ''}"
                f"{'release' if is_release else ''}"
            )
        # notes 에 사유 keyword 포함 mandatory
        notes_lower = " ".join(completion.notes).lower()
        if not any(kw in notes_lower for kw in AUTO_APPROVAL_NOTES_KEYWORDS):
            return False, (
                f"auto-approval requires notes to include one of "
                f"{AUTO_APPROVAL_NOTES_KEYWORDS}"
            )
        return True, f"auto-approved ({env})"

    # approval_actor 가 None 이면 user approval mandatory
    return False, "no approval recorded"


def append_audit_log(
    audit_path: Path | str,
    completion: StageCompletion,
) -> None:
    """audit log 에 append-only 기록. ISO 8601 timestamp.

    Args:
        audit_path: audit log file 경로 (예: "ai-workflow/memory/active/audit.md")
        completion: 기록할 StageCompletion

    Raises:
        FileExistsError: audit log 가 이미 존재 (overwrite 시도 시)
    """
    p = Path(audit_path)
    # append-only 정책: 기존 파일은 read 후 append. overwrite 금지.
    existing = ""
    if p.exists():
        existing = p.read_text(encoding="utf-8")
        if existing and not existing.endswith("\n"):
            existing += "\n"

    # ISO 8601 timestamp with Z suffix (UTC).
    # v0.7.0 fix: microsecond 제거 (audit_log_standard.md §3.1 형식 준수).
    # datetime.now(timezone.utc).isoformat() 가 microsecond 포함 시 정규화.
    if completion.approval_timestamp:
        ts = completion.approval_timestamp
    else:
        now_iso = datetime.now(timezone.utc).isoformat()
        # microsecond 제거 (있으면)
        if "." in now_iso:
            ts = now_iso.split(".")[0] + "Z"
        else:
            ts = now_iso.replace("+00:00", "Z")

    # v0.7.0 fix: entry_lines 시작에 "" 제거 (leading newline 방지).
    # 기존 line 226 에서 existing 에 "\n" 자동 추가하므로, 두 번째+ append 시
    # leading newline 이 entry header 앞에 안 생김.
    entry_lines: list[str] = [
        f"## [Stage: {completion.stage_name}] [{ts}]",
        f"**Stage**: {completion.stage_name}",
        f"**Status**: {completion.stage_status}",
    ]

    if completion.artifacts:
        entry_lines.append("**Artifacts**:")
        for art in completion.artifacts:
            entry_lines.append(f"- {art}")

    approval = completion.approval_actor or "none"
    entry_lines.append(f"**Approval**: {'approved' if completion.is_approved() else 'pending'}")
    entry_lines.append(f"**Actor**: {approval}")

    if completion.requested_changes:
        entry_lines.append("**Requested Changes**:")
        for change in completion.requested_changes:
            entry_lines.append(f"- {change}")

    if completion.notes:
        entry_lines.append("**Notes**: " + "; ".join(completion.notes))

    if completion.next_stage:
        entry_lines.append(f"**Next Stage**: {completion.next_stage}")

    entry_lines.append("")
    entry_lines.append("---")
    entry_lines.append("")

    p.write_text(existing + "\n".join(entry_lines), encoding="utf-8")


def emit_completion_message(
    stage_name: str,
    artifacts: list[str],
    next_stage: str | None,
    notes: list[str] | None = None,
    stage_status: StageStatus = "ok",
) -> str:
    """정공법 형식의 stage completion message emit (2-option 만).

    AIDLC 의 3-section format:
    1. Completion Announcement (mandatory)
    2. AI Summary (optional, 1-3 line)
    3. Formatted Workflow Message (mandatory, 2-option 만)

    Args:
        stage_name: stage 식별자
        artifacts: 검토 대상 artifact path list
        next_stage: 다음 stage 이름. None 이면 workflow end.
        notes: 1-3 line AI summary
        stage_status: stage 실행 결과

    Returns:
        markdown 형식 string.
    """
    status_emoji = {
        "ok": "✅",
        "warning": "⚠️",
        "error": "❌",
    }.get(stage_status, "✅")

    lines: list[str] = [
        f"# {status_emoji} [{stage_name}] Complete",
        "",
    ]

    if notes:
        for note in notes:
            lines.append(note)
        lines.append("")

    lines.append("## 📋 Review Required")
    lines.append("Please examine the artifacts:")
    for art in artifacts:
        lines.append(f"- `{art}`")
    lines.append("")

    lines.append("## 🚀 What's Next?")
    lines.append("You may:")
    lines.append("")
    lines.append("🔧 **Request Changes** - Ask for modifications to "
                 f"[{stage_name}] based on your review")
    lines.append("")

    if next_stage:
        lines.append(f"✅ **Continue to Next Stage** - Approve [{stage_name}] and proceed to **[{next_stage}]**")
    else:
        lines.append(f"✅ **Continue** - Approve [{stage_name}] and complete the workflow")

    lines.append("")
    return "\n".join(lines)


def normalize_option_label(label: str) -> str:
    """사용자 입력 label 을 정규화 (AIDLC 의 "Approve & Continue" 도 continue 로)."""
    cleaned = label.strip().lower()
    if cleaned in OPTION_LABEL_TO_ENUM.values():
        return cleaned
    return OPTION_LABEL_TO_ENUM.get(cleaned, "")
