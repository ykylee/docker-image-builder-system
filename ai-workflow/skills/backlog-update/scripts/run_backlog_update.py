# standard-ai-workflow-kit: v0.11.21-beta

#!/usr/bin/env python3
"""Prototype runner for the backlog-update skill."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[4]
SOURCE_ROOT = REPO_ROOT / "workflow-source"
if str(SOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(SOURCE_ROOT))

from workflow_kit import __version__ as TOOL_VERSION
from workflow_kit.common.errors import build_error_result
from workflow_kit.common.contracts.stage_gate_runtime import build_stage_completion, merge_into_result
from workflow_kit.common.normalize import normalize_backticked
from workflow_kit.common.paths import resolve_existing_path, workflow_memory_dir, workflow_branch_dir
from workflow_kit.common.planning import determine_conservative_task_status
from workflow_kit.common.project_docs import parse_backlog_task_entries, parse_project_profile_backlog
from workflow_kit.common.purpose_context import build_purpose_context, check_scope_creep
from workflow_kit.common.workflow_state import build_state_cache_refresh_hint, refresh_workflow_state_cache
from workflow_kit.common.workflow_writes import ensure_backlog_index_entry, sync_handoff_status, upsert_backlog_entry


def infer_backlog_path(project_profile_path: Path, target_date: str) -> Path:
    branch_dir = workflow_branch_dir(project_profile_path)
    return (branch_dir / "backlog" / f"{target_date}.md").resolve()


def suggest_next_task_id(tasks: list[dict[str, Any]]) -> str:
    max_num = 0
    for task in tasks:
        match = re.match(r"TASK-(\d+)", task["task_id"])
        if match:
            max_num = max(max_num, int(match.group(1)))
    return f"TASK-{max_num + 1:03d}"


def build_draft_entry(
    *,
    task_id: str,
    task_name: str,
    status: str,
    priority: str,
    request_date: str,
    owner: str | None,
    host_name: str | None,
    host_ip: str | None,
    affected_documents: list[str],
    task_summary: str | None,
    progress_note: str | None,
    done_criteria: str | None,
    result_note: str | None,
    next_step: str | None,
    risks: str | None,
    follow_up: str | None,
) -> list[str]:
    lines = [
        f"## {task_id} {task_name}",
        "",
        f"- 상태: {status}",
        f"- 우선순위: {priority}",
        f"- 요청일: {request_date}",
        "- 완료일:",
        "- 담당:",
        f"- {owner}" if owner else "- ",
        "- 호스트명:",
        f"- {host_name}" if host_name else "- ",
        "- 호스트 IP:",
        f"- {host_ip}" if host_ip else "- ",
        "- 영향 문서:",
    ]
    if affected_documents:
        lines.extend([f"- `{doc}`" for doc in affected_documents])
    else:
        lines.append("- ")
    lines.extend(
        [
            "- 작업 내용:",
            f"- {task_summary}" if task_summary else "- ",
            "- 진행 현황:",
            f"- {progress_note}" if progress_note else "- ",
            "- 완료 기준:",
            f"- {done_criteria}" if done_criteria else "- ",
            "- 작업 결과:",
            f"- {result_note}" if result_note else "- ",
            "- 다음 세션 시작 포인트:",
            f"- {next_step}" if next_step else "- ",
            "- 남은 리스크:",
            f"- {risks}" if risks else "- ",
            "- 후속 작업:",
            f"- {follow_up}" if follow_up else "- ",
        ]
    )
    return lines


def detect_confirmation_fields(data: dict[str, Any]) -> list[str]:
    mapping = {
        "owner": "담당",
        "host_name": "호스트명",
        "host_ip": "호스트 IP",
        "affected_documents": "영향 문서",
        "done_criteria": "완료 기준",
        "result_note": "작업 결과",
        "next_step": "다음 세션 시작 포인트",
        "risks": "남은 리스크",
        "follow_up": "후속 작업",
    }
    missing: list[str] = []
    for key, label in mapping.items():
        value = data.get(key)
        if value is None or value == "" or value == []:
            missing.append(label)
    return missing


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the backlog-update prototype.")
    parser.add_argument("--project-profile-path", required=True)
    parser.add_argument("--task-name", required=True)
    parser.add_argument("--task-brief", required=True)
    parser.add_argument("--daily-backlog-path")
    parser.add_argument("--target-date")
    parser.add_argument("--task-id")
    parser.add_argument("--mode", choices=["create", "update", "auto"], default="auto")
    parser.add_argument("--status")
    parser.add_argument("--priority", default="high")
    parser.add_argument("--owner")
    parser.add_argument("--host-name")
    parser.add_argument("--host-ip")
    parser.add_argument("--affected-document", action="append", dest="affected_documents", default=[])
    parser.add_argument("--progress-note")
    parser.add_argument("--done-criteria")
    parser.add_argument("--result-note")
    parser.add_argument("--next-step")
    parser.add_argument("--risks")
    parser.add_argument("--follow-up")
    parser.add_argument("--validation-result")
    parser.add_argument("--work-backlog-index-path")
    parser.add_argument("--session-handoff-path")
    parser.add_argument("--apply", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source_context = {
        "project_profile_path": args.project_profile_path,
        "task_name": args.task_name,
        "task_brief": args.task_brief,
        "daily_backlog_path": args.daily_backlog_path,
        "target_date": args.target_date,
        "task_id": args.task_id,
        "mode": args.mode,
    }

    # v0.11.20: invalid_task_brief error_code (3rd stable error_code 정합)
    # task_brief 가 비어있거나 whitespace-only 면 backlog entry 의 `작업 내용` /
    # `진행 현황` line 이 `-` placeholder 만 남아 downstream consumer 가
    # 무엇을 했는지 알 수 없음. 명시적 차단.
    if not args.task_brief or not args.task_brief.strip():
        result = build_error_result(
            tool_version=TOOL_VERSION,
            error="backlog-update 의 task_brief 가 비어 있다.",
            error_code="invalid_task_brief",
            warnings=["--task-brief 에 작업의 핵심 변경/조치 1~2 문장을 입력해야 한다."],
            source_context=source_context,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1

    try:
        project_profile_path = resolve_existing_path(args.project_profile_path)
        profile_data = parse_project_profile_backlog(project_profile_path)
    except FileNotFoundError as exc:
        result = build_error_result(
            tool_version=TOOL_VERSION,
            error="backlog-update 에 필요한 입력 문서를 읽을 수 없다.",
            error_code="missing_required_document",
            warnings=["프로젝트 프로파일 경로를 다시 확인해야 한다."],
            source_context=source_context | {"missing_path_detail": str(exc)},
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1
    except Exception as exc:
        result = build_error_result(
            tool_version=TOOL_VERSION,
            error="backlog-update 실행 중 예기치 않은 오류가 발생했다.",
            error_code="backlog_update_runtime_error",
            warnings=["입력 값과 backlog 파서 동작을 점검한 뒤 다시 실행해야 한다."],
            source_context=source_context | {"exception_type": type(exc).__name__},
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1

    try:
        warnings: list[str] = []
        if "warnings" in profile_data:
            warnings.extend(profile_data["warnings"])

        request_date = args.target_date or datetime.now().strftime("%Y-%m-%d")
        work_backlog_index_path = (
            Path(args.work_backlog_index_path).expanduser().resolve()
            if args.work_backlog_index_path
            else (workflow_memory_dir(project_profile_path) / "work_backlog.md").resolve()
        )
        session_handoff_path = (
            Path(args.session_handoff_path).expanduser().resolve()
            if args.session_handoff_path
            else (workflow_branch_dir(project_profile_path) / "session_handoff.md").resolve()
        )

        daily_backlog_path: Path
        if args.daily_backlog_path:
            daily_backlog_path = Path(args.daily_backlog_path).expanduser().resolve()
        else:
            daily_backlog_path = infer_backlog_path(project_profile_path, request_date)

        existing_tasks = parse_backlog_task_entries(daily_backlog_path) if daily_backlog_path.exists() else []

        requested_mode = args.mode
        if requested_mode == "auto":
            requested_mode = "update" if args.task_id else "create"

        operation_type = "create_entry"
        if not daily_backlog_path.exists():
            operation_type = "create_daily_backlog"
        if requested_mode == "update":
            operation_type = "update_entry"

        matched_task: dict[str, Any] | None = None
        if requested_mode == "update":
            if not args.task_id:
                operation_type = "cannot_determine"
                warnings.append("기존 항목 갱신에는 `task_id` 가 필요하다.")
            else:
                for task in existing_tasks:
                    if task["task_id"] == args.task_id:
                        matched_task = task
                        break
                if matched_task is None and daily_backlog_path.exists():
                    operation_type = "cannot_determine"
                    warnings.append(f"`{args.task_id}` 항목을 대상 backlog 에서 찾지 못했다.")

        task_id = args.task_id or suggest_next_task_id(existing_tasks)
        status, status_warnings = determine_conservative_task_status(args.status, args.validation_result, operation_type)
        warnings.extend(status_warnings)

        progress_note = args.progress_note
        if not progress_note:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
            progress_note = f"`{timestamp}` 기준 {args.task_brief}"

        result_note = args.result_note
        if args.validation_result and not result_note:
            result_note = args.validation_result

        fields_data = {
            "owner": args.owner,
            "host_name": args.host_name,
            "host_ip": args.host_ip,
            "affected_documents": args.affected_documents,
            "done_criteria": args.done_criteria,
            "result_note": result_note,
            "next_step": args.next_step,
            "risks": args.risks,
            "follow_up": args.follow_up,
        }
        fields_requiring_confirmation = [normalize_backticked(item) for item in detect_confirmation_fields(fields_data)]

        draft_entry = build_draft_entry(
            task_id=task_id,
            task_name=args.task_name,
            status=status,
            priority=args.priority,
            request_date=request_date,
            owner=args.owner,
            host_name=args.host_name,
            host_ip=args.host_ip,
            affected_documents=args.affected_documents,
            task_summary=args.task_brief,
            progress_note=progress_note,
            done_criteria=args.done_criteria,
            result_note=result_note,
            next_step=args.next_step,
            risks=args.risks,
            follow_up=args.follow_up,
        )

        if operation_type == "create_daily_backlog":
            warnings.append("대상 날짜 backlog 파일이 없어 새 파일 초안 생성이 필요하다.")

        # v0.9.5 chapter 9 R-A follow-up part 2: skill context load integration
        # backlog-update 가 PURPOSE.md §3 Research Scope 와 비교하여 scope creep 경고
        from workflow_kit.common.paths import project_workspace_root
        from workflow_kit.common.schemas import BacklogUpdateOutput, BacklogUpdatePurposeContext

        workspace_root = project_workspace_root(project_profile_path)
        state_json_path = workflow_memory_dir(project_profile_path) / "state.json"
        purpose_context_data = build_purpose_context(
            workspace_root=workspace_root,
            state_path=state_json_path,
        )
        purpose_context_obj = BacklogUpdatePurposeContext(**purpose_context_data)
        warnings.extend(purpose_context_data.get("scope_warnings", []))

        # v0.11.0 chapter 11 R-A follow-up cycle 3: two-step CoT ingest
        from workflow_kit.common.purpose_ingest import run_two_step_cot_ingest
        from workflow_kit.common.schemas import BacklogUpdatePurposeCoTTrace

        cot_result = run_two_step_cot_ingest(workspace_root=workspace_root)
        purpose_cot_trace = BacklogUpdatePurposeCoTTrace(
            step1_raw_excerpt=cot_result.cot_trace.step1_raw_excerpt,
            step1_truncated=cot_result.cot_trace.step1_truncated,
            step1_char_count=cot_result.cot_trace.step1_char_count,
            step2_structured_summary=cot_result.cot_trace.step2_structured_summary,
            cross_ref_matched=cot_result.cross_ref.matched,
            cross_ref_missing=cot_result.cross_ref.missing_refs,
            cross_ref_warnings=cot_result.cross_ref.warnings,
            overall_warnings=cot_result.overall_warnings,
        )
        warnings.extend(cot_result.overall_warnings)

        # v0.11.2 chapter 13 R-A follow-up cycle 4 deferred 통합: graph insights
        from workflow_kit.common.purpose_graph import run_graph_insights
        from workflow_kit.common.schemas import BacklogGraphInsightsOutput

        graph_result = run_graph_insights(workspace_root=workspace_root)
        graph_insights = BacklogGraphInsightsOutput(
            coverage_pct=(graph_result.coverage.coverage_pct if graph_result.coverage else 0.0),
            covered_count=(graph_result.coverage.covered_count if graph_result.coverage else 0),
            uncovered_count=(graph_result.coverage.uncovered_count if graph_result.coverage else 0),
            covered_goals=(graph_result.coverage.covered if graph_result.coverage else []),
            uncovered_goals=(graph_result.coverage.uncovered if graph_result.coverage else []),
            surprising_count=(len(graph_result.surprising.surprising) if graph_result.surprising else 0),
            scope_creep_warnings=(graph_result.surprising.scope_creep_warnings if graph_result.surprising else []),
            gaps_count=(len(graph_result.gaps.gaps) if graph_result.gaps else 0),
            health_score=(graph_result.health.score if graph_result.health else 0),
            health_tier=(graph_result.health.tier if graph_result.health else "unknown"),
            warnings=graph_result.overall_warnings,
        )
        warnings.extend(graph_result.overall_warnings)

        scope_creep_warnings = check_scope_creep(
            task_brief=args.task_brief,
            affected_documents=args.affected_documents,
            scope={
                "included": purpose_context_data.get("scope_included", []),
                "excluded": purpose_context_data.get("scope_excluded", []),
            },
        )

        index_update_note = None
        if operation_type == "create_daily_backlog":
            index_update_note = "새 날짜 backlog 파일이 생성되면 backlog index 에 링크를 추가해야 한다."

        handoff_update_note = None
        if status in {"in_progress", "blocked", "done"}:
            handoff_update_note = "상태 변화가 handoff 에 반영되어야 하는지 확인한다."
        state_cache_update = build_state_cache_refresh_hint(
            project_profile_path=project_profile_path,
            latest_backlog_path=daily_backlog_path,
        )
        apply_result = {
            "status": "skipped",
            "written_paths": [],
            "created_paths": [],
            "updated_paths": [],
            "warnings": [],
        }
        if args.apply and operation_type != "cannot_determine":
            # v0.11.20: backlog_write_failed error_code (4th stable error_code 정합)
            # apply 모드에서 파일 쓰기 실패 시 (permission denied / disk full /
            # read-only fs) 명시적 차단 + 원본 보존. silently skip ❌.
            try:
                backlog_action = upsert_backlog_entry(
                    backlog_path=daily_backlog_path,
                    task_id=task_id,
                    entry_lines=draft_entry,
                )
                apply_result["written_paths"].append(str(daily_backlog_path))
                if backlog_action == "created":
                    apply_result["created_paths"].append(str(daily_backlog_path))
                else:
                    apply_result["updated_paths"].append(str(daily_backlog_path))
            except OSError as exc:
                result = build_error_result(
                    tool_version=TOOL_VERSION,
                    error="backlog 파일 쓰기에 실패했다.",
                    error_code="backlog_write_failed",
                    warnings=[
                        "대상 backlog 파일의 쓰기 권한과 디스크 상태를 점검한 뒤 다시 시도해야 한다.",
                        f"실패 경로: {daily_backlog_path}",
                    ],
                    source_context=source_context | {
                        "exception_type": type(exc).__name__,
                        "errno": getattr(exc, "errno", None),
                    },
                )
                print(json.dumps(result, ensure_ascii=False, indent=2))
                return 1

            if work_backlog_index_path.exists():
                index_added = ensure_backlog_index_entry(
                    work_backlog_index_path=work_backlog_index_path,
                    daily_backlog_path=daily_backlog_path,
                )
                apply_result["written_paths"].append(str(work_backlog_index_path))
                apply_result["updated_paths"].append(str(work_backlog_index_path))
                if index_added:
                    warnings.append("backlog index 에 새 날짜 backlog 링크를 자동 추가했다.")
            else:
                apply_result["warnings"].append("work_backlog.md 가 없어 backlog index 자동 갱신을 건너뛰었다.")

            if session_handoff_path.exists() and status in {"in_progress", "blocked", "done"}:
                sync_handoff_status(
                    handoff_path=session_handoff_path,
                    task_label=f"{task_id} {args.task_name}",
                    status=status,
                )
                apply_result["written_paths"].append(str(session_handoff_path))
                apply_result["updated_paths"].append(str(session_handoff_path))
            elif status in {"in_progress", "blocked", "done"}:
                apply_result["warnings"].append("session_handoff.md 가 없어 handoff 상태 동기화를 건너뛰었다.")

            apply_result["status"] = "applied"

        state_cache_refresh = refresh_workflow_state_cache(
            project_profile_path=project_profile_path,
            session_handoff_path=session_handoff_path if session_handoff_path.exists() else None,
            work_backlog_index_path=work_backlog_index_path if work_backlog_index_path.exists() else None,
            latest_backlog_path=daily_backlog_path if daily_backlog_path.exists() else None,
            generated_at=date.today().isoformat(),
        )
        warnings.extend(apply_result["warnings"])

        from workflow_kit.common.schemas import BacklogUpdateOutput
        
        output_model = BacklogUpdateOutput(
            status="ok",
            tool_version=TOOL_VERSION,
            operation_type=operation_type,
            target_backlog_path=str(daily_backlog_path),
            task_id=task_id,
            task_found=bool(matched_task),
            draft_entry=draft_entry,
            status_recommendation={
                "value": status,
                "reason": (
                    "검증 결과가 없으므로 완료 확정 대신 보수적인 상태를 유지한다."
                    if status != "done" and args.status == "done"
                    else "입력된 상태와 현재 작업 브리핑 기준으로 가장 보수적인 상태를 제안한다."
                ),
            },
            fields_requiring_confirmation=fields_requiring_confirmation,
            warnings=warnings,
            index_update_note=index_update_note,
            handoff_update_note=handoff_update_note,
            state_cache_update_note=(
                f"`--apply` 반영 결과를 포함한 현재 source-of-truth 문서를 기준으로 `{state_cache_update['state_path']}` 를 자동 재생성했다."
                if args.apply and state_cache_refresh["status"] == "refreshed"
                else f"현재 source-of-truth 문서를 기준으로 `{state_cache_update['state_path']}` 를 자동 재생성했다."
                if state_cache_refresh["status"] == "refreshed"
                else f"source-of-truth 문서가 아직 부족해 `{state_cache_update['state_path']}` 자동 재생성을 건너뛰었다."
            ),
            state_cache_refresh_command=state_cache_update["refresh_command"],
            state_cache_status=state_cache_refresh["status"],
            state_cache_missing_paths=state_cache_refresh["missing_paths"],
            apply_status=apply_result["status"],
            written_paths=apply_result["written_paths"],
            created_paths=apply_result["created_paths"],
            updated_paths=apply_result["updated_paths"],
            validation_note=args.validation_result,
            source_context={
                "project_profile_path": str(project_profile_path),
                "daily_backlog_exists": daily_backlog_path.exists(),
                "existing_task_count": len(existing_tasks),
            },
            purpose_context=purpose_context_obj,
            purpose_cot_trace=purpose_cot_trace,
            graph_insights=graph_insights,
            scope_creep_warnings=scope_creep_warnings,
        )
        result = output_model.model_dump()
    except Exception as exc:
        result = build_error_result(
            tool_version=TOOL_VERSION,
            error="backlog-update 실행 중 예기치 않은 오류가 발생했다.",
            error_code="backlog_update_runtime_error",
            warnings=["입력 값과 backlog 파서 동작을 점검한 뒤 다시 실행해야 한다."],
            source_context=source_context | {"exception_type": type(exc).__name__},
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1

        # v0.6.5: stage_completion merge (pilot template, batch 적용)
        result = merge_into_result(
            result,
            build_stage_completion(
                stage_name="backlog-update",
                stage_status="ok" if result.get("status") in ("ok", "success") else "warning" if result.get("status") == "warning" else "error",
                artifacts=["ai-workflow/memory/active/backlog/<target_date>.md"],
                next_stage=None,
                notes=[result.get("summary", "")[:200]] if result.get("summary") else [],
            ),
        )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
