# standard-ai-workflow-kit: v1.0.0-beta

"""Workflow markdown write helpers for safe, narrow document updates."""

from __future__ import annotations

from datetime import date
from pathlib import Path
import re

from workflow_kit.common.markdown import rel_link_from_doc
from workflow_kit.common.project_docs import RECENT_DONE_ITEMS_CAP


def _read_lines(path: Path) -> list[str]:
    if not path.exists():
        return []
    return path.read_text(encoding="utf-8").splitlines()


def _write_lines(path: Path, lines: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def _replace_scalar_value(lines: list[str], label: str, value: str) -> list[str]:
    prefix = f"- {label}:"
    for idx, line in enumerate(lines):
        if line.strip() == prefix and idx + 1 < len(lines):
            updated = list(lines)
            updated[idx + 1] = f"- {value}"
            return updated
    return lines


def _is_list_line(stripped: str) -> bool:
    """목록 구간에 속하는 줄인가 — 빈 bullet(`-`, `- `)과 빈 줄을 포함한다.

    v1.0.2: 이전에는 `startswith("- ")` 만 봤다. 그런데 **빈 placeholder bullet 은
    `strip()` 하면 `"-"` 가 되어** 이 판정을 통과하지 못했고, 스캐너가 거기서 목록이
    끝났다고 보고 멈췄다. 그러면 교체 구간(`end`)이 시작점에 머물러 **교체가 아니라
    삽입**이 되고, 호출할 때마다 빈 bullet 이 한 줄씩 늘어난다 (실측: `backlog-update
    --apply` 1회마다 handoff 의 in_progress / blocked 가 각각 한 줄씩 성장).
    """
    if _is_section_label_line(stripped):
        return False
    return stripped == "" or stripped == "-" or stripped.startswith("- ")


def _is_section_label_line(stripped: str) -> bool:
    """`- <라벨>:` 형태의 **다음 구간 머리**인가 — 목록의 끝을 의미한다.

    handoff 는 `- 현재 `in_progress` 작업:` / `- 최근 완료 작업 목록:` 처럼 라벨이
    연속으로 놓인다. 빈 bullet 을 목록 줄로 인정하면서 이 종결 조건이 없으면, 스캔이
    다음 구간까지 흘러 라벨 자체를 항목으로 집어삼킨다. 실제 항목은 task label 이라
    `:` 로 끝나지 않는다.
    """
    return stripped.startswith("- ") and stripped.endswith(":")


def _replace_list_after_label(lines: list[str], label: str, items: list[str]) -> list[str]:
    prefix = f"- {label}:"
    for idx, line in enumerate(lines):
        if line.strip() != prefix:
            continue
        start = idx + 1
        end = start
        while end < len(lines):
            stripped = lines[end].strip()
            if stripped.startswith("## "):
                break
            if _is_list_line(stripped):
                end += 1
                continue
            break
        # 빈 목록의 placeholder 는 trailing space 없는 `-` 로 통일한다. `- ` 로 쓰면
        # 다음 호출에서 스스로를 목록 줄로 못 알아보고 위 결함을 재발시킨다.
        replacement = [f"- {item}" for item in items] if items else ["-"]
        return lines[:start] + replacement + lines[end:]
    return lines


def render_daily_backlog_header(*, backlog_path: Path) -> list[str]:
    """v0.14.0+ append-only layout 의 daily index 머리말.

    legacy 머리말(`# YYYY-MM-DD 작업 백로그` + `../work_backlog.md` 링크)은 v0.14.0
    이전 layout 이다. 현행 index 는 **link 모음**이며 본문은 `tasks/` 가 갖는다
    (MEMORY_GOVERNANCE.md §2 "Daily Backlog Index — v0.14.0+ layout").
    """
    backlog_date = backlog_path.stem
    return [
        f"# Backlog Index — {backlog_date}",
        "",
        "- 문서 목적: 해당 날짜의 작업 항목(task) SSOT link 모음.",
        "- 범위: 해당 일자(task 단위)의 모든 task.",
        "- 대상 독자: AI agent (session-start / backlog-update), maintainer.",
        "- 상태: stable (v0.14.0 append-only layout).",
        f"- 최종 수정일: {date.today().isoformat()}",
        "- 관련 문서: [./tasks/](./tasks/) (per-task SSOT)",
        "",
        "## Tasks",
        "",
    ]


def render_task_file(
    *,
    task_id: str,
    title: str,
    status: str,
    created_at: str,
    kind: str,
    source_anchor: str,
    source_path: str,
    body_lines: list[str],
) -> list[str]:
    """per-task SSOT 파일 본문 (MEMORY_GOVERNANCE.md §2 Task Detail 템플릿 정합).

    frontmatter 6 key (id / status / created_at / source_anchor / source_path / kind)
    는 `check_appendonly_memory_layout.py` case 5 가 강제한다.
    """
    return [
        "---",
        f"id: {task_id}",
        f"status: {status}",
        f"created_at: {created_at}",
        f"source_anchor: {source_anchor}",
        f"source_path: {source_path}",
        f"kind: {kind}",
        "---",
        "",
        f"# {task_id} — {title}",
        "",
        *body_lines,
    ]


def _daily_index_entry_lines(*, task_id: str, title: str, kind: str, status: str) -> list[str]:
    """daily index 의 task 1건 link block.

    `path:` 를 markdown link 로 적는 이유: `BacklogParser._linked_task_paths` 가
    `markdown_targets()` 로 task file 을 되찾아 읽는다. 백틱만 쓰면 index 만 있고
    본문을 못 찾는 상태가 된다.
    """
    return [
        f"- **{task_id}** [{kind}] {title}",
        f"  - path: [`./tasks/{task_id}.md`](./tasks/{task_id}.md)",
        f"  - status: {status}",
    ]


def upsert_backlog_entry(
    *,
    backlog_path: Path,
    task_id: str,
    entry_lines: list[str],
    title: str = "",
    kind: str = "generic",
    status: str = "planned",
) -> str:
    """task SSOT 파일을 쓰고 daily index 에 link 를 반영한다 (v0.14.0+ layout).

    v1.0.1 이전 구현은 **절반만** 마이그레이션돼 있었다: task file 은 만들면서
    (1) 파일명이 `YYYY-MM-DD_TASK-….md` 였고 (현행 규약은 `TASK-….md`),
    (2) 모든 task 본문을 daily index 에 **통째로 인라인**했으며 (현행 index 는 link 모음),
    (3) 덮어쓰기 전에 `.md.bak` 를 남겼다 — `.bak` 는 v0.15.0 에서 폐기된 개념이다.
    그래서 stable 로 선언된 skill 이 governance 가 규정한 layout 을 만들지 못했다.

    index 는 **append-only 로 갱신**한다: 이미 있는 task block 은 제자리에서 교체하고,
    없으면 끝에 덧붙인다. 전체 재작성을 하지 않으므로 사람이 손으로 넣은 `source:`
    주석 등 다른 정보가 날아가지 않는다.
    """
    tasks_dir = backlog_path.parent / "tasks"
    tasks_dir.mkdir(parents=True, exist_ok=True)

    task_file = tasks_dir / f"{task_id}.md"
    action = "updated" if task_file.exists() else "created"
    _write_lines(task_file, entry_lines)

    entry = _daily_index_entry_lines(
        task_id=task_id, title=title or task_id, kind=kind, status=status,
    )

    if backlog_path.exists():
        lines = _read_lines(backlog_path)
        lines = _replace_scalar_value(lines, "최종 수정일", date.today().isoformat())
        lines = _upsert_index_block(lines, task_id=task_id, entry=entry)
    else:
        lines = render_daily_backlog_header(backlog_path=backlog_path) + entry

    _write_lines(backlog_path, lines)
    return action


def _upsert_index_block(lines: list[str], *, task_id: str, entry: list[str]) -> list[str]:
    """daily index 에서 `- **<task_id>**` block 을 교체하거나 끝에 덧붙인다.

    block 은 다음 `- **TASK-` 를 만나거나 `## ` heading 을 만날 때까지로 본다.
    """
    start: int | None = None
    for idx, line in enumerate(lines):
        if line.strip().startswith(f"- **{task_id}**"):
            start = idx
            break
    if start is None:
        tail = list(lines)
        while tail and not tail[-1].strip():
            tail.pop()
        return tail + entry

    end = start + 1
    while end < len(lines):
        stripped = lines[end].strip()
        if stripped.startswith("- **TASK-") or stripped.startswith("## "):
            break
        end += 1
    return lines[:start] + entry + lines[end:]


def ensure_backlog_index_entry(*, work_backlog_index_path: Path, daily_backlog_path: Path) -> bool:
    lines = _read_lines(work_backlog_index_path)
    if not lines:
        return False

    lines = _replace_scalar_value(lines, "최종 수정일", date.today().isoformat())
    link_target = rel_link_from_doc(work_backlog_index_path, daily_backlog_path)
    link_line = f"- [{daily_backlog_path.stem} 작업 백로그]({link_target})"
    existing_targets = {
        candidate.resolve()
        for candidate in (
            (work_backlog_index_path.parent / line.split("](", 1)[1][:-1]).resolve()
            for line in lines
            if line.strip().startswith("- [") and "](" in line and line.strip().endswith(")")
        )
    }

    insert_at = None
    for idx, line in enumerate(lines):
        if line.strip() == "## 날짜별 백로그 문서":
            section_start = idx + 1
            section_end = section_start
            while section_end < len(lines) and (
                lines[section_end].strip() == "" or lines[section_end].strip().startswith("- ")
            ):
                section_end += 1
            deduped_section: list[str] = []
            seen_targets: set[Path] = set()
            for line_in_section in lines[section_start:section_end]:
                stripped = line_in_section.strip()
                if not stripped.startswith("- [") or "](" not in stripped or not stripped.endswith(")"):
                    deduped_section.append(line_in_section)
                    continue
                raw_target = stripped.split("](", 1)[1][:-1]
                resolved_target = (work_backlog_index_path.parent / raw_target).resolve()
                if resolved_target in seen_targets:
                    continue
                seen_targets.add(resolved_target)
                deduped_section.append(line_in_section)
            lines = lines[:section_start] + deduped_section + lines[section_end:]
            insert_at = section_start + len(deduped_section)
            break
    if insert_at is None:
        lines.extend(["", "## 날짜별 백로그 문서", link_line])
    elif daily_backlog_path.resolve() not in existing_targets:
        lines = lines[:insert_at] + [link_line] + lines[insert_at:]
    _write_lines(work_backlog_index_path, lines)
    return daily_backlog_path.resolve() not in existing_targets


def sync_handoff_status(*, handoff_path: Path, task_label: str, status: str) -> None:
    lines = _read_lines(handoff_path)
    if not lines:
        return

    label_map = {
        "in_progress": "현재 `in_progress` 작업",
        "blocked": "현재 `blocked` 작업",
        "done": "최근 완료 작업 목록",
    }
    target_label = label_map.get(status)
    if target_label is None:
        return

    current_lists: dict[str, list[str]] = {
        "현재 `in_progress` 작업": [],
        "현재 `blocked` 작업": [],
        "최근 완료 작업 목록": [],
    }
    for section_label in current_lists:
        for idx, line in enumerate(lines):
            if line.strip() == f"- {section_label}:":
                items: list[str] = []
                pointer = idx + 1
                while pointer < len(lines):
                    stripped = lines[pointer].strip()
                    if stripped.startswith("## "):
                        break
                    if not _is_list_line(stripped):
                        break
                    # v1.0.2: 빈 bullet(`-` / `- `)에서 멈추지 않는다. 멈추면 그 아래의
                    # 실제 항목이 목록에 없는 것으로 보여 조용히 사라진다.
                    if stripped.startswith("- "):
                        value = stripped[2:].strip().strip("`")
                        if value:
                            items.append(value)
                    pointer += 1
                current_lists[section_label] = items
                break

    for section_label, items in current_lists.items():
        current_lists[section_label] = [item for item in items if item != task_label]
    current_lists[target_label].append(task_label)

    # "최근 완료" 만 상한을 적용한다 — `in_progress` / `blocked` 는 상한이 없다
    # (몇 건이든 전부 보여야 하는 사실이고, 끝나면 목록에서 빠진다).
    #
    # 이 목록은 **append-only 파생물**이다. SSOT 는 `backlog/tasks/` 이고 state.json 의
    # `recent_done_items` 도 같은 상한으로 잘린다. 여기에만 상한이 없어서 close-out 마다
    # 11번째 줄이 생겼고, `handoff_bloat` 가 그걸 잡으면 사람이 손으로 지웠다.
    # 뒤가 최신이므로 **앞(가장 오래된 것)에서 버린다** — 손으로 하던 것과 같은 조작이다.
    done_label = label_map["done"]
    if len(current_lists[done_label]) > RECENT_DONE_ITEMS_CAP:
        current_lists[done_label] = current_lists[done_label][-RECENT_DONE_ITEMS_CAP:]

    lines = _replace_scalar_value(lines, "최종 수정일", date.today().isoformat())
    for section_label, items in current_lists.items():
        lines = _replace_list_after_label(lines, section_label, items)
    _write_lines(handoff_path, lines)


def append_unique_bullets_under_heading(*, doc_path: Path, heading: str, bullets: list[str]) -> bool:
    lines = _read_lines(doc_path)
    if not lines or not bullets:
        return False

    heading_re = re.compile(rf"^##\s+(?:\d+\.\s+)?{re.escape(heading)}\s*$")
    start: int | None = None
    end: int | None = None
    for idx, line in enumerate(lines):
        if heading_re.match(line.strip()):
            start = idx + 1
            end = start
            while end < len(lines) and not lines[end].startswith("## "):
                end += 1
            break
    if start is None or end is None:
        return False

    existing = {
        line.strip()[2:].strip()
        for line in lines[start:end]
        if line.strip().startswith("- ") and line.strip()[2:].strip()
    }
    additions = [bullet for bullet in bullets if bullet not in existing]
    if not additions:
        return False

    updated = list(lines)
    insertion = [f"- {bullet}" for bullet in additions]
    updated = updated[:end] + insertion + updated[end:]
    updated = _replace_scalar_value(updated, "최종 수정일", date.today().isoformat())
    _write_lines(doc_path, updated)
    return True


def update_next_documents_section(*, doc_path: Path, links: list[str]) -> bool:
    lines = _read_lines(doc_path)
    if not lines:
        return False

    heading = "다음에 읽을 문서"
    heading_re = re.compile(rf"^##\s+(?:\d+\.\s+)?{re.escape(heading)}\s*$")
    start: int | None = None
    end: int | None = None
    for idx, line in enumerate(lines):
        if heading_re.match(line.strip()):
            start = idx + 1
            end = start
            while end < len(lines) and not lines[end].startswith("## "):
                end += 1
            break

    if start is None:
        updated = list(lines)
        if updated and updated[-1] != "":
            updated.append("")
        updated.append(f"## {heading}")
        updated.extend([f"- {link}" for link in links])
    else:
        updated = lines[:start] + [f"- {link}" for link in links] + lines[end:]

    updated = _replace_scalar_value(updated, "최종 수정일", date.today().isoformat())
    _write_lines(doc_path, updated)
    return True


def update_project_profile_commands(*, profile_path: Path, commands: dict[str, str]) -> list[str]:
    lines = _read_lines(profile_path)
    if not lines:
        return []

    updated_fields = []
    new_lines = list(lines)

    mapping = {
        "install": "설치",
        "run": "로컬 실행",
        "quick_test": "빠른 테스트",
        "isolated_test": "격리 테스트",
        "smoke_check": "실행 확인",
    }

    for key, label in mapping.items():
        new_val = commands.get(key)
        if not new_val or "TODO" in new_val:
            continue

        prefix = f"- {label}:"
        for idx, line in enumerate(new_lines):
            if line.strip().startswith(prefix):
                val_part = line.strip()[len(prefix):].strip()
                if not val_part or "TODO" in val_part:
                    new_lines[idx] = f"- {label}: `{new_val}`"
                    updated_fields.append(label)
                elif idx + 1 < len(new_lines) and new_lines[idx + 1].strip().startswith("- "):
                    next_val = new_lines[idx + 1].strip()[2:].strip()
                    if "TODO" in next_val:
                        new_lines[idx + 1] = f"  - `{new_val}`"
                        updated_fields.append(label)
                break

    if updated_fields:
        new_lines = _replace_scalar_value(new_lines, "최종 수정일", date.today().isoformat())
        _write_lines(profile_path, new_lines)

    return updated_fields
