# standard-ai-workflow-kit: v1.0.0-beta

"""Normalization helpers shared across workflow kit scripts."""

from __future__ import annotations

import re

from workflow_kit.common.project_docs import WORK_ITEM_ID_PATTERN

# v1.0.2: 정본(`project_docs.WORK_ITEM_ID_PATTERN`)에서 조립한다.
#
# 이전 값 `r"^((?:TASK|WF)-[A-Z0-9-]+)\b"` 는 정본의 **사본**이었고, 문자 클래스가
# 대문자 전용이라 branch-scoped ID 의 소문자 브랜치 segment 에서 매치가 끊겼다:
#
#   TASK-2026-07-27-main-001  →  key 'TASK-2026-07-27-'
#   TASK-2026-07-27-main-002  →  key 'TASK-2026-07-27-'   ← 충돌
#
# `dedupe_work_items` 가 이 key 로 중복을 지우므로 **같은 날짜의 task 가 전부 하나로
# 뭉개져 첫 개만 살아남았다**. state.json 은 자기 내용이 다시 입력으로 돌아오는
# 구조라, 한 번 지워진 항목은 영구 소실된다 (실측: recent_done_items 10건 → 8건,
# 새 항목은 추가되지도 않음).
#
# §2.35 (3) 에서 `WORK_STATUS_RE` 의 같은 결함을 고치며 정본을 세웠는데, 이 사본이
# 남아 있었다 — "규약을 두 곳에 두면 갈라지는 게 아니라 같이 틀린다" 의 세 번째 사례.
WORK_ITEM_ID_RE = re.compile(rf"^({WORK_ITEM_ID_PATTERN})\b")


def normalize_whitespace(value: str) -> str:
    return " ".join(value.strip().split())


def normalize_backticked(value: str) -> str:
    normalized = value.strip()
    if normalized.startswith("`") and normalized.endswith("`"):
        normalized = normalized[1:-1].strip()
    return normalize_whitespace(normalized)


def dedupe_strings(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        normalized = normalize_whitespace(item)
        if normalized and normalized not in seen:
            seen.add(normalized)
            result.append(normalized)
    return result


def dedupe_normalized_backticked(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        normalized = normalize_backticked(item)
        if normalized and normalized not in seen:
            seen.add(normalized)
            result.append(normalized)
    return result


def dedupe_work_items(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        normalized = normalize_backticked(item)
        match = WORK_ITEM_ID_RE.match(normalized)
        key = match.group(1) if match else normalized
        if normalized and key not in seen:
            seen.add(key)
            result.append(normalized)
    return result
