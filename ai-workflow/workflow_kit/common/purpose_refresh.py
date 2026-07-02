# standard-ai-workflow-kit: v0.11.21-beta

"""Purpose refresh (R-A follow-up part 3, v0.9.6 chapter 10).

R-A follow-up 3 release 분할 의 마지막 part:
- v0.9.4 (part 1) — `state.json.purpose_digest` 1-line 자동 생성
- v0.9.5 (part 2) — skill context load integration (session-start / backlog-update / doc-sync)
- v0.9.6 (part 3, 본 module) — wiki-event-sync R-A trigger

R-A (Purpose Refresh) trigger:
- 30일 안 wiki log 의 ingest/query 분포 분석 → LLM suggest prompt 생성 (advisory)
- PURPOSE.md frontmatter 의 `last_purpose_review` date 갱신 (apply 시)
- LLM suggest 는 *advisory* (자동 commit ❌, human confirm 필수)

이 module 은 llm_wiki README §"Purpose.md — The Wiki's Soul" 의 R-A cycle 을
standard_ai_workflow 의 release pipeline 에 정형화한 helper.

Module invariants:
- read-only by default — `apply=False` 면 PURPOSE.md / log.md 부작용 0
- graceful skip — log.md / PURPOSE.md 부재 시 advisory warning + no-op
- dry-run first — `--apply` 없이도 prompt + distribution preview 가능
"""
from __future__ import annotations

import datetime as _dt
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

from .purpose_context import (
    PURPOSE_BODY_DEFAULT_MAX_CHARS,
    find_purpose_path,
    read_purpose_body_excerpt,
)

# 30일 window — R-A spec §4.4 default
DEFAULT_WINDOW_DAYS = 30

# Top N topics to extract from 30일 분포 (for LLM suggest prompt)
DEFAULT_TOP_TOPICS = 10

# Wiki log event header format: "## [YYYY-MM-DD] <event_type> | <summary>"
# 또는 "## [YYYY-MM-DD] <event_type> <summary>" (no pipe)
_LOG_EVENT_RE = re.compile(
    r"^## \[(\d{4}-\d{2}-\d{2})\]\s+(\S+)\s*\|?\s*(.*)$"
)

# English stop words (영문 keyword 추출 시 제외)
_STOP_WORDS_EN = frozenset({
    "the", "a", "an", "and", "to", "of", "in", "is", "it", "for", "on",
    "with", "as", "this", "that", "from", "or", "by", "be", "are", "was",
    "were", "at", "not", "have", "has", "had", "but", "if", "or", "an",
    "we", "you", "they", "i", "no", "yes", "do", "does", "did", "can",
    "could", "should", "would", "will", "shall", "may", "might", "must",
    "v0", "v1", "v2", "v3", "v4", "v5",  # version prefix (별도 처리)
})

# Ingest-like event types (30일 ingest 분포 집계 대상)
INGEST_LIKE_EVENT_TYPES = frozenset({
    "ingest", "lint-fix", "backfill", "promote", "v0.0.0",  # v0.0.0 = release-style header
})

# Query-like event types (30일 query 분포 집계 대상)
QUERY_LIKE_EVENT_TYPES = frozenset({
    "query", "file-back",
})

# Release event types (recent_releases 추출 대상)
RELEASE_EVENT_TYPES = frozenset({
    "release",
})


def _today_iso(today: _dt.date | None = None) -> str:
    """오늘 날짜 ISO string. 테스트 시 `today` 주입 가능."""
    return (today or _dt.date.today()).isoformat()


def parse_log_events(wiki_log_path: Path | None) -> list[dict[str, str]]:
    """wiki log.md 의 `## [YYYY-MM-DD] <event> | <summary>` 헤더 라인들 parse.

    Returns:
        list of {"date": "YYYY-MM-DD", "event_type": "ingest", "summary": "..."}
        wiki_log_path 부재 / read 실패 시 [].
    """
    if wiki_log_path is None or not wiki_log_path.exists():
        return []
    try:
        text = wiki_log_path.read_text(encoding="utf-8")
    except OSError:
        return []
    events: list[dict[str, str]] = []
    for line in text.splitlines():
        m = _LOG_EVENT_RE.match(line.strip())
        if m:
            events.append({
                "date": m.group(1),
                "event_type": m.group(2),
                "summary": m.group(3).strip(),
            })
    return events


