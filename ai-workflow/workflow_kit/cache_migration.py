# standard-ai-workflow-kit: v1.0.0-beta

"""workflow_kit.cache_migration - v0.7.41 single file -> 3 per-strategy files (v0.7.44+).

ADR-024 follow-up: per-strategy cache file 의 *full migration* 의 *operational* 보강.
- migrate_to_per_strategy_cache(base_path): reads v0.7.41 single file
  and splits into 3 per-strategy files (lru/lfu/mixed).
- The default strategy is "mixed" (entries are copied as-is to the mixed file).
- LRU/LFU-specific splitting is a v0.7.45+ follow-up (requires per-entry access_count tracking).

v0.7.57+ follow-up: cache format interop (3 신규 function)
- merge_per_strategy_to_mixed: reverse of split_to_per_strategy (LRU + LFU → mixed)
- import_csv_to_cache: import external CSV (url, status, timestamp) → cache entries
- export_cache_to_json: export cache entries → standalone JSON file (one URL per line)

Backward compat:
- If single file does not exist, returns immediately (WARN)
- If per-strategy files already exist, returns immediately (WARN)
- Original single file is DELETED on successful migration (WARN emitted)
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path
from typing import Any

from workflow_kit.url_validity import (
    DEFAULT_CACHE_FILE,
    _load_cache,
    _save_cache,
    cache_file_for_strategy,
    CacheEntry,
)
def migrate_to_per_strategy_cache(base_path: Path | None = None) -> dict[str, object]:
    """Migrate v0.7.41 single cache file to 3 per-strategy files (v0.7.44+, ADR-024 follow-up).

    Args:
        base_path: base cache file path (default: ~/.workflow_kit/url_validity_cache.json)

    Returns:
        dict with migration status:
          - migrated: bool (True if migration occurred)
          - source: str (source single file path)
          - lru_file: str (per-strategy lru file path)
          - lfu_file: str (per-strategy lfu file path)
          - mixed_file: str (per-strategy mixed file path)
          - entries_migrated: int (number of entries migrated)
    """
    base = base_path or DEFAULT_CACHE_FILE
    lru_file = cache_file_for_strategy(base, "lru")
    lfu_file = cache_file_for_strategy(base, "lfu")
    mixed_file = cache_file_for_strategy(base, "mixed")
    result = {
        "migrated": False,
        "source": str(base),
        "lru_file": str(lru_file),
        "lfu_file": str(lfu_file),
        "mixed_file": str(mixed_file),
        "entries_migrated": 0,
    }
    # If per-strategy files already exist, abort
    if lru_file.exists() or lfu_file.exists() or mixed_file.exists():
        print(f"WARN: per-strategy files already exist; skipping migration", file=sys.stderr)
        return result
    # If source does not exist, abort
    if not base.exists():
        print(f"WARN: source single file does not exist ({base}); skipping migration", file=sys.stderr)
        return result
    # Load source entries
    entries = _load_cache(base)
    if not entries:
        print(f"WARN: source single file is empty ({base}); skipping migration", file=sys.stderr)
        return result
    # Write to mixed file (default strategy)
    import json
    raw = {
        url: {
            "timestamp": entry.timestamp,
            "issues": list(entry.issues),
            "access_count": entry.access_count,
        }
        for url, entry in entries.items()
    }
    serialized = json.dumps(raw, indent=2, sort_keys=True)
    mixed_file.parent.mkdir(parents=True, exist_ok=True)
    mixed_file.write_text(serialized, encoding="utf-8")
    # Delete source
    base.unlink()
    print(f"INFO: migrated {len(entries)} entries from {base} to {mixed_file}", file=sys.stderr)
    return {
        "migrated": True,
        "source": str(base),
        "lru_file": str(lru_file),
        "lfu_file": str(lfu_file),
        "mixed_file": str(mixed_file),
        "entries_migrated": len(entries),
        "entries_migrated": len(entries),
    }


def split_to_per_strategy(
    base_path: Path | None = None,
    *,
    lfu_threshold: int = 10,
) -> dict[str, object]:
    """Split per-strategy mixed file into LRU + LFU files (v0.7.45+).

    Reads the mixed file (created by migrate_to_per_strategy_cache) and splits
    entries into 2 files:
    - LRU file: entries with access_count < lfu_threshold
    - LFU file: entries with access_count >= lfu_threshold

    Args:
        base_path: base cache file path (default: ~/.workflow_kit/url_validity_cache.json)
        lfu_threshold: access_count threshold for LFU classification (default 10)

    Returns:
        dict with split status:
          - split: bool
          - mixed_file: str
          - lru_file: str
          - lfu_file: str
          - lru_entries: int
          - lfu_entries: int
    """
    base = base_path or DEFAULT_CACHE_FILE
    lru_file = cache_file_for_strategy(base, "lru")
    lfu_file = cache_file_for_strategy(base, "lfu")
    mixed_file = cache_file_for_strategy(base, "mixed")
    result = {
        "split": False,
        "mixed_file": str(mixed_file),
        "lru_file": str(lru_file),
        "lfu_file": str(lfu_file),
        "lru_entries": 0,
        "lfu_entries": 0,
    }
    if not mixed_file.exists():
        print(f"WARN: mixed file does not exist ({mixed_file}); skipping split", file=sys.stderr)
        return result
    entries = _load_cache(mixed_file)
    if not entries:
        print(f"WARN: mixed file is empty ({mixed_file}); skipping split", file=sys.stderr)
        return result
    lru_entries: dict[str, CacheEntry] = {}
    lfu_entries: dict[str, CacheEntry] = {}
    for url, entry in entries.items():
        if entry.access_count >= lfu_threshold:
            lfu_entries[url] = entry
        else:
            lru_entries[url] = entry
    # Write LRU file
    if lru_entries:
        from workflow_kit.url_validity import _save_cache
        _save_cache(lru_file, lru_entries)
    # Write LFU file
    if lfu_entries:
        from workflow_kit.url_validity import _save_cache
        _save_cache(lfu_file, lfu_entries)
    print(
        f"INFO: split {len(entries)} entries -> {len(lru_entries)} LRU + {len(lfu_entries)} LFU "
        f"(threshold={lfu_threshold})",
        file=sys.stderr,
    )
    return {
        "split": True,
        "mixed_file": str(mixed_file),
        "lru_file": str(lru_file),
        "lfu_file": str(lfu_file),
        "lru_entries": len(lru_entries),
        "lfu_entries": len(lfu_entries),
    }


# ---------------------------------------------------------------------------
# v0.7.57+ cache format interop (3 신규 function)
# ---------------------------------------------------------------------------


def merge_per_strategy_to_mixed(
    base_path: Path | None = None,
    *,
    delete_sources: bool = False,
) -> dict[str, object]:
    """Merge per-strategy LRU + LFU files back into mixed file (v0.7.57+).

    Reverse of split_to_per_strategy. Useful for:
    - Cross-strategy analysis (single file is easier to grep)
    - Pre-migration to a different tool (e.g. single-file format)
    - Backup before per-strategy eviction runs

    Args:
        base_path: base cache file path (default: DEFAULT_CACHE_FILE)
        delete_sources: if True, delete LRU + LFU files after merge (default False)

    Returns:
        dict with merge status: merged, lru_entries, lfu_entries, total, mixed_file
    """
    base = base_path or DEFAULT_CACHE_FILE
    lru_file = cache_file_for_strategy(base, "lru")
    lfu_file = cache_file_for_strategy(base, "lfu")
    mixed_file = cache_file_for_strategy(base, "mixed")
    result: dict[str, Any] = {
        "merged": False,
        "lru_entries": 0,
        "lfu_entries": 0,
        "total": 0,
        "mixed_file": str(mixed_file),
        "delete_sources": delete_sources,
    }
    lru_entries = _load_cache(lru_file) if lru_file.exists() else {}
    lfu_entries = _load_cache(lfu_file) if lfu_file.exists() else {}
    if not lru_entries and not lfu_entries:
        print(f"WARN: no LRU/LFU files found, nothing to merge", file=sys.stderr)
        return result
    # LFU overrides LRU on conflict (LFU is the more recent / more-used strategy)
    merged: dict[str, CacheEntry] = dict(lru_entries)
    merged.update(lfu_entries)
    _save_cache(mixed_file, merged)
    result["merged"] = True
    result["lru_entries"] = len(lru_entries)
    result["lfu_entries"] = len(lfu_entries)
    result["total"] = len(merged)
    if delete_sources:
        if lru_file.exists():
            lru_file.unlink()
        if lfu_file.exists():
            lfu_file.unlink()
    print(
        f"INFO: merged {len(merged)} entries ({len(lru_entries)} LRU + {len(lfu_entries)} LFU) -> {mixed_file}",
        file=sys.stderr,
    )
    return result


def import_csv_to_cache(
    csv_path: str,
    cache_path: str | None = None,
    *,
    merge: bool = True,
) -> dict[str, object]:
    """Import URLs from CSV file into cache (v0.7.57+).

    CSV format: `url,status,timestamp` (status column optional, timestamp in epoch seconds).
    Useful for migrating from external URL validity tools.

    Args:
        csv_path: path to input CSV (must have header)
        cache_path: target cache file (default: base mixed file)
        merge: if True, merge with existing cache entries (default). If False, replace.

    Returns:
        dict with import status: imported, skipped, total_rows, cache_path
    """
    base = Path(cache_path) if cache_path else DEFAULT_CACHE_FILE
    base.parent.mkdir(parents=True, exist_ok=True)
    imported = 0
    skipped = 0
    total_rows = 0
    entries: dict[str, CacheEntry] = _load_cache(base) if merge and base.exists() else {}
    try:
        with open(csv_path, "r", newline="", encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                total_rows += 1
                url = (row.get("url") or "").strip()
                if not url:
                    skipped += 1
                    continue
                try:
                    timestamp = float(row.get("timestamp") or 0.0)
                except ValueError:
                    timestamp = 0.0
                try:
                    access_count = int(row.get("access_count") or 0)
                except ValueError:
                    access_count = 0
                # status field is optional — store as issue[] (empty)
                entries[url] = CacheEntry(
                    url=url,
                    timestamp=timestamp,
                    issues=(),
                    access_count=access_count,
                )
                imported += 1
    except (OSError, KeyError, ValueError) as e:
        print(f"ERROR: import failed: {type(e).__name__}: {e}", file=sys.stderr)
        return {
            "imported": imported,
            "skipped": skipped,
            "total_rows": total_rows,
            "cache_path": str(base),
            "error": str(e),
        }
    _save_cache(base, entries)
    return {
        "imported": imported,
        "skipped": skipped,
        "total_rows": total_rows,
        "cache_path": str(base),
        "merge": merge,
    }


def export_cache_to_json(
    output_path: str,
    cache_path: str | None = None,
    *,
    pretty: bool = True,
) -> dict[str, object]:
    """Export cache entries to a standalone JSON file (v0.7.57+).

    Format: flat dict of url -> {timestamp, issues, access_count}.
    Use case: share cache snapshot with another tool, or archive for inspection.

    Args:
        output_path: path to write JSON file
        cache_path: source cache file (default: base mixed file)
        pretty: if True, indent JSON for human readability (default)

    Returns:
        dict with export status: entries, output_path, cache_path
    """
    base = Path(cache_path) if cache_path else DEFAULT_CACHE_FILE
    if not base.exists():
        return {
            "entries": 0,
            "output_path": output_path,
            "cache_path": str(base),
            "error": "cache file does not exist",
        }
    entries = _load_cache(base)
    out: dict[str, dict[str, Any]] = {}
    for url, entry in entries.items():
        out[url] = {
            "timestamp": entry.timestamp,
            "issues": list(entry.issues),
            "access_count": entry.access_count,
        }
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as fh:
        if pretty:
            json.dump(out, fh, indent=2, sort_keys=True, ensure_ascii=False)
        else:
            json.dump(out, fh, ensure_ascii=False)
    return {
        "entries": len(out),
        "output_path": output_path,
        "cache_path": str(base),
        "pretty": pretty,
    }
