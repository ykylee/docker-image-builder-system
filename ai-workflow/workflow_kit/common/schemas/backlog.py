# standard-ai-workflow-kit: v0.11.21-beta

"""Pydantic models for backlog-related skills."""

from __future__ import annotations

from pydantic import BaseModel, Field
from workflow_kit.common.schemas.base import BaseOutput, Status


class StatusRecommendation(BaseModel):
    value: str = Field(..., description="Recommended status value")
    reason: str = Field(..., description="Reason for the recommendation")


class BacklogUpdateSourceContext(BaseModel):
    daily_backlog_exists: bool
    existing_task_count: int
    project_profile_path: str


class BacklogUpdatePurposeContext(BaseModel):
    """v0.9.5 chapter 9 R-A follow-up part 2: skill context load integration.

    backlog-update skill 이 PURPOSE.md + state.json.purpose_digest 를 자동 read 한 결과.
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


class BacklogUpdatePurposeCoTTrace(BaseModel):
    """v0.11.0 chapter 11 R-A follow-up cycle 3: two-step CoT ingest trace.

    backlog-update skill 의 context load 시 purpose_ingest.run_two_step_cot_ingest 호출 결과.
    """

    step1_raw_excerpt: str | None = None
    step1_truncated: bool = False
    step1_char_count: int = 0
    step2_structured_summary: str | None = None
    cross_ref_matched: list[str] = Field(default_factory=list)
    cross_ref_missing: list[str] = Field(default_factory=list)
    cross_ref_warnings: list[str] = Field(default_factory=list)
    overall_warnings: list[str] = Field(default_factory=list)


class GraphInsightsOutput(BaseModel):
    """v0.11.2 chapter 13 R-A follow-up cycle 4 deferred 통합: graph insights output.

    backlog-update skill 의 context load 시 purpose_graph.run_graph_insights 호출 결과.
    - SessionStartPurposeCoTTrace 와 동일 schema (shared pattern)
    - coverage_pct + health_score + tier 정량화
    """

    coverage_pct: float = 0.0
    covered_count: int = 0
    uncovered_count: int = 0
    covered_goals: list[str] = Field(default_factory=list)
    uncovered_goals: list[str] = Field(default_factory=list)
    surprising_count: int = 0
    scope_creep_warnings: list[str] = Field(default_factory=list)
    gaps_count: int = 0
    health_score: int = 0
    health_tier: str = "unknown"
    warnings: list[str] = Field(default_factory=list)


class BacklogUpdateOutput(BaseOutput):
    """Output contract for the backlog-update skill."""
    status: Status = Status.OK
    operation_type: str = Field(..., description="Classified operation type (create_entry, update_entry, ...)")
    target_backlog_path: str = Field(..., description="Path to the updated backlog file")
    task_id: str = Field(..., description="ID of the task that was updated")
    task_found: bool = Field(False, description="Whether the requested task_id was found in the daily backlog")
    draft_entry: list[str] = Field(..., description="Generated markdown lines for the backlog entry")
    status_recommendation: StatusRecommendation = Field(..., description="Conservative status recommendation")
    fields_requiring_confirmation: list[str] = Field(default_factory=list)
    handoff_update_note: str | None = None
    index_update_note: str | None = None
    validation_note: str | None = None
    state_cache_update_note: str | None = None
    state_cache_refresh_command: str | None = None
    state_cache_status: str | None = None
    state_cache_missing_paths: list[str] = Field(default_factory=list)
    apply_status: str | None = None
    written_paths: list[str] = Field(default_factory=list)
    created_paths: list[str] = Field(default_factory=list)
    updated_paths: list[str] = Field(default_factory=list)
    source_context: BacklogUpdateSourceContext
    purpose_context: BacklogUpdatePurposeContext | None = None
    purpose_cot_trace: BacklogUpdatePurposeCoTTrace | None = None
    graph_insights: GraphInsightsOutput | None = None
    scope_creep_warnings: list[str] = Field(default_factory=list)


class CreateBacklogEntryOutput(BaseOutput):
    """Output contract for the create-backlog-entry skill."""
    status: Status = Status.OK
    draft_entry: list[str] = Field(..., description="Generated markdown lines for the backlog entry")
