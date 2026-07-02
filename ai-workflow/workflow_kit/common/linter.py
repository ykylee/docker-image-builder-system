# standard-ai-workflow-kit: v0.11.21-beta

import json
import os
import re
from pathlib import Path
from typing import cast, Dict, List, Any

from workflow_kit.common.project_docs import parse_backlog, parse_handoff

# v0.7.15+: excluded_paths glob match helper. v0.7.7 deferred #4 해소.
def _is_excluded(path: Path, excluded_patterns: List[str]) -> bool:
    """path 가 excluded_patterns 중 하나와 match 하는지 확인.

    각 pattern 을 glob 으로 처리. Path.match() 는 * 와 ** 모두 지원 (3.13+ glob).
    """
    if not excluded_patterns:
        return False
    posix_path = path.as_posix()
    for pattern in excluded_patterns:
        # glob pattern: * matches single segment, ** matches recursive
        # simple fnmatch-style check: try Path.match first, then fallback
        try:
            if path.match(pattern):
                return True
        except (ValueError, TypeError):
            pass
        # Also check if any parent path matches
        for parent in path.parents:
            if parent.match(pattern):
                return True
        # Posix path match for ** patterns
        if "**" in pattern:
            # Convert ** to .* for regex
            regex = pattern.replace(".", r"\.").replace("**", ".*").replace("*", "[^/]*")
            if re.match(f"^{regex}$", posix_path):
                return True
    return False


def check_maturity_consistency(
    matrix_path: Path,
    roadmap_path: Path,
    project_root: Path
) -> Dict[str, Any]:
    issues = []
    warnings = []

    if not matrix_path.exists():
        return {"status": "skipped", "reason": "maturity_matrix.json not found"}

    try:
        matrix = json.loads(matrix_path.read_text(encoding="utf-8"))
    except Exception as e:
        return {"status": "error", "error_code": "matrix_json_load_failure", "description": f"Failed to load maturity_matrix.json: {e}"}

    # 1. Check test_path existence
    skills = matrix.get("skills", {})
    for skill_name, info in skills.items():
        test_path_str = info.get("test_path")
        if test_path_str:
            # v0.7.22+ symlink-aware: .resolve() → .absolute() (mavis data dir 격리 환경 fix)
            test_path = (project_root / test_path_str).absolute()
            if not test_path.exists():
                issues.append({
                    "type": "maturity_error",
                    "code": "missing_test_file",
                    "description": f"Skill '{skill_name}' declares test_path '{test_path_str}', but the file does not exist.",
                    "severity": "high",
                    "fix_suggestion": f"Create the missing test file at {test_path_str} or update the matrix."
                })
        elif info.get("stage") in ["beta", "stable"]:
            warnings.append(f"Skill '{skill_name}' is in stage '{info.get('stage')}' but has no test_path defined.")

    # 2. Check Roadmap alignment (Basic Check)
    if roadmap_path.exists():
        roadmap_content = roadmap_path.read_text(encoding="utf-8")
        milestones = matrix.get("milestones", {})

        # Check if current Roadmap phase matches In-Progress milestone
        in_progress_milestones = [name for name, m in milestones.items() if m.get("status") == "in_progress"]
        for m_name in in_progress_milestones:
            # Simple check: Does the roadmap mention the in-progress phase name?
            phase_name = milestones[m_name].get("name", "")
            if phase_name and phase_name not in roadmap_content:
                 issues.append({
                    "type": "maturity_error",
                    "code": "roadmap_milestone_mismatch",
                    "description": f"Milestone '{m_name}' ({phase_name}) is 'in_progress' in matrix, but not prominently mentioned as current phase in roadmap.md.",
                    "severity": "medium",
                    "fix_suggestion": "Update roadmap.md to reflect the current in-progress phase from maturity_matrix.json."
                })

    return {
        "status": "ok" if not issues else "issues_found",
        "issues": issues,
        "warnings": warnings
    }

