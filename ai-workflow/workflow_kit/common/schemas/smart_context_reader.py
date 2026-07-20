# standard-ai-workflow-kit: v0.15.19-beta

"""Pydantic schemas for smart-context-reader MCP (v0.14.0+ 1st batch stable).

MCP `smart-context-reader` 의 stable output contract. skill_beta_criteria §3.1
6 condition 정합:
1. Pydantic schema (BaseOutput 상속) — 본 file.
2. stdio_sdk_registered — workflow_kit/server/read_only_registry.py 등록 확인.
3. error_code ≥ 4 종 — `SMART_CONTEXT_READER_ERROR_CODES` tuple.
4. single_entry — `scripts/run_smart_reader.py`.
5. MCP.md 실행 예시 — `mcp_servers/smart-context-reader/MCP.md`.
6. smoke test 5 case — `tests/check_smart_context_reader.py`.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from workflow_kit.common.schemas.base import BaseOutput


class SmartContextReaderOutput(BaseOutput):
    """`smart-context-reader` MCP 의 stable output contract.

    `BaseOutput` 의 status / tool_version / warnings 3 field + 본 class 의 3 field.
    """

    extracted_content: list[str] = Field(
        default_factory=list,
        description="심볼별로 추출된 source code block (Python AST 파싱 결과)",
    )
    not_found_symbols: list[str] = Field(
        default_factory=list,
        description="요청되었으나 file 에서 발견되지 않은 심볼 목록",
    )
    file_parse_info: dict[str, str] = Field(
        default_factory=dict,
        description="file_path 별 parse 메타데이터 (e.g., encoding, total_symbols, ast_status)",
    )


# 4 종 error code (skill_beta_criteria §3.1 3rd condition 정합)
SMART_CONTEXT_READER_ERROR_CODES: tuple[str, ...] = (
    "missing_required_argument",
    "file_not_found",
    "python_parse_failed",
    "smart_context_reader_runtime_error",
)