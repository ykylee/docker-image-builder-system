# standard-ai-workflow-kit: v0.11.21-beta

"""workflow_kit.common.testing — v0.7.3 PBT-WF-01~06 runtime evaluator.

AIDLC 차용 property-based-testing 의 6 rule runtime 검증:
1. PBT-WF-01: Property ID 명명 (test_prop_<name>)
2. PBT-WF-02: Round-trip property (encode/decode, serialize/deserialize)
3. PBT-WF-03: Invariant property (sort/normalize 의 보존)
4. PBT-WF-04: Idempotency property (f(f(x)) == f(x))
5. PBT-WF-05: Generator (예: hypothesis; N/A → minimal generator)
6. PBT-WF-06: Shrink (실패 시 counterexample 축소)

Reference:
- workflow-source/extensions/testing/property-based/property-based-testing.md
- AIDLC extensions/testing/property-based/property-based-testing.md (lines 1-284)
"""

from __future__ import annotations

import ast
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

Status = str  # "compliant" | "non_compliant" | "not_applicable" | "advisory"


@dataclass
class RuleResult:
    """단일 rule 의 평가 결과 (auth.py 와 동일 형식)."""

    rule_id: str
    title: str
    status: Status
    notes: str = ""


# --- 6 Rule evaluators ---


def check_property_id_naming(test_files: list[Path]) -> RuleResult:
    """PBT-WF-01: property-based test 는 `test_prop_<name>` 명명."""
    if not test_files:
        return RuleResult(
            rule_id="PBT-WF-01",
            title="Property ID 명명",
            status="not_applicable",
            notes="test_file 0개",
        )

    bad_names = []
    good_names = []
    for path in test_files:
        try:
            tree = ast.parse(path.read_text(encoding="utf-8", errors="ignore"))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name.startswith("test_"):
                # pytest @pytest.mark.parametrize 의 input 조합도 test_ 시작
                is_prop = node.name.startswith("test_prop_")
                # Hypothesis @given decorator 사용 시 property test
                has_given = any(
                    (isinstance(d, ast.Attribute) and d.attr == "given")
                    for d in node.decorator_list
                )
                if has_given and not is_prop:
                    bad_names.append(f"{path.name}::{node.name} (hypothesis but no test_prop_ prefix)")
                elif is_prop:
                    good_names.append(f"{path.name}::{node.name}")

    if bad_names and not good_names:
        return RuleResult(
            rule_id="PBT-WF-01",
            title="Property ID 명명",
            status="non_compliant",
            notes=f"property test 명명 불일치: {bad_names[:3]}",
        )
    if bad_names:
        return RuleResult(
            rule_id="PBT-WF-01",
            title="Property ID 명명",
            status="advisory",
            notes=f"good={len(good_names)}, bad={len(bad_names)}",
        )
    return RuleResult(
        rule_id="PBT-WF-01",
        title="Property ID 명명",
        status="compliant",
        notes=f"property test {len(good_names)}개 모두 test_prop_ prefix 준수",
    )


def check_round_trip_property(test_files: list[Path]) -> RuleResult:
    """PBT-WF-02: round-trip property (encode/decode, JSON dump/load, pickle)."""
    patterns = [
        r"def\s+test_prop_.*round_trip",
        r"def\s+test_prop_.*encode_decode",
        r"def\s+test_prop_.*serialize",
    ]
    regexes = [re.compile(p) for p in patterns]
    found = 0
    for path in test_files:
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except (OSError, UnicodeDecodeError):
            continue
        for rgx in regexes:
            if rgx.search(content):
                found += 1
                break
    if found == 0:
        return RuleResult(
            rule_id="PBT-WF-02",
            title="Round-trip Property",
            status="advisory",
            notes="test_prop_*_round_trip 0개 (encode/decode, JSON 검증 권장)",
        )
    return RuleResult(
        rule_id="PBT-WF-02",
        title="Round-trip Property",
        status="compliant",
        notes=f"round-trip test {found}개",
    )


def check_invariant_property(test_files: list[Path]) -> RuleResult:
    """PBT-WF-03: invariant property (e.g. sort 후 길이 보존, normalize 후 동치성)."""
    patterns = [
        r"def\s+test_prop_.*invariant",
        r"def\s+test_prop_.*normalize",
        r"assert\s+len\(.*\)\s*==\s*len\(.*\)",  # length-preserving op
    ]
    regexes = [re.compile(p) for p in patterns]
    found = 0
    for path in test_files:
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except (OSError, UnicodeDecodeError):
            continue
        for rgx in regexes:
            if rgx.search(content):
                found += 1
                break
    if found == 0:
        return RuleResult(
            rule_id="PBT-WF-03",
            title="Invariant Property",
            status="advisory",
            notes="invariant test 0개 (e.g. sort 후 길이 보존, normalize 후 동치성)",
        )
    return RuleResult(
        rule_id="PBT-WF-03",
        title="Invariant Property",
        status="compliant",
        notes=f"invariant test {found}개",
    )


