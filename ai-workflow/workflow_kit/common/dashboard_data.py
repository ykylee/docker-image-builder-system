"""workflow_kit.common.dashboard_data - Quality Dashboard 5-panel data collector (v0.13.0).

Phase 13 (Operational Intelligence v1.0) 의 sub-milestone v0.13.0 첫 deliverable.
본 모듈은 *read-only* — 5 panel 의 운영 metric 을 단일 dict 로 수집하여
``workflow_kit_cli --command=dashboard --format=json`` 으로 노출한다.

Panel 구성 (ai-workflow/wiki/topics/quality-dashboard-implementation-guide.md §2 정합):
    1. drift_prevention: drift guard 6 case PASS/FAIL + last_updated delta + smoke count
    2. maturity_distribution: skill / mcp_tools stage 분포 (stable / beta / alpha)
    3. memory_index_utilization: entries 갯수 + cue_anchor frequency + cumulative timeline
    4. smoke_trend: 누적 smoke count + 최근 release 의 smoke fail 갯수
    5. recent_releases: state.json.session.recent_done_items 시각화용 timeline

Acceptance criteria (구현 가이드 §4 정합):
    AC1: collect_dashboard_snapshot 가 5 panel 의 data 를 1 dict 로 emit
    AC2: 5 panel 모두 *실제 data* (fixture 아님) 기반
    AC3: release --apply 시 자동 emit (v0.13.1 sub-milestone — 본 모듈은 read-only 만)
    AC4: snapshot 의 last_updated ≤ release commit date (data freshness)

Public API:
    collect_dashboard_snapshot(workspace_root) -> dict[str, Any]
    render_dashboard_markdown(snapshot) -> str  (v0.13.0 무료 옵션; v0.13.1 release hook 의 preview)

본 모듈은 Pydantic schema 를 사용하지 않고 plain dict 를 emit 한다.
이유: dashboard 의 consumer (release note, wiki, dashboard HTML) 가 *schema-validation
없이 자유롭게 field 추가 / 소비* 할 수 있도록. Pydantic schema 가 필요한 경우
``workflow_kit.common.schemas.dashboard`` (후속 release) 로 분리.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Final

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Release note 의 누적 smoke count 패턴 (Beta-v0.11.25.md §검증 정합).
# 형식 1: "누적 smoke test **N/N PASS**" (v0.13.0 정공법)
# 형식 2: "누적 smoke **N+ PASS**" (v0.14.1+ 슬랙 표기 — `test` token 생략 + `N+` 표기)
#   parse 시 N+ 표기는 (N, N) 으로 정규화 (pass = total 가정, 실제 100% pass 정합)
# 형식 3: "누적 ... smoke ... **N/N PASS**" (forward-compat alias)
SMOKE_COUNT_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"누적\s+(?:[\w\s]*?\s+)?smoke\s+(?:test\s+)?\*\*(\d+)(?:/(\d+)|\+)\s+PASS\*\*"
)

# smoke_trend panel 의 default release note top-N
DEFAULT_RECENT_RELEASES: Final[int] = 10

# drift_prevention panel 의 expected guard case 갯수 (v0.11.23 cycle 4-layer, v0.11.25 6/6 정합)
EXPECTED_DRIFT_GUARD_CASES: Final[int] = 6

# smoke_trend panel 의 minimal panel value (v0.11.25 cycle 의 누적 smoke 정합)
MIN_EXPECTED_SMOKE: Final[int] = 1

# drift prevention smoke 의 출력 line pattern (check_drift_prevention_v0_11_23.py §main 정합).
DRIFT_GUARD_PASS_LINE: Final[re.Pattern[str]] = re.compile(r"^\s*PASS:\s*(\S+)\s*$")
DRIFT_GUARD_FAIL_LINE: Final[re.Pattern[str]] = re.compile(r"^\s*FAIL:\s*(\S+)\s*$")
DRIFT_GUARD_SUMMARY: Final[re.Pattern[str]] = re.compile(
    r"===\s*(PASS|FAIL):\s*(\d+)/(\d+)\s*==="
)
# drift smoke 의 inline 실행 timeout (default: 30초 — git log + 6 case subprocess 호출)
DRIFT_GUARD_INLINE_TIMEOUT: Final[int] = 30


# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------


def _repo_root(workspace_root: Path | str | None) -> Path:
    """workspace_root 가 주어지지 않으면 REPO 부모 디렉토리로 fallback.

    표준화 정공법: caller 가 명시한 workspace_root 가 우선 (테스트 용이성).
    caller 가 미지정 시 ``workflow-source`` 의 부모 디렉토리 (REPO_ROOT) 를 반환.
    str path 도 허용 (test caller 용이성).

    Args:
        workspace_root: REPO_ROOT (Path) / git repo root 또는 "string path" / None.
    """
    if isinstance(workspace_root, str):
        candidate: Path | None = Path(workspace_root)
    elif workspace_root is None:
        candidate = None
    else:
        candidate = workspace_root
    if candidate is not None:
        return candidate
    # workflow-source/workflow_kit/common/dashboard_data.py → 4 단계 위 = REPO_ROOT
    return Path(__file__).resolve().parents[3]


# ---------------------------------------------------------------------------
# Panel 1 — Drift Prevention Status
# ---------------------------------------------------------------------------


def collect_drift_prevention(
    workspace_root: Path,
    *,
    inline_guard: bool = True,
) -> dict[str, Any]:
    """drift prevention guard 의 현재 상태를 1 dict 로 emit.

    Args:
        workspace_root: REPO_ROOT or subdir
        inline_guard: True (default) 면 drift smoke 를 subprocess 로 호출하여
            ``guard_status`` 를 ``'pass' | 'fail' | 'error'`` 로 emit.
            False 면 ``guard_status = 'unknown'`` (legacy v0.13.0 behavior).

    Fields:
        guard_status: 'pass' | 'fail' | 'error' | 'unknown' (inline 실행 결과)
        guard_cases_pass: pass 한 case 갯수 (inline 실행 시)
        guard_cases_fail: fail 한 case 갯수 (inline 실행 시)
        guard_cases: 총 guard case 갯수 (expected = 6)
        expected_cases: EXPECTED_DRIFT_GUARD_CASES 정합
        guard_failure_names: fail case 의 name list (drift 발생 시)
        guard_executed_at: inline 실행 timestamp (ISO 8601)
        guard_runtime_ms: inline 실행 소요 시간 (ms)
        maturity_last_updated: maturity_matrix.json 의 last_updated (ISO date)
        maturity_last_updated_source: 'maturity_matrix.json'
        harness_supported_count: harness.supported 리스트 길이
        head_commit_date: HEAD commit 의 ISO date (subprocess git log -1)
        last_updated_delta_days: maturity_last_updated ↔ head_commit_date 의 일수 차이
        silent_failing_cycles_count: Phase 13 AC1 의 north-star metric (현 release 까지 0)

    Returns:
        dict — Panel 1 의 data shape. field 누락 시 *unknown* marker 사용.
    """
    root = _repo_root(workspace_root)
    maturity_path = root / "workflow-source" / "core" / "maturity_matrix.json"

    maturity_last_updated = ""
    harness_supported_count = 0
    if maturity_path.is_file():
        try:
            with maturity_path.open("r", encoding="utf-8") as fp:
                mm = json.load(fp)
            maturity_last_updated = str(mm.get("last_updated", ""))
            harnesses_obj = mm.get("harnesses", {})
            if isinstance(harnesses_obj, dict):
                supported = harnesses_obj.get("supported", [])
                if isinstance(supported, list):
                    harness_supported_count = len(supported)
        except (OSError, json.JSONDecodeError):
            # silent fallback — unknown marker 로 emit
            pass

    head_commit_date = _head_commit_date(root)
    last_updated_delta_days = _date_diff_days(maturity_last_updated, head_commit_date)

    # Phase 14 dashboard freshness 보강 (v0.14.0):
    # `maturity_last_updated` 가 head_commit_date 와 N+ 일 차이 → stale. 자동
    # 갱신 helper (`workflow_kit.common.state.cache.refresh_maturity_last_updated`)
    # 가 별도 dispatcher 로 존재. 본 호출은 *hint 만* emit, auto-mutation ❌
    # (dashboard 는 read-only).
    from datetime import date as _date
    today_iso = _date.today().isoformat()
    maturity_stale = bool(maturity_last_updated) and maturity_last_updated != today_iso
    maturity_refresh_hint = (
        "python3 -c \"from workflow_kit.common.state.cache import refresh_maturity_last_updated; "
        "from pathlib import Path; "
        "print(refresh_maturity_last_updated(Path('workflow-source/core/maturity_matrix.json')))\""
    ) if maturity_stale else ""

    guard_panel: dict[str, Any] = {
        "guard_status": "unknown",
        "guard_cases_pass": 0,
        "guard_cases_fail": 0,
        "guard_cases": EXPECTED_DRIFT_GUARD_CASES,
        "expected_cases": EXPECTED_DRIFT_GUARD_CASES,
        "guard_failure_names": [],
        "guard_executed_at": "",
        "guard_runtime_ms": 0,
    }
    if inline_guard:
        guard_result = run_drift_prevention_guard_inline(root)
        guard_panel.update(guard_result)

    # silent_failing_cycles_count: maturity_stale 일 때 +1 (north-star proxy)
    # 본 release 의 v0.14.0 dashboard 의 freshness drift 가 north-star 에 반영되도록
    silent_failing_cycles_count = 1 if maturity_stale else 0

    return {
        **guard_panel,
        "maturity_last_updated": maturity_last_updated,
        "maturity_last_updated_source": "maturity_matrix.json",
        "maturity_stale": maturity_stale,
        "maturity_refresh_hint": maturity_refresh_hint,
        "today_iso": today_iso,
        "harness_supported_count": harness_supported_count,
        "head_commit_date": head_commit_date,
        "last_updated_delta_days": last_updated_delta_days,
        "silent_failing_cycles_count": silent_failing_cycles_count,  # Phase 14 freshness proxy
        "phase": "Phase 12 (done, v0.15.20) → Phase 13 (planned, v1.0.0 stable 진입 후)",
    }


def run_drift_prevention_guard_inline(
    workspace_root: Path,
    *,
    timeout: int = DRIFT_GUARD_INLINE_TIMEOUT,
) -> dict[str, Any]:
    """drift prevention smoke 를 subprocess 로 inline 실행.

    check_drift_prevention_v0_11_23.py 의 main() 을 호출하여 6 case 의
    PASS/FAIL 을 parse. 결과는 dict 로 반환.

    Args:
        workspace_root: REPO_ROOT (git 작업 dir)
        timeout: subprocess timeout (default 30초)

    Returns:
        dict with fields:
            guard_status: 'pass' | 'fail' | 'error'
            guard_cases_pass: int
            guard_cases_fail: int
            guard_cases: int (total pass + fail)
            guard_failure_names: list[str]
            guard_executed_at: ISO 8601 timestamp
            guard_runtime_ms: int (milliseconds)
    """
    root = _repo_root(Path(workspace_root) if isinstance(workspace_root, str) else workspace_root)
    smoke_path = root / "workflow-source" / "tests" / "check_drift_prevention_v0_11_23.py"
    fallback: dict[str, Any] = {
        "guard_status": "error",
        "guard_cases_pass": 0,
        "guard_cases_fail": 0,
        "guard_cases": 0,
        "guard_failure_names": [],
        "guard_executed_at": _utcnow_iso(),
        "guard_runtime_ms": 0,
    }

    if not smoke_path.is_file():
        return fallback

    import time

    started = time.monotonic()
    try:
        completed = subprocess.run(
            [sys.executable, str(smoke_path)],
            cwd=str(root),
            capture_output=True,
            text=True,
            check=False,
            timeout=timeout,
        )
        runtime_ms = int((time.monotonic() - started) * 1000)
        stdout = completed.stdout or ""
        cases_pass: list[str] = []
        cases_fail: list[str] = []
        summary_pass = 0
        summary_total = 0

        for line in stdout.splitlines():
            m_pass = DRIFT_GUARD_PASS_LINE.match(line)
            if m_pass is not None:
                cases_pass.append(m_pass.group(1))
                continue
            m_fail = DRIFT_GUARD_FAIL_LINE.match(line)
            if m_fail is not None:
                cases_fail.append(m_fail.group(1))
                continue
            m_sum = DRIFT_GUARD_SUMMARY.search(line)
            if m_sum is not None:
                # m_sum.group(1) = 'PASS' or 'FAIL', (2) = pass count, (3) = total
                try:
                    summary_pass = int(m_sum.group(2))
                    summary_total = int(m_sum.group(3))
                except ValueError:
                    pass

        # rc 가 0 이고 fail case 없으면 'pass', 그 외 'fail'. 예외 상황이면 'error'.
        if completed.returncode == 0 and not cases_fail:
            status = "pass"
        elif completed.returncode != 0 and not cases_fail and not cases_pass:
            # subprocess 자체가 fail (e.g. import error)
            status = "error"
        else:
            status = "fail"

        return {
            "guard_status": status,
            "guard_cases_pass": len(cases_pass) if cases_pass else summary_pass,
            "guard_cases_fail": len(cases_fail),
            "guard_cases": (len(cases_pass) + len(cases_fail)) or summary_total,
            "guard_failure_names": cases_fail,
            "guard_executed_at": _utcnow_iso(),
            "guard_runtime_ms": runtime_ms,
        }
    except subprocess.TimeoutExpired:
        runtime_ms = int((time.monotonic() - started) * 1000)
        return {
            "guard_status": "error",
            "guard_cases_pass": 0,
            "guard_cases_fail": 0,
            "guard_cases": 0,
            "guard_failure_names": [],
            "guard_executed_at": _utcnow_iso(),
            "guard_runtime_ms": runtime_ms,
        }
    except (OSError, ValueError):
        return fallback


def _head_commit_date(workspace_root: Path) -> str:
    """HEAD commit 의 ISO date (YYYY-MM-DD) 를 반환. git 실패 시 empty string."""
    try:
        completed = subprocess.run(
            ["git", "log", "-1", "--format=%cd", "--date=short"],
            cwd=str(workspace_root),
            capture_output=True,
            text=True,
            check=False,
            timeout=5,
        )
        if completed.returncode == 0:
            return completed.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        pass
    return ""


def _date_diff_days(date_a: str, date_b: str) -> int | None:
    """두 ISO date (YYYY-MM-DD) 사이의 일수 차이. 한쪽이라도 invalid 면 None."""
    if not date_a or not date_b:
        return None
    try:
        d_a = datetime.strptime(date_a, "%Y-%m-%d").date()
        d_b = datetime.strptime(date_b, "%Y-%m-%d").date()
        return abs((d_b - d_a).days)
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Panel 6 — Multi-Agent Concurrent Write Conflict (Phase 15 north-star)
# ---------------------------------------------------------------------------

def collect_multi_agent_concurrent_write_conflict(workspace_root: Path) -> dict[str, Any]:
    """Phase 14 north-star: `multi_agent_concurrent_write_conflict_count` = 0.

    v0.14.0+ append-only layout 의 structural 정합성 검증 — sub-agent 2개+ 동시
    fan-out 시 mutable 공유 파일의 3-way merge conflict / overwrite race 가 working
    tree 에 잔존하는지 check.

    측정원 (v0.14.7 Phase 15 follow-up 통합):
    1. active/ 하위 working tree 의 git merge conflict marker (`<<<<<<<`)
       — agent 가 `<<<<<<<` / `=======` / `>>>>>>>` 잔존한 채 commit 한 경우 검출.
    2. git log --all --merges 의 commit message 에 "CONFLICT" keyword 포함 (subprocess)
       — historical merge conflict 검출.

    Returns:
        dict {
            north_star: 'multi_agent_concurrent_write_conflict_count',
            working_tree_conflict_count: int,   # working tree markers
            git_log_conflict_count: int,         # git merge history
            conflict_count: int,                 # combined (= working + git_log)
            conflict_locations: list[str],       # working tree 만
            status: 'pass' | 'fail',
            threshold: int,
        }
    """
    import subprocess as _subprocess

    root = _repo_root(workspace_root)
    active_dir = root / "ai-workflow" / "memory" / "active"
    working_tree_conflict_count = 0
    conflict_locations: list[str] = []
    if active_dir.is_dir():
        for f in active_dir.rglob("*"):
            if not f.is_file():
                continue
            if f.suffix not in (".md", ".json"):
                continue
            try:
                text = f.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            if "<<<<<<<" in text:
                working_tree_conflict_count += 1
                try:
                    conflict_locations.append(str(f.relative_to(root)))
                except ValueError:
                    conflict_locations.append(str(f))

    # git log --all --merges 의 conflict keyword count (historical)
    git_log_conflict_count = 0
    try:
        proc = _subprocess.run(
            ["git", "log", "--all", "--merges", "--pretty=format:%H %s"],
            cwd=str(root), capture_output=True, text=True, timeout=10, check=False,
        )
        if proc.returncode == 0:
            git_log_conflict_count = sum(
                1
                for line in proc.stdout.splitlines()
                if "CONFLICT" in line.upper()
            )
    except (_subprocess.TimeoutExpired, FileNotFoundError, OSError):
        pass

    conflict_count = working_tree_conflict_count + git_log_conflict_count
    return {
        "north_star": "multi_agent_concurrent_write_conflict_count",
        "working_tree_conflict_count": working_tree_conflict_count,
        "git_log_conflict_count": git_log_conflict_count,
        "conflict_count": conflict_count,
        "conflict_locations": conflict_locations,
        "status": "pass" if conflict_count == 0 else "fail",
        "threshold": 0,
    }


# ---------------------------------------------------------------------------
# Panel 7 — Deprecation Cycle Progress (v0.14.0+ ADR-003)
# ---------------------------------------------------------------------------

def collect_deprecation_cycle_progress(workspace_root: Path) -> dict[str, Any]:
    """v0.14.0+ 1st/2nd deprecation cycle 진행 상태 (Panel 7).

    ADR-003 deprecation cycle 의 정공법:
    - **v0.14.0** (1st cycle 시작): `work_backlog.md` → `.bak` silent fallback.
    - **v0.14.1** (1st cycle 종결): `.bak` 존재 시 warning stage (cache.py 가 emit).
    - **v0.14.5** (2nd cycle 시작): `--legacy-memory` opt-out flag 가 있을 때만 read.
    - **v0.15.0** (2nd cycle 종결): `.bak` 완전 drop.

    본 panel 은 `bak_present` + `deprecation_stage` + timeline 명시.
    v0.14.5+ 에서 `maturity_matrix.deprecation_cycle_stage` field 기반 stage 표시.

    Returns:
        dict {
            stage: 'v0.14.0' | 'v0.14.1' | 'v0.14.5' | 'v0.15.0',
            bak_present: bool,
            legacy_present: bool,  # (구) work_backlog.md 부재 — True 면 cycle 진행
            deprecation_warning_supported: bool,  # v0.14.1+ cache.py 정합
            timeline: dict,
            next_release: str,
        }
    """
    root = _repo_root(workspace_root)
    memory_dir = root / "ai-workflow" / "memory" / "active"
    bak = memory_dir / "work_backlog.md.bak"
    legacy = memory_dir / "work_backlog.md"

    bak_present = bak.exists()
    legacy_present = legacy.exists()

    # v0.14.5+: maturity_matrix.deprecation_cycle_stage field 기반 동적 stage 표시
    maturity_path = root / "workflow-source" / "core" / "maturity_matrix.json"
    declared_stage: str | None = None
    if maturity_path.is_file():
        try:
            import json as _json
            mm = _json.loads(maturity_path.read_text(encoding="utf-8"))
            declared_stage = mm.get("deprecation_cycle_stage")
        except (OSError, ValueError):
            pass

    if not bak_present and not legacy_present:
        # 둘 다 부재 — cycle 완전 drop (v0.15.0 도달)
        stage = "v0.15.0"
        next_release = "(complete)"
    elif bak_present and not legacy_present:
        # cycle 진행 중 — declared_stage (maturity_matrix.deprecation_cycle_stage) 우선 사용.
        # default: v0.14.1 (1st cycle 종결 warning stage). v0.14.5 release 후
        # maturity_matrix 에서 'v0.14.5' 로 갱신 시 자동 표시.
        if declared_stage in ("v0.14.0", "v0.14.1", "v0.14.5", "v0.15.0"):
            stage = declared_stage
        else:
            stage = "v0.14.1"
        # next_release = declared_stage 다음 step
        next_map = {
            "v0.14.0": "(migrate to v0.14.0+)",
            "v0.14.1": "v0.14.5",
            "v0.14.5": "v0.15.0",
            "v0.15.0": "(complete)",
        }
        next_release = next_map.get(stage, "v0.15.0")
    elif legacy_present and not bak_present:
        stage = "v0.14.0"
        next_release = "(migrate to v0.14.0+ layout)"
    else:
        stage = "v0.14.0"
        next_release = "(migrate: remove legacy, keep bak)"

    return {
        "stage": stage,
        "declared_stage": declared_stage,
        "bak_present": bak_present,
        "legacy_present": legacy_present,
        "deprecation_warning_supported": True,  # cache.py:refresh_workflow_state_cache
        "timeline": {
            "v0.14.0": "1st cycle 시작 (silent fallback)",
            "v0.14.1": "1st cycle 종결 (warning stage)",
            "v0.14.5": "2nd cycle 시작 (--legacy-memory opt-out flag) — current" if declared_stage == "v0.14.5" else "2nd cycle 시작 (--legacy-memory opt-out flag)",
            "v0.15.0": "2nd cycle 종결 (.bak drop)",
        },
        "next_release": next_release,
    }


# ---------------------------------------------------------------------------
# Panel 8 — Memory Index + Telemetry Utilization v2 (Phase 15)
# ---------------------------------------------------------------------------

def collect_memory_index_utilization_v2(workspace_root: Path) -> dict[str, Any]:
    r"""Phase 15 Panel 8: memory_index entries + telemetry integration.

    기존 Panel 3 (collect_memory_index_utilization) 의 강화판 — v0.13.1+ telemetry
    sidecar 의 실측값 통합. AC2 north-star: telemetry_hit_rate = (cue + bm25 +
    expansion hits) / total queries.

    측정원:
    1. entries_total + by_merge_state: ai-workflow/memory/active/memory_index/entries/MEM-*.json
    2. telemetry_events_total + by_source + hit_rate: telemetry/events.jsonl

    Returns:
        dict { entries_total, entries_by_merge_state, telemetry_events_total,
               telemetry_by_source, telemetry_total_queries, telemetry_hit_count,
               telemetry_hit_rate, phase_15_north_star }
    """
    import json as _json

    root = _repo_root(workspace_root)
    memory_dir = root / "ai-workflow" / "memory" / "active"
    memory_index_dir = memory_dir / "memory_index"

    # 1. entries count by merge_state
    entries_by_merge_state: dict[str, int] = {}
    entries_total = 0
    entries_dir = memory_index_dir / "entries"
    if entries_dir.is_dir():
        for f in entries_dir.glob("MEM-*.json"):
            try:
                data = _json.loads(f.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            state = data.get("merge_state", "active")
            entries_by_merge_state[state] = entries_by_merge_state.get(state, 0) + 1
            entries_total += 1

    # 2. telemetry events parse
    telemetry_path = memory_index_dir / "telemetry" / "events.jsonl"
    telemetry_events_total = 0
    telemetry_by_source: dict[str, int] = {}
    telemetry_total_queries = 0
    telemetry_hit_count = 0
    if telemetry_path.is_file():
        try:
            for line in telemetry_path.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                try:
                    ev = _json.loads(line)
                except ValueError:
                    continue
                if ev.get("error"):
                    continue
                telemetry_events_total += 1
                src = ev.get("source", "unknown")
                telemetry_by_source[src] = telemetry_by_source.get(src, 0) + 1
                hits = (
                    (ev.get("cue_hits", 0) or 0)
                    + (ev.get("bm25_hits", 0) or 0)
                    + (ev.get("expansion_hits", 0) or 0)
                )
                if hits > 0:
                    telemetry_hit_count += 1
                telemetry_total_queries += 1
        except OSError:
            pass

    hit_rate = (
        telemetry_hit_count / telemetry_total_queries
        if telemetry_total_queries > 0 else 0.0
    )

    return {
        "entries_total": entries_total,
        "entries_by_merge_state": entries_by_merge_state,
        "telemetry_events_total": telemetry_events_total,
        "telemetry_by_source": telemetry_by_source,
        "telemetry_total_queries": telemetry_total_queries,
        "telemetry_hit_count": telemetry_hit_count,
        "telemetry_hit_rate": round(hit_rate, 4),
        "phase_15_north_star": "telemetry_hit_rate (1 release ≥ 1 query + hit)",
    }



def collect_maturity_distribution(workspace_root: Path) -> dict[str, Any]:
    """skill + mcp_tools 의 stage 분포를 1 dict 로 emit.

    Fields:
        skills: {
            "total": int,
            "stable": int, "beta": int, "alpha": int, "prototype": int,
            "by_stage": {stage: count, ...},
        }
        mcp_tools: {same shape}
        transports: {transport_name: stage, ...}
        harnesses: {
            "supported": int,
            "supported_names": [str, ...],
        }
        milestones: {
            "total": int,
            "done": int, "in_progress": int, "planned": int,
            "by_status": {status: count, ...},
        }
    """
    root = _repo_root(workspace_root)
    maturity_path = root / "workflow-source" / "core" / "maturity_matrix.json"

    if not maturity_path.is_file():
        return _empty_maturity_distribution()

    try:
        with maturity_path.open("r", encoding="utf-8") as fp:
            mm = json.load(fp)
    except (OSError, json.JSONDecodeError):
        return _empty_maturity_distribution()

    return {
        "skills": _stage_distribution(mm.get("skills", {})),
        "mcp_tools": _stage_distribution(mm.get("mcp_tools", {})),
        "transports": _transport_distribution(mm.get("transports", {})),
        "harnesses": _harness_distribution(mm.get("harnesses", {})),
        "milestones": _milestone_distribution(mm.get("milestones", {})),
    }


def _stage_distribution(items: dict[str, Any]) -> dict[str, Any]:
    """skill / mcp_tools 의 stage 분포 집계."""
    stages: Counter[str] = Counter()
    if isinstance(items, dict):
        for value in items.values():
            if isinstance(value, dict):
                stage = value.get("stage", "unknown")
                stages[str(stage)] += 1
    total = sum(stages.values())
    return {
        "total": total,
        "stable": stages.get("stable", 0),
        "beta": stages.get("beta", 0),
        "alpha": stages.get("alpha", 0),
        "prototype": stages.get("prototype", 0),
        "by_stage": dict(stages),
    }


def _transport_distribution(transports: Any) -> dict[str, Any]:
    """transports 의 name → stage 매핑."""
    if not isinstance(transports, dict):
        return {}
    out: dict[str, str] = {}
    for name, value in transports.items():
        if isinstance(value, dict):
            out[str(name)] = str(value.get("stage", "unknown"))
        else:
            out[str(name)] = str(value)
    return out


def _harness_distribution(harnesses: Any) -> dict[str, Any]:
    """harness.supported 의 count + names."""
    if not isinstance(harnesses, dict):
        return {"supported": 0, "supported_names": []}
    supported = harnesses.get("supported", [])
    if not isinstance(supported, list):
        return {"supported": 0, "supported_names": []}
    return {
        "supported": len(supported),
        "supported_names": [str(name) for name in supported],
    }


def _milestone_distribution(milestones: Any) -> dict[str, Any]:
    """milestones 의 status 분포."""
    statuses: Counter[str] = Counter()
    if isinstance(milestones, dict):
        for value in milestones.values():
            if isinstance(value, dict):
                status = value.get("status", "unknown")
                statuses[str(status)] += 1
    total = sum(statuses.values())
    return {
        "total": total,
        "done": statuses.get("done", 0),
        "in_progress": statuses.get("in_progress", 0),
        "planned": statuses.get("planned", 0),
        "by_status": dict(statuses),
    }


def _empty_maturity_distribution() -> dict[str, Any]:
    """maturity_matrix.json 부재 / parse 실패 시 fallback."""
    empty_stage: dict[str, Any] = {
        "total": 0,
        "stable": 0,
        "beta": 0,
        "alpha": 0,
        "prototype": 0,
        "by_stage": {},
    }
    return {
        "skills": dict(empty_stage),
        "mcp_tools": dict(empty_stage),
        "transports": {},
        "harnesses": {"supported": 0, "supported_names": []},
        "milestones": {
            "total": 0,
            "done": 0,
            "in_progress": 0,
            "planned": 0,
            "by_status": {},
        },
    }


# ---------------------------------------------------------------------------
# Panel 3 — Memory Index Utilization
# ---------------------------------------------------------------------------


def collect_memory_index_utilization(workspace_root: Path) -> dict[str, Any]:
    """memory_index 의 활용도 metric 을 1 dict 로 emit.

    Fields:
        entries_total: 전체 entry 갯수
        entries_by_merge_state: {merge_state: count, ...}
        cue_anchors_top: [{anchor: str, count: int}, ...] 상위 20
        cue_anchors_unique: unique anchor 갯수
        cumulative_timeline: [{date: 'YYYY-MM-DD', count: int}, ...]
        first_entry_date / last_entry_date: ISO date
        retrieval_hit_rate: Phase 13 AC2 의 hit rate (telemetry events.jsonl 집계)
        retrieval_hit_rate_source: 'memory_index_telemetry_v0_13_1'
        telemetry: {total_calls, total_hits, by_source, events_parsed, events_skipped,
                    first_event_at, last_event_at} — Phase 13 AC2 telemetry sidecar 집계

    Returns:
        dict — Panel 3 의 data shape.
    """
    root = _repo_root(workspace_root)
    memory_index_dir = root / "ai-workflow" / "memory" / "active" / "memory_index"
    entries_dir = memory_index_dir / "entries"

    if not entries_dir.is_dir():
        payload = _empty_memory_index_utilization()
        _attach_telemetry_summary(root, payload)
        return payload

    entry_files = sorted(entries_dir.glob("MEM-*.json"))
    if not entry_files:
        payload = _empty_memory_index_utilization()
        _attach_telemetry_summary(root, payload)
        return payload

    entries: list[dict[str, Any]] = []
    for entry_path in entry_files:
        try:
            with entry_path.open("r", encoding="utf-8") as fp:
                entry = json.load(fp)
            if isinstance(entry, dict):
                entries.append(entry)
        except (OSError, json.JSONDecodeError):
            continue

    payload = _aggregate_memory_index(entries)
    _attach_telemetry_summary(root, payload)
    return payload


def _attach_telemetry_summary(workspace_root: Path, payload: dict[str, Any]) -> None:
    """Panel 3 payload 에 telemetry sidecar 집계 attach (in-place mutation).

    v0.13.1+ Phase 13 AC2 정합: telemetry 부재 시에도 payload 는 *graceful* —
    `telemetry.total_calls=0` + `retrieval_hit_rate=0.0` 유지 (placeholder 와 동일).
    caller 는 `telemetry.source_version` 으로 fallback 구분 가능.
    """
    try:
        from workflow_kit.common.state.memory_index import summarize_telemetry
    except ImportError:
        return
    try:
        summary = summarize_telemetry(workspace_root)
    except Exception:
        return
    payload["retrieval_hit_rate"] = summary.hit_rate
    payload["retrieval_hit_rate_source"] = summary.source_version
    payload["telemetry"] = {
        "total_calls": summary.total_calls,
        "total_hits": summary.total_hits,
        "by_source": summary.by_source,
        "events_parsed": summary.events_parsed,
        "events_skipped": summary.events_skipped,
        "first_event_at": summary.first_event_at,
        "last_event_at": summary.last_event_at,
    }


def _empty_memory_index_utilization() -> dict[str, Any]:
    """memory_index 부재 / parse 실패 시 fallback."""
    return {
        "entries_total": 0,
        "entries_by_merge_state": {},
        "cue_anchors_top": [],
        "cue_anchors_unique": 0,
        "cumulative_timeline": [],
        "first_entry_date": "",
        "last_entry_date": "",
        "retrieval_hit_rate": 0.0,
        "retrieval_hit_rate_source": "memory_index_telemetry_v0_13_1",
        "telemetry": {
            "total_calls": 0,
            "total_hits": 0,
            "by_source": {},
            "events_parsed": 0,
            "events_skipped": 0,
            "first_event_at": "",
            "last_event_at": "",
        },
    }


def _aggregate_memory_index(entries: list[dict[str, Any]]) -> dict[str, Any]:
    """entry list 를 Panel 3 의 dict shape 로 집계."""
    states: Counter[str] = Counter()
    anchor_counter: Counter[str] = Counter()
    by_date: Counter[str] = Counter()
    first_date = ""
    last_date = ""

    for entry in entries:
        merge_state = str(entry.get("merge_state", "unknown"))
        states[merge_state] += 1

        anchors = entry.get("cue_anchors", [])
        if isinstance(anchors, list):
            for a in anchors:
                anchor_counter[str(a)] += 1

        created_at = str(entry.get("created_at", ""))
        # ISO 8601 'YYYY-MM-DDTHH:MM:SSZ' 의 date 부분만 추출
        date_part = created_at[:10] if len(created_at) >= 10 else ""
        if re.match(r"^\d{4}-\d{2}-\d{2}$", date_part):
            by_date[date_part] += 1
            if not first_date or date_part < first_date:
                first_date = date_part
            if date_part > last_date:
                last_date = date_part

    # 누적 timeline — 날짜 오름차순
    cumulative: list[dict[str, Any]] = []
    running = 0
    for date in sorted(by_date.keys()):
        running += by_date[date]
        cumulative.append({"date": date, "count": running})

    # top 20 cue_anchors
    top_anchors = [
        {"anchor": anchor, "count": count}
        for anchor, count in anchor_counter.most_common(20)
    ]

    return {
        "entries_total": len(entries),
        "entries_by_merge_state": dict(states),
        "cue_anchors_top": top_anchors,
        "cue_anchors_unique": len(anchor_counter),
        "cumulative_timeline": cumulative,
        "first_entry_date": first_date,
        "last_entry_date": last_date,
        "retrieval_hit_rate": 0.0,  # Phase 13 AC2 telemetry 후속 (collect_memory_index_utilization 의 post-hook 가 덮어씀)
        "retrieval_hit_rate_source": "memory_index_telemetry_v0_13_1",
    }


# ---------------------------------------------------------------------------
# Panel 4 — Smoke Trend
# ---------------------------------------------------------------------------


def collect_smoke_trend(
    workspace_root: Path,
    *,
    recent_limit: int = 5,
) -> dict[str, Any]:
    """누적 smoke test 추세를 release note 에서 parse.

    Fields:
        cumulative_total: 가장 최근 release note 의 누적 smoke total (정수)
        cumulative_pass: 가장 최근 release note 의 누적 smoke pass (정수)
        cumulative_pass_rate: pass / total (0.0 ~ 1.0)
        recent_releases: [{version: str, pass: int, total: int, release_note_path: str}, ...]
        smoke_files_count: workflow-source/tests/check_*.py 의 실제 file 갯수 (cross-check)

    Returns:
        dict — Panel 4 의 data shape.
    """
    root = _repo_root(workspace_root)
    releases_dir = root / "workflow-source" / "releases"
    tests_dir = root / "workflow-source" / "tests"

    smoke_files_count = 0
    if tests_dir.is_dir():
        smoke_files_count = sum(1 for _ in tests_dir.glob("check_*.py"))

    recent: list[dict[str, Any]] = []
    if not releases_dir.is_dir():
        return {
            "cumulative_total": 0,
            "cumulative_pass": 0,
            "cumulative_pass_rate": 0.0,
            "recent_releases": [],
            "smoke_files_count": smoke_files_count,
        }

    # Beta-v0.*.md 만 대상 (prototype-v1 / prototype-v2 제외).
    # semver-natural sort — Beta-v0.9.6 이 Beta-v0.10.0 보다 "newer" 로 잘못 분류되는
    # lexicographic sort 함정 회피.
    release_files = sorted(
        releases_dir.glob("Beta-v*.md"),
        key=_release_version_key,
        reverse=True,  # newest first
    )

    for rf in release_files[:recent_limit]:
        parsed = _parse_smoke_count_from_release(rf)
        if parsed is not None:
            smoke_pass, smoke_total = parsed
            recent.append(
                {
                    "version": rf.stem,  # 'Beta-v0.11.25'
                    "pass": smoke_pass,
                    "total": smoke_total,
                    "release_note_path": str(rf.relative_to(root)),
                }
            )

    # 가장 최근 (첫 번째) entry 의 pass/total
    if recent:
        latest = recent[0]
        return {
            "cumulative_total": int(latest["total"]),
            "cumulative_pass": int(latest["pass"]),
            "cumulative_pass_rate": (
                int(latest["pass"]) / int(latest["total"])
                if int(latest["total"]) > 0
                else 0.0
            ),
            "recent_releases": recent,
            "smoke_files_count": smoke_files_count,
        }

    # parse 실패 또는 release note 부재
    return {
        "cumulative_total": 0,
        "cumulative_pass": 0,
        "cumulative_pass_rate": 0.0,
        "recent_releases": recent,
        "smoke_files_count": smoke_files_count,
    }


def _parse_smoke_count_from_release(release_path: Path) -> tuple[int, int] | None:
    """release note 본문에서 누적 smoke count 패턴 parse.

    v0.15.0+ 확장: 두 가지 표기 모두 지원.
    - 형식 1: ``누적 smoke test **N/N PASS**`` (v0.13.0 정공법)
    - 형식 2: ``누적 smoke **N+ PASS**`` (v0.14.1+ 슬랙 표기 — pass=total 가정)
    형식 2 의 N+ 는 release note 가 이미 100% pass 를 단언했음을 의미하므로
    (N, N) 으로 정규화.
    """
    try:
        with release_path.open("r", encoding="utf-8") as fp:
            content = fp.read()
    except OSError:
        return None
    match = SMOKE_COUNT_PATTERN.search(content)
    if match is None:
        return None
    try:
        pass_count = int(match.group(1))
        # group(2) 는 N/N 표기일 때만 존재; N+ 표기일 때는 None
        total_str = match.group(2)
        total_count = int(total_str) if total_str is not None else pass_count
        return pass_count, total_count
    except ValueError:
        return None


_VERSION_PATTERN: Final[re.Pattern[str]] = re.compile(r"v(\d+(?:\.\d+)*)")


def _release_version_key(path: Path) -> tuple[int, ...]:
    """release note 의 version 을 semver-natural sort key 로 변환.

    ``Beta-v0.9.6.md`` → (0, 9, 6), ``Beta-v0.10.0.md`` → (0, 10, 0).
    lexicographic sort 의 함정 (예: ``Beta-v0.9.x`` > ``Beta-v0.10.x``) 회피.
    """
    match = _VERSION_PATTERN.search(path.name)
    if match is None:
        return (0,)
    try:
        return tuple(int(part) for part in match.group(1).split("."))
    except ValueError:
        return (0,)


# ---------------------------------------------------------------------------
# Panel 5 — Recent Release Cycle
# ---------------------------------------------------------------------------


def collect_recent_releases(
    workspace_root: Path,
    *,
    top_n: int = DEFAULT_RECENT_RELEASES,
) -> dict[str, Any]:
    """state.json.session.recent_done_items 의 상위 N 개 item 을 timeline 으로 emit.

    Fields:
        items_total: recent_done_items 전체 갯수
        top_n: emit 한 item 갯수 (default = 10)
        timeline: [{index: int, preview: str (≤120 char), length: int}, ...]

    Returns:
        dict — Panel 5 의 data shape.
    """
    root = _repo_root(workspace_root)
    state_path = root / "ai-workflow" / "memory" / "active" / "state.json"

    if not state_path.is_file():
        return {"items_total": 0, "top_n": top_n, "timeline": []}

    try:
        with state_path.open("r", encoding="utf-8") as fp:
            state = json.load(fp)
    except (OSError, json.JSONDecodeError):
        return {"items_total": 0, "top_n": top_n, "timeline": []}

    session = state.get("session", {})
    if not isinstance(session, dict):
        return {"items_total": 0, "top_n": top_n, "timeline": []}

    items = session.get("recent_done_items", [])
    if not isinstance(items, list):
        return {"items_total": 0, "top_n": top_n, "timeline": []}

    timeline: list[dict[str, Any]] = []
    for idx, item in enumerate(items[:top_n]):
        if isinstance(item, str):
            preview = item[:120] + ("…" if len(item) > 120 else "")
            timeline.append(
                {
                    "index": idx,
                    "preview": preview,
                    "length": len(item),
                }
            )

    return {
        "items_total": len(items),
        "top_n": top_n,
        "timeline": timeline,
    }


# ---------------------------------------------------------------------------
# Aggregator — 5 panel snapshot
# ---------------------------------------------------------------------------


def collect_dashboard_snapshot(
    workspace_root: Path | None = None,
    *,
    inline_guard: bool = True,
) -> dict[str, Any]:
    """5 panel 의 data 를 1 dict 로 집계. read-only, atomic.

    Args:
        workspace_root: REPO_ROOT (None 이면 자동 탐색)
        inline_guard: True 면 Panel 1 의 drift guard 를 subprocess 로 inline 실행.
            False 면 legacy v0.13.0 behavior (guard_status='unknown').
    """
    ws_root = _repo_root(workspace_root) if workspace_root is None else workspace_root
    return {
        "schema_version": "1.1",  # v0.14.3 Phase 15 — Panel 6/7/8 추가
        "tool_version": _workflow_kit_version(),
        "generated_at": _utcnow_iso(),
        "workspace_root": str(ws_root),
        "panels": {
            "drift_prevention": collect_drift_prevention(ws_root, inline_guard=inline_guard),
            "maturity_distribution": collect_maturity_distribution(ws_root),
            "memory_index_utilization": collect_memory_index_utilization(ws_root),
            "smoke_trend": collect_smoke_trend(ws_root),
            "recent_releases": collect_recent_releases(ws_root),
            # Phase 15 (v0.14.3+) Panel 6/7/8 — north-star metrics
            "multi_agent_concurrent_write_conflict": collect_multi_agent_concurrent_write_conflict(ws_root),
            "deprecation_cycle_progress": collect_deprecation_cycle_progress(ws_root),
            "memory_index_utilization_v2": collect_memory_index_utilization_v2(ws_root),
        },
    }


def _workflow_kit_version() -> str:
    """workflow_kit.__version__ 의 loud fallback (ADR-003 read-only 정책 정합)."""
    try:
        from workflow_kit import __version__ as _V
        return str(_V)
    except ImportError:  # pragma: no cover
        return "v0.11.22-beta"


def _utcnow_iso() -> str:
    """UTC ISO 8601 timestamp (e.g. '2026-07-09T01:30:00Z')."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# Renderer — Markdown output (v0.13.0 무료 옵션)
