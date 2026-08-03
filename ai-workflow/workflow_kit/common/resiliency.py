# standard-ai-workflow-kit: v1.0.0-beta

"""workflow_kit.common.resiliency — v0.7.3 RES-WF-01~08 runtime evaluator.

AIDLC 차용 resiliency-baseline 의 8 rule runtime 검증 (16 → 8 적응).
적용 범위: workflow runtime (Python CLI / TUI). HTTP service / K8s / DR 같은 cloud-specific rule 은 N/A.

1. RES-WF-01: Health Check Endpoint (CLI 에서 --health)
2. RES-WF-02: Structured Logging (JSON 또는 key=value)
3. RES-WF-03: Metrics Exposure (counters / gauges 를 log file 에 dump)
4. RES-WF-04: Distributed Trace ID (workflow run-id, stage-id propagation)
5. RES-WF-05: Error Context (exception 시 5-tuple: type/message/cause/location/remediation)
6. RES-WF-06: Graceful Shutdown (SIGINT/SIGTERM handler)
7. RES-WF-07: Resource Limit (CLI arg, env var 로 max iter / max time 설정)
8. RES-WF-08: Health Snapshot (최근 N 회 run 의 pass/fail cache)

Reference:
- workflow-source/extensions/resiliency-baseline.md
- AIDLC extensions/resiliency/baseline/resiliency-baseline.md (lines 1-490)
"""

from __future__ import annotations

import json
import re
import signal
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

Status = str  # "compliant" | "non_compliant" | "not_applicable" | "advisory"


@dataclass
class RuleResult:
    rule_id: str
    title: str
    status: Status
    notes: str = ""


# --- 8 Rule evaluators ---


def check_health_check(project_root: Path) -> RuleResult:
    """RES-WF-01: --health / --doctor / doctor subcommand 존재."""
    candidates = [
        project_root / "workflow-source" / "tools" / "doctor.py",
        project_root / "tools" / "doctor.py",
        project_root / "workflow_kit" / "cli" / "doctor.py",
    ]
    has_doctor = any(p.exists() for p in candidates)
    if not has_doctor:
        return RuleResult(
            rule_id="RES-WF-01",
            title="Health Check",
            status="advisory",
            notes="doctor.py 미존재 (workflow self-diagnostics 권장)",
        )
    return RuleResult(
        rule_id="RES-WF-01",
        title="Health Check",
        status="compliant",
        notes=f"doctor.py 발견: {[str(p.relative_to(project_root)) for p in candidates if p.exists()]}",
    )


def check_structured_logging(project_root: Path) -> RuleResult:
    """RES-WF-02: structured logging (json.dumps / key=value / structlog)."""
    candidates = list((project_root / "workflow-source").rglob("*.py")) + list(
        (project_root / "workflow_kit").rglob("*.py")
    )
    has_json_log = False
    has_kv_log = False
    for path in candidates:
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except (OSError, UnicodeDecodeError):
            continue
        if re.search(r"json\.dumps\(.*log|logger\.info\(.*\{", content):
            has_json_log = True
        if re.search(r"log(?:ger)?\.(?:info|warning|error)\(.*key\s*=\s*value|key=val|extra=\{", content):
            has_kv_log = True
    if has_json_log or has_kv_log:
        return RuleResult(
            rule_id="RES-WF-02",
            title="Structured Logging",
            status="compliant",
            notes=f"json_log={has_json_log}, kv_log={has_kv_log}",
        )
    return RuleResult(
        rule_id="RES-WF-02",
        title="Structured Logging",
        status="advisory",
        notes="structured log 0개 (json.dumps / extra={} 권장)",
    )


def check_metrics_dump(project_root: Path) -> RuleResult:
    """RES-WF-03: metrics exposure (counter / gauge dump 가능)."""
    candidates = list((project_root / "workflow-source" / "tools").rglob("*.py")) + list(
        (project_root / "workflow_kit").rglob("*.py")
    )
    has_metrics = False
    for path in candidates:
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except (OSError, UnicodeDecodeError):
            continue
        if re.search(r"def\s+get_metrics\(|def\s+collect_metrics\(|prometheus_client|metric_dump", content):
            has_metrics = True
            break
    if has_metrics:
        return RuleResult(
            rule_id="RES-WF-03",
            title="Metrics Exposure",
            status="compliant",
            notes="metrics dump function 발견",
        )
    return RuleResult(
        rule_id="RES-WF-03",
        title="Metrics Exposure",
        status="advisory",
        notes="get_metrics() / collect_metrics() / prometheus_client 0개",
    )


def check_run_id_propagation(project_root: Path) -> RuleResult:
    """RES-WF-04: run_id / trace_id propagation across stages."""
    # check 3 file: stage_gate.py, stage_gate_runtime.py, audit_log_standard.md
    audit_md = project_root / "workflow-source" / "core" / "audit_log_standard.md"
    candidates = [
        project_root / "workflow-source" / "workflow_kit" / "common" / "contracts" / "stage_gate.py",
        project_root / "workflow-source" / "workflow_kit" / "common" / "contracts" / "stage_gate_runtime.py",
    ]
    has_run_id = False
    if audit_md.exists():
        if "run_id" in audit_md.read_text(encoding="utf-8", errors="ignore"):
            has_run_id = True
    for path in candidates:
        if path.exists():
            if "run_id" in path.read_text(encoding="utf-8", errors="ignore"):
                has_run_id = True
    if has_run_id:
        return RuleResult(
            rule_id="RES-WF-04",
            title="Run-ID Propagation",
            status="compliant",
            notes="stage_gate / audit_log_standard 에 run_id 추적",
        )
    return RuleResult(
        rule_id="RES-WF-04",
        title="Run-ID Propagation",
        status="advisory",
        notes="run_id field 0개 (stage 별 trace 권장)",
    )


