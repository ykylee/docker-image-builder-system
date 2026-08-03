# standard-ai-workflow-kit: v1.0.0-beta

import json
import os
import re
from pathlib import Path
from collections.abc import Callable
from typing import cast, Dict, List, Any

from workflow_kit.common.project_docs import RECENT_DONE_ITEMS_CAP, parse_backlog, parse_handoff
from workflow_kit.common.maturity import (
    is_spec_entry,
    requires_test_path,
    roadmap_planned_contradictions,
    spec_path_of,
)

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
    #
    # v1.0.4(§2.48): 어휘 정본은 `common/maturity.py` 다. matrix 항목에는 실행 표면이
    # 없는 명세(`kind: "spec"`)가 있고, 그 규약을 아는 자리가 registry 검사 하나뿐이라
    # 이 린터는 `task-modes` 를 볼 때마다 위양성 warning 을 냈다. 명세 항목의 근거는
    # `test_path` 가 아니라 `spec_path` 라, 그쪽을 대신 확인한다.
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
        elif is_spec_entry(info):
            spec_path_str = spec_path_of(info)
            if not spec_path_str:
                warnings.append(
                    f"Entry '{skill_name}' is kind='spec' but declares no spec_path — "
                    f"명세 항목의 근거가 없다."
                )
            elif not (project_root / spec_path_str).absolute().exists():
                issues.append({
                    "type": "maturity_error",
                    "code": "missing_spec_file",
                    "description": f"Entry '{skill_name}' declares spec_path '{spec_path_str}', but the file does not exist.",
                    "severity": "high",
                    "fix_suggestion": f"Create the missing spec at {spec_path_str} or update the matrix."
                })
        elif requires_test_path(info):
            warnings.append(f"Skill '{skill_name}' is in stage '{info.get('stage')}' but has no test_path defined.")

    # 2. Check Roadmap alignment
    #
    # v1.0.4(§2.48): 예전 판정은 milestone `name` 문자열의 **포함 여부** 하나였다. 그
    # 문자열만 넣으면 roadmap 이 같은 단계를 `planned` 라고 적고 있어도 통과한다 —
    # 통과하면서 아무것도 보장하지 못하는 검사다. 언급과 **모순 없음**을 나눠 본다.
    if roadmap_path.exists():
        roadmap_content = roadmap_path.read_text(encoding="utf-8")
        milestones = matrix.get("milestones", {})

        # Check if current Roadmap phase matches In-Progress milestone
        in_progress_milestones = [name for name, m in milestones.items() if m.get("status") == "in_progress"]
        for m_name in in_progress_milestones:
            phase_name = milestones[m_name].get("name", "")
            if phase_name and phase_name not in roadmap_content:
                 issues.append({
                    "type": "maturity_error",
                    "code": "roadmap_milestone_mismatch",
                    "description": f"Milestone '{m_name}' ({phase_name}) is 'in_progress' in matrix, but not prominently mentioned as current phase in roadmap.md.",
                    "severity": "medium",
                    "fix_suggestion": "Update roadmap.md to reflect the current in-progress phase from maturity_matrix.json."
                })
            contradictions = roadmap_planned_contradictions(roadmap_content, m_name)
            if contradictions:
                issues.append({
                    "type": "maturity_error",
                    "code": "roadmap_milestone_still_planned",
                    "description": (
                        f"Milestone '{m_name}' is 'in_progress' in matrix, but roadmap.md still "
                        f"describes it as not started ({len(contradictions)} line(s)): "
                        + " / ".join(line[:120] for line in contradictions[:3])
                    ),
                    "severity": "medium",
                    "fix_suggestion": "matrix 와 roadmap 중 어느 쪽이 사실인지 정하고 양쪽을 맞춘다.",
                })

    return {
        "status": "ok" if not issues else "issues_found",
        "issues": issues,
        "warnings": warnings
    }

