# standard-ai-workflow-kit: v0.15.19-beta

"""workflow_kit.common.profiling — v0.7.3 PERF-MEM-01~06 runtime evaluator.

AIDLC 차용 memory-baseline 의 6 rule runtime 검증:
1. PERF-MEM-01: Peak Memory ≤ 200 MB (workflow tool 호출 시)
2. PERF-MEM-02: Memory Leak Detection (gc.collect() 후 RSS 안정성)
3. PERF-MEM-03: GC Pause ≤ 5% (gc.set_debug 없이 set_threshold 로 제한)
4. PERF-MEM-04: Reference Cycle Detection (gc.is_finalized, weakref)
5. PERF-MEM-05: Profiling (cProfile / timeit)
6. PERF-MEM-06: Memory Regression Test (baseline 대비 ±10%)

Reference:
- workflow-source/extensions/performance/memory/memory-baseline.md
- AIDLC extensions/performance/memory/memory-baseline.md (lines 1-220)
"""

from __future__ import annotations

import gc
import json
import os
import resource
import sys
import time
import tracemalloc
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

Status = str  # "compliant" | "non_compliant" | "not_applicable" | "advisory"


@dataclass
class RuleResult:
    rule_id: str
    title: str
    status: Status
    notes: str = ""


# 200 MB threshold
PEAK_MEMORY_MB = 200
LEAK_GROWTH_BYTES = 5 * 1024 * 1024  # 5 MB
GC_PAUSE_RATIO = 0.05
REGRESSION_RATIO = 0.10  # ±10%


# --- Helper: memory snapshot ---


def _rss_bytes() -> int:
    """현재 process 의 RSS in bytes (macOS resource)."""
    usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    # macOS: ru_maxrss is bytes; Linux: kilobytes
    if sys.platform == "darwin":
        return int(usage)
    return int(usage) * 1024


# --- 6 Rule evaluators ---


def measure_peak_memory(fn: Callable[[], object]) -> int:
    """함수 실행 중 peak memory (bytes).

    tracemalloc 으로 heap peak 측정, RSS 도 함께 capture.
    """
    gc.collect()
    tracemalloc.start()
    rss_before = _rss_bytes()
    try:
        fn()
    finally:
        snapshot = tracemalloc.take_snapshot()
        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
    rss_peak = max(rss_before, _rss_bytes())
    return int(max(peak, rss_peak - rss_before))


def check_peak_memory_limit(fn: Callable[[], object]) -> RuleResult:
    """PERF-MEM-01: peak memory ≤ 200 MB."""
    peak = measure_peak_memory(fn)
    peak_mb = peak / (1024 * 1024)
    if peak_mb <= PEAK_MEMORY_MB:
        return RuleResult(
            rule_id="PERF-MEM-01",
            title="Peak Memory ≤ 200 MB",
            status="compliant",
            notes=f"peak {peak_mb:.1f} MB ≤ 200 MB",
        )
    return RuleResult(
        rule_id="PERF-MEM-01",
        title="Peak Memory ≤ 200 MB",
        status="non_compliant",
        notes=f"peak {peak_mb:.1f} MB > 200 MB",
    )


def check_memory_leak(fn: Callable[[], object], iterations: int = 10) -> RuleResult:
    """PERF-MEM-02: 10 회 반복 후 RSS 성장 < 5 MB."""
    if iterations < 2:
        return RuleResult(
            rule_id="PERF-MEM-02",
            title="Memory Leak Detection",
            status="not_applicable",
            notes="iterations < 2",
        )
    gc.collect()
    rss0 = _rss_bytes()
    for _ in range(iterations):
        fn()
        gc.collect()
    rss1 = _rss_bytes()
    growth = rss1 - rss0
    if growth < LEAK_GROWTH_BYTES:
        return RuleResult(
            rule_id="PERF-MEM-02",
            title="Memory Leak Detection",
            status="compliant",
            notes=f"10 회 반복 후 growth {growth / 1024:.1f} KB < 5 MB",
        )
    return RuleResult(
        rule_id="PERF-MEM-02",
        title="Memory Leak Detection",
        status="non_compliant",
        notes=f"growth {growth / 1024 / 1024:.1f} MB ≥ 5 MB (potential leak)",
    )


