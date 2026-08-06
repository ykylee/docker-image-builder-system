#!/usr/bin/env python3
"""Runner for the project-status-assessment skill (v0.11.20 stable 2nd batch)."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[4]
SOURCE_ROOT = REPO_ROOT / "workflow-source"
if str(SOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(SOURCE_ROOT))

from workflow_kit import __version__ as TOOL_VERSION
from workflow_kit.common.errors import build_error_result
from workflow_kit.common.contracts.stage_gate_runtime import build_stage_completion, merge_into_result
from workflow_kit.common.paths import resolve_existing_path
from workflow_kit.common.exploration import analyze_repo_structure, guess_run_command
from workflow_kit.common.schemas.assessment import (
    ProjectStatusAssessmentOutput,
    AssessmentData,
    AssessmentDirs,
    RecommendedAction,
    OrchestrationPlan,
    OrchestratorAssignment,
    ProjectStatusAssessmentSourceContext,
)
from workflow_kit.common.runner import (
    build_runner_success_result,
    build_top_level_step_error_result,
    WorkflowStepError,
)

def build_assessment_report(root: Path, data: dict[str, Any]) -> list[str]:
    primary_stack = data["primary_stack"]
    package_scripts = data["package_scripts"]

    # Infer commands
    if primary_stack == "node":
        install_cmd = "npm install"
        run_cmd = guess_run_command(root, package_scripts)
        test_cmd = "npm test" if "test" in package_scripts else "TODO: 빠른 테스트 명령 입력"
    elif primary_stack == "python":
        install_cmd = "pip install -r requirements.txt" if (root / "requirements.txt").exists() else "pip install -e ."
        run_cmd = guess_run_command(root, package_scripts)
        test_cmd = "pytest" if data["test_dirs"] else "TODO: 빠른 테스트 명령 입력"
    else:
        install_cmd = "TODO"
        run_cmd = "TODO"
        test_cmd = "TODO"

    lines = [
        "# Repository Assessment",
        "",
        "- 문서 목적: 프로젝트의 현재 상태와 워크플로우 도입 성숙도를 진단한다.",
        f"- 진단일: {date.today().isoformat()}",
        "",
        "## 1. 기본 정보",
        "",
        f"- 분석 대상 프로젝트: `{root.name}`",
        "- 분석 모드: `existing_codebase`",
        f"- 추정 기본 스택: `{primary_stack}`",
        f"- 감지된 스택 라벨: `{', '.join(data['stack_labels']) or '없음'}`",
        "",
        "## 2. 추정 핵심 명령",
        "",
        f"- 설치: `{install_cmd}`",
        f"- 로컬 실행: `{run_cmd}`",
        f"- 빠른 테스트: `{test_cmd}`",
        "- 격리 테스트: `TODO` ",
        "- 실행 확인: `TODO` ",
        "",
        "## 3. 디렉터리 구조 분석",
        "",
        f"- 상위 디렉터리 항목: `{', '.join(data['top_level_entries'][:10])}`",
        f"- 소스 디렉터리 후보: `{', '.join(data['source_dirs']) or '없음'}`",
        f"- 문서 디렉터리 후보: `{', '.join(data['docs_dirs']) or '없음'}`",
        f"- 테스트 디렉터리 후보: `{', '.join(data['test_dirs']) or '없음'}`",
        "",
        "## 4. 진단 결과 및 권고",
        "",
    ]

    # Scoring logic (simplified)
    score = 0
    if data["docs_dirs"]: score += 1
    if data["test_dirs"]: score += 1
    if data["source_dirs"]: score += 1
    if data["stack_labels"]: score += 1

    lines.append(f"- 구조 성숙도 점수: `{score}/4`")

    if score < 2:
        lines.append("- 권고: 기본 디렉토리 구조(src, tests, docs) 보강이 필요함.")
    elif score < 4:
        lines.append("- 권고: 워크플로우 도입을 위해 테스트 코드 확충 및 문서화 표준 정립 권장.")
    else:
        lines.append("- 권고: 현재 구조에서 워크플로우 즉시 도입 가능.")

    return lines, score

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyze repository status and maturity.")
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--output-path")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--json", action="store_true")
    return parser.parse_args()

def main() -> int:
    args = parse_args()
    root = Path(args.project_root).resolve()

    source_context = {
        "project_root": str(root),
        "apply": args.apply,
    }

    # v0.11.20: missing_required_document error_code (2nd stable error_code 정합)
    # `--project-root` 로 지정한 경로가 존재하지 않으면 사전 차단.
    # 기존 코드는 analyze_repo_structure 단계에서 FileNotFoundError 등이
    # project_assessment_runtime_error 로 떨어졌음 → 명시적 분류.
    if not root.exists():
        result = build_error_result(
            tool_version=TOOL_VERSION,
            error=f"project_root 가 존재하지 않는다: {root}",
            error_code="missing_required_document",
            warnings=[
                "--project-root 경로를 다시 확인해야 한다.",
                f"지정된 경로: {root}",
            ],
            source_context=source_context,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1

    try:
        data = analyze_repo_structure(root, ignore_dirs={"ai-workflow"})
        report_lines, score = build_assessment_report(root, data)
        report_content = "\n".join(report_lines)

        written_paths = []
        if args.apply:
            output_path = Path(args.output_path).resolve() if args.output_path else root / "ai-workflow/memory/active/repository_assessment.md"
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(report_content, encoding="utf-8")
            written_paths.append(str(output_path))

        if args.json:
            # Categorize recommended actions for JSON consumers
            recommended_actions: list[RecommendedAction] = []
            if score < 2:
                recommended_actions.append(RecommendedAction(
                    action="structure_refactoring",
                    priority="high",
                    description="기본 디렉토리 구조(src, tests, docs) 보강 필요",
                ))
            elif score < 4:
                recommended_actions.append(RecommendedAction(
                    action="test_and_doc_bolstering",
                    priority="medium",
                    description="테스트 코드 확충 및 문서화 표준 정립 권장",
                ))
            else:
                recommended_actions.append(RecommendedAction(
                    action="immediate_adoption",
                    priority="low",
                    description="현재 구조에서 워크플로우 즉시 도입 가능",
                ))

            # v0.11.20: Pydantic schema 정합 (ProjectStatusAssessmentOutput).
            # 기존 build_runner_success_result + extra_fields dict emission 은
            # 다른 stable skill 의 Pydantic BaseOutput 패턴과 비대칭. v0.11.20
            # 부터 동일하게 output_model.model_dump() + validate_output_payload.
            orchestration_plan = OrchestrationPlan(
                orchestrator="main",
                worker_assignments=[
                    OrchestratorAssignment(
                        worker="assessment-specialist",
                        responsibilities=["저장소 구조 분석", "기술 스택 판별", "명령어 추정"],
                    )
                ],
                note="진단된 명령어와 구조를 기반으로 프로젝트 프로파일 초안을 구성할 수 있다.",
            )

            output_model = ProjectStatusAssessmentOutput(
                tool_version=TOOL_VERSION,
                warnings=list(data.get("warnings", [])),
                assessment=AssessmentData(
                    primary_stack=data["primary_stack"],
                    stack_labels=list(data.get("stack_labels", [])),
                    structure_score=score,
                    dirs=AssessmentDirs(
                        source=list(data.get("source_dirs", [])),
                        docs=list(data.get("docs_dirs", [])),
                        test=list(data.get("test_dirs", [])),
                    ),
                    package_scripts=dict(data.get("package_scripts", {})),
                ),
                recommended_actions=recommended_actions,
                orchestration_plan=orchestration_plan,
                runner_inputs={
                    "project_root": str(root),
                    "apply_mode": args.apply,
                },
                report_preview=report_lines[:15],
                written_paths=written_paths,
                source_context=ProjectStatusAssessmentSourceContext(
                    project_root=str(root),
                    apply=bool(args.apply),
                ),
            )
            result = output_model.model_dump()
            result = merge_into_result(
                result,
                build_stage_completion(
                    stage_name="project-status-assessment",
                    stage_status="ok",
                    artifacts=["(project_status_report)"],
                    next_stage=None,
                    notes=[],
                ),
            )
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            print(report_content)
            if written_paths:
                print(f"\n✅ Assessment report written to: {written_paths[0]}")

        return 0

    except Exception as exc:
        error_result = build_error_result(
            tool_version=TOOL_VERSION,
            error=str(exc),
            error_code="project_assessment_runtime_error",
            warnings=[],
            source_context=source_context
        )
        print(json.dumps(error_result, ensure_ascii=False, indent=2))
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
