# standard-ai-workflow-kit: v0.15.19-beta

#!/usr/bin/env python3
"""Generate a compact state.json cache from workflow markdown documents."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOT = REPO_ROOT / "workflow-source"
if str(SOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(SOURCE_ROOT))

from workflow_kit.common.workflow_state import refresh_workflow_state_cache


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate workflow state.json from workflow docs.")
    parser.add_argument("--project-profile-path", required=True)
    # v0.14.0+: legacy session-handoff-path + work-backlog-index-path 는 optional
    # (1st deprecation cycle fallback). 신규 layout 사용 시 생략 가능.
    parser.add_argument("--session-handoff-path", required=False, default=None)
    parser.add_argument("--work-backlog-index-path", required=False, default=None)
    # v0.14.0+ append-only layout 신규 입력
    parser.add_argument("--daily-backlog-dir", required=False, default=None,
                        help="v0.14.0+ 신규 layout: daily index directory (backlog/YYYY-MM-DD.md)")
    parser.add_argument("--tasks-dir", required=False, default=None,
                        help="v0.14.0+ 신규 layout: per-task directory (backlog/tasks/TASK-*.md)")
    parser.add_argument("--sessions-dir", required=False, default=None,
                        help="v0.14.0+ 신규 layout: per-session directory (sessions/<stem>.md)")
    parser.add_argument("--output-path", required=True)
    parser.add_argument("--latest-backlog-path")
    parser.add_argument("--repository-assessment-path")
    parser.add_argument("--workspace-root")
    # v0.11.22+ Phase 1.5: ADR-005 memory_index_dir optional pass-through.
    parser.add_argument("--memory-index-dir")
    # v0.14.5+ 2nd cycle: --legacy-memory flag (default True for 1st cycle backward compat,
    # --no-legacy-memory 로 strict opt-out 가능). v0.15.0 에서 강제 False.
    parser.add_argument(
        "--legacy-memory", dest="legacy_memory", action="store_true", default=None,
        help="v0.14.5+ 2nd cycle: enable legacy fallback (work_backlog.md.bak). default True.",
    )
    parser.add_argument(
        "--no-legacy-memory", dest="legacy_memory", action="store_false",
        help="v0.14.5+ 2nd cycle: strict opt-out (legacy fallback OFF).",
    )
    parser.add_argument("--generated-at", default=date.today().isoformat())
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output_path = Path(args.output_path).resolve()
    refresh_result = refresh_workflow_state_cache(
        project_profile_path=Path(args.project_profile_path).resolve(),
        session_handoff_path=Path(args.session_handoff_path).resolve() if args.session_handoff_path else None,
        work_backlog_index_path=Path(args.work_backlog_index_path).resolve() if args.work_backlog_index_path else None,
        daily_backlog_dir=Path(args.daily_backlog_dir).resolve() if args.daily_backlog_dir else None,
        tasks_dir=Path(args.tasks_dir).resolve() if args.tasks_dir else None,
        sessions_dir=Path(args.sessions_dir).resolve() if args.sessions_dir else None,
        latest_backlog_path=Path(args.latest_backlog_path).resolve() if args.latest_backlog_path else None,
        repository_assessment_path=Path(args.repository_assessment_path).resolve() if args.repository_assessment_path else None,
        output_path=output_path,
        generated_at=args.generated_at,
        workspace_root=Path(args.workspace_root).resolve() if args.workspace_root else None,
        memory_index_dir=Path(args.memory_index_dir).resolve() if args.memory_index_dir else None,
        legacy_memory=args.legacy_memory,  # v0.14.5+ 2nd cycle flag
    )
    print(
        json.dumps(
            {
                "status": "ok",
                "output_path": str(output_path),
                "state_cache_status": refresh_result["status"],
                "memory_index_dir": str(args.memory_index_dir) if args.memory_index_dir else None,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