# ---------------------------------------------------------------------------


def render_dashboard_markdown(snapshot: dict[str, Any]) -> str:
    """snapshot dict 를 markdown 표 형식으로 직렬화.

    v0.13.1 release hook 의 preview / Phase 13 wiki 자동 emit 의 자유 옵션.
    """
    lines: list[str] = []
    lines.append("# Quality Dashboard Snapshot")
    lines.append("")
    lines.append(f"- generated_at: `{snapshot.get('generated_at', '')}`")
    lines.append(f"- tool_version: `{snapshot.get('tool_version', '')}`")
    lines.append(f"- workspace_root: `{snapshot.get('workspace_root', '')}`")
    lines.append("")
    panels = snapshot.get("panels", {})
    if isinstance(panels, dict):
        lines.extend(_render_panel_1(panels.get("drift_prevention", {})))
        lines.extend(_render_panel_2(panels.get("maturity_distribution", {})))
        lines.extend(_render_panel_3(panels.get("memory_index_utilization", {})))
        lines.extend(_render_panel_4(panels.get("smoke_trend", {})))
        lines.extend(_render_panel_5(panels.get("recent_releases", {})))
        # Phase 15 (v0.14.3+) — Panel 6/7/8 north-star metric
        lines.extend(_render_panel_6(panels.get("multi_agent_concurrent_write_conflict", {})))
        lines.extend(_render_panel_7(panels.get("deprecation_cycle_progress", {})))
        lines.extend(_render_panel_8(panels.get("memory_index_utilization_v2", {})))
    return "\n".join(lines) + "\n"


