#!/usr/bin/env python3
"""Skill for bulk-managing and cleaning up task documents (Backlog Steward)."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
SOURCE_ROOT = Path(__file__).resolve().parents[2]
if str(SOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(SOURCE_ROOT))

from workflow_kit import __version__ as TOOL_VERSION
from workflow_kit.common.schemas import BacklogUpdateOutput, Status


def clean_task_content(content: str, title: str, target_date: str) -> str:
    """Standardize the header and metadata of a task document."""
    # Remove existing headers if they match standard patterns
    header_regex = re.compile(r"^#.*?\n\n- 문서 목적:.*?\n- 범위:.*?\n- 대상 독자:.*?\n- 최종 수정일:.*?\n- 관련 문서:.*?\n\n", re.DOTALL)
    content = header_regex.sub("", content)

    # If the title is already in the content as a header, remove it to avoid double headers
    content = re.sub(rf"^(?:#|##)\s*{re.escape(title)}\s*\n", "", content)

    header = f"""# {title}

- 문서 목적: {title} 작업에 대한 진행 상태와 결과를 기록한다.
- 범위: 작업 내용, 진행 현황, 완료 기준
- 대상 독자: AI 에이전트, 개발자
- 최종 수정일: {target_date}
- 관련 문서: [../../../../work_backlog.md](../../../../work_backlog.md)

"""
    return header + content.lstrip()


def main() -> int:
    parser = argparse.ArgumentParser(description="Bulk update task documents.")
    parser.add_argument("--tasks-dir", required=True, help="Directory containing task markdown files")
    parser.add_argument("--apply", action="store_true", help="Apply changes to files")
    args = parser.parse_args()

    tasks_dir = Path(args.tasks_dir).expanduser().resolve()
    if not tasks_dir.exists() or not tasks_dir.is_dir():
        print(json.dumps({"status": "error", "error": f"Directory not found: {args.tasks_dir}"}))
        return 1

    updated_files = []
    warnings = []
    target_date = date.today().isoformat()

    for task_file in sorted(tasks_dir.glob("*.md")):
        content = task_file.read_text(encoding="utf-8")
        
        # Infer title from filename or first line
        title_match = re.search(r"(?:#|##)\s*(TASK-\d+.*)", content)
        if title_match:
            title = title_match.group(1).strip()
        else:
            title = task_file.stem.replace("_", " ").title()

        new_content = clean_task_content(content, title, target_date)
        
        if new_content != content:
            if args.apply:
                task_file.write_text(new_content, encoding="utf-8")
            updated_files.append(str(task_file))

    result = {
        "status": "ok",
        "tool_version": TOOL_VERSION,
        "summary": f"Processed {len(list(tasks_dir.glob('*.md')))} files. Updated {len(updated_files)} files.",
        "produced_artifacts": updated_files if args.apply else [],
        "apply_status": "applied" if args.apply and updated_files else "skipped",
        "warnings": warnings,
    }
    
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
