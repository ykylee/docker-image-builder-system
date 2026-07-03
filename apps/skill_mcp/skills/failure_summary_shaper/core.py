"""failure-summary-shaper core (v2 — canonical contract aligned).

`shape(input_data)` 가 build/test/deploy 단계의 failure 응답 + (선택) 로그를
받아 4-구조 (summary / cause / next_step / buildId) 한국어 사용자 메시지로
합성한다.

TASK-061 의 contract rename 으로:
- Enum은 모두 `apps.skill_mcp.contract.canonical` frozenset (ERROR_CODES,
  NEXT_ACTIONS). `OPEN_PREVIEW` 는 더 이상 emit 하지 않고 canonical
  `OPEN_DEPLOYMENT` 으로 매핑.
- 입력 payload 는 canonical `{ stage, error, logs }` 형태 또는 legacy
  `{ failure, previewFailure, logs }` 형태 둘 다 받는다. legacy 는
  forward-compat shim 으로 consume 만.
- `source: build/preview/unknown` 는 deprecated. canonical payload 는
  `stage: BUILD/TEST/DEPLOY/DELIVERY` enum 으로 받는다. legacy caller
  의 `failure.source` 는 stage 으로 forward-mapped (build→BUILD,
  preview→TEST).

자세한 동작 규칙은 같은 디렉터리의 SKILL.md §1/§2 를 따른다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from apps.skill_mcp.contract import canonical as C

SKILL_VERSION = "v2"

# Canonical unions (single source of truth).
ERROR_CODES = C.ERROR_CODES
NEXT_ACTIONS = C.NEXT_ACTIONS

# Canonical stage values (BUILD / TEST / DEPLOY / DELIVERY) — at which
# step the failure happened. Source-of-truth = `apps.skill_mcp.contract
# .canonical.CANONICAL_STAGES`.
CANONICAL_STAGES = C.CANONICAL_STAGES

# Backward-compat: legacy `source: build/preview/unknown` mapping.
# Source-of-truth = `apps.skill_mcp.contract.canonical.LEGACY_SOURCE_TO_STAGE`.
LEGACY_SOURCE_TO_STAGE = C.LEGACY_SOURCE_TO_STAGE


# Canonical stage → summary line.
SUMMARY_BY_STAGE = {
    "BUILD": "빌드(컨테이너 이미지 생성) 단계가 끝나지 않았어요.",
    "TEST": "컨테이너 테스트 단계가 끝나지 않았어요.",
    "DEPLOY": "외부 배포 단계가 끝나지 않았어요.",
    "DELIVERY": "결과 전달 단계가 끝나지 않았어요.",
    "unknown": "빌드 또는 테스트 또는 배포 진행이 끝나지 않았어요.",
}


# Canonical ErrorCode → cause 라인.
CAUSE_BY_CODE = {
    "INVALID_REQUEST": "요청에 잘못된 필드가 있어요. userId/appName/sourceArchiveRef 를 확인해 주세요.",
    "BUILD_NOT_FOUND": "내부 식별자 문제로 빌드를 찾지 못했어요. 새 빌드를 요청해 주세요.",
    "LOGS_NOT_FOUND": "빌드 로그를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.",
    "QUEUE_CLAIM_FAILED": "빌드 큐에서 빌드를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.",
    "DOCKER_BUILD_FAILED": "이미지 빌드 단계에서 문제가 발생했어요. Dockerfile 과 의존성 설정을 확인해 주세요.",
    "PREVIEW_PROVISION_FAILED": "컨테이너 테스트 환경 준비에 실패했어요. 앱이 실제로 듣는 포트와 health endpoint 를 확인해 주세요.",
    "ACTIVE_BUILD_EXISTS": "같은 앱에 진행 중인 빌드가 있어요. 기존 빌드가 끝나면 다시 시도해 주세요.",
    "UNKNOWN_ERROR": "내부 오류가 발생했어요. 잠시 후 다시 시도하거나 운영자에게 문의해 주세요.",
}


# Canonical next_action → next_step 라인.
NEXT_STEP_BY_ACTION = {
    "WAIT": "잠시 기다린 뒤 다시 확인해 주세요.",
    "OPEN_DEPLOYMENT": "배포된 결과 페이지를 확인해 주세요.",
    "RETRY": "잠시 후 같은 설정으로 다시 요청해 주세요.",
    "FIX_DOCKERFILE": "Dockerfile 과 의존성 설정을 먼저 확인한 뒤 다시 요청해 주세요.",
    "FIX_PORT": "앱의 실행 포트 설정을 먼저 확인한 뒤 다시 요청해 주세요.",
    "CHECK_SOURCE": "소스 아카이브와 업로드 상태를 먼저 확인해 주세요.",
    "CONTACT_OPERATOR": "운영자에게 문의해 주세요. (buildId 를 함께 전달해 주세요.)",
    "NONE": "원인을 확인한 뒤 다시 시도해 주세요.",
}

CAUSE_MAX_LEN = 100
LOG_LINE_MAX = 60


@dataclass
class FailureSummary:
    """shape() 의 반환값."""

    ok: bool
    summary: str = ""
    cause: str = ""
    next_step: str = ""
    build_id: str | None = None
    logs_excerpt: str | None = None
    next_action: str | None = None
    stage: str | None = None
    error_code: str | None = None
    warnings: list[dict[str, str]] = field(default_factory=list)
    errors: list[dict[str, str]] = field(default_factory=list)
    skill_version: str = SKILL_VERSION

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "summary": self.summary,
            "cause": self.cause,
            "next_step": self.next_step,
            "buildId": self.build_id,
            "logs_excerpt": self.logs_excerpt,
            "stage": self.stage,
            "next_action": self.next_action,
            "ref": {
                "design_doc": "docs/sdlc/design/06-user-messaging-and-failure-handling.md",
                "skill_version": self.skill_version,
            },
        }


def _err(code: str, field_name: str, message: str) -> dict[str, str]:
    return {"code": code, "field": field_name, "message": message}


def _trunc(s: str, n: int) -> str:
    if len(s) <= n:
        return s
    return s[: n - 1] + "\u2026"


def _coerce_legacy_failure_dict(f: Any) -> dict[str, Any] | None:
    """Map legacy `failure` payload into a normalised dict.

    Returns None for missing / non-dict inputs.
    """
    if f is None:
        return None
    if not isinstance(f, dict):
        return None
    return {
        "stage": LEGACY_SOURCE_TO_STAGE.get(f.get("source", "unknown"), "BUILD"),
        "error_code": f.get("errorCode"),
        "error_summary": f.get("errorSummary"),
        "next_action": _map_legacy_next_action(f.get("nextAction")),
    }


def _coerce_legacy_preview_failure_dict(f: Any) -> dict[str, Any] | None:
    """Map legacy `previewFailure` payload specifically. previewFailure
    의 도메인은 container-test preview 였으므로 stage=TEST 로 강제.
    """
    if f is None:
        return None
    if not isinstance(f, dict):
        return None
    return {
        "stage": "TEST",
        "error_code": f.get("errorCode"),
        "error_summary": f.get("errorSummary"),
        "next_action": _map_legacy_next_action(f.get("nextAction")),
    }


def _map_legacy_next_action(value: Any) -> str | None:
    """Legacy `OPEN_PREVIEW` → canonical `OPEN_DEPLOYMENT` mapping. Other
    values pass through (caller 검증 함수가 unknown enum 을 잡는다).

    Note: this is INPUT forward-compat only. The skill's own output
    emits canonical `OPEN_DEPLOYMENT` (or any other NEXT_ACTIONS
    member) — `OPEN_PREVIEW` never appears in the outgoing
    `next_action` field.
    """
    if value == "OPEN_PREVIEW":
        return "OPEN_DEPLOYMENT"
    if isinstance(value, str):
        return value
    return None


def _pick_cause(error_code: str | None, error_summary: str | None) -> str:
    """canonical ErrorCode 면 매핑 우선, 아니면 errorSummary 또는 default."""
    if isinstance(error_code, str) and error_code in CAUSE_BY_CODE:
        return CAUSE_BY_CODE[error_code]
    if isinstance(error_code, str) and error_code:
        # 미지 enum
        return f"원인을 정확히 분류하지 못했어요. (코드: {error_code})"
    if isinstance(error_summary, str) and error_summary.strip():
        return _trunc(error_summary.strip(), CAUSE_MAX_LEN)
    return "원인이 분류되지 않았어요. 로그를 확인해 주세요."


def _pick_summary(stage: str) -> str:
    return SUMMARY_BY_STAGE.get(stage, SUMMARY_BY_STAGE["unknown"])


def _pick_next_step(next_action: Any) -> str:
    if isinstance(next_action, str) and next_action in NEXT_STEP_BY_ACTION:
        return NEXT_STEP_BY_ACTION[next_action]
    if next_action == "OPEN_PREVIEW":
        # 입력 shim 경로 — _map_legacy_next_action 단계에서 OPEN_PREVIEW 가
        # OPEN_DEPLOYMENT 로 forward-mapped 됐어야 하지만, 직접 호출도
        # 안전하게 처리.
        return NEXT_STEP_BY_ACTION["OPEN_DEPLOYMENT"]
    return NEXT_STEP_BY_ACTION["NONE"]


def _build_logs_excerpt(tail: list[str]) -> str | None:
    if not tail:
        return None
    cleaned = [str(t).strip() for t in tail if str(t).strip()]
    if not cleaned:
        return None
    if len(cleaned) == 1:
        return _trunc(cleaned[0], LOG_LINE_MAX)
    first = _trunc(cleaned[0], LOG_LINE_MAX)
    last = _trunc(cleaned[-1], LOG_LINE_MAX)
    if first == last:
        return first
    return f"{first} \u00b7\u00b7\u00b7 {last}"


def _resolve_primary_failure(input_data: dict[str, Any]) -> tuple[dict[str, Any] | None, list[dict[str, str]]]:
    """Return the canonical-shaped primary-failure dict, or None.

    Inputs accepted (in priority order):
      1) canonical `{ error: { code, message }, stage }` (singular, no
         `previewFailure` analogue — canonical says deployment failures
         use `resultDelivery.error`).
      2) canonical BuildStatusResponse-style `{ lastError: { code, message }, test/deploy }`
         — surfaces lastError when present.
      3) legacy `{ failure: {...}, previewFailure: {...} }` (forward-compat).

    Returns (primary_or_None, warnings).
    """
    warnings: list[dict[str, str]] = []

    # 1) explicit canonical input
    error_obj = input_data.get("error")
    if isinstance(error_obj, dict):
        stage = input_data.get("stage")
        if not isinstance(stage, str) or stage not in CANONICAL_STAGES:
            if stage is not None:
                warnings.append(_err(
                    "UNKNOWN_ENUM", "stage", f"unknown stage: {stage!r}; treated as 'BUILD'",
                ))
            stage = "BUILD"
        return {
            "stage": stage,
            "error_code": error_obj.get("code"),
            "error_summary": error_obj.get("message"),
            "next_action": input_data.get("nextAction"),
        }, warnings

    # 2) BuildStatusResponse-style
    last_error = input_data.get("lastError")
    if isinstance(last_error, dict):
        # stage 추론: test.deploy 블록 status 가 FAILED 면 DEPLOY, test.status 가 FAILED 면 TEST.
        stage = input_data.get("stage")
        if isinstance(stage, str) and stage in CANONICAL_STAGES:
            inferred_stage = stage
        else:
            inferred_stage = "BUILD"
            deploy_block = input_data.get("deploy")
            test_block = input_data.get("test")
            if isinstance(deploy_block, dict) and deploy_block.get("status") == "FAILED":
                inferred_stage = "DEPLOY"
            elif isinstance(test_block, dict) and test_block.get("status") == "FAILED":
                inferred_stage = "TEST"
        return {
            "stage": inferred_stage,
            "error_code": last_error.get("code"),
            "error_summary": last_error.get("message"),
            "next_action": input_data.get("nextAction"),
        }, warnings

    # 3) legacy `failure` (and optional `previewFailure`)
    failure_raw = input_data.get("failure")
    failure = _coerce_legacy_failure_dict(failure_raw)
    if failure is not None:
        return failure, warnings

    # 4) legacy `previewFailure` 단독 — legacy caller 가 preview 만 보낸
    # 마이그레이션 종료 시점용. TEST stage 으로 forward-map.
    legacy_preview_failure = _coerce_legacy_preview_failure_dict(input_data.get("previewFailure"))
    if legacy_preview_failure is not None:
        return legacy_preview_failure, warnings

    return None, warnings


def shape(input_data: Any) -> FailureSummary:
    """build/test/deploy failure → 4-구조 한국어 메시지 합성 (canonical v2)."""
    warnings: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []

    if not isinstance(input_data, dict):
        return FailureSummary(
            ok=False,
            errors=[_err("INVALID_INPUT", "<root>", "input must be a JSON object")],
        )

    build_id = input_data.get("buildId")
    if build_id is not None and not isinstance(build_id, str):
        warnings.append(_err(
            "INVALID_INPUT", "buildId",
            "buildId must be a string when provided",
        ))
        build_id = None

    primary, primary_warnings = _resolve_primary_failure(input_data)
    warnings.extend(primary_warnings)

    if primary is None:
        return FailureSummary(
            ok=False,
            errors=[_err(
                "MISSING_FIELD", "<root>",
                "either `error`, `lastError`, or legacy `failure` is required",
            )],
        )

    # legacy `previewFailure` → secondary line 추가 (canonical migration 동안만).
    legacy_preview = _coerce_legacy_failure_dict(input_data.get("previewFailure"))
    extra = legacy_preview if legacy_preview is not None else None

    stage = primary["stage"] or "BUILD"

    # cause
    cause = _pick_cause(primary["error_code"], primary["error_summary"])
    if extra is not None and extra is not primary:
        extra_cause = _pick_cause(extra["error_code"], extra["error_summary"])
        if extra_cause and extra_cause != cause:
            if stage == "TEST" or extra["stage"] == "TEST":
                stage_token = "테스트 단계에서도"
            else:
                stage_token = "다음 단계에서도"
            cause = f"{cause} · 그리고 {stage_token} {extra_cause}"

    # next_step
    next_action = primary.get("next_action")
    if not isinstance(next_action, str) or not next_action:
        next_action = "NONE"
    if next_action not in NEXT_ACTIONS and next_action != "OPEN_PREVIEW":
        # OPEN_PREVIEW 는 forward-compat shim 으로 OPEN_DEPLOYMENT 로 자동 매핑.
        # 그 외 canonical NEXT_ACTIONS 외 값은 UNKNOWN_ENUM warning + NONE fallback.
        warnings.append(_err(
            "UNKNOWN_ENUM", "nextAction",
            f"unknown nextAction: {next_action!r}; treated as 'NONE'",
        ))
        next_action = "NONE"
    next_step = _pick_next_step(next_action)

    # error_code 유효성
    error_code = primary["error_code"]
    if isinstance(error_code, str) and error_code and error_code not in ERROR_CODES:
        warnings.append(_err(
            "UNKNOWN_ENUM", "errorCode",
            f"unknown errorCode: {error_code!r}",
        ))

    # logs_excerpt
    logs_obj = input_data.get("logs")
    logs_excerpt: str | None = None
    if logs_obj is not None:
        if not isinstance(logs_obj, dict):
            warnings.append(_err(
                "INVALID_INPUT", "logs",
                "logs must be an object with optional 'tail'",
            ))
        else:
            tail = logs_obj.get("tail")
            if tail is not None:
                if not isinstance(tail, list):
                    warnings.append(_err(
                        "INVALID_INPUT", "logs.tail",
                        "logs.tail must be a list of strings",
                    ))
                else:
                    logs_excerpt = _build_logs_excerpt(tail)

    return FailureSummary(
        ok=len(errors) == 0,
        summary=_pick_summary(stage),
        cause=cause,
        next_step=next_step,
        build_id=build_id,
        logs_excerpt=logs_excerpt,
        next_action=next_action,
        stage=stage,
        error_code=error_code if isinstance(error_code, str) else None,
        warnings=warnings,
        errors=errors,
    )
