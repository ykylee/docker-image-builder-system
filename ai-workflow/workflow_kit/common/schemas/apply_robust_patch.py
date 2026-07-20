# standard-ai-workflow-kit: v0.15.19-beta

"""Pydantic schemas for apply-robust-patch MCP (v0.14.2+ 2nd batch stable).

MCP `apply-robust-patch` 의 stable output contract. skill_beta_criteria §3.1
6 condition 정합:
1. Pydantic schema (BaseOutput 상속) — 본 file.
2. stdio_sdk_registered — workflow_kit/server/read_only_registry.py 등록 확인.
3. error_code ≥ 4 종 — `APPLY_ROBUST_PATCH_ERROR_CODES` tuple.
4. single_entry — `scripts/run_apply_robust_patch.py`.
5. MCP.md 실행 예시 — `mcp_servers/apply_robust_patch/MCP.md` §3-4.
6. smoke test 5 case — `tests/check_apply_robust_patch.py`.

본 MCP 는 **쓰기 작업** (file modify) — read-only MCP 와 구분됨. smoke test 시
tmp_path 로 격리하여 side-effect 차단. dry-run mode (preview only) 가 정합의
기본 모드 권장.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from workflow_kit.common.schemas.base import BaseOutput


class AppliedPatchBlock(BaseModel):
    """Detail of a single applied SEARCH/REPLACE block."""

    block_index: int = Field(..., description="0-based index of the block within patch_content")
    matched: bool = Field(..., description="True if the SEARCH block matched in target file")
    fuzzy_score: float | None = Field(None, description="Fuzzy match score (1.0 = exact, <1.0 = fuzzy)")
    preview: str | None = Field(None, description="First 80 chars of the SEARCH block, for traceability")


class ApplyRobustPatchOutput(BaseOutput):
    """`apply-robust-patch` MCP 의 stable output contract.

    `BaseOutput` 의 status / tool_version / warnings 3 field + 본 class 의 7 field.

    본 MCP 는 **쓰기 작업**. smoke test 시 dry_run=True 권장 (side-effect 격리).
    """

    file_path: str = Field(..., description="Absolute path to the patched file")
    message: str = Field(..., description="Human-readable summary of patch application result")
    patches_applied: int = Field(default=0, description="Number of SEARCH/REPLACE blocks successfully applied")
    patches_failed: int = Field(default=0, description="Number of SEARCH blocks that didn't match (or malformed)")
    dry_run: bool = Field(default=False, description="True if applied as preview (no actual write)")
    applied_blocks: list[AppliedPatchBlock] = Field(
        default_factory=list,
        description="Per-block detail (matched/fuzzy/preview). empty list if dry_run with no blocks.",
    )

    # v0.14.2+ error envelope (success=False 시 emit, success 시 None)
    error: str | None = Field(default=None, description="Human-readable error message (None on success)")
    error_code: str | None = Field(default=None, description="4 종 stable error code (None on success)")
    source_context: dict[str, Any] | None = Field(
        default=None,
        description="Arbitrary context data to help diagnose the error (None on success)",
    )


# 4 종 error code (skill_beta_criteria §3.1 3rd condition 정합)
APPLY_ROBUST_PATCH_ERROR_CODES: tuple[str, ...] = (
    "missing_required_argument",        # --file-path or --patch-content 부재
    "file_not_found",                   # file_path 가 실제 존재 안 함
    "malformed_patch_block",            # SEARCH/REPLACE delimiter 미존재 or syntax error
    "apply_robust_patch_runtime_error", # 다른 모든 예외
)