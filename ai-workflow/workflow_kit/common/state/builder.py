# standard-ai-workflow-kit: v0.15.19-beta

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

def _aggregate_from_appendonly_layout(
    *,
    daily_backlog_dir: Path | None,
    tasks_dir: Path | None,
    sessions_dir: Path | None,
) -> dict[str, list[str]]:
    """v0.14.0+ append-only layout 에서 in_progress / blocked / done 추출.

    본 함수는 legacy `session_handoff.md` / `work_backlog.md` 가 없을 때,
    또는 그들과 동시에 (merge) 사용될 때 호출된다. ADR-005 memory_index 와 동일
    패턴으로 *물리 격리된 파일들* 에서 aggregate.

    Returns:
        {
            "in_progress_items": list[str],   # tasks_dir frontmatter status: in_progress
            "blocked_items": list[str],       # tasks_dir frontmatter status: blocked
            "done_items": list[str],          # tasks_dir frontmatter status: done
            "recent_done_items": list[str],   # done_items 의 최근 10개 (FIFO)
            "sessions": list[str],            # sessions_dir 의 file stem list (참고용)
        }
    """
    in_progress: list[str] = []
    blocked: list[str] = []
    done: list[str] = []
    done_summaries: list[str] = []  # prose 1줄 (dashboard / purpose_graph 정합)
    sessions: list[str] = []

    # 1) tasks_dir: TASK-<date>-<NNN>.md 의 frontmatter status aggregate
    #    첫 heading `# TASK-XXX — <prose title>` 에서 prose summary 추출
    #    → recent_done_items 가 dashboard / purpose_graph 가 기대하는 prose 형식
    if tasks_dir is not None and tasks_dir.exists() and tasks_dir.is_dir():
        for task_file in sorted(tasks_dir.glob("TASK-*.md")):
            try:
                text = task_file.read_text(encoding="utf-8")
            except OSError:
                continue
            fm_match = re.match(r"^---\n(.+?)\n---", text, re.S)
            if not fm_match:
                continue
            id_match = re.search(r"^id:\s*(\S+)", fm_match.group(1), re.M)
            status_match = re.search(r"^status:\s*(\S+)", fm_match.group(1), re.M)
            if not id_match:
                continue
            task_id = id_match.group(1)
            status = status_match.group(1) if status_match else "planned"
            if status == "in_progress":
                in_progress.append(task_id)
            elif status == "blocked":
                blocked.append(task_id)
            elif status == "done":
                done.append(task_id)
                # prose summary 추출: 첫 `# ` heading 의 본문 (`# ` prefix 제거)
                prose: str | None = None
                for line in text.splitlines():
                    if line.startswith("# "):
                        prose = line[2:].strip()
                        break
                done_summaries.append(prose or task_id)

    # 2) daily_backlog_dir: YYYY-MM-DD.md 의 task link 보강 (legacy 데이터 호환)
    #    tasks_dir aggregate 가 우선이지만, daily index 만 있고 task file 이
    #    아직 migrate 안 된 경우를 대비해 daily index 의 TASK-* id 도 done 후보.
    if daily_backlog_dir is not None and daily_backlog_dir.exists() and daily_backlog_dir.is_dir():
        for daily_file in sorted(daily_backlog_dir.glob("[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].md")):
            try:
                text = daily_file.read_text(encoding="utf-8")
            except OSError:
                continue
            for line in text.splitlines():
                m = re.match(r"-\s+\*\*(TASK-\d{4}-\d{2}-\d{2}-\d{3})\*\*", line)
                if m and m.group(1) not in done and m.group(1) not in in_progress and m.group(1) not in blocked:
                    done.append(m.group(1))
                    # daily index 의 "title" 부분 추출: `[🔧 release] title` → title 만
                    after = line[m.end():].strip()
                    title_m = re.match(r"(?:\[[^\]]+\]\s+)(.+)$", after)
                    done_summaries.append(title_m.group(1).strip() if title_m else m.group(1))

    # 3) sessions_dir: per-session file stem (참고용 — state.json payload 에 직접
    #    들어가지 않고, dashboard 등에서 활용 가능하도록 list 로 emit)
    if sessions_dir is not None and sessions_dir.exists() and sessions_dir.is_dir():
        for session_file in sorted(sessions_dir.glob("*.md")):
            sessions.append(session_file.stem)

    return {
        "in_progress_items": in_progress,
        "blocked_items": blocked,
        "done_items": done,
        "recent_done_items": done_summaries[-10:],
        "sessions": sessions,
    }


