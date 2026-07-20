# standard-ai-workflow-kit: v0.15.19-beta

"""Graph insights helper (v0.11.1 R-A follow-up cycle 4).

R-A follow-up 의 *cycle 4* (v0.11.1):
- PURPOSE.md 의 4-element (Goals / Key Questions / Research Scope / Evolving Thesis)
  ↔ 실제 deliverable (state.json recent_done_items + acceptance test) 의 매핑 분석
- 3 정형화:
  - Goal coverage (covered / partial / uncovered)
  - Surprising 발견 (scope creep 감지, advisory)
  - Gaps 식별 (uncovered goal priority 1-3)
- Health score (0-100, 4 tier: excellent ≥80 / good ≥60 / fair ≥40 / poor <40)

이 모듈은 llm_wiki README §"Purpose.md — The Wiki's Soul" 의
*LLM can suggest updates based on usage patterns* 패턴을
standard_ai_workflow 의 PURPOSE ↔ deliverable 정합 자동 verify 로 정형화.

v0.9.4 builder._parse_purpose_summary + v0.11.0 cycle 3 purpose_ingest 와 정합:
- 동일 frontmatter / §1 Goals / §3 Research Scope 구조 가정
- recent_done_items 의 v0.9.4+ 형식 (version + commit hash + summary) parse
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# PURPOSE.md candidate locations (mirrors purpose_context / purpose_ingest).
def _candidate_purpose_paths(workspace_root: Path) -> list[Path]:
    return [
        workspace_root / "ai-workflow" / "memory" / "active" / "PURPOSE.md",
        workspace_root.parent / "ai-workflow" / "memory" / "active" / "PURPOSE.md",
        workspace_root / "PURPOSE.md",
    ]


def _candidate_state_paths(workspace_root: Path) -> list[Path]:
    return [
        workspace_root / "ai-workflow" / "memory" / "active" / "state.json",
        workspace_root / "state.json",
    ]


# PURPOSE.md §1 Goals pattern.
_GOAL_PATTERN = re.compile(r"^[-*]\s+\*\*(G\d+)\*\*\s*:\s*(.+)$", re.MULTILINE)
# recent_done_items entry pattern: "vX.Y.Z (commit): description"
_RECENT_DONE_PATTERN = re.compile(r"^v(\d+\.\d+(?:\.\d+)?)\s+\(([0-9a-f]{7,8})\)\s*:\s*(.+)$")


# ---------------------------------------------------------------------------
# Dataclass 6
# ---------------------------------------------------------------------------


@dataclass
class GoalKeyword:
    """PURPOSE.md §1 Goals 의 G1+ identifier + 본문 keyword."""

    gid: str  # "G1", "G2", ...
    text: str  # "G1: foo bar baz"
    keywords: list[str]  # [foo, bar, baz] (lowercase, stop word 제거)


@dataclass
class RecentDoneItem:
    """state.json recent_done_items 의 단일 entry."""

    version: str  # "v0.11.0"
    commit_hash: str  # "f71dde8"
    summary: str  # full entry string
    keywords: list[str]  # [two-step, cot, ingest, ...] (lowercase)


@dataclass
class GoalCoverageResult:
    """각 Goal 의 deliverable 매핑 coverage."""

    total_goals: int
    covered_count: int
    partial_count: int
    uncovered_count: int
    coverage_pct: float  # 0.0 - 100.0
    covered: list[str] = field(default_factory=list)  # ["G1", ...]
    partial: list[str] = field(default_factory=list)
    uncovered: list[str] = field(default_factory=list)


@dataclass
class SurprisingResult:
    """Goals 매핑 0 + scope_excluded 매칭 ❌ deliverable."""

    surprising: list[str]  # deliverable summary list
    is_scope_creep: list[bool]  # parallel to surprising
    scope_creep_warnings: list[str]


@dataclass
class GapResult:
    """Goals 중 deliverable 매핑 0 인 goal 식별."""

    gaps: list[str]  # ["G3", ...]
    priorities: list[int]  # parallel to gaps (1=highest)
    descriptions: list[str]  # parallel to gaps


@dataclass
class HealthScore:
    """종합 점수 + tier + breakdown."""

    score: int  # 0 - 100
    tier: str  # excellent / good / fair / poor
    breakdown: dict[str, int] = field(default_factory=dict)


@dataclass
class GraphInsightsResult:
    """unified entry 산출물."""

    goal_keywords: list[GoalKeyword]
    recent_items: list[RecentDoneItem]
    coverage: GoalCoverageResult | None  # 부재 시 None
    surprising: SurprisingResult | None
    gaps: GapResult | None
    health: HealthScore | None
    overall_warnings: list[str]


# ---------------------------------------------------------------------------
# stop words (영어 + 한국어 조사 일부) — keyword 추출 시 제거
# ---------------------------------------------------------------------------


_STOP_WORDS = frozenset([
    # english
    "the", "a", "an", "and", "or", "but", "is", "are", "was", "were",
    "in", "on", "at", "to", "for", "of", "with", "by", "from", "as",
    "this", "that", "these", "those", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "must", "can",
    # 한국어 일부 (조사)
    "이", "그", "저", "의", "를", "을", "에", "에서", "로", "으로", "와", "과",
    "은", "는", "이다", "있다", "하다",
])


def _tokenize(text: str) -> list[str]:
    """text 를 lowercase + stop word 제거 + 길이 2+ 만 token 화."""
    # 한글 / 영문 / 숫자 분리
    text = text.lower()
    # 한글 / 영문 / 숫자 token split (공백 + 특수문자)
    tokens = re.findall(r"[a-z0-9]+|[\uac00-\ud7af]+", text)
    return [t for t in tokens if len(t) >= 2 and t not in _STOP_WORDS]


# ---------------------------------------------------------------------------
# step 1: PURPOSE.md Goals keyword 추출
# ---------------------------------------------------------------------------


def extract_goal_keywords(purpose_path: Path | None) -> list[GoalKeyword]:
    """PURPOSE.md §1 Goals 의 G1+ identifier + 본문 keyword 추출.

    부재 / corrupted 모두 graceful skip → empty list.
    """
    if purpose_path is None or not purpose_path.exists():
        return []

    try:
        text = purpose_path.read_text(encoding="utf-8")
    except OSError:
        return []

    # §1 Goals section 추출 (간단히 G1+ pattern 직접 매칭)
    matches = _GOAL_PATTERN.findall(text)
    if not matches:
        return []

    result: list[GoalKeyword] = []
    for gid, body in matches:
        text_clean = body.strip()
        keywords = _tokenize(text_clean)
        result.append(GoalKeyword(gid=gid, text=f"{gid}: {text_clean}", keywords=keywords))
    return result


# ---------------------------------------------------------------------------
# step 2: state.json recent_done_items 파싱
# ---------------------------------------------------------------------------


def parse_recent_done_items(state_path: Path | None) -> list[RecentDoneItem]:
    """state.json 의 recent_done_items 30+ entries 파싱.

    부재 / json 파싱 실패 / corrupted 모두 graceful skip → empty list.
    """
    if state_path is None or not state_path.exists():
        return []

    try:
        data = json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []

    if not isinstance(data, dict):
        return []

    session = data.get("session", {})
    items = session.get("recent_done_items", [])
    if not isinstance(items, list):
        return []

    result: list[RecentDoneItem] = []
    for entry in items:
        if not isinstance(entry, str):
            continue
        m = _RECENT_DONE_PATTERN.match(entry.strip())
        if m:
            version, commit_hash, summary = m.group(1), m.group(2), m.group(3)
            full = f"v{version} ({commit_hash}): {summary}"
            keywords = _tokenize(summary)
            result.append(RecentDoneItem(
                version=f"v{version}",
                commit_hash=commit_hash,
                summary=full,
                keywords=keywords,
            ))
        else:
            # 형식 불일치 — keyword 추출만 시도
            keywords = _tokenize(entry)
            result.append(RecentDoneItem(
                version="unknown",
                commit_hash="",
                summary=entry,
                keywords=keywords,
            ))
    return result


# ---------------------------------------------------------------------------
# step 3: Goal coverage
# ---------------------------------------------------------------------------


def compute_goal_coverage(
    goal_keywords: list[GoalKeyword],
    recent_items: list[RecentDoneItem],
) -> GoalCoverageResult:
    """각 Goal ↔ recent_done_items 의 keyword 매칭률 (Jaccard similarity).

    - covered (≥1 keyword 매칭)
    - partial (1+ keyword 매칭이지만 overlap < 50%)
    - uncovered (0 keyword 매칭)
    """
    if not goal_keywords:
        return GoalCoverageResult(
            total_goals=0,
            covered_count=0,
            partial_count=0,
            uncovered_count=0,
            coverage_pct=0.0,
        )

    if not recent_items:
        # recent done 부재 시 전부 uncovered
        return GoalCoverageResult(
            total_goals=len(goal_keywords),
            covered_count=0,
            partial_count=0,
            uncovered_count=len(goal_keywords),
            coverage_pct=0.0,
            uncovered=[g.gid for g in goal_keywords],
        )

    # recent done 의 모든 keyword set
    recent_kw_set: set[str] = set()
    for item in recent_items:
        recent_kw_set.update(item.keywords)

    covered: list[str] = []
    partial: list[str] = []
    uncovered: list[str] = []
    for g in goal_keywords:
        g_set = set(g.keywords)
        if not g_set:
            uncovered.append(g.gid)
            continue
        overlap = g_set & recent_kw_set
        if not overlap:
            uncovered.append(g.gid)
        else:
            ratio = len(overlap) / len(g_set)
            if ratio >= 0.5:
                covered.append(g.gid)
            else:
                partial.append(g.gid)

    total = len(goal_keywords)
    covered_count = len(covered)
    partial_count = len(partial)
    uncovered_count = len(uncovered)
    coverage_pct = round(100.0 * covered_count / total, 2) if total > 0 else 0.0

    return GoalCoverageResult(
        total_goals=total,
        covered_count=covered_count,
        partial_count=partial_count,
        uncovered_count=uncovered_count,
        coverage_pct=coverage_pct,
        covered=covered,
        partial=partial,
        uncovered=uncovered,
    )


# ---------------------------------------------------------------------------
# step 4: Surprising 발견 (scope creep 감지)
# ---------------------------------------------------------------------------


def find_surprising_deliverables(
    goal_keywords: list[GoalKeyword],
    recent_items: list[RecentDoneItem],
    scope_excluded: list[str],
) -> SurprisingResult:
    """Goals 매핑 0 + scope_excluded 매칭 ❌ deliverable.

    - Goals 매핑 0: deliverable 의 keywords 가 goal_keywords 어느 것의 set 과도 매칭 안 함
    - scope_excluded 매칭 ❌: deliverable keywords 가 scope_excluded 항목과도 매칭 안 함
    - → surprising 으로 분류 (scope creep 가능성, advisory)
    """
    goal_kw_sets = [set(g.keywords) for g in goal_keywords]
    excluded_kw_set: set[str] = set()
    for scope_item in scope_excluded:
        excluded_kw_set.update(_tokenize(scope_item))

    surprising: list[str] = []
    is_scope_creep: list[bool] = []
    scope_creep_warnings: list[str] = []

    for item in recent_items:
        item_kw_set = set(item.keywords)
        # Goals 매핑 검사
        matches_any_goal = any(item_kw_set & g_set for g_set in goal_kw_sets)
        if matches_any_goal:
            continue
        # scope_excluded 매칭 검사
        matches_excluded = bool(item_kw_set & excluded_kw_set)

        surprising.append(item.summary)
        if not matches_excluded:
            is_scope_creep.append(True)
            scope_creep_warnings.append(
                f"scope creep 의심: '{item.summary[:80]}...' — Goals 매칭 0 + scope_excluded 매칭 ❌"
            )
        else:
            is_scope_creep.append(False)

    return SurprisingResult(
        surprising=surprising,
        is_scope_creep=is_scope_creep,
        scope_creep_warnings=scope_creep_warnings,
    )


# ---------------------------------------------------------------------------
# step 5: Gaps 식별
# ---------------------------------------------------------------------------


def find_gaps(
    goal_keywords: list[GoalKeyword],
    recent_items: list[RecentDoneItem],
) -> GapResult:
    """Goals 중 recent_done 매핑 0 인 goal 식별.

    priority 결정:
    - 1: §1 Goals 의 첫 번째 goal (highest)
    - 2: 두 번째 goal
    - 3+: 이후 goal
    """
    if not goal_keywords:
        return GapResult(gaps=[], priorities=[], descriptions=[])

    coverage = compute_goal_coverage(goal_keywords, recent_items)
    gaps = coverage.uncovered
    priorities: list[int] = []
    descriptions: list[str] = []
    for i, gid in enumerate(gaps):
        priorities.append(i + 1)  # 1 = highest
        # 매칭되는 goal text
        g_text = next((g.text for g in goal_keywords if g.gid == gid), gid)
        descriptions.append(g_text)

    return GapResult(gaps=gaps, priorities=priorities, descriptions=descriptions)


# ---------------------------------------------------------------------------
# step 6: Health score
# ---------------------------------------------------------------------------


def compute_health_score(
    coverage: GoalCoverageResult | None,
    surprising: SurprisingResult | None,
    gaps: GapResult | None,
) -> HealthScore:
    """종합 점수: 100 - uncovered*15 - scope_creep*10 + min(surprising*5, 25)."""
    if coverage is None:
        return HealthScore(score=0, tier="poor", breakdown={"missing_coverage": 100})

    base = 100
    uncovered = coverage.uncovered_count
    scope_creep = sum(1 for s in surprising.is_scope_creep if s) if surprising else 0
    surprising_bonus = min(len(surprising.surprising) * 5, 25) if surprising else 0

    score = base - (uncovered * 15) - (scope_creep * 10) + surprising_bonus
    score = max(0, min(100, score))

    if score >= 80:
        tier = "excellent"
    elif score >= 60:
        tier = "good"
    elif score >= 40:
        tier = "fair"
    else:
        tier = "poor"

    breakdown = {
        "base": base,
        "uncovered_penalty": uncovered * 15,
        "scope_creep_penalty": scope_creep * 10,
        "surprising_bonus": surprising_bonus,
    }

    return HealthScore(score=score, tier=tier, breakdown=breakdown)


# ---------------------------------------------------------------------------
# unified entry
# ---------------------------------------------------------------------------


def run_graph_insights(
    purpose_path: Path | None = None,
    workspace_root: Path | None = None,
    state_path: Path | None = None,
    auto_find: bool = True,
    include_surprising: bool = True,
    include_gaps: bool = True,
) -> GraphInsightsResult:
    """unified entry: 5 stage 호출 → GraphInsightsResult.

    Args:
        purpose_path: PURPOSE.md 명시 path.
        workspace_root: workspace root (default: cwd).
        state_path: state.json 명시 path.
        auto_find: purpose_path/state_path 부재 시 자동 탐색.
        include_surprising: surprising analysis 포함 여부.
        include_gaps: gaps analysis 포함 여부.

    Returns:
        GraphInsightsResult
    """
    if workspace_root is None:
        workspace_root = Path.cwd()

    if auto_find:
        if purpose_path is None:
            for candidate in _candidate_purpose_paths(workspace_root):
                if candidate.exists():
                    purpose_path = candidate
                    break
        if state_path is None:
            for candidate in _candidate_state_paths(workspace_root):
                if candidate.exists():
                    state_path = candidate
                    break

    overall_warnings: list[str] = []

    # step 1: Goals keyword
    goals = extract_goal_keywords(purpose_path)
    if not goals:
        overall_warnings.append("PURPOSE.md 부재 / §1 Goals 부재 — coverage/surprising/gaps 분석 limited")

    # step 2: recent done
    items = parse_recent_done_items(state_path)
    if not items:
        overall_warnings.append("state.json 부재 / recent_done_items 부재 — coverage/surprising/gaps 분석 limited")

    # step 3: coverage
    coverage = compute_goal_coverage(goals, items) if goals and items else None

    # step 4: surprising (scope_excluded 는 goals 에서 추출 — cycle 3 의 structured 의 scope_excluded)
    scope_excluded: list[str] = []
    if purpose_path and purpose_path.exists():
        # cycle 3 의 structured 와 동일하게 §3 Research Scope 에서 제외 영역 추출
        try:
            text = purpose_path.read_text(encoding="utf-8")
            # 간단히 ## 3. section 의 ### 제외 sub-section 의 - 항목 추출
            scope_match = re.search(r"##\s*3\..*?(?=##\s*\d+\.|$)", text, re.DOTALL)
            if scope_match:
                scope_text = scope_match.group(0)
                excl_match = re.search(r"###\s*제외\s*(.+?)(?=###|##|\Z)", scope_text, re.DOTALL)
                if excl_match:
                    for line in excl_match.group(1).splitlines():
                        line = line.strip()
                        if line.startswith("- "):
                            scope_excluded.append(line[2:].strip())
        except OSError:
            pass

    surprising: SurprisingResult | None = None
    if include_surprising and goals and items:
        surprising = find_surprising_deliverables(goals, items, scope_excluded)

    # step 5: gaps
    gaps: GapResult | None = None
    if include_gaps and goals:
        gaps = find_gaps(goals, items)

    # step 6: health score
    health = compute_health_score(coverage, surprising, gaps)

    return GraphInsightsResult(
        goal_keywords=goals,
        recent_items=items,
        coverage=coverage,
        surprising=surprising,
        gaps=gaps,
        health=health,
        overall_warnings=overall_warnings,
    )


__all__ = [
    "GoalKeyword",
    "RecentDoneItem",
    "GoalCoverageResult",
    "SurprisingResult",
    "GapResult",
    "HealthScore",
    "GraphInsightsResult",
    "extract_goal_keywords",
    "parse_recent_done_items",
    "compute_goal_coverage",
    "find_surprising_deliverables",
    "find_gaps",
    "compute_health_score",
    "run_graph_insights",
]
