# standard-ai-workflow-kit: v0.11.21-beta

"""Logic for building the workflow state payload from various sources."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, cast

from workflow_kit.common.normalize import (
    dedupe_normalized_backticked,
    dedupe_strings as _dedupe_strings_base,
    dedupe_work_items,
)
from workflow_kit.common.paths import project_workspace_root, safe_relpath
from workflow_kit.common.project_docs import (
    find_latest_backlog_path,
    parse_backlog,
    parse_handoff,
    parse_project_profile_core,
    parse_project_profile_validation,
)


def _parse_purpose_summary(
    path: Path | None,
) -> tuple[str | None, str | None]:
    """PURPOSE.md frontmatter + §1 Goals 첫 번째 goal parse.

    v0.9.4 chapter 8 R-A follow-up part 1.
    Returns: (purpose_digest, purpose_digest_rev) — 부재 시 (None, None).
    """
    if path is None or not path.exists():
        return None, None
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return None, None
    # frontmatter parse
    purpose_digest_rev: str | None = None
    fm_match = re.match(r"^---\n(.+?)\n---", text, re.S)
    if fm_match:
        rev_match = re.search(
            r"last_purpose_review\s*:\s*(\d{4}-\d{2}-\d{2})", fm_match.group(1)
        )
        if rev_match:
            purpose_digest_rev = rev_match.group(1)
    # §1 Goals 첫 번째 goal
    purpose_digest: str | None = None
    goal_match = re.search(r"^- \*\*G\d+\*\*\s*:\s*(.+)$", text, re.M)
    if goal_match:
        purpose_digest = goal_match.group(1).strip()
    return purpose_digest, purpose_digest_rev


def is_meaningful_text(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip()) and not value.strip().startswith("TODO:")

def build_workflow_state_payload(
    *,
    project_profile_path: Path,
    session_handoff_path: Path,
    work_backlog_index_path: Path,
    latest_backlog_path: Path | None = None,
    repository_assessment_path: Path | None = None,
    generated_at: str,
    workspace_root: Path | None = None,
) -> dict[str, Any]:
    actual_root = workspace_root or project_workspace_root(project_profile_path)
    resolved_latest_backlog_path = latest_backlog_path or find_latest_backlog_path(work_backlog_index_path)
    if resolved_latest_backlog_path is not None and not resolved_latest_backlog_path.exists():
        resolved_latest_backlog_path = None

    profile_core = parse_project_profile_core(project_profile_path)
    profile_validation = parse_project_profile_validation(project_profile_path)
    handoff = parse_handoff(session_handoff_path)
    backlog = parse_backlog(resolved_latest_backlog_path) if resolved_latest_backlog_path else {
        "tasks": [],
        "in_progress_items": [],
        "blocked_items": [],
        "done_items": [],
    }

    # parse_handoff/parse_backlog return dict[str, object] — cast list-valued fields
    # to list[str] for downstream consumption. v0.8.13 mypy strict 9단계.
    handoff_in_progress: list[str] = cast(list[str], handoff.get("in_progress_items", []))
    handoff_blocked: list[str] = cast(list[str], handoff.get("blocked_items", []))
    handoff_recent_done: list[str] = cast(list[str], handoff.get("recent_done_items", []))
    handoff_next_docs_raw: list[Path] = cast(list[Path], handoff.get("next_documents", []))
    handoff_constraints: list[str] = cast(list[str], handoff.get("constraints") or [])

    backlog_in_progress: list[str] = cast(list[str], backlog.get("in_progress_items", []))
    backlog_blocked: list[str] = cast(list[str], backlog.get("blocked_items", []))
    backlog_done: list[str] = cast(list[str], backlog.get("done_items", []))
    backlog_tasks: list[dict[str, str]] = cast(list[dict[str, str]], backlog.get("tasks", []))

    in_progress_items = dedupe_work_items(
        [item for item in handoff_in_progress if is_meaningful_text(item)]
        + backlog_in_progress
    )
    blocked_items = dedupe_work_items(
        [item for item in handoff_blocked if is_meaningful_text(item)]
        + backlog_blocked
    )
    recent_done_items = dedupe_work_items(
        [item for item in handoff_recent_done if is_meaningful_text(item)]
        + backlog_done
    )[:10]

    next_documents = _dedupe_strings_base(
        [
            safe_relpath(project_profile_path, actual_root),
            safe_relpath(session_handoff_path, actual_root),
            safe_relpath(work_backlog_index_path, actual_root),
            safe_relpath(resolved_latest_backlog_path, actual_root) if resolved_latest_backlog_path else "",
            *[safe_relpath(path, actual_root) for path in handoff_next_docs_raw if isinstance(path, Path) and path.exists()],
        ]
    )

    current_focus = in_progress_items[0] if in_progress_items else (blocked_items[0] if blocked_items else None)
    if current_focus is None and backlog_tasks:
        first_task = backlog_tasks[0]
        current_focus = f"{first_task['task_id']} {first_task['title']}"

    # v0.9.4 chapter 8 R-A follow-up part 1: state.json.purpose_digest 1-line 자동 생성
    purpose_candidates = [
        actual_root / "ai-workflow" / "memory" / "active" / "PURPOSE.md",
        actual_root.parent / "ai-workflow" / "memory" / "active" / "PURPOSE.md",
        actual_root / "PURPOSE.md",  # workspace_root 의 직접 PURPOSE.md (fallback)
    ]
    purpose_path = next((p for p in purpose_candidates if p.exists()), None)
    purpose_digest, purpose_digest_rev = _parse_purpose_summary(purpose_path)

    return {
        "schema_version": "1",
        "generated_at": generated_at,
        "purpose_digest": purpose_digest,
        "purpose_digest_rev": purpose_digest_rev,
        "source_of_truth": {
            "project_profile_path": safe_relpath(project_profile_path, actual_root),
            "session_handoff_path": safe_relpath(session_handoff_path, actual_root),
            "work_backlog_index_path": safe_relpath(work_backlog_index_path, actual_root),
            "latest_backlog_path": safe_relpath(resolved_latest_backlog_path, actual_root) if resolved_latest_backlog_path else None,
            "repository_assessment_path": safe_relpath(repository_assessment_path, actual_root) if repository_assessment_path else None,
        },
        "project": {
            "project_name": profile_core.get("project_name"),
            "document_home": profile_core.get("document_home"),
            "operations_path": profile_core.get("operations_path"),
            "backlog_path": profile_core.get("backlog_path"),
            "handoff_path": profile_core.get("handoff_path"),
            "environment_path": profile_core.get("environment_path"),
        },
        "commands": {
            "quick_tests": profile_validation.get("quick_tests"),
            "isolated_tests": profile_validation.get("isolated_tests"),
            "runtime_checks": profile_validation.get("runtime_checks"),
        },
        "session": {
            "current_baseline": handoff.get("current_baseline"),
            "current_axis": handoff.get("current_axis"),
            "current_focus": current_focus,
            "in_progress_items": in_progress_items,
            "blocked_items": blocked_items,
            "recent_done_items": recent_done_items,
            "environment_constraints": dedupe_normalized_backticked(
                [item for item in handoff_constraints if is_meaningful_text(item)]
            ),
        },
        "backlog": {
            "latest_backlog_path": safe_relpath(resolved_latest_backlog_path, actual_root) if resolved_latest_backlog_path else None,
            "task_count": len(backlog_tasks),
            "in_progress_items": backlog_in_progress,
            "blocked_items": backlog_blocked,
            "done_items": backlog_done,
        },
        "next_documents": next_documents,
        "repository_assessment": {
            "path": safe_relpath(repository_assessment_path, actual_root) if repository_assessment_path else None,
            "present": bool(repository_assessment_path and repository_assessment_path.exists()),
        },
    }
