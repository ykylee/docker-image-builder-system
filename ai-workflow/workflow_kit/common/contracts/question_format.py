# standard-ai-workflow-kit: v0.11.21-beta

"""Question File Format (v0.6.4) — parser, validator, ambiguity/contradiction detection.

AIDLC common/question-format-guide.md 패턴 차용. 우리 v0.6.4 의 Question File Format
명세를 code 로 enforce. 자세한 spec: workflow-source/core/question_file_format.md.

핵심 기능:
- parse_answers(file_path): question file 의 [Answer]: tag 읽어 dict 반환
- validate_answers(answers, options): missing/invalid/ambiguous 검증
- detect_ambiguity(answers): "mix of" / "depends on" / "not sure" 등 모호 패턴 감지
- detect_contradiction(answers, metadata): cross-question 모순 자동 점검
- generate_clarification_file(errors, output_path): follow-up question file 자동 emit

stage gate 와 결합: 모든 검증 통과 시에만 다음 stage 진행 가능. 실패 시
clarification file 생성 + audit log append.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


# Constants
ANSWER_TAG_RE = re.compile(r"^\[Answer\]:\s*(?P<letter>[A-Z]?)(?P<rest>.*)$", re.IGNORECASE)
OPTION_RE = re.compile(r"^([A-Z])\)\s+(.+)$", re.MULTILINE)
QUESTION_HEADER_RE = re.compile(r"^##\s+Question\s+(?P<num>\d+)\s*$", re.MULTILINE)

# Ambiguity keyword patterns. 추가 시 list 에 extend.
AMBIGUITY_KEYWORDS: tuple[str, ...] = (
    "mix of",
    "between a and b",
    "somewhere between",
    "depends on",
    "it depends",
    "상황에 따라",
    "not sure",
    "i don't know",
    "잘 모르겠",
    "모르겠",
    "tbd",
    "to be decided",
    "미정",
)

# Standard "Other" label. question file 이 이 옵션을 마지막에 가져야 함.
OTHER_OPTION_LETTER = "X"
OTHER_OPTION_PATTERN = re.compile(
    rf"^{OTHER_OPTION_LETTER}\)\s+.*other.*please describe",
    re.IGNORECASE | re.MULTILINE,
)


@dataclass(frozen=True)
class AnswerEntry:
    """단일 question 의 응답."""
    question_num: int
    raw_letter: str
    raw_text: str  # letter 뒤의 추가 텍스트 (있으면)


@dataclass
class ValidationError:
    """question format 검증 에러."""
    question_num: int
    error_type: str  # "missing" | "invalid" | "ambiguous" | "contradiction"
    message: str
    suggestion: str = ""


@dataclass
class Ambiguity:
    """모호 응답 감지 결과."""
    question_num: int
    matched_keyword: str
    raw_text: str


@dataclass
class Contradiction:
    """cross-question 모순 감지 결과."""
    question_a: int
    question_b: int
    description: str
    raw_a: str
    raw_b: str


@dataclass
class ValidationResult:
    """전체 검증 결과."""
    is_valid: bool
    answers: dict[int, AnswerEntry] = field(default_factory=dict)
    errors: list[ValidationError] = field(default_factory=list)
    ambiguities: list[Ambiguity] = field(default_factory=list)
    contradictions: list[Contradiction] = field(default_factory=list)

    def all_issues(self) -> list[ValidationError | Ambiguity | Contradiction]:
        return [*self.errors, *self.ambiguities, *self.contradictions]


def parse_answers(file_path: Path | str) -> dict[int, AnswerEntry]:
    """question file 의 모든 [Answer]: tag 를 파싱.

    Args:
        file_path: question file 경로 (예: "phase-questions.md")

    Returns:
        {question_num: AnswerEntry} dict. 비어있는 tag 는 포함 안 함.

    Raises:
        FileNotFoundError: file_path 가 존재하지 않을 때.
    """
    p = Path(file_path)
    if not p.exists():
        raise FileNotFoundError(f"question file not found: {file_path}")

    text = p.read_text(encoding="utf-8")
    answers: dict[int, AnswerEntry] = {}

    # Split by question header to find current question_num context
    lines = text.splitlines()
    current_q: int | None = None
    for line in lines:
        m_header = QUESTION_HEADER_RE.match(line)
        if m_header:
            current_q = int(m_header.group("num"))
            continue
        if current_q is None:
            continue
        m_answer = ANSWER_TAG_RE.search(line)
        # letter 가 비어있으면 (예: '[Answer]:' 만) → missing 으로 skip
        if m_answer and m_answer.group("letter"):
            answers[current_q] = AnswerEntry(
                question_num=current_q,
                raw_letter=m_answer.group("letter").upper(),
                raw_text=m_answer.group("rest").strip(),
            )
    return answers


def validate_answers(
    answers: dict[int, AnswerEntry],
    options: dict[int, list[str]],
) -> list[ValidationError]:
    """응답 검증: missing / invalid letter / "Other" mandatory.

    Args:
        answers: parse_answers() 결과
        options: {question_num: valid letters} dict. 예: {1: ["A","B","C","D","X"]}

    Returns:
        ValidationError list. 비어있으면 모두 유효.
    """
    errors: list[ValidationError] = []
    for q_num, valid_letters in options.items():
        if q_num not in answers:
            errors.append(ValidationError(
                question_num=q_num,
                error_type="missing",
                message=f"Question {q_num}: [Answer]: tag is empty",
                suggestion=f"Provide answer letter (e.g., [Answer]: A) or X for Other",
            ))
            continue
        entry = answers[q_num]
        if entry.raw_letter not in valid_letters:
            errors.append(ValidationError(
                question_num=q_num,
                error_type="invalid",
                message=f"Question {q_num}: letter '{entry.raw_letter}' not in valid options {valid_letters}",
                suggestion=f"Use one of {valid_letters} or X for Other",
            ))
        # "Other" mandatory check
        if OTHER_OPTION_LETTER not in valid_letters:
            errors.append(ValidationError(
                question_num=q_num,
                error_type="invalid",
                message=f"Question {q_num}: 'Other' (X) option is mandatory per spec",
                suggestion=f"Add 'X) Other (please describe after [Answer]: tag below)' as the last option",
            ))
    return errors


def detect_ambiguity(answers: dict[int, AnswerEntry]) -> list[Ambiguity]:
    """모호 응답 패턴 감지 ('mix of', 'depends on', 'not sure' 등).

    Args:
        answers: parse_answers() 결과

    Returns:
        Ambiguity list. 비어있으면 명확한 응답.
    """
    results: list[Ambiguity] = []
    for q_num, entry in answers.items():
        # Letter 만 있으면 모호 아님 (예: "[Answer]: A")
        # Letter + 추가 텍스트 (예: "[Answer]: A — but also maybe B") 또는
        # 추가 텍스트에 모호 keyword 포함 시 모호 마킹
        text_to_check = f"{entry.raw_letter} {entry.raw_text}".lower()
        for keyword in AMBIGUITY_KEYWORDS:
            if keyword in text_to_check:
                results.append(Ambiguity(
                    question_num=q_num,
                    matched_keyword=keyword,
                    raw_text=entry.raw_text or entry.raw_letter,
                ))
                break
    return results


def detect_contradiction(
    answers: dict[int, AnswerEntry],
    rules: list[dict[str, Any]],
) -> list[Contradiction]:
    """cross-question 모순 자동 점검.

    Args:
        answers: parse_answers() 결과
        rules: contradiction rule list. 각 rule:
            {
                "qa": int, "qb": int,
                "qa_letter": str, "qb_letter": str,
                "description": str,  # 모순 설명
            }
            예: {"qa": 1, "qb": 2, "qa_letter": "A", "qb_letter": "B",
                 "description": "single component + entire codebase 모순"}

    Returns:
        Contradiction list. 비어있으면 모순 없음.
    """
    results: list[Contradiction] = []
    for rule in rules:
        a = answers.get(rule["qa"])
        b = answers.get(rule["qb"])
        if a is None or b is None:
            continue
        if a.raw_letter == rule["qa_letter"] and b.raw_letter == rule["qb_letter"]:
            results.append(Contradiction(
                question_a=rule["qa"],
                question_b=rule["qb"],
                description=rule["description"],
                raw_a=f"{a.raw_letter} {a.raw_text}".strip(),
                raw_b=f"{b.raw_letter} {b.raw_text}".strip(),
            ))
    return results


def generate_clarification_file(
    errors: list[ValidationError],
    ambiguities: list[Ambiguity],
    contradictions: list[Contradiction],
    output_path: Path | str,
) -> None:
    """follow-up question file 자동 emit.

    Args:
        errors, ambiguities, contradictions: validate_answers/detect_ambiguity/detect_contradiction 결과
        output_path: 생성할 clarification file 경로. 보통 {원본}-clarification-questions.md
    """
    p = Path(output_path)
    lines: list[str] = [
        f"# {p.stem.replace('-clarification-questions', '')} Clarification Questions",
        "",
        "본 문서는 다음 이슈로 인해 자동 생성된 follow-up 질문입니다.",
        "",
    ]

    if errors:
        lines.append("## 발견된 검증 에러")
        lines.append("")
        for err in errors:
            lines.append(f"- **Question {err.question_num}** ({err.error_type}): {err.message}")
            if err.suggestion:
                lines.append(f"  - 제안: {err.suggestion}")
        lines.append("")

    if ambiguities:
        lines.append("## 발견된 모호 응답")
        lines.append("")
        for amb in ambiguities:
            lines.append(f"- **Question {amb.question_num}**: '{amb.matched_keyword}' 패턴 감지 (raw: '{amb.raw_text}')")
            # 표준 follow-up
            follow_up = _ambiguity_follow_up(amb.matched_keyword)
            lines.append(f"  - Follow-up: {follow_up}")
        lines.append("")

    if contradictions:
        lines.append("## 발견된 Cross-Question 모순")
        lines.append("")
        for con in contradictions:
            lines.append(f"- **Question {con.question_a} ↔ Question {con.question_b}**: {con.description}")
            lines.append(f"  - A 답변: {con.raw_a}")
            lines.append(f"  - B 답변: {con.raw_b}")
            lines.append("  - 어느 답이 정확한가요? (a) Q{0} 유지, (b) Q{1} 유지, (c) 둘 다 수정".format(
                con.question_a, con.question_b
            ))
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("위 이슈가 모두 해결될 때까지 stage gate 는 정지됩니다.")
    lines.append("각 follow-up 의 답을 본 문서 또는 원본 question file 의 `[Answer]:` tag 에 추가해주세요.")
    lines.append("")

    p.write_text("\n".join(lines), encoding="utf-8")


def _ambiguity_follow_up(keyword: str) -> str:
    """모호 keyword 별 표준 follow-up 질문."""
    mapping: dict[str, str] = {
        "mix of": "A 와 B 의 결정 기준은 무엇인가요? 어떤 조건에서 A 를 쓰고 어떤 조건에서 B 를 쓰나요?",
        "between a and b": "정확한 중간 지점은 어디인가요? (A 몇 % + B 몇 % 같은 식)",
        "depends on": "complexity level 을 어떻게 정의하시나요? (LOC, components, dependencies 중 어떤 지표?)",
        "it depends": "depends on 과 동일 — 위 follow-up 참고",
        "not sure": "결정에 필요한 추가 정보는 무엇인가요?",
        "tbd": "결정 가능한 시점은 언제인가요? 그때까지 stage gate 를 정지할까요?",
    }
    return mapping.get(
        keyword,
        "위 응답이 모호합니다. 더 구체적으로 답변해주세요.",
    )


def full_validation(
    file_path: Path | str,
    options: dict[int, list[str]],
    contradiction_rules: list[dict[str, Any]] | None = None,
) -> ValidationResult:
    """Convenience: parse + validate + detect ambiguity + detect contradiction.

    Args:
        file_path: question file 경로
        options: {question_num: valid letters}
        contradiction_rules: detect_contradiction 의 rules 파라미터. None 이면 contradiction check skip.

    Returns:
        ValidationResult with all fields populated.
    """
    answers = parse_answers(file_path)
    errors = validate_answers(answers, options)
    ambiguities = detect_ambiguity(answers)
    contradictions: list[Contradiction] = []
    if contradiction_rules:
        contradictions = detect_contradiction(answers, contradiction_rules)

    is_valid = (
        len(errors) == 0
        and len(ambiguities) == 0
        and len(contradictions) == 0
    )

    return ValidationResult(
        is_valid=is_valid,
        answers=answers,
        errors=errors,
        ambiguities=ambiguities,
        contradictions=contradictions,
    )
