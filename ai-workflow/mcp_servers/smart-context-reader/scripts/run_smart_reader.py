#!/usr/bin/env python3
import sys
from pathlib import Path

# Add lib to path for common_utils
LIB_PATH = Path(__file__).resolve().parents[2] / "lib"
if str(LIB_PATH) not in sys.path:
    sys.path.insert(0, str(LIB_PATH))

from common_utils import inject_workflow_source, mcp_main, standard_output_handler

inject_workflow_source()
from workflow_kit.common.read_only_bundle import smart_context_reader_payload

def build_args(parser):
    parser.add_argument("--file-path", required=True, help="Path to the Python file.")
    parser.add_argument("--symbols", nargs="*", help="List of function or class names to extract.")

def main():
    mcp_main(
        description="Extract specific function or class blocks from a Python file.",
        arg_builder=build_args,
        payload_func=smart_context_reader_payload,
        output_handler=lambda r: standard_output_handler(r, "extracted_content")
    )

if __name__ == "__main__":
    main()
