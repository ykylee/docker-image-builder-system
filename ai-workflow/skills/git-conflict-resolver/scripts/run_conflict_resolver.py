#!/usr/bin/env python3
"""Main runner for git-conflict-resolver."""

import sys
import argparse
import json
import re
from pathlib import Path

# Add core to sys.path
REPO_ROOT = Path(__file__).resolve().parents[4]
SOURCE_ROOT = REPO_ROOT / "workflow-source"
if str(SOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(SOURCE_ROOT))

from workflow_kit import __version__ as TOOL_VERSION
from workflow_kit.common.schemas.git import GitConflictResolverOutput
from workflow_kit.common.schemas.base import Status
from conflict_analyzer import ConflictAnalyzer


def resolve_ours(block):
    return block.ours


def resolve_theirs(block):
    return block.theirs


def resolve_smart(block):
    """Attempt to combine lines if they are clearly distinct list items."""
    ours_lines = block.ours.splitlines()
    theirs_lines = block.theirs.splitlines()
    
    # Check if all lines are list items
    is_list = all(re.match(r"^\s*[-*]|\d+\.", line) for line in ours_lines + theirs_lines if line.strip())
    
    if is_list:
        # Combine and unique (while preserving order if possible, but set is easier for now)
        combined = list(dict.fromkeys(ours_lines + theirs_lines))
        return "\n".join(combined)
    
    # If not a list, check if they are just unique sets of lines
    if not set(ours_lines).intersection(set(theirs_lines)):
        return "\n".join(ours_lines + theirs_lines)
    
    # Fallback: cannot resolve smart
    return None


def apply_resolution(file_path: Path, strategy: str) -> GitConflictResolverOutput:
    content = file_path.read_text(encoding="utf-8")
    analyzer = ConflictAnalyzer(content)
    conflicts = analyzer.find_conflicts()
    
    if not conflicts:
        return GitConflictResolverOutput(
            status=Status.OK,
            tool_version=TOOL_VERSION,
            conflict_count=0,
            resolved_count=0,
            resolution_summary="No conflicts found in file."
        )

    lines = content.splitlines()
    # We apply resolutions from bottom to top to avoid line shift issues
    new_lines = list(lines)
    resolved_count = 0
    unresolved = []

    for conflict in reversed(conflicts):
        if strategy == "ours":
            resolved_content = resolve_ours(conflict)
        elif strategy == "theirs":
            resolved_content = resolve_theirs(conflict)
        elif strategy == "smart":
            resolved_content = resolve_smart(conflict)
            if resolved_content is None:
                # `unresolved_conflicts` 의 선언 타입은 `list[dict[str, str]]` 이다.
                # 이전 코드는 **정의된 적 없는** `UnresolvedConflict` 모델을 import 해
                # entrypoint 가 ImportError 로 실행조차 되지 않았다 (stable 등재 상태로).
                unresolved.append({
                    "lines": f"{conflict.start_line}-{conflict.end_line}",
                    "reason": "Smart merge failed: overlapping changes or non-list content.",
                })
                continue
        else:
            unresolved.append({
                "lines": f"{conflict.start_line}-{conflict.end_line}",
                "reason": f"Unsupported strategy: {strategy}",
            })
            continue
        
        # Replace the range of lines
        # ConflictBlock end_line is 1-indexed and inclusive
        del new_lines[conflict.start_line - 1 : conflict.end_line]
        # Insert the resolved lines
        if resolved_content:
            insertion = resolved_content.splitlines()
            for i, line in enumerate(insertion):
                new_lines.insert(conflict.start_line - 1 + i, line)
        
        resolved_count += 1

    if resolved_count > 0:
        file_path.write_text("\n".join(new_lines), encoding="utf-8")

    return GitConflictResolverOutput(
        status=Status.OK if not unresolved else Status.WARNING,
        tool_version=TOOL_VERSION,
        conflict_count=len(conflicts),
        resolved_count=resolved_count,
        resolution_summary=f"Successfully resolved {resolved_count} conflicts using '{strategy}' strategy.",
        unresolved_conflicts=unresolved
    )


def main():
    parser = argparse.ArgumentParser(description="Resolve git merge conflicts.")
    parser.add_argument("--repo-path", default=".")
    parser.add_argument("--target-file", required=True)
    parser.add_argument("--strategy", choices=["ours", "theirs", "smart"], default="ours")
    parser.add_argument("--json", action="store_true")
    
    args = parser.parse_args()
    
    file_path = Path(args.repo_path) / args.target_file
    if not file_path.exists():
        print(f"Error: File {file_path} not found.", file=sys.stderr)
        sys.exit(1)
        
    result = apply_resolution(file_path, args.strategy)
    
    if args.json:
        print(result.model_dump_json(indent=2))
    else:
        print(result.resolution_summary)


if __name__ == "__main__":
    main()
