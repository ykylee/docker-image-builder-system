"""failure-summary core (v2 — canonical contract aligned).

`summarize(input_data)` 가 P1 skill `failure-summary-shaper` 의 `shape()` 를
호출해 4-구조 한국어 사용자 메시지로 변환한다. thin wrapper.

TASK-061 contract rename:
- 출력 envelope 의 `source` (호출자 입력 build/test) → `stage`
  (canonical BUILD/TEST/DEPLOY/DELIVERY). skill 이 canonical stage
  을 emit 하므로 MCP 도 그대로 통과시킨다.
- MCP_VERSION v1 → v2.

자세한 동작 규칙은 같은 디렉터리의 MCP.md §3 을 따른다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from apps.skill_mcp.skills.failure_summary_shaper import shape as skill_shape

MCP_VERSION = "v2"


@dataclass
class FailureSummaryResult:
    """summarize() 의 반환값."""

    ok: bool
    summary: str = ""
    cause: str = ""
    next_step: str = ""
    build_id: str | None = None
    logs_excerpt: str | None = None
    next_action: str | None = None
    stage: str | None = None
    error_code: str | None = None
    warnings: list[dict[str, str]] = field(default_factory=list)
    errors: list[dict[str, str]] = field(default_factory=list)
    mcp_version: str = MCP_VERSION

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "summary": self.summary,
            "cause": self.cause,
            "next_step": self.next_step,
            "buildId": self.build_id,
            "logs_excerpt": self.logs_excerpt,
            "next_action": self.next_action,
            "stage": self.stage,
            "error_code": self.error_code,
            "warnings": list(self.warnings),
            "errors": list(self.errors),
            "ref": {
                "design_doc": "docs/sdlc/design/06-user-messaging-and-failure-handling.md",
                "skill_doc": "apps/skill_mcp/skills/failure_summary_shaper/SKILL.md",
                "mcp_version": self.mcp_version,
            },
        }


def summarize(input_data: Any) -> FailureSummaryResult:
    """failure-summary MCP. dry-run + live 모두 지원.

    `dryRun=true` + `fixture` 가 dict 면 fixture 가 shape() 입력으로 사용.
    그 외에는 입력 dict 그대로 shape() 로 전달.
    """
    warnings: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []

    if not isinstance(input_data, dict):
        return FailureSummaryResult(
            ok=False,
            errors=[{"code": "INVALID_INPUT", "field": "<root>",
                     "message": "input must be a JSON object"}],
        )

    # dryRun 분기
    dry_run = bool(input_data.get("dryRun"))
    fixture = input_data.get("fixture")

    if dry_run:
        if not isinstance(fixture, dict):
            return FailureSummaryResult(
                ok=False,
                errors=[{"code": "INVALID_INPUT", "field": "fixture",
                         "message": "fixture must be a dict when dryRun is true"}],
            )
        shape_input: Any = dict(fixture)
    else:
        # buildServerUrl 이 들어와도 무시 (본 MCP 는 호출 안 함). warning 으로 알려만 줌.
        if "buildServerUrl" in input_data:
            warnings.append({
                "code": "UNUSED_FIELD",
                "field": "buildServerUrl",
                "message": "failure-summary MCP does not perform live API calls; "
                            "buildServerUrl is ignored",
            })
        shape_input = {k: v for k, v in input_data.items() if k not in ("dryRun", "fixture", "buildServerUrl")}

    skill_result = skill_shape(shape_input)

    # warnings/errors 전달 (failure-summary-shaper 의 것을 그대로 노출)
    # stage 가 canonical union 의 한 값인지 가볍게 검증 (skill 이 이미 검증하지만,
    # MCP 표면에서 한 번 더 보고).
    from apps.skill_mcp.contract import canonical as C
    stage_value = skill_result.stage
    if isinstance(stage_value, str) and stage_value not in C.CANONICAL_BUILD_STATUSES and stage_value not in {"BUILD", "TEST", "DEPLOY", "DELIVERY"}:
        warnings.append({
            "code": "UNKNOWN_ENUM",
            "field": "stage",
            "message": f"unexpected stage from skill: {stage_value!r}",
        })

    return FailureSummaryResult(
        ok=skill_result.ok,
        summary=skill_result.summary,
        cause=skill_result.cause,
        next_step=skill_result.next_step,
        build_id=skill_result.build_id,
        logs_excerpt=skill_result.logs_excerpt,
        next_action=skill_result.next_action,
        stage=skill_result.stage,
        error_code=skill_result.error_code,
        warnings=list(skill_result.warnings) + warnings,
        errors=list(skill_result.errors) + errors,
    )
