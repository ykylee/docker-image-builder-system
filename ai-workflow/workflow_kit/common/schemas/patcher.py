# standard-ai-workflow-kit: v0.15.19-beta

"""Pydantic models for robust-patcher skill (v0.11.21 stable 승격)."""

from __future__ import annotations

from pydantic import BaseModel, Field

from workflow_kit.common.schemas.base import BaseOutput, Status


class RobustPatcherSourceContext(BaseModel):
    """Source context for the robust-patcher skill."""
    file: str = Field(..., description="Target file to patch")
    patch_file: str = Field(..., description="Patch file containing SEARCH/REPLACE blocks")


class AppliedPatchBlock(BaseModel):
    """Detail of a single applied SEARCH/REPLACE block."""
    block_index: int = Field(..., description="0-based index of the block within the patch file")
    matched: bool = Field(..., description="Whether the SEARCH block matched in the target file")
    fuzzy_score: float | None = Field(None, description="Fuzzy match score (1.0 = exact, <1.0 = fuzzy)")
    preview: str | None = Field(None, description="First 80 chars of the SEARCH block, for traceability")


class RobustPatcherOutput(BaseOutput):
    """Output contract for the robust-patcher skill.

    Replaces the legacy dict emission (v0.11.21 stable 정합 — 다른 stable skill
    들과 동일하게 BaseOutput + nested dataclass).
    """
    status: Status = Status.OK
    file_path: str = Field(..., description="Absolute path to the patched file")
    message: str = Field(..., description="Human-readable summary of patch application result")
    dry_run: bool = Field(False, description="True if the patch was applied as a preview (no write)")
    applied_blocks: list[AppliedPatchBlock] = Field(
        default_factory=list,
        description="Per-block detail (matched/fuzzy/preview).",
    )
    syntax_validated: bool = Field(
        True,
        description="False if post-patch Python syntax check failed (and the patch was rolled back).",
    )
    source_context: RobustPatcherSourceContext