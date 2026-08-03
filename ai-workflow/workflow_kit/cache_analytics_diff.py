# standard-ai-workflow-kit: v1.0.0-beta

"""workflow_kit.cache_analytics_diff - cache analytics snapshot diff (v0.7.52).

Per-strategy cache 의 *snapshot diff* 의 *operational* 보강. 두 snapshot 사이의
per-metric + per-strategy delta 를 계산.
"""

from __future__ import annotations

from typing import Any


def compute_diff(
    snap1: dict[str, Any],
    snap2: dict[str, Any],
) -> dict[str, Any]:
    """두 snapshot 사이의 diff 를 계산.

    Args:
        snap1: earlier snapshot (take_snapshot 결과)
        snap2: later snapshot

    Returns:
        dict: {from_timestamp, to_timestamp, delta_total, delta_per_strategy}
    """
    deltas: dict[str, float] = {}
    for key in ("total_size", "total_hits", "total_misses"):
        deltas[key] = float(snap2.get(key, 0)) - float(snap1.get(key, 0))
    per_strategy: dict[str, dict[str, float]] = {}
    ps1 = snap1.get("per_strategy", {})
    ps2 = snap2.get("per_strategy", {})
    for strategy in set(ps1.keys()) | set(ps2.keys()):
        s1, s2 = ps1.get(strategy, {}), ps2.get(strategy, {})
        per_strategy[strategy] = {
            "size": float(s2.get("size", 0)) - float(s1.get("size", 0)),
            "hits": float(s2.get("hits", 0)) - float(s1.get("hits", 0)),
            "misses": float(s2.get("misses", 0)) - float(s1.get("misses", 0)),
            "evictions": float(s2.get("evictions", 0)) - float(s1.get("evictions", 0)),
        }
    return {
        "from_timestamp": snap1.get("timestamp", 0.0),
        "to_timestamp": snap2.get("timestamp", 0.0),
        "delta_total": deltas,
        "delta_per_strategy": per_strategy,
    }
