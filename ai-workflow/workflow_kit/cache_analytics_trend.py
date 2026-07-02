# standard-ai-workflow-kit: v0.11.21-beta

"""workflow_kit.cache_analytics_trend - cache analytics trend over time (v0.7.49+).

ADR-024 follow-up: per-strategy cache 의 *trend* (snapshot over time) 의 *operational* 보강.
- take_snapshot(cache, *, now) -> dict: capture current state
- compute_trend(snapshots) -> dict: compute deltas between snapshots
- save_snapshots(snapshots, path) / load_snapshots(path): persist snapshots

Trend analytics 의 *operational* 의 *low-friction* 정공법.
Cache health 의 *historical* 보강.
"""

from __future__ import annotations

import json
import os
import time
from typing import Any


def take_snapshot(
    cache: dict[str, dict[str, Any]],
    *,
    now: float | None = None,
) -> dict[str, Any]:
    """Take a snapshot of current cache state (v0.7.49+).

    Args:
        cache: dict of url -> entry
        now: optional override for current time

    Returns:
        dict with timestamp + per-strategy metrics
    """
    from workflow_kit.cache_analytics import cache_analytics
    if now is None:
        now = time.time()
    by_strategy = cache_analytics(cache)
    return {
        "timestamp": now,
        "per_strategy": by_strategy,
        "total_size": sum(s["size"] for s in by_strategy.values()),
        "total_hits": sum(s["hits"] for s in by_strategy.values()),
        "total_misses": sum(s["misses"] for s in by_strategy.values()),
    }


def compute_trend(snapshots: list[dict[str, Any]]) -> dict[str, Any]:
    """Compute trend deltas between snapshots (v0.7.49+).

    Args:
        snapshots: list of snapshot dicts (sorted by timestamp asc)

    Returns:
        dict with first/last/oldest/newest + per-metric deltas
    """
    if not snapshots:
        return {
            "snapshot_count": 0,
            "first": None,
            "last": None,
            "deltas": {},
        }
    first = snapshots[0]
    last = snapshots[-1]
    deltas: dict[str, float] = {}
    for key in ("total_size", "total_hits", "total_misses"):
        deltas[key] = last.get(key, 0) - first.get(key, 0)
    return {
        "snapshot_count": len(snapshots),
        "first": first,
        "last": last,
        "deltas": deltas,
    }


def save_snapshots(snapshots: list[dict[str, Any]], path: str) -> None:
    """Save snapshots to disk (v0.7.49+)."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    payload = {"version": 1, "snapshots": snapshots}
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, sort_keys=True)


def load_snapshots(path: str) -> list[dict[str, Any]]:
    """Load snapshots from disk (v0.7.49+)."""
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as fh:
            payload = json.load(fh)
        if isinstance(payload, dict) and "snapshots" in payload:
            snapshots = payload["snapshots"]
            if isinstance(snapshots, list):
                return snapshots
        return []
    except (OSError, json.JSONDecodeError, ValueError, TypeError):
        return []


def format_trend_summary(trend: dict[str, Any]) -> str:
    """Format trend as a human-readable summary (v0.7.49+)."""
    if trend["snapshot_count"] == 0:
        return "No snapshots available."
    lines = [
        f"Cache Trend Summary ({trend['snapshot_count']} snapshots)",
        "=" * 50,
        f"First: t={trend['first']['timestamp']:.0f} size={trend['first']['total_size']}",
        f"Last:  t={trend['last']['timestamp']:.0f} size={trend['last']['total_size']}",
        "Deltas:",
    ]
    for key, value in trend["deltas"].items():
        lines.append(f"  {key}: {value:+}")
    return "\n".join(lines)
