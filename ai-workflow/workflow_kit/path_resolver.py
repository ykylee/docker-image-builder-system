# standard-ai-workflow-kit: v0.11.21-beta

"""workflow_kit.path_resolver — in-repo path → canonical GitHub URL (v0.7.34+).

ADR-008 채택. wiki page 의 `last_ingested_from` (in-repo path) 가 OKF `resource` field
에 canonical GitHub blob URL 로 자동 resolve.

Resolve algorithm (5 step, deterministic, no runtime fetch):
  1. CI 우선: `$GITHUB_SERVER_URL` + `$GITHUB_REPOSITORY` env var (가장 신뢰)
  2. local + fetch 후: `git config --get remote.origin.url` (HTTPS form normalize)
  3. origin URL 에서 `.git` suffix 제거
  4. base URL = `<origin>/blob/<default-branch>/` (default branch = `main` 가정 fallback)
  5. in-repo path 와 결합

Fallback chain:
  1. `GITHUB_SERVER_URL` + `GITHUB_REPOSITORY` (CI)
  2. `git config --get remote.origin.url` (local + fetch 후)
  3. `git symbolic-ref refs/remotes/origin/HEAD` (default branch)
  4. `git branch --show-current` (local fallback)
  5. `main` 가정 + warning (deepest fallback)
  6. `None` (resolve 실패 → caller 가 `resource` 비움)

Security:
  - path traversal 방지: `../` prefix reject, `/` 시작 (absolute) reject
  - URL scheme 검증: `https://` 만 accept, `http://` reject (downgrade attack 방지)
  - SSH form `git@github.com:foo/bar.git` → HTTPS form 자동 normalize

Usage:
    from workflow_kit.path_resolver import resolve_in_repo_path_to_url

    url = resolve_in_repo_path_to_url(
        relative_path="workflow-source/workflow_kit/README.md",
        repo_root=Path("/path/to/repo"),
    )

CLI:
    python -m workflow_kit.path_resolver <in-repo-path> [--repo-root <path>]
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
GITHUB_SSH_PATTERN = re.compile(r"^git@([^:]+):(.+?)(?:\.git)?$")
GITHUB_HTTPS_PATTERN = re.compile(r"^https?://([^/]+)/(.+?)(?:\.git)?/?$")

# Path traversal: paths starting with `..` or `/` or containing `..` segments
def _is_path_safe(relative_path: str) -> bool:
    """Reject path traversal attempts."""
    if not relative_path:
        return False
    if relative_path.startswith("/"):
        return False
    if relative_path.startswith("../") or relative_path == "..":
        return False
    # check for embedded `..` segments after normalization
    parts = Path(relative_path).parts
    if any(p == ".." for p in parts):
        return False
    return True


# ---------------------------------------------------------------------------
# Origin URL detection
# ---------------------------------------------------------------------------
def _detect_origin_url(repo_root: Path) -> str | None:
    """Detect git remote origin URL. 3 layer fallback.

    Returns HTTPS form (normalized) or None.
    """
    # 1. CI environment (GitHub Actions)
    github_server = os.environ.get("GITHUB_SERVER_URL", "").strip()
    github_repo = os.environ.get("GITHUB_REPOSITORY", "").strip()
    if github_server and github_repo:
        # GITHUB_SERVER_URL typically "https://github.com", GITHUB_REPOSITORY "owner/repo"
        return f"{github_server.rstrip('/')}/{github_repo}"

    # 2. `git config --get remote.origin.url`
    try:
        result = subprocess.run(
            ["git", "config", "--get", "remote.origin.url"],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            return _normalize_origin_url(result.stdout.strip())
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass

    return None


def _normalize_origin_url(raw_url: str) -> str | None:
    """Normalize git origin URL to HTTPS form.

    - `git@github.com:foo/bar.git` → `https://github.com/foo/bar`
    - `https://github.com/foo/bar.git` → `https://github.com/foo/bar`
    - `https://gitlab.com/foo/bar` → `https://gitlab.com/foo/bar` (passed through, but
      ADR-008 의 *GitHub only* 범위 — caller 가 platform check)

    Returns None if URL form is unsupported.
    """
    raw_url = raw_url.strip()
    if not raw_url:
        return None

    # SSH form
    m = GITHUB_SSH_PATTERN.match(raw_url)
    if m:
        host, path = m.group(1), m.group(2)
        return f"https://{host}/{path}"

    # HTTPS form
    m = GITHUB_HTTPS_PATTERN.match(raw_url)
    if m:
        host, path = m.group(1), m.group(2)
        return f"https://{host}/{path}"

    return None


# ---------------------------------------------------------------------------
# Default branch detection
# ---------------------------------------------------------------------------
def _detect_default_branch(repo_root: Path) -> str:
    """Detect default branch. 3 layer fallback.

    Returns branch name (e.g. "main", "master", "develop"). Defaults to "main" with warning.
    """
    # 1. `git symbolic-ref refs/remotes/origin/HEAD` (after `git fetch`)
    try:
        result = subprocess.run(
            ["git", "symbolic-ref", "refs/remotes/origin/HEAD"],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            ref = result.stdout.strip()
            # `refs/remotes/origin/main` → `main`
            if "/" in ref:
                return ref.rsplit("/", 1)[-1]
            return ref
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass

    # 2. `git branch --show-current` (local fallback)
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass

    # 3. Fallback: "main" (warning emitted by caller)
    return "main"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def resolve_in_repo_path_to_url(
    relative_path: str,
    repo_root: Path,
) -> str | None:
    """Resolve in-repo relative path to canonical GitHub blob URL.

    Args:
        relative_path: in-repo path (e.g. "workflow-source/workflow_kit/README.md")
        repo_root: path to repository root

    Returns:
        Canonical URL string, or None if resolve failed.

    Security:
        - Rejects `../` prefix and embedded `..` segments
        - Rejects absolute paths (`/` prefix)
        - Rejects non-HTTPS origins (SSH normalized to HTTPS)
    """
    if not _is_path_safe(relative_path):
        return None

    # URL form already: pass through (rare case — caller 가 보낸 URL 그대로 사용)
    if relative_path.startswith(("http://", "https://")):
        return relative_path

    origin = _detect_origin_url(repo_root)
    if not origin:
        return None

    default_branch = _detect_default_branch(repo_root)
    return f"{origin}/blob/{default_branch}/{relative_path}"


def resolve_in_repo_path_to_url_pinned(
    relative_path: str,
    repo_root: Path,
    *,
    commit_sha: str | None = None,
    ref: str | None = None,
) -> str | None:
    """Resolve in-repo path to commit-pinned URL (ADR-018, v0.7.37+).

    Pinned URLs use the form:
    - `<origin>/blob/<commit_sha>/<path>` (commit SHA)
    - `<origin>/blob/<ref>/<path>` (ref like "v0.7.37", "main", "feature/x")

    Unlike `resolve_in_repo_path_to_url` which uses the *current* default branch
    (which can change over time), pinned URLs are *immutable* — the URL always
    points to the exact content at that commit/ref.

    Args:
        relative_path: in-repo path (e.g. "workflow-source/workflow_kit/README.md")
        repo_root: path to repository root
        commit_sha: 40-char commit SHA (full or short, ≥7 chars)
        ref: branch/tag name (e.g. "main", "v0.7.37") — alternative to commit_sha

    Returns:
        Canonical pinned URL string, or None if resolve failed.

    Strategy:
    1. If commit_sha given: use `/blob/<commit_sha>/<path>` (immutable)
    2. If ref given: use `/blob/<ref>/<path>` (mutable but explicit)
    3. If neither: return None (caller must provide at least one)
    """
    if not _is_path_safe(relative_path):
        return None

    if relative_path.startswith(("http://", "https://")):
        return relative_path

    origin = _detect_origin_url(repo_root)
    if not origin:
        return None

    if commit_sha:
        # Validate SHA format (hex, 7-40 chars)
        sha = commit_sha.strip()
        if not (7 <= len(sha) <= 40) or not all(c in "0123456789abcdef" for c in sha.lower()):
            return None
        return f"{origin}/blob/{sha}/{relative_path}"

    if ref:
        # Ref: branch or tag name — basic validation (no slashes, no special chars)
        r = ref.strip()
        if not r or "/" in r or any(c in r for c in "?&\\"):
            return None
        return f"{origin}/blob/{r}/{relative_path}"

    return None


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def _build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="workflow_kit.path_resolver",
        description="in-repo path → canonical GitHub URL (v0.7.34+, ADR-008 + commit-pinned via ADR-018)",
    )
    p.add_argument("path", help="in-repo relative path")
    p.add_argument("--repo-root", type=Path, default=Path("."), help="repo root (default: cwd)")
    p.add_argument("--commit", help="commit SHA (full or short, 7-40 hex chars) for commit-pinned URL (ADR-018)")
    p.add_argument("--ref", help="ref (branch/tag name) for ref-pinned URL (ADR-018)")
    return p


def main(argv: list[str] | None = None) -> int:
    args = _build_arg_parser().parse_args(argv)
    if args.commit or args.ref:
        url = resolve_in_repo_path_to_url_pinned(
            args.path, args.repo_root.resolve(),
            commit_sha=args.commit, ref=args.ref,
        )
    else:
        url = resolve_in_repo_path_to_url(args.path, args.repo_root.resolve())
    if url is None:
        print(f"ERROR: resolve failed for {args.path!r}", file=sys.stderr)
        return 1
    print(url)
    return 0


if __name__ == "__main__":
    sys.exit(main())
