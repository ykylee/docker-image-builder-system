"""preview-readiness-checker core.

`check_readiness(input_data)` 가 build / testDeployment / healthProbe / ttl 입력을
받아 readiness_state (7종) 와 사용자용 카드 4-필드를 합성한다.

자세한 동작 규칙은 같은 디렉터리의 SKILL.md §1/§2 를 따른다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

SKILL_VERSION = "v1"

# readiness_state enum
READINESS_STATES = frozenset({
    "READY",
    "PREPARING",
    "WAITING_FOR_SLOT",
    "STARTING",
    "DEGRADED",
    "EXPIRED",
    "UNKNOWN",
})

# canonical next_action enum
NEXT_ACTIONS = frozenset({
    "WAIT",
    "OPEN_PREVIEW",
    "RETRY",
    "FIX_DOCKERFILE",
    "FIX_PORT",
    "CHECK_SOURCE",
    "CONTACT_OPERATOR",
    "NONE",
})

# canonical BuildStatus subset
PREPARING_STATUSES = frozenset({"QUEUED", "CLAIMED", "BUILDING"})
BUILDING_PHASES = frozenset({
    "REQUEST_ACCEPTED",
    "QUEUE_CLAIMED",
    "SOURCE_PREPARED",
    "DOCKER_BUILD_STARTED",
    "DOCKER_BUILD_COMPLETED",
})

# canonical PreviewStatus
PREVIEW_QUEUED = frozenset({"QUEUED"})
PREVIEW_STARTING = frozenset({"RESERVED", "PROVISIONING", "STARTING"})
PREVIEW_READY = frozenset({"READY"})
PREVIEW_FAILED = frozenset({"FAILED"})
PREVIEW_EXPIRED = frozenset({"EXPIRED", "STOPPED", "NOT_REQUESTED"})

# card content per state
CARD_BY_STATE = {
    "READY": {
        "title": "테스트용 미리보기 주소가 준비되었습니다.",
        "body": "이 주소로 현재 앱 동작을 확인할 수 있습니다. 미리보기는 임시 환경이며 새 배포가 준비되면 교체될 수 있습니다.",
        "next_action": "OPEN_PREVIEW",
    },
    "WAITING_FOR_SLOT": {
        "title": "테스트용 미리보기 실행 자리를 기다리고 있습니다.",
        "body": "잠시만 기다려 주세요. preview 실행 자리가 확보되면 자동으로 시작됩니다.",
        "next_action": "WAIT",
    },
    "STARTING": {
        "title": "테스트용 미리보기를 실행하는 중입니다.",
        "body": "컨테이너를 띄우는 중이에요. 보통 1~2분 정도 걸립니다.",
        "next_action": "WAIT",
    },
    "PREPARING": {
        "title": "앱을 실행 가능한 이미지로 만드는 중입니다.",
        "body": "이미지 빌드가 끝나면 미리보기 환경이 시작됩니다.",
        "next_action": "WAIT",
    },
    "DEGRADED": {
        "title": "테스트용 미리보기에 문제가 있어요. 잠시 후 다시 시도해 주세요.",
        "body": "컨테이너가 시작은 됐지만 정상 응답이 없어요. 로그를 확인하거나 잠시 후 다시 시도해 주세요.",
        "next_action": "RETRY",
    },
    "EXPIRED": {
        "title": "미리보기 환경이 만료됐어요. 새 배포를 시작해 주세요.",
        "body": "TTL 이 만료됐거나 preview 가 중지됐어요. 새 빌드를 요청해 주세요.",
        "next_action": "RETRY",
    },
    "UNKNOWN": {
        "title": "미리보기 상태를 확인하지 못했어요.",
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


def _classify(
    build: dict[str, Any],
    test_deployment: dict[str, Any] | None,
    health_probe: dict[str, Any] | None,
) -> str:
    """readiness_state 결정.

    우선순위: preview 명시 상태 > build.status.
    """
    if test_deployment is not None:
        status = test_deployment.get("status")
        if status in PREVIEW_QUEUED:
            return "WAITING_FOR_SLOT"
        if status in PREVIEW_STARTING:
            return "STARTING"
        if status in PREVIEW_READY:
            # health probe 가 unhealthy 면 DEGRADED
            if health_probe is not None:
                hp = health_probe.get("status")
                if hp == "unhealthy":
                    return "DEGRADED"
            return "READY"
        if status in PREVIEW_FAILED:
            return "DEGRADED"
        if status in PREVIEW_EXPIRED:
            return "EXPIRED"

    build_status = build.get("status")
    current_phase = build.get("currentPhase")

    if build_status in PREPARING_STATUSES:
        return "PREPARING"
    if current_phase in BUILDING_PHASES:
        return "PREPARING"
    if current_phase == "PREVIEW_QUEUED":
        return "WAITING_FOR_SLOT"
    if build_status == "TEST_READY":
        # testDeployment 정보가 부족 → STARTING (아직 자리는 잡고 컨테이너 시작 중)
        return "STARTING"
    if build_status == "COMPLETED":
        # testDeployment 이 없는 build 라면 UNKNOWN 으로 두고, next_action=NONE
        return "UNKNOWN"
    if build_status == "FAILED":
        return "DEGRADED"
    if build_status == "CANCELLED":
        return "EXPIRED"
    return "UNKNOWN"


def _ttl_remaining(
    test_deployment: dict[str, Any] | None,
    ttl: dict[str, Any] | None,
) -> int | None:
    if ttl is not None:
        v = ttl.get("ttl_remaining_seconds")
        if isinstance(v, int) and v >= 0:
            return v
    # expiresAt 는 absolute 시각. now 가 없으면 그대로 둘 수 없으니 None.
    if test_deployment is not None:
        if "expiresAt" in test_deployment:
            # caller 가 expiresAt 만 줬고 now 가 없는 경우. 본 단계는 ttl 정밀 계산 X.
            return None
    return None


def check_readiness(input_data: Any) -> ReadinessResult:
    """preview readiness 카드 + readiness_state 합성."""
    warnings: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []

    if not isinstance(input_data, dict):
        return ReadinessResult(
            ok=False,
            errors=[_err("INVALID_INPUT", "<root>", "input must be a JSON object")],
        )

    build = input_data.get("build")
    if not isinstance(build, dict) or not build.get("status"):
        return ReadinessResult(
            ok=False,
            errors=[_err(
                "MISSING_FIELD", "build",
                "build object with `status` is required",
            )],
        )

    test_deployment = input_data.get("testDeployment")
    if test_deployment is not None and not isinstance(test_deployment, dict):
        warnings.append(_err(
            "INVALID_INPUT", "testDeployment",
            "testDeployment must be an object when provided",
        ))
        test_deployment = None

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

    state = _classify(build, test_deployment, health_probe)
    card_data = CARD_BY_STATE[state]

    subtitle = ""
    if state == "READY" and test_deployment is not None:
        url = test_deployment.get("previewUrl")
        if isinstance(url, str):
            subtitle = url

    card = ReadinessCard(
        title=card_data["title"],
        subtitle=subtitle,
        body=card_data["body"],
        ttl_remaining_seconds=_ttl_remaining(test_deployment, ttl),
        next_action=card_data["next_action"],
    )

    build_id = input_data.get("buildId") or build.get("buildId")
    if build_id is not None and not isinstance(build_id, str):
        warnings.append(_err(
            "INVALID_INPUT", "buildId",
            "buildId must be a string when provided",
        ))
        build_id = None

    # state 자체가 UNKNOWN 인데 build.status 가 canonical 외면 warning.
    canonical_build_status = {
        "QUEUED", "CLAIMED", "BUILDING", "TEST_READY",
        "COMPLETED", "FAILED", "CANCELLED",
    }
    if build.get("status") not in canonical_build_status:
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
