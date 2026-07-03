"""failure-summary-shaper CLI.

Usage::

    # stdin 으로 JSON 입력
    echo '{"failure":{"errorCode":"DOCKER_BUILD_FAILED","nextAction":"FIX_DOCKERFILE"}}' | \\
        python3 -m apps.skill_mcp.skills.failure_summary_shaper.cli --input -

    # 파일 입력 + 출력
    python3 -m apps.skill_mcp.skills.failure_summary_shaper.cli \\
        --input <json> --output <json>
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .core import shape


def _load_input(path: str | None) -> Any:
    if path is None or path == "-":
        raw = sys.stdin.read()
    else:
        raw = Path(path).read_text(encoding="utf-8")
    if not raw.strip():
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive
        raise SystemExit(f"invalid JSON input: {exc}") from exc


def _print(result: dict[str, Any], out_path: str | None) -> None:
    serialized = json.dumps(result, indent=2, sort_keys=False, ensure_ascii=False)
    if out_path is None or out_path == "-":
        sys.stdout.write(serialized + "\n")
    else:
        Path(out_path).write_text(serialized + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="failure-summary-shaper",
        description=(
            "Shape build/preview failure responses + logs into a 4-line Korean "
            "user-facing summary."
        ),
    )
    parser.add_argument("--input", "-i", default=None,
                        help="Path to a JSON input file. Use '-' or omit for stdin.")
    parser.add_argument("--output", "-o", default=None,
                        help="Path to write the result JSON. Default: stdout.")
    parser.add_argument("--strict", action="store_true",
                        help="Exit with code 2 when the result is not ok.")
    args = parser.parse_args(argv)

    raw = _load_input(args.input)
    if not isinstance(raw, dict):
        raw = {}

    result = shape(raw).to_dict()
    _print(result, args.output)

    if args.strict and not result["ok"]:
        return 2
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
