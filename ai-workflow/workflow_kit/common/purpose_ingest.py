# standard-ai-workflow-kit: v0.11.21-beta

"""Two-step CoT ingest helper for PURPOSE.md (v0.11.0 R-A follow-up cycle 3).

R-A follow-up 의 *cycle 3* (v0.11.0):
- LLM 의 *directional intent* vs *structural rules* 일관성 강화를 위한
  2-step Chain-of-Thought ingest.
- step 1: raw PURPOSE.md 추출 (frontmatter + §1~§4 본문, LLM ingest 가능 형태)
- step 2: structured 4-element emit (Goals G1+ / Key Questions Q1+ /
  Research Scope 포함·제외 / Evolving Thesis) + cross-reference validate
  (wiki concepts ↔ `[[mention]]`)

이 모듈은 llm_wiki README §"Purpose.md — The Wiki's Soul" 의 CoT 패턴을
standard_ai_workflow 의 skill context load + state.json 갱신 흐름에 정형화.

v0.9.4 builder._parse_purpose_summary (state.json purpose_digest 생성용) 와 정합:
- 동일 frontmatter (`purpose_version`, `last_purpose_review`) 가정
- 동일 §1 Goals G1+ 형식 가정

v0.9.5 purpose_context.build_purpose_context 와 정합:
- find_purpose_path 동일 candidate locations 재사용
- 800 chars body excerpt max 와 다른 목적이므로 별도 상수 (800 → 800 동일)
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# PURPOSE.md candidate locations (mirrors purpose_context.find_purpose_path).
def _candidate_purpose_paths(workspace_root: Path) -> list[Path]:
    return [
        workspace_root / "ai-workflow" / "memory" / "active" / "PURPOSE.md",
        workspace_root.parent / "ai-workflow" / "memory" / "active" / "PURPOSE.md",
        workspace_root / "PURPOSE.md",
    ]


def find_purpose_path(workspace_root: Path) -> Path | None:
    """PURPOSE.md 후보 경로들 중 첫 번째로 존재하는 path 반환. 부재 시 None."""
    for candidate in _candidate_purpose_paths(workspace_root):
        if candidate.exists():
            return candidate
    return None


# Wiki concepts directory (cross-reference validate 용).
def _wiki_concepts_dir(workspace_root: Path) -> Path:
    """wiki concepts 디렉토리 path. 부재 시에도 path 반환 (호출자가 exists verify)."""
    return workspace_root / "ai-workflow" / "wiki" / "concepts"

_GOAL_PATTERN = re.compile(r"^[-*]\s+\*\*(G\d+)\*\*\s*:\s*(.+)$", re.MULTILINE)
_QUESTION_PATTERN = re.compile(r"^[-*]\s+\*\*(Q\d+)\*\*\s*:\s*(.+)$", re.MULTILINE)
_WIKILINK_PATTERN = re.compile(r"\[\[([^\]\n|]+)(?:\|[^\]\n]*)?\]\]")
_SECTION_PATTERN = re.compile(r"^## (\d+)\.\s+(\S.+)$", re.MULTILINE)
_FRONTMATTER_PATTERN = re.compile(r"^---\n(.+?)\n---\n*", re.DOTALL)

# ---------------------------------------------------------------------------
# Dataclass 5
# ---------------------------------------------------------------------------


@dataclass
class RawPurposeExtract:
    """step 1 산출물 — raw PURPOSE.md 추출 (LLM ingest 가능 형태)."""

    purpose_path: Path | None
    missing: bool
    purpose_version: int | None = None
    last_purpose_review: str | None = None
    section_1_goals_raw: str = ""
    section_2_questions_raw: str = ""
    section_3_scope_raw: str = ""
    section_4_thesis_raw: str = ""
    body_full: str = ""
    warnings: list[str] = field(default_factory=list)


@dataclass
class StructuredPurpose:
    """step 2 산출물 — 정형화된 4-element PURPOSE."""

    purpose_path: Path | None
    purpose_version: int | None
    last_purpose_review: str | None
    goals: list[str]
    questions: list[str]
    scope_included: list[str]
    scope_excluded: list[str]
    thesis: str


class StructuredPurposeValidationError(ValueError):
    """PURPOSE.md 4-element 중 하나가 비어 있을 때 raise.

    v0.11.0 cycle 3 정합: 4-element non-empty 가 acceptance criterion.
    """


@dataclass
class CoTTrace:
    """CoT 2-step trace — step1 raw + step2 summary."""

    step1_raw_excerpt: str  # ≤ 800 char (CoT trace 의 step1 본문)
    step1_truncated: bool
    step1_char_count: int
    step2_structured_summary: str  # Goals G1 first + Questions count + Scope included count


@dataclass
class CrossRefValidationResult:
    """PURPOSE.md 본문 의 `[[mention]]` ↔ wiki concepts 매칭 결과."""

    matched: list[str]
    missing_refs: list[str]
    warnings: list[str]


@dataclass
class TwoStepCoTIngestResult:
    """unified entry 산출물 — 모든 stage 의 합산."""

    raw: RawPurposeExtract
    structured: StructuredPurpose | None  # missing 시 None
    cot_trace: CoTTrace
    cross_ref: CrossRefValidationResult
    overall_warnings: list[str]


# ---------------------------------------------------------------------------
# step 1: raw extract
# ---------------------------------------------------------------------------


def _strip_frontmatter(text: str) -> str:
    """PURPOSE.md frontmatter 제거. frontmatter 부재 시 원본 text 반환."""
    fm_match = _FRONTMATTER_PATTERN.match(text)
    if fm_match:
        return text[fm_match.end():]
    return text


def _parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    """frontmatter key/value 분리. 부재 시 ({}, text)."""
    fm_match = _FRONTMATTER_PATTERN.match(text)
    if not fm_match:
        return {}, text
    fm_body = fm_match.group(1)
    body = text[fm_match.end():]
    pairs: dict[str, str] = {}
    for line in fm_body.splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            pairs[k.strip()] = v.strip()
    return pairs, body


def _extract_sections(body: str) -> dict[int, str]:
    """## N. <title> 형식 section 들을 {N: 본문} 으로 반환."""
    matches = list(_SECTION_PATTERN.finditer(body))
    sections: dict[int, str] = {}
    for i, m in enumerate(matches):
        num = int(m.group(1))
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        sections[num] = body[start:end].strip()
    return sections


