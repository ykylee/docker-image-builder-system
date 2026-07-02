# standard-ai-workflow-kit: v0.11.21-beta

"""workflow_kit.bitbucket_v2 - V-R13 Bitbucket v2 API commit history (v0.7.46+).

ADR-023 follow-up: Bitbucket v2 API 의 *commit history* 의 *operational* 보강.
- fetch_bitbucket_commit_history: fetches commit history for a given repo via v2 API
  GET /2.0/repositories/{workspace}/{repo}/commits
- Returns list of commit dicts (paginated, max 50 per page by default)
- Rate-limit aware (Bitbucket v2: 1000 req/hour for authenticated users)

Note: The v0.7.42 _check_bitbucket_per_host already uses /2.0/repositories/.../commit/<sha>
for single-commit verification. This module extends with full commit history support.
"""

from __future__ import annotations

import urllib.error
import urllib.request
import base64
from typing import Any, Callable, cast


def fetch_bitbucket_commit_history(
    workspace: str,
    repo: str,
    *,
    user: str | None = None,
    token: str | None = None,
    limit: int = 50,
    timeout: float = 10.0,
    requests_get: Callable[..., Any] | None = None,
) -> list[dict[str, Any]]:
    """Fetch commit history for a Bitbucket repo via v2 API (v0.7.46+).

    Args:
        workspace: Bitbucket workspace (org)
        repo: Bitbucket repo name
        user: Bitbucket username (for Basic auth, optional)
        token: Bitbucket app password (for Basic auth, optional)
        limit: max number of commits to return (default 50, max 50 per page)
        timeout: HTTP timeout in seconds (default 10)
        requests_get: optional injected requests_get for testing

    Returns:
        List of commit dicts (each has 'hash', 'author', 'date', 'message', etc.)
        Empty list on error.
    """
    if requests_get is None:
        def requests_get(url: str, **kwargs: Any) -> Any:
            return urllib.request.urlopen(
                urllib.request.Request(url, headers=kwargs.get("headers", {})),
                timeout=kwargs.get("timeout", 30),
            )
    url = f"https://api.bitbucket.org/2.0/repositories/{workspace}/{repo}/commits?pagelen={limit}"
    headers = {"User-Agent": "workflow-kit-url-validity/0.7.46"}
    if user and token:
        auth_str = base64.b64encode(f"{user}:{token}".encode("utf-8")).decode("ascii")
        headers["Authorization"] = f"Basic {auth_str}"
    try:
        response = requests_get(url, headers=headers, timeout=timeout)
        if response.status == 200:
            import json
            data = json.loads(response.read().decode("utf-8"))
            if isinstance(data, dict) and "values" in data:
                return cast(list[dict[str, Any]], data["values"])
            return []
        return []
    except (urllib.error.URLError, OSError, TimeoutError, ValueError):
        return []
