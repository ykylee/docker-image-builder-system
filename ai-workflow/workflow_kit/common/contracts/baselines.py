# standard-ai-workflow-kit: v1.0.0-beta

"""Extension Baseline Compliance Evaluator (v0.7.1+ / v0.7.3+).

5종 baseline (security / testing / performance / security-auth / testing-property-based /
performance-memory / resiliency) 의 runtime compliance 평가.
각 rule 마다 compliant / non-compliant / N/A 평가 후 ComplianceSummary 반환.

1차 출시 (v0.7.1):
- security-baseline: 6 rule runtime check (file structure + R-9 skip marker)
- testing-baseline: 6 rule runtime check (smoke test count + generator quality)
- performance-baseline: 6 rule runtime check (smoke test time + import time + memory)

2차 출시 (v0.7.2, sub-cat 본 구현):
- auth-baseline (SEC-AUTH): 6 rule
- property-based-testing (PBT-WF): 6 rule
- memory-baseline (PERF-MEM): 6 rule
- resiliency-baseline (RES-WF): 8 rule

3차 출시 (v0.7.3, runtime helper 본 구현):
- 4 helper module (auth / testing / profiling / resiliency) 추가
- evaluate_compliance 5 baseline dispatcher 확장

Reference:
- workflow-source/extensions/SCHEMA.md §6 Helper Contract
- workflow-source/extensions/{security,testing,performance}-baseline.md
- workflow-source/extensions/security/auth/auth-baseline.md (v0.7.2+)
- workflow-source/extensions/testing/property-based/property-based-testing.md (v0.7.2+)
- workflow-source/extensions/performance/memory/memory-baseline.md (v0.7.2+)
- workflow-source/extensions/resiliency-baseline.md (v0.7.2+)
- workflow-source/workflow_kit/common/{auth,testing,profiling,resiliency}.py (v0.7.3+)
"""

from __future__ import annotations

import importlib
import re
import tempfile
import time
import tracemalloc
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Literal, cast
from workflow_kit.common.paths import state_path_for_workspace

# Type alias
Status = Literal["compliant", "non_compliant", "not_applicable", "advisory"]


@dataclass
class RuleResult:
    """단일 rule 의 평가 결과."""

    rule_id: str
    title: str
    status: Status
    notes: str = ""


@dataclass
class ComplianceSummary:
    """3종 baseline 의 평가 결과 묶음."""

    baseline: str
    status: Status
    partial_rules: list[str] = field(default_factory=list)
    results: list[RuleResult] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """JSON-serializable dict."""
        return {
            "baseline": self.baseline,
            "status": self.status,
            "partial_rules": list(self.partial_rules),
            "results": [
                {
                    "rule_id": r.rule_id,
                    "title": r.title,
                    "status": r.status,
                    "notes": r.notes,
                }
                for r in self.results
            ],
        }


# --- 공통 helper ---


def _read_state_json(project_root: Path) -> dict[str, Any]:
    """state.json 읽기 (없으면 빈 dict)."""
    state_path = state_path_for_workspace(project_root)
    if not state_path.exists():
        return {}
    try:
        import json
        loaded: Any = json.loads(state_path.read_text(encoding="utf-8"))
        if isinstance(loaded, dict):
            return cast(dict[str, Any], loaded)
        return {}
    except (json.JSONDecodeError, OSError):
        return {}


def _is_enabled(state: dict[str, Any], baseline: str) -> bool:
    """state.json 에서 baseline 의 enabled 여부 확인."""
    field = f"{baseline}_baseline"
    config = state.get(field, {})
    if isinstance(config, dict):
        return config.get("status") == "enabled"
    return False


def _get_partial_rules(state: dict[str, Any], baseline: str) -> list[str]:
    """state.json 에서 partial rule list 추출."""
    field = f"{baseline}_baseline"
    config = state.get(field, {})
    if isinstance(config, dict):
        return cast(list[str], config.get("partial_rules", []))
    return []