def _extract_topics_from_summaries(
    summaries: list[str], top_n: int = DEFAULT_TOP_TOPICS
) -> list[tuple[str, int]]:
    """summary string list 에서 noun-phrase / keyword 추출 → top N (topic, count) tuples.

    Heuristic:
    - 영문 단어 (3자 이상) 추출 → lowercase → stop word 제외
    - 한국어는 bigram (2-어절) 추출 → 길이 ≥4 만 채택
    - 빈도 카운트 후 상위 N 반환
    """
    counter: Counter[str] = Counter()
    for summary in summaries:
        # 영문 단어 추출 (3자 이상, alphanumeric + hyphen)
        for w in re.findall(r"[a-zA-Z][a-zA-Z0-9-]{2,}", summary):
            wl = w.lower()
            if wl not in _STOP_WORDS_EN:
                counter[wl] += 1
        # 한국어 bigram (whitespace-separated tokens)
        ko_tokens = re.findall(r"[가-힣]+", summary)
        for i in range(len(ko_tokens) - 1):
            bigram = f"{ko_tokens[i]} {ko_tokens[i+1]}"
            if len(bigram) >= 4:
                counter[bigram] += 1
    return counter.most_common(top_n)


def analyze_30day_distribution(
    wiki_log_path: Path | None,
    today: _dt.date | None = None,
    window_days: int = DEFAULT_WINDOW_DAYS,
) -> dict[str, Any]:
    """30일 window 안의 ingest/query/release 분포 분석.

    Args:
        wiki_log_path: log.md 절대 path (None / 부재 시 graceful skip)
        today: 분석 기준일 (default: 오늘)
        window_days: 분석 window (default: 30일)

    Returns:
        {
            "window_days": int,
            "from_date": "YYYY-MM-DD",
            "to_date": "YYYY-MM-DD",
            "total_events": int,
            "events_by_type": dict[str, int],
            "ingest_count": int,
            "query_count": int,
            "release_count": int,
            "top_ingest_topics": list[tuple[str, int]],
            "top_query_topics": list[tuple[str, int]],
            "recent_releases": list[tuple[version, date]],
            "warnings": list[str],
        }
    """
    today = today or _dt.date.today()
    from_date = today - _dt.timedelta(days=window_days)

    empty: dict[str, Any] = {
        "window_days": window_days,
        "from_date": from_date.isoformat(),
        "to_date": today.isoformat(),
        "total_events": 0,
        "events_by_type": {},
        "ingest_count": 0,
        "query_count": 0,
        "release_count": 0,
        "top_ingest_topics": [],
        "top_query_topics": [],
        "recent_releases": [],
        "warnings": [],
    }

    if wiki_log_path is None or not wiki_log_path.exists():
        empty["warnings"].append("log.md 부재 — 30일 분포 분석 skipped")
        return empty

    events = parse_log_events(wiki_log_path)

    # 30일 window filter
    in_window: list[dict[str, str]] = []
    for ev in events:
        try:
            ev_date = _dt.date.fromisoformat(ev["date"])
        except ValueError:
            continue
        if from_date <= ev_date <= today:
            in_window.append(ev)

    if not in_window:
        empty["warnings"].append("30일 window 안 event 0건")
        return empty

    events_by_type: Counter[str] = Counter()
    ingest_summaries: list[str] = []
    query_summaries: list[str] = []
    recent_releases: list[tuple[str, str]] = []

    for ev in in_window:
        etype = ev["event_type"]
        events_by_type[etype] += 1
        if etype in INGEST_LIKE_EVENT_TYPES:
            ingest_summaries.append(ev["summary"])
        elif etype in QUERY_LIKE_EVENT_TYPES:
            query_summaries.append(ev["summary"])
        if etype in RELEASE_EVENT_TYPES:
            # summary 에서 version tag 추출 (e.g. "v0.9.5", "v0.10.0")
            version_m = re.search(r"v?(\d+\.\d+(?:\.\d+)?)", ev["summary"])
            if version_m:
                recent_releases.append((version_m.group(0), ev["date"]))

    return {
        "window_days": window_days,
        "from_date": from_date.isoformat(),
        "to_date": today.isoformat(),
        "total_events": len(in_window),
        "events_by_type": dict(events_by_type),
        "ingest_count": sum(
            events_by_type.get(t, 0) for t in INGEST_LIKE_EVENT_TYPES
        ),
        "query_count": sum(
            events_by_type.get(t, 0) for t in QUERY_LIKE_EVENT_TYPES
        ),
        "release_count": sum(
            events_by_type.get(t, 0) for t in RELEASE_EVENT_TYPES
        ),
        "top_ingest_topics": _extract_topics_from_summaries(ingest_summaries),
        "top_query_topics": _extract_topics_from_summaries(query_summaries),
        "recent_releases": recent_releases[-10:],  # last 10
        "warnings": [],
    }


def _read_last_purpose_review(purpose_path: Path | None) -> str | None:
    """PURPOSE.md frontmatter 의 `last_purpose_review` field read. 부재 시 None."""
    if purpose_path is None or not purpose_path.exists():
        return None
    try:
        text = purpose_path.read_text(encoding="utf-8")
    except OSError:
        return None
    fm_match = re.match(r"^---\n(.+?)\n---", text, re.S)
    if not fm_match:
        return None
    fm_text = fm_match.group(1)
    m = re.search(r"^last_purpose_review:\s*(\S+)", fm_text, re.M)
    return m.group(1) if m else None


