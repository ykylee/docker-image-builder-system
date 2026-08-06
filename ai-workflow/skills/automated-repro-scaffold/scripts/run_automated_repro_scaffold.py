#!/usr/bin/env python3
"""Automated Bug Reproduction Scaffolder — v0.11.24 stable.

v0.11.24 cycle: standard화 + BaseOutput + 4 error_code 정합.
이전 위치: workflow-source/skills/automated-repro-scaffold/automated_repro_scaffold.py
         (skill root, 비표준)
신규 위치: workflow-source/skills/automated-repro-scaffold/scripts/run_automated_repro_scaffold.py
         (skill_beta_criteria.md §3.1 '단일 실행 스크립트' 정공법)

skill_beta_criteria.md §3.1 의 stable 정합 6 조건:
  1. CLI argparse 정의 — argparse (--report / --output / --dry-run / --json)
  2. JSON 출력 schema — AutomatedReproScaffoldOutput (Pydantic v2)
  3. error_code 4종 — automated_repro_scaffold_report_file_not_found /
                       automated_repro_scaffold_output_dir_unwritable /
                       automated_repro_scaffold_template_render_failed /
                       automated_repro_scaffold_runtime_error
  4. 실행 스크립트 단일 명령 — scripts/run_automated_repro_scaffold.py
  5. SKILL.md 예시 실행 — 본 skill 의 SKILL.md 의 '예시 실행' 섹션
  6. smoke test 통과 — tests/check_automated_repro_scaffold.py (5 case)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
SOURCE_ROOT = REPO_ROOT / "workflow-source"
if str(SOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(SOURCE_ROOT))

from workflow_kit import __version__ as TOOL_VERSION
from workflow_kit.common.errors import build_error_result
# v0.6.5 stage_completion integration (runtime migration pilot)
from workflow_kit.common.contracts.stage_gate_runtime import (
    build_stage_completion, merge_into_result,
)
# v0.11.24 stable: Pydantic v2 BaseOutput 정합.
from workflow_kit.common.schemas.automated_repro_scaffold import (
    AutomatedReproScaffoldOutput,
    AutomatedReproScaffoldSourceContext,
)

# v0.6.5 spec 보강 (commit 5b16517) — Stage Name 매핑
STAGE_NAME = "automated-repro-scaffold"
NEXT_STAGE = "validation-plan"  # repro script → validation-plan 으로 진행
ARTIFACTS_TEMPLATE = ["<repro_script_path>"]  # runtime 에서 args.output 으로 채움

# v0.11.24 stable: 4종 error_code 정의. 다른 stable skill 들과 동일하게 *_runtime_error
# catch-all 1 종 + 사전 차단 3 종.
ERR_REPORT_NOT_FOUND = "automated_repro_scaffold_report_file_not_found"
ERR_OUTPUT_DIR_UNWRITABLE = "automated_repro_scaffold_output_dir_unwritable"
ERR_TEMPLATE_RENDER_FAILED = "automated_repro_scaffold_template_render_failed"
ERR_RUNTIME_ERROR = "automated_repro_scaffold_runtime_error"


# 표준 repro script template. 가벼운 unittest 기반으로, 외부 의존성 ❌.
REPRO_TEMPLATE = """#!/usr/bin/env python3
import unittest
import sys

# Bug Report Context:
# {report_excerpt}

class TestReproduction(unittest.TestCase):
    def test_reproduce_issue(self):
        \"\"\"
        This test is auto-generated to reproduce the reported issue.
        Modify this section to include the actual logic that triggers the bug.
        \"\"\"
        # TODO: Implement the actual reproduction logic based on the report
        print("\\n[INFO] Attempting to reproduce issue...")
        # v0.11.24 stable: 자동 생성 scaffold 단계. 본 test 는 reproduce logic 자리만
        # 잡아주고, *실제* reproduce logic 은 bug report 의 assertion 으로 후속.
        # scaffold 가 성공하려면 본 test 가 placeholder 상태로 통과해야 한다.
        # (scaffold 의 정합성은 '파일이 생성되고 import 가능' 으로 한정.)
        self.assertTrue(True)


if __name__ == "__main__":
    print("Running auto-generated reproduction script...")
    unittest.main()
