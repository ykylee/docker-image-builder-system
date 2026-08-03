# standard-ai-workflow-kit: v1.0.0-beta

"""Pydantic models for automated-repro-scaffold skill (v0.11.24 stable 승격).

Bug report → unittest 기반 repro script 자동 생성.
v0.11.24 cycle 에서 4-error_code + BaseOutput 정합. 기존 dict emission (status: "success") →
Pydantic Status.OK 패턴 전환. 다른 stable skill (session-start, backlog-update,
doc-sync, validation-plan, code-index-update, workflow-linter, project-status-assessment,
robust-patcher) 과 동일한 schema layer.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from workflow_kit.common.schemas.base import BaseOutput, Status


class AutomatedReproScaffoldSourceContext(BaseModel):
    """Source context for the automated-repro-scaffold skill."""
    report_path: str = Field(..., description="Path to the input bug report file")
    output_path: str = Field(..., description="Path where the generated repro script is saved")


class AutomatedReproScaffoldOutput(BaseOutput):
    """Output contract for the automated-repro-scaffold skill.

    Replaces the legacy dict emission (v0.6.5 commit 5b16517 의 `status: "success"` 패턴).
    v0.11.24 stable 정합 — 다른 stable skill 들과 동일하게 BaseOutput + nested dataclass.
    """
    status: Status = Status.OK
    repro_script_path: str = Field(..., description="Path to the generated repro script")
    repro_script_lines: int = Field(..., description="Line count of the generated repro script (sanity)")
    execution_command: str = Field(..., description="Suggested command to run the generated repro script")
    next_stage: str | None = Field(
        "validation-plan",
        description="Next workflow stage (StageCompletion 의 next_stage 필드와 정합)",
    )
    source_context: AutomatedReproScaffoldSourceContext