def update_last_purpose_review(
    purpose_path: Path | None,
    today: _dt.date | None = None,
) -> dict[str, Any]:
    """PURPOSE.md frontmatter 의 `last_purpose_review` date 갱신.

    Returns:
        {
            "updated": bool,           # True if write actually happened
            "previous": str | None,    # 이전 date (YYYY-MM-DD) — 부재 시 None
            "current": str,            # 새 date (YYYY-MM-DD)
            "purpose_path": str | None,
            "warnings": list[str],     # 적용 불가 시 advisory
        }
    """
    today = today or _dt.date.today()
    today_iso = _today_iso(today)

    empty: dict[str, Any] = {
        "updated": False,
        "previous": None,
        "current": today_iso,
        "purpose_path": str(purpose_path) if purpose_path else None,
        "warnings": [],
    }
    if purpose_path is None or not purpose_path.exists():
        empty["warnings"].append("PURPOSE.md 부재 — last_purpose_review 갱신 skipped")
        return empty

    text = purpose_path.read_text(encoding="utf-8")
    fm_match = re.match(r"^---\n(.+?)\n---", text, re.S)
    if not fm_match:
        empty["warnings"].append("PURPOSE.md frontmatter 부재 — last_purpose_review 갱신 skipped")
        return empty

    fm_text = fm_match.group(1)
    body_text = text[fm_match.end():]

    m = re.search(r"^last_purpose_review:\s*\S+", fm_text, re.M)
    if m:
        previous = m.group(0).split(":", 1)[1].strip()
        new_fm_text = re.sub(
            r"^last_purpose_review:\s*\S+",
            f"last_purpose_review: {today_iso}",
            fm_text,
            count=1,
            flags=re.M,
        )
    else:
        previous = None
        new_fm_text = fm_text.rstrip() + f"\nlast_purpose_review: {today_iso}"

    # fm_text 는 regex group 1 (마지막 \n 포함 안 됨) → 명시적 newline 부착
    new_text = f"---\n{new_fm_text}\n---{body_text}"
    purpose_path.write_text(new_text, encoding="utf-8")

    return {
        "updated": True,
        "previous": previous,
        "current": today_iso,
        "purpose_path": str(purpose_path),
        "warnings": [],
    }


