"""container-test-readiness-checker core (v3 — canonical contract only).

`check_readiness(input_data)` 가 build 응답 + (선택) container-test
block + (선택) ttl 정보를 받아 readiness_state (7종) 와 사용자용 카드
4-필드 + next_action 을 합성한다.

TASK-061 contract rename:
- `testDeployment` (legacy preview-era) → canonical `test`
  (ContainerTestResult). canonical `test.status` 는 `executionStatuses`
  union (NOT_STARTED / IN_PROGRESS / SUCCESS / FAILED / SKIPPED).
- `nextAction = OPEN_PREVIEW` → canonical `OPEN_DEPLOYMENT`.
- 7 readiness_state union (`READINESS_STATES`) 은 그대로.
  READINESS_STATES 도 python `apps.skill_mcp.contract.canonical` 의
  frozenset 을 단일 source-of-truth 로 사용.

TASK-163 (P2-M4):
- 디렉터리/스킬 이름을 `preview_readiness_checker` →
  `container_test_readiness_checker` 로 개명. 도메인은 처음부터
  container-test readiness 였고, import path 호환을 위해 미뤄둔 이름이었다.
- **legacy `testDeployment` 입력 경로와 preview-status 매핑을 제거**했다.
  그 형태를 만들어내는 쪽이 더 이상 없다 — P2-M1~M3 에서 계약 · 서버 응답 ·
  runner 어휘가 차례로 canonical 로 정렬됐다. 이제 입력은 canonical `test`
  (ContainerTestResult) 하나뿐이다.

자세한 동작 규칙은 같은 디렉터리의 SKILL.md §1/§2 를 따른다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from apps.skill_mcp.contract import canonical as C

SKILL_VERSION = "v3"

# Canonical unions (single source of truth).
READINESS_STATES = C.READINESS_STATES
NEXT_ACTIONS = C.NEXT_ACTIONS
EXECUTION_STATUSES = C.EXECUTION_STATUSES
CANONICAL_BUILD_STATUSES = C.CANONICAL_BUILD_STATUSES
BUILD_PHASES = C.BUILD_PHASES

# In-flight / not-yet-completed canonical build statuses.
PREPARING_STATUSES = frozenset({
    "RECEIVED",
    "QUEUED",
    "PREPARING_SOURCE",
    "BUILDING",
    "BUILD_SUCCESS",
})

# Phases where the build is still up to the docker build step.
BUILDING_PHASES = frozenset({
    "REQUEST_ACCEPTED",
    "QUEUE_CLAIMED",
    "SOURCE_PREPARED",
    "DOCKER_BUILD_STARTED",
    "DOCKER_BUILD_COMPLETED",
})

# canonical status 값에 따른 사용 안내 카드.
CARD_BY_STATE = {
    "READY": {
        "title": "테스트 컨테이너가 준비되었습니다.",
        "body": "이 결과로 현재 앱 동작을 확인할 수 있습니다. 외부 배포는 다음 단계에서 진행됩니다.",
        "next_action": "OPEN_DEPLOYMENT",
    },
    "WAITING_FOR_SLOT": {
        "title": "테스트 컨테이너 실행 자리를 기다리고 있습니다.",
        "body": "잠시만 기다려 주세요. 실행 자리가 확보되면 자동으로 시작됩니다.",
        "next_action": "WAIT",
    },
    "STARTING": {
        "title": "테스트 컨테이너를 띄우는 중입니다.",
        "body": "컨테이너를 띄우는 중이에요. 보통 1~2분 정도 걸립니다.",
        "next_action": "WAIT",
    },
    "PREPARING": {
        "title": "앱을 실행 가능한 이미지로 만드는 중입니다.",
        "body": "이미지 빌드가 끝나면 테스트 컨테이너가 시작됩니다.",
        "next_action": "WAIT",
    },
    "DEGRADED": {
        "title": "테스트 컨테이너에 문제가 있어요. 잠시 후 다시 시도해 주세요.",
        "body": "컨테이너가 시작은 됐지만 정상 응답이 없어요. 로그를 확인하거나 잠시 후 다시 시도해 주세요.",
        "next_action": "RETRY",
    },
    "EXPIRED": {
        "title": "테스트 컨테이너가 만료됐어요. 새 배포를 시작해 주세요.",
        "body": "TTL 이 만료됐거나 컨테이너가 중지됐어요. 새 빌드를 요청해 주세요.",
        "next_action": "RETRY",
    },
    "UNKNOWN": {
        "title": "테스트 컨테이너 상태를 확인하지 못했어요.",
        "body": "상태를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.",
        "next_action": "NONE",
    },
}


@dataclass
class ReadinessCard:
    title: str = ""
    subtitle: str = ""
    body: str = ""
    ttl_remaining_seconds: int | None = None
    next_action: str = "NONE"

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "subtitle": self.subtitle,
            "body": self.body,
            "ttl_remaining_seconds": self.ttl_remaining_seconds,
            "next_action": self.next_action,
        }


@dataclass
class ReadinessResult:
    ok: bool
    readiness_state: str = "UNKNOWN"
    card: ReadinessCard = field(default_factory=ReadinessCard)
    build_id: str | None = None
    warnings: list[dict[str, str]] = field(default_factory=list)
    errors: list[dict[str, str]] = field(default_factory=list)
    skill_version: str = SKILL_VERSION

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "readiness_state": self.readiness_state,
            "card": self.card.to_dict(),
            "buildId": self.build_id,
            "warnings": list(self.warnings),
            "errors": list(self.errors),
            "ref": {
                "contract_doc": "docs/sdlc/contracts/01-shared-build-contract-baseline.md",
                "design_doc": "docs/sdlc/design/06-user-messaging-and-failure-handling.md",
                "skill_version": self.skill_version,
            },
        }


def _err(code: str, field_name: str, message: str) -> dict[str, str]:
    return {"code": code, "field": field_name, "message": message}


def _resolve_canonical_test_block(input_data: dict[str, Any]) -> tuple[dict[str, Any] | None, list[dict[str, str]]]:
    """Return (canonical_test_block, warnings).

    입력은 canonical `input_data["test"]` (ContainerTestResult shape) 하나뿐이다.
    TASK-163 에서 legacy `testDeployment` 경로를 제거했다 — 그 형태를 만들어
    내는 쪽이 더 이상 없다.
    """
    warnings: list[dict[str, str]] = []

    test_block = input_data.get("test")
    if test_block is None:
        return None, warnings
    if not isinstance(test_block, dict):
        warnings.append(_err(
            "INVALID_INPUT", "test",
            "test must be an object when provided",
        ))
        return None, warnings
    return test_block, warnings


def _classify(
    build: dict[str, Any],
    test_block: dict[str, Any] | None,
    health_probe: dict[str, Any] | None,
) -> str:
    """readiness_state 결정.

    우선순위: canonical `test.status` (ExecutionStatus) → build.status.
    Health probe 가 unhealthy 면 SUCCESS 도 DEGRADED 로 다운그레이드.
    """
    if test_block is not None:
        status = test_block.get("status")
        # canonical execution statuses
        if status == "SUCCESS":
            if health_probe is not None:
                hp = health_probe.get("status")
                if hp == "unhealthy":
                    return "DEGRADED"
            return "READY"
        if status == "IN_PROGRESS":
            return "STARTING"
        if status == "NOT_STARTED":
            return "WAITING_FOR_SLOT"
        if status == "FAILED":
            return "DEGRADED"
        if status == "SKIPPED":
            return "EXPIRED"
        # 알 수 없는 status → fallthrough to build-side classification.

    build_status = build.get("status")
    current_phase = build.get("currentPhase")

    # canonical build status 우선 분류.
    if build_status in PREPARING_STATUSES:
        return "PREPARING"
    if build_status in ("TESTING",):
        return "STARTING"
    if current_phase in BUILDING_PHASES:
        return "PREPARING"

    # legacy build status forward-mapped.
    if build_status in ("TEST_SUCCESS",):
        return "STARTING"
    if build_status in ("PREPARING_SOURCE",):
        return "PREPARING"
    if build_status == "COMPLETED":
        # canonical build done 이지만 test/deploy 가 아직 안 왔거나 unknown.
        return "UNKNOWN"
    if build_status == "FAILED":
        return "DEGRADED"
    if build_status == "CANCELLED":
        return "EXPIRED"
    return "UNKNOWN"


def _ttl_remaining(
    test_block: dict[str, Any] | None,
    ttl: dict[str, Any] | None,
) -> int | None:
    if ttl is not None:
        v = ttl.get("ttl_remaining_seconds")
        if isinstance(v, int) and v >= 0:
            return v
    # canonical `test` 블록에는 expiresAt / ttl 필드가 없다 — 컨테이너
    # 테스트의 수명은 runner 가 결과 보고 시점에 정리하지, TTL 로 만료시키지
    # 않는다 (TASK-161 에서 previewTtlMinutes 제거). 따라서 남은 시간은
    # 호출자가 준 `ttl.ttl_remaining_seconds` 로만 얻는다.
    del test_block
    return None


def check_readiness(input_data: Any) -> ReadinessResult:
    """readiness 카드 + readiness_state 합성."""
    warnings: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []

    if not isinstance(input_data, dict):
        return ReadinessResult(
            ok=False,
            errors=[_err("INVALID_INPUT", "<root>", "input must be a JSON object")],
        )

    # canonical payload: build summary lives at top-level `build` (or as a
    # flat legacy dict with `status`).
    build: dict[str, Any] | None = input_data.get("build")
    if not isinstance(build, dict):
        # legacy flat fallback — synthesise build dict from top-level keys.
        flat: dict[str, Any] = {}
        for k in ("buildId", "userId", "appName", "status",
                  "currentPhase", "createdAt", "startedAt", "finishedAt"):
            if k in input_data:
                flat[k] = input_data[k]
        if flat.get("status"):
            build = flat
    if not isinstance(build, dict) or not build.get("status"):
        return ReadinessResult(
            ok=False,
            errors=[_err(
                "MISSING_FIELD", "build",
                "build object with `status` is required",
            )],
        )

    test_block, parse_warnings = _resolve_canonical_test_block(input_data)
    warnings.extend(parse_warnings)

    health_probe = input_data.get("healthProbe")
    if health_probe is not None and not isinstance(health_probe, dict):
        warnings.append(_err(
            "INVALID_INPUT", "healthProbe",
            "healthProbe must be an object when provided",
        ))
        health_probe = None

    ttl = input_data.get("ttl")
    if ttl is not None and not isinstance(ttl, dict):
        warnings.append(_err(
            "INVALID_INPUT", "ttl",
            "ttl must be an object when provided",
        ))
        ttl = None

    state = _classify(build, test_block, health_probe)
    if state not in READINESS_STATES:
        warnings.append(_err(
            "UNKNOWN_ENUM", "readiness_state",
            f"unexpected state computed: {state!r}; treated as UNKNOWN",
        ))
        state = "UNKNOWN"
    card_data = CARD_BY_STATE[state]

    # TASK-163 (P2-M4): 사용자에게 보여줄 값은 **접속 가능한 URL** 이 먼저다.
    # canonical `build.runtimeUrl`(TASK-161 개명) 을 1순위로 하고, 없으면
    # 컨테이너 식별자 `test.containerRef` 로 대체한다. 이전 구현은 legacy
    # 매핑이 previewUrl 을 containerRef 자리에 넣어주는 것에 의존하고 있어서,
    # 그 매핑이 사라지면 URL 을 영영 못 보게 되는 구조였다.
    subtitle = ""
    if state == "READY":
        runtime_url = build.get("runtimeUrl")
        if isinstance(runtime_url, str) and runtime_url:
            subtitle = runtime_url
        elif test_block is not None:
            ref = test_block.get("containerRef")
            if isinstance(ref, str):
                subtitle = ref

    next_action = card_data["next_action"]
    if next_action not in NEXT_ACTIONS:
        # CARD_BY_STATE only emits canonical next_action values, so this
        # branch fires only on unknown enum — migrate-level safety nets
        # for OPEN_PREVIEW etc. are no longer needed since the canonical
        # NEXT_ACTIONS doesn't include them.
        warnings.append(_err(
            "UNKNOWN_ENUM", "next_action",
            f"unexpected next_action {next_action!r}; treated as NONE",
        ))
        next_action = "NONE"

    card = ReadinessCard(
        title=card_data["title"],
        subtitle=subtitle,
        body=card_data["body"],
        ttl_remaining_seconds=_ttl_remaining(test_block, ttl),
        next_action=next_action,
    )

    build_id = input_data.get("buildId") or build.get("buildId")
    if build_id is not None and not isinstance(build_id, str):
        warnings.append(_err(
            "INVALID_INPUT", "buildId",
            "buildId must be a string when provided",
        ))
        build_id = None

    # build.status 가 canonical / legacy 어느 쪽에도 없으면 warning.
    if build.get("status") not in CANONICAL_BUILD_STATUSES:
        warnings.append(_err(
            "UNKNOWN_ENUM", "build.status",
            f"unknown build.status: {build.get('status')!r}",
        ))

    return ReadinessResult(
        ok=len(errors) == 0,
        readiness_state=state,
        card=card,
        build_id=build_id,
        warnings=warnings,
        errors=errors,
    )