def _render_panel_1(p: dict[str, Any]) -> list[str]:
    lines: list[str] = ["## Panel 1 — Drift Prevention Status", ""]
    lines.append(f"- guard_status: `{p.get('guard_status', 'unknown')}`")
    lines.append(f"- guard_cases: `{p.get('guard_cases', 0)} / {p.get('expected_cases', 0)}`")
    lines.append(f"- maturity_last_updated: `{p.get('maturity_last_updated', '')}`")
    lines.append(f"- maturity_stale: `{p.get('maturity_stale', False)}`")
    lines.append(f"- harness_supported_count: `{p.get('harness_supported_count', 0)}`")
    lines.append(f"- head_commit_date: `{p.get('head_commit_date', '')}`")
    delta = p.get("last_updated_delta_days")
    lines.append(f"- last_updated_delta_days: `{delta if delta is not None else 'unknown'}`")
    lines.append(f"- silent_failing_cycles_count: `{p.get('silent_failing_cycles_count', 0)}`")
    if p.get("maturity_stale") and p.get("maturity_refresh_hint"):
        lines.append("")
        lines.append(
            "> ⚠️ **maturity_last_updated stale**: "
            f"refresh hint → `python3 -c \"{p.get('maturity_refresh_hint', '')}\"`"
        )
    return lines + [""]


