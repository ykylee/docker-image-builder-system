# standard-ai-workflow-kit: v0.11.21-beta

#!/usr/bin/env python3
"""Prototype runner for the doc-sync skill."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[4]
SOURCE_ROOT = REPO_ROOT / "workflow-source"
if str(SOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(SOURCE_ROOT))

from workflow_kit import __version__ as TOOL_VERSION
from workflow_kit.common.doc_sync import build_doc_sync_candidates
from workflow_kit.common.errors import build_error_result
from workflow_kit.common.contracts.stage_gate_runtime import build_stage_completion, merge_into_result
from workflow_kit.common.markdown import rel_link_from_doc
from workflow_kit.common.paths import project_workspace_root, resolve_existing_path, workflow_memory_dir
from workflow_kit.common.project_docs import parse_project_profile_core
from workflow_kit.common.purpose_context import build_purpose_context
from workflow_kit.common.workflow_writes import append_unique_bullets_under_heading, update_next_documents_section


def build_candidates(
    *,
    project_root: Path,
    profile: dict[str, Any],
    changed_files: list[str],
    session_handoff_path: Path | None,
    work_backlog_index_path: Path | None,
    latest_backlog_path: Path | None,
    change_summary: str | None,
) -> dict[str, Any]:
    return build_doc_sync_candidates(
        project_root=project_root,
        profile=profile,
        changed_files=changed_files,
        session_handoff_path=session_handoff_path,
        work_backlog_index_path=work_backlog_index_path,
        latest_backlog_path=latest_backlog_path,
        change_summary=change_summary,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the doc-sync prototype.")
    parser.add_argument("--project-profile-path", required=True)
    parser.add_argument("--changed-file", action="append", dest="changed_files", default=[])
    parser.add_argument("--session-handoff-path")
    parser.add_argument("--work-backlog-index-path")
    parser.add_argument("--latest-backlog-path")
    parser.add_argument("--change-summary")
    parser.add_argument("--apply", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source_context = {
        "project_profile_path": args.project_profile_path,
        "changed_files": args.changed_files,
        "change_summary": args.change_summary,
        "session_handoff_path": args.session_handoff_path,
        "work_backlog_index_path": args.work_backlog_index_path,
        "latest_backlog_path": args.latest_backlog_path,
    }

    if not args.changed_files and not args.change_summary:
        result = build_error_result(
            tool_version=TOOL_VERSION,
            error="변경 입력이 없어 doc-sync 후보를 구성할 수 없다.",
            error_code="missing_change_input",
            warnings=["최소 하나의 changed file 또는 change summary 가 필요하다."],
            source_context=source_context,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1

    try:
        project_profile_path = resolve_existing_path(args.project_profile_path)
        profile_data = parse_project_profile_core(project_profile_path)
        project_root = project_workspace_root(project_profile_path)

        session_handoff_path = resolve_existing_path(args.session_handoff_path) if args.session_handoff_path else None
        work_backlog_index_path = (
            resolve_existing_path(args.work_backlog_index_path) if args.work_backlog_index_path else None
        )
        latest_backlog_path = resolve_existing_path(args.latest_backlog_path) if args.latest_backlog_path else None

        result = build_candidates(
            project_root=project_root,
            profile=profile_data,
            changed_files=args.changed_files,
            session_handoff_path=session_handoff_path,
            work_backlog_index_path=work_backlog_index_path,
            latest_backlog_path=latest_backlog_path,
            change_summary=args.change_summary,
        )

        # v0.9.5 chapter 9 R-A follow-up part 2: skill context load integration
        # doc-sync 가 PURPOSE.md + state.json.purpose_digest 자동 read (directional intent 참조)
        from workflow_kit.common.schemas import DocSyncPurposeContext

        state_json_path = workflow_memory_dir(project_profile_path) / "state.json"
        purpose_context_data = build_purpose_context(
            workspace_root=project_root,
            state_path=state_json_path,
        )
        purpose_context_obj = DocSyncPurposeContext(**purpose_context_data)
        result["purpose_context"] = purpose_context_obj.model_dump()
        result.setdefault("warnings", []).extend(purpose_context_data.get("scope_warnings", []))

        # v0.11.0 chapter 11 R-A follow-up cycle 3: two-step CoT ingest
        from workflow_kit.common.purpose_ingest import run_two_step_cot_ingest

        cot_result = run_two_step_cot_ingest(workspace_root=project_root)
        result["purpose_cot_trace"] = {
            "step1_raw_excerpt": cot_result.cot_trace.step1_raw_excerpt,
            "step1_truncated": cot_result.cot_trace.step1_truncated,
            "step1_char_count": cot_result.cot_trace.step1_char_count,
            "step2_structured_summary": cot_result.cot_trace.step2_structured_summary,
            "cross_ref_matched": cot_result.cross_ref.matched,
            "cross_ref_missing": cot_result.cross_ref.missing_refs,
            "cross_ref_warnings": cot_result.cross_ref.warnings,
            "overall_warnings": cot_result.overall_warnings,
        }
        result.setdefault("warnings", []).extend(cot_result.overall_warnings)

        # v0.11.2 chapter 13 R-A follow-up cycle 4 deferred 통합: graph insights
        from workflow_kit.common.purpose_graph import run_graph_insights

        graph_result = run_graph_insights(workspace_root=project_root)
        result["graph_insights"] = {
            "coverage_pct": graph_result.coverage.coverage_pct if graph_result.coverage else 0.0,
            "covered_count": graph_result.coverage.covered_count if graph_result.coverage else 0,
            "uncovered_count": graph_result.coverage.uncovered_count if graph_result.coverage else 0,
            "covered_goals": graph_result.coverage.covered if graph_result.coverage else [],
            "uncovered_goals": graph_result.coverage.uncovered if graph_result.coverage else [],
            "surprising_count": len(graph_result.surprising.surprising) if graph_result.surprising else 0,
            "scope_creep_warnings": graph_result.surprising.scope_creep_warnings if graph_result.surprising else [],
            "gaps_count": len(graph_result.gaps.gaps) if graph_result.gaps else 0,
            "health_score": graph_result.health.score if graph_result.health else 0,
            "health_tier": graph_result.health.tier if graph_result.health else "unknown",
            "warnings": graph_result.overall_warnings,
        }
        result.setdefault("warnings", []).extend(graph_result.overall_warnings)

        if "warnings" in profile_data:
            result["warnings"] = list(set(result.get("warnings", []) + profile_data["warnings"]))
        result["status"] = "ok"
        result["tool_version"] = TOOL_VERSION
        result["source_context"] = {
            "project_profile_path": str(project_profile_path),
            "changed_files": args.changed_files,
            "change_summary": args.change_summary,
        }

        apply_result = {
            "status": "skipped",
            "written_paths": [],
            "warnings": [],
        }

        if args.apply and session_handoff_path:
            # 1. '다음에 읽을 문서' 섹션 갱신
            links = []
            for path_str in result.get("recommended_review_order", []):
                target_path = Path(path_str)
                if not target_path.is_absolute():
                    target_path = (project_root / target_path).resolve()

                # 상대 경로 링크 생성
                rel_link = rel_link_from_doc(session_handoff_path, target_path)
                label = target_path.name
                links.append(f"[{label}]({rel_link})")

            if links:
                if update_next_documents_section(doc_path=session_handoff_path, links=links):
                    apply_result["status"] = "applied"
                    apply_result["written_paths"].append(str(session_handoff_path))

            # 2. '현재 세션 운영 메모'에 follow_up_actions 추가
            actions = result.get("follow_up_actions", [])
            if actions:
                bullets = [f"[doc-sync] {action}" for action in actions]
                if append_unique_bullets_under_heading(
                    doc_path=session_handoff_path, heading="현재 세션 운영 메모", bullets=bullets
                ):
                    apply_result["status"] = "applied"
                    if str(session_handoff_path) not in apply_result["written_paths"]:
                        apply_result["written_paths"].append(str(session_handoff_path))

            result["apply_status"] = apply_result["status"]
            result["written_paths"] = apply_result["written_paths"]
        elif args.apply:
            result["apply_status"] = "skipped"
            result["warnings"].append("session_handoff.md 경로가 없어 doc-sync apply 모드를 건너뛰었다.")

    except FileNotFoundError as exc:
        result = build_error_result(
            tool_version=TOOL_VERSION,
            error="doc-sync 에 필요한 입력 문서를 읽을 수 없다.",
            error_code="missing_required_document",
            warnings=["프로젝트 프로파일 또는 선택 입력 경로를 다시 확인해야 한다."],
            source_context=source_context | {"missing_path_detail": str(exc)},
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1
    except Exception as exc:
        result = build_error_result(
            tool_version=TOOL_VERSION,
            error="doc-sync 실행 중 예기치 않은 오류가 발생했다.",
            error_code="doc_sync_runtime_error",
            warnings=["입력 값과 문서 후보 추천 로직을 점검한 뒤 다시 실행해야 한다."],
            source_context=source_context | {"exception_type": type(exc).__name__},
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1

        # v0.6.5: stage_completion merge (pilot template, batch 적용)
        result = merge_into_result(
            result,
            build_stage_completion(
                stage_name="doc-sync",
                stage_status="ok" if result.get("status") in ("ok", "success") else "warning" if result.get("status") == "warning" else "error",
                artifacts=["ai-workflow/memory/active/session_handoff.md"],
                next_stage="validation-plan",
                notes=[result.get("summary", "")[:200]] if result.get("summary") else [],
            ),
        )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