def check_idempotency_property(test_files: list[Path]) -> RuleResult:
    """PBT-WF-04: idempotency property (f(f(x)) == f(x))."""
    patterns = [
        r"def\s+test_prop_.*idempotent",
        r"def\s+test_prop_.*twice",
        r"\.normalize\(.*\)\.normalize\(",
    ]
    regexes = [re.compile(p) for p in patterns]
    found = 0
    for path in test_files:
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except (OSError, UnicodeDecodeError):
            continue
        for rgx in regexes:
            if rgx.search(content):
                found += 1
                break
    if found == 0:
        return RuleResult(
            rule_id="PBT-WF-04",
            title="Idempotency Property",
            status="advisory",
            notes="idempotency test 0개 (f(f(x)) == f(x) 검증 권장)",
        )
    return RuleResult(
        rule_id="PBT-WF-04",
        title="Idempotency Property",
        status="compliant",
        notes=f"idempotency test {found}개",
    )


def check_generator_present(test_files: list[Path]) -> RuleResult:
    """PBT-WF-05: generator 사용 (hypothesis / quickcheck / 가짜 random).

    hypothesis 가 없으면 *minimal generator* (결정적 list of boundary values) 권장.
    v0.7.4+: optional `hypothesis` package (PBT framework). 미설치 시 fallback.
    """
    has_hypothesis = False
    has_minimal = False
    for path in test_files:
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except (OSError, UnicodeDecodeError):
            continue
        if re.search(r"from\s+hypothesis\s+import|import\s+hypothesis", content):
            has_hypothesis = True
        if re.search(r"@given\b", content):
            has_hypothesis = True
        # minimal generator: 결정적 list + boundary (e.g. [0, 1, -1, MAX, MIN, ""])
        if re.search(r"def\s+gen_\w+\(", content) or re.search(r"\[0,\s*1,\s*-1,\s*MAX", content):
            has_minimal = True

    # v0.7.4: hypothesis package 가용성 확인 (optional dependency)
    hypothesis_installed = False
    try:
        # hypothesis 는 optional dependency — mypy 의 import-not-found ignore
        import hypothesis  # type: ignore[import-not-found]  # noqa: F401
        hypothesis_installed = True
    except ImportError:
        pass

    if not has_hypothesis and not has_minimal:
        hint = "hypothesis / minimal generator 0개 (boundary value set 권장)"
        if not hypothesis_installed:
            hint += " | optional: pip install hypothesis"
        return RuleResult(
            rule_id="PBT-WF-05",
            title="Property Test Generator",
            status="advisory",
            notes=hint,
        )
    if has_hypothesis and not hypothesis_installed:
        return RuleResult(
            rule_id="PBT-WF-05",
            title="Property Test Generator",
            status="advisory",
            notes="@given 사용되지만 hypothesis package 미설치 — pip install hypothesis",
        )
    kind = "hypothesis" if has_hypothesis else "minimal"
    return RuleResult(
        rule_id="PBT-WF-05",
        title="Property Test Generator",
        status="compliant",
        notes=f"generator type: {kind}",
    )


def check_shrink_or_minimal_repro(test_files: list[Path]) -> RuleResult:
    """PBT-WF-06: 실패 시 counterexample 축소 (hypothesis 자동) 또는 minimal repro 명시."""
    if not test_files:
        return RuleResult(
            rule_id="PBT-WF-06",
            title="Shrink / Minimal Repro",
            status="not_applicable",
        )
    has_shrink = False
    has_minimal_repro = False
    for path in test_files:
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except (OSError, UnicodeDecodeError):
            continue
        # hypothesis 의 automatic shrink
        if re.search(r"@given\b", content):
            has_shrink = True
        # minimal repro: failing input 을 small set 으로 축소
        if re.search(r"def\s+test_prop_.*minimal|@example\(", content):
            has_minimal_repro = True
    if not has_shrink and not has_minimal_repro:
        return RuleResult(
            rule_id="PBT-WF-06",
            title="Shrink / Minimal Repro",
            status="advisory",
            notes="shrink / @example 0개 — failure 시 minimal repro 남기는 정책 필요",
        )
    kind = "hypothesis-shrink" if has_shrink else "manual @example"
    return RuleResult(
        rule_id="PBT-WF-06",
        title="Shrink / Minimal Repro",
        status="compliant",
        notes=f"strategy: {kind}",
    )


# --- Public API ---


def collect_test_files(project_root: Path) -> list[Path]:
    """workflow-source/tests/ 와 workflow_kit/*/test_*.py 수집."""
    candidates: list[Path] = []
    tests_dir = project_root / "tests"
    if tests_dir.is_dir():
        candidates.extend(sorted(tests_dir.rglob("test_*.py")))
    wk_dir = project_root / "workflow_kit"
    if wk_dir.is_dir():
        candidates.extend(sorted(wk_dir.rglob("test_*.py")))
    return candidates


def evaluate_compliance(project_root: Path) -> dict[str, Any]:
    """6 PBT-WF rule 의 compliance 평가."""
    test_files = collect_test_files(project_root)
    results = [
        check_property_id_naming(test_files),
        check_round_trip_property(test_files),
        check_invariant_property(test_files),
        check_idempotency_property(test_files),
        check_generator_present(test_files),
        check_shrink_or_minimal_repro(test_files),
    ]
    if any(r.status == "non_compliant" for r in results):
        overall = "non_compliant"
    elif all(r.status in ("compliant", "not_applicable") for r in results):
        overall = "compliant"
    else:
        overall = "advisory"
    return {
        "baseline": "testing-property-based",
        "status": overall,
        "results": [
            {"rule_id": r.rule_id, "title": r.title, "status": r.status, "notes": r.notes}
            for r in results
        ],
    }
