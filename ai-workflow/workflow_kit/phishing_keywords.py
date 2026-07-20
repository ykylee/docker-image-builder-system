# standard-ai-workflow-kit: v0.15.19-beta

"""workflow_kit.phishing_keywords — V-R11 phishing keyword list with external feed support (v0.7.39+).

ADR-017 (V-R11 body audit) 의 phishing keyword detection 의 keyword list source.

Sources (fallback chain, v0.7.39+):
  1. Custom override (function argument)
  2. External feed (PhishTank-style, JSONL file or HTTPS URL)
  3. Bundled baseline (8 keywords, V-R11 v0.7.37+)

Design:
  - Pure functions, no I/O at import time
  - `load_phishing_keywords()` is the main entry point
  - `phishing_feed_update_status()` is for diagnostic
  - External feed is OPTIONAL (default: bundled only)

Usage:
    from workflow_kit.phishing_keywords import load_phishing_keywords, bundled_keywords

    kws = load_phishing_keywords()  # bundled only
    kws = load_phishing_keywords(external_feed=Path("./phishtank-feed.jsonl"))
    kws = load_phishing_keywords(custom=["your custom keyword"])

External feed format (JSONL, one keyword per line):
    {"keyword": "verify your account", "source": "phishtank", "added_at": "2026-06-16"}
    {"keyword": "click here immediately", "source": "openphish", "added_at": "2026-06-15"}
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable, Iterable


# Bundled baseline (8 keywords, V-R11 v0.7.37+, ADR-017).
# This is the default fallback if no external feed is configured.
BUNDLED_KEYWORDS: tuple[str, ...] = (
    "verify your account",
    "click here immediately",
    "your account will be suspended",
    "urgent action required",
    "confirm your password",
    "wire transfer",
    "lottery winner",
    "nigerian prince",
)


def bundled_keywords() -> tuple[str, ...]:
    """Return the bundled baseline phishing keywords (8 keywords, immutable)."""
    return BUNDLED_KEYWORDS


def _load_external_feed(feed: Path) -> list[str]:
    """Load phishing keywords from an external JSONL file.

    Format: one JSON object per line with at minimum a `keyword` field.
    Other fields (`source`, `added_at`) are ignored.

    Returns normalized keywords: lowercased, deduped (case-insensitive,
    first-occurrence preserved). Matches the lowercasing convention used
    by ``load_phishing_keywords`` for custom + bundled.

    Errors (file not found, parse error, etc.) are silently swallowed —
    external feed is OPTIONAL, and the bundled baseline is always available.
    """
    if not feed.exists():
        return []
    out: list[str] = []
    seen: set[str] = set()
    try:
        for line in feed.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                kw = obj.get("keyword")
                if isinstance(kw, str) and kw.strip():
                    norm = kw.strip().lower()
                    if norm not in seen:
                        seen.add(norm)
                        out.append(norm)
            except json.JSONDecodeError:
                continue  # skip malformed lines
    except OSError:
        return []
    return out


def load_phishing_keywords(
    external_feed: Path | None = None,
    custom: Iterable[str] | None = None,
) -> tuple[str, ...]:
    """Load phishing keywords from fallback chain (v0.7.39+).

    Order:
      1. custom (user-provided Iterable) — highest priority, deduped first
      2. external_feed (Path to JSONL file) — appended after custom
      3. bundled (BUNDLED_KEYWORDS, 8 baseline) — fallback

    Returns:
        Deduped tuple of keywords (preserving first-occurrence order).
    """
    seen: set[str] = set()
    out: list[str] = []
    for kw in custom or ():
        kw = kw.strip().lower()
        if kw and kw not in seen:
            seen.add(kw)
            out.append(kw)
    for kw in _load_external_feed(external_feed) if external_feed else []:
        kw = kw.strip().lower()
        if kw and kw not in seen:
            seen.add(kw)
            out.append(kw)
    for kw in BUNDLED_KEYWORDS:
        kw = kw.strip().lower()
        if kw and kw not in seen:
            seen.add(kw)
            out.append(kw)
    return tuple(out)


def phishing_feed_update_status(
    external_feed: Path | None = None,
) -> dict[str, object]:
    """Diagnostic: report feed file status without raising.

    Returns dict with:
      - feed_path: str (or None)
      - feed_exists: bool
      - feed_size_bytes: int
      - feed_keyword_count: int
      - bundled_count: int
      - last_modified: float (or None)
    """
    if external_feed is None:
        return {
            "feed_path": None,
            "feed_exists": False,
            "feed_size_bytes": 0,
            "feed_keyword_count": 0,
            "bundled_count": len(BUNDLED_KEYWORDS),
            "last_modified": None,
        }
    exists = external_feed.exists()
    size = external_feed.stat().st_size if exists else 0
    mtime = external_feed.stat().st_mtime if exists else None
    keywords = _load_external_feed(external_feed)
    return {
        "feed_path": str(external_feed),
        "feed_exists": exists,
        "feed_size_bytes": size,
        "feed_keyword_count": len(keywords),
        "bundled_count": len(BUNDLED_KEYWORDS),
        "last_modified": mtime,
    }


# v0.7.43+ PhishTank API integration (ADR-023 code-side)
PHISHTANK_API_BASE = "https://data.phishtank.com/data"


def fetch_phishtank_feed(
    api_key: str,
    *,
    feed_format: str = "json",
    max_retries: int = 3,
    backoff_base: float = 1.0,
    requests_get: Callable[..., Any] | None = None,
) -> list[str]:
    """Fetch PhishTank online-valid feed (v0.7.43+, ADR-023 code-side).

    Rate-limit aware: respects X-RateLimit-Remaining + X-RateLimit-Reset headers.
    On 429: waits for reset time, then retries. Up to max_retries.

    Args:
        api_key: PhishTank API key (free tier: 5 req/hour, 100 req/hour paid)
        feed_format: "json" (default) or "csv"
        max_retries: max retry count on 429/5xx (default 3)
        backoff_base: exponential backoff base in seconds (1s, 2s, 4s)
        requests_get: optional injected function for testing (mocking)

    Returns:
        List of phishing URLs (empty list on error).
    """
    if requests_get is None:
        import urllib.request as _ur
        def requests_get(url: str, **kwargs: Any) -> Any:
            return _ur.urlopen(_ur.Request(url, headers=kwargs.get("headers", {})), timeout=kwargs.get("timeout", 30))
    url = f"{PHISHTANK_API_BASE}/{api_key}/online-valid.{feed_format}"
    import time
    for attempt in range(max_retries):
        try:
            response = requests_get(url, timeout=30)
            # Check rate-limit headers
            remaining = response.headers.get("X-RateLimit-Remaining")
            reset_at = response.headers.get("X-RateLimit-Reset")
            if remaining == "0" and reset_at:
                # Wait until reset
                wait = max(0, int(reset_at) - int(time.time()))
                if wait > 0:
                    time.sleep(wait)
            if response.status == 200:
                # Parse JSON
                import json
                data = json.loads(response.read().decode("utf-8"))
                if isinstance(data, list):
                    return [entry.get("url", "") for entry in data if "url" in entry]
                return []
            elif response.status == 429:
                # Rate limited — exponential backoff
                time.sleep(backoff_base * (2 ** attempt))
                continue
            elif response.status in (500, 502, 503, 504):
                # Server error — retry
                time.sleep(backoff_base * (2 ** attempt))
                continue
            else:
                # Other errors — return empty
                return []
        except (OSError, TimeoutError, ValueError) as e:
            import sys
            print(f"WARN: PhishTank fetch attempt {attempt + 1} failed: {type(e).__name__}: {e}", file=sys.stderr)
            if attempt < max_retries - 1:
                time.sleep(backoff_base * (2 ** attempt))
                continue
            return []
    return []

# v0.7.44+ OpenPhish API integration (ADR-023 follow-up)
OPENPHISH_FEED_URL = "https://openphish.com/feed.txt"


def fetch_openphish_feed(
    *,
    max_retries: int = 3,
    backoff_base: float = 1.0,
    requests_get: Callable[..., Any] | None = None,
) -> list[str]:
    """Fetch OpenPhish free public feed (v0.7.44+, ADR-023 follow-up).

    OpenPhish is a free, real-time phishing feed. Text file with one URL per line.
    Rate-limit aware: respects X-RateLimit-Remaining + Reset.

    Args:
        max_retries: max retry count on 429/5xx (default 3)
        backoff_base: exponential backoff base in seconds (1s, 2s, 4s)
        requests_get: optional injected function for testing

    Returns:
        List of phishing URLs (empty list on error).
    """
    if requests_get is None:
        import urllib.request as _ur
        def requests_get(url: str, **kwargs: Any) -> Any:
            return _ur.urlopen(_ur.Request(url, headers=kwargs.get("headers", {})), timeout=kwargs.get("timeout", 30))
    import time
    for attempt in range(max_retries):
        try:
            response = requests_get(OPENPHISH_FEED_URL, timeout=30)
            remaining = response.headers.get("X-RateLimit-Remaining")
            reset_at = response.headers.get("X-RateLimit-Reset")
            if remaining == "0" and reset_at:
                wait = max(0, int(reset_at) - int(time.time()))
                if wait > 0:
                    time.sleep(wait)
            if response.status == 200:
                data = response.read().decode("utf-8")
                return [line.strip() for line in data.splitlines() if line.strip()]
            elif response.status == 429:
                time.sleep(backoff_base * (2 ** attempt))
                continue
            elif response.status in (500, 502, 503, 504):
                time.sleep(backoff_base * (2 ** attempt))
                continue
            else:
                return []
        except (OSError, TimeoutError, ValueError) as e:
            import sys
            print(f"WARN: OpenPhish fetch attempt {attempt + 1} failed: {type(e).__name__}: {e}", file=sys.stderr)
            if attempt < max_retries - 1:
                time.sleep(backoff_base * (2 ** attempt))
                continue
            return []
    return []

# v0.7.45+ Multi-source phishing federation (ADR-023 follow-up, FREE tier only)


def fetch_federated_phishing_urls(
    phishtank_api_key: str | None = None,
    *,
    include_phishtank: bool = True,
    include_openphish: bool = True,
    requests_get_pt: Callable[..., Any] | None = None,
    requests_get_op: Callable[..., Any] | None = None,
) -> list[str]:
    """Fetch + dedup phishing URLs from PhishTank + OpenPhish (v0.7.45+, free tier).

    Multi-source federation of 2 free phishing feeds (PhishTank free + OpenPhish free).
    Dedup is case-insensitive + URL-normalized. Returns sorted list (deterministic).

    Args:
        phishtank_api_key: PhishTank API key (free tier: 5 req/hour). Required if include_phishtank=True.
        include_phishtank: whether to include PhishTank (default True)
        include_openphish: whether to include OpenPhish (default True)
        requests_get_pt: optional injected requests_get for PhishTank (testability)
        requests_get_op: optional injected requests_get for OpenPhish (testability)

    Returns:
        Sorted, deduped list of phishing URLs.
    """
    urls: set[str] = set()
    if include_phishtank and phishtank_api_key:
        try:
            pt_urls = fetch_phishtank_feed(
                phishtank_api_key, requests_get=requests_get_pt
            )
            for u in pt_urls:
                urls.add(u.strip().lower())
        except Exception:
            pass  # silent fallback
    if include_openphish:
        try:
            op_urls = fetch_openphish_feed(requests_get=requests_get_op)
            for u in op_urls:
                urls.add(u.strip().lower())
        except Exception:
            pass  # silent fallback
    return sorted(urls)