def _aggregate_status(results: list[RuleResult], partial_rules: list[str]) -> Status:
    """rule 결과 모음 → overall status.

    - 1+ non_compliant (in non-partial rule) → non_compliant
    - all compliant / N/A → compliant
    - partial mode: only partial_rules 가 hard constraint
    """
    hard_results = [r for r in results if r.rule_id in partial_rules or not partial_rules]
    if any(r.status == "non_compliant" for r in hard_results):
        return "non_compliant"
    if all(r.status in ("compliant", "not_applicable") for r in results):
        return "compliant"
    return "advisory"


# ===================================================================
# Security baseline (6 rule)
# ===================================================================


def _eval_security_baseline(project_root: Path, *, state: dict[str, Any] | None = None) -> ComplianceSummary:
    """6 SEC-WF rule runtime 평가."""
    results: list[RuleResult] = []

    # SEC-WF-01: Audit Log Append-Only + ISO 8601
    # 검증: stage_gate.append_audit_log 함수 존재 + ISO 8601 정규식 매칭
    try:
        from workflow_kit.common.contracts.stage_gate import append_audit_log  # noqa: F401
        # audit log 가 ISO 8601 사용 — spec 에 명시
        stage_gate_path = project_root / "workflow-source" / "workflow_kit" / "common" / "contracts" / "stage_gate.py"
        if stage_gate_path.exists():
            content = stage_gate_path.read_text(encoding="utf-8")
            iso_ok = bool(re.search(r"fromisoformat|ISO.8601", content))
            results.append(RuleResult(
                rule_id="SEC-WF-01",
                title="Audit Log Append-Only + ISO 8601",
                status="compliant" if iso_ok else "non_compliant",
                notes="append_audit_log + ISO 8601 fromisoformat",
            ))
        else:
            results.append(RuleResult("SEC-WF-01", "Audit Log Append-Only + ISO 8601", "not_applicable"))
    except ImportError:
        results.append(RuleResult("SEC-WF-01", "Audit Log Append-Only + ISO 8601", "not_applicable"))

    # SEC-WF-02: Stage Gate Approval Mandatory
    try:
        from workflow_kit.common.contracts.stage_gate import require_explicit_approval  # noqa: F401
        results.append(RuleResult(
            rule_id="SEC-WF-02",
            title="Stage Gate Approval Mandatory",
            status="compliant",
            notes="require_explicit_approval 함수 존재",
        ))
    except ImportError:
        results.append(RuleResult("SEC-WF-02", "Stage Gate Approval Mandatory", "non_compliant"))

    # SEC-WF-03: Question Format Validation
    try:
        from workflow_kit.common.contracts.question_format import validate_answers  # noqa: F401
        results.append(RuleResult(
            rule_id="SEC-WF-03",
            title="Question Format Validation",
            status="compliant",
            notes="validate_answers 함수 존재",
        ))
    except ImportError:
        results.append(RuleResult("SEC-WF-03", "Question Format Validation", "non_compliant"))

    # SEC-WF-04: Error Handling Fail-Closed
    # 검증: stage_gate_runtime 또는 contracts 가 raise-on-error 정책
    fail_closed_ok = False
    for path in [
        project_root / "workflow-source" / "workflow_kit" / "common" / "contracts" / "stage_gate.py",
        project_root / "workflow-source" / "workflow_kit" / "common" / "contracts" / "stage_gate_runtime.py",
    ]:
        if path.exists() and "raise" in path.read_text(encoding="utf-8"):
            fail_closed_ok = True
            break
    results.append(RuleResult(
        rule_id="SEC-WF-04",
        title="Error Handling Fail-Closed",
        status="compliant" if fail_closed_ok else "advisory",
        notes="stage_gate raise-on-error 패턴 확인",
    ))

    # SEC-WF-05: Dependency Integrity
    # SEC-WF-05: Dependency Integrity (v0.7.1 follow-up)
    # 검증: pyproject.toml 의 lock / version pin + checksum
    pyproject_path = project_root / "workflow-source" / "pyproject.toml"
    req_txt_path = project_root / "workflow-source" / "requirements.txt"
    req_dev_txt_path = project_root / "workflow-source" / "requirements-dev.txt"
    if not pyproject_path.exists():
        results.append(RuleResult("SEC-WF-05", "Dependency Integrity", "not_applicable"))
    else:
        # 1) version pinning 검증: dependencies 의 모든 entry 가 == 또는 >= 명시
        pyproject_text = pyproject_path.read_text(encoding="utf-8")
        # dependencies section 추출
        dep_match = re.search(
            r"^dependencies\s*=\s*\[(.*?)\]",
            pyproject_text,
            re.MULTILINE | re.DOTALL,
        )
        pinned = False
        if dep_match:
            deps = dep_match.group(1)
            # '==' or '>=' 패턴 카운트
            strict_count = len(re.findall(r'==\s*[\d.]+', deps))
            loose_count = len(re.findall(r'>=\s*[\d.]+', deps))
            if strict_count + loose_count >= 1:
                pinned = True
        # 2) lock file 검증: requirements.txt / requirements-dev.txt / uv.lock / poetry.lock
        lock_files = [
            req_txt_path,
            req_dev_txt_path,
            project_root / "uv.lock",
            project_root / "poetry.lock",
        ]
        has_lock = any(p.exists() for p in lock_files)
        # 3) checksum 검증: SHA256 또는 PGP signature
        has_checksum = "sha256" in pyproject_text.lower() or "gpg" in pyproject_text.lower()

        notes_parts = []
        if pinned:
            notes_parts.append("version pinned")
        else:
            notes_parts.append("no version pin")
        if has_lock:
            notes_parts.append("lock file present")
        else:
            notes_parts.append("no lock file (pip install 시 reproducibility 약함)")
        if has_checksum:
            notes_parts.append("checksum verified")
        else:
            notes_parts.append("no checksum (supply chain 검증 부재)")

        # 평가: pinned + (lock OR checksum) = compliant
        if pinned and (has_lock or has_checksum):
            status: Status = "compliant"
        elif pinned:
            status = "advisory"
        else:
            status = "non_compliant"

        results.append(RuleResult(
            rule_id="SEC-WF-05",
            title="Dependency Integrity",
            status=status,
            notes=", ".join(notes_parts),
        ))

    # SEC-WF-06: R-9 Skip Marker
    # 검증: extensions/*.md 파일에 r9_skip frontmatter 존재 (skip marker)
    r9_skip = False
    ext_dir = project_root / "workflow-source" / "extensions"
    if ext_dir.exists():
        for md in ext_dir.glob("*.md"):
            if "r9_skip" in md.read_text(encoding="utf-8", errors="ignore"):
                r9_skip = True
                break
    results.append(RuleResult(
        rule_id="SEC-WF-06",
        title="R-9 Skip Marker",
        status="compliant" if r9_skip else "advisory",
        notes="extensions/ 내 r9_skip frontmarker 검증",
    ))

    state = state if state is not None else _read_state_json(project_root)
    partial = _get_partial_rules(state, "security")
    return ComplianceSummary(
        baseline="security",
        status=_aggregate_status(results, partial),
        partial_rules=partial,
        results=results,
    )


