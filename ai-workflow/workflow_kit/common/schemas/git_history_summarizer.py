# standard-ai-workflow-kit: v1.0.0-beta

"""Pydantic schemas for git-history-summarizer MCP (v0.14.0+ 1st batch stable).

MCP `git-history-summarizer` 의 stable output contract. skill_beta_criteria §3.1
의 6 condition 정합:
1. Pydantic schema (BaseOutput 상속) — 본 file.
2. stdio_sdk_registered — workflow_kit/server/read_only_registry.py 등록 확인.
3. error_code ≥ 4 종 — `GIT_HISTORY_SUMMARIZER_ERROR_CODES` list.
4. single_entry — `scripts/run_git_history_summarizer.py`.
5. MCP.md 실행 예시 — `mcp_servers/git-history-summarizer/MCP.md` §4.
6. smoke test 5 case — `tests/check_git_history_summarizer.py`.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from workflow_kit.common.schemas.base import BaseOutput


class GitHistorySummarizerCategories(BaseModel):
    """commit category breakdown — keyword 기반 분류 결과."""

    feature: int = Field(default=0, description="`feat` / `add` keyword 매칭")
    bug_fix: int = Field(default=0, description="`fix` / `bug` keyword 매칭")
    docs: int = Field(default=0, description="`docs` keyword 매칭")
    refactor: int = Field(default=0, description="`refactor` / `clean` keyword 매칭")
    test: int = Field(default=0, description="`test` keyword 매칭")
    chore: int = Field(default=0, description="`chore` / `config` / 기타")
    unknown: int = Field(default=0, description="keyword 미매칭 commit")


class GitHistorySummarizerOutput(BaseOutput):
    """`git-history-summarizer` MCP 의 stable output contract.

    `BaseOutput` 의 status / tool_version / warnings 3 field + 본 class 의 4 field.
    """

    summary: str = Field(..., description="Markdown 형식의 작업 요약")
    commit_count: int = Field(..., description="분석된 총 커밋 수", ge=0)
    categories: GitHistorySummarizerCategories = Field(
        default_factory=GitHistorySummarizerCategories,
        description="각 카테고리별 커밋 수 breakdown",
    )
    raw_log: list[str] = Field(
        default_factory=list,
        description="원본 commit log entries (formatted: `<msg>|<short-sha>|<author>|<date>`)",
    )


# 4 종 error code (skill_beta_criteria §3.1 3rd condition 정합 — minimum 4 codes)
GIT_HISTORY_SUMMARIZER_ERROR_CODES: tuple[str, ...] = (
    "missing_required_argument",
    "git_log_fetch_failed",
    "invalid_commit_range",
    "git_history_summarizer_runtime_error",
)