#!/usr/bin/env python3
"""Standardized runner for the git-history-summarizer MCP tool."""

from __future__ import annotations

import sys
from pathlib import Path

# Add lib to path for common_utils
LIB_PATH = Path(__file__).resolve().parents[2] / "lib"
if str(LIB_PATH) not in sys.path:
    sys.path.insert(0, str(LIB_PATH))

from common_utils import inject_workflow_source, mcp_main, standard_output_handler

inject_workflow_source()
from workflow_kit.common.read_only_bundle import summarize_git_history_payload

TOOL_VERSION = "v0.14.1-beta"  # v0.14.1 1st batch stable 승격

def build_args(parser):
    parser.add_argument("--commit-range", "--range", default="HEAD~3..HEAD", help="Commit range (e.g. HEAD~3..HEAD)")
    parser.add_argument("--repo-path", default=".", help="Path to git repository")

def main():
    mcp_main(
        description="Summarize git history for session handoff.",
        arg_builder=build_args,
        payload_func=summarize_git_history_payload,
        output_handler=lambda r: standard_output_handler(r, "markdown")
    )

if __name__ == "__main__":
    main()
