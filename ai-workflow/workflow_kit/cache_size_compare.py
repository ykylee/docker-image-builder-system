# standard-ai-workflow-kit: v0.11.21-beta

"""workflow_kit.cache_size_compare - per-strategy cache size comparison (v0.7.46+).

ADR-024 follow-up: per-strategy cache file 의 *size comparison* 의 *operational* 보강.
- cache_size_per_strategy(base_path): returns dict[str, int] of bytes per strategy
- cache_size_per_strategy_compare(base_path): returns sorted list of (strategy, bytes) for A/B compare
- evict_lru_over_size(max_bytes, base_path): evicts LRU entries by oldest timestamp (v0.7.47+)
- evict_lfu_over_size(max_bytes, base_path): evicts LFU entries by lowest access_count (v0.7.47+)
"""

from __future__ import annotations

from pathlib import Path

from workflow_kit.url_validity import DEFAULT_CACHE_FILE, cache_file_for_strategy


def cache_size_per_strategy(base_path: Path | None = None) -> dict[str, int]:
    """Return cache file size in bytes per strategy (v0.7.46+).

    Args:
        base_path: base cache file path (default: ~/.workflow_kit/url_validity_cache.json)

    Returns:
        dict mapping strategy name to file size in bytes (0 if file doesn't exist)
    """
    base = base_path or DEFAULT_CACHE_FILE
    sizes: dict[str, int] = {}
    for strategy in ("lru", "lfu", "mixed"):
        cf = cache_file_for_strategy(base, strategy)
        if cf.exists():
            sizes[strategy] = cf.stat().st_size
        else:
            sizes[strategy] = 0
    return sizes


def cache_size_per_strategy_compare(base_path: Path | None = None) -> list[tuple[str, int]]:
    """Return sorted list of (strategy, bytes) for A/B compare (v0.7.46+).

    Returns:
        list of (strategy, bytes) sorted by bytes descending (largest first)
    """
    sizes = cache_size_per_strategy(base_path)
    return sorted(sizes.items(), key=lambda x: -x[1])


def evict_lru_over_size(max_bytes: int, base_path: Path | None = None) -> int:
    """Evict LRU cache entries to bring file size under max_bytes (v0.7.47+).

    Reads the LRU cache file, sorts entries by timestamp (oldest first), and
    deletes them one by one until the file size is under max_bytes.

    Args:
        max_bytes: target max file size in bytes
        base_path: base cache file path (default: ~/.workflow_kit/url_validity_cache.json)

    Returns:
        Number of entries evicted (0 if already under cap).
    """
    from workflow_kit.url_validity import _load_cache, _save_cache
    base = base_path or DEFAULT_CACHE_FILE
    cf = cache_file_for_strategy(base, "lru")
    if not cf.exists():
        return 0
    cache = _load_cache(cf)
    if not cache:
        return 0
    sorted_entries = sorted(
        cache.items(),
        key=lambda kv: getattr(kv[1], "timestamp", 0.0),
    )
    evicted = 0
    while sorted_entries and cf.exists() and cf.stat().st_size > max_bytes:
        url, _ = sorted_entries.pop(0)
        del cache[url]
        evicted += 1
        _save_cache(cf, cache)
    return evicted


def evict_lfu_over_size(max_bytes: int, base_path: Path | None = None) -> int:
    """Evict LFU cache entries to bring file size under max_bytes (v0.7.47+).

    Reads the LFU cache file, sorts entries by access_count (lowest first), and
    deletes them one by one until the file size is under max_bytes.

    Args:
        max_bytes: target max file size in bytes
        base_path: base cache file path (default: ~/.workflow_kit/url_validity_cache.json)

    Returns:
        Number of entries evicted (0 if already under cap).
    """
    from workflow_kit.url_validity import _load_cache, _save_cache
    base = base_path or DEFAULT_CACHE_FILE
    cf = cache_file_for_strategy(base, "lfu")
    if not cf.exists():
        return 0
    cache = _load_cache(cf)
    if not cache:
        return 0
    sorted_entries = sorted(
        cache.items(),
        key=lambda kv: getattr(kv[1], "access_count", 0),
    )
    evicted = 0
    while sorted_entries and cf.exists() and cf.stat().st_size > max_bytes:
        url, _ = sorted_entries.pop(0)
        del cache[url]
        evicted += 1
        _save_cache(cf, cache)
    return evicted