def _render_panel_2(p: dict[str, Any]) -> list[str]:
    lines: list[str] = ["## Panel 2 — Maturity Distribution", ""]
    for kind in ("skills", "mcp_tools", "milestones"):
        bucket = p.get(kind, {})
        if isinstance(bucket, dict):
            lines.append(f"### {kind}")
            lines.append("")
            lines.append("| metric | value |")
            lines.append("|---|---|")
            lines.append(f"| total | {bucket.get('total', 0)} |")
            if kind != "milestones":
                lines.append(f"| stable | {bucket.get('stable', 0)} |")
                lines.append(f"| beta | {bucket.get('beta', 0)} |")
                lines.append(f"| alpha | {bucket.get('alpha', 0)} |")
            else:
                lines.append(f"| done | {bucket.get('done', 0)} |")
                lines.append(f"| in_progress | {bucket.get('in_progress', 0)} |")
                lines.append(f"| planned | {bucket.get('planned', 0)} |")
            lines.append("")
    harnesses = p.get("harnesses", {})
    if isinstance(harnesses, dict):
        lines.append("### harnesses")
        lines.append("")
        lines.append(f"- supported: `{harnesses.get('supported', 0)}`")
        names = harnesses.get("supported_names", [])
        if isinstance(names, list) and names:
            lines.append(f"- names: {', '.join(f'`{n}`' for n in names)}")
        lines.append("")
    return lines