def generate_llm_suggest_prompt(
    distribution: dict[str, Any],
    purpose_path: Path | None,
    body_max_chars: int = PURPOSE_BODY_DEFAULT_MAX_CHARS,
) -> str:
    """30일 분포 + PURPOSE.md 본문 기반 LLM suggest prompt 생성 (advisory).

    Returns:
        markdown 형식의 prompt string. LLM 이 이 prompt 를 받아
        PURPOSE.md 의 Goals / Key Questions / Research Scope / Evolving Thesis
        보강 제안을 반환하도록 유도.

    Note: prompt 의 output 은 *advisory* 일 뿐, 자동 commit ❌.
          human review 후 `--apply` 로 명시적 갱신.
    """
    body_info = read_purpose_body_excerpt(purpose_path, max_chars=body_max_chars)

    parts: list[str] = []
    parts.append("# R-A Purpose Refresh — LLM Suggest Prompt (advisory)\n\n")
    parts.append(
        "> ⚠️ 이 prompt 의 output 은 *advisory* 일 뿐, 자동 적용 ❌.\n"
        "> 사람이 review 후 `--apply` 로 명시적 commit 필요.\n\n"
    )

    parts.append("## §1. 30일 ingest/query/release 분포 (wiki log.md)\n\n")
    parts.append(
        f"- Window: `{distribution['from_date']}` ~ `{distribution['to_date']}` "
        f"({distribution['window_days']}일)\n"
        f"- Total events: **{distribution['total_events']}**\n"
        f"- Events by type: `{json.dumps(distribution['events_by_type'], ensure_ascii=False)}`\n"
        f"- Ingest-like: **{distribution['ingest_count']}**건 "
        f"(ingest / lint-fix / backfill / promote)\n"
        f"- Query-like: **{distribution['query_count']}**건 (query / file-back)\n"
        f"- Release: **{distribution['release_count']}**건\n"
    )

    if distribution.get("recent_releases"):
        parts.append("\n### §1.1 Recent releases (last 10)\n\n")
        for ver, date in distribution["recent_releases"]:
            parts.append(f"- `{date}`: **{ver}**\n")

    if distribution.get("top_ingest_topics"):
        parts.append("\n### §1.2 Top ingest topics (top 10)\n\n")
        for topic, count in distribution["top_ingest_topics"]:
            parts.append(f"- `{topic}` × {count}\n")

    if distribution.get("top_query_topics"):
        parts.append("\n### §1.3 Top query topics (top 10)\n\n")
        for topic, count in distribution["top_query_topics"]:
            parts.append(f"- `{topic}` × {count}\n")

    if distribution.get("warnings"):
        parts.append("\n### §1.4 Warnings\n\n")
        for w in distribution["warnings"]:
            parts.append(f"- ⚠️ {w}\n")

    parts.append("\n## §2. PURPOSE.md 현재 본문 (≤800 char, frontmatter 제외)\n\n")
    if body_info["body_excerpt"]:
        parts.append("```\n")
        parts.append(body_info["body_excerpt"])
        if body_info["truncated"]:
            parts.append(
                f"\n[... truncated, total {body_info['char_count']} chars shown "
                f"of {body_info['char_count']}+ ...]"
            )
        parts.append("\n```\n")
    else:
        parts.append("*(PURPOSE.md 부재 — 본문 reference 불가)*\n")

    parts.append(
        "\n## §3. LLM Suggest 요청 (advisory, human confirm 필수)\n\n"
        "위 30일 분포 + PURPOSE.md 본문을 기반으로, **4-element** 별로 보강 제안:\n\n"
        "1. **Goals** (§1): 누락된 `G#` 추가 후보 (1-2개). "
        "top ingest/query topics 중 *새로운 directional intent* 시사 항목\n"
        "2. **Key Questions** (§2): 새로운 `Q#` 후보 (1-2개). "
        "top query topics 중 *반복 질문 패턴*\n"
        "3. **Research Scope** (§3): 포함/제외 영역 조정 제안 (있으면). "
        "30일 분포에서 *out-of-scope* 시사 시 제외 영역 후보\n"
        "4. **Evolving Thesis** (§4): working hypothesis 수정 제안 (있으면). "
        "30일 trend 에서 *방향 전환* 시사\n\n"
        "**Format**: 각 제안에 대해\n"
        "- 추가/수정 항목 텍스트 (한국어 prose, 1-2 줄)\n"
        "- 근거 (top topic 통계 / release 이벤트 / cross-reference)\n"
        "- confidence (high / medium / low)\n\n"
        "**중요 제약**:\n"
        "- 4-element 구조 (§1 Goals / §2 Key Questions / §3 Research Scope / §4 Evolving Thesis) 유지\n"
        "- 기존 G1~G4 / Q1~Q4 의 *의미* 를 훼손하지 않는 선에서 추가\n"
        "- 자동 commit ❌ — 사람 review 필수\n"
    )

    return "".join(parts)


def run_purpose_refresh(
    workspace_root: Path,
    today: _dt.date | None = None,
    window_days: int = DEFAULT_WINDOW_DAYS,
    apply: bool = False,
    wiki_log_path: Path | None = None,
    purpose_path: Path | None = None,
) -> dict[str, Any]:
    """R-A Purpose Refresh 의 unified entry point.

    Args:
        workspace_root: PROJECT_PROFILE.md 가 있는 디렉토리
        today: 분석 기준일 (default: 오늘)
        window_days: ingest/query 분포 분석 window (default: 30일)
        apply: True 면 PURPOSE.md frontmatter 갱신, False 면 dry-run
        wiki_log_path: 명시적 log.md path (없으면 `~/wiki/log.md` 기본값)
        purpose_path: 명시적 PURPOSE.md path (없으면 workspace_root 기준 auto-detect)

    Returns:
        {
            "distribution": dict,     # 30일 분포 (analyze_30day_distribution 결과)
            "prompt": str,            # LLM suggest prompt (markdown)
            "purpose_update": dict,   # update_last_purpose_review 결과
            "applied": bool,          # apply flag
            "today": "YYYY-MM-DD",
        }
    """
    today = today or _dt.date.today()

    if purpose_path is None:
        purpose_path = find_purpose_path(workspace_root)
    if wiki_log_path is None:
        wiki_log_path = Path.home() / "wiki" / "log.md"

    distribution = analyze_30day_distribution(wiki_log_path, today, window_days)
    prompt = generate_llm_suggest_prompt(distribution, purpose_path)

    if apply:
        purpose_update = update_last_purpose_review(purpose_path, today)
    else:
        previous = _read_last_purpose_review(purpose_path) if purpose_path else None
        purpose_update = {
            "updated": False,
            "previous": previous,
            "current": today.isoformat(),
            "purpose_path": str(purpose_path) if purpose_path else None,
            "warnings": [],
        }

    return {
        "distribution": distribution,
        "prompt": prompt,
        "purpose_update": purpose_update,
        "applied": apply,
        "today": today.isoformat(),
    }
