#!/usr/bin/env python3
"""Enhanced runner for the git-conflict-resolver skill (v0.11.24 beta/stable).

v0.11.24 cycle: standard화 + 4 error_code + BaseOutput 정합.
이전 위치: workflow-source/skills/git-conflict-resolver/scripts/run_git_conflict_resolver.py (v0.6.6+
prototype). 통합 위치 변경 없음.

skill_beta_criteria.md §3.1 의 beta/stable 정합 6 조건:
  1. CLI argparse 정의 — argparse (--file action='append' / --handoff-path / --apply /
     --dry-run / --json)
  2. JSON 출력 schema — GitConflictResolverOutput (Pydantic v2, 이미 존재)
  3. error_code 4종 — git_conflict_resolver_handoff_parse_failed /
                       git_conflict_resolver_file_unreadable /
                       git_conflict_resolver_resolution_invalid /
                       git_conflict_resolver_runtime_error
  4. 실행 스크립트 단일 명령 — 본 file (이미 scripts/run_git_conflict_resolver.py)
  5. SKILL.md 예시 실행 — 본 skill 의 SKILL.md
  6. smoke test 통과 — tests/check_git_conflict_resolver_v0_11_24.py (5 case)
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[4]
SOURCE_ROOT = REPO_ROOT / "workflow-source"
if str(SOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(SOURCE_ROOT))

from workflow_kit import __version__ as TOOL_VERSION
from workflow_kit.common.project_docs import parse_handoff
from workflow_kit.common.schemas import GitConflictResolverOutput, Status, ConflictPoint, ResolutionStrategy
from workflow_kit.common.errors import build_error_result

# v0.11.24 cycle: 4종 error_code 정의.
ERR_HANDOFF_PARSE_FAILED = "git_conflict_resolver_handoff_parse_failed"
ERR_FILE_UNREADABLE = "git_conflict_resolver_file_unreadable"
ERR_RESOLUTION_INVALID = "git_conflict_resolver_resolution_invalid"
ERR_RUNTIME_ERROR = "git_conflict_resolver_runtime_error"


def find_conflicts_in_file(file_path: Path) -> list[ConflictPoint]:
    if not file_path.exists():
        return []
    try:
        content = file_path.read_text(encoding="utf-8")
    except OSError:
        return []
    pattern = re.compile(r"<<<<<<< .*?\n(.*?)\n=======\n(.*?)\n>>>>>>> .*?\n?", re.DOTALL)
    conflicts = []
    for match in pattern.finditer(content):
        ours, theirs = match.groups()
        conflicts.append(ConflictPoint(
            file_path=str(file_path),
            our_content=ours,
            their_content=theirs,
            resolution_strategy=ResolutionStrategy.MANUAL,
            resolution_note="Initial detection.",
        ))
    return conflicts


def resolve_conflict_contextually(
    conflict: ConflictPoint, context_keywords: list[str]
) -> ConflictPoint:
    """Attempt to resolve a conflict by matching content against session context keywords."""
    valid_kws = [kw for kw in context_keywords if kw]
    our_matches = any(kw.lower() in conflict.our_content.lower() for kw in valid_kws)
    their_matches = any(kw.lower() in conflict.their_content.lower() for kw in valid_kws)

    if our_matches and not their_matches:
        conflict.resolution_strategy = ResolutionStrategy.OURS
        matched_ours = [kw for kw in valid_kws if kw.lower() in conflict.our_content.lower()]
        conflict.resolution_note = f"Our change contains context keywords: {', '.join(matched_ours)}"
    elif their_matches and not our_matches:
        conflict.resolution_strategy = ResolutionStrategy.THEIRS
        matched_theirs = [kw for kw in valid_kws if kw.lower() in conflict.their_content.lower()]
        conflict.resolution_note = f"Incoming change contains context keywords: {', '.join(matched_theirs)}"
    elif our_matches and their_matches:
        conflict.resolution_strategy = ResolutionStrategy.MERGE
        conflict.resolution_note = "Both sides contain context keywords. Intelligent merge required."
    else:
        conflict.resolution_strategy = ResolutionStrategy.MANUAL
        conflict.resolution_note = "No context keywords matched. Requires manual intervention."

    return conflict


def _apply_resolution(
    conflict: ConflictPoint,
) -> tuple[bool, str]:
    """strategy 에 따라 conflict 의 resolution content 를 return.

    Returns: (success: bool, resolved_text: str)
      - (True, content): resolution 성공. content 는 *replacement* text.
      - (False, ""): MANUAL strategy — caller 가 conflict marker 유지.

    MERGE strategy: our_content + their_content 순서로 concatenation. 본 정공법은
    caller 가 검토 가능하도록 양쪽 모두 보존 (sequential merge).
    """
    if conflict.resolution_strategy == ResolutionStrategy.OURS:
        return True, conflict.our_content
    if conflict.resolution_strategy == ResolutionStrategy.THEIRS:
        return True, conflict.their_content
    if conflict.resolution_strategy == ResolutionStrategy.MERGE:
        # sequential merge: ours + newline + theirs. caller 가 review 후 조정 가능.
        return True, f"{conflict.our_content}\n{conflict.their_content}"
    # MANUAL — caller 가 conflict marker 유지
    return False, ""


def _write_resolved_file(
    src_path: Path,
    conflicts: list[ConflictPoint],
    output_dir: Path | None,
) -> tuple[Path, list[str]]:
    """src_path 의 conflict 를 resolution 으로 patch 한 뒤 write.

    Returns: (output_path, warnings: list[str])
      - output_path: 실제 write 된 file. output_dir 가 None 이면 src_path.stem + ".resolved" + suffix
        로 *원본 디렉토리* 에 작성 (in-place 아님).
      - warnings: 각 conflict 의 resolution 결과 (success / skipped).

    MANUAL strategy conflict 는 *skip* — 본 conflict marker 가 그대로 보존되어 caller 가
    후속 manual resolution 가능.
    """
    try:
        original_content = src_path.read_text(encoding="utf-8")
    except OSError:
        return src_path, ["file read failed"]

    pattern = re.compile(
        r"<<<<<<< .*?\n(.*?)\n=======\n(.*?)\n>>>>>>> .*?\n?",
        re.DOTALL,
    )

    # resolution 적용 — MANUAL strategy 인 conflict 는 그대로 보존.
    new_content_parts: list[str] = []
    last_end = 0
    skipped: list[str] = []
    resolved: list[str] = []

    # 본 함수 호출 시 conflict 들은 본 file 의 모든 conflict 와 1:1 매치 가정
    # (find_conflicts_in_file 와 동일 pattern 사용).
    matches = list(pattern.finditer(original_content))
    if len(matches) != len(conflicts):
        return src_path, [
            f"conflict count mismatch (file has {len(matches)}, "
            f"provided {len(conflicts)})"
        ]

    for match, conflict in zip(matches, conflicts):
        new_content_parts.append(original_content[last_end:match.start()])
        success, resolved_text = _apply_resolution(conflict)
        if success:
            new_content_parts.append(resolved_text)
            if not resolved_text.endswith("\n"):
                new_content_parts.append("\n")
            resolved.append(f"{conflict.resolution_strategy.value}@{conflict.file_path}")
        else:
            # MANUAL — conflict marker 그대로 보존.
            new_content_parts.append(match.group(0))
            skipped.append(f"MANUAL@{conflict.file_path}")
        last_end = match.end()

    new_content_parts.append(original_content[last_end:])
    new_content = "".join(new_content_parts)

    # output path 결정 — in-place write 는 *방지* (정공법). 항상 별도 file.
    if output_dir is None:
        out_dir = src_path.parent
        out_name = f"{src_path.stem}.resolved{src_path.suffix}"
    else:
        out_dir = output_dir
        out_name = src_path.name
    out_path = out_dir / out_name

    # Atomic write — .tmp → rename. POSIX os.replace 보장.
    try:
        out_dir.mkdir(parents=True, exist_ok=True)
        tmp_path = out_path.with_suffix(out_path.suffix + ".tmp")
        tmp_path.write_text(new_content, encoding="utf-8")
        tmp_path.replace(out_path)
    except OSError as exc:
        return src_path, [f"write failed: {exc}"]

    warnings: list[str] = []
    if resolved:
        warnings.append(f"resolved ({len(resolved)}): {'; '.join(resolved)}")
    if skipped:
        warnings.append(f"skipped ({len(skipped)} MANUAL): {'; '.join(skipped)}")
    return out_path, warnings


def _parse_handoff_safely(handoff_path: Path) -> list[str]:
    """parse_handoff 결과를 *예외 안전* 으로 keyword list 로 변환.

    v0.11.24 cycle 의 4 error_code 중 ERR_HANDOFF_PARSE_FAILED 분기.
    """
    try:
        handoff_data = parse_handoff(handoff_path)
    except Exception as exc:
        raise RuntimeError(f"{type(exc).__name__}: {exc}") from exc

    keywords: list[str] = []
    axis = handoff_data.get("current_axis", "")
    if axis:
        keywords.extend(str(axis).split())
    for item in handoff_data.get("in_progress_items", []):
        clean_item = re.sub(r"TASK-\d+", "", str(item)).strip()
        keywords.extend(clean_item.split())
    return [kw for kw in keywords if kw]


def _make_output(
    *,
    conflicts: list[ConflictPoint],
    resolved_count: int,
    source_context: dict[str, Any],
    warnings: list[str] | None = None,
) -> GitConflictResolverOutput:
    return GitConflictResolverOutput(
        status=Status.OK,
        tool_version=TOOL_VERSION,
        conflict_count=len(conflicts),
        resolved_count=resolved_count,
        resolution_summary=(
            f"Processed {len(conflicts)} conflicts. "
            f"Automatically resolved {resolved_count} based on handoff context."
        ),
        conflicts=conflicts,
        source_context={k: str(v) for k, v in source_context.items()},
        warnings=warnings or [],
    )


def _build_error(
    *,
    error_code: str,
    error: str,
    source_context: dict[str, Any],
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    return build_error_result(
        tool_version=TOOL_VERSION,
        error=error,
        error_code=error_code,
        warnings=warnings or [],
        source_context=source_context,
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enhanced git merge conflict resolver (v0.11.24 beta/stable)"
    )
    parser.add_argument(
        "--file", action="append", dest="files",
        help="Files to check for conflicts (multiple allowed)",
    )
    parser.add_argument(
        "--handoff-path",
        help="Path to session_handoff.md for context keywords",
    )
    parser.add_argument(
        "--apply", action="store_true",
        help="Apply resolutions to *separate* output files (default: src_path.stem.resolved suffix; "
             "override with --output-dir). MANUAL strategy conflict 는 그대로 보존. "
             "v0.11.24+: in-place write ❌ (정공법 — caller 가 명시적 diff/review 후 in-place 가능).",
    )
    parser.add_argument(
        "--output-dir", dest="output_dir", default=None,
        help="--apply 시 resolved file 의 output directory. 미지정 시 src_path 의 "
             "parent 디렉토리에 *.resolved suffix 로 작성.",
    )
    parser.add_argument(
        "--dry-run", dest="dry_run", action="store_true",
        help="plan 만 출력 (write 안 함)",
    )
    args = parser.parse_args()

    if not args.files:
        print(
            json.dumps(
                {
                    "status": "error",
                    "error": "--file at least one required",
                    "error_code": "git_conflict_resolver_file_unreadable",
                    "warnings": ["no --file argument provided"],
                    "source_context": {"files": "None", "handoff_path": str(args.handoff_path) or "N/A"},
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 1

    source_context = {
        "files": str(args.files),
        "handoff_path": str(args.handoff_path) if args.handoff_path else "N/A",
    }

    # 1. Extract context keywords from handoff (예외 안전)
    context_keywords: list[str] = []
    warnings: list[str] = []
    if args.handoff_path:
        handoff_path = Path(args.handoff_path).resolve()
        if not handoff_path.exists():
            warnings.append(f"handoff file not found: {handoff_path}")
        else:
            try:
                context_keywords = _parse_handoff_safely(handoff_path)
            except RuntimeError as exc:
                result = _build_error(
                    error_code=ERR_HANDOFF_PARSE_FAILED,
                    error=f"handoff parse 실패: {exc}",
                    source_context=source_context,
                    warnings=[f"handoff parse failed: {exc}"],
                )
                print(json.dumps(result, ensure_ascii=False, indent=2))
                return 1
    else:
        warnings.append("--handoff-path 미지정 — context-aware resolution skip")

    # 2. Find and resolve conflicts (per-file grouping)
    file_conflicts: dict[Path, list[ConflictPoint]] = {}
    all_conflicts: list[ConflictPoint] = []
    read_failures: list[str] = []
    for f in args.files:
        file_path = Path(f).resolve()
        try:
            conflicts = find_conflicts_in_file(file_path)
        except OSError as exc:
            read_failures.append(f"{f}: {exc}")
            continue
        for c in conflicts:
            try:
                resolved_c = resolve_conflict_contextually(c, context_keywords)
            except ValueError as exc:
                # resolution invalid — manual fallback
                c.resolution_strategy = ResolutionStrategy.MANUAL
                c.resolution_note = f"resolution failed: {exc}"
                read_failures.append(f"{f}: resolution invalid: {exc}")
                continue
            file_conflicts.setdefault(file_path, []).append(resolved_c)
            all_conflicts.append(resolved_c)

    if read_failures:
        warnings.extend(read_failures)

    resolved_count = len(
        [c for c in all_conflicts if c.resolution_strategy != ResolutionStrategy.MANUAL]
    )

    # 3. 결과 envelope (success path)
    output = _make_output(
        conflicts=all_conflicts,
        resolved_count=resolved_count,
        source_context={**source_context, "context_keywords": context_keywords},
        warnings=warnings,
    )
    result_dict = json.loads(output.model_dump_json())

    # 4. dry-run 이면 출력만, write 안 함
    if args.dry_run:
        print(json.dumps({"mode": "dry-run", **result_dict}, ensure_ascii=False, indent=2))
        return 0

    # 5. --apply 면 conflict 가 있는 file 들을 resolved file 로 write
    #    (per-file, in-place ❌). MANUAL conflict 는 skip.
    if args.apply:
        output_dir = Path(args.output_dir).resolve() if args.output_dir else None
        applied: list[dict[str, str]] = []
        for file_path, file_confls in file_conflicts.items():
            out_path, write_warnings = _write_resolved_file(
                file_path, file_confls, output_dir
            )
            applied.append({
                "source": str(file_path),
                "output": str(out_path),
            })
            for w in write_warnings:
                warnings.append(f"{file_path.name}: {w}")
        result_dict["applied_outputs"] = applied
        result_dict["warnings"] = warnings

    print(json.dumps(result_dict, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())