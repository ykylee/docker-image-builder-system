# standard-ai-workflow-kit: v1.0.0-beta

"""Purpose context load helper for skill integration (v0.9.5 chapter 9 R-A part 2).

R-A follow-up 의 *part 2* (v0.9.5):
- session-start / backlog-update / doc-sync skill 의 *context load* 시
  `state.json.purpose_digest` 1-line + PURPOSE.md 본문 (≤200 token) 자동 read
- backlog-update 의 *in-scope check* 시 Research Scope 와 비교하여
  *scope creep 경고*

이 모듈은 llm_wiki README §"Purpose.md — The Wiki's Soul" 의 "LLM reads it
during every ingest and query for context" 패턴을 standard_ai_workflow 의
session-start / backlog-update / doc-sync skill 에 정형화한 helper.

v0.9.4 chapter 8 의 `_parse_purpose_summary` (state.json 생성용) 와 정합:
- 동일 PURPOSE.md 4-element 구조 가정
- frontmatter last_purpose_review / §1 Goals / §3 Research Scope 동일하게 parse
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any
from workflow_kit.common.paths import memory_active_dir

# Approximate 200 tokens — Korean 2-3 chars/token, English 4 chars/token.
# 800 chars is a safe upper bound for mixed content.
PURPOSE_BODY_DEFAULT_MAX_CHARS = 800

# PURPOSE.md candidate locations (mirrors builder.py purpose_candidates convention).
def _candidate_purpose_paths(workspace_root: Path) -> list[Path]:
    return [
        memory_active_dir(workspace_root) / "PURPOSE.md",
        memory_active_dir(workspace_root.parent) / "PURPOSE.md",
        workspace_root / "PURPOSE.md",
    ]


def find_purpose_path(workspace_root: Path) -> Path | None:
    """PURPOSE.md 후보 경로들 중 첫 번째로 존재하는 path 반환. 부재 시 None."""
    for candidate in _candidate_purpose_paths(workspace_root):
        if candidate.exists():
            return candidate
    return None


def _read_state_digest_and_rev(state_path: Path) -> tuple[str | None, str | None]:
    """state.json 의 purpose_digest + purpose_digest_rev 동시 read. 부재 시 (None, None).

    state.json 부재 / json 파싱 실패 / field 부재 / 빈 string 모두 graceful skip.
    """
    if not state_path.exists():
        return None, None
    try:
        data = json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None, None
    if not isinstance(data, dict):
        return None, None
    digest = data.get("purpose_digest")
    rev = data.get("purpose_digest_rev")
    digest = digest if isinstance(digest, str) and digest.strip() else None
    rev = rev if isinstance(rev, str) and rev.strip() else None
    return digest, rev


def _strip_frontmatter(text: str) -> str:
    """PURPOSE.md frontmatter 제거. frontmatter 는 file 시작 가정 (v0.9.4 helper 와 정합).

    frontmatter 부재 시 원본 text 그대로 반환.
    """
    fm_match = re.match(r"^---\n.+?\n---\n*", text, re.S)
    if fm_match:
        return text[fm_match.end():]
    return text


def read_purpose_body_excerpt(
    purpose_path: Path | None,
    max_chars: int = PURPOSE_BODY_DEFAULT_MAX_CHARS,
) -> dict[str, Any]:
    """PURPOSE.md 본문 (frontmatter 제외) ≤ max_chars read.

    Returns:
        {"body_excerpt": str | None, "truncated": bool, "char_count": int}
        purpose_path 부재 시 {"body_excerpt": None, "truncated": False, "char_count": 0}
    """
    if purpose_path is None or not purpose_path.exists():
        return {"body_excerpt": None, "truncated": False, "char_count": 0}
    try:
        text = purpose_path.read_text(encoding="utf-8")
    except OSError:
        return {"body_excerpt": None, "truncated": False, "char_count": 0}
    body = _strip_frontmatter(text).strip()
    if not body:
        return {"body_excerpt": None, "truncated": False, "char_count": 0}
    truncated = len(body) > max_chars
    excerpt = body[:max_chars] if truncated else body
    return {"body_excerpt": excerpt, "truncated": truncated, "char_count": len(excerpt)}


def _parse_scope_list(text: str) -> list[str]:
    """`- **key**: desc` / `- key` 형식의 list item 들을 key 부분만 추출."""
    items: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped.startswith("- "):
            continue
        content = stripped[2:].strip()
        if not content:
            continue
        # `- **G1**: 표준 ...` 형식이면 **G1** key 만 추출
        # `- **LLM model fine-tuning / training pipeline**` 형식이면 전체
        bold_match = re.match(r"^\*\*(.+?)\*\*\s*:?\s*(.*)$", content)
        if bold_match:
            key = bold_match.group(1).strip()
            items.append(key)
        else:
            items.append(content)
    return items


def extract_research_scope(purpose_path: Path | None) -> dict[str, Any]:
    """PURPOSE.md §3 Research Scope 의 포함/제외 영역 parse.

    Returns:
        {"included": list[str], "excluded": list[str], "warnings": list[str]}
        purpose_path 부재 시 {"included": [], "excluded": [], "warnings": ["PURPOSE.md 부재 — scope check skipped"]}
    """
    empty: dict[str, Any] = {"included": [], "excluded": [], "warnings": []}
    if purpose_path is None or not purpose_path.exists():
        return {**empty, "warnings": ["PURPOSE.md 부재 — scope check skipped"]}
    try:
        text = purpose_path.read_text(encoding="utf-8")
    except OSError:
        return {**empty, "warnings": ["PURPOSE.md read 실패 — scope check skipped"]}

    warnings: list[str] = []
    # §3 Research Scope 섹션 (다음 ## 4. 또는 파일 끝까지)
    scope_section = re.search(r"^## 3\. Research Scope\s*\n(.+?)(?=^## 4\.|\Z)", text, re.M | re.S)
    if not scope_section:
        warnings.append("PURPOSE.md §3 Research Scope 섹션 부재")
        return {**empty, "warnings": warnings}

    section_text = scope_section.group(1)

    included: list[str] = []
    inc_match = re.search(r"### 포함 영역\s*\n(.+?)(?=### 제외 영역|\Z)", section_text, re.S)
    if inc_match:
        included = _parse_scope_list(inc_match.group(1))

    excluded: list[str] = []
    exc_match = re.search(r"### 제외 영역\s*\n(.+?)(?=\Z)", section_text, re.S)
    if exc_match:
        excluded = _parse_scope_list(exc_match.group(1))

    if not included and not excluded:
        warnings.append("PURPOSE.md §3 Research Scope 의 포함/제외 영역이 모두 비어있다")

    return {"included": included, "excluded": excluded, "warnings": warnings}


def _normalize_for_match(text: str) -> str:
    """scope 매칭용 정규화: markdown markers 제거 + lowercase + whitespace 압축."""
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"\s+", " ", text)
    return text.lower().strip()


def check_scope_creep(
    task_brief: str,
    affected_documents: list[str],
    scope: dict[str, list[str]],
) -> list[str]:
    """PURPOSE.md §3 Research Scope 의 *제외 영역* 과 task_brief / affected_documents 비교.

    Returns: list[str] — scope creep 의심 warning 목록. 비어있으면 no creep.

    Note: 포함 영역 매칭은 soft heuristic (대부분의 task 가 부분 매칭) 이라 *advisory only*.
          본 helper 는 *제외 영역* 매칭만 hard warning 으로 emit.
    """
    excluded = scope.get("excluded", [])
    if not excluded:
        return []

    warnings: list[str] = []
    brief_norm = _normalize_for_match(task_brief)
    docs_norm = " ".join(_normalize_for_match(d) for d in affected_documents)

    for area in excluded:
        area_norm = _normalize_for_match(area)
        if not area_norm:
            continue
        # 1) area 전체가 brief/docs_norm 에 substring 으로 등장
        if area_norm in brief_norm or area_norm in docs_norm:
            warnings.append(
                f"scope creep 의심: PURPOSE.md §3 제외 영역 '{area}' 와 매칭"
            )
            continue
        # 2) area 의 첫 2 단어 (한국어는 4자, 영어는 1단어) 가 brief/docs_norm 에 등장
        #    — 너무 짧은 substring 은 false positive 가 많으므로 첫 2 token 만 시도
        tokens = area_norm.split()
        if len(tokens) >= 2:
            key_phrase = " ".join(tokens[:2])
            if len(key_phrase) >= 4 and (key_phrase in brief_norm or key_phrase in docs_norm):
                warnings.append(
                    f"scope creep 의심: PURPOSE.md §3 제외 영역 '{area}' 키워드 '{key_phrase}' 매칭"
                )

    return warnings


def build_purpose_context(
    workspace_root: Path,
    state_path: Path | None = None,
    purpose_path: Path | None = None,
    body_max_chars: int = PURPOSE_BODY_DEFAULT_MAX_CHARS,
) -> dict[str, Any]:
    """skill context load 시 사용하는 unified purpose context builder.

    Args:
        workspace_root: PROJECT_PROFILE.md 가 있는 디렉토리 (PURPOSE.md 후보 탐색용)
        state_path: state.json 절대 path (purpose_digest + purpose_digest_rev read)
        purpose_path: 명시적 PURPOSE.md path (없으면 workspace_root 기준 auto-detect)
        body_max_chars: PURPOSE.md body excerpt max chars (default 800 ≈ 200 token)

    Returns:
        {
          "purpose_digest": str | None,  # state.json.purpose_digest
          "purpose_digest_rev": str | None,  # state.json.purpose_digest_rev (YYYY-MM-DD)
          "purpose_path": str | None,
          "body_excerpt": str | None,  # ≤ body_max_chars
          "body_excerpt_truncated": bool,
          "body_excerpt_char_count": int,
          "scope_included": list[str],  # PURPOSE.md §3 포함
          "scope_excluded": list[str],  # PURPOSE.md §3 제외
          "scope_warnings": list[str],  # parse 시 warning
        }
    """
    if purpose_path is None:
        purpose_path = find_purpose_path(workspace_root)

    digest, rev = (None, None)
    if state_path is not None:
        digest, rev = _read_state_digest_and_rev(state_path)

    body_info = read_purpose_body_excerpt(purpose_path, max_chars=body_max_chars)
    scope = extract_research_scope(purpose_path)

    return {
        "purpose_digest": digest,
        "purpose_digest_rev": rev,
        "purpose_path": str(purpose_path) if purpose_path else None,
        "body_excerpt": body_info["body_excerpt"],
        "body_excerpt_truncated": body_info["truncated"],
        "body_excerpt_char_count": body_info["char_count"],
        "scope_included": scope["included"],
        "scope_excluded": scope["excluded"],
        "scope_warnings": scope["warnings"],
    }
