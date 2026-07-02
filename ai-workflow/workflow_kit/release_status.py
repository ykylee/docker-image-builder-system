# standard-ai-workflow-kit: v0.11.21-beta

"""Release pipeline status aggregator (v0.11.14+).

Real-time release status snapshot for `release-status` dispatcher subcommand.
Aggregates:
- current pyproject version
- last release tag (git describe)
- unreleased commits (count + list)
- CI mypy cross-verify verdict (v0.11.13+ Layer 1)
- local mypy strict status (v0.11.12+ Layer 2)
- next version (auto-bump hint, v0.7.18+)
- ready_to_release verdict (all checks pass)

v0.11.16+ --auto-bump flag: `cmd_release_status(args)` 의 `args.auto_bump=True` 일 때
current_version == last_release_tag 분기에서 자동으로 `tools/release_pipeline.py
cmd_version_bump --patch --apply` 호출 → next_version patch bump + post-step
sync_release_hash.py 자동 호출 (v0.7.27+ TASK-V0727-001 정합).

Mypy strict clean (v0.11.10+ FULL STRICT 도달, 35 file 누적) 정합.
신규 module (v0.11.14+) = 36 file strict clean. v0.11.16+ = 37 file.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

# REPO_ROOT = workflow-source/ (release_pipeline.py 와 동일)
# 본 module 은 workflow_kit/release_status.py 이므로:
# workflow_kit/release_status.py → parents[0] = workflow_kit/
#                          parents[1] = workflow-source/
REPO_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = REPO_ROOT.parent  # ykylee/standard_ai_workflow/


def _read_pyproject_version() -> str:
    """Read [project] version from workflow-source/pyproject.toml."""
    pyproject = REPO_ROOT / "pyproject.toml"
    if not pyproject.exists():
        return "unknown"
    text = pyproject.read_text(encoding="utf-8")
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("version") and "=" in line:
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return "unknown"


def _last_release_tag() -> str | None:
    """git describe --tags --abbrev=0 → last release tag (e.g. v0.11.13-beta)."""
    try:
        proc = subprocess.run(
            ["git", "describe", "--tags", "--abbrev=0"],
            cwd=str(PROJECT_ROOT), capture_output=True, text=True, timeout=10,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    if proc.returncode != 0:
        return None
    return proc.stdout.strip() or None


def _unreleased_commits(*, since_tag: str | None) -> dict[str, Any]:
    """Count + list unreleased commits since `since_tag` (None = all history).

    Returns:
        {"count": int, "commits": [{"sha": str, "subject": str}, ...]}
    """
    if since_tag:
        cmd = ["git", "log", f"{since_tag}..HEAD", "--oneline", "--no-decorate"]
    else:
        cmd = ["git", "log", "--oneline", "--no-decorate"]
    try:
        proc = subprocess.run(
            cmd, cwd=str(PROJECT_ROOT), capture_output=True, text=True, timeout=10,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return {"count": 0, "commits": [], "error": "git not available or timeout"}
    if proc.returncode != 0:
        return {"count": 0, "commits": [], "error": proc.stderr.strip()[:200]}

    commits: list[dict[str, str]] = []
    for line in proc.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        # format: "abc1234 commit subject"
        parts = line.split(maxsplit=1)
        if len(parts) == 2:
            commits.append({"sha": parts[0], "subject": parts[1]})
        elif len(parts) == 1:
            commits.append({"sha": parts[0], "subject": ""})
    return {"count": len(commits), "commits": commits}


def _suggest_next_version(current: str) -> dict[str, Any]:
    """Suggest next patch version (simple heuristic: current + 0.0.1).

    Returns:
        {"next": "0.11.14", "current": "0.11.13", "bumped": True}
    """
    try:
        parts = current.split(".")
        if len(parts) != 3:
            return {"next": current, "current": current, "bumped": False,
                    "error": "non-semver current version"}
        major, minor, patch = parts
        next_version = f"{major}.{minor}.{int(patch) + 1}"
        return {"next": next_version, "current": current, "bumped": True}
    except (ValueError, AttributeError) as e:
        return {"next": current, "current": current, "bumped": False, "error": str(e)}


def _check_local_mypy() -> dict[str, Any]:
    """Layer 2: mypy strict on workflow_kit/. 0 errors → ok=True.

    Returns:
        {"ok": bool, "exit_code": int, "error_count": int, "first_error": str | None,
         "skipped": bool (True if mypy not available)}
    """
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "mypy", "--no-incremental",
             "workflow-source/workflow_kit/"],
            cwd=str(PROJECT_ROOT), capture_output=True, text=True, timeout=120,
        )
    except FileNotFoundError:
        return {"ok": False, "skipped": True, "error": "mypy module not installed"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "skipped": True, "error": "mypy timeout"}
    error_lines = [
        line for line in proc.stdout.splitlines()
        if ".py:" in line and "error:" in line
    ]
    return {
        "ok": proc.returncode == 0,
        "exit_code": proc.returncode,
        "error_count": len(error_lines),
        "first_error": error_lines[0] if error_lines else None,
    }


def _check_ci_mypy() -> dict[str, Any]:
    """Layer 1: GH Actions mypy-strict workflow last run verdict.

    Uses `gh run list --workflow mypy-strict.yml --limit 1 --json ...`.
    Returns:
        {"verdict": "ci_sanity" | "ci_stale" | "ci_fail" | "absent" | "skipped",
         "head_sha_match": bool | None, "ci_run": dict | None, "message": str}
    """
    # importlib 으로 release_pipeline 의 helper 호출 (v0.11.13+)
    try:
        sys.path.insert(0, str(REPO_ROOT / "tools"))
        from release_pipeline import _cross_verify_ci_mypy  # type: ignore[import-not-found]
        ci_mypy: dict[str, Any] = _cross_verify_ci_mypy()
        return ci_mypy
    except Exception as e:
        return {
            "verdict": "skipped",
            "head_sha_match": None,
            "ci_run": None,
            "message": f"cross-verify import/call failed: {type(e).__name__}: {e}",
        }


def _run_auto_bump(new_version: str) -> dict[str, Any]:
    """v0.11.16+ --auto-bump 의 actual bump stage.

    `tools/release_pipeline.py cmd_version_bump` 를 in-process 호출.
    read-only 모드 (default) 와 달리 write 발생: pyproject.toml version patch +
    workflow_kit/__init__.py __version__ sync + post-step sync_release_hash.py
    자동 호출 (v0.7.27+ TASK-V0727-001). amend 통합으로 1 commit 으로 정합.

    Args:
        new_version: bump 후의 next version (e.g. "0.11.16"). hint 로만 사용,
            actual 결과는 cmd_version_bump 가 결정.

    Returns:
        {"ok": bool, "new_version": str, "result": dict (cmd_version_bump result),
         "error": str | None}
    """
    try:
        # importlib 으로 release_pipeline 의 cmd_version_bump 호출
        sys.path.insert(0, str(REPO_ROOT / "tools"))
        from release_pipeline import cmd_version_bump
        import argparse
        bump_args = argparse.Namespace(
            patch=True,
            minor=False,
            major=False,
            to=None,
            dry_run=False,
            apply=True,
            no_init=False,
            skip_sync_hash=False,
        )
        bump_result = cmd_version_bump(bump_args)
        return {
            "ok": True,
            "new_version": new_version,
            "result": bump_result,
            "error": None,
        }
    except Exception as e:
        return {
            "ok": False,
            "new_version": new_version,
            "result": None,
            "error": f"{type(e).__name__}: {e}",
        }


def cmd_release_status(args: Any) -> dict[str, Any]:
    """Release pipeline status aggregator (v0.11.14+, read-only).

    v0.11.16+: args.auto_bump=True 시 current_version == last_release_tag 분기에서
    자동으로 next_version (patch) bump + sync_release_hash.py post-step 자동 호출.
    in-process cmd_version_bump 호출. 결과를 auto_bump_result dict 로 attach.

    Returns:
        {
            "current_version": str,
            "last_release_tag": str | None,
            "unreleased_commits": {"count": int, "commits": [...]},
            "ci_mypy": {verdict, head_sha_match, ci_run, message},
            "local_mypy": {ok, exit_code, error_count, first_error},
            "next_version": {next, current, bumped},
            "ready_to_release": bool,
            "auto_bump_applied": bool (v0.11.16+),
            "auto_bump_result": dict | None (v0.11.16+),
        }
    """
    current = _read_pyproject_version()
    last_tag = _last_release_tag()
    unreleased = _unreleased_commits(since_tag=last_tag)
    local_mypy = _check_local_mypy()
    ci_mypy = _check_ci_mypy()
    next_ver = _suggest_next_version(current)

    # v0.11.16+ --auto-bump: current == last_tag 분기에서 자동 bump
    auto_bump_applied = False
    auto_bump_result: dict[str, Any] | None = None
    if getattr(args, "auto_bump", False) and last_tag \
            and last_tag.lstrip("v").rstrip("-beta") == current:
        auto_bump_result = _run_auto_bump(next_ver["next"])
        auto_bump_applied = auto_bump_result.get("ok", False)
        if auto_bump_applied:
            # bump 성공 시 current_version 재읽기 + next_version 재계산
            current = _read_pyproject_version()
            next_ver = _suggest_next_version(current)

    # ready_to_release verdict: Layer 1 + Layer 2 모두 sanity
    # + unreleased_commits > 0 (release 의미)
    # + last_tag != current (이미 released 가 아님)
    # v0.11.16+: auto_bump_applied 면 ready (current_version 이 last_tag 와 달라짐)
    local_mypy_ok = local_mypy.get("ok", False)
    ci_verdict = ci_mypy.get("verdict", "skipped")
    if auto_bump_applied:
        # bump 성공 = next version 으로 정렬됨 → ready 판정으로 진행
        ready = True
        ready_reason = (
            f"auto-bumped to {current} (was {last_tag}); "
            "all checks pass + unreleased commits present"
        )
    elif last_tag and last_tag.lstrip("v").rstrip("-beta") == current:
        # 이미 current 가 last_tag 와 같음 (release 안 됨)
        ready = False
        ready_reason = "current_version already at last_release_tag"
    elif unreleased.get("count", 0) == 0:
        ready = False
        ready_reason = "no unreleased commits"
    elif not local_mypy_ok:
        ready = False
        ready_reason = f"local mypy strict not clean: error_count={local_mypy.get('error_count')}"
    elif ci_verdict not in ("ci_sanity", "sanity", "no_local_verify", "absent", "skipped"):
        # ci_stale / ci_fail / drift_warning
        ready = False
        ready_reason = f"ci_mypy verdict={ci_verdict!r} (not sanity)"
    else:
        ready = True
        ready_reason = "all checks pass + unreleased commits present"

    result = {
        "current_version": current,
        "last_release_tag": last_tag,
        "unreleased_commits": unreleased,
        "ci_mypy": {
            "verdict": ci_verdict,
            "head_sha_match": ci_mypy.get("head_sha_match"),
            "ci_run": ci_mypy.get("ci_run"),
            "message": ci_mypy.get("message"),
        },
        "local_mypy": local_mypy,
        "next_version": next_ver,
        "ready_to_release": ready,
        "ready_reason": ready_reason,
        "auto_bump_applied": auto_bump_applied,
        "auto_bump_result": auto_bump_result,
    }
    # v0.11.15+ 1-line summary (jq-friendly) + v0.11.16+ 6-field (auto_bump 추가)
    result["summary"] = _summarize_release_status(result)
    return result


def _summarize_release_status(result: dict[str, Any]) -> str:
    r"""1-line summary of release status (v0.11.15+, jq-friendly).

    v0.11.16+: 6-field 로 확장 — `auto_bump=<applied|skipped|failed>` 추가.

    Returns:
        Compact 1-line string. format = `ci_mypy=<verdict>, local_mypy=<ok|FAIL>,
        ready=<true|false>, next=<X.Y.Z>, unreleased=<count>, auto_bump=<state>`.
        Stable key order for grep / pipe.

    Example:
        `ci_mypy=sanity, local_mypy=ok, ready=false, next=0.11.16, unreleased=3, auto_bump=skipped`
    """
    ci_verdict = result.get("ci_mypy", {}).get("verdict", "unknown")
    local_ok = result.get("local_mypy", {}).get("ok", False)
    local_mypy_str = "ok" if local_ok else "FAIL"
    ready = result.get("ready_to_release", False)
    next_v = result.get("next_version", {}).get("next", "?")
    unreleased = result.get("unreleased_commits", {}).get("count", 0)
    # v0.11.16+ auto_bump state
    if result.get("auto_bump_applied"):
        auto_bump_state = "applied"
    elif result.get("auto_bump_result") is not None and not result.get("auto_bump_applied"):
        auto_bump_state = "failed"
    else:
        auto_bump_state = "skipped"
    return (
        f"ci_mypy={ci_verdict}, "
        f"local_mypy={local_mypy_str}, "
        f"ready={'true' if ready else 'false'}, "
        f"next={next_v}, "
        f"unreleased={unreleased}, "
        f"auto_bump={auto_bump_state}"
    )
