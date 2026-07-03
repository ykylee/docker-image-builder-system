"""latest-build-status CLI.

사용법:
    # dryRun + fixture
    python3 -m apps.skill_mcp.mcp_servers.latest_build_status.cli \
        --input <json-path> --dry-run --fixture <fixture.json>

    # live 호출
    python3 -m apps.skill_mcp.mcp_servers.latest_build_status.cli \
        --input <json-path> --build-server-url https://build.example.com

    stdin 모드:
    echo '{"userId":"u-1","appName":"demo-app","buildId":"b-1"}' | \
        python3 -m apps.skill_mcp.mcp_servers.latest_build_status.cli --input - --dry-run --fixture fixture.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .core import fetch_latest


def _load_input(path: str | None) -> Any:
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


def _merge(
    raw: Any,
    *,
    dry_run: bool | None,
    fixture: Any | None,
    build_server_url: str | None,
) -> Any:
    """CLI flag → input dict 병합."""
    if not isinstance(raw, dict):
        return raw
    out = dict(raw)
    if dry_run is not None:
        out["dryRun"] = dry_run
    if fixture is not None:
        out["fixture"] = fixture
    if build_server_url is not None:
        out["buildServerUrl"] = build_server_url
    return out


def _print(result: dict[str, Any], out_path: str | None) -> None:
    serialized = json.dumps(result, indent=2, sort_keys=False, ensure_ascii=False)
    if out_path is None or out_path == "-":
        sys.stdout.write(serialized + "\n")
    else:
        Path(out_path).write_text(serialized + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="latest-build-status",
        description="Fetch the latest build status from a Build Server and explain it.",
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
        "--dry-run",
        action="store_true",
        help="Use the provided fixture instead of calling the Build Server.",
    )
    parser.add_argument(
        "--fixture",
        default=None,
        help="Path to a fixture JSON file. Required when --dry-run is set.",
    )
    parser.add_argument(
        "--build-server-url",
        default=None,
        help="Override buildServerUrl. Falls back to LATEST_BUILD_STATUS_DEFAULT_BASE_URL env var.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit with code 2 when the result is not ok.",
    )
    args = parser.parse_args(argv)

    raw = _load_input(args.input)

    fixture_data: Any = None
    if args.fixture is not None:
        fixture_data = _load_input(args.fixture)

    merged = _merge(
        raw,
        dry_run=(True if args.dry_run else None),
        fixture=fixture_data,
        build_server_url=args.build_server_url,
    )

    result = fetch_latest(merged).to_dict()
    _print(result, args.output)

    if args.strict and not result["ok"]:
        return 2
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