# ===================================================================
# Testing baseline (6 rule)
# ===================================================================


def _eval_testing_baseline(project_root: Path, *, state: dict[str, Any] | None = None) -> ComplianceSummary:
    """6 TST-WF rule runtime 평가."""
    results: list[RuleResult] = []
    tests_dir = project_root / "workflow-source" / "tests"

    # TST-WF-01: Smoke Test Coverage Required (≥ 5 test case)
    # v0.15.16+ patch: historical `def case_*` 패턴도 인정. 196 file 중 77 file (39%) 가
    # pre-existing 인프라로 `def test_` 0~4개 → patch 후에도 min < 5 residual (운영 기록 v0.11.22 와 정합).
    smoke_test_files = list(tests_dir.glob("check_*.py")) if tests_dir.exists() else []
    test_count_per_file = {}
    for tf in smoke_test_files:
        content = tf.read_text(encoding="utf-8", errors="ignore")
        # "def test_" + "def case_" 모두 카운트 (historical compatibility)
        n_test = len(re.findall(r"^def test_", content, re.MULTILINE))
        n_case = len(re.findall(r"^def case_", content, re.MULTILINE))
        test_count_per_file[tf.name] = n_test + n_case
    min_tests = min(test_count_per_file.values()) if test_count_per_file else 0
    results.append(RuleResult(
        rule_id="TST-WF-01",
        title="Smoke Test Coverage Required",
        status="compliant" if min_tests >= 5 else "non_compliant",
        notes=f"min test count (test_ + case_): {min_tests} (need ≥ 5) across {len(smoke_test_files)} files",
    ))

    # TST-WF-02: Round-Trip Properties for State Serialization
    # 검증: state.json round-trip helper 또는 test 존재
    state_path = state_path_for_workspace(project_root)
    round_trip_ok = False
    if state_path.exists():
        # state.json + parse + serialize round-trip
        try:
            import json
            data = json.loads(state_path.read_text(encoding="utf-8"))
            roundtrip = json.dumps(data, indent=2, ensure_ascii=False, sort_keys=True)
            round_trip_ok = (roundtrip == state_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    results.append(RuleResult(
        rule_id="TST-WF-02",
        title="Round-Trip Properties",
        status="compliant" if round_trip_ok else "advisory",
        notes="state.json parse + serialize identity",
    ))

    # TST-WF-03: Invariant Properties (smoke test 에 test_invariant_* 1+)
    invariant_count = sum(
        1 for tf in smoke_test_files
        if re.search(r"^def test_invariant_", tf.read_text(encoding="utf-8", errors="ignore"), re.MULTILINE)
    )
    results.append(RuleResult(
        rule_id="TST-WF-03",
        title="Invariant Properties",
        status="compliant" if invariant_count >= 1 else "advisory",
        notes=f"test_invariant_* count: {invariant_count}",
    ))

    # TST-WF-04: Idempotency Properties (test_idempotency_* 1+)
    idempotency_count = sum(
        1 for tf in smoke_test_files
        if re.search(r"^def test_idempotency_", tf.read_text(encoding="utf-8", errors="ignore"), re.MULTILINE)
    )
    results.append(RuleResult(
        rule_id="TST-WF-04",
        title="Idempotency Properties",
        status="compliant" if idempotency_count >= 1 else "advisory",
        notes=f"test_idempotency_* count: {idempotency_count}",
    ))

    # TST-WF-05: Generator Quality (smoke test 의 generator/fixture 사용)
    fixture_count = sum(
        1 for tf in smoke_test_files
        if "fixture" in tf.read_text(encoding="utf-8", errors="ignore").lower() or "factory" in tf.read_text(encoding="utf-8", errors="ignore").lower()
    )
    results.append(RuleResult(
        rule_id="TST-WF-05",
        title="Generator Quality",
        status="compliant" if fixture_count >= 1 else "advisory",
        notes=f"smoke test with fixture/factory: {fixture_count}",
    ))

    # TST-WF-06: Verification Strategy Documented (모든 test 함수 docstring 1+ line)
    no_docstring = []
    for tf in smoke_test_files:
        content = tf.read_text(encoding="utf-8", errors="ignore")
        for m in re.finditer(r"^def test_\w+\(.*?\):\s*\n\s*\"\"\"(.+?)\"\"\"", content, re.MULTILINE | re.DOTALL):
            if not m.group(1).strip():
                no_docstring.append(f"{tf.name}:{m.group(0)[:30]}")
    results.append(RuleResult(
        rule_id="TST-WF-06",
        title="Verification Strategy Documented",
        status="compliant" if not no_docstring else "advisory",
        notes=f"test functions without docstring: {len(no_docstring)}",
    ))

    state = state if state is not None else _read_state_json(project_root)
    partial = _get_partial_rules(state, "testing")
    return ComplianceSummary(
        baseline="testing",
        status=_aggregate_status(results, partial),
        partial_rules=partial,
        results=results,
    )


# ===================================================================
# Performance baseline (6 rule)
# ===================================================================


def _eval_performance_baseline(project_root: Path, *, state: dict[str, Any] | None = None) -> ComplianceSummary:
    """6 PERF-WF rule runtime 평가."""
    results: list[RuleResult] = []
    tests_dir = project_root / "workflow-source" / "tests"

    # PERF-WF-01: Smoke Test Execution Time (≤ 30초 per file)
    #
    # ⚠️ 본 rule 은 *실제 smoke 를 실행* 한다. 그런데 smoke 중에는 `workflow doctor` 를
    # 호출하는 것이 있고(예: check_v0_7_4_followup.py), doctor 는 다시 본 rule 을 평가한다.
    # `glob()` 은 정렬을 보장하지 않으므로 `[:3]` 표본에 *자기 자신* 이 들어갈 수 있고,
    # 그 순간 doctor → smoke → doctor → smoke … 의 **무한 재귀 fork bomb** 이 된다
    # (실측: python3 프로세스 수백 개, PPID 가 서로 같은 스크립트, OOM 으로 세션 kill).
    # → 환경변수로 재귀 depth 를 1 로 제한하고, 표본은 정렬해 재현 가능하게 만든다.
    slow_tests = []
    import os
    import subprocess
    if os.environ.get("WORKFLOW_KIT_PERF_PROBE") == "1":
        results.append(RuleResult(
            rule_id="PERF-WF-01",
            title="Smoke Test Execution Time",
            status="not_applicable",
            notes="재귀 방지 — 이미 perf probe 안에서 실행 중",
        ))
        tests_dir = Path("/nonexistent")  # 아래 루프 skip
    if tests_dir.exists():
        probe_env = {**os.environ, "WORKFLOW_KIT_PERF_PROBE": "1"}
        for tf in sorted(tests_dir.glob("check_*.py"))[:3]:  # 정렬 표본 3개
            start = time.time()
            try:
                subprocess.run(
                    ["python3", str(tf)],
                    cwd=str(project_root),
                    capture_output=True,
                    timeout=30,
                    env=probe_env,
                    start_new_session=True,
                )
            except (subprocess.TimeoutExpired, FileNotFoundError):
                pass
            elapsed = time.time() - start
            if elapsed > 30:
                slow_tests.append(f"{tf.name}: {elapsed:.1f}s")
    results.append(RuleResult(
        rule_id="PERF-WF-01",
        title="Smoke Test Execution Time",
        status="compliant" if not slow_tests else "non_compliant",
        notes=f"slow tests (sample 3): {slow_tests or 'none'}",
    ))

    # PERF-WF-02: Module Import Time (≤ 1초)
    start = time.time()
    try:
        import workflow_kit
        import_time = time.time() - start
    except ImportError:
        import_time = 999
    results.append(RuleResult(
        rule_id="PERF-WF-02",
        title="Module Import Time",
        status="compliant" if import_time <= 1.0 else "non_compliant",
        notes=f"workflow_kit import time: {import_time:.3f}s (need ≤ 1.0s)",
    ))

    # PERF-WF-03: Memory Footprint (≤ 200 MB) — tracemalloc 측정
    try:
        tracemalloc.start()
        import workflow_kit
        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        # peak 는 bytes. 200MB = 200 * 1024 * 1024 = 209715200
        peak_mb = peak / (1024 * 1024)
        results.append(RuleResult(
            rule_id="PERF-WF-03",
            title="Memory Footprint",
            status="compliant" if peak_mb <= 200 else "advisory",
            notes=f"workflow_kit peak memory: {peak_mb:.1f} MB (need ≤ 200 MB)",
        ))
    except ImportError:
        results.append(RuleResult("PERF-WF-03", "Memory Footprint", "not_applicable"))

    # PERF-WF-04: Audit Log Append Latency (≤ 10ms avg)
    try:
        from workflow_kit.common.contracts.stage_gate import append_audit_log
        # 100회 호출 시 평균 latency
        latencies = []
        dummy = _dummy_completion()
        for _ in range(100):
            start = time.time()
            try:
                # append_audit_log(audit_path, completion) — original had args swapped
                # (real bug fix alongside v0.8.14 mypy strict 10단계).
                append_audit_log(
                    test_audit_path := project_root / "tmp_audit_perf.log",
                    dummy,
                )
            except (TypeError, OSError):
                pass
            latencies.append((time.time() - start) * 1000)
        avg_latency = sum(latencies) / len(latencies) if latencies else 0
        results.append(RuleResult(
            rule_id="PERF-WF-04",
            title="Audit Log Append Latency",
            status="compliant" if avg_latency <= 10 else "advisory",
            notes=f"avg latency: {avg_latency:.2f}ms (need ≤ 10ms)",
        ))
        # cleanup
        if (project_root / "tmp_audit_perf.log").exists():
            (project_root / "tmp_audit_perf.log").unlink()
    except ImportError:
        results.append(RuleResult("PERF-WF-04", "Audit Log Append Latency", "not_applicable"))

    # PERF-WF-05: state.json Read/Write Latency (≤ 5ms)
    state_path = state_path_for_workspace(project_root)
    if state_path.exists():
        rw_latencies = []
        # v1.0.0 fix: 이전 구현은 *실제* state.json 을 50회 read/write 했다. `write_text` 는
        # truncate 후 쓰기이므로 루프 도중 프로세스가 kill 되면 사용자의 작업 기억이
        # **0바이트로 소실**된다 (실제로 반복 발생). 벤치마크는 동일 크기의 사본을
        # temp 에서 수행하고 원본은 읽기만 한다.
        try:
            payload = state_path.read_text(encoding="utf-8")
        except OSError:
            payload = ""
        with tempfile.TemporaryDirectory() as _bench_dir:
            bench_path = Path(_bench_dir) / "state.json"
            for _ in range(50):
                start = time.time()
                try:
                    bench_path.write_text(payload, encoding="utf-8")
                    bench_path.read_text(encoding="utf-8")
                except OSError:
                    pass
                rw_latencies.append((time.time() - start) * 1000)
        avg_rw = sum(rw_latencies) / len(rw_latencies) if rw_latencies else 0
        results.append(RuleResult(
            rule_id="PERF-WF-05",
            title="state.json Read/Write Latency",
            status="compliant" if avg_rw <= 5 else "advisory",
            notes=f"avg R/W latency: {avg_rw:.2f}ms (need ≤ 5ms)",
        ))
    else:
        results.append(RuleResult("PERF-WF-05", "state.json Read/Write Latency", "not_applicable"))

    # PERF-WF-06: Profiling Hook
    profiling_ok = False
    profiling_path = project_root / "workflow-source" / "workflow_kit" / "common" / "profiling.py"
    if profiling_path.exists():
        profiling_ok = True
    results.append(RuleResult(
        rule_id="PERF-WF-06",
        title="Profiling Hook",
        status="compliant" if profiling_ok else "advisory",
        notes="workflow_kit.common.profiling module 존재 (v0.7.1+ follow-up)",
    ))

    state = state if state is not None else _read_state_json(project_root)
    partial = _get_partial_rules(state, "performance")
    return ComplianceSummary(
        baseline="performance",
        status=_aggregate_status(results, partial),
        partial_rules=partial,
        results=results,
    )


def _dummy_completion() -> Any:
    """PERF-WF-04 의 100회 호출용 dummy StageCompletion (v0.8.14 mypy strict 10단계).

    Real bug fix: v0.7.7 original tried to construct an `AuditLogEvent` (which does
    not exist in stage_gate). Replace with proper `StageCompletion` (the only
    audit-log payload accepted by `append_audit_log`).
    """
    from workflow_kit.common.contracts.stage_gate import StageCompletion
    return StageCompletion(
        stage_name="performance",
        stage_status="ok",
    )


# ===================================================================
# v0.7.3 — 4 신규 baseline dispatcher (sub-cat + runtime helper)
# ===================================================================


def _eval_security_auth_baseline(project_root: Path, *, state: dict[str, Any] | None = None) -> ComplianceSummary:
    """6 SEC-AUTH rule runtime 평가 (auth.py dispatcher)."""
    from workflow_kit.common.auth import evaluate_compliance as _eval

    result = _eval(project_root=project_root)
    # helper 는 dict[rule_id, title, status, notes] 를 반환. local RuleResult 로 변환.
    helper_results = cast(list[dict[str, Any]], result["results"])
    results = [
        RuleResult(
            rule_id=cast(str, r["rule_id"]),
            title=cast(str, r["title"]),
            status=cast(Status, r["status"]),
            notes=cast(str, r["notes"]),
        )
        for r in helper_results
    ]
    state = state if state is not None else _read_state_json(project_root)
    partial = _get_partial_rules(state, "security_auth")
    return ComplianceSummary(
        baseline="security-auth",
        status=cast(Status, result["status"]),
        partial_rules=partial,
        results=results,
    )


def _eval_testing_pbt_baseline(project_root: Path, *, state: dict[str, Any] | None = None) -> ComplianceSummary:
    """6 PBT-WF rule runtime 평가 (testing.py dispatcher)."""
    from workflow_kit.common.testing import evaluate_compliance as _eval

    result = _eval(project_root=project_root)
    helper_results = cast(list[dict[str, Any]], result["results"])
    results = [
        RuleResult(
            rule_id=cast(str, r["rule_id"]),
            title=cast(str, r["title"]),
            status=cast(Status, r["status"]),
            notes=cast(str, r["notes"]),
        )
        for r in helper_results
    ]
    state = state if state is not None else _read_state_json(project_root)
    partial = _get_partial_rules(state, "testing_pbt")
    return ComplianceSummary(
        baseline="testing-property-based",
        status=cast(Status, result["status"]),
        partial_rules=partial,
        results=results,
    )


def _eval_performance_memory_baseline(
    project_root: Path, fn: Callable[..., Any] | None = None, baseline_path: Path | None = None,
    *, state: dict[str, Any] | None = None,
) -> ComplianceSummary:
    """6 PERF-MEM rule runtime 평가 (profiling.py dispatcher)."""
    from workflow_kit.common.profiling import evaluate_compliance as _eval

    result = _eval(fn=fn, baseline_path=baseline_path)
    helper_results = cast(list[dict[str, Any]], result["results"])
    results = [
        RuleResult(
            rule_id=cast(str, r["rule_id"]),
            title=cast(str, r["title"]),
            status=cast(Status, r["status"]),
            notes=cast(str, r["notes"]),
        )
        for r in helper_results
    ]
    state = state if state is not None else _read_state_json(project_root)
    partial = _get_partial_rules(state, "performance_memory")
    return ComplianceSummary(
        baseline="performance-memory",
        status=cast(Status, result["status"]),
        partial_rules=partial,
        results=results,
    )


def _eval_resiliency_baseline(project_root: Path, *, state: dict[str, Any] | None = None) -> ComplianceSummary:
    """8 RES-WF rule runtime 평가 (resiliency.py dispatcher)."""
    from workflow_kit.common.resiliency import evaluate_compliance as _eval

    result = _eval(project_root=project_root)
    helper_results = cast(list[dict[str, Any]], result["results"])
    results = [
        RuleResult(
            rule_id=cast(str, r["rule_id"]),
            title=cast(str, r["title"]),
            status=cast(Status, r["status"]),
            notes=cast(str, r["notes"]),
        )
        for r in helper_results
    ]
    state = state if state is not None else _read_state_json(project_root)
    partial = _get_partial_rules(state, "resiliency")
    return ComplianceSummary(
        baseline="resiliency",
        status=cast(Status, result["status"]),
        partial_rules=partial,
        results=results,
    )


# ===================================================================
# Public API
# ===================================================================


def evaluate_compliance(
    project_root: Path,
    baseline: str,
    fn: Callable[..., Any] | None = None,
    baseline_path: Path | None = None,
    *,
    state: dict[str, Any] | None = None,
) -> ComplianceSummary:
    """단일 baseline 의 compliance 평가.

    Args:
        project_root: 프로젝트 루트 경로 (state.json 위치)
        baseline: "security" | "testing" | "performance" |
                  "security-auth" | "testing-property-based" |
                  "performance-memory" | "resiliency"
        fn: performance-memory baseline 의 측정 callable (optional)
        baseline_path: performance-memory baseline 의 regression baseline (optional)
        state: v0.7.8+ state dict (in-memory override). None 이면 project_root/state.json read.
            caller (e.g. workflow_kit.cli.doctor) 가 pyproject.toml [tool.workflow-doctor]
            config 의 partial_rules / opt_in 을 *in-memory* state 에 merge 한 뒤 주입 가능.

    Returns:
        ComplianceSummary with overall status + per-rule results.
    """
    if baseline == "security":
        return _eval_security_baseline(project_root, state=state)
    if baseline == "testing":
        return _eval_testing_baseline(project_root, state=state)
    if baseline == "performance":
        return _eval_performance_baseline(project_root, state=state)
    if baseline == "security-auth":
        return _eval_security_auth_baseline(project_root, state=state)
    if baseline == "testing-property-based":
        return _eval_testing_pbt_baseline(project_root, state=state)
    if baseline == "performance-memory":
        return _eval_performance_memory_baseline(
            project_root, fn=fn, baseline_path=baseline_path, state=state,
        )
    if baseline == "resiliency":
        return _eval_resiliency_baseline(project_root, state=state)
    raise ValueError(f"unknown baseline: {baseline}")


def evaluate_all(
    project_root: Path,
    fn: Callable[..., Any] | None = None,
    baseline_path: Path | None = None,
    *,
    state: dict[str, Any] | None = None,
) -> dict[str, ComplianceSummary]:
    """5종 baseline 모두 평가 (v0.7.3+ 7 baseline dispatcher).

    Args:
        project_root: 프로젝트 루트 경로
        fn: performance-memory baseline 의 측정 callable (optional)
        baseline_path: performance-memory baseline 의 regression baseline (optional)
        state: v0.7.8+ state dict (in-memory override). None 이면 project_root/state.json read.

    Returns:
        dict mapping baseline name → ComplianceSummary.
    """
    return {
        # v0.7.1 (3 baseline)
        "security": _eval_security_baseline(project_root, state=state),
        "testing": _eval_testing_baseline(project_root, state=state),
        "performance": _eval_performance_baseline(project_root, state=state),
        # v0.7.3 (4 baseline dispatcher — sub-cat 본 구현)
        "security-auth": _eval_security_auth_baseline(project_root, state=state),
        "testing-property-based": _eval_testing_pbt_baseline(project_root, state=state),
        "performance-memory": _eval_performance_memory_baseline(
            project_root, fn=fn, baseline_path=baseline_path, state=state,
        ),
        "resiliency": _eval_resiliency_baseline(project_root, state=state),
    }
