# standard-ai-workflow-kit: v1.0.0-beta

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
from workflow_kit.common.paths import project_workspace_root, safe_relpath, memory_active_dir
from workflow_kit.common.project_docs import (
    MISSING_STATUS_MARKER,
    RECENT_DONE_ITEMS_CAP,
    TASK_ID_CAPTURE_RE,
    TASK_ID_PATTERN,
    TASK_STATUSES,
    find_latest_backlog_path,
    parse_backlog,
    parse_handoff,
    parse_project_profile_core,
    parse_project_profile_validation,
)

# `recent_done_items` 의 상한은 `common/project_docs.RECENT_DONE_ITEMS_CAP` 이 정본이다.
# 여기서는 re-export 만 한다 (기존 import 경로 호환).
#
# 이전에는 상한이 두 곳에 있었고 **자르는 방향이 서로 반대**였다:
# `_aggregate_from_appendonly_layout` 은 `[-10:]` (뒤 10개), `build_workflow_state_payload`
# 는 `[:10]` (앞 10개). 그래서 aggregate 가 남긴 것을 builder 가 다시 앞에서 잘랐고,
# 두 slice 어느 쪽도 *최신* 을 고르는 기준이 아니었다. 상한은 한 곳에서 한 번만 적용한다.
# 그 뒤에도 **쓰는 쪽(handoff §4)** 과 **보는 쪽(linter)** 은 이 값을 모르고 있었다.
# `from workflow_kit.common.state.builder import RECENT_DONE_ITEMS_CAP` 는 계속 유효하다.


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


# 완료 시각을 담는 frontmatter 필드 후보 (앞선 것 우선).
_RECENCY_FIELDS = ("completed_at", "updated_at", "created_at")
_ISO_DATE = r"(\d{4}-\d{2}-\d{2})"


def _task_recency_key(frontmatter: str, task_id: str) -> str:
    """done task 의 정렬 키(ISO date). 없으면 ID 의 날짜 segment, 그것도 없으면 "".

    **완료일이 아니라 근사값이다.** 완료 시각을 기록하는 필드는 아직 표준이 아니라서,
    `completed_at` / `updated_at` 이 있으면 그걸 쓰고(향후 writer 가 채우면 별도 수정
    없이 정확해진다) 없으면 `created_at` 으로, 최후에는 ID 에 박힌 날짜로 떨어진다.

    빈 문자열은 정렬에서 가장 오래된 쪽으로 가라앉는다 — 날짜를 모르는 항목이 최신
    자리를 차지하지 않게 하려는 의도다.
    """
    for field in _RECENCY_FIELDS:
        match = re.search(rf"^{field}\s*:\s*{_ISO_DATE}", frontmatter, re.M)
        if match:
            return match.group(1)
    id_match = TASK_ID_CAPTURE_RE.match(task_id)
    if id_match and id_match.group(1):
        return id_match.group(1)
    return ""


_DAILY_BACKLOG_GLOB = "[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].md"


