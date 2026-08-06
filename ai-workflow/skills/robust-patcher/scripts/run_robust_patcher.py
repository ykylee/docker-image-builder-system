#!/usr/bin/env python3
"""Standardized runner for the robust-patcher skill (v0.11.21 stable 정합)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[4]
SOURCE_ROOT = REPO_ROOT / "workflow-source"
if str(SOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(SOURCE_ROOT))

from workflow_kit import __version__ as TOOL_VERSION
from workflow_kit.common.errors import build_error_result
from workflow_kit.common.patching import apply_robust_patch_detailed
from workflow_kit.common.contracts.stage_gate_runtime import (
    build_stage_completion,
    merge_into_result,
)
from workflow_kit.common.schemas.patcher import (
    AppliedPatchBlock,
    RobustPatcherOutput,
    RobustPatcherSourceContext,
)


def _to_applied_blocks(detail: list[dict[str, Any]]) -> list[AppliedPatchBlock]:
    """Convert raw per-block detail dicts to Pydantic AppliedPatchBlock instances."""
    return [
        AppliedPatchBlock(
            block_index=int(entry["block_index"]),
            matched=bool(entry["matched"]),
            fuzzy_score=(
                float(entry["fuzzy_score"])
                if entry.get("fuzzy_score") is not None
                else None
            ),
            preview=entry.get("preview") or None,
        )
        for entry in detail
    ]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Apply SEARCH/REPLACE blocks to a target file with fuzzy matching."
    )
    parser.add_argument("--file", required=True, help="Target file to patch.")
    parser.add_argument(
        "--patch-file",
        required=True,
        help="File containing <<<<<<< SEARCH / ======= / >>>>>>> REPLACE blocks.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview the patch without writing to the target file.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source_context = {
        "file": args.file,
        "patch_file": args.patch_file,
    }

    file_path = Path(args.file).expanduser().resolve()
    patch_file_path = Path(args.patch_file).expanduser().resolve()

    # v0.11.21: missing_required_document error_code (1st stable error_code 정합)
    # `--patch-file` 로 지정한 파일이 존재하지 않으면 사전 차단.
    if not patch_file_path.exists():
        result = build_error_result(
            tool_version=TOOL_VERSION,
            error="패치 파일을 찾을 수 없다.",
            error_code="missing_required_document",
            warnings=[
                f"`--patch-file` 경로를 다시 확인해야 한다: {patch_file_path}",
            ],
            source_context=source_context | {"missing_path": str(patch_file_path)},
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1

    # v0.11.21: missing_required_document error_code --file 경로 미존재
    if not file_path.exists():
        result = build_error_result(
            tool_version=TOOL_VERSION,
            error="대상 파일을 찾을 수 없다.",
            error_code="missing_required_document",
            warnings=[
                f"`--file` 경로를 다시 확인해야 한다: {file_path}",
            ],
            source_context=source_context | {"missing_path": str(file_path)},
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1

    try:
        patch_content = patch_file_path.read_text(encoding="utf-8")
        success, message, applied_detail = apply_robust_patch_detailed(
            file_path=file_path,
            patch_content=patch_content,
            dry_run=args.dry_run,
        )

        applied_blocks = _to_applied_blocks(applied_detail)

        if not success:
            # v0.11.21: fuzzy_match_failed error_code (3rd stable error_code 정합)
            # SEARCH block 이 fuzzy 0.8 threshold 못 넘기거나, patch_content 에
            # valid SEARCH/REPLACE block 자체가 없거나, .py 파일에 SyntaxError 발생 시.
            error_code = "fuzzy_match_failed"
            if "No valid SEARCH/REPLACE block" in message:
                # v0.11.21: malformed_patch_block error_code (2nd stable error_code 정합)
                error_code = "malformed_patch_block"
            elif "SyntaxError" in message:
                # patch 가 syntax 깨질 때도 fuzzy_match_failed 의 subcase
                error_code = "fuzzy_match_failed"

            result = build_error_result(
                tool_version=TOOL_VERSION,
                error=message,
                error_code=error_code,
                warnings=[message],
                source_context=source_context | {
                    "applied_blocks_count": len(applied_blocks),
                    "matched_blocks_count": sum(
                        1 for b in applied_blocks if b.matched
                    ),
                },
            )
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 1

        output_model = RobustPatcherOutput(
            tool_version=TOOL_VERSION,
            warnings=[],
            file_path=str(file_path),
            message=message,
            dry_run=bool(args.dry_run),
            applied_blocks=applied_blocks,
            syntax_validated=True,
            source_context=RobustPatcherSourceContext(
                file=args.file,
                patch_file=args.patch_file,
            ),
        )
        result = output_model.model_dump()
        result = merge_into_result(
            result,
            build_stage_completion(
                stage_name="robust-patcher",
                stage_status="ok",
                artifacts=[str(file_path)],
                next_stage="validation-plan",
                notes=[],
            ),
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    except Exception as exc:
        # v0.11.21: robust_patcher_runtime_error (4th stable error_code)
        result = build_error_result(
            tool_version=TOOL_VERSION,
            error=f"패치 적용 중 예기치 않은 오류 발생: {exc}",
            error_code="robust_patcher_runtime_error",
            warnings=[],
            source_context=source_context | {"exception_type": type(exc).__name__},
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1


if __name__ == "__main__":
    sys.exit(main())