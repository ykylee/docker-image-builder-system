# standard-ai-workflow-kit: v0.11.21-beta

"""workflow_kit.cache_lfu_decay_persist - per-URL LFU decay score persistence (v0.7.49+).

ADR-021 follow-up: per-URL LFU decay score 의 *persistence* 의 *operational* 보강.
- save_decay_scores(scores, path): write per-URL decay scores to disk (JSON)
- load_decay_scores(path) -> dict[str, float]: load per-URL decay scores from disk
- update_decay_score(scores, url, score, path): update + persist single URL's score

Per-URL LFU decay score 의 *persistence* 의 *low-friction* 정공법.
Cache reload 시 *preserved score* 의 *operational* 보강.
"""

from __future__ import annotations

import json
import os
import time
from typing import Any


def save_decay_scores(
    scores: dict[str, float],
    path: str,
    *,
    now: float | None = None,
) -> None:
    """Save per-URL decay scores to disk (v0.7.49+).

    Args:
        scores: dict of url -> decay_score
        path: filesystem path
        now: optional override for current time
    """
    if now is None:
        now = time.time()
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    payload = {
        "version": 1,
        "saved_at": now,
        "scores": scores,
    }
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, sort_keys=True)


def load_decay_scores(path: str) -> dict[str, float]:
    """Load per-URL decay scores from disk (v0.7.49+).

    Args:
        path: filesystem path

    Returns:
        dict of url -> decay_score (empty dict on error or missing file)
    """
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as fh:
            payload = json.load(fh)
        if isinstance(payload, dict) and "scores" in payload:
            scores = payload["scores"]
            if isinstance(scores, dict):
                return {str(k): float(v) for k, v in scores.items()}
        return {}
    except (OSError, json.JSONDecodeError, ValueError, TypeError):
        return {}


def update_decay_score(
    scores: dict[str, float],
    url: str,
    score: float,
    path: str,
) -> dict[str, float]:
    """Update a single URL's decay score and persist (v0.7.49+).

    Args:
        scores: existing scores dict (will be updated in place)
        url: URL key
        score: new decay score
        path: filesystem path to persist to

    Returns:
        The updated scores dict
    """
    scores[url] = score
    save_decay_scores(scores, path)
    return scores


def get_decay_score(
    scores: dict[str, float],
    url: str,
    default: float = 0.0,
) -> float:
    """Get a URL's decay score with default fallback (v0.7.49+).

    Args:
        scores: scores dict
        url: URL key
        default: default value if URL not in scores

    Returns:
        The decay score (or default)
    """
    return scores.get(url, default)


def merge_decay_scores(
    *score_dicts: dict[str, float],
) -> dict[str, float]:
    """Merge multiple score dicts (later overrides earlier) (v0.7.49+).

    Args:
        *score_dicts: variable number of score dicts

    Returns:
        Merged dict
    """
    merged: dict[str, float] = {}
    for d in score_dicts:
        merged.update(d)
    return merged


def export_to_csv(scores: dict[str, float], path: str) -> None:
    """Export decay scores to CSV (v0.7.50+).

    Cross-process friendly format (spreadsheets, BI tools).
    CSV columns: url, decay_score

    Args:
        scores: dict of url -> decay_score
        path: filesystem path (.csv)
    """
    import csv
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["url", "decay_score"])
        for url in sorted(scores.keys()):
            writer.writerow([url, scores[url]])


def import_from_csv(path: str) -> dict[str, float]:
    """Import decay scores from CSV (v0.7.50+).

    Args:
        path: filesystem path (.csv)

    Returns:
        dict of url -> decay_score (empty dict on error)
    """
    import csv
    if not os.path.exists(path):
        return {}
    try:
        result: dict[str, float] = {}
        with open(path, "r", newline="", encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                url = row.get("url", "").strip()
                score_str = row.get("decay_score", "0").strip()
                if url:
                    try:
                        result[url] = float(score_str)
                    except ValueError:
                        continue
        return result
    except (OSError, csv.Error, KeyError, TypeError):
        return {}


def decay_age_scores(
    scores: dict[str, float],
    *,
    saved_at: float,
    now: float | None = None,
    half_life_seconds: float = 86400.0,
) -> dict[str, float]:
    """Apply temporal decay to scores based on age since saved_at (v0.7.51+).

    Useful for cache reload: scores saved N days ago get decayed by exp(-ln(2) * age / half_life).

    Args:
        scores: dict of url -> decay_score
        saved_at: timestamp when scores were saved (from save_decay_scores)
        now: optional override for current time
        half_life_seconds: temporal decay half-life (default 86400 = 1 day)

    Returns:
        New dict with aged scores (original is not modified)
    """
    import math
    if now is None:
        now = time.time()
    age = max(0.0, now - saved_at)
    if age <= 0.0 or half_life_seconds <= 0.0:
        return dict(scores)
    decay_factor = math.exp(-math.log(2) * age / half_life_seconds)
    return {url: score * decay_factor for url, score in scores.items()}


def decay_csv_inplace(
    path: str,
    *,
    saved_at: float,
    now: float | None = None,
    half_life_seconds: float = 86400.0,
) -> dict[str, int | float | str]:
    """Apply decay to scores in a CSV file in-place (v0.7.56+, ADR-021 follow-up).

    Reads CSV (url, decay_score), applies temporal decay, writes back to same path.
    Useful for regular cache hygiene: cron job can decay scores on disk without
    managing separate output files.

    Args:
        path: path to CSV file (must have header `url,decay_score`)
        saved_at: timestamp when scores were saved
        now: optional override for current time
        half_life_seconds: temporal decay half-life (default 86400 = 1 day)

    Returns:
        dict with: path, scores_in, scores_out, dry_run
    """
    scores = import_from_csv(path)
    decayed = decay_age_scores(
        scores,
        saved_at=saved_at,
        now=now,
        half_life_seconds=half_life_seconds,
    )
    export_to_csv(decayed, path)
    return {
        "path": path,
        "scores_in": len(scores),
        "scores_out": len(decayed),
        "saved_at": saved_at,
        "half_life_seconds": half_life_seconds,
    }