"""


def _make_repro_script(report_content: str) -> str:
    """report_content 를 받아 repro script 본문을 return."""
    excerpt = report_content.strip().replace("#", "-")
    # 가독성: 너무 긴 report 는 첫 30 줄로 truncate.
    excerpt_lines = excerpt.splitlines()
    if len(excerpt_lines) > 30:
        excerpt = "\n".join(excerpt_lines[:30] + ["... (truncated)"])
    return REPRO_TEMPLATE.format(report_excerpt=excerpt)


def _build_output(
    *,
    repro_script_path: str,
    repro_script_lines: int,
    warnings: list[str] | None = None,
) -> AutomatedReproScaffoldOutput:
    """Pydantic v2 schema 정합의 success output builder."""
    return AutomatedReproScaffoldOutput(
        tool_version=TOOL_VERSION,
        warnings=warnings or [],
        repro_script_path=repro_script_path,
        repro_script_lines=repro_script_lines,
        execution_command=f"python3 {repro_script_path}",
        next_stage=NEXT_STAGE,
        source_context=AutomatedReproScaffoldSourceContext(
            report_path="",
            output_path=repro_script_path,
        ),
    )


def _build_error(
    *,
    error_code: str,
    error: str,
    source_context: dict[str, Any],
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    """기존 build_error_result wrapper — script 의 *기존 caller 호환* 위해 dict emission 유지.

    v0.11.24 부터 caller 가 Pydantic 모델을 직접 사용 가능. 다만 기존 caller (StageCompletion
    merge, JSON dump) 의 호환을 위해 dict emission 도 유지. 두 interface 가 동일 envelope.
    """
    return build_error_result(
        tool_version=TOOL_VERSION,
        error=error,
        error_code=error_code,
        warnings=warnings or [],
        source_context=source_context,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Automated Bug Reproduction Scaffolder (v0.11.24 stable)")
    parser.add_argument("--report", required=True, help="Path to the bug report file")
    parser.add_argument("--output", required=True, help="Path to save the generated reproduction script")
    parser.add_argument("--dry-run", dest="dry_run", action="store_true",
                        help="script 를 write 하지 않고 plan 만 출력")
    parser.add_argument("--json", dest="as_json", action="store_true",
                        help="JSON envelope (status/warnings/source_context) 강제 출력")
    args = parser.parse_args()
    source_context = {"report_path": args.report, "output_path": args.output}

    # 1. 입력 검증 — report file 존재 확인
    if not os.path.exists(args.report):
        result = _build_error(
            error_code=ERR_REPORT_NOT_FOUND,
            error=f"리포트 파일을 찾을 수 없다: {args.report}",
            source_context=source_context,
            warnings=[f"report file not found: {args.report}"],
        )
        result = merge_into_result(
            result,
            build_stage_completion(
                stage_name=STAGE_NAME,
                stage_status="error",
                artifacts=[args.output],
                next_stage=None,
                notes=[f"report file not found: {args.report}"],
            ),
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1

    # 2. report 읽기
    try:
        with open(args.report, "r", encoding="utf-8") as f:
            report_content = f.read()
    except OSError as exc:
        result = _build_error(
            error_code=ERR_RUNTIME_ERROR,
            error=f"리포트 파일 읽기 실패: {exc}",
            source_context=source_context,
            warnings=[f"report read failed: {exc}"],
        )
        result = merge_into_result(
            result,
            build_stage_completion(
                stage_name=STAGE_NAME,
                stage_status="error",
                artifacts=[args.output],
                next_stage=None,
                notes=[f"report read failed: {exc}"],
            ),
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1

    # 3. template render
    try:
        repro_script_content = _make_repro_script(report_content)
        repro_lines = repro_script_content.splitlines()
    except (KeyError, ValueError) as exc:
        result = _build_error(
            error_code=ERR_TEMPLATE_RENDER_FAILED,
            error=f"repro template render 실패: {exc}",
            source_context=source_context,
            warnings=[f"template render failed: {exc}"],
        )
        result = merge_into_result(
            result,
            build_stage_completion(
                stage_name=STAGE_NAME,
                stage_status="error",
                artifacts=[args.output],
                next_stage=None,
                notes=[f"template render failed: {exc}"],
            ),
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1

    # 4. dry-run 시 write skip
    if args.dry_run:
        result_dict: dict[str, Any] = {
            "mode": "dry-run",
            "would_write_to": args.output,
            "preview_first_500": repro_script_content[:500],
        }
        print(json.dumps(result_dict, ensure_ascii=False, indent=2))
        return 0

    # 5. 실제 write — output dir 생성
    try:
        os.makedirs(os.path.dirname(os.path.abspath(args.output)) or ".", exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(repro_script_content)
    except OSError as exc:
        result = _build_error(
            error_code=ERR_OUTPUT_DIR_UNWRITABLE,
            error=f"출력 디렉토리/파일 쓰기 실패: {exc}",
            source_context=source_context,
            warnings=[f"output write failed: {exc}"],
        )
        result = merge_into_result(
            result,
            build_stage_completion(
                stage_name=STAGE_NAME,
                stage_status="error",
                artifacts=[args.output],
                next_stage=None,
                notes=[f"output write failed: {exc}"],
            ),
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1

    # 6. 성공 envelope — Pydantic 모델 dict emission + StageCompletion merge
    output = _build_output(
        repro_script_path=args.output,
        repro_script_lines=len(repro_lines),
        warnings=["이것은 자동 생성된 scaffold 입니다. 실제 reproduce logic 은 후속 작성 필요."],
    )
    result = json.loads(output.model_dump_json())
    result["source_context"] = source_context  # report_path 포함 보강
    result = merge_into_result(
        result,
        build_stage_completion(
            stage_name=STAGE_NAME,
            stage_status="ok",
            artifacts=[args.output],
            next_stage=NEXT_STAGE,
            notes=[f"repro script generated: {args.output}"],
        ),
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())