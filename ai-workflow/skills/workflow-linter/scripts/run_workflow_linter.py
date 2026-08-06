#!/usr/bin/env python3
"""Runner for the workflow-linter skill, updated to use Pydantic contracts."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[4]
SOURCE_ROOT = REPO_ROOT / "workflow-source"
if str(SOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(SOURCE_ROOT))

from workflow_kit import __version__ as TOOL_VERSION
from workflow_kit.common.errors import build_error_result
from workflow_kit.common.contracts.stage_gate_runtime import build_stage_completion, merge_into_result
from workflow_kit.common.paths import project_workspace_root, resolve_existing_path, workflow_branch_dir, workflow_memory_dir, workflow_state_path
from workflow_kit.common.linter import check_workflow_consistency, check_maturity_consistency
from workflow_kit.common.metadata import load_config_with_provenance  # v0.7.15+: excluded_paths from config
from workflow_kit.common.schemas import WorkflowLinterOutput, Status


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Lint workflow documents for consistency.")
    parser.add_argument("--project-profile-path", required=True)
    parser.add_argument("--state-json-path")
    parser.add_argument("--session-handoff-path")
    parser.add_argument("--latest-backlog-path")
    parser.add_argument(
        "--config-path",
        help="[tool.workflow-doctor] 를 담은 pyproject.toml (또는 그것이 있는 디렉터리). "
             "생략하면 workspace root 의 pyproject.toml 을 묻는다. 어느 파일을 물었고 "
             "설정을 얻었는지는 출력의 source_context 에 남는다.",
    )
    parser.add_argument("--maturity", action="store_true", help="Check project maturity matrix")
    parser.add_argument(
        "--maturity-path",
        help="maturity_matrix.json 경로. 생략하면 consumer layout(`ai-workflow/core/`) → "
             "kit layout(`workflow-source/core/`) 순으로 **실재하는 것**을 고르고, "
             "고른 경로를 source_context 에 남긴다.",
    )
    parser.add_argument("--apply", action="store_true", help="Attempt to auto-fix some issues")
    return parser.parse_args()


#: `--maturity-path` 를 안 줬을 때 물어볼 후보 — **탐색이 아니라 목록이다**.
#: 순서: bootstrap 된 consumer layout, 그다음 이 kit 저장소 자신의 layout
#: (dashboard / release_pipeline 등 kit 안의 다른 도구가 전부 쓰는 위치).
MATURITY_MATRIX_CANDIDATES = (
    "ai-workflow/core/maturity_matrix.json",
    "workflow-source/core/maturity_matrix.json",
)


def resolve_maturity_matrix_path(project_root: Path, explicit: str | None) -> Path:
    """maturity_matrix.json 경로 — 명시가 있으면 그것, 없으면 실재하는 첫 후보.

    후보가 전부 없으면 첫 후보를 그대로 돌려준다. 부재는 여기서 삼키지 않고
    호출자가 `maturity_check_not_run` 으로 드러낸다 — 어디를 찾았는지 함께 적기
    위해서다.
    """
    if explicit:
        return Path(explicit).resolve()
    for candidate in MATURITY_MATRIX_CANDIDATES:
        path = (project_root / candidate).resolve()
        if path.is_file():
            return path
    return (project_root / MATURITY_MATRIX_CANDIDATES[0]).resolve()


def main() -> int:
    args = parse_args()
    
    try:
        project_profile_path = resolve_existing_path(args.project_profile_path)
        # `<root>/docs/PROJECT_PROFILE.md` 에서 `.parent.parent.parent` 는 root 가
        # 아니라 **root 의 한 단계 위**다 (docs → root → 그 위). 그 값으로
        # `load_config` 를 부르고 있었으니 `[tool.workflow-doctor]` 는 한 번도 적용된
        # 적이 없고, `--maturity` 의 matrix/roadmap 경로도 늘 빗나가 "skipped" 였다.
        # 둘 다 조용했다. 기준은 정본 helper 하나로 잡는다.
        project_root = project_workspace_root(project_profile_path)

        branch_dir = workflow_branch_dir(project_profile_path)
        
        state_json_path = (
            resolve_existing_path(args.state_json_path) if args.state_json_path
            else workflow_state_path(project_profile_path)
        )
        session_handoff_path = (
            resolve_existing_path(args.session_handoff_path) if args.session_handoff_path
            else (branch_dir / "session_handoff.md").resolve()
        )
        
        # Resolve latest backlog path
        latest_backlog_path = None
        if args.latest_backlog_path:
            latest_backlog_path = resolve_existing_path(args.latest_backlog_path)
        elif state_json_path.exists():
            try:
                state_data = json.loads(state_json_path.read_text(encoding="utf-8"))
                raw_backlog = state_data["source_of_truth"]["latest_backlog_path"]
                # **workspace root 기준**이다. builder 가 `safe_relpath(..., workspace_root)`
                # 로 적기 때문이다. 예전에는 `branch_dir` 을 기준으로 붙여서 경로가
                # 두 번 겹쳤고(`…/active/main/ai-workflow/memory/active/main/…`),
                # 그 파일이 없으니 린터가 `missing_required_document` 를 냈다.
                # 이 필드가 항상 `null` 이던 동안에는 이 줄이 실행된 적이 없다 —
                # §2.46 이 필드를 살리자 곧바로 드러났다.
                if raw_backlog:
                    candidate = (project_workspace_root(project_profile_path) / raw_backlog).resolve()
                    # 실재할 때만 채택한다. 안 그러면 아래 fallback 이 건너뛰어지고
                    # 없는 경로가 그대로 판정에 들어간다.
                    if candidate.is_file():
                        latest_backlog_path = candidate
            except Exception:
                pass

        if not latest_backlog_path:
            # Fallback: newest in backlog/
            backlog_dir = workflow_branch_dir(project_profile_path) / "backlog"
            backlog_files = sorted(backlog_dir.glob("*.md"), reverse=True)
            if backlog_files:
                latest_backlog_path = backlog_files[0]
            else:
                latest_backlog_path = (backlog_dir / "tasks").resolve() # placeholder

        # v0.7.15+: [tool.workflow-doctor] excluded_paths load → check_workflow_consistency
        # v1.0.3(§2.47): **무엇을 물었고 얻었는지를 산출물에 남긴다.** load_config 는
        # 어떤 경우에도 실패하지 않아서, 설정이 적용된 것과 조용히 기본값으로 떨어진
        # 것이 구별되지 않았다 — 그래서 잘못된 기준 경로가 오래 살아남았다.
        config, config_provenance = load_config_with_provenance(args.config_path or project_root)
        excluded_paths = config.excluded_paths

        source_context = {
            "project_profile_path": str(project_profile_path),
            "project_root": str(project_root),
            "state_json_path": str(state_json_path),
            "session_handoff_path": str(session_handoff_path),
            "latest_backlog_path": str(latest_backlog_path),
            **config_provenance.to_dict(),
        }

        # 1. Workflow Consistency (Docs)
        linter_result = check_workflow_consistency(
            state_json_path=state_json_path,
            handoff_path=session_handoff_path,
            latest_backlog_path=latest_backlog_path,
            excluded_paths=excluded_paths,
        )

        if linter_result.get("status") == "error":
             result = build_error_result(
                tool_version=TOOL_VERSION,
                error=linter_result.get("description", "Unknown linter error"),
                error_code=linter_result.get("error_code", "linter_failed"),
                warnings=linter_result.get("warnings", []),
                source_context=source_context
            )
             print(json.dumps(result, ensure_ascii=False, indent=2))
             return 1

        # 2. Maturity Consistency (Optional)
        if args.maturity:
            matrix_path = resolve_maturity_matrix_path(project_root, args.maturity_path)
            # roadmap 과 test_path 의 기준은 **matrix 가 있는 곳**이 정한다.
            # `core/maturity_matrix.json` 을 담은 디렉터리가 kit root 이고, matrix 의
            # `test_path` 는 그 root 기준의 상대 경로다 (`tests/check_*.py`).
            # 저장소 루트를 기준으로 삼으면 consumer 의 앱 테스트를 가리키게 된다.
            kit_root = matrix_path.parent.parent
            roadmap_path = matrix_path.parent / "workflow_kit_roadmap.md"
            maturity_result = check_maturity_consistency(matrix_path, roadmap_path, kit_root)
            maturity_status = str(maturity_result.get("status", "unknown"))
            source_context["maturity_status"] = maturity_status
            source_context["maturity_matrix_path"] = str(matrix_path)
            if maturity_status == "issues_found":
                linter_result["issues"].extend(maturity_result["issues"])
                linter_result["warnings"].extend(maturity_result["warnings"])
            elif maturity_status != "ok":
                # **요청한 검사가 실행되지 못한 것은 통과가 아니다.** 예전에는
                # `issues_found` 만 반영해서, matrix 를 못 찾으면(`skipped`) 아무 말 없이
                # `status: ok / total_issues: 0` 이 나왔다 — 실제로 경로가 한 단계
                # 어긋나 있어서 `--maturity` 는 한 번도 실행된 적이 없는데, 그 결과가
                # "정합 검증 통과" 로 기록돼 있었다(v0.11.17 backlog).
                linter_result["issues"].append({
                    "type": "missing_document",
                    "code": "maturity_check_not_run",
                    "description": (
                        f"--maturity 를 요청했지만 검사가 실행되지 못했다 "
                        f"(status={maturity_status}, matrix={matrix_path}): "
                        f"{maturity_result.get('reason') or maturity_result.get('description') or ''}"
                    ).strip(),
                    "severity": "high",
                    "fix_suggestion": "--maturity-path 로 실제 maturity_matrix.json 을 지정한다.",
                })
                linter_result["warnings"].extend(maturity_result.get("warnings", []))
            else:
                linter_result["warnings"].extend(maturity_result.get("warnings", []))
            # Update summary
            linter_result["summary"]["total_issues"] = len(linter_result["issues"])

        # 3. Auto-fix (Optional)
        written_paths = []
        if args.apply and linter_result["issues"]:
            # Basic auto-fix for task status mismatch in state.json
            modified_state = False
            if state_json_path.exists():
                state_data = json.loads(state_json_path.read_text(encoding="utf-8"))
                for issue in linter_result["issues"]:
                    if issue["code"] == "task_status_mismatch" and "state.json" in issue["description"]:
                        task_match = re.search(r"Task (TASK-\d+)", issue["description"])
                        if task_match:
                            task_id = task_match.group(1)
                            if "session" not in state_data: state_data["session"] = {}
                            if "in_progress_items" not in state_data["session"]: state_data["session"]["in_progress_items"] = []
                            
                            if task_id not in [t.split()[0] for t in state_data["session"]["in_progress_items"]]:
                                state_data["session"]["in_progress_items"].append(task_id)
                                modified_state = True
                
                if modified_state:
                    state_json_path.write_text(json.dumps(state_data, indent=2, ensure_ascii=False), encoding="utf-8")
                    written_paths.append(str(state_json_path))

        # Final Output
        output_model = WorkflowLinterOutput(
            status=Status.OK if not linter_result["issues"] else Status.WARNING,
            tool_version=TOOL_VERSION,
            issues=linter_result["issues"],
            warnings=linter_result["warnings"],
            summary=linter_result["summary"],
            source_context=source_context
        )
        
        result = output_model.model_dump()
        # v0.6.6 follow-up: stage_completion merge (pilot template)
        # v0.7.15 fix: result["summary"] 가 dict (linter summary) 면 str() 변환 후 [:200]
        summary_value = result.get("summary", "")
        summary_str = str(summary_value)[:200] if summary_value else ""
        result = merge_into_result(
            result,
            build_stage_completion(
                stage_name="workflow-linter",
                stage_status="ok" if result.get("status") in ("ok", "success") else "warning" if result.get("status") == "warning" else "error",
                artifacts=["(workflow_linter_report)"],
                next_stage=None,
                notes=[summary_str] if summary_str else [],
            ),
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    except Exception as exc:
        result = build_error_result(
            tool_version=TOOL_VERSION,
            error=str(exc),
            error_code="workflow_linter_runtime_error",
            warnings=[],
            source_context={"exception_type": type(exc).__name__}
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1


if __name__ == "__main__":
    sys.exit(main())
