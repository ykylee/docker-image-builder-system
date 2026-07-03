"""build-request-intake CLI.

사용법:
    python3 -m apps.skill_mcp.skills.build_request_intake.cli --input <json-path>
    cat request.json | python3 -m apps.skill_mcp.skills.build_request_intake.cli

출력은 SKILL.md §1.2 의 dict 를 JSON 으로 dump 한 형태다.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .core import shape


def _load_input(path: str | None) -> Any:
    """--input <path> 또는 stdin 에서 JSON 을 읽는다."""
    if path is None or path == "-":
        raw = sys.stdin.read()
    else:
        raw = Path(path).read_text(encoding="utf-8")
    if not raw.strip():
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:  # pragma: no cover - 방어적
        raise SystemExit(f"invalid JSON input: {exc}") from exc


def _print(result: dict[str, Any], out_path: str | None) -> None:
    """결정적 직렬화 (indent=2, sort_keys=False, ensure_ascii=False)."""
    serialized = json.dumps(result, indent=2, sort_keys=False, ensure_ascii=False)
    if out_path is None or out_path == "-":
        sys.stdout.write(serialized + "\n")
    else:
        Path(out_path).write_text(serialized + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="build-request-intake",
        description="Shape a BuildRequest payload from a free-form JSON input.",
    )
    parser.add_argument(
        "--input",
        "-i",
        default=None,
        help="Path to a JSON file. Use '-' or omit to read from stdin.",
    )
    parser.add_argument(
        "--output",
        "-o",
        default=None,
        help="Path to write the result JSON. Default: stdout.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit with code 2 when the result is not ok (errors non-empty).",
    )
    args = parser.parse_args(argv)

    raw = _load_input(args.input)
    result = shape(raw).to_dict()
    _print(result, args.output)

    if args.strict and not result["ok"]:
        return 2
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