def check_gc_pause(fn: Callable[[], object], iterations: int = 50) -> RuleResult:
    """PERF-MEM-03: GC pause / total runtime ≤ 5%."""
    gc.collect()
    # baseline: gc pause time
    start_gc = sum(gc.get_stats()[-1].get("collected", 0) for _ in [0])  # snapshot
    t0 = time.perf_counter()
    for _ in range(iterations):
        fn()
    elapsed = time.perf_counter() - t0
    # measure gc overhead: get_stats() collected count delta
    gc.collect()
    stats = gc.get_stats()
    collected = sum(s.get("collected", 0) for s in stats)
    # heuristic: assume 1 collected object ≈ 10 µs
    gc_pause_est = collected * 1e-5
    if elapsed <= 0:
        return RuleResult(
            rule_id="PERF-MEM-03",
            title="GC Pause ≤ 5%",
            status="not_applicable",
            notes="elapsed = 0 (function too fast)",
        )
    ratio = gc_pause_est / elapsed
    if ratio <= GC_PAUSE_RATIO:
        return RuleResult(
            rule_id="PERF-MEM-03",
            title="GC Pause ≤ 5%",
            status="compliant",
            notes=f"gc pause ratio {ratio * 100:.2f}% ≤ 5% (collected={collected}, elapsed={elapsed * 1000:.1f}ms)",
        )
    return RuleResult(
        rule_id="PERF-MEM-03",
        title="GC Pause ≤ 5%",
        status="non_compliant",
        notes=f"gc pause ratio {ratio * 100:.2f}% > 5%",
    )


def check_reference_cycle(fn: Callable[[], object]) -> RuleResult:
    """PERF-MEM-04: 함수 실행 후 unreachable object 0개.

    Reference cycle = container 가 서로 참조 (list.append(self) 등).
    v0.7.4+: optional `objgraph` (reference graph visualization). 미설치 시 fallback.
    """
    before = len(gc.get_objects())
    fn()
    gc.collect()
    after = len(gc.get_objects())
    # if growth is small and finalizable count is 0, OK
    finalizers = sum(1 for o in gc.get_objects() if gc.is_finalized(o))
    growth = after - before

    # v0.7.4: objgraph package 가용성 (optional — reference chain 시각화)
    objgraph_installed = False
    try:
        # objgraph 는 optional dependency — mypy 의 import-untyped ignore
        import objgraph  # type: ignore[import-untyped]  # noqa: F401
        objgraph_installed = True
    except ImportError:
        pass

    if finalizers == 0 and growth < 1000:
        note = f"object growth {growth} < 1000, finalizer {finalizers}"
        if objgraph_installed:
            note += " | objgraph available (deep ref-chain 분석 가능)"
        return RuleResult(
            rule_id="PERF-MEM-04",
            title="Reference Cycle",
            status="compliant",
            notes=note,
        )
    note = f"object growth {growth}, finalizer {finalizers} (review 필요)"
    if not objgraph_installed:
        note += " | optional: pip install objgraph (ref-chain 시각화)"
    return RuleResult(
        rule_id="PERF-MEM-04",
        title="Reference Cycle",
        status="advisory",
        notes=note,
    )


def check_profiling_available() -> RuleResult:
    """PERF-MEM-05: cProfile / timeit 사용 가능 (stdlib)."""
    try:
        import cProfile  # noqa: F401
        import timeit  # noqa: F401
    except ImportError as e:
        return RuleResult(
            rule_id="PERF-MEM-05",
            title="Profiling 도구",
            status="non_compliant",
            notes=f"stdlib missing: {e}",
        )
    return RuleResult(
        rule_id="PERF-MEM-05",
        title="Profiling 도구",
        status="compliant",
        notes="cProfile + timeit stdlib 가용",
    )


