# standard-ai-workflow-kit: v1.0.0-beta

"""Pydantic models for doc-sync skill."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field
from workflow_kit.common.schemas.base import BaseOutput, Status


class DocSyncSourceContext(BaseModel):
    project_profile_path: str
    changed_files: list[str]
    change_summary: str | None = None
    session_handoff_path: str | None = None
    work_backlog_index_path: str | None = None
    latest_backlog_path: str | None = None


class DocSyncPurposeContext(BaseModel):
    """v0.9.5 chapter 9 R-A follow-up part 2: skill context load integration.

    doc-sync skill 이 PURPOSE.md + state.json.purpose_digest 를 자동 read 한 결과.
    """

    purpose_digest: str | None = None
    purpose_digest_rev: str | None = None
    purpose_path: str | None = None
    body_excerpt: str | None = None
    body_excerpt_truncated: bool = False
    body_excerpt_char_count: int = 0
    scope_included: list[str] = Field(default_factory=list)
    scope_excluded: list[str] = Field(default_factory=list)
    scope_warnings: list[str] = Field(default_factory=list)


class DocSyncOutput(BaseOutput):
    """Output contract for the doc-sync skill."""
    status: Status = Status.OK
    impacted_documents: list[str] = Field(default_factory=list)
    hub_update_candidates: list[str] = Field(default_factory=list)
    status_doc_candidates: list[str] = Field(default_factory=list)
    validation_doc_candidates: list[str] = Field(default_factory=list)
    stale_warnings: list[str] = Field(default_factory=list)
    reasoning_notes: list[str] = Field(default_factory=list)
    recommended_review_order: list[str] = Field(default_factory=list)
    follow_up_actions: list[str] = Field(default_factory=list)
    confidence_notes: list[str] = Field(default_factory=list)
    source_context: DocSyncSourceContext
    apply_status: str | None = None
    written_paths: list[str] = Field(default_factory=list)
    purpose_context: DocSyncPurposeContext | None = None
    # v0.11.22+ Phase 3c: ADR-005 memory_index retrieval hints (optional, opt-in).
    memory_index_query_output: dict[str, Any] | None = Field(
        default=None,
        description="Phase 3: query_memory_index_for_dispatcher 결과 dict. 부재 시 None (zero-risk).",
    )
