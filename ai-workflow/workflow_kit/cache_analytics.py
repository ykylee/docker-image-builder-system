# standard-ai-workflow-kit: v0.15.19-beta

"""workflow_kit.cache_analytics - per-strategy cross-strategy analytics (v0.7.47+).

ADR-024 follow-up: per-strategy cache 의 *cross-strategy analytics* 의 *operational* 보강.
- cache_analytics: returns dict of strategy -> {size, hit_rate, eviction_count}
- cache_analytics_summary: returns aggregate summary across strategies

Per-strategy cross-strategy analytics 의 *operational* 의 *low-friction* 정공법.
"""

from __future__ import annotations

from typing import Any


def cache_analytics(
    cache: dict[str, dict[str, Any]],
    *,
    hits_field: str = "hits",
    miss_field: str = "misses",
    eviction_field: str = "evictions",
) -> dict[str, dict[str, float | int]]:
    """Compute per-strategy analytics for a single cache dict (v0.7.47+).

    Args:
        cache: dict of url -> entry (with 'strategy', 'hits', 'misses', 'evictions' fields)
        hits_field: name of hits counter field in entry
        miss_field: name of misses counter field in entry
        eviction_field: name of evictions counter field in entry

    Returns:
        dict of strategy -> {size, hits, misses, evictions, hit_rate}
        where hit_rate = hits / (hits + misses) (0.0 if no requests)
    """
    by_strategy: dict[str, dict[str, int]] = {}
    for entry in cache.values():
        strategy = entry.get("strategy", "mixed")
        if strategy not in by_strategy:
            by_strategy[strategy] = {
                "size": 0, "hits": 0, "misses": 0, "evictions": 0,
            }
        by_strategy[strategy]["size"] += 1
        by_strategy[strategy]["hits"] += entry.get(hits_field, 0)
        by_strategy[strategy]["misses"] += entry.get(miss_field, 0)
        by_strategy[strategy]["evictions"] += entry.get(eviction_field, 0)
    result: dict[str, dict[str, float | int]] = {}
    for strategy, counts in by_strategy.items():
        total_requests = counts["hits"] + counts["misses"]
        hit_rate = (counts["hits"] / total_requests) if total_requests > 0 else 0.0
        result[strategy] = {
            "size": counts["size"],
            "hits": counts["hits"],
            "misses": counts["misses"],
            "evictions": counts["evictions"],
            "hit_rate": round(hit_rate, 4),
        }
    return result


def cache_analytics_summary(
    cache: dict[str, dict[str, Any]],
) -> dict[str, float | int | dict[str, int]]:
    """Compute aggregate summary across all strategies (v0.7.47+).

    Returns:
        dict with:
          - total_size: int
          - total_hits: int
          - total_misses: int
          - total_evictions: int
          - overall_hit_rate: float
          - lru_to_lfu_size_ratio: float (1.0 if either is 0)
          - strategies: dict[str, int] of per-strategy size
    """
    per_strategy = cache_analytics(cache)
    total_size = sum(s["size"] for s in per_strategy.values())
    total_hits = sum(s["hits"] for s in per_strategy.values())
    total_misses = sum(s["misses"] for s in per_strategy.values())
    total_evictions = sum(s["evictions"] for s in per_strategy.values())
    total_requests = total_hits + total_misses
    overall_hit_rate = (total_hits / total_requests) if total_requests > 0 else 0.0
    lru_size = per_strategy.get("lru", {}).get("size", 0)
    lfu_size = per_strategy.get("lfu", {}).get("size", 0)
    lru_to_lfu_size_ratio = (lru_size / lfu_size) if lfu_size > 0 else 1.0
    return {
        "total_size": total_size,
        "total_hits": total_hits,
        "total_misses": total_misses,
        "total_evictions": total_evictions,
        "overall_hit_rate": round(overall_hit_rate, 4),
        "lru_to_lfu_size_ratio": round(lru_to_lfu_size_ratio, 4),
        "strategies": {s: int(per_strategy[s]["size"]) for s in per_strategy},
    }
