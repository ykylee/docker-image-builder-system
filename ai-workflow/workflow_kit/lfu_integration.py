# standard-ai-workflow-kit: v0.11.21-beta

"""workflow_kit.lfu_integration - LFUConfig + _save_cache integration (v0.7.44+).

ADR-021 follow-up: LFUConfig composite score (frequency + recency) integrated with
the existing _save_cache eviction logic via a separate helper to avoid touching
the main url_validity.py file (which has been problematic to edit cleanly).

- _evict_key_with_lfu: composite score (frequency + recency) + timestamp tie
- save_cache_with_lfu: wrapper around _save_cache that uses LFUConfig tuning
"""

from __future__ import annotations

import gzip as _gzip
import json
import time
from pathlib import Path

from workflow_kit.lfu_config import LFUConfig, compute_lfu_score
from workflow_kit.url_validity import DEFAULT_CACHE_MAX_BYTES, DEFAULT_CACHE_MAX_ENTRIES, CacheEntry


def _evict_key_with_lfu(
    u: str,
    entries: dict[str, CacheEntry],
    config: LFUConfig,
) -> tuple[float, float]:
    """Compute eviction sort key for an entry using LFUConfig composite score.

    Lower tuple = more likely to evict.

    Sort: (composite_score, timestamp) where composite_score is computed via
    compute_lfu_score(access_count, age_seconds, config). Lower composite
    score = lower keep value = evicted first.
    """
    e = entries[u]
    age = time.time() - e.timestamp
    score = compute_lfu_score(e.access_count, age, config)
    return (score, e.timestamp)


def save_cache_with_lfu(
    cache_file: Path,
    entries: dict[str, CacheEntry],
    config: LFUConfig,
    max_bytes: int = DEFAULT_CACHE_MAX_BYTES,
    max_entries: int = DEFAULT_CACHE_MAX_ENTRIES,
) -> None:
    """Save cache to disk with LFUConfig-tuned eviction (v0.7.44+).

    Re-implements url_validity._save_cache's eviction logic using LFUConfig.
    Uses gzip for large caches (> 4KB), same as the original.
    """
    cache_file.parent.mkdir(parents=True, exist_ok=True)
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
    while (size > max_bytes or len(entries) > max_entries) and entries:
        victim_url = min(entries.keys(), key=lambda u: _evict_key_with_lfu(u, entries, config))
        del entries[victim_url]
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
    if size > 4096:
        cache_file.write_bytes(_gzip.compress(serialized.encode("utf-8"), compresslevel=6))
    else:
        cache_file.write_text(serialized, encoding="utf-8")