def _render_panel_3(p: dict[str, Any]) -> list[str]:
    lines: list[str] = ["## Panel 3 — Memory Index Utilization", ""]
    lines.append(f"- entries_total: `{p.get('entries_total', 0)}`")
    by_state = p.get("entries_by_merge_state", {})
    if isinstance(by_state, dict):
        if by_state:
            state_str = ", ".join(f"`{k}`={v}" for k, v in by_state.items())
        else:
            state_str = "(none)"
        lines.append(f"- entries_by_merge_state: {state_str}")
    lines.append(f"- cue_anchors_unique: `{p.get('cue_anchors_unique', 0)}`")
    lines.append(f"- first_entry_date: `{p.get('first_entry_date', '')}`")
    lines.append(f"- last_entry_date: `{p.get('last_entry_date', '')}`")
    top = p.get("cue_anchors_top", [])
    if isinstance(top, list) and top:
        lines.append("")
        lines.append("### Top cue anchors")
        lines.append("")
        lines.append("| anchor | count |")
        lines.append("|---|---|")
        for entry in top[:10]:
            if isinstance(entry, dict):
                lines.append(
                    f"| {entry.get('anchor', '')} | {entry.get('count', 0)} |"
                )
    return lines + [""]


def _render_panel_4(p: dict[str, Any]) -> list[str]:
    lines: list[str] = ["## Panel 4 — Smoke Trend", ""]
    lines.append(f"- cumulative_total: `{p.get('cumulative_total', 0)}`")
    lines.append(f"- cumulative_pass: `{p.get('cumulative_pass', 0)}`")
    rate = p.get("cumulative_pass_rate", 0.0)
    lines.append(f"- cumulative_pass_rate: `{rate:.4f}`")
    lines.append(f"- smoke_files_count: `{p.get('smoke_files_count', 0)}`")
    recent = p.get("recent_releases", [])
    if isinstance(recent, list) and recent:
        lines.append("")
        lines.append("### Recent release smoke counts")
        lines.append("")
        lines.append("| version | pass | total |")
        lines.append("|---|---|---|")
        for entry in recent:
            if isinstance(entry, dict):
                lines.append(
                    f"| {entry.get('version', '')} "
                    f"| {entry.get('pass', 0)} "
                    f"| {entry.get('total', 0)} |"
                )
    return lines + [""]