def _load_or_issue(
    path: Path,
    parser: Callable[[Path], Dict[str, Any]],
    *,
    name: str,
    degrades: str,
    fix: str,
) -> tuple[Dict[str, Any], Dict[str, Any] | None]:
    """문서를 읽되, 못 읽으면 **issue** 를 함께 돌려준다 (warning 으로 흘리지 않는다).

    부재와 파싱 실패를 구분한다 — 원인이 다르면 조치도 다르기 때문이다.
    어느 쪽이든 반환 dict 는 `{}` 라, 호출부의 정합 검사는 *빈 값으로* 계속 돈다.
    그 사실 자체를 issue description 에 적어 둔다.
    """
    if not path.exists():
        return {}, {
            "type": "missing_document",
            "code": "missing_required_document",
            "description": f"{name} 문서가 없다: {path} — 이 문서를 읽는 검사({degrades})가 무력화된 채 통과한다.",
            "severity": "high",
            "fix_suggestion": fix,
        }
    try:
        return parser(path), None
    except Exception as e:  # noqa: BLE001 - 파서 종류가 다양해 광범위 포착이 의도된 동작
        return {}, {
            "type": "missing_document",
            "code": "document_parse_failure",
            "description": f"{name} 문서를 읽지 못했다: {path} ({e}) — 이 문서를 읽는 검사({degrades})가 무력화된 채 통과한다.",
            "severity": "high",
            "fix_suggestion": f"문서 형식을 템플릿에 맞게 복구한다. {fix}",
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

    # v1.0.2 — 문서 부재를 warning 으로 흘리지 않는다.
    #
    # 이전에는 handoff/backlog 가 없으면 warning 한 줄만 남기고 `{}` 로 계속 진행했다.
    # 그러면 아래 정합 검사(state ↔ handoff ↔ backlog in_progress 대조)가 **빈 집합끼리
    # 비교**하게 되어 언제나 통과하고, 린터는 `status: ok / total_issues: 0` 을 냈다.
    # 실제로 이 저장소가 그 상태였다 — handoff 가 없는데 린터는 계속 green 이었고,
    # 그 사이 session-start 는 `missing_required_document` 로 아예 실행되지 못했다.
    # 검사를 무력화하는 조건은 검사 결과에 드러나야 한다.
    handoff, handoff_issue = _load_or_issue(
        handoff_path,
        parse_handoff,
        name="session_handoff",
        degrades="state ↔ handoff in_progress 대조",
        fix="세션 종료 절차(global_workflow_standard.md §8.1)대로 handoff 를 생성하거나, "
            "PROJECT_PROFILE / state.json 의 handoff 경로를 실제 파일로 맞춘다.",
    )
    if handoff_issue:
        issues.append(handoff_issue)

    backlog, backlog_issue = _load_or_issue(
        latest_backlog_path,
        parse_backlog,
        name="latest_backlog",
        degrades="state ↔ backlog in_progress 대조 + backlog 링크 검사",
        fix="오늘 날짜 backlog 를 생성하거나, state.json 의 `latest_backlog_path` 를 실제 파일로 맞춘다.",
    )
    if backlog_issue:
        issues.append(backlog_issue)

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
    # 상한 리터럴을 여기 다시 적지 않는다 — 쓰는 쪽(`sync_handoff_status`)과 조립하는
    # 쪽(`build_workflow_state_payload`)이 같은 정본을 본다. 예전에는 여기만 `10` 을
    # 들고 있어서, 상한을 바꾸면 보는 쪽만 조용히 갈라질 자리였다.
    done_items = cast("list[object]", handoff.get("recent_done_items", []))
    if len(done_items) > RECENT_DONE_ITEMS_CAP:
        issues.append({
            "type": "bloat_warning",
            "code": "handoff_bloat",
            "description": f"Handoff has {len(done_items)} recently done items.",
            "severity": "low",
            "fix_suggestion": f"backlog-update applies the cap ({RECENT_DONE_ITEMS_CAP}); drop the oldest entries if the list was written by hand."
        })

    # 3. Check for broken links in handoff/backlog (simple regex)
    for path in [handoff_path, latest_backlog_path]:
        # v1.0.2: `exists()` 는 디렉터리에도 True 라 `read_text()` 가 IsADirectoryError 로
        # 터졌고, 러너의 최상위 catch 가 그걸 runtime_error 로 바꿔 **문서 부재 issue 자체가
        # 보고되지 못했다**. 읽을 수 있는 파일일 때만 링크를 본다 — 못 읽는 사정은 위의
        # `_load_or_issue` 가 이미 issue 로 보고한다.
        if not path.is_file():
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
            "missing_documents": len([i for i in issues if i["type"] == "missing_document"]),
            "excluded_paths": excluded_paths,
        }
    }