def extract_raw_purpose(purpose_path: Path | None) -> RawPurposeExtract:
    """step 1: raw PURPOSE.md 추출.

    PURPOSE.md 부재 / corrupted frontmatter 모두 graceful skip:
    - missing=True + purpose_path 그대로 보존 + warnings 로 사유 기록.
    """
    if purpose_path is None or not purpose_path.exists():
        return RawPurposeExtract(
            purpose_path=purpose_path,
            missing=True,
            warnings=["PURPOSE.md 부재 — raw extract skipped"],
        )

    try:
        text = purpose_path.read_text(encoding="utf-8")
    except OSError as e:
        return RawPurposeExtract(
            purpose_path=purpose_path,
            missing=True,
            warnings=[f"PURPOSE.md read 실패 ({type(e).__name__}): {e}"],
        )

    fm, body = _parse_frontmatter(text)
    version_s = fm.get("purpose_version", "")
    try:
        version = int(version_s) if version_s else None
    except ValueError:
        version = None
    rev = fm.get("last_purpose_review") or None

    sections = _extract_sections(body)
    warnings: list[str] = []
    if version is None:
        warnings.append("frontmatter purpose_version 부재 또는 invalid")
    if not rev:
        warnings.append("frontmatter last_purpose_review 부재")
    for n in (1, 2, 3, 4):
        if n not in sections:
            warnings.append(f"§{n} section 부재")

    return RawPurposeExtract(
        purpose_path=purpose_path,
        missing=False,
        purpose_version=version,
        last_purpose_review=rev,
        section_1_goals_raw=sections.get(1, ""),
        section_2_questions_raw=sections.get(2, ""),
        section_3_scope_raw=sections.get(3, ""),
        section_4_thesis_raw=sections.get(4, ""),
        body_full=body.strip(),
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# step 2: structured build
# ---------------------------------------------------------------------------


def _parse_goal_lines(raw: str) -> list[str]:
    """§1 Goals 본문 에서 `- **G1**: ...` 형식 line 들을 추출.

    Returns: ["G1: ...", "G2: ...", ...] 형식의 정규화 list.
    부재 시 empty list.
    """
    matches = _GOAL_PATTERN.findall(raw)
    return [f"{gid}: {text.strip()}" for gid, text in matches]


def _parse_question_lines(raw: str) -> list[str]:
    """§2 Key Questions 본문 에서 `- **Q1**: ...` 형식 line 들을 추출."""
    matches = _QUESTION_PATTERN.findall(raw)
    return [f"{qid}: {text.strip()}" for qid, text in matches]


def _parse_scope_lines(raw: str) -> tuple[list[str], list[str]]:
    """§3 Research Scope 의 포함/제외 영역 split.

    Returns: (included, excluded)
    """
    included: list[str] = []
    excluded: list[str] = []
    cur: str | None = None
    for line in raw.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("### 포함"):
            cur = "incl"
            continue
        if s.startswith("### 제외"):
            cur = "excl"
            continue
        if s.startswith("### "):
            cur = None  # 알 수 없는 sub-section
            continue
        if cur == "incl" and (s.startswith("- ") or s.startswith("* ")):
            included.append(s[2:].strip())
        elif cur == "excl" and (s.startswith("- ") or s.startswith("* ")):
            excluded.append(s[2:].strip())
    return included, excluded


def build_structured_purpose(raw: RawPurposeExtract) -> StructuredPurpose:
    """step 2: structured 4-element emit.

    Raises:
        StructuredPurposeValidationError: 4-element 중 하나가 비어 있을 때.
        acceptance criterion #3 정합 (empty goal 시 validation error).
    """
    if raw.missing:
        raise StructuredPurposeValidationError(
            "raw.missing=True — build_structured_purpose 호출 불가"
        )

    goals = _parse_goal_lines(raw.section_1_goals_raw)
    questions = _parse_question_lines(raw.section_2_questions_raw)
    included, excluded = _parse_scope_lines(raw.section_3_scope_raw)
    thesis = raw.section_4_thesis_raw.strip()

    if not goals:
        raise StructuredPurposeValidationError(
            "§1 Goals 가 비어있음 — ≥1 G1+ 필요"
        )

    return StructuredPurpose(
        purpose_path=raw.purpose_path,
        purpose_version=raw.purpose_version,
        last_purpose_review=raw.last_purpose_review,
        goals=goals,
        questions=questions,
        scope_included=included,
        scope_excluded=excluded,
        thesis=thesis,
    )


# ---------------------------------------------------------------------------
# CoT trace
# ---------------------------------------------------------------------------


COT_STEP1_MAX_CHARS = 800


def emit_cot_trace(raw: RawPurposeExtract, structured: StructuredPurpose | None) -> CoTTrace:
    """CoT 2-step trace emit.

    step1: raw 본문 ≤800 char excerpt
    step2: structured 4-element 요약 (Goals G1 + Questions count + Scope included count)
    """
    body = raw.body_full
    truncated = len(body) > COT_STEP1_MAX_CHARS
    excerpt = body[:COT_STEP1_MAX_CHARS] if truncated else body

    if structured is None:
        summary = "(structured unavailable — PURPOSE.md 부재 / validation 실패)"
    else:
        g1 = structured.goals[0] if structured.goals else "(no goals)"
        q_count = len(structured.questions)
        s_count = len(structured.scope_included)
        summary = (
            f"G1={g1[:60]}{'...' if len(g1) > 60 else ''}; "
            f"questions={q_count}; scope_included={s_count}"
        )

    return CoTTrace(
        step1_raw_excerpt=excerpt,
        step1_truncated=truncated,
        step1_char_count=len(excerpt),
        step2_structured_summary=summary,
    )


# ---------------------------------------------------------------------------
# cross-reference validate
# ---------------------------------------------------------------------------


def cross_reference_validate(
    structured: StructuredPurpose | None,
    workspace_root: Path,
) -> CrossRefValidationResult:
    """PURPOSE.md 본문 의 `[[mention]]` ↔ wiki concepts filename 매칭.

    wiki concepts 디렉토리 부재 시: matched=[], missing_refs=[], advisory warning.
    """
    if structured is None:
        return CrossRefValidationResult(
            matched=[],
            missing_refs=[],
            warnings=["structured unavailable — cross-reference skipped"],
        )

    concepts_dir = _wiki_concepts_dir(workspace_root)
    if not concepts_dir.exists():
        return CrossRefValidationResult(
            matched=[],
            missing_refs=[],
            warnings=[f"wiki concepts 디렉토리 부재 ({concepts_dir}) — cross-reference skipped"],
        )

    # 개념 stem 집합 (확장자 제외).
    stems = {p.stem for p in concepts_dir.glob("*.md") if p.is_file()}

    # 본문에서 `[[mention]]` 추출 (thesis + scope 본문 + goals/questions 본문).
    haystack_parts = [
        structured.thesis,
        " ".join(structured.scope_included),
        " ".join(structured.scope_excluded),
        " ".join(structured.goals),
        " ".join(structured.questions),
    ]
    haystack = "\n".join(haystack_parts)
    mentions = set(_WIKILINK_PATTERN.findall(haystack))

    # mention 의 stem 정규화 (kebab-case 변환 없이 raw 비교 — wiki 운영 정합).
    matched: list[str] = []
    missing: list[str] = []
    for mention in sorted(mentions):
        # `[[foo|bar]]` 형태는 첫 capture group 에 `foo` 만 들어옴 (regex 처리됨).
        # stem 비교: mention 그대로 vs 파일 stem 비교.
        if mention in stems:
            matched.append(mention)
        else:
            missing.append(mention)

    warnings: list[str] = []
    if missing:
        warnings.append(f"{len(missing)} unmatched `[[mention]]` in PURPOSE.md 본문")

    return CrossRefValidationResult(
        matched=matched,
        missing_refs=missing,
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# unified entry
# ---------------------------------------------------------------------------


def run_two_step_cot_ingest(
    purpose_path: Path | None = None,
    workspace_root: Path | None = None,
    auto_find_purpose: bool = True,
) -> TwoStepCoTIngestResult:
    """unified entry: 4 stage 호출 → TwoStepCoTIngestResult.

    Args:
        purpose_path: PURPOSE.md 명시 path. None + auto_find_purpose=True 면
            workspace_root 기준 자동 탐색.
        workspace_root: workspace root path (default: cwd).
        auto_find_purpose: purpose_path 가 None 일 때 자동 탐색 여부.

    Returns:
        TwoStepCoTIngestResult (raw + structured + cot_trace + cross_ref 합산)
    """
    if workspace_root is None:
        workspace_root = Path.cwd()

    if purpose_path is None and auto_find_purpose:
        purpose_path = find_purpose_path(workspace_root)

    # step 1: raw extract
    raw = extract_raw_purpose(purpose_path)

    # step 2: structured build (raw missing 시 None)
    structured: StructuredPurpose | None = None
    structured_error: str | None = None
    if not raw.missing:
        try:
            structured = build_structured_purpose(raw)
        except StructuredPurposeValidationError as e:
            structured_error = str(e)

    # CoT trace
    cot_trace = emit_cot_trace(raw, structured)

    # cross-reference
    cross_ref = cross_reference_validate(structured, workspace_root)

    overall_warnings: list[str] = list(raw.warnings)
    if structured_error:
        overall_warnings.append(f"structured build 실패: {structured_error}")
    overall_warnings.extend(cross_ref.warnings)

    return TwoStepCoTIngestResult(
        raw=raw,
        structured=structured,
        cot_trace=cot_trace,
        cross_ref=cross_ref,
        overall_warnings=overall_warnings,
    )


__all__ = [
    "RawPurposeExtract",
    "StructuredPurpose",
    "StructuredPurposeValidationError",
    "CoTTrace",
    "CrossRefValidationResult",
    "TwoStepCoTIngestResult",
    "find_purpose_path",
    "extract_raw_purpose",
    "build_structured_purpose",
    "emit_cot_trace",
    "cross_reference_validate",
    "run_two_step_cot_ingest",
    "COT_STEP1_MAX_CHARS",
]
