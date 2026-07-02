# standard-ai-workflow-kit: v0.11.21-beta

"""Pydantic models for project-status-assessment skill (v0.11.20 stable 2nd batch)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from workflow_kit.common.schemas.base import BaseOutput, Status


class AssessmentDirs(BaseModel):
    """Detected directory categories for the analyzed project."""
    source: list[str] = Field(default_factory=list, description="Source code directories")
    docs: list[str] = Field(default_factory=list, description="Documentation directories")
    test: list[str] = Field(default_factory=list, description="Test directories")


class AssessmentData(BaseModel):
    """Structured assessment data from analyze_repo_structure."""
    primary_stack: str = Field(..., description="Primary inferred stack (node/python/...)")
    stack_labels: list[str] = Field(default_factory=list, description="Detected stack labels")
    structure_score: int = Field(..., description="0..4 maturity score")
    dirs: AssessmentDirs
    package_scripts: dict[str, Any] = Field(default_factory=dict)


class RecommendedAction(BaseModel):
    action: str = Field(..., description="Machine-readable action identifier")
    priority: str = Field(..., description="high/medium/low")
    description: str = Field(..., description="Human-readable description")


class OrchestratorAssignment(BaseModel):
    worker: str = Field(..., description="Worker name/role")
    responsibilities: list[str] = Field(default_factory=list)


class OrchestrationPlan(BaseModel):
    orchestrator: str
    worker_assignments: list[OrchestratorAssignment] = Field(default_factory=list)
    note: str | None = None


class ProjectStatusAssessmentSourceContext(BaseModel):
    project_root: str
    apply: bool


class ProjectStatusAssessmentOutput(BaseOutput):
    """Output contract for the project-status-assessment skill.

    Replaces the legacy ``build_runner_success_result`` dict emission (v0.11.20
    stable 정합 — 다른 stable skill 들과 동일하게 BaseOutput + nested dataclass).
    """
    status: Status = Status.OK
    assessment: AssessmentData
    recommended_actions: list[RecommendedAction] = Field(default_factory=list)
    orchestration_plan: OrchestrationPlan
    runner_inputs: dict[str, Any] = Field(default_factory=dict)
    report_preview: list[str] = Field(default_factory=list)
    written_paths: list[str] = Field(default_factory=list)
    source_context: ProjectStatusAssessmentSourceContext