# standard-ai-workflow-kit: v0.11.21-beta

"""Pydantic models for session-start skill."""

from __future__ import annotations

from pydantic import BaseModel, Field
from workflow_kit.common.schemas.base import BaseOutput, Status


class SessionStartSourceDocs(BaseModel):
    session_handoff_path: str
    work_backlog_index_path: str
    project_profile_path: str


class SessionStartPurposeContext(BaseModel):
    """v0.9.5 chapter 9 R-A follow-up part 2: skill context load integration.

    session-start skill 이 PURPOSE.md + state.json.purpose_digest 를 자동 read 한 결과.
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


class SessionStartPurposeCoTTrace(BaseModel):
    """v0.11.0 chapter 11 R-A follow-up cycle 3: two-step CoT ingest trace.

    session-start skill 의 context load 시 purpose_ingest.run_two_step_cot_ingest 호출 결과.
    - step1: raw 본문 ≤800 char excerpt
    - step2: structured 4-element 요약
    - cross_ref: PURPOSE.md `[[mention]]` ↔ wiki concepts 매칭
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

    session-start / backlog-update skill 의 context load 시
    purpose_graph.run_graph_insights 호출 결과 (cycle 4 의 2차 통합).
    - coverage_pct: 0.0-100.0 (Goals ↔ deliverables 매칭률)
    - health_score: 0-100 종합 점수
    - health_tier: excellent / good / fair / poor
    - scope_creep_warnings: scope_excluded 매칭 ❌ + Goals 매핑 0 deliverable
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


class SessionStartOutput(BaseOutput):
    """Output contract for the session-start skill."""
    status: Status = Status.OK
    summary: list[str] = Field(default_factory=list)
    in_progress_items: list[str] = Field(default_factory=list)
    blocked_items: list[str] = Field(default_factory=list)
    latest_backlog_path: str | None = None
    next_documents: list[str] = Field(default_factory=list)
    recommended_next_action: str = ""
    validation_notes: list[str] = Field(default_factory=list)
    environment_constraints: list[str] = Field(default_factory=list)
    purpose_context: SessionStartPurposeContext | None = None
    purpose_cot_trace: SessionStartPurposeCoTTrace | None = None
    graph_insights: GraphInsightsOutput | None = None
    # v0.10.2: self-bootstrap mode (PURPOSE.md / state.json / handoff / backlog 모두 부재 시)
    self_bootstrap_suggested: bool = False
    self_bootstrap_init_commands: list[str] = Field(default_factory=list)

    @property
    def primary_summary(self) -> str:
        """Backwards-compatible string view of the summary list."""
        if not self.summary:
            return ""
        return self.summary[0]