def _find_latest_daily_backlog(daily_backlog_dir: Path | None) -> Path | None:
    """append-only layout 의 daily 디렉터리에서 가장 최신 `YYYY-MM-DD.md`.

    파일명이 ISO 날짜라 사전순 = 시간순이다. legacy `work_backlog.md` 인덱스가 없는
    저장소에서 `latest_backlog_path` 를 **추측이 아니라 관측**으로 채우는 자리다 —
    디렉터리에 실재하는 파일만 돌려준다.
    """
    if daily_backlog_dir is None or not daily_backlog_dir.is_dir():
        return None
    candidates = sorted(daily_backlog_dir.glob(_DAILY_BACKLOG_GLOB))
    return candidates[-1] if candidates else None


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
            "recent_done_items": list[str],   # done prose summary, **최신순 전량** (상한 ❌)
            "unknown_status_items": list[str],  # "<id>: <status>" — 어휘 밖의 status,
                                              #   `status:` 줄 자체가 없으면 `<미기재>`
            "sessions": list[str],            # sessions_dir 의 file stem list (참고용)
        }

    `recent_done_items` 는 여기서 자르지 않는다. 상한은 `RECENT_DONE_ITEMS_CAP` 한 곳에서
    `build_workflow_state_payload` 가 적용한다 — 두 곳에서 반대 방향으로 자르던 것이
    "최근 항목이 밀려나는" 증상의 원인이었다.
    """
    in_progress: list[str] = []
    blocked: list[str] = []
    done: list[str] = []
    # (recency_key, task_id, prose) — 정렬 후에야 prose 만 뽑는다.
    done_records: list[tuple[str, str, str]] = []
    unknown_status_items: list[str] = []
    known_task_ids: set[str] = set()
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
            frontmatter = fm_match.group(1)
            id_match = re.search(r"^id:\s*(\S+)", frontmatter, re.M)
            status_match = re.search(r"^status:\s*(\S+)", frontmatter, re.M)
            if not id_match:
                continue
            task_id = id_match.group(1)
            # task file 이 존재한다는 사실 자체를 기록한다. 아래 (2) 의 daily index
            # fallback 이 **이 파일의 판정을 덮어쓰지 않게** 하는 근거다.
            known_task_ids.add(task_id)
            # `status:` 줄이 없으면 **추측하지 않는다**. 예전에는 `planned` 로 떨어뜨렸는데
            # 그것도 판정이다 — 이미 끝난 legacy 이관 task 를 "아직 시작 안 함" 으로
            # 적는다. 판정 근거가 없다는 사실 자체를 드러낸다.
            if status_match is None:
                unknown_status_items.append(f"{task_id}: {MISSING_STATUS_MARKER}")
                continue
            status = status_match.group(1)
            if status not in TASK_STATUSES:
                # 어휘 밖의 값을 조용히 버리지 않는다. 버리면 (2) 가 done 으로 되살린다.
                unknown_status_items.append(f"{task_id}: {status}")
                continue
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
                done_records.append(
                    (_task_recency_key(frontmatter, task_id), task_id, prose or task_id)
                )

    # 2) daily_backlog_dir: YYYY-MM-DD.md 의 task link 보강 (legacy 데이터 호환)
    #    daily index 만 있고 task file 이 아직 migrate 안 된 경우의 fallback 이다.
    #    **task file 이 있으면 그것이 SSOT** — daily index 로 덮어쓰지 않는다.
    #    (예전에는 `done/in_progress/blocked` 어느 목록에도 없는 ID 를 전부 done 으로
    #     되살려서, 어휘 밖 status 의 task 가 완료로 보고됐다.)
    entry_split_re = re.compile(rf"(?m)^(?=-\s+\*\*{TASK_ID_PATTERN}\*\*)")
    header_re = re.compile(rf"^-\s+\*\*({TASK_ID_PATTERN})\*\*")
    status_line_re = re.compile(r"^\s*-\s*status:\s*(\S+)\s*$", re.M)
    if daily_backlog_dir is not None and daily_backlog_dir.exists() and daily_backlog_dir.is_dir():
        for daily_file in sorted(daily_backlog_dir.glob(_DAILY_BACKLOG_GLOB)):
            try:
                text = daily_file.read_text(encoding="utf-8")
            except OSError:
                continue
            daily_date = daily_file.stem
            for block in entry_split_re.split(text):
                header = header_re.match(block)
                if header is None:
                    continue
                task_id = header.group(1)
                if task_id in known_task_ids or task_id in done:
                    continue
                known_task_ids.add(task_id)
                status_match = status_line_re.search(block)
                # status 줄이 없는 구형 index 는 done 으로 본다 (migration fallback).
                # 있으면 그 값을 따른다 — 여기서도 추측하지 않는다.
                status = status_match.group(1) if status_match else "done"
                if status not in TASK_STATUSES:
                    unknown_status_items.append(f"{task_id}: {status}")
                    continue
                if status == "in_progress":
                    in_progress.append(task_id)
                    continue
                if status == "blocked":
                    blocked.append(task_id)
                    continue
                if status != "done":
                    continue
                done.append(task_id)
                # daily index 의 "title" 부분 추출: `[🔧 release] title` → title 만
                rest = block[header.end():].splitlines()
                after = rest[0].strip() if rest else ""
                title_m = re.match(r"(?:\[[^\]]+\]\s+)(.+)$", after)
                title = title_m.group(1).strip() if title_m else task_id
                done_records.append((daily_date, task_id, title))

    # 3) sessions_dir: per-session file stem (참고용 — state.json payload 에 직접
    #    들어가지 않고, dashboard 등에서 활용 가능하도록 list 로 emit)
    if sessions_dir is not None and sessions_dir.exists() and sessions_dir.is_dir():
        for session_file in sorted(sessions_dir.glob("*.md")):
            sessions.append(session_file.stem)

    # **최신순**. 소비자(dashboard Panel 5 / purpose_graph / state.json 상한)가 모두
    # 앞에서 잘라 쓰므로, 앞이 최신이어야 상한이 최신을 남긴다. 날짜가 같으면 ID 역순
    # (같은 날 채번된 뒤 번호가 최신) — 결정적 순서를 보장한다.
    done_records.sort(key=lambda record: (record[0], record[1]), reverse=True)

    return {
        "in_progress_items": in_progress,
        "blocked_items": blocked,
        "done_items": done,
        "recent_done_items": [prose for _, _, prose in done_records],
        "unknown_status_items": unknown_status_items,
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

    # `latest_backlog_path` 해석 — 세 경로를 **각각** 본다.
    #
    # 예전에는 셋 전부가 `legacy_index_present` 하나에 매달려 있었다. 그래서 append-only
    # layout(= legacy `work_backlog.md` 없음)에서는 **명시적으로 넘긴 인자까지 버려졌고**,
    # `latest_backlog_path` 는 항상 `null`, 그것을 파싱해 채우는 `backlog` block 은
    # 항상 비어 있었다 (`task_count` 가 늘 `0`). task 파일이 107건 있는 저장소에서
    # "task 0건" 이라고 적는 것은 모르는 것이 아니라 **틀린 사실을 적는 것**이다.
    #
    # 우선순위: (1) 호출자가 명시한 경로, (2) legacy index 가 가리키는 최신 파일,
    # (3) append-only layout 의 daily 디렉터리에서 가장 최신 `YYYY-MM-DD.md`.
    resolved_latest_backlog_path: Path | None = latest_backlog_path
    if resolved_latest_backlog_path is None and legacy_index_present and work_backlog_index_path is not None:
        resolved_latest_backlog_path = find_latest_backlog_path(work_backlog_index_path)
    if resolved_latest_backlog_path is None:
        resolved_latest_backlog_path = _find_latest_daily_backlog(daily_backlog_dir)
    if resolved_latest_backlog_path is not None and not resolved_latest_backlog_path.exists():
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
    # 최신순 + 상한 1회. 순서가 바뀐 이유:
    #
    # handoff §4 는 `sync_handoff_status` 가 append 하는 **파생물**이고, 오래된 것이
    # 앞에 온다 (쓰는 쪽 상한은 §2.46 에서 생겼지만 정렬 기준은 여전히 없다). 그게
    # 앞에 있으면 가장 오래된 handoff 항목이 상한을 먼저 채우고, 정작 SSOT 인 task
    # 파일의 최신 항목이 밀려난다 (실측: TASK-2026-07-22-003 이 밀려남).
    # 그래서 task SSOT(appendonly, 이미 최신순) 를 앞에 두고 handoff 를 tail fallback
    # 으로 내린다 — tasks_dir 이 없는 legacy 저장소에서는 handoff 가 그대로 살아난다.
    recent_done_items = dedupe_work_items(
        [item for item in appendonly["recent_done_items"] if is_meaningful_text(item)]
        + [item for item in handoff_recent_done if is_meaningful_text(item)]
        + backlog_done
    )[:RECENT_DONE_ITEMS_CAP]

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
        # **끝난 일은 focus 가 아니다.** 이 fallback 은 진행/차단 목록이 비었을 때
        # "그래도 최신 backlog 에 뭔가 있으면 그걸 가리키자" 는 자리인데, 첫 task 를
        # 그냥 집으면 전부 `done` 인 날에 완료된 작업이 "현재 초점" 으로 올라온다
        # (§2.46 에서 `backlog` block 이 살아나자마자 실제로 그렇게 됐다).
        # 아직 안 끝난 것만 고르고, 없으면 **비운다** — 없는 초점을 지어내지 않는다.
        pending = [task for task in backlog_tasks if task.get("status") != "done"]
        if pending:
            current_focus = f"{pending[0]['task_id']} {pending[0]['title']}"

    # v0.9.4 chapter 8 R-A follow-up part 1: state.json.purpose_digest 1-line 자동 생성
    purpose_candidates = [
        memory_active_dir(actual_root) / "PURPOSE.md",
        memory_active_dir(actual_root.parent) / "PURPOSE.md",
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
            # 판정하지 못한 task 를 **payload 까지** 들고 온다. aggregate 안에만 있으면
            # `_aggregate_from_appendonly_layout` 을 직접 부르는 테스트에만 보이고,
            # state.json 을 읽는 사람과 skill 에게는 여전히 안 보인다 — 조용히 사라지는
            # 것과 같다. 빈 목록이어도 key 는 유지한다 (schema 일관성).
            "unknown_status_items": _dedupe_strings_base(appendonly["unknown_status_items"]),
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
