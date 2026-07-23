"""preview-readiness-checker core (v2 — canonical contract aligned).

`check_readiness(input_data)` 가 build 응답 + (선택) container-test
block + (선택) ttl 정보를 받아 readiness_state (7종) 와 사용자용 카드
4-필드 + next_action 을 합성한다.

TASK-061 contract rename:
- `testDeployment` (legacy preview-era) → canonical `test`
  (ContainerTestResult). canonical `test.status` 는 `executionStatuses`
  union (NOT_STARTED / IN_PROGRESS / SUCCESS / FAILED / SKIPPED).
  legacy `testDeployment.status` 는 forward-compat shim 으로 consume
  만 (READY/PROVISIONING/QUEUED → SUCCESS/IN_PROGRESS/NOT_STARTED).
- `nextAction = OPEN_PREVIEW` → canonical `OPEN_DEPLOYMENT`.
- 도메인은 사실상 container-test readiness 임. 디렉터리 이름
  (`preview_readiness_checker`) 은 import path 호환성 유지를 위해
  그대로 둠. SKILL.md 의 표면 surface 만 canonical 으로 정렬.
- 7 readiness_state union (`READINESS_STATES`) 은 그대로.
  READINESS_STATES 도 python `apps.skill_mcp.contract.canonical` 의
  frozenset 을 단일 source-of-truth 로 사용.

자세한 동작 규칙은 같은 디렉터리의 SKILL.md §1/§2 를 따른다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from apps.skill_mcp.contract import canonical as C

SKILL_VERSION = "v2"

# Canonical unions (single source of truth).
READINESS_STATES = C.READINESS_STATES
NEXT_ACTIONS = C.NEXT_ACTIONS
EXECUTION_STATUSES = C.EXECUTION_STATUSES
CANONICAL_BUILD_STATUSES = C.CANONICAL_BUILD_STATUSES
BUILD_PHASES = C.BUILD_PHASES
LEGACY_PREVIEW_STATUSES = C.LEGACY_PREVIEW_STATUSES

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

# Legacy preview-status forward-mapping → canonical execution status.
# Single source-of-truth lives in `apps.skill_mcp.contract.canonical`
# so build-status-explainer / latest-build-status / preview-readiness-checker
# stay aligned.
LEGACY_PREVIEW_TO_EXECUTION = C.LEGACY_PREVIEW_TO_EXECUTION

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

    Canonical payload: `input_data["test"]` ∈ ContainerTestResult shape.
    Legacy forward-compat: `input_data["testDeployment"]` is mapped into
    the same shape (`status`, `containerRef` from previewUrl / containerRef).

    Returns the block dict (with at least `status` key) or None.
    """
    warnings: list[dict[str, str]] = []

    test_block = input_data.get("test")
    if test_block is not None:
        if not isinstance(test_block, dict):
            warnings.append(_err(
                "INVALID_INPUT", "test",
                "test must be an object when provided",
            ))
            return None, warnings
        return test_block, warnings

    legacy = input_data.get("testDeployment")
    if legacy is None:
        return None, warnings
    if not isinstance(legacy, dict):
        warnings.append(_err(
            "INVALID_INPUT", "testDeployment",
            "testDeployment must be an object when provided",
        ))
        return None, warnings

    # forward map legacy preview.Status → canonical executionStatus.
    legacy_status = legacy.get("status")
    if isinstance(legacy_status, str):
        execution = LEGACY_PREVIEW_TO_EXECUTION.get(legacy_status, legacy_status)
    else:
        execution = None

    mapped: dict[str, Any] = {}
    if execution is not None:
        mapped["status"] = execution
    container_ref = legacy.get("previewUrl") or legacy.get("containerRef")
    if isinstance(container_ref, str) and container_ref:
        mapped["containerRef"] = container_ref
    return mapped, warnings


def _classify(
    build: dict[str, Any],
    test_block: dict[str, Any] | None,
    health_probe: dict[str, Any] | None,
) -> str:
    """readiness_state 결정.

    우선순위: test block 의 status (canonical execution OR legacy
    preview) → build.status. Health probe 가 unhealthy 면 SUCCESS/READY
    도 DEGRADED 로 다운그레이드.
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
        # legacy preview statuses (forward-compat shim; canonical payload
        # 는 위 분기에서 처리됨)
        if status == "READY":
            if health_probe is not None:
                hp = health_probe.get("status")
                if hp == "unhealthy":
                    return "DEGRADED"
            return "READY"
        if status in ("PROVISIONING", "RESERVED", "STARTING"):
            return "STARTING"
        if status == "QUEUED":
            return "WAITING_FOR_SLOT"
        if status in ("EXPIRED", "STOPPED", "NOT_REQUESTED"):
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
    if test_block is not None:
        # canonical test 의 expiresAt / ttl 필드는 아직 contract 에 없음.
        # legacy testDeployment 의 expiresAt 는 caller 가 inputs 에 노출하지
        # 않으므로 ttl_remaining_seconds 만 받는다.
        if "expiresAt" in test_block:
            return None
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

    subtitle = ""
    if state == "READY" and test_block is not None:
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