def build_workflow_state_payload(
    *,
    project_profile_path: Path,
    session_handoff_path: Path | None = None,
    work_backlog_index_path: Path | None = None,
    daily_backlog_dir: Path | None = None,
    tasks_dir: Path | None = None,
    sessions_dir: Path | None = None,
    latest_backlog_path: Path | None = None,
    repository_assessment_path: Path | None = None,
    generated_at: str,
    workspace_root: Path | None = None,
    memory_entries: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """state.json payload build.

    v0.14.0+ 신규 layout 지원 — `daily_backlog_dir` / `tasks_dir` / `sessions_dir`
    가 명시되면 append-only layout 에서 aggregate. legacy `session_handoff_path`
    + `work_backlog_index_path` (default = None) 도 backward compatible.

    Aggregate 우선순위:
      1) 신규 layout (daily_backlog_dir + tasks_dir + sessions_dir) — 명시되면 우선
      2) legacy handoff + work_backlog_index_path — fallback 또는 merge

    `memory_entries` (Phase 1.5, ADR-005) — None 또는 빈 list 면 `memory_entries`
    key 도 emit 하지 않아 zero-risk opt-in. dict list 일 때만 payload 에 merge.
    """
    actual_root = workspace_root or project_workspace_root(project_profile_path)

    # --- legacy path resolution ---
    legacy_handoff_present = session_handoff_path is not None and session_handoff_path.exists()
    legacy_index_present = work_backlog_index_path is not None and work_backlog_index_path.exists()

    if legacy_index_present and work_backlog_index_path is not None:
        resolved_latest_backlog_path = latest_backlog_path or find_latest_backlog_path(work_backlog_index_path)
        if resolved_latest_backlog_path is not None and not resolved_latest_backlog_path.exists():
            resolved_latest_backlog_path = None
    else:
        resolved_latest_backlog_path = None

    profile_core = parse_project_profile_core(project_profile_path)
    profile_validation = parse_project_profile_validation(project_profile_path)

    # legacy handoff parse (있을 때만)
    if legacy_handoff_present and session_handoff_path is not None:
        handoff = parse_handoff(session_handoff_path)
    else:
        handoff = {
            "tasks": [],
            "in_progress_items": [],
            "blocked_items": [],
            "done_items": [],
            "recent_done_items": [],
            "next_documents": [],
            "constraints": [],
        }

    # legacy backlog parse (있을 때만)
    if resolved_latest_backlog_path is not None:
        backlog = parse_backlog(resolved_latest_backlog_path)
    else:
        backlog = {
            "tasks": [],
            "in_progress_items": [],
            "blocked_items": [],
            "done_items": [],
        }

    # --- v0.14.0+ append-only layout aggregate ---
    appendonly = _aggregate_from_appendonly_layout(
        daily_backlog_dir=daily_backlog_dir,
        tasks_dir=tasks_dir,
        sessions_dir=sessions_dir,
    )

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
        + [item for item in appendonly["in_progress_items"] if is_meaningful_text(item)]
        + backlog_in_progress
    )
    blocked_items = dedupe_work_items(
        [item for item in handoff_blocked if is_meaningful_text(item)]
        + [item for item in appendonly["blocked_items"] if is_meaningful_text(item)]
        + backlog_blocked
    )
    recent_done_items = dedupe_work_items(
        [item for item in handoff_recent_done if is_meaningful_text(item)]
        + [item for item in appendonly["recent_done_items"] if is_meaningful_text(item)]
        + backlog_done
    )[:10]

    next_documents = _dedupe_strings_base(
        [
            safe_relpath(project_profile_path, actual_root),
            safe_relpath(session_handoff_path, actual_root) if session_handoff_path else "",
            safe_relpath(work_backlog_index_path, actual_root) if work_backlog_index_path else "",
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

    # v0.14.0+ source_of_truth: 신규 layout 사용 시 directory path emit
    # legacy path 가 명시되지 않으면 빈 string (None 아님 — schema 일관성)
    source_of_truth: dict[str, str | None] = {
        "project_profile_path": safe_relpath(project_profile_path, actual_root),
        "session_handoff_path": safe_relpath(session_handoff_path, actual_root) if session_handoff_path else None,
        "work_backlog_index_path": safe_relpath(work_backlog_index_path, actual_root) if work_backlog_index_path else None,
        "daily_backlog_dir": safe_relpath(daily_backlog_dir, actual_root) if daily_backlog_dir else None,
        "tasks_dir": safe_relpath(tasks_dir, actual_root) if tasks_dir else None,
        "sessions_dir": safe_relpath(sessions_dir, actual_root) if sessions_dir else None,
        "latest_backlog_path": safe_relpath(resolved_latest_backlog_path, actual_root) if resolved_latest_backlog_path else None,
        "repository_assessment_path": safe_relpath(repository_assessment_path, actual_root) if repository_assessment_path else None,
    }

    payload: dict[str, Any] = {
        "schema_version": "1",
        "generated_at": generated_at,
        "purpose_digest": purpose_digest,
        "purpose_digest_rev": purpose_digest_rev,
        "source_of_truth": source_of_truth,
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
        "schema_version_memory_entries": "1",
    }
    # v0.11.22+ Phase 1.5: ADR-005 memory_entries optional merge.
    # 부재 시 zero-risk (key 미포함), list 있을 때만 emit.
    if memory_entries:
        payload["memory_entries"] = memory_entries
        payload["memory_entries_count"] = len(memory_entries)
    return payload
