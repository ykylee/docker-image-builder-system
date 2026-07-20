# standard-ai-workflow-kit: v0.15.19-beta

"""workflow_kit.v_r13_commit_diff - V-R13 layer 2 commit-level diff (v0.7.47+).

ADR-023 follow-up: V-R13 layer 2 (?range=A..B) 의 *commit-level diff* 의 *cross-vendor* 보강.
- check_url_semantic_commit_diff_github: GitHub commits between range A..B
- check_url_semantic_commit_diff_bitbucket: Bitbucket commits between range A..B
- check_url_semantic_commit_diff_dispatch: auto-routes by URL host

Cross-vendor commit-level diff 는 v0.7.41 의 *file-level range diff* 의 *operational* 보강.
Layer 2 (?range=A..B) 의 *commit-level granularity* 의 *operational* 의 *low-friction* 정공법.
"""

from __future__ import annotations

import urllib.error
import urllib.request
import base64
from typing import Any, Callable, cast


def check_url_semantic_commit_diff_github(
    org: str,
    repo: str,
    range_a: str,
    range_b: str,
    *,
    user: str | None = None,
    token: str | None = None,
    requests_get: Callable[..., Any] | None = None,
) -> list[dict[str, Any]]:
    """Return list of commit dicts between range_a..range_b on GitHub.

    GET https://api.github.com/repos/{org}/{repo}/compare/{range_a}...{range_b}

    Args:
        org: GitHub org
        repo: GitHub repo
        range_a: earlier ref (sha/branch/tag)
        range_b: later ref (sha/branch/tag)
        user, token: GitHub PAT credentials (optional, but recommended for rate limits)
        requests_get: optional injected requests_get for testing

    Returns:
        List of commit dicts (each has 'sha', 'commit.message', 'commit.author', etc.)
        Empty list on error.
    """
    if requests_get is None:
        def requests_get(url: str, **kwargs: Any) -> Any:
            return urllib.request.urlopen(
                urllib.request.Request(url, headers=kwargs.get("headers", {})),
                timeout=kwargs.get("timeout", 30),
            )
    url = f"https://api.github.com/repos/{org}/{repo}/compare/{range_a}...{range_b}"
    headers = {"User-Agent": "workflow-kit-url-validity/0.7.47", "Accept": "application/vnd.github+json"}
    if user and token:
        auth_str = base64.b64encode(f"{user}:{token}".encode("utf-8")).decode("ascii")
        headers["Authorization"] = f"Basic {auth_str}"
    try:
        response = requests_get(url, headers=headers, timeout=10)
        if response.status == 200:
            import json
            data = json.loads(response.read().decode("utf-8"))
            if isinstance(data, dict) and "commits" in data:
                return cast(list[dict[str, Any]], data["commits"])
            return []
        return []
    except (urllib.error.URLError, OSError, TimeoutError, ValueError):
        return []


def check_url_semantic_commit_diff_bitbucket(
    workspace: str,
    repo: str,
    range_a: str,
    range_b: str,
    *,
    user: str | None = None,
    token: str | None = None,
    requests_get: Callable[..., Any] | None = None,
) -> list[dict[str, Any]]:
    """Return list of commit dicts between range_a..range_b on Bitbucket.

    GET https://api.bitbucket.org/2.0/repositories/{workspace}/{repo}/commits?since={range_a}&until={range_b}

    Args:
        workspace: Bitbucket workspace (org)
        repo: Bitbucket repo
        range_a: earlier ref (sha/branch/tag)
        range_b: later ref (sha/branch/tag)
        user, token: Bitbucket app password (optional, for authenticated higher rate limit)
        requests_get: optional injected requests_get for testing

    Returns:
        List of commit dicts (each has 'hash', 'message', 'author', 'date')
        Empty list on error.
    """
    if requests_get is None:
        def requests_get(url: str, **kwargs: Any) -> Any:
            return urllib.request.urlopen(
                urllib.request.Request(url, headers=kwargs.get("headers", {})),
                timeout=kwargs.get("timeout", 30),
            )
    url = f"https://api.bitbucket.org/2.0/repositories/{workspace}/{repo}/commits?since={range_a}&until={range_b}"
    headers = {"User-Agent": "workflow-kit-url-validity/0.7.47"}
    if user and token:
        auth_str = base64.b64encode(f"{user}:{token}".encode("utf-8")).decode("ascii")
        headers["Authorization"] = f"Basic {auth_str}"
    try:
        response = requests_get(url, headers=headers, timeout=10)
        if response.status == 200:
            import json
            data = json.loads(response.read().decode("utf-8"))
            if isinstance(data, dict) and "values" in data:
                return cast(list[dict[str, Any]], data["values"])
            return []
        return []
    except (urllib.error.URLError, OSError, TimeoutError, ValueError):
        return []


