# standard-ai-workflow-kit: v1.0.0-beta

"""Project workflow document parsers shared across skill prototypes."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from workflow_kit.common.markdown import markdown_targets
from workflow_kit.common.text import (
    extract_list_after_label,
    extract_named_section_bullets,
    extract_section_value,
    iter_lines,
    normalize_inline_code,
)

# task 의 진행 상태 어휘 — **여기가 단일 출처다**. CLAUDE.md / global_workflow_standard
# 이 선언하는 네 값이고, 아래 정규식들은 전부 이걸로 조립한다. 예전에는 같은 목록이
# `STATUS_RE` 와 `WORK_STATUS_RE` 에 각각 리터럴로 박혀 있었고, builder 는 셋 중 어느
# 것도 참조하지 않은 채 `in_progress`/`blocked`/`done` 만 비교해서 **그 밖의 값을 조용히
# 버렸다** (실측: `status: recorded` 3건이 아무 목록에도 안 들어간 뒤 daily index
# fallback 에 의해 done 으로 되살아났다).
TASK_STATUSES: tuple[str, ...] = ("planned", "in_progress", "blocked", "done")
_STATUS_ALT = "|".join(TASK_STATUSES)

# `status` 는 **진행 상태 축**이고, 여기부터는 **출처 축**이다. 둘을 한 칸에 넣으면 둘 다
# 망가진다 — `migrate_active_to_appendonly.py` 가 어휘 밖의 `recorded` 를 status 칸에
# 적고 있었는데, 그 값이 뜻한 것은 진행 상태가 아니라 "legacy work_backlog.md 에서
# 이관됐고 진행 상태는 모른다" 는 출처 사실이었다. 출처는 `provenance` 로 따로 적고,
# 진행 상태는 **판정 근거가 있을 때만** 적는다.
TASK_PROVENANCE_MIGRATED_LEGACY = "migrated-legacy"

# frontmatter 에 `status:` 줄이 아예 없을 때 `unknown_status_items` 에 붙는 표식.
# "판정하지 않았다" 와 "어휘 밖의 값을 적었다" 는 다른 사실이라 구분해서 드러낸다.
MISSING_STATUS_MARKER = "<미기재>"

# "최근 완료" 파생물의 상한 — **여기가 단일 출처다**.
#
# 이 값을 아는 자리가 셋이다: 쓰는 쪽(`sync_handoff_status` 가 handoff §4 에 append),
# 조립하는 쪽(`build_workflow_state_payload` 의 `recent_done_items`), 보는 쪽
# (`linter` 의 `handoff_bloat`). 상한이 조립 쪽에만 있어서 **쓰는 쪽은 무한히 쌓았고**,
# 보는 쪽은 리터럴 `10` 을 따로 들고 있었다. 그래서 close-out 마다 handoff 가 11이 되고
# 사람이 한 줄 지우는 수작업이 반복됐다 (2026-07-28 / 2026-07-31 연속 2회 실측).
# 상한을 아는 곳은 전부 여기를 import 한다 — 리터럴을 다시 적지 않는다.
RECENT_DONE_ITEMS_CAP = 10

# Standard Regexes
STATUS_RE = re.compile(rf"- 상태:\s*({_STATUS_ALT})\s*$")
MODE_RE = re.compile(r"- 모드:\s*(Analysis|Requirements|Design|Planning|Implementation|Refactoring)\s*$")

# 정본 task ID 패턴 — `TASK-<date>[-<branch-slug>]-<NNN>` (v1.0.0 branch-scoped).
# 브랜치 slug 는 소문자를 포함할 수 있으므로(`main`, `feature-x`) 문자집합을 대문자로
# 제한하면 안 된다. slug 없는 legacy(`TASK-2026-07-20-001`)도 같은 패턴으로 매칭된다.
# **여기가 단일 출처다** — builder / layout check / skill 이 각자 정규식을 들고 있으면
# 조용히 갈라진다 (실제로 갈라져서 slug ID 가 daily index 에서 인식되지 않았다).
TASK_ID_PATTERN = r"TASK-\d{4}-\d{2}-\d{2}(?:-[A-Za-z0-9._-]+?)?-\d{3}"
TASK_HEADER_RE = re.compile(r"^#{1,2}\s+(TASK-[A-Za-z0-9._-]+)\s+(.+)$")

# 순번 채번용 분해 정규식 — (date, branch-slug, NNN). `TASK-021` 같은 초기 legacy 도
# 받아야 하므로 `TASK_ID_PATTERN` 보다 관대하다. **문법의 정의는 여기 한 곳**이고,
# backlog-update 가 이걸 import 한다 (skill 이 자기 사본을 들고 있어서 갈라졌었다).
TASK_ID_CAPTURE_RE = re.compile(r"^TASK-(?:(\d{4}-\d{2}-\d{2})-)?(?:(.+?)-)?(\d{1,3})$")
# handoff 의 `- <ID> <제목>: <상태>` 줄에서 쓰는 **작업 항목 ID** 문법.
#
# v1.0.2 정정: 이전에는 `[A-Z0-9-]+` 라 **대문자만** 받았는데, `TASK_ID_PATTERN` 은
# branch slug 세그먼트에 `[A-Za-z0-9._-]` 를 허용한다. 그래서 `TASK-2026-07-27-main-001`
# 처럼 *정본 문법에 맞는 ID* 를 handoff 의 Work Status 줄에서 인식하지 못했다. 같은
# 규약의 두 정규식이 갈라져 있던 것이다 (§2.24 가 등록한 부류와 같은 모양).
#
# 셋의 관계: `TASK_ID_PATTERN`(정본 문법) ⊂ `WORK_ITEM_ID_PATTERN`(느슨, WF- 와 legacy
# `TASK-021` 까지) 이고, `TASK_ID_CAPTURE_RE` 는 채번용 분해다.
WORK_ITEM_ID_PATTERN = r"(?:TASK|WF)-[A-Za-z0-9._-]+"
WORK_STATUS_RE = re.compile(
    rf"^-\s+({WORK_ITEM_ID_PATTERN})\s+(.+?):\s*({_STATUS_ALT})\s*$"
)


class WorkflowDocParser:
    """Base parser for workflow markdown documents."""
    def __init__(self, path: Path):
        self.path = path
        self.lines = iter_lines(path)
        self.warnings: list[str] = []

    def get_value(self, label: str, required: bool = False) -> str | None:
        val = extract_section_value(self.lines, label)
        if val is None and required:
            self.warnings.append(f"필수 섹션 누락: `{label}` ({self.path.name})")
        return val

    def get_list(self, label: str) -> list[str]:
        return extract_list_after_label(self.lines, label)

    def get_named_bullets(self, title: str) -> list[str]:
        return extract_named_section_bullets(self.lines, title)

    def _section_lines(self, title: str) -> list[str]:
        heading = f"## {title}"
        collecting = False
        section: list[str] = []
        for line in self.lines:
            stripped = line.rstrip()
            if stripped.startswith("## "):
                if collecting:
                    break
                collecting = stripped == heading
                continue
            if collecting:
                section.append(line)
        return section


class HandoffParser(WorkflowDocParser):
    """Parser for session_handoff.md."""
    def parse(self) -> dict[str, object]:
        current_focus = self._first_bullet_or_text(self._section_lines("Current Focus"))
        work_status = self._work_status_items(self._section_lines("Work Status"))
        data = {
            "current_baseline": self.get_value("현재 기준선", required=current_focus is None) or current_focus,
            "current_axis": self.get_value("현재 주 작업 축", required=current_focus is None) or current_focus,
            "recent_core_docs": self.get_list("최근 핵심 기준 문서"),
            "in_progress_items": self.get_list("현재 `in_progress` 작업") or work_status["in_progress_items"],
            "blocked_items": self.get_list("현재 `blocked` 작업") or work_status["blocked_items"],
            "recent_done_items": self.get_list("최근 완료 작업 목록") or work_status["done_items"],
            "constraints": self.get_value("주요 제약"),
            "next_documents": [self.path.parent / target for target in markdown_targets(self.path)],
        }
        return {**data, "warnings": self.warnings}

    def _first_bullet_or_text(self, lines: list[str]) -> str | None:
        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            if stripped.startswith("- "):
                return normalize_inline_code(stripped[2:].strip())
            return normalize_inline_code(stripped)
        return None

    def _work_status_items(self, lines: list[str]) -> dict[str, list[str]]:
        items: dict[str, list[str]] = {"in_progress_items": [], "blocked_items": [], "done_items": []}
        for line in lines:
            match = WORK_STATUS_RE.match(line.strip())
            if not match:
                continue
            task_id, title, status = match.groups()
            item = f"{task_id} {title}"
            if status == "in_progress":
                items["in_progress_items"].append(item)
            elif status == "blocked":
                items["blocked_items"].append(item)
            elif status == "done":
                items["done_items"].append(item)
        return items


class BacklogParser(WorkflowDocParser):
    """Parser for daily backlog documents."""
    def parse(self) -> dict[str, object]:
        lines, warnings = self._task_lines_for_backlog()
        self.lines = lines
        self.warnings.extend(warnings)

        tasks: list[dict[str, str]] = []
        current_task: dict[str, str] | None = None

        for idx, line in enumerate(self.lines):
            stripped = line.strip()
            header_match = TASK_HEADER_RE.match(stripped)
            if header_match:
                if current_task:
                    tasks.append(current_task)
                current_task = {"task_id": header_match.group(1), "title": header_match.group(2)}
                continue

            if current_task is None:
                continue

            status_match = STATUS_RE.match(stripped)
            if status_match:
                current_task["status"] = status_match.group(1)
            elif stripped.startswith("- 상태:") and not STATUS_RE.match(stripped):
                self.warnings.append(f"잘못된 상태 형식 (L{idx+1}): `{stripped}`")

            mode_match = MODE_RE.match(stripped)
            if mode_match:
                current_task["mode"] = mode_match.group(1)

        if current_task:
            tasks.append(current_task)

        return {
            "tasks": tasks,
            "in_progress_items": [f"{task['task_id']} {task['title']}" for task in tasks if task.get("status") == "in_progress"],
            "blocked_items": [f"{task['task_id']} {task['title']}" for task in tasks if task.get("status") == "blocked"],
            "done_items": [f"{task['task_id']} {task['title']}" for task in tasks if task.get("status") == "done"],
            "warnings": self.warnings,
        }

    def parse_task_entries(self) -> list[dict[str, str | None]]:
        lines, _warnings = self._task_lines_for_backlog()
        self.lines = lines
        tasks: list[dict[str, str | None]] = []
        current_task: dict[str, str | None] | None = None
        for idx, line in enumerate(self.lines):
            stripped = line.strip()
            header_match = TASK_HEADER_RE.match(stripped)
            if header_match:
                if current_task:
                    tasks.append(current_task)
                current_task = {"task_id": header_match.group(1), "title": header_match.group(2), "status": None}
                continue
            if current_task is None:
                continue
            status_match = STATUS_RE.match(stripped)
            if status_match:
                current_task["status"] = status_match.group(1)
            mode_match = MODE_RE.match(stripped)
            if mode_match:
                current_task["mode"] = mode_match.group(1)
        if current_task:
            tasks.append(current_task)
        return tasks

    def _task_lines_for_backlog(self) -> tuple[list[str], list[str]]:
        path = self.path
        warnings: list[str] = []
        if not path.exists():
            task_files = sorted((path.parent / "tasks").glob(f"{path.stem}_*.md"))
            if not task_files:
                return [], [f"백로그 파일({path.name}) 및 태스크 파일을 찾을 수 없습니다."]
            lines: list[str] = []
            for task_file in task_files:
                lines.extend(task_file.read_text(encoding="utf-8").splitlines())
                lines.append("")
            return lines, warnings

        lines = path.read_text(encoding="utf-8").splitlines()
        linked_task_paths = self._linked_task_paths(path)
        if linked_task_paths and not any(TASK_HEADER_RE.match(line.strip()) for line in lines):
            lines = []
            for task_file in linked_task_paths:
                lines.extend(task_file.read_text(encoding="utf-8").splitlines())
                lines.append("")
        return lines, warnings

    def _linked_task_paths(self, path: Path) -> list[Path]:
        task_paths: list[Path] = []
        for target in markdown_targets(path):
            candidate = (path.parent / target).resolve()
            if candidate.exists() and candidate.parent.name == "tasks":
                task_paths.append(candidate)
        return task_paths


# Legacy Function Wrappers for Compatibility
def parse_project_profile_core(path: Path) -> dict[str, Any]:
    parser = WorkflowDocParser(path)
    data = {
        "project_name": parser.get_value("프로젝트명", required=True),
        "document_home": parser.get_value("문서 위키 홈"),
        "operations_path": parser.get_value("운영 문서 위치"),
        "backlog_path": parser.get_value("백로그 위치"),
        "handoff_path": parser.get_value("세션 인계 문서 위치"),
        "environment_path": parser.get_value("환경 기록 위치"),
    }
    return {**data, "warnings": parser.warnings}

def parse_project_profile_validation(path: Path) -> dict[str, Any]:
    parser = WorkflowDocParser(path)
    data = {
        "project_name": parser.get_value("프로젝트명"),
        "quick_tests": parser.get_value("빠른 테스트"),
        "isolated_tests": parser.get_value("격리 테스트"),
        "runtime_checks": parser.get_value("UI/API 실행 확인"),
        "validation_points": parser.get_named_bullets("4. 프로젝트 특화 검증 포인트"),
        "exception_rules": parser.get_named_bullets("5. 프로젝트 특화 예외 규칙"),
    }
    return {**data, "warnings": parser.warnings}

def parse_project_profile_session(path: Path) -> dict[str, Any]:
    parser = WorkflowDocParser(path)
    data = {
        "project_name": parser.get_value("프로젝트명", required=True),
        "document_home": parser.get_value("문서 위키 홈"),
        "operations_path": parser.get_value("운영 문서 위치"),
        "backlog_path": parser.get_value("백로그 위치"),
        "handoff_path": parser.get_value("세션 인계 문서 위치"),
        "environment_path": parser.get_value("환경 기록 위치"),
        "quick_test": parser.get_value("빠른 테스트"),
        "constraints": parser.get_value("환경 제약"),
    }
    return {**data, "warnings": parser.warnings}

def parse_project_profile_merge(path: Path) -> dict[str, Any]:
    parser = WorkflowDocParser(path)
    data = {
        "project_name": parser.get_value("프로젝트명"),
        "document_home": parser.get_value("문서 위키 홈"),
        "operations_path": parser.get_value("운영 문서 위치"),
        "backlog_path": parser.get_value("백로그 위치"),
        "handoff_path": parser.get_value("세션 인계 문서 위치"),
        "constraints": parser.get_value("환경 제약"),
        "merge_rule": parser.get_value("병합 규칙"),
    }
    return {**data, "warnings": parser.warnings}

def parse_project_profile_backlog(path: Path) -> dict[str, Any]:
    parser = WorkflowDocParser(path)
    data = {
        "project_name": parser.get_value("프로젝트명"),
        "backlog_path": parser.get_value("백로그 위치"),
        "handoff_path": parser.get_value("세션 인계 문서 위치"),
        "constraints": parser.get_value("환경 제약"),
    }
    return {**data, "warnings": parser.warnings}

def parse_handoff(path: Path) -> dict[str, object]:
    return HandoffParser(path).parse()

def parse_backlog(path: Path) -> dict[str, object]:
    return BacklogParser(path).parse()

def parse_backlog_task_entries(path: Path) -> list[dict[str, str | None]]:
    return BacklogParser(path).parse_task_entries()


def find_latest_backlog_path(index_path: Path) -> Path | None:
    linked_paths = [index_path.parent / target for target in markdown_targets(index_path)]
    if linked_paths:
        return linked_paths[-1]
    # Fallback to date search
    from workflow_kit.common.text import iter_lines
    lines = iter_lines(index_path)
    date_candidates: list[Path] = []
    for line in lines:
        stripped = line.strip()
        if re.search(r"\d{4}-\d{2}-\d{2}\.md", stripped):
            match = re.search(r"(\.?\.?/.*\d{4}-\d{2}-\d{2}\.md)", stripped)
            if match:
                date_candidates.append(index_path.parent / match.group(1))
    return date_candidates[-1] if date_candidates else None