def check_workflow_consistency(
    state_json_path: Path,
    handoff_path: Path,
    latest_backlog_path: Path,
    *,
    excluded_paths: List[str] | None = None,
) -> Dict[str, Any]:
    """workflow 3 source (state / handoff / backlog) 정합 검증.

    Args:
        state_json_path: state.json 경로
        handoff_path: session_handoff.md 경로
        latest_backlog_path: latest backlog 경로
        excluded_paths: broken link check skip glob list. v0.7.15+: [tool.workflow-doctor]
            의 ``excluded_paths`` field 적용. None 이면 empty list.
    """
    issues = []
    warnings = []
    excluded_paths = excluded_paths or []

    # Load data
    try:
        if not state_json_path.exists():
            return {"status": "error", "error_code": "missing_state_json", "description": "state.json file not found"}
        state = json.loads(state_json_path.read_text(encoding="utf-8"))
    except Exception as e:
        return {"status": "error", "error_code": "state_json_load_failure", "description": f"Failed to load state.json: {e}"}

    try:
        handoff = parse_handoff(handoff_path)
    except Exception as e:
        warnings.append(f"Failed to parse handoff: {e}")
        handoff = {}

    try:
        backlog = parse_backlog(latest_backlog_path)
    except Exception as e:
        warnings.append(f"Failed to parse backlog: {e}")
        backlog = {}

    # 1. Check in_progress consistency
    # backlog/handoff/state 의 dict type 이 dict[str, object] 로 추정 → .get 결과 object.
    # 명시적 list[str] cast 후 item.startswith / split 가능.
    backlog_in_progress_raw = backlog.get("in_progress_items", [])
    handoff_in_progress_raw = handoff.get("in_progress_items", [])
    state_in_progress_raw = state.get("session", {}).get("in_progress_items", [])
    backlog_in_progress = {item.split()[0] for item in cast(list[str], backlog_in_progress_raw) if item.startswith("TASK-")}
    handoff_in_progress = {item.split()[0] for item in cast(list[str], handoff_in_progress_raw) if item.startswith("TASK-") and "N/A" not in item}
    state_in_progress = {item.split()[0] for item in cast(list[str], state_in_progress_raw) if item.startswith("TASK-") and "N/A" not in item}

    all_tasks = backlog_in_progress | handoff_in_progress | state_in_progress
    for task in all_tasks:
        missing = []
        if task not in backlog_in_progress: missing.append("backlog")
        if task not in handoff_in_progress: missing.append("handoff")
        if task not in state_in_progress: missing.append("state.json")

        if missing:
            issues.append({
                "type": "sync_error",
                "code": "task_status_mismatch",
                "description": f"Task {task} is inconsistent. Missing in: {', '.join(missing)}",
                "severity": "medium",
                "fix_suggestion": f"Ensure {task} is listed in all three core documents."
            })

    # 2. Check for bloat in handoff
    done_items = cast("list[object]", handoff.get("recent_done_items", []))
    if len(done_items) > 10:
        issues.append({
            "type": "bloat_warning",
            "code": "handoff_bloat",
            "description": f"Handoff has {len(done_items)} recently done items.",
            "severity": "low",
            "fix_suggestion": "Move older tasks to baseline summary and keep only last 5-10 in recently done."
        })

    # 3. Check for broken links in handoff/backlog (simple regex)
    for path in [handoff_path, latest_backlog_path]:
        if not path.exists():
            continue
        content = path.read_text(encoding="utf-8")
        links = re.findall(r"\[.*?\]\((.*?)\)", content)
        for link in links:
            if link.startswith("http") or link.startswith("#") or not link.strip():
                continue
            # Handle relative links
            try:
                # Remove query or fragments if any
                clean_link = link.split("#")[0].split("?")[0]
                # v0.7.22+ symlink-aware: .resolve() 는 symlink 따라가서
                # mavis data dir 격리 (e.g. .mavis -> .minimax symlink) + macOS
                # /var symlink 환경에서 *정상 relative path* 를 *broken* 으로
                # false-positive 보고. .absolute() 는 symlink 보존 + cwd 기준
                # 정규화만 — 즉 *user 가 작성한 relative path* 가 그대로 유지됨.
                link_path = (path.parent / clean_link).absolute()
                # v0.11.20 fix: `..` segment 정규화 (v0.7.22+ 의 `.absolute()` 가
                # `..` 를 풀지 않아 `/tmp/x/foo/../../bar.md` 형태 그대로 `.exists()`
                # → False. `os.path.normpath` 로 정규화 후 검증 — symlink 따라가지
                # 않으면서 `..` 만 풀어서 false-positive 해소. workflow-linter smoke
                # test 의 `[README](../../../../README.md)` 케이스가 정확히 이 패턴.
                normalized_path = Path(os.path.normpath(str(link_path)))
                # v0.7.15+: excluded_paths glob match 시 broken link check skip
                if excluded_paths and _is_excluded(normalized_path, excluded_paths):
                    continue
                if not normalized_path.exists():
                    issues.append({
                        "type": "broken_link",
                        "code": "file_not_found",
                        "description": f"Broken link in {path.name}: {link}",
                        "severity": "medium",
                        "fix_suggestion": f"Fix the relative path or create the missing file: {link}"
                    })
            except Exception:
                warnings.append(f"Invalid link format detected in {path.name}: {link}")

    return {
        "status": "ok" if not issues else "issues_found",
        "issues": issues,
        "warnings": warnings,
        "summary": {
            "total_issues": len(issues),
            "sync_errors": len([i for i in issues if i["type"] == "sync_error"]),
            "broken_links": len([i for i in issues if i["type"] == "broken_link"]),
            "bloat_warnings": len([i for i in issues if i["type"] == "bloat_warning"]),
            "excluded_paths": excluded_paths,
        }
    }