def _render_panel_5(p: dict[str, Any]) -> list[str]:
    lines: list[str] = ["## Panel 5 — Recent Release Cycle", ""]
    lines.append(f"- items_total: `{p.get('items_total', 0)}`")
    lines.append(f"- top_n: `{p.get('top_n', 0)}`")
    timeline = p.get("timeline", [])
    if isinstance(timeline, list) and timeline:
        lines.append("")
        lines.append("### Timeline (preview, first 120 char)")
        lines.append("")
        for entry in timeline:
            if isinstance(entry, dict):
                idx = entry.get("index", 0)
                preview = entry.get("preview", "")
                lines.append(f"- [{idx}] {preview}")
    return lines + [""]


def _render_panel_6(p: dict[str, Any]) -> list[str]:
    """Panel 6 — Multi-Agent Concurrent Write Conflict (Phase 15 north-star)."""
    lines: list[str] = ["## Panel 6 — Multi-Agent Concurrent Write Conflict", ""]
    lines.append(f"- north_star: `{p.get('north_star', 'unknown')}`")
    lines.append(f"- conflict_count: `{p.get('conflict_count', 0)}`")
    lines.append(f"- threshold: `{p.get('threshold', 0)}`")
    lines.append(f"- status: `{p.get('status', 'unknown')}`")
    locations = p.get("conflict_locations", [])
    if locations:
        lines.append("")
        lines.append("### Conflict locations")
        lines.append("")
        for loc in locations[:10]:  # max 10 표시
            lines.append(f"- `{loc}`")
    return lines + [""]


def _render_panel_7(p: dict[str, Any]) -> list[str]:
    """Panel 7 — Deprecation Cycle Progress."""
    lines: list[str] = ["## Panel 7 — Deprecation Cycle Progress", ""]
    lines.append(f"- stage: `{p.get('stage', 'unknown')}`")
    lines.append(f"- bak_present: `{p.get('bak_present', False)}`")
    lines.append(f"- legacy_present: `{p.get('legacy_present', False)}`")
    lines.append(f"- deprecation_warning_supported: `{p.get('deprecation_warning_supported', False)}`")
    lines.append(f"- next_release: `{p.get('next_release', 'unknown')}`")
    timeline = p.get("timeline", {})
    if isinstance(timeline, dict) and timeline:
        lines.append("")
        lines.append("### Timeline")
        lines.append("")
        lines.append("| Version | Stage |")
        lines.append("|---|---|")
        for ver, desc in timeline.items():
            # current stage marker
            marker = " ← **current**" if ver == p.get("stage") else ""
            lines.append(f"| `{ver}` | {desc}{marker} |")
    return lines + [""]


def _render_panel_8(p: dict[str, Any]) -> list[str]:
    """Panel 8 — Memory Index + Telemetry Utilization v2."""
    lines: list[str] = ["## Panel 8 — Memory Index + Telemetry Utilization v2", ""]
    lines.append(f"- phase_15_north_star: `{p.get('phase_15_north_star', '')}`")
    lines.append(f"- entries_total: `{p.get('entries_total', 0)}`")
    lines.append(f"- telemetry_events_total: `{p.get('telemetry_events_total', 0)}`")
    lines.append(f"- telemetry_total_queries: `{p.get('telemetry_total_queries', 0)}`")
    lines.append(f"- telemetry_hit_count: `{p.get('telemetry_hit_count', 0)}`")
    lines.append(f"- telemetry_hit_rate: `{p.get('telemetry_hit_rate', 0.0):.4f}`")
    by_ms = p.get("entries_by_merge_state", {})
    if isinstance(by_ms, dict) and by_ms:
        lines.append("")
        lines.append("### Entries by merge_state")
        lines.append("")
        lines.append("| merge_state | count |")
        lines.append("|---|---|")
        for state, count in sorted(by_ms.items()):
            lines.append(f"| `{state}` | {count} |")
    by_src = p.get("telemetry_by_source", {})
    if isinstance(by_src, dict) and by_src:
        lines.append("")
        lines.append("### Telemetry by source")
        lines.append("")
        lines.append("| source | events |")
        lines.append("|---|---|")
        for src, count in sorted(by_src.items()):
            lines.append(f"| `{src}` | {count} |")
    return lines + [""]


# ---------------------------------------------------------------------------
# Renderer — HTML output (v0.13.2+)
# ---------------------------------------------------------------------------


# Chart.js CDN URL. Released under MIT license.
# https://www.chartjs.org/docs/latest/getting-started/installation.html
CHARTJS_CDN_URL: Final[str] = "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"


def render_dashboard_html(snapshot: dict[str, Any]) -> str:
    """snapshot dict 를 단일 self-contained HTML page 로 직렬화 (v0.13.2+).

    Chart.js CDN + 5 panel widget (gauge / doughnut / line / bar / timeline list).
    prefers-color-scheme 의 dark mode 자동 인식. JavaScript off 시에도 static
    fallback 이 보임.

    Args:
        snapshot: collect_dashboard_snapshot() 의 결과 dict

    Returns:
        str — single HTML doc
    """
    panels = snapshot.get("panels", {})
    if not isinstance(panels, dict):
        panels = {}
    generated_at = str(snapshot.get("generated_at", ""))
    tool_version = str(snapshot.get("tool_version", ""))
    workspace_root = str(snapshot.get("workspace_root", ""))

    html = [
        "<!DOCTYPE html>",
        '<html lang="en">',
        "<head>",
        '  <meta charset="utf-8">',
        '  <meta name="viewport" content="width=device-width, initial-scale=1">',
        f"  <title>Quality Dashboard · {tool_version}</title>",
        "  <style>",
        _HTML_CSS,
        "  </style>",
        "</head>",
        "<body>",
        "  <header>",
        f"    <h1>Quality Dashboard</h1>",
        f'    <p class="meta">generated_at: <code>{_html_escape(generated_at)}</code> · '
        f'tool_version: <code>{_html_escape(tool_version)}</code></p>',
        f'    <p class="meta">workspace: <code>{_html_escape(workspace_root)}</code></p>',
        "  </header>",
        "  <main>",
    ]
    html.append(_render_html_panel_1(panels.get("drift_prevention", {})))
    html.append(_render_html_panel_2(panels.get("maturity_distribution", {})))
    html.append(_render_html_panel_3(panels.get("memory_index_utilization", {})))
    html.append(_render_html_panel_4(panels.get("smoke_trend", {})))
    html.append(_render_html_panel_5(panels.get("recent_releases", {})))
    # Phase 15 (v0.14.7+) — Panel 6/7/8 HTML render
    html.append(_render_html_panel_6(panels.get("multi_agent_concurrent_write_conflict", {})))
    html.append(_render_html_panel_7(panels.get("deprecation_cycle_progress", {})))
    html.append(_render_html_panel_8(panels.get("memory_index_utilization_v2", {})))
    html.append("  </main>")

    # Charts (Chart.js) — graceful when JS off (canvas + static text fallback)
    html.append("  <script>")
    html.append(_render_html_charts_js(panels))
    html.append("  </script>")
    html.append(f'  <script src="{_html_escape(CHARTJS_CDN_URL)}"></script>')

    html.append("</body>")
    html.append("</html>")
    return "\n".join(html) + "\n"


