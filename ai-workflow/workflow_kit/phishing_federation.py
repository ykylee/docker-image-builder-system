# standard-ai-workflow-kit: v1.0.0-beta

"""workflow_kit.phishing_federation - phishing URL federation (consolidated v0.7.52).

Replaces phishing_federation_v2/v3/v4/v5. Single canonical API:
- fetch_federated_phishing_urls: weighted voting with per-source weights + min_confidence
  - min_source_count param (formerly v3): equivalent to uniform weight=1.0 + min_confidence=N
  - min_confidence param (formerly v4): filter by summed weight
  - 3rd source param (formerly v5): build_default_sources accepts third_source
- build_default_sources: returns PhishTank (1.0) + OpenPhish (0.8) [+ optional 3rd]

Phishing federation evolution:
- v1 (v0.7.45): hard-coded 2 sources
- v2 (v0.7.46): extensible
- v3 (v0.7.48): cross-source verification (>= N sources)
- v4 (v0.7.49): weighted voting (per-source weights + min_confidence)
- v5 (v0.7.50): 3 source weighted voting
- v0.7.52 cleanup: 4 modules -> 1 module
"""

from typing import Callable, TypedDict, cast


class _UrlRecord(TypedDict):
    confidence: float
    sources: list[str]


def fetch_federated_phishing_urls(
    sources_with_weights: list[tuple[Callable[[], list[str]], float]],
    *,
    min_confidence: float = 0.0,
) -> list[tuple[str, float, list[str]]]:
    """Fetch + score phishing URLs with weighted voting.

    Each source has a weight. URL confidence = sum of weights for sources that
    reported it. Returns URLs with confidence >= min_confidence, sorted by
    confidence desc then URL asc.

    Args:
        sources_with_weights: list of (callable, weight) tuples
        min_confidence: filter out URLs with confidence < this threshold

    Returns:
        List of (url, confidence, source_names) tuples
    """
    url_data: dict[str, _UrlRecord] = {}
    for idx, (source, weight) in enumerate(sources_with_weights):
        source_name = f"source_{idx}"
        try:
            result = source()
        except Exception:
            continue
        for url in result:
            normalized = url.strip().lower()
            if normalized not in url_data:
                url_data[normalized] = {"confidence": 0.0, "sources": cast(list[str], [])}
            url_data[normalized]["confidence"] = float(url_data[normalized]["confidence"]) + weight
            url_data[normalized]["sources"].append(source_name)
    filtered = [
        (url, data["confidence"], data["sources"])
        for url, data in url_data.items()
        if float(data["confidence"]) >= min_confidence
    ]
    return sorted(filtered, key=lambda x: (-float(x[1]), x[0]))


def fetch_federated_phishing_urls_by_min_source_count(
    sources: list[Callable[[], list[str]]],
    min_source_count: int,
) -> list[str]:
    """Equivalent to fetch_federated_phishing_urls with uniform weight=1.0 and
    min_confidence=min_source_count. Returns flat list of high-confidence URLs.

    Args:
        sources: list of callables (no weights)
        min_source_count: minimum number of sources that must agree

    Returns:
        Sorted list of high-confidence URLs
    """
    weighted: list[tuple[Callable[[], list[str]], float]] = [(s, 1.0) for s in sources]
    result = fetch_federated_phishing_urls(weighted, min_confidence=float(min_source_count))
    return [url for url, _, _ in result]


def build_default_sources(
    phishtank_api_key: str | None = None,
    *,
    third_source: Callable[[], list[str]] | None = None,
    third_weight: float = 0.9,
    include_phishtank: bool = True,
    include_openphish: bool = True,
    include_third: bool = True,
) -> list[tuple[Callable[[], list[str]], float]]:
    """Build default source list with weights.

    PhishTank weight = 1.0, OpenPhish weight = 0.8, optional 3rd = third_weight.

    Args:
        phishtank_api_key: PhishTank API key
        third_source: optional 3rd source callable (e.g. URLhaus)
        third_weight: weight for 3rd source
        include_phishtank / include_openphish / include_third: toggle

    Returns:
        list of (callable, weight) tuples
    """
    from workflow_kit.phishing_keywords import (
        fetch_phishtank_feed,
        fetch_openphish_feed,
    )
    sources: list[tuple[Callable[[], list[str]], float]] = []
    if include_phishtank and phishtank_api_key:
        sources.append((lambda: fetch_phishtank_feed(phishtank_api_key), 1.0))
    if include_openphish:
        sources.append((fetch_openphish_feed, 0.8))
    if include_third and third_source is not None:
        sources.append((third_source, third_weight))
    return sources
