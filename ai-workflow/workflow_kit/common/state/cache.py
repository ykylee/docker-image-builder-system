# standard-ai-workflow-kit: v1.0.0-beta

"""Logic for managing the workflow state JSON cache."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

from workflow_kit.common.paths import (
    project_workspace_root,
    workflow_backlog_dir,
    workflow_branch_dir,
    workflow_state_path,
    workflow_memory_dir,
    workflow_sessions_dir,
    workflow_tasks_dir,
)
from workflow_kit.common.state.builder import build_workflow_state_payload
from workflow_kit.common.state.memory_index import (
    load_memory_index,
    load_memory_index_at,
    memory_index_root,
)

def build_state_cache_refresh_hint(
    *,
    project_profile_path: Path,
    latest_backlog_path: Path | None = None,
    repository_assessment_path: Path | None = None,
    memory_index_dir: Path | None = None,
    daily_backlog_dir: Path | None = None,
    tasks_dir: Path | None = None,
    sessions_dir: Path | None = None,
    legacy_memory: bool | None = None,  # v0.14.5+ 2nd cycle: None=auto (default True), False=strict opt-out
) -> dict[str, str]:
    workspace_root = project_workspace_root(project_profile_path)
    # v0.11.20 fix: workflow_memory_dir(...) 이 이미 `ai-workflow/memory/active/` (or
    # `<workspace>/ai-workflow/memory/` when PROJECT_PROFILE.md is in docs/) 을 반환.
    # v0.6.0.1 의 `/ "active"` 후속 fix 가 누락되어 state.json 이 `<branch>/active/state.json`
    # 으로 잘못 쓰여졌었음 (테스트 fixture 의 path 기대와 production 양쪽 어긋남).
    memory_dir = workflow_memory_dir(project_profile_path)
    branch_dir = workflow_branch_dir(project_profile_path)
    generator_path = workspace_root / "workflow-source" / "scripts" / "generate_workflow_state.py"
    # v1.0.0 branch-scoped: state.json 은 builder 가 rebuild 하는 *생성물* 이고 브랜치마다
    # 작업 상태가 다르므로 `active/<branch>/state.json`. 미마이그레이션 저장소는
    # workflow_state_path() 내부에서 legacy(`active/state.json`) 로 fallback 한다.
    state_path = workflow_state_path(project_profile_path)
    # v0.14.0+ 신규 layout (append-only) dir 자동 resolve.
    # 명시되지 않으면 memory_dir 하위 신규 layout 디렉토리로 default.
    resolved_daily_backlog_dir = daily_backlog_dir or workflow_backlog_dir(project_profile_path)
    resolved_tasks_dir = tasks_dir or workflow_tasks_dir(project_profile_path)
    resolved_sessions_dir = sessions_dir or workflow_sessions_dir(project_profile_path)
    # legacy path (deprecation cycle fallback) — v0.14.5+ 2nd cycle:
    # `--legacy-memory` flag 가 명시되어야만 hint 에 포함. 1st cycle caller 는
    # backward compat 으로 default True (auto opt-in).
    legacy_handoff_path = branch_dir / "session_handoff.md"
    legacy_index_path = memory_dir / "work_backlog.md"
    legacy_memory = legacy_memory if legacy_memory is not None else True  # default True (1st cycle backward compat)
    command_parts = [
        f"python3 {generator_path}",
        f"--project-profile-path {project_profile_path}",
        f"--daily-backlog-dir {resolved_daily_backlog_dir}",
        f"--tasks-dir {resolved_tasks_dir}",
        f"--sessions-dir {resolved_sessions_dir}",
    ]
    if legacy_memory:
        if legacy_handoff_path.exists():
            command_parts.append(f"--session-handoff-path {legacy_handoff_path}")
        if legacy_index_path.exists():
            command_parts.append(f"--work-backlog-index-path {legacy_index_path}")
    else:
        # 2nd cycle strict opt-out — hint command 에 legacy path 미포함.
        # caller 가 명시적으로 `--no-legacy-memory` 를 호출해야만 hint 에 포함.
        # (v0.15.0 에서 legacy_memory 강제 False)
        command_parts.append("--no-legacy-memory")
    command_parts.append(f"--output-path {state_path}")
    if latest_backlog_path:
        command_parts.append(f"--latest-backlog-path {latest_backlog_path}")
    if repository_assessment_path:
        command_parts.append(f"--repository-assessment-path {repository_assessment_path}")
    # v0.11.22+ Phase 1.5: memory_index_dir 가 명시되면 refresh hint command 에 포함.
    if memory_index_dir:
        command_parts.append(f"--memory-index-dir {memory_index_dir}")
    return {
        "state_path": str(state_path),
        "refresh_command": " ".join(str(part) for part in command_parts),
    }

def refresh_workflow_state_cache(
    *,
    project_profile_path: Path,
    session_handoff_path: Path | None = None,
    work_backlog_index_path: Path | None = None,
    daily_backlog_dir: Path | None = None,
    tasks_dir: Path | None = None,
    sessions_dir: Path | None = None,
    latest_backlog_path: Path | None = None,
    repository_assessment_path: Path | None = None,
    output_path: Path | None = None,
    generated_at: str,
    workspace_root: Path | None = None,
    memory_index_dir: Path | None = None,
    legacy_memory: bool | None = None,  # v0.14.5+ 2nd cycle: None=auto (default True for backward compat), False=strict opt-out
) -> dict[str, Any]:
    resolved_project_profile_path = project_profile_path.resolve()
    # v0.11.20 fix: build_state_cache_refresh_hint 와 정합 — memory_dir / branch_dir 모두
    # `/ "active"` suffix 제거. PROJECT_PROFILE.md 가 이미 `<memory>/active/` 에 있으므로
    # `workflow_memory_dir(...)` 가 active/ 까지 포함한 path 를 반환.
    memory_dir = workflow_memory_dir(resolved_project_profile_path)
    branch_dir = workflow_branch_dir(resolved_project_profile_path)
    actual_root = workspace_root or project_workspace_root(resolved_project_profile_path)
    # v0.14.5+ 2nd cycle: legacy path 자동 resolve 는 legacy_memory flag 가
    # True (default for 1st cycle backward compat) 일 때만 동작. False 면 명시적
    # legacy path 가 caller 가 직접 전달한 경우만 resolve.
    legacy_memory_effective = legacy_memory if legacy_memory is not None else True
    if legacy_memory_effective:
        # 1st cycle silent fallback (backward compat) — branch_dir/session_handoff.md
        # 또는 memory_dir/work_backlog.md 가 존재하면 자동 include.
        resolved_session_handoff_path = (
            (session_handoff_path or (branch_dir / "session_handoff.md")).resolve()
            if (session_handoff_path or (branch_dir / "session_handoff.md")).exists()
            else None
        )
        resolved_work_backlog_index_path = (
            (work_backlog_index_path or (memory_dir / "work_backlog.md")).resolve()
            if (work_backlog_index_path or (memory_dir / "work_backlog.md")).exists()
            else None
        )
    else:
        # 2nd cycle strict opt-out — caller 가 명시한 legacy path 만 resolve.
        # branch_dir 하위 자동 include 하지 않음.
        resolved_session_handoff_path = (
            session_handoff_path.resolve() if session_handoff_path else None
        )
        resolved_work_backlog_index_path = (
            work_backlog_index_path.resolve() if work_backlog_index_path else None
        )
    # v0.14.0+ 신규 layout dir 자동 resolve
    resolved_daily_backlog_dir = daily_backlog_dir or workflow_backlog_dir(resolved_project_profile_path)
    resolved_tasks_dir = tasks_dir or workflow_tasks_dir(resolved_project_profile_path)
    resolved_sessions_dir = sessions_dir or workflow_sessions_dir(resolved_project_profile_path)
    resolved_latest_backlog_path = latest_backlog_path.resolve() if latest_backlog_path else None
    resolved_repository_assessment_path = repository_assessment_path.resolve() if repository_assessment_path else None

    # v0.14.0+ 신규 layout 의 dir 은 부재해도 OK (aggregate 가 빈 dict 반환).
    # legacy path 만 required check 대상.
    missing_paths: list[str] = []
    for required_path in (
        resolved_project_profile_path,
    ):
        if not required_path.exists():
            missing_paths.append(str(required_path))
    # legacy required (둘 다 부재 시 warning 만, skip ❌)
    if resolved_session_handoff_path is None and resolved_work_backlog_index_path is None:
        if not resolved_daily_backlog_dir.exists():
            missing_paths.append(str(resolved_daily_backlog_dir))

    # v1.0.1 fix: writer 도 branch-scoped 로. v1.0.0 branch-scoped 도입 때 *hint* 만
    # `workflow_state_path()` 로 옮기고 writer 는 legacy(`active/state.json`) 에 남아
    # 있었다. 그 결과 refresh 는 아무도 읽지 않는 `active/state.json` 을 새로 만들고
    # 정작 reader 가 보는 `active/<branch>/state.json` 은 **영원히 갱신되지 않았다**
    # (2026-07-21 이후 state.json 이 통째로 멈춰 있던 원인).
    state_path = (output_path or workflow_state_path(resolved_project_profile_path)).resolve()
    refresh_hint = build_state_cache_refresh_hint(
        project_profile_path=resolved_project_profile_path,
        latest_backlog_path=resolved_latest_backlog_path,
        repository_assessment_path=resolved_repository_assessment_path,
        memory_index_dir=memory_index_dir,
        daily_backlog_dir=resolved_daily_backlog_dir,
        tasks_dir=resolved_tasks_dir,
        sessions_dir=resolved_sessions_dir,
        legacy_memory=legacy_memory_effective,
    )
    if missing_paths and not resolved_daily_backlog_dir.exists():
        return {
            "status": "skipped",
            "state_path": str(state_path),
            "refresh_command": refresh_hint["refresh_command"],
            "missing_paths": missing_paths,
        }

    # v0.11.22+ Phase 1.5: ADR-005 memory_entries optional merge.
    # None 이면 zero-risk (key 미포함). 명시되면 load 후 dict 로 변환.
    memory_entries_payload: list[dict[str, Any]] = []
    if memory_index_dir is not None:
        loaded_entries = load_memory_index_at(memory_index_dir)
    elif actual_root is not None:
        loaded_entries = load_memory_index(actual_root)
    else:
        loaded_entries = []
    memory_entries_payload = [e.model_dump(mode="json") for e in loaded_entries]

    payload = build_workflow_state_payload(
        project_profile_path=resolved_project_profile_path,
        session_handoff_path=resolved_session_handoff_path,
        work_backlog_index_path=resolved_work_backlog_index_path,
        daily_backlog_dir=resolved_daily_backlog_dir,
        tasks_dir=resolved_tasks_dir,
        sessions_dir=resolved_sessions_dir,
        latest_backlog_path=resolved_latest_backlog_path,
        repository_assessment_path=resolved_repository_assessment_path,
        generated_at=generated_at,
        workspace_root=actual_root,
        memory_entries=memory_entries_payload,
    )
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # v0.15.0: 2nd deprecation cycle 종결 — `work_backlog.md.bak` 완전 drop.
    # 본 block 은 더 이상 emit 안 함 (legacy_bak 부재 시 자연스럽게 no-op). pre-v0.15.0
    # caller 중 `legacy_memory` kwarg / `--legacy-memory` flag / `--legacy-memory opt-out`
    # 명시 없이 branch_dir 하위 legacy fallback 사용하던 caller 는 **breaking change**
    # — v0.15.0 부터는 explicit path 또는 `legacy_memory=True` 명시 필요.
    # v0.15.0 release 시 `.bak` 파일이 drop 되어 legacy_bak.exists() 가 False 반환,
    # 따라서 deprecation_warnings 모두 no-op (1st/2nd cycle warning 자동 stop).
    deprecation_warnings: list[str] = []
    deprecation_cycle: str | None = None
    legacy_bak = memory_dir / "work_backlog.md.bak"
    legacy_present = (memory_dir / "work_backlog.md").exists()
    if legacy_bak.exists():
        if legacy_memory_effective:
            # 1st cycle warning stage (current: v0.14.1~v0.14.5 사이의 caller)
            deprecation_cycle = "1st cycle 종결 (warning stage)"
            deprecation_warnings.append(
                f"[DEPRECATION WARNING v0.14.1] ai-workflow/memory/active/work_backlog.md.bak 발견됨. "
                f"신규 layout (backlog/, sessions/) 사용 권장. "
                f"v0.14.5 부터는 --legacy-memory opt-out flag 필요, v0.15.0 에서 완전 drop."
            )
        else:
            # 2nd cycle strict opt-out — caller 가 --legacy-memory 명시 안 했으므로
            # silent fallback 하지 않음. 단, .bak 가 보존돼 있으면 ALERT.
            deprecation_cycle = "2nd cycle 진행 (strict opt-out)"
            deprecation_warnings.append(
                f"[DEPRECATION ALERT v0.14.5] ai-workflow/memory/active/work_backlog.md.bak 발견됨. "
                f"2nd cycle 진행 — silent fallback 무효. "
                f"--legacy-memory flag 명시 시에만 legacy read 가능. "
                f"v0.15.0 에서 .bak 완전 drop."
            )
    if legacy_present and not legacy_bak.exists():
        # Phase 14 이전 상태 (legacy 만, bak 부재) — migration 미완료
        deprecation_warnings.append(
            f"[DEPRECATION NOTICE] ai-workflow/memory/active/work_backlog.md 발견됨 (legacy, .bak 아님). "
            f"v0.14.0+ 신규 layout 으로 migration 필요: tools/migrate_active_to_appendonly.py --apply --legacy-backup"
        )

    return {
        "status": "refreshed",
        "state_path": str(state_path),
        "refresh_command": refresh_hint["refresh_command"],
        "missing_paths": [],
        "deprecation_warnings": deprecation_warnings,
        "deprecation_cycle": deprecation_cycle,  # v0.14.5+: '1st cycle 종결 (warning stage)' | '2nd cycle 진행 (strict opt-out)' | None
        "legacy_memory": legacy_memory_effective,  # effective value (None → True)
    }


def refresh_maturity_last_updated(
    maturity_path: Path,
    today: str | None = None,
) -> dict[str, Any]:
    """maturity_matrix.json 의 `last_updated` field 를 오늘 날짜로 자동 갱신.

    Phase 14 dashboard freshness 보강:
    - 기존: maturity_last_updated 가 release 시 manual 갱신 (release_pipeline 의
      step 6). dashboard Panel 1 의 `last_updated_delta_days` 가 release cycle 동안
      누적되어 drift.
    - 보강: `refresh_maturity_last_updated()` 호출 시 오늘 날짜 (또는 명시된 today)
      와 비교 — 다르면 in-place 갱신. release pipeline step + dashboard post-emit
      모두에서 호출 가능.

    atomic write 보장 (json.dump + write_text). freshness 의 SSOT 는 maturity_last_updated
    그대로 유지 (외부 schema 변경 ❌).

    Args:
        maturity_path: workflow-source/core/maturity_matrix.json
        today: 명시적 override (default: date.today().isoformat())

    Returns:
        dict {"updated": bool, "before": str, "after": str, "today": str, "maturity_path": str}
    """
    today = today or date.today().isoformat()
    result: dict[str, Any] = {
        "updated": False,
        "before": "",
        "after": today,
        "today": today,
        "maturity_path": str(maturity_path),
    }
    if not maturity_path.is_file():
        return result
    try:
        with maturity_path.open("r", encoding="utf-8") as fp:
            mm = json.load(fp)
    except (OSError, json.JSONDecodeError):
        return result
    before = str(mm.get("last_updated", ""))
    result["before"] = before
    if before == today:
        return result
    mm["last_updated"] = today
    maturity_path.write_text(
        json.dumps(mm, ensure_ascii=False, indent=2) + "\n", encoding="utf-8",
    )
    result["updated"] = True
    result["after"] = today
    return result