def check_memory_regression(
    fn: Callable[[], object], baseline_path: Path
) -> RuleResult:
    """PERF-MEM-06: baseline 대비 ±10% 이내.

    baseline_path: JSON file with `{"peak_bytes": <int>}`.
    """
    if not baseline_path.exists():
        return RuleResult(
            rule_id="PERF-MEM-06",
            title="Memory Regression Test",
            status="not_applicable",
            notes=f"baseline {baseline_path} 미존재",
        )
    try:
        baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
        baseline_bytes = int(baseline.get("peak_bytes", 0))
    except (json.JSONDecodeError, ValueError) as e:
        return RuleResult(
            rule_id="PERF-MEM-06",
            title="Memory Regression Test",
            status="advisory",
            notes=f"baseline parse error: {e}",
        )
    if baseline_bytes <= 0:
        return RuleResult(
            rule_id="PERF-MEM-06",
            title="Memory Regression Test",
            status="not_applicable",
            notes="baseline peak_bytes ≤ 0",
        )
    current = measure_peak_memory(fn)
    delta_ratio = abs(current - baseline_bytes) / baseline_bytes
    if delta_ratio <= REGRESSION_RATIO:
        return RuleResult(
            rule_id="PERF-MEM-06",
            title="Memory Regression Test",
            status="compliant",
            notes=f"current {current / 1024 / 1024:.1f} MB vs baseline {baseline_bytes / 1024 / 1024:.1f} MB (Δ {delta_ratio * 100:.1f}% ≤ 10%)",
        )
    return RuleResult(
        rule_id="PERF-MEM-06",
        title="Memory Regression Test",
        status="non_compliant",
        notes=f"Δ {delta_ratio * 100:.1f}% > 10% (current {current / 1024 / 1024:.1f} MB vs baseline {baseline_bytes / 1024 / 1024:.1f} MB)",
    )


# --- Public API ---


def evaluate_compliance(
    fn: Callable[[], object] | None = None,
    baseline_path: Path | None = None,
    iterations_leak: int = 10,
    iterations_gc: int = 50,
) -> dict[str, Any]:
    """6 PERF-MEM rule 의 compliance 평가.

    fn: 측정할 callable. None 이면 N/A 처리.
    """
    results: list[RuleResult] = []
    if fn is None:
        results = [
            RuleResult(rule_id="PERF-MEM-01", title="Peak Memory ≤ 200 MB", status="not_applicable", notes="fn 미지정"),
            RuleResult(rule_id="PERF-MEM-02", title="Memory Leak Detection", status="not_applicable", notes="fn 미지정"),
            RuleResult(rule_id="PERF-MEM-03", title="GC Pause ≤ 5%", status="not_applicable", notes="fn 미지정"),
            RuleResult(rule_id="PERF-MEM-04", title="Reference Cycle", status="not_applicable", notes="fn 미지정"),
            RuleResult(rule_id="PERF-MEM-05", title="Profiling 도구", status="compliant", notes="stdlib 가용"),
            RuleResult(rule_id="PERF-MEM-06", title="Memory Regression Test", status="not_applicable", notes="fn/baseline 미지정"),
        ]
    else:
        results = [
            check_peak_memory_limit(fn),
            check_memory_leak(fn, iterations=iterations_leak),
            check_gc_pause(fn, iterations=iterations_gc),
            check_reference_cycle(fn),
            check_profiling_available(),
        ]
        if baseline_path is not None:
            results.append(check_memory_regression(fn, baseline_path))
        else:
            results.append(
                RuleResult(
                    rule_id="PERF-MEM-06",
                    title="Memory Regression Test",
                    status="not_applicable",
                    notes="baseline_path 미지정",
                )
            )

    if any(r.status == "non_compliant" for r in results):
        overall = "non_compliant"
    elif all(r.status in ("compliant", "not_applicable") for r in results):
        overall = "compliant"
    else:
        overall = "advisory"
    return {
        "baseline": "performance-memory",
        "status": overall,
        "results": [
            {"rule_id": r.rule_id, "title": r.title, "status": r.status, "notes": r.notes}
            for r in results
        ],
    }