# ---------------------------------------------------------------------------
# HTML helpers (private)
# ---------------------------------------------------------------------------


def _html_escape(text: str) -> str:
    """HTML escape — `<`, `>`, `&`, `"`, `'` 만 처리."""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


_HTML_CSS: Final[str] = """
:root {
  color-scheme: light dark;
  --bg: #fff;
  --fg: #1a1a1a;
  --muted: #666;
  --border: #ddd;
  --panel: #f9f9f9;
  --pass: #1b8a3a;
  --fail: #c0392b;
  --error: #d68910;
  --link: #1d6fb8;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1a1a1a; --fg: #e0e0e0; --muted: #aaa;
    --border: #333; --panel: #252525;
    --pass: #58c47e; --fail: #ff6b5b; --error: #ffd066;
    --link: #5aa7e8;
  }
}
body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--fg); margin: 0; padding: 2rem; }
h1 { font-size: 1.8rem; margin-bottom: 0.3rem; }
.meta { color: var(--muted); font-size: 0.85rem; }
code { background: var(--panel); padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.9em; }
main { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; margin-top: 2rem; }
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 6px; padding: 1.2rem; }
.panel h2 { font-size: 1.1rem; margin: 0 0 0.8rem; }
.panel .stat { font-size: 1.6rem; font-weight: 600; }
.panel .stat.pass { color: var(--pass); }
.panel .stat.fail { color: var(--fail); }
.panel .stat.error { color: var(--error); }
table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
th, td { padding: 0.35rem 0.5rem; text-align: left; border-bottom: 1px solid var(--border); }
canvas { max-width: 100%; }
.timeline li { margin-bottom: 0.4rem; font-size: 0.85rem; color: var(--muted); }
ul.timeline { padding-left: 1.2rem; }
""".strip()


def _render_html_panel_1(p: dict[str, Any]) -> str:
    """Panel 1 HTML — drift guard status."""
    status = str(p.get("guard_status", "unknown"))
    guard_cases_pass = int(p.get("guard_cases_pass", 0))
    guard_cases = int(p.get("guard_cases", 0))
    expected = int(p.get("expected_cases", 0))
    runtime_ms = int(p.get("guard_runtime_ms", 0))
    maturity_last_updated = str(p.get("maturity_last_updated", ""))
    head_commit_date = str(p.get("head_commit_date", ""))
    delta = p.get("last_updated_delta_days")
    harness_supported_count = int(p.get("harness_supported_count", 0))
    silent_failing = int(p.get("silent_failing_cycles_count", 0))
    phase = str(p.get("phase", ""))

    status_class = status if status in ("pass", "fail", "error") else "unknown"
    return f"""  <section class="panel">
    <h2>Panel 1 — Drift Prevention Status</h2>
    <p>guard_status: <span class="stat {status_class}">{_html_escape(status)}</span></p>
    <p>guard: {guard_cases_pass}/{guard_cases} pass (expected {expected})</p>
    <p>guard_runtime_ms: {runtime_ms}</p>
    <p>maturity_last_updated: <code>{_html_escape(maturity_last_updated)}</code></p>
    <p>head_commit_date: <code>{_html_escape(head_commit_date)}</code></p>
    <p>last_updated_delta_days: {delta if delta is not None else 'unknown'}</p>
    <p>harness_supported_count: {harness_supported_count}</p>
    <p><strong>silent_failing_cycles_count: {silent_failing}</strong> (Phase 13 AC1 north-star)</p>
    <p class="meta">{_html_escape(phase)}</p>
  </section>"""


def _render_html_panel_2(p: dict[str, Any]) -> str:
    """Panel 2 HTML — maturity distribution + chart canvas."""
    skills = p.get("skills", {}) if isinstance(p.get("skills"), dict) else {}
    mcp = p.get("mcp_tools", {}) if isinstance(p.get("mcp_tools"), dict) else {}
    harnesses = p.get("harnesses", {}) if isinstance(p.get("harnesses"), dict) else {}
    milestones = p.get("milestones", {}) if isinstance(p.get("milestones"), dict) else {}
    return f"""  <section class="panel">
    <h2>Panel 2 — Maturity Distribution</h2>
    <table>
      <thead><tr><th>bucket</th><th>total</th><th>stable</th><th>beta</th><th>alpha</th></tr></thead>
      <tbody>
        <tr><td>skills</td><td>{int(skills.get('total', 0))}</td><td>{int(skills.get('stable', 0))}</td><td>{int(skills.get('beta', 0))}</td><td>{int(skills.get('alpha', 0))}</td></tr>
        <tr><td>mcp_tools</td><td>{int(mcp.get('total', 0))}</td><td>{int(mcp.get('stable', 0))}</td><td>{int(mcp.get('beta', 0))}</td><td>{int(mcp.get('alpha', 0))}</td></tr>
      </tbody>
    </table>
    <p>harnesses.supported: <strong>{int(harnesses.get('supported', 0))}</strong></p>
    <p>milestones: total={int(milestones.get('total', 0))} done={int(milestones.get('done', 0))} in_progress={int(milestones.get('in_progress', 0))}</p>
    <canvas id="chart-maturity" height="160"></canvas>
  </section>"""


def _render_html_panel_3(p: dict[str, Any]) -> str:
    """Panel 3 HTML — memory index utilization + chart canvas.

    v0.13.1+ Phase 13 AC2 telemetry 정합: retrieval_hit_rate 가 telemetry events.jsonl
    집계값으로 emit. by_source 분해 + events_parsed/skipped 도 표시.
    """
    entries_total = int(p.get("entries_total", 0))
    cue_unique = int(p.get("cue_anchors_unique", 0))
    first_date = str(p.get("first_entry_date", ""))
    last_date = str(p.get("last_entry_date", ""))
    hit_rate = float(p.get("retrieval_hit_rate", 0.0))
    by_state = p.get("entries_by_merge_state", {})
    state_str = ", ".join(
        f"{_html_escape(str(k))}={int(v)}" for k, v in (by_state.items() if isinstance(by_state, dict) else [])
    )
    telemetry = p.get("telemetry", {})
    if not isinstance(telemetry, dict):
        telemetry = {}
    t_total_calls = int(telemetry.get("total_calls", 0))
    t_total_hits = int(telemetry.get("total_hits", 0))
    t_by_source = telemetry.get("by_source", {})
    t_source_str = ", ".join(
        f"{_html_escape(str(k))}:calls={int(v.get('calls', 0))},hits={int(v.get('hits', 0))}"
        for k, v in (sorted(t_by_source.items()) if isinstance(t_by_source, dict) else [])
    )
    return f"""  <section class="panel">
    <h2>Panel 3 — Memory Index Utilization</h2>
    <p class="stat">{entries_total}</p>
    <p class="meta">total entries · unique cue anchors: {cue_unique}</p>
    <p class="meta">first_entry_date: <code>{_html_escape(first_date)}</code></p>
    <p class="meta">last_entry_date: <code>{_html_escape(last_date)}</code></p>
    <p class="meta">retrieval_hit_rate: <strong>{hit_rate:.4f}</strong> (Phase 13 AC2 telemetry)</p>
    <p class="meta">telemetry calls/hits: {t_total_calls}/{t_total_hits} · by_source: {t_source_str or '(none)'}</p>
    <p class="meta">by merge_state: {state_str or '(none)'}</p>
    <canvas id="chart-memory" height="160"></canvas>
  </section>"""


def _render_html_panel_4(p: dict[str, Any]) -> str:
    """Panel 4 HTML — smoke trend + chart canvas."""
    cum_total = int(p.get("cumulative_total", 0))
    cum_pass = int(p.get("cumulative_pass", 0))
    cum_rate = float(p.get("cumulative_pass_rate", 0.0))
    smoke_files = int(p.get("smoke_files_count", 0))
    return f"""  <section class="panel">
    <h2>Panel 4 — Smoke Trend</h2>
    <p class="stat pass">{cum_pass}/{cum_total}</p>
    <p class="meta">cumulative pass rate: {cum_rate:.4f}</p>
    <p class="meta">smoke test files: {smoke_files}</p>
    <canvas id="chart-smoke" height="160"></canvas>
  </section>"""


def _render_html_panel_5(p: dict[str, Any]) -> str:
    """Panel 5 HTML — recent releases timeline."""
    items_total = int(p.get("items_total", 0))
    top_n = int(p.get("top_n", 0))
    timeline = p.get("timeline", [])
    items: list[str] = []
    if isinstance(timeline, list):
        for entry in timeline:
            if isinstance(entry, dict):
                idx = entry.get("index", 0)
                preview = entry.get("preview", "")
                items.append(f"      <li>[{idx}] {_html_escape(str(preview))}</li>")
    timeline_html = "\n".join(items) if items else "      <li>(no items)</li>"
    return f"""  <section class="panel">
    <h2>Panel 5 — Recent Release Cycle</h2>
    <p>items_total: <strong>{items_total}</strong> (top_n={top_n})</p>
    <ul class="timeline">
{timeline_html}
    </ul>
  </section>"""


