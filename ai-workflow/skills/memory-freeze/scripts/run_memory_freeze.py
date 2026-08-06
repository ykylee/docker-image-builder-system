#!/usr/bin/env python3
"""Memory freeze: copy active/ state to archive/YYYY-MM-DD/ with .frozen marker.

R8 (Memory Raw Freeze) implementation.
See SKILL.md for protocol details.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import date
from pathlib import Path

SOURCE_ROOT = Path(__file__).resolve().parents[3]
if str(SOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(SOURCE_ROOT))

from workflow_kit.common.contracts.stage_gate_runtime import (  # noqa: E402
    build_stage_completion,
    merge_into_result,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Freeze active/ state to archive/")
    parser.add_argument("--active-root", default="ai-workflow/memory/active/",
                        help="Path to the active mutable state directory")
    parser.add_argument("--archive-root", default="ai-workflow/memory/archive/",
                        help="Path to the archive root directory")
    parser.add_argument("--freeze-date", default=date.today().isoformat(),
                        help="Freeze date (YYYY-MM-DD)")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_root = Path.cwd()
    active_dir = (repo_root / args.active_root).resolve()
    archive_root = (repo_root / args.archive_root).resolve()
    freeze_date = args.freeze_date
    archive_dir = archive_root / freeze_date

    # Validate active dir
    if not active_dir.is_dir():
        payload = {
            "status": "error",
            "error": f"Active directory not found: {active_dir}",
            "error_code": "ACTIVE_DIR_MISSING",
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 1

    # Skip if already frozen (immutability)
    frozen_marker = archive_dir / ".frozen"
    if frozen_marker.exists():
        payload = {
            "status": "skipped",
            "archive_path": str(archive_dir),
            "reason": f"Already frozen on {freeze_date}",
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    # Collect files to freeze — **recursive**.
    # 이전 구현은 `active_dir.iterdir()` 로 최상위만 훑어서 `active/<branch>/` 하위의
    # state.json / sessions / backlog 가 통째로 빠졌다. MEMORY_GOVERNANCE §4 는
    # "active/ 내 모든 .md/.json/.template" 을 freeze 내용으로 규정하고,
    # check_memory_freeze_lint 도 "R8 freeze 가 recursive copy 함" 을 전제한다.
    # branch-scoped / append-only layout 도입 전의 구현이 남아 있던 것.
    FREEZE_SUFFIXES = (".md", ".json", ".toml", ".txt", ".yaml", ".yml")
    frozen_files: list[str] = []
    for item in sorted(active_dir.rglob("*")):
        if not item.is_file():
            continue
        if item.suffix in FREEZE_SUFFIXES or item.name.endswith(".template"):
            frozen_files.append(str(item.relative_to(active_dir)))

    if not frozen_files:
        payload = {
            "status": "error",
            "error": f"No freezeable files in {active_dir}",
            "error_code": "NO_FILES",
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 1

    # Create archive dir and copy files.
    # copy 실패는 **부분 freeze** 를 남긴다 — archive 는 R9 immutable 이므로 반쪽짜리
    # 스냅샷이 그대로 굳으면 이후 ingest 의 출처가 오염된다. 실패 시 방금 만든
    # archive_dir 을 지워 "성공 아니면 없음" 을 보장한다.
    archive_dir.mkdir(parents=True, exist_ok=True)
    try:
        for rel in frozen_files:
            src = active_dir / rel
            dst = archive_dir / rel
            dst.parent.mkdir(parents=True, exist_ok=True)  # 하위 디렉터리 보존
            shutil.copy2(src, dst)
    except OSError as exc:
        shutil.rmtree(archive_dir, ignore_errors=True)
        payload = {
            "status": "error",
            "error": f"Archive write failed: {exc}",
            "error_code": "ARCHIVE_WRITE_FAILED",
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 1

    # Write .frozen marker
    frozen_meta = {
        "frozen_at": freeze_date,
        "source": str(active_dir),
        "files": frozen_files,
    }
    frozen_marker.write_text(
        "frozen_at: {frozen_at}\nsource: {source}\nfiles:\n{files}".format(
            frozen_at=frozen_meta["frozen_at"],
            source=frozen_meta["source"],
            files="\n".join(f"  - {f}" for f in frozen_meta["files"]),
        ),
        encoding="utf-8",
    )

    payload = {
        "status": "success",
        "archive_path": str(archive_dir),
        "frozen_files": frozen_files,
        "file_count": len(frozen_files),
    }
    # v0.6.6 follow-up: stage_completion merge.
    # 이전 코드는 template 이 skill 이름을 그대로 식별자에 넣어
    # `memory-freeze_completion = ...` 을 만들었다 — hyphen 때문에 **문법 오류**이고,
    # 들여쓰기도 어긋났으며, 존재하지 않는 `result` 를 참조했다. 즉 v0.6.6 이후
    # 본 스킬은 한 번도 실행된 적이 없다 (R8 freeze 가 수행되지 않은 원인).
    stage_completion = build_stage_completion(
        stage_name="memory-freeze",
        stage_status="ok",
        artifacts=[str(archive_dir)],
        next_stage=None,
        notes=[f"{len(frozen_files)} file frozen to {freeze_date}"],
    )
    payload = merge_into_result(payload, stage_completion)
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
