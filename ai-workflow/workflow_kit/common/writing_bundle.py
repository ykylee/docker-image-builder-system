# standard-ai-workflow-kit: v1.0.0-beta

from __future__ import annotations
import sys
from pathlib import Path
from typing import Any

from workflow_kit.common.paths import resolve_existing_path
from workflow_kit.common.patching import apply_robust_patch
from workflow_kit.common.schemas.base import Status
from workflow_kit.common.schemas.apply_robust_patch import (
    APPLY_ROBUST_PATCH_ERROR_CODES,
    ApplyRobustPatchOutput,
)

def apply_robust_patch_payload(
    *,
    file_path: str,
    patch_content: str,
    tool_version: str,
) -> dict[str, Any]:
    """
    Applies a Search-Replace block patch to a file using the common patching logic.

    v0.14.2+ 2nd batch stable 정합: status / error_code 4 종 / message /
    file_path / patches_applied / patches_failed / dry_run / applied_blocks 8 field
    모두 ApplyRobustPatchOutput schema 정합.

    Error code 분류:
    - file_not_found: resolve_existing_path() 가 FileNotFoundError raise
    - malformed_patch_block: SEARCH/REPLACE delimiter 부재 or syntax error
    - apply_robust_patch_runtime_error: 다른 모든 예외
    """
    # 1. file_path resolve (failure → file_not_found)
    try:
        path = resolve_existing_path(file_path)
    except FileNotFoundError:
        return ApplyRobustPatchOutput(
            status=Status.ERROR,
            tool_version=tool_version,
            file_path=file_path or "",
            message=f"file not found: {file_path!r}",
            patches_applied=0,
            patches_failed=0,
            dry_run=False,
            applied_blocks=[],
            warnings=[f"file not found: {file_path!r}"],
            error="file not found",
            error_code="file_not_found",
            source_context={"file_path": file_path},
        ).model_dump(mode="json")

    # 2. malformed_patch_block check (SEARCH/REPLACE delimiter 부재)
    if not isinstance(patch_content, str) or "SEARCH" not in patch_content or "REPLACE" not in patch_content:
        return ApplyRobustPatchOutput(
            status=Status.ERROR,
            tool_version=tool_version,
            file_path=str(path),
            message="malformed patch block: SEARCH/REPLACE delimiters missing",
            patches_applied=0,
            patches_failed=0,
            dry_run=False,
            applied_blocks=[],
            warnings=["malformed_patch_block: SEARCH/REPLACE delimiters missing"],
            error="malformed patch block",
            error_code="malformed_patch_block",
            source_context={"file_path": str(path), "patch_content_len": len(patch_content or "")},
        ).model_dump(mode="json")

    # 3. patch apply (failure → apply_robust_patch_runtime_error)
    try:
        success, message = apply_robust_patch(path, patch_content)
    except Exception as exc:  # noqa: BLE001 — top-level error envelope
        return ApplyRobustPatchOutput(
            status=Status.ERROR,
            tool_version=tool_version,
            file_path=str(path),
            message=f"runtime error: {exc}",
            patches_applied=0,
            patches_failed=0,
            dry_run=False,
            applied_blocks=[],
            warnings=[f"apply_robust_patch_runtime_error: {exc}"],
            error=str(exc),
            error_code="apply_robust_patch_runtime_error",
            source_context={"file_path": str(path), "exception_type": type(exc).__name__},
        ).model_dump(mode="json")

    # 4. ok path (or partial error with error_code="malformed_patch_block" if any block failed)
    error_code: str | None = None
    if not success:
        error_code = "malformed_patch_block"
    return ApplyRobustPatchOutput(
        status=Status.OK if success else Status.ERROR,
        tool_version=tool_version,
        file_path=str(path),
        message=message,
        patches_applied=1 if success else 0,
        patches_failed=0 if success else 1,
        dry_run=False,
        applied_blocks=[],
        warnings=[] if success else [message],
        error=None if success else message,
        error_code=error_code,
        source_context={"file_path": str(path)},
    ).model_dump(mode="json")