def _render_html_panel_6(p: dict[str, Any]) -> str:
    """Panel 6 HTML — multi-agent concurrent write conflict (Phase 15 north-star)."""
    north_star = _html_escape(str(p.get("north_star", "")))
    working_tree_count = int(p.get("working_tree_conflict_count", 0))
    git_log_count = int(p.get("git_log_conflict_count", 0))
    conflict_count = int(p.get("conflict_count", 0))
    status = _html_escape(str(p.get("status", "")))
    threshold = int(p.get("threshold", 0))
    locations = p.get("conflict_locations", [])
    loc_items: list[str] = []
    if isinstance(locations, list):
        for loc in locations[:10]:
            loc_items.append(f"      <li><code>{_html_escape(str(loc))}</code></li>")
    loc_html = "\n".join(loc_items) if loc_items else "      <li>(none)</li>"
    return f"""  <section class="panel panel-6">
    <h2>Panel 6 — Multi-Agent Concurrent Write Conflict</h2>
    <p class="meta">north_star: <code>{north_star}</code></p>
    <p class="meta">conflict_count: <strong>{conflict_count}</strong> (threshold={threshold})</p>
    <p class="meta">status: <strong>{status}</strong></p>
    <p class="meta">breakdown: working_tree={working_tree_count} · git_log={git_log_count}</p>
    <ul class="conflict-locations">
{loc_html}
    </ul>
  </section>"""


def _render_html_panel_7(p: dict[str, Any]) -> str:
    """Panel 7 HTML — deprecation cycle progress."""
    stage = _html_escape(str(p.get("stage", "")))
    declared = _html_escape(str(p.get("declared_stage", "")))
    bak = bool(p.get("bak_present", False))
    legacy = bool(p.get("legacy_present", False))
    warn = bool(p.get("deprecation_warning_supported", False))
    next_rel = _html_escape(str(p.get("next_release", "")))
    timeline = p.get("timeline", {})
    rows: list[str] = []
    if isinstance(timeline, dict):
        for ver, desc in timeline.items():
            marker = " ← <strong>current</strong>" if ver == stage else ""
            rows.append(
                f"      <tr><td><code>{_html_escape(str(ver))}</code></td>"
                f"<td>{_html_escape(str(desc))}{marker}</td></tr>"
            )
    rows_html = "\n".join(rows) if rows else "      <tr><td>(none)</td><td></td></tr>"
    return f"""  <section class="panel panel-7">
    <h2>Panel 7 — Deprecation Cycle Progress</h2>
    <p class="meta">stage: <strong>{stage}</strong></p>
    <p class="meta">declared_stage: <code>{declared}</code></p>
    <p class="meta">bak_present: <strong>{bak}</strong> · legacy_present: <strong>{legacy}</strong></p>
    <p class="meta">deprecation_warning_supported: <strong>{warn}</strong></p>
    <p class="meta">next_release: <code>{next_rel}</code></p>
    <table class="timeline">
      <thead><tr><th>Version</th><th>Stage</th></tr></thead>
      <tbody>
{rows_html}
      </tbody>
    </table>
  </section>"""


def _render_html_panel_8(p: dict[str, Any]) -> str:
    """Panel 8 HTML — memory index + telemetry utilization v2."""
    entries_total = int(p.get("entries_total", 0))
    events_total = int(p.get("telemetry_events_total", 0))
    queries = int(p.get("telemetry_total_queries", 0))
    hits = int(p.get("telemetry_hit_count", 0))
    hit_rate = float(p.get("telemetry_hit_rate", 0.0))
    by_ms = p.get("entries_by_merge_state", {})
    by_src = p.get("telemetry_by_source", {})
    ms_rows = ""
    if isinstance(by_ms, dict):
        ms_rows = "".join(
            f"<tr><td><code>{_html_escape(str(k))}</code></td><td>{v}</td></tr>"
            for k, v in sorted(by_ms.items())
        )
    src_rows = ""
    if isinstance(by_src, dict):
        src_rows = "".join(
            f"<tr><td><code>{_html_escape(str(k))}</code></td><td>{v}</td></tr>"
            for k, v in sorted(by_src.items())
        )
    return f"""  <section class="panel panel-8">
    <h2>Panel 8 — Memory Index + Telemetry Utilization v2</h2>
    <p class="meta">phase_15_north_star: <code>{_html_escape(str(p.get('phase_15_north_star', '')))}</code></p>
    <p class="meta">entries_total: <strong>{entries_total}</strong></p>
    <p class="meta">telemetry_events_total: <strong>{events_total}</strong> · queries: {queries} · hits: {hits}</p>
    <p class="meta">telemetry_hit_rate: <strong>{hit_rate:.4f}</strong></p>
    <h4>Entries by merge_state</h4>
    <table><tbody>{ms_rows}</tbody></table>
    <h4>Telemetry by source</h4>
    <table><tbody>{src_rows}</tbody></table>
  </section>"""


def _render_html_charts_js(panels: dict[str, Any]) -> str:
    """Chart.js 초기화 JS — graceful: JS off 시 static fallback 그대로 보임.

    Chart.js 가 로드된 후 chart 인스턴스 생성. 미로드 시 catch 후 silent.
    """
    # Panel 2: maturity (bar — skills stable/beta/alpha vs mcp stable/beta/alpha)
    p2 = panels.get("maturity_distribution", {}) if isinstance(panels.get("maturity_distribution"), dict) else {}
    skills = p2.get("skills", {}) if isinstance(p2.get("skills"), dict) else {}
    mcp = p2.get("mcp_tools", {}) if isinstance(p2.get("mcp_tools"), dict) else {}

    # Panel 3: memory cumulative timeline (line)
    p3 = panels.get("memory_index_utilization", {}) if isinstance(panels.get("memory_index_utilization"), dict) else {}
    timeline = p3.get("cumulative_timeline", [])
    timeline_dates: list[str] = []
    timeline_counts: list[int] = []
    if isinstance(timeline, list):
        for entry in timeline:
            if isinstance(entry, dict):
                timeline_dates.append(str(entry.get("date", "")))
                try:
                    timeline_counts.append(int(entry.get("count", 0)))
                except (TypeError, ValueError):
                    timeline_counts.append(0)

    # Panel 4: smoke trend (line — release versions)
    p4 = panels.get("smoke_trend", {}) if isinstance(panels.get("smoke_trend"), dict) else {}
    recent = p4.get("recent_releases", [])
    smoke_versions: list[str] = []
    smoke_counts: list[int] = []
    if isinstance(recent, list):
        for entry in recent:
            if isinstance(entry, dict):
                smoke_versions.append(str(entry.get("version", "")))
                try:
                    smoke_counts.append(int(entry.get("pass", 0)))
                except (TypeError, ValueError):
                    smoke_counts.append(0)
    smoke_versions.reverse()
    smoke_counts.reverse()

    import json as _json

    chart_data = {
        "maturity": {
            "labels": ["skills", "mcp_tools"],
            "stable": [int(skills.get("stable", 0)), int(mcp.get("stable", 0))],
            "beta": [int(skills.get("beta", 0)), int(mcp.get("beta", 0))],
            "alpha": [int(skills.get("alpha", 0)), int(mcp.get("alpha", 0))],
        },
        "memory": {
            "dates": timeline_dates,
            "counts": timeline_counts,
        },
        "smoke": {
            "versions": smoke_versions,
            "counts": smoke_counts,
        },
    }
    json_str = _json.dumps(chart_data, ensure_ascii=False)
    return f"""    (function() {{
      var data = {json_str};
      function ready(fn) {{
        if (typeof window.Chart !== 'undefined') {{ fn(); }}
        else {{ window.addEventListener('load', function() {{ if (typeof window.Chart !== 'undefined') fn(); }}); }}
      }}
      ready(function() {{
        try {{
          new Chart(document.getElementById('chart-maturity'), {{
            type: 'bar',
            data: {{
              labels: data.maturity.labels,
              datasets: [
                {{ label: 'stable', data: data.maturity.stable, backgroundColor: '#1b8a3a' }},
                {{ label: 'beta', data: data.maturity.beta, backgroundColor: '#d68910' }},
                {{ label: 'alpha', data: data.maturity.alpha, backgroundColor: '#c0392b' }},
              ],
            }},
            options: {{ responsive: true, plugins: {{ legend: {{ position: 'bottom' }} }}, scales: {{ x: {{ stacked: true }}, y: {{ stacked: true, beginAtZero: true }} }} }}
          }});
          new Chart(document.getElementById('chart-memory'), {{
            type: 'line',
            data: {{
              labels: data.memory.dates,
              datasets: [{{ label: 'cumulative entries', data: data.memory.counts, borderColor: '#1d6fb8', fill: false, tension: 0.1 }}],
            }},
            options: {{ responsive: true, plugins: {{ legend: {{ position: 'bottom' }} }} }}
          }});
          new Chart(document.getElementById('chart-smoke'), {{
            type: 'line',
            data: {{
              labels: data.smoke.versions,
              datasets: [{{ label: 'pass count', data: data.smoke.counts, borderColor: '#1b8a3a', fill: false, tension: 0.1 }}],
            }},
            options: {{ responsive: true, plugins: {{ legend: {{ position: 'bottom' }} }} }}
          }});
        }} catch (e) {{ /* silent — static fallback already visible */ }}
      }});
    }})();"""


__all__: list[str] = [
    "collect_drift_prevention",
    "collect_maturity_distribution",
    "collect_memory_index_utilization",
    "collect_smoke_trend",
    "collect_recent_releases",
    "collect_dashboard_snapshot",
    "render_dashboard_markdown",
    "render_dashboard_html",
    "run_drift_prevention_guard_inline",
    "SMOKE_COUNT_PATTERN",
    "EXPECTED_DRIFT_GUARD_CASES",
    "DEFAULT_RECENT_RELEASES",
    "DRIFT_GUARD_INLINE_TIMEOUT",
    "CHARTJS_CDN_URL",
]