def check_url_semantic_commit_diff_dispatch(
    url: str,
    range_a: str,
    range_b: str,
    *,
    user: str | None = None,
    token: str | None = None,
    requests_get: Callable[..., Any] | None = None,
) -> list[dict[str, Any]]:
    """Auto-route commit-level diff by URL host (v0.7.47+).

    Args:
        url: V-R13 URL to determine host (e.g. https://github.com/foo/bar or https://bitbucket.org/foo/bar)
        range_a: earlier ref
        range_b: later ref
        user, token: optional credentials
        requests_get: optional injected requests_get for testing

    Returns:
        List of commit dicts from the appropriate vendor API.
        Empty list for unsupported hosts.
    """
    from urllib.parse import urlparse
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    if "github.com" in host:
        # Path: /{org}/{repo}
        parts = parsed.path.strip("/").split("/")
        if len(parts) >= 2:
            return check_url_semantic_commit_diff_github(
                org=parts[0], repo=parts[1].replace(".git", ""),
                range_a=range_a, range_b=range_b,
                user=user, token=token, requests_get=requests_get,
            )
    elif "bitbucket.org" in host:
        # Path: /{workspace}/{repo}
        parts = parsed.path.strip("/").split("/")
        if len(parts) >= 2:
            return check_url_semantic_commit_diff_bitbucket(
                workspace=parts[0], repo=parts[1].replace(".git", ""),
                range_a=range_a, range_b=range_b,
                user=user, token=token, requests_get=requests_get,
            )
    return []


# --- V-R13 layer 2 integration helpers (consolidated from
# v_r13_commit_diff_integration + v_r13_layer2_pipeline in v0.7.52 cleanup)
from dataclasses import dataclass
from urllib.parse import urlparse, parse_qs


def parse_range_from_url(url: str) -> tuple[str, str] | None:
    """Extract ?range=A..B from a V-R13 semantic URL."""
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    range_strs = qs.get("range", [])
    if not range_strs:
        return None
    parts = range_strs[0].split("..")
    if len(parts) != 2:
        return None
    return parts[0], parts[1]


def _detect_vendor(url: str) -> str:
    host = urlparse(url).netloc.lower()
    if "github.com" in host:
        return "github"
    if "bitbucket.org" in host:
        return "bitbucket"
    return "unknown"


def check_url_semantic_with_commit_diff(
    url: str,
    *,
    user: str | None = None,
    token: str | None = None,
    requests_get: Callable[..., Any] | None = None,
) -> dict[str, Any]:
    """Check V-R13 URL with commit-level diff.

    Returns dict with has_range, range_a, range_b, commit_count, commits, vendor.
    """
    range_parts = parse_range_from_url(url)
    vendor = _detect_vendor(url)
    if range_parts is None:
        return {
            "has_range": False, "range_a": None, "range_b": None,
            "commit_count": 0, "commits": [], "vendor": vendor,
        }
    range_a, range_b = range_parts
    commits = check_url_semantic_commit_diff_dispatch(
        url=url, range_a=range_a, range_b=range_b,
        user=user, token=token, requests_get=requests_get,
    )
    return {
        "has_range": True, "range_a": range_a, "range_b": range_b,
        "commit_count": len(commits), "commits": commits, "vendor": vendor,
    }


def format_commit_diff_summary(result: dict[str, Any]) -> str:
    """Format commit diff result as a human-readable summary."""
    if not result.get("has_range"):
        return f"[V-R13 layer 2] no ?range=A..B in URL (vendor={result.get('vendor', 'unknown')})"
    range_a = result.get("range_a", "?")
    range_b = result.get("range_b", "?")
    count = result.get("commit_count", 0)
    vendor = result.get("vendor", "unknown")
    return (
        f"[V-R13 layer 2] {vendor} range={range_a}..{range_b} -> {count} commits\n"
        f"  commits:\n"
        + "\n".join(
            f"    - {c.get('sha', c.get('hash', '?'))[:8]}: "
            f"{c.get('commit', {}).get('message', c.get('message', ''))[:60]}"
            for c in result.get("commits", [])
        )
    )


@dataclass
class PipelineResult:
    """V-R13 layer 2 pipeline result (consolidated from v_r13_layer2_pipeline)."""
    url: str
    has_range: bool
    range_a: str | None
    range_b: str | None
    vendor: str
    commit_count: int
    summary: str
    raw_result: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "url": self.url, "has_range": self.has_range,
            "range_a": self.range_a, "range_b": self.range_b,
            "vendor": self.vendor, "commit_count": self.commit_count,
            "summary": self.summary,
        }


def run_layer2_pipeline(
    url: str,
    *,
    user: str | None = None,
    token: str | None = None,
    requests_get: Callable[..., Any] | None = None,
) -> PipelineResult:
    """Run V-R13 layer 2 full pipeline (parse + dispatch + format)."""
    result = check_url_semantic_with_commit_diff(
        url=url, user=user, token=token, requests_get=requests_get,
    )
    return PipelineResult(
        url=url,
        has_range=result["has_range"],
        range_a=result["range_a"],
        range_b=result["range_b"],
        vendor=result["vendor"],
        commit_count=result["commit_count"],
        summary=format_commit_diff_summary(result),
        raw_result=result,
    )
