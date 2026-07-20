# standard-ai-workflow-kit: v0.15.19-beta

#!/usr/bin/env python3
"""Prototype runner for the session-start skill."""

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
from workflow_kit.common.errors import build_error_result
from workflow_kit.common.contracts.stage_gate_runtime import build_stage_completion, merge_into_result
from workflow_kit.common.normalize import dedupe_normalized_backticked
from workflow_kit.common.paths import resolve_existing_path
from workflow_kit.common.project_docs import (
    find_latest_backlog_path,
    parse_backlog,
    parse_handoff,
    parse_project_profile_session,
)
from workflow_kit.common.purpose_context import build_purpose_context
from workflow_kit.common.reconcile import compare_state_lists
from workflow_kit.common.session_outputs import build_session_summary, make_session_recommended_action


def _build_memory_index_query_output(
    args: argparse.Namespace,
    workspace_root: Path,
    warnings: list[str],
) -> dict[str, Any] | None:
    """v0.11.22+ Phase 3b: optional ADR-005 memory_index retrieval 3-tuple 호출.

    - 둘 다 미지정 → None (zero-risk skip, 기존 caller 정합).
    - 한쪽만 지정 → advisory emit + None.
    - 둘 다 지정 → helper 호출, `MemoryIndexQueryOutput` dict 변환 후 emit.
    - v0.13.1+ Phase 13 AC2: retrieval 성공/실패 후 telemetry sidecar 에 1 event append.
    """
    if not args.memory_index_dir and not args.memory_query_tokens:
        return None  # zero-risk default
    if not args.memory_index_dir or not args.memory_query_tokens:
        warnings.append(
            "memory_index wiring: --memory-index-dir 와 --memory-query-tokens 둘 다 지정해야 retrieval 활성."
        )
        return None

    memory_index_dir = Path(args.memory_index_dir)
    query_tokens = [t.strip() for t in args.memory_query_tokens.split(",") if t.strip()]
    if not query_tokens:
        warnings.append(
            "memory_index wiring: --memory-query-tokens 가 비어있음. retrieval skip."
        )
        return None

    from datetime import datetime as _dt, timezone as _tz
    from workflow_kit.common.state.memory_index import (
        MemoryIndexTelemetryEvent,
        append_telemetry_event,
        query_memory_index_for_dispatcher,
    )
    target = workspace_root
    try:
        memory_index_dir.relative_to(workspace_root)
        # subdir — workspace_root 그대로 사용 (helper 내부 `memory_index_root(<root>)` 자동 계산)
    except ValueError:
        warnings.append(
            "memory_index wiring: --memory-index-dir 가 workspace_root 외부. "
            "현재 정공법은 ws 의 subdir 만 지원 (Phase 3c/d 개선 후보)."
        )
        # Phase 13 AC2: 외부 dir 도 telemetry 는 emit (negative example).
        append_telemetry_event(
            workspace_root,
            MemoryIndexTelemetryEvent(
                timestamp=_dt.now(_tz.utc),
                source="session-start",
                workspace_root=str(workspace_root),
                query_tokens_count=len(query_tokens),
                error=True,
            ),
        )
        return None
    try:
        result = query_memory_index_for_dispatcher(target, query_tokens)
        # Phase 13 AC2: telemetry emit (success path).
        append_telemetry_event(
            workspace_root,
            MemoryIndexTelemetryEvent(
                timestamp=_dt.now(_tz.utc),
                source="session-start",
                workspace_root=str(workspace_root),
                query_tokens_count=len(query_tokens),
                selected_count=result.selected_count,
                cue_hits=result.cue_hits,
                bm25_hits=result.bm25_hits,
                expansion_hits=result.expansion_hits,
                top_k=10,
                max_depth=2,
                use_bm25_fallback=False,
            ),
        )
        return result.model_dump(mode="json")
    except Exception as e:
        warnings.append(
            f"memory_index wiring: retrieval 실패 ({type(e).__name__}: {e}). session-start 본체는 계속 진행."
        )
        # Phase 13 AC2: 예외 path 도 telemetry emit (negative example).
        append_telemetry_event(
            workspace_root,
            MemoryIndexTelemetryEvent(
                timestamp=_dt.now(_tz.utc),
                source="session-start",
                workspace_root=str(workspace_root),
                query_tokens_count=len(query_tokens),
                error=True,
            ),
        )
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the session-start prototype.")
    parser.add_argument("--session-handoff-path", required=True)
    parser.add_argument("--work-backlog-index-path", required=True)
    parser.add_argument("--project-profile-path", required=True)
    parser.add_argument("--latest-backlog-path")
    # v0.11.22+ Phase 3b: ADR-005 memory_index retrieval 3-tuple opt-in wiring.
    # 둘 다 지정되면 session-start 가 진입 시 memory_index 에서 query 후 hints emit.
    # 부재 시 zero-risk skip (default) — 기존 caller 깨지지 않음.
    parser.add_argument("--memory-index-dir",
                        help="memory_index 절대 path. 부재 시 skip.")
    parser.add_argument("--memory-query-tokens",
                        help="comma-separated query tokens. 예: 'adr,memora,retrieval'. 부재 시 skip.")
    args = parser.parse_args()

    source_context = {
        "session_handoff_path": args.session_handoff_path,
        "work_backlog_index_path": args.work_backlog_index_path,
        "project_profile_path": args.project_profile_path,
        "latest_backlog_path": args.latest_backlog_path,
        "memory_index_dir": args.memory_index_dir,
        "memory_query_tokens": args.memory_query_tokens,
    }

    try:
        session_handoff_path = resolve_existing_path(args.session_handoff_path)
        work_backlog_index_path = resolve_existing_path(args.work_backlog_index_path)
        project_profile_path = resolve_existing_path(args.project_profile_path)
    except FileNotFoundError as exc:
        result = build_error_result(
            tool_version=TOOL_VERSION,
            error="필수 입력 문서를 읽을 수 없다.",
            error_code="missing_required_document",
            warnings=["session-start 기준선을 복원할 수 없어 후속 판단을 중단한다."],
            source_context=source_context | {"missing_path_detail": str(exc)},
            recovery_hint="`scripts/bootstrap_workflow_kit.py`를 실행하여 초기 문서를 생성하거나, 인자로 넘어온 경로가 올바른지 확인해야 한다.",
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1

    warnings: list[str] = []
    try:
        handoff = parse_handoff(session_handoff_path)
        warnings.extend(handoff.get("warnings", []))

        profile = parse_project_profile_session(project_profile_path)
        warnings.extend(profile.get("warnings", []))

        latest_backlog_path: Path | None
        if args.latest_backlog_path:
            latest_backlog_path = resolve_existing_path(args.latest_backlog_path)
        else:
            latest_backlog_path = find_latest_backlog_path(work_backlog_index_path)
            if latest_backlog_path is None or not latest_backlog_path.exists():
                latest_backlog_path = None
                warnings.append("최신 backlog 경로를 backlog index 에서 확인하지 못했다.")

        backlog: dict[str, Any] = {"tasks": [], "in_progress_items": [], "blocked_items": [], "done_items": [], "warnings": []}
        if latest_backlog_path is not None:
            backlog = parse_backlog(latest_backlog_path)
            warnings.extend(backlog.get("warnings", []))

        warnings.extend(
            compare_state_lists(handoff.get("in_progress_items", []), backlog.get("in_progress_items", []), "in_progress")
        )
        warnings.extend(compare_state_lists(handoff.get("blocked_items", []), backlog.get("blocked_items", []), "blocked"))

        next_documents = dedupe_normalized_backticked(
            [
                str(session_handoff_path),
                str(latest_backlog_path) if latest_backlog_path else "",
                str(project_profile_path),
                *[str(path) for path in handoff.get("next_documents", []) if path.exists()],
            ]
        )

        # v0.9.5 chapter 9 R-A follow-up part 2: skill context load integration
        # session-start 가 PURPOSE.md + state.json.purpose_digest 자동 read
        from workflow_kit.common.paths import project_workspace_root, workflow_memory_dir
        from workflow_kit.common.schemas import SessionStartOutput, SessionStartPurposeContext

        workspace_root = project_workspace_root(project_profile_path)
        state_json_path = workflow_memory_dir(project_profile_path) / "state.json"
        purpose_context_data = build_purpose_context(
            workspace_root=workspace_root,
            state_path=state_json_path,
        )
        purpose_context = SessionStartPurposeContext(**purpose_context_data)
        warnings.extend(purpose_context_data.get("scope_warnings", []))

        # v0.11.0 chapter 11 R-A follow-up cycle 3: two-step CoT ingest
        # session-start 가 PURPOSE.md 를 2-step (raw -> structured + cross-ref) 으로 read
        from workflow_kit.common.purpose_ingest import run_two_step_cot_ingest
        from workflow_kit.common.schemas import SessionStartPurposeCoTTrace

        cot_result = run_two_step_cot_ingest(workspace_root=workspace_root)
        purpose_cot_trace = SessionStartPurposeCoTTrace(
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
        # session-start 가 PURPOSE.md Goals ↔ deliverables 매핑 분석 자동 호출
        from workflow_kit.common.purpose_graph import run_graph_insights
        from workflow_kit.common.schemas import SessionGraphInsightsOutput

        graph_result = run_graph_insights(workspace_root=workspace_root)
        graph_insights = SessionGraphInsightsOutput(
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

        # v0.10.2: self-bootstrap mode
        # 핵심 4 file (handoff / backlog index / project profile / state.json) 모두
        # 부재 시 status="warning" + self_bootstrap_suggested=True + init commands emit.
        # AGENTS.md 부재 환경 (skill-only entry) 의 *최소 effort* 진입 정공법.
        all_missing = (
            not session_handoff_path.exists()
            and not work_backlog_index_path.exists()
            and not state_json_path.exists()
        )
        self_bootstrap_suggested = all_missing
        self_bootstrap_init_commands: list[str] = []
        if all_missing:
            self_bootstrap_init_commands = [
                f"python3 scripts/bootstrap_workflow_kit.py --target-root {workspace_root} "
                f"--project-slug <slug> --project-name <name> --adoption-mode new "
                f"--harness claude-code --entry-mode skill-only",
                f"python3 skills/session-start/scripts/run_session_start.py "
                f"--session-handoff-path {session_handoff_path} "
                f"--work-backlog-index-path {work_backlog_index_path} "
                f"--project-profile-path {project_profile_path}",
            ]
            warnings.append(
                "self-bootstrap mode: 핵심 4 file 모두 부재. "
                "bootstrap_workflow_kit.py 실행 권장 (위 self_bootstrap_init_commands 참조)."
            )

        output_model = SessionStartOutput(
            status="warning" if self_bootstrap_suggested else "ok",
            tool_version=TOOL_VERSION,
            summary=build_session_summary(handoff, backlog, profile),
            in_progress_items=dedupe_normalized_backticked(
                handoff.get("in_progress_items", []) + backlog.get("in_progress_items", [])
            ),
            blocked_items=dedupe_normalized_backticked(
                handoff.get("blocked_items", []) + backlog.get("blocked_items", [])
            ),
            latest_backlog_path=str(latest_backlog_path) if latest_backlog_path else None,
            next_documents=next_documents,
            recommended_next_action=make_session_recommended_action(warnings, backlog, profile),
            warnings=warnings,
            validation_notes=[],
            environment_constraints=dedupe_normalized_backticked(
                [item for item in [handoff.get("constraints"), profile.get("constraints")] if item]
            ),
            source_documents={
                "session_handoff_path": str(session_handoff_path),
                "work_backlog_index_path": str(work_backlog_index_path),
                "project_profile_path": str(project_profile_path),
            },
            purpose_context=purpose_context,
            purpose_cot_trace=purpose_cot_trace,
            graph_insights=graph_insights,
            self_bootstrap_suggested=self_bootstrap_suggested,
            self_bootstrap_init_commands=self_bootstrap_init_commands,
            memory_index_query_output=_build_memory_index_query_output(
                args, workspace_root, warnings
            ),
        )
        result = output_model.model_dump()
    except FileNotFoundError as exc:
        result = build_error_result(
            tool_version=TOOL_VERSION,
            error="참조 문서를 읽는 중 필요한 경로를 확인하지 못했다.",
            error_code="missing_referenced_document",
            warnings=["입력 문서의 링크 또는 명시 경로를 다시 확인해야 한다."],
            source_context=source_context | {"missing_path_detail": str(exc)},
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1
    except Exception as exc:
        result = build_error_result(
            tool_version=TOOL_VERSION,
            error="session-start 실행 중 예기치 않은 오류가 발생했다.",
            error_code="session_start_runtime_error",
            warnings=["파서 또는 입력 문서 형식을 점검한 뒤 다시 실행해야 한다."],
            source_context=source_context | {"exception_type": type(exc).__name__},
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1

        # v0.6.5: stage_completion merge (pilot template, batch 적용)
        result = merge_into_result(
            result,
            build_stage_completion(
                stage_name="session-start",
                stage_status="ok" if result.get("status") in ("ok", "success") else "warning" if result.get("status") == "warning" else "error",
                artifacts=["ai-workflow/memory/active/state.json"],
                next_stage=None,
                notes=[result.get("summary", "")[:200]] if result.get("summary") else [],
            ),
        )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
