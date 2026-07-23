"""Canonical contract enum source-of-truth for the skill/MCP layer.

This package contains `apps.skill_mcp.contract.canonical`, the single
place where Python-side enums mirroring `packages/shared-contract` live.
See that module for the rationale and the rules around `LEGACY_*`
shims.
"""

from __future__ import annotations

from .canonical import (
    BUILD_PHASES,
    CANONICAL_BUILD_STATUSES,
    CANONICAL_CONTRACT_VERSION,
    CANONICAL_STAGES,
    ERROR_CODES,
    EXECUTION_STATUSES,
    LEGACY_PREVIEW_STATUSES,
    LEGACY_PREVIEW_TO_EXECUTION,
    LEGACY_SOURCE_TO_STAGE,
    NEXT_ACTIONS,
    PUBLIC_BUILD_STATUSES,
    READINESS_STATES,
    is_build_phase,
    is_canonical_build_status,
    is_error_code,
    is_execution_status,
    is_legacy_preview_status,
    is_next_action,
    is_public_build_status,
    is_readiness_state,
)

__all__ = [
    "BUILD_PHASES",
    "CANONICAL_BUILD_STATUSES",
    "CANONICAL_CONTRACT_VERSION",
    "CANONICAL_STAGES",
    "ERROR_CODES",
    "EXECUTION_STATUSES",
    "LEGACY_PREVIEW_STATUSES",
    "LEGACY_PREVIEW_TO_EXECUTION",
    "LEGACY_SOURCE_TO_STAGE",
    "NEXT_ACTIONS",
    "PUBLIC_BUILD_STATUSES",
    "READINESS_STATES",
    "is_build_phase",
    "is_canonical_build_status",
    "is_error_code",
    "is_execution_status",
    "is_legacy_preview_status",
    "is_next_action",
    "is_public_build_status",
    "is_readiness_state",
]
