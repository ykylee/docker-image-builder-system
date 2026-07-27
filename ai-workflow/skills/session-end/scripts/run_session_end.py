# standard-ai-workflow-kit: v0.15.19-beta

#!/usr/bin/env python3
"""Prototype runner for the session-end skill.

세션 종료 시점에 workflow 메타 정합성을 가드 5종으로 검증하고
drift 를 사전 검출한다. 본 skill 의 도입 사례 — 2026-07-27 세션의
"워크트리 v0.7.0 vs HEAD v0.8.12" 사각지대.

가드 5종:
- G1: state.json JSON 유효
- G2: current_baseline 최신성 (vs HEAD latest tag)
- G3: state.session.rev_* 정합 (vs session_handoff / work_backlog / 일일 백로그 의 rev N)
- G4: state.backlog.latest_backlog_path 정합 (vs backlog/ 의 실제 최신 YYYY-MM-DD.md)
- G5: 5종 package.json 통일 (build-server / build-monitor / shared-contract / shared-config / db)

기본 모드 (apply=false) 는 read-only drift 검출만 한다.
apply=true 일 때만 G3/G4/G5 를 안전한 보정한다. G2 / G1 은 자동 수정 불가.

자세한 스펙: ../../core/session_end_skill_spec.md
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

# 기존 session-start / doc-sync 와 동형 import 경로.
# 표준 키트가 REPO_ROOT/workflow-source/ 아래 분리돼 있으면 거기서,
# 본 워크스페이스처럼 REPO_ROOT/ai-workflow/workflow_kit/ 에 통합돼 있으면 그 *부모* 를 sys.path 에 추가.
REPO_ROOT = Path(__file__).resolve().parents[4]
SOURCE_ROOT = REPO_ROOT / "workflow-source"
LOCAL_KIT_PARENT = REPO_ROOT / "ai-workflow"  # contains workflow_kit/ subdir
for candidate in (SOURCE_ROOT, LOCAL_KIT_PARENT):
    if candidate.is_dir() and (candidate / "workflow_kit").is_dir() and str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

try:
    from workflow_kit import __version__ as TOOL_VERSION
except Exception:  # 표준 키트가 분리돼 있는 경우의 fallback.
    TOOL_VERSION = "v0.15.19-beta"

from workflow_kit.common.errors import build_error_result
from workflow_kit.common.contracts.stage_gate_runtime import (
    build_stage_completion,
    merge_into_result,
)


# 가드 5종 ID — SKILL.md / spec.md 와 동기화 필수.
GUARD_IDS = ("G1", "G2", "G3", "G4", "G5")

# G5 가드의 5종 package.json 경로 (workspace_root 기준 상대).
PACKAGE_JSON_PATHS = (
    "apps/build-server/package.json",
    "apps/build-monitor/package.json",
    "packages/shared-contract/package.json",
    "packages/shared-config/package.json",
    "packages/db/package.json",
)


# ----------------------------- 가드 구현 -----------------------------

def _read_text(path: Path) -> str | None:
    """파일 읽기. 실패 시 None."""
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return None


def _git_describe_tags(workspace_root: Path) -> str | None:
    """HEAD 의 가장 최신 tag (semver 형식). 실패 시 None."""
    try:
        result = subprocess.run(
            ["git", "-C", str(workspace_root), "describe", "--tags", "--abbrev=0", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
            timeout=10,
        )
        tag = result.stdout.strip()
        return tag if tag else None
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError):
        return None


def _extract_latest_rev_in_text(text: str) -> int | None:
    """session_handoff.md / work_backlog.md / 일일 백로그 의 "현재 rev N" 추출.

    우선순위:
    1. `## 핵심 (rev N)` 헤더 — session_handoff.md 의 현재 rev.
    2. `최종 수정일 ... rev N→M` 패턴의 M — work_backlog.md / 일일 백로그.
    3. `rev N:` (status/rev line) 의 N.

    본문 안에 흩어진 historical 동기화 로그 (`state purpose_digest_rev 196→197` 등) 는
    의도적으로 무시한다 — 이건 *historical 기록* 이지 "현재 rev" 가 아니다.
    """
    candidates: list[int] = []

    # 1. `## 핵심 (rev N)` 헤더라인.
    for m in re.finditer(r"##\s*핵심[^(]*\(rev\s+(\d+)\)", text):
        candidates.append(int(m.group(1)))
    if candidates:
        return max(candidates)

    # 2. `최종 수정일 ... rev N→M` 또는 `rev N→M: ...` 패턴의 M.
    #    `(rev N→M)` 형태를 우선, 콜론 뒤 공백/콜론 둘 다 허용.
    for m in re.finditer(r"\(rev\s+\d+\s*→\s*(\d+)\s*:", text):
        candidates.append(int(m.group(1)))
    if candidates:
        return max(candidates)

    # 3. `rev N:` 패턴 (라인 시작 또는 괄호 안). 일일 백로그의 `rev 1: 신규...` 등.
    #    `(rev N→M: ...)` 가 첫 우선순위였지만 매칭 0 일 때만 fallback.
    for m in re.finditer(r"\brev\s+(\d+)\s*:", text):
        candidates.append(int(m.group(1)))
    if candidates:
        return max(candidates)

    return None


def _latest_daily_backlog(backlog_dir: Path) -> str | None:
    """backlog/ 디렉터리의 가장 최신 YYYY-MM-DD.md 파일명 (basename)."""
    if not backlog_dir.is_dir():
        return None
    dates: list[tuple[str, str]] = []
    for child in backlog_dir.iterdir():
        name = child.name
        if re.match(r"^\d{4}-\d{2}-\d{2}\.md$", name):
            dates.append((name, name[:10]))
    if not dates:
        return None
    # 가장 최신 날짜 선택.
    dates.sort(key=lambda x: x[1], reverse=True)
    return dates[0][0]


# --- 가드 5종 ---

def guard_g1_state_json_valid(state_path: Path) -> dict[str, Any]:
    """G1: state.json JSON 유효. 실패 시 lineno 포함."""
    try:
        with state_path.open("r", encoding="utf-8") as f:
            json.load(f)
    except json.JSONDecodeError as e:
        return {"id": "G1", "status": "fail",
                "message": f"state.json: JSON parse failed (line {e.lineno}): {e.msg}"}
    except FileNotFoundError:
        return {"id": "G1", "status": "fail",
                "message": f"state.json: not found at {state_path}"}
    except Exception as e:
        return {"id": "G1", "status": "fail",
                "message": f"state.json: read failed ({type(e).__name__}: {e})"}
    return {"id": "G1", "status": "pass", "message": "state.json JSON 유효"}


def guard_g2_current_baseline(state: dict[str, Any], workspace_root: Path) -> dict[str, Any]:
    """G2: current_baseline 의 semver vs HEAD latest tag 일치.

    schema 위치: state.session.current_baseline 또는 state.current_baseline (둘 중 하나).
    """
    tag = _git_describe_tags(workspace_root)
    if tag is None:
        return {"id": "G2", "status": "fail",
                "message": "git describe --tags failed — tag 없음, semver 비교 skip"}

    # state.session.current_baseline 또는 state.current_baseline 둘 중 하나.
    session_obj = state.get("session", {}) if isinstance(state.get("session"), dict) else {}
    raw = session_obj.get("current_baseline") or state.get("current_baseline", "")
    m = re.search(r"\*\*v(\d+\.\d+\.\d+)", str(raw))
    state_ver = m.group(1) if m else None

    # tag 의 `vX.Y.Z` 패턴 (혹시 bare semver 일 수도 있음).
    tag_m = re.match(r"^v?(\d+\.\d+\.\d+)", tag)
    tag_ver = tag_m.group(1) if tag_m else None

    if state_ver is None:
        return {"id": "G2", "status": "fail",
                "message": f"current_baseline semver 추출 실패 (raw={raw[:80]!r})"}

    if tag_ver is None:
        return {"id": "G2", "status": "fail",
                "message": f"HEAD tag semver 추출 실패 (tag={tag!r})"}

    if state_ver != tag_ver:
        return {"id": "G2", "status": "fail",
                "message": f"current_baseline=v{state_ver} but HEAD latest tag=v{tag_ver} (drift)"}

    return {"id": "G2", "status": "pass",
            "message": f"current_baseline=v{state_ver} == HEAD latest tag=v{tag_ver}"}


def guard_g3_rev_consistency(
    state: dict[str, Any],
    session_handoff_path: Path,
    work_backlog_index_path: Path,
    latest_backlog_path: Path | None,
) -> dict[str, Any]:
    """G3: state.session.{handoff_rev,index_rev,latest_rev} vs 각 .md 파일의 rev N 정합."""
    session_obj = state.get("session", {})
    state_handoff = session_obj.get("handoff_rev")
    state_index = session_obj.get("index_rev")
    state_latest = session_obj.get("latest_rev")

    actual_handoff = None
    actual_index = None
    actual_latest = None

    # handoff
    text = _read_text(session_handoff_path)
    if text is not None:
        actual_handoff = _extract_latest_rev_in_text(text)

    # work_backlog index
    text = _read_text(work_backlog_index_path)
    if text is not None:
        actual_index = _extract_latest_rev_in_text(text)

    # 일일 백로그
    if latest_backlog_path is not None and latest_backlog_path.exists():
        text = _read_text(latest_backlog_path)
        if text is not None:
            actual_latest = _extract_latest_rev_in_text(text)

    diffs = []
    for label, state_val, actual_val in (
        ("handoff_rev", state_handoff, actual_handoff),
        ("index_rev", state_index, actual_index),
        ("latest_rev", state_latest, actual_latest),
    ):
        if state_val is None or actual_val is None:
            diffs.append(f"{label}=<missing:state={state_val} actual={actual_val}>")
        elif state_val != actual_val:
            diffs.append(f"{label}=state:{state_val} actual:{actual_val}")

    if diffs:
        return {"id": "G3", "status": "fail",
                "message": "rev drift: " + "; ".join(diffs)}

    return {"id": "G3", "status": "pass",
            "message": f"rev 정합 (handoff={state_handoff} index={state_index} latest={state_latest})"}


def guard_g4_latest_backlog_path(state: dict[str, Any], backlog_dir: Path) -> dict[str, Any]:
    """G4: state.backlog.latest_backlog_path == backlog/ 의 실제 최신 YYYY-MM-DD.md.

    schema 위치: state.backlog.latest_backlog_path 또는 state.source_of_truth.latest_backlog_path.
    """
    backlog_obj = state.get("backlog", {}) if isinstance(state.get("backlog"), dict) else {}
    sot = state.get("source_of_truth", {}) if isinstance(state.get("source_of_truth"), dict) else {}
    state_path_str = backlog_obj.get("latest_backlog_path") or sot.get("latest_backlog_path") or ""

    actual_name = _latest_daily_backlog(backlog_dir)
    if actual_name is None:
        return {"id": "G4", "status": "fail",
                "message": "no YYYY-MM-DD.md in backlog/ — 신규 프로젝트일 수 있음"}

    # state_path 의 basename 또는 끝 segment 와 비교.
    state_basename = Path(state_path_str).name if state_path_str else ""
    if state_basename != actual_name:
        return {"id": "G4", "status": "fail",
                "message": f"latest_backlog_path={state_basename or '<empty>'} but actual={actual_name} (drift)"}

    return {"id": "G4", "status": "pass",
            "message": f"latest_backlog_path={actual_name} matches actual latest"}


def guard_g5_package_json_uniformity(workspace_root: Path) -> dict[str, Any]:
    """G5: 5종 package.json 의 version field 통일."""
    versions: dict[str, str | None] = {}
    for rel in PACKAGE_JSON_PATHS:
        pj_path = workspace_root / rel
        if not pj_path.exists():
            versions[rel] = None
            continue
        text = _read_text(pj_path)
        if text is None:
            versions[rel] = None
            continue
        m = re.search(r'"version"\s*:\s*"([^"]+)"', text)
        versions[rel] = m.group(1) if m else None

    missing = [k for k, v in versions.items() if v is None]
    present_values = [v for v in versions.values() if v is not None]
    distinct = set(present_values)

    if missing:
        return {"id": "G5", "status": "fail",
                "message": f"5 package.json 중 missing: {missing}; versions={dict(versions)}"}

    if len(distinct) > 1:
        return {"id": "G5", "status": "fail",
                "message": f"5 package.json drift: versions={dict(versions)}"}

    common = present_values[0]
    return {"id": "G5", "status": "pass",
            "message": f"5 package.json 통일: version={common}"}


# ----------------------------- apply 모드 -----------------------------

def apply_g3_g4_g5(
    state_path: Path,
    workspace_root: Path,
    session_handoff_path: Path,
    work_backlog_index_path: Path,
    state_obj: dict[str, Any],
    applied: list[str],
) -> None:
    """G3/G4/G5 안전 보정. G2/G1 은 자동 수정 불가.

    변경 전 각 파일을 *.bak.<timestamp> 으로 백업한다.
    """
    ts = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_suffix = f".bak.{ts}"

    # G3 보정.
    actual_handoff = None
    actual_index = None
    actual_latest = None
    text = _read_text(session_handoff_path)
    if text is not None:
        actual_handoff = _extract_latest_rev_in_text(text)
    text = _read_text(work_backlog_index_path)
    if text is not None:
        actual_index = _extract_latest_rev_in_text(text)
    backlog_dir = workspace_root / "ai-workflow/memory/active/backlog"
    actual_backlog_name = _latest_daily_backlog(backlog_dir)
    if actual_backlog_name is not None:
        latest_backlog_path = backlog_dir / actual_backlog_name
        text = _read_text(latest_backlog_path)
        if text is not None:
            actual_latest = _extract_latest_rev_in_text(text)

    session = state_obj.setdefault("session", {})
    session_changed = False
    if actual_handoff is not None and session.get("handoff_rev") != actual_handoff:
        session["handoff_rev"] = actual_handoff
        session_changed = True
        applied.append(f"G3: handoff_rev -> {actual_handoff}")
    if actual_index is not None and session.get("index_rev") != actual_index:
        session["index_rev"] = actual_index
        session_changed = True
        applied.append(f"G3: index_rev -> {actual_index}")
    if actual_latest is not None and session.get("latest_rev") != actual_latest:
        session["latest_rev"] = actual_latest
        session_changed = True
        applied.append(f"G3: latest_rev -> {actual_latest}")

    # G4 보정. 두 위치 (state.backlog / state.source_of_truth) 동시 갱신.
    expected_path = f"ai-workflow/memory/active/backlog/{actual_backlog_name}" if actual_backlog_name else None
    if expected_path is not None:
        backlog = state_obj.setdefault("backlog", {})
        if backlog.get("latest_backlog_path") != expected_path:
            backlog["latest_backlog_path"] = expected_path
            session_changed = True
            applied.append(f"G4: backlog.latest_backlog_path -> {expected_path}")
        sot = state_obj.setdefault("source_of_truth", {})
        if sot.get("latest_backlog_path") != expected_path:
            sot["latest_backlog_path"] = expected_path
            session_changed = True
            applied.append(f"G4: source_of_truth.latest_backlog_path -> {expected_path}")

    # state.json 저장 (필요 시).
    if session_changed:
        backup = state_path.with_suffix(state_path.suffix + backup_suffix)
        shutil.copy2(state_path, backup)
        with state_path.open("w", encoding="utf-8") as f:
            json.dump(state_obj, f, ensure_ascii=False, indent=2)
            f.write("\n")
        applied.append(f"G3/G4: state.json 백업 {backup.name} 후 저장")

    # G5 보정.
    versions = {}
    for rel in PACKAGE_JSON_PATHS:
        pj_path = workspace_root / rel
        if pj_path.exists():
            text = _read_text(pj_path)
            if text:
                m = re.search(r'"version"\s*:\s*"([^"]+)"', text)
                if m:
                    versions[rel] = m.group(1)
    if versions and len(set(versions.values())) > 1:
        # 다수값 또는 가장 최신 tag 의 semver 로 통일.
        # 여기서는 "최빈값 + 없으면 첫 번째" 사용.
        from collections import Counter
        common = Counter(versions.values()).most_common(1)[0][0]
        for rel, cur in versions.items():
            if cur != common:
                pj_path = workspace_root / rel
                backup = pj_path.with_suffix(pj_path.suffix + backup_suffix)
                shutil.copy2(pj_path, backup)
                new_text = re.sub(
                    r'("version"\s*:\s*")[^"]+(")',
                    rf'\g<1>{common}\g<2>',
                    _read_text(pj_path) or "",
                    count=1,
                )
                pj_path.write_text(new_text, encoding="utf-8")
                applied.append(f"G5: {rel} version {cur} -> {common} (backup {backup.name})")


# ----------------------------- 메인 진입점 -----------------------------

def run(args: argparse.Namespace) -> dict[str, Any]:
    """가드 5종 실행 후 stage_completion 포함 결과 반환."""
    warnings: list[str] = []
    applied: list[str] = []

    workspace_root = Path(args.workspace_root).resolve()
    if not workspace_root.is_dir():
        return build_error_result(
            f"workspace_root 가 디렉터리가 아닙니다: {workspace_root}",
            stage_name="session-end",
        )

    state_path = (workspace_root / args.state_path).resolve() if not Path(args.state_path).is_absolute() else Path(args.state_path)
    if not state_path.exists():
        return build_error_result(
            f"state.json 부재: {state_path}",
            stage_name="session-end",
        )

    memory_dir = workspace_root / "ai-workflow/memory/active"
    session_handoff_path = memory_dir / "session_handoff.md"
    work_backlog_index_path = memory_dir / "work_backlog.md"

    # G1.
    g1 = guard_g1_state_json_valid(state_path)
    if g1["status"] == "fail":
        # G1 fail 이면 후속 가드 skip.
        guards = [g1]
        for gid in GUARD_IDS[1:]:
            guards.append({"id": gid, "status": "skip",
                           "message": f"G1 fail → {gid} skip"})
        warnings.append("G1 fail → G2~G5 skip")
        passed = False
        drift_items = [g["id"] for g in guards if g["status"] == "fail"]
        summary = f"1/5 guard fail (G1 JSON parse error) — 즉시 state.json 복구 필요"
        next_actions = [
            "state.json JSON 수정 후 재실행",
            "수정 어려우면 git checkout HEAD -- ai-workflow/memory/active/state.json 으로 복원",
        ]
    else:
        # state.json 파싱.
        with state_path.open("r", encoding="utf-8") as f:
            state_obj = json.load(f)

        # G2.
        g2 = guard_g2_current_baseline(state_obj, workspace_root)

        # G3 (latest_backlog_path 는 G4 에서 산출).
        backlog_dir = memory_dir / "backlog"
        actual_latest_backlog_name = _latest_daily_backlog(backlog_dir)
        actual_latest_backlog_path = backlog_dir / actual_latest_backlog_name if actual_latest_backlog_name else None
        g3 = guard_g3_rev_consistency(
            state_obj,
            session_handoff_path,
            work_backlog_index_path,
            actual_latest_backlog_path,
        )

        # G4.
        g4 = guard_g4_latest_backlog_path(state_obj, backlog_dir)

        # G5.
        g5 = guard_g5_package_json_uniformity(workspace_root)

        guards = [g1, g2, g3, g4, g5]
        passed = all(g["status"] == "pass" for g in guards)
        drift_items = [g["id"] for g in guards if g["status"] == "fail"]

        n_fail = len(drift_items)
        if passed:
            summary = "5/5 guard pass — workflow meta 정합"
            next_actions = ["세션 종료 가능"]
        else:
            summary = f"{n_fail}/5 guard fail — drift detected"
            next_actions = []
            if "G2" in drift_items:
                next_actions.append("current_baseline 을 HEAD latest tag 와 정합 (사용자 결정)")
            if "G3" in drift_items:
                next_actions.append("session handoff/work_backlog 의 rev N 과 state.rev_* 정합 (apply 가능)")
            if "G4" in drift_items:
                next_actions.append("latest_backlog_path 를 실제 최신 일일 백로그로 정합 (apply 가능)")
            if "G5" in drift_items:
                next_actions.append("5종 package.json version 통일 (apply 가능)")

        # apply 모드 보정.
        if args.apply:
            if not args.approval_actor:
                warnings.append("apply=true 이지만 --approval-actor 미지정 — 보정 skip")
            else:
                apply_g3_g4_g5(
                    state_path=state_path,
                    workspace_root=workspace_root,
                    session_handoff_path=session_handoff_path,
                    work_backlog_index_path=work_backlog_index_path,
                    state_obj=state_obj,
                    applied=applied,
                )

    # G2~G5 중 skip 인 항목의 warnings 기록.
    for g in guards:
        if g["status"] == "fail":
            warnings.append(g["message"])

    result: dict[str, Any] = {
        "summary": summary,
        "guards": guards,
        "passed": passed,
        "drift_items": drift_items,
        "next_actions": next_actions,
        "warnings": warnings,
    }

    if applied:
        result["applied_actions"] = applied

    # stage_completion 부착.
    stage_status = "ok" if passed else ("error" if "G1" in drift_items else "warning")
    artifact_paths = [
        "ai-workflow/memory/active/state.json",
        "ai-workflow/memory/active/session_handoff.md",
        "ai-workflow/memory/active/work_backlog.md",
        "ai-workflow/memory/active/backlog",
    ]
    completion = build_stage_completion(
        stage_name="session-end",
        stage_status=stage_status,
        next_stage=None,
        approval_actor=args.approval_actor if args.apply else None,
        approval_timestamp=_dt.datetime.now(_dt.timezone.utc).isoformat() if args.apply else None,
        artifacts=artifact_paths,
        notes=[f"{len(drift_items)} drift(s) detected" if not passed else "all guards pass"],
    )
    result = merge_into_result(result, completion)

    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="session-end prototype — workflow meta drift 검출")
    parser.add_argument("--workspace-root", required=True,
                        help="프로젝트 루트 절대/상대 경로")
    parser.add_argument("--state-path", default="ai-workflow/memory/active/state.json",
                        help="state.json 경로 (workspace_root 기준)")
    parser.add_argument("--today", default=None,
                        help="YYYY-MM-DD (미지정 시 시스템 오늘)")
    parser.add_argument("--apply", action="store_true",
                        help="G3/G4/G5 안전 보정 적용 (G2/G1 자동 수정 불가)")
    parser.add_argument("--approval-actor", default=None,
                        help="apply 모드에서 approval_actor (보통 $USER)")
    parser.add_argument("--json", action="store_true",
                        help="JSON 출력만 (사람용 summary 숨김)")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    result = run(args)

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        # 사람이 읽기 좋은 형식.
        print(f"=== session-end ===")
        print(f"summary: {result['summary']}")
        for g in result["guards"]:
            mark = "✓" if g["status"] == "pass" else ("✗" if g["status"] == "fail" else "·")
            print(f"  {mark} {g['id']}: {g['message']}")
        if result.get("next_actions"):
            print(f"\nnext_actions:")
            for a in result["next_actions"]:
                print(f"  - {a}")
        if result.get("warnings"):
            print(f"\nwarnings:")
            for w in result["warnings"]:
                print(f"  - {w}")
        if result.get("applied_actions"):
            print(f"\napplied:")
            for a in result["applied_actions"]:
                print(f"  - {a}")
        if "stage_completion" in result:
            sc = result["stage_completion"]
            print(f"\nstage_completion: {sc.get('stage_status')} (approval={sc.get('approval_actor')})")

    # exit code: passed 면 0, drift 면 1 (CI/pre-push hook 용).
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