def check_error_context(project_root: Path) -> RuleResult:
    """RES-WF-05: exception handling 시 5-tuple (type / message / cause / location / remediation).

    Heuristic: except block 에 5+ attribute assignment / logging.
    """
    candidates = list((project_root / "workflow-source" / "workflow_kit").rglob("*.py"))
    has_5tuple = False
    for path in candidates:
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except (OSError, UnicodeDecodeError):
            continue
        # 5-tuple: error_type + error_message + error_cause + error_location + error_remediation
        attrs = ["error_type", "error_message", "error_cause", "error_location", "error_remediation"]
        present = sum(1 for a in attrs if a in content)
        if present >= 4:
            has_5tuple = True
            break
    if has_5tuple:
        return RuleResult(
            rule_id="RES-WF-05",
            title="Error Context 5-Tuple",
            status="compliant",
            notes="4+ of 5 error_* attribute 발견",
        )
    return RuleResult(
        rule_id="RES-WF-05",
        title="Error Context 5-Tuple",
        status="advisory",
        notes="5-tuple error context 0개 (5 attribute logging 권장)",
    )


def check_graceful_shutdown(project_root: Path) -> RuleResult:
    """RES-WF-06: SIGINT / SIGTERM handler 등록."""
    candidates = list((project_root / "workflow-source" / "workflow_kit").rglob("*.py"))
    has_signal_handler = False
    for path in candidates:
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except (OSError, UnicodeDecodeError):
            continue
        if re.search(r"signal\.signal\(.*SIGINT|signal\.signal\(.*SIGTERM|signal\.Handlers", content):
            has_signal_handler = True
            break
    if has_signal_handler:
        return RuleResult(
            rule_id="RES-WF-06",
            title="Graceful Shutdown",
            status="compliant",
            notes="signal.signal(SIGINT/SIGTERM) handler 발견",
        )
    return RuleResult(
        rule_id="RES-WF-06",
        title="Graceful Shutdown",
        status="advisory",
        notes="signal handler 0개 (단발성 script 인 경우 N/A 가능)",
    )


def check_resource_limit(project_root: Path) -> RuleResult:
    """RES-WF-07: max iter / max time 의 resource limit 존재."""
    candidates = list((project_root / "workflow-source" / "workflow_kit").rglob("*.py"))
    has_limit = False
    for path in candidates:
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except (OSError, UnicodeDecodeError):
            continue
        # max_iter, max_time, max_size 등
        if re.search(r"max_iter|max_time|max_size|MAX_ITER|MAX_TIME|RESOURCE_LIMIT", content):
            has_limit = True
            break
    if has_limit:
        return RuleResult(
            rule_id="RES-WF-07",
            title="Resource Limit",
            status="compliant",
            notes="max_iter / max_time / max_size 상수 발견",
        )
    return RuleResult(
        rule_id="RES-WF-07",
        title="Resource Limit",
        status="advisory",
        notes="max_iter / max_time resource limit 0개",
    )


def check_health_snapshot(project_root: Path) -> RuleResult:
    """RES-WF-08: health snapshot (최근 N 회 run 의 pass/fail cache)."""
    # check log.md 의 v*.* commit hash + test PASS count
    log_md = project_root / "ai-workflow" / "wiki" / "log.md"
    if not log_md.exists():
        return RuleResult(
            rule_id="RES-WF-08",
            title="Health Snapshot",
            status="advisory",
            notes="wiki/log.md 미존재",
        )
    content = log_md.read_text(encoding="utf-8", errors="ignore")
    # recent 5 run 의 PASS / FAIL count
    pass_count = len(re.findall(r"\d+ test PASS|test PASS|✓", content))
    fail_count = len(re.findall(r"test FAIL|✗|FAIL", content))
    if pass_count == 0:
        return RuleResult(
            rule_id="RES-WF-08",
            title="Health Snapshot",
            status="advisory",
            notes="log.md 에 PASS 기록 0",
        )
    return RuleResult(
        rule_id="RES-WF-08",
        title="Health Snapshot",
        status="compliant",
        notes=f"log.md pass={pass_count}, fail={fail_count}",
    )


# --- Public API ---


def evaluate_compliance(project_root: Path) -> dict[str, Any]:
    """8 RES-WF rule 의 compliance 평가."""
    results = [
        check_health_check(project_root),
        check_structured_logging(project_root),
        check_metrics_dump(project_root),
        check_run_id_propagation(project_root),
        check_error_context(project_root),
        check_graceful_shutdown(project_root),
        check_resource_limit(project_root),
        check_health_snapshot(project_root),
    ]
    if any(r.status == "non_compliant" for r in results):
        overall = "non_compliant"
    elif all(r.status in ("compliant", "not_applicable") for r in results):
        overall = "compliant"
    else:
        overall = "advisory"
    return {
        "baseline": "resiliency",
        "status": overall,
        "results": [
            {"rule_id": r.rule_id, "title": r.title, "status": r.status, "notes": r.notes}
            for r in results
        ],
    }
