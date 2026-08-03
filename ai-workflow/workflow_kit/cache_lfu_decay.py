# standard-ai-workflow-kit: v1.0.0-beta

"""workflow_kit.cache_lfu_decay - LFUConfig + _save_cache direct integration (v0.7.47+).

ADR-021 follow-up: LFUConfig 의 compute_lfu_score_with_decay 의 *direct* integration 보강.
- save_cache_with_decay: writes cache entries with decay-weighted LFU scores
- select_eviction_candidates_with_decay: picks eviction candidates by lowest decay score

This module wraps url_validity._save_cache (not modifies it) to avoid edit conflicts.
LFUConfig 의 direct integration 의 *low-friction* 정공법.
"""

from __future__ import annotations

import time
from typing import Any

from workflow_kit.lfu_config import LFUConfig

def save_cache_with_decay(
    cache: dict[str, dict[str, Any]],
    cache_path: str | None,
    config: LFUConfig,  # LFUConfig
    *,
    now: float | None = None,
) -> dict[str, float]:
    """Save cache entries to disk with decay-weighted LFU scores (v0.7.47+).

    Args:
        cache: dict of url -> {status, body, timestamp, access_count, ...}
        cache_path: filesystem path to write to. Pass None to skip file write
            (compute scores only — for callers that don't need persistence,
            e.g. eviction candidate selection in tests).
        config: LFUConfig instance (from workflow_kit.lfu_config)
        now: optional override for current time (for testing)

    Returns:
        dict of url -> decay_score (for inspection)
    """
    from workflow_kit.lfu_config import compute_lfu_score_with_decay
    if now is None:
        now = time.time()
    scores: dict[str, float] = {}
    for url, entry in cache.items():
        access_count = entry.get("access_count", 0)
        timestamp = entry.get("timestamp", now)
        age = max(0.0, now - timestamp)
        try:
            score = compute_lfu_score_with_decay(
                access_count=access_count, age_seconds=age, config=config,
            )
        except ValueError:
            score = float(access_count)
        scores[url] = score
    if cache_path is not None:
        _write_cache_file(cache_path, cache, scores)
    return scores


def select_eviction_candidates_with_decay(
    cache: dict[str, dict[str, Any]],
    config: LFUConfig,
    n: int,
    *,
    now: float | None = None,
) -> list[str]:
    """Pick n URLs with the lowest decay-weighted LFU scores (v0.7.47+).

    Args:
        cache: dict of url -> {status, body, timestamp, access_count, ...}
        config: LFUConfig instance
        n: number of eviction candidates to return
        now: optional override for current time (for testing)

    Returns:
        List of URLs sorted by lowest decay_score (most-evictable first).
    """
    # v0.7.57+: cache_path=None (compute-only, no file write) — 이전
    # "<in-memory>" literal string 은 test artifact 파일을 생성했음.
    scores = save_cache_with_decay(cache, None, config, now=now)
    sorted_urls = sorted(scores.items(), key=lambda kv: kv[1])
    return [url for url, _ in sorted_urls[:n]]


def _write_cache_file(
    cache_path: str,
    cache: dict[str, dict[str, Any]],
    scores: dict[str, float],
) -> None:
    """Write cache + scores to disk (helper, JSON format)."""
    import json
    import os
    os.makedirs(os.path.dirname(cache_path) or ".", exist_ok=True)
    payload = {
        "version": 1,
        "entries": cache,
        "lfu_decay_scores": scores,
    }
    with open(cache_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh)


def save_cache_lfu_decay_full(
    cache_file_path: str,
    entries: "dict[str, Any]",  # CacheEntry
    max_bytes: int,
    max_entries: int,
    config: LFUConfig,  # LFUConfig
    *,
    now: float | None = None,
    eviction_strategy: str = "mixed",
    half_life_seconds: float = 86400.0,
) -> "dict[str, dict[str, Any]]":
    """Full refactor of _save_cache using LFUConfig.compute_lfu_score_with_decay (v0.7.48+).

    Unlike v0.7.47's save_cache_with_decay (which wraps _save_cache), this is a
    standalone implementation that:
    1. Computes decay-weighted LFU scores for each entry
    2. Evicts entries with the lowest score until size/entry count are under cap
    3. Optionally applies LRU/LFU/mixed eviction strategy
    4. Returns the (possibly evcted) entries dict

    Args:
        cache_file_path: filesystem path to write to
        entries: dict of url -> CacheEntry
        max_bytes: max file size in bytes
        max_entries: max number of entries
        config: LFUConfig instance
        now: optional override for current time
        eviction_strategy: 'lru' / 'lfu' / 'mixed' (default)
        half_life_seconds: temporal decay half-life (default 86400 = 1 day)

    Returns:
        The (possibly evicted) entries dict
    """
    from workflow_kit.lfu_config import compute_lfu_score_with_decay
    import json
    if now is None:
        now = time.time()
    # Compute decay scores
    scores: dict[str, float] = {}
    for url, entry in entries.items():
        age = max(0.0, now - entry.timestamp)
        try:
            scores[url] = compute_lfu_score_with_decay(
                access_count=entry.access_count,
                age_seconds=age,
                config=config,
                half_life_seconds=half_life_seconds,
            )
        except ValueError:
            scores[url] = float(entry.access_count)
    # Evict by score (lowest first)
    evicted = 0
    while entries and (len(entries) > max_entries):
        victim = min(entries.keys(), key=lambda u: scores.get(u, 0.0))
        del entries[victim]
        evicted += 1
    # Serialize + size-based eviction loop
    raw = {
        url: {
            "timestamp": entry.timestamp,
            "issues": list(entry.issues),
            "access_count": entry.access_count,
        }
        for url, entry in entries.items()
    }
    serialized = json.dumps(raw, indent=2, sort_keys=True)
    size = len(serialized.encode("utf-8"))
    while (size > max_bytes) and entries:
        victim = min(entries.keys(), key=lambda u: scores.get(u, 0.0))
        del entries[victim]
        evicted += 1
        raw = {
            url: {
                "timestamp": entry.timestamp,
                "issues": list(entry.issues),
                "access_count": entry.access_count,
            }
            for url, entry in entries.items()
        }
        serialized = json.dumps(raw, indent=2, sort_keys=True)
        size = len(serialized.encode("utf-8"))
    # Write to disk
    import os
    os.makedirs(os.path.dirname(cache_file_path) or ".", exist_ok=True)
    with open(cache_file_path, "w", encoding="utf-8") as fh:
        fh.write(serialized)
    return entries
