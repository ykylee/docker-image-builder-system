"""`maturity_matrix.json` 의 **어휘 정본** (v1.0.4+).

## 왜 이 모듈이 있는가

matrix 의 항목은 두 종류다 — 실행되는 skill 과, 실행 표면이 없는 **명세(`kind: "spec"`)**.
`task-modes` 가 후자다 (`spec_path: core/workflow_task_modes.md`). 그래서 `test_path` 가
`null` 인 것이 정상인데, 그 규약을 아는 자리가 `tests/check_maturity_registry.py` **하나뿐**
이었다. kit 이 배포하는 린터(`check_maturity_consistency`)는 몰랐고, 그래서
`--maturity` 를 돌 때마다 "stable 인데 test_path 가 없다" 는 **위양성**을 냈다.

위양성을 내는 검사는 무시당한다. 어휘를 여기 한 곳에 두고 둘 다 이 이름을 읽는다.

## roadmap 정합을 문자열 포함으로 판정하면 안 되는 이유

이전 판정은 "matrix 의 in_progress milestone `name` 문자열이 roadmap 본문에 있는가" 였다.
그 줄 하나만 넣으면 roadmap 이 같은 단계를 `planned` 라고 적고 있어도 통과한다 — 통과하면서
아무것도 보장하지 못하는 검사다 (§2.47 과 같은 축). 그래서 판정을 둘로 나눈다.

1. **언급**: roadmap 이 그 milestone 의 key 와 name 을 담고 있는가.
2. **모순 없음**: roadmap 이 그 milestone 을 동시에 `planned` / `진입 대기` 로 적고 있지
   않은가. matrix 가 `in_progress` 라고 말하는 단계를 roadmap 이 아직 시작 안 했다고
   적고 있으면, 언급이 있어도 그것은 정합이 아니다.

Cross-ref: releases/Beta-v1.0.0.md §2.48.
"""

from __future__ import annotations

import re
from typing import Any, Final, Mapping

#: 실행 표면이 없는 명세 항목. `test_path` 대신 `spec_path` 가 근거다.
SKILL_KIND_SPEC: Final[str] = "spec"

#: 이 stage 부터는 실행 skill 에 test_path 를 요구한다.
TEST_REQUIRED_STAGES: Final[tuple[str, ...]] = ("beta", "stable")

#: roadmap 이 "아직 시작 안 했다" 고 말하는 표현. matrix 가 `in_progress` 인 단계에
#: 이 표현이 붙어 있으면 둘 중 하나는 틀린 것이다.
ROADMAP_PLANNED_MARKERS: Final[tuple[str, ...]] = ("planned", "진입 대기", "진입 예정")


def is_spec_entry(entry: Mapping[str, Any]) -> bool:
    """실행 표면이 없는 명세 항목인가."""
    return str(entry.get("kind", "")) == SKILL_KIND_SPEC


def requires_test_path(entry: Mapping[str, Any]) -> bool:
    """이 항목이 `test_path` 를 가져야 하는가.

    명세 항목은 실행 표면이 없으므로 요구하지 않는다 — 그쪽 근거는 `spec_path` 다.
    """
    if is_spec_entry(entry):
        return False
    return str(entry.get("stage", "")) in TEST_REQUIRED_STAGES


def spec_path_of(entry: Mapping[str, Any]) -> str | None:
    """명세 항목이 선언한 `spec_path` (없으면 None)."""
    value = entry.get("spec_path")
    return str(value) if value else None


def _mentions(text: str, key: str) -> bool:
    """`Phase 1` 이 `Phase 13` 에 걸리지 않도록 뒤에 숫자가 오는 경우를 뺀다."""
    return re.search(re.escape(key) + r"(?!\d)", text) is not None


def roadmap_planned_contradictions(roadmap_content: str, milestone_key: str) -> list[str]:
    """`in_progress` milestone 을 roadmap 이 아직 `planned` 로 적고 있는 줄들.

    반환값이 비어 있지 않으면 **matrix 와 roadmap 이 서로 다른 말을 하고 있다**.
    어느 쪽이 사실인지는 이 함수가 정하지 않는다 — 모순을 드러내기만 한다.
    """
    offending: list[str] = []
    for line in roadmap_content.splitlines():
        if not _mentions(line, milestone_key):
            continue
        lowered = line.lower()
        if any(marker.lower() in lowered for marker in ROADMAP_PLANNED_MARKERS):
            offending.append(line.strip())
    return offending
