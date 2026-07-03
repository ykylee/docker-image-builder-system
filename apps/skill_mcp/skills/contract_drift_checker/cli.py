"""contract-drift-checker CLI.

Usage::

    # 기본 검사 (저장소 루트 기준)
    cd /path/to/repo
    python3 -m apps.skill_mcp.skills.contract_drift_checker.cli

    # 입력 dict 로 enums / checkRequest override
    echo '{"enums":["buildStatuses"]}' | \\
        python3 -m apps.skill_mcp.skills.contract_drift_checker.cli --input -
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

from .core import check_drift


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
        prog="contract-drift-checker",
        description=(
            "Compare packages/shared-contract (TS) enums + BuildRequest fields "
            "with the canonical contract document and report drift."
        ),
    )
    parser.add_argument(
        "--input",
        "-i",
        default=None,
        help="Path to a JSON input file. Use '-' or omit to read from stdin.",
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
        help="Exit with code 2 when the result is not ok (drift detected).",
    )
    args = parser.parse_args(argv)

    raw = _load_input(args.input)
    if not isinstance(raw, dict):
        raw = {}

    # 저장소 루트 결정: 환경변수 > cwd (caller 의 cwd 가 저장소 루트라는 가정).
    repo_root = Path(os.environ.get("CONTRACT_DRIFT_REPO_ROOT") or ".").resolve()

    result = check_drift(raw, repo_root=repo_root).to_dict()
    _print(result, args.output)

    if args.strict and not result["ok"]:
        return 2
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
