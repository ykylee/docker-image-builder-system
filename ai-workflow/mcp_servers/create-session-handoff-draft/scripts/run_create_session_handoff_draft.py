#!/usr/bin/env python3
import sys
from pathlib import Path

# Add lib to path for common_utils
LIB_PATH = Path(__file__).resolve().parents[2] / "lib"
if str(LIB_PATH) not in sys.path:
    sys.path.insert(0, str(LIB_PATH))

from common_utils import inject_workflow_source, mcp_main

inject_workflow_source()
from workflow_kit.common.read_only_bundle import create_session_handoff_draft_payload
from workflow_kit.common.git import summarize_git_history

def build_args(parser):
    parser.add_argument("--latest-backlog-path")
    parser.add_argument("--git-range", help="Commit range for git summary (e.g. HEAD~3..HEAD)")
    parser.add_argument("--repo-path", default=".", help="Path to git repository")

def wrapped_payload(latest_backlog_path, git_range, repo_path, tool_version):
    git_summary = None
    if git_range:
        summary_data = summarize_git_history(repo_path=repo_path, commit_range=git_range)
        git_summary = summary_data["markdown"]
    
    return create_session_handoff_draft_payload(
        latest_backlog_path=latest_backlog_path,
        git_summary=git_summary,
        tool_version=tool_version
    )

def main():
    mcp_main(
        description="Run create_session_handoff_draft MCP prototype.",
        arg_builder=build_args,
        payload_func=wrapped_payload
    )

if __name__ == "__main__":
    main()
