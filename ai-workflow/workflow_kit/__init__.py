"""Reusable library modules for the standard AI workflow kit.

Public API surface (v0.8.0+ stable API frozen):
    - ``__version__`` is the single source of truth (parsed from pyproject.toml).
    - ``__all__`` lists the public top-level submodules + ``__version__``.
    - Internal subpackages (``common.*``, ``server.*``, ``contract_v1.*``,
      ``cli.*``, ``harness.*``) are importable but have no stability guarantee.

SemVer 2-year guarantee (v0.8.0 -> 2.0.0): no breaking changes.
Deprecation policy: 1 release DeprecationWarning -> 1 release removal.

Cumulative mypy strict clean file count (v0.8.0 spec §5.3 단계적 격상 정합):
    - v0.8.0~v0.8.15: 19 file strict clean (url_validity, okf_import, okf_export,
      phishing_federation+_v4, phishing_keywords, cache_lfu_decay+_persist,
      workflow_kit_cli.py, v_r13_commit_diff, cache_analytics+_trend_chart,
      upgrade_diff, bitbucket_v2, lfu_integration, cache_size_compare,
      state/builder.py, contracts/baselines.py, common/__init__.py 외)
    - v0.11.0 cycle 3 (TASK-V1110-001): + purpose_ingest.py
    - v0.11.1 cycle 4 (TASK-V1111-001): + purpose_graph.py
    - v0.11.3 누적: 21 file strict clean (mypy 2.1.0 strict 기준)
    - v0.11.4 누적: 23 file strict clean
      v0.11.3 21 + v0.11.4 13-14단계 (output_contracts + milestones) = 23 file
    - v0.11.5 누적: 25 file strict clean
      v0.11.4 23 + v0.11.5 15-16단계 (decorators + linter) = 25 file
    - v0.11.6 누적: 27 file strict clean
      v0.11.5 25 + v0.11.6 17-18단계 (session_outputs + read_only_bundle) = 27 file
    - v0.11.7 누적: 29 file strict clean
      v0.11.6 27 + v0.11.7 19-20단계 (workflow_kit_cli + doc_sync) = 29 file
    - v0.11.8 누적: 31 file strict clean
      v0.11.7 29 + v0.11.8 21-22단계 (read_only_mcp_sdk + workflow_writes) = 31 file
    - v0.11.9 누적: 33 file strict clean
      v0.11.8 31 + v0.11.9 23-24단계 (testing + runner) = 33 file
    - v0.11.10 누적: 35 file strict clean
      v0.11.9 33 + v0.11.10 25-26단계 (project_docs + profiling) = 35 file
      🎯 FULL mypy strict 도달 (전체 workflow_kit/ 0 errors)
    - v0.11.14 누적: 36 file strict clean
      v0.11.10 35 + v0.11.14 27단계 (release_status.py 신규) = 36 file
    - v0.11.16 누적: 36 file strict clean (유지)
      v0.11.14 36 + v0.11.16 28단계 (release_status.py --auto-bump 확장, 신규 file 0)
      = 36 file (기존 release_status.py 의 in-place 확장)
    - v0.13.1 누적: 36 file strict clean (Phase 13 AC2 telemetry 후속, in-place 확장)
      신규 file 0 (state/memory_index.py 의 telemetry helpers 는 기존 file 내 in-scope)
      단, telemetry schemas (MemoryIndexTelemetryEvent/Summary) 는 schemas layer 로
      격상 (workflow_kit/common/schemas/memory_index.py in-place 확장).
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

from . import (
    bitbucket_v2,
    cache_analytics,
    cache_analytics_alerting,
    cache_analytics_diff,
    cache_analytics_trend,
    cache_analytics_trend_chart,
    cache_dashboard,
    cache_lfu_decay,
    cache_lfu_decay_persist,
    cache_migration,
    cache_size_compare,
    constants,
    lfu_config,
    lfu_integration,
    okf_export,
    okf_import,
    path_resolver,
    phishing_federation,
    phishing_keywords,
    release_status,
    upgrade_diff,
    url_validity,
    v_r13_commit_diff,
    workflow_kit_cli,
)

__all__: list[str] = [
    # version
    "__version__",
    # public re-exports (stable, v0.8.0 frozen)
    "bitbucket_v2",
    "cache_analytics",
    "cache_analytics_alerting",
    "cache_analytics_diff",
    "cache_analytics_trend",
    "cache_analytics_trend_chart",
    "cache_dashboard",
    "cache_lfu_decay",
    "cache_lfu_decay_persist",
    "cache_migration",
    "cache_size_compare",
    "constants",
    "lfu_config",
    "lfu_integration",
    "okf_export",
    "okf_import",
    "path_resolver",
    "phishing_federation",
    "phishing_keywords",
    "release_status",
    "upgrade_diff",
    "url_validity",
    "v_r13_commit_diff",
    "workflow_kit_cli",
]


def _read_pyproject_version() -> str:
    """Parse version from ``pyproject.toml`` ``[project] version`` field.

    Fallback chain (per spec v0.8.0 section 4.3):
        1. ``pyproject.toml`` (SSOT) - works in source tree.
        2. ``importlib.metadata`` - works for installed distribution.
        3. Literal ``"v0.14.0-beta"`` - loud fallback when both fail.
    """
    # 1. pyproject.toml (SSOT)
    pyproject: Path = Path(__file__).parent.parent / "pyproject.toml"
    if pyproject.is_file():
        try:
            if sys.version_info >= (3, 11):
                import tomllib
            else:
                import tomli as tomllib
            with pyproject.open("rb") as f:
                data: dict[str, Any] = tomllib.load(f)
            version: Any = data.get("project", {}).get("version")
            if isinstance(version, str) and version:
                return f"v{version}-beta"
        except Exception:
            pass

    # 2. importlib.metadata (installed distribution)
    try:
        from importlib import metadata

        return f"v{metadata.version('standard-ai-workflow')}-beta"
    except Exception:
        pass

    # 3. Loud fallback (spec section 4.3)
    return "v0.15.20-beta"


__version__: str = _read_pyproject_version()
