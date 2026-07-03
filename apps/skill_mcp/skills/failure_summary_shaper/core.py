"""failure-summary-shaper core.

`shape(input_data)` 가 build/preview failure 응답 + (선택) 로그를 받아
4-구조 (summary / cause / next_step / buildId) 한국어 사용자 메시지로 합성한다.

자세한 동작 규칙은 같은 디렉터리의 SKILL.md §1/§2 를 따른다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

SKILL_VERSION = "v1"

# canonical next_action enum (build-status-explainer 와 동일)
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

# canonical ErrorCode (contract-drift-checker 가 canonical 만 검증한 set 와 동일)
ERROR_CODES = frozenset({
    "INVALID_REQUEST",
    "SOURCE_ARCHIVE_NOT_FOUND",
    "DOCKERFILE_NOT_FOUND",
    "INVALID_RUNTIME_PORT",
    "INVALID_BUILD_INPUT",
    "DOCKER_BUILD_FAILED",
    "PREVIEW_PORT_UNAVAILABLE",
    "PREVIEW_CONTAINER_START_FAILED",
    "PREVIEW_HEALTHCHECK_FAILED",
    "INTERNAL_ERROR",
})

# (source enum, summary 라인)
SUMMARY_BY_SOURCE = {
    "build": "배포가 완료되지 않았습니다.",
    "preview": "미리보기 환경이 준비되지 않았습니다.",
    "unknown": "빌드/미리보기 진행이 끝나지 않았습니다.",
}

# canonical ErrorCode -> cause 라인
CAUSE_BY_CODE = {
    "INVALID_REQUEST": "요청에 잘못된 필드가 있어요. userId/appName/sourceArchiveRef 를 확인해 주세요.",
    "SOURCE_ARCHIVE_NOT_FOUND": "소스 아카이브를 찾을 수 없어요. 업로드가 끝났는지 확인해 주세요.",
    "DOCKERFILE_NOT_FOUND": "Dockerfile 을 찾을 수 없어요. 경로와 이름을 확인해 주세요.",
    "INVALID_RUNTIME_PORT": "앱이 알려준 실행 포트가 비어있거나 잘못됐어요. runtimePort 값을 확인해 주세요.",
    "INVALID_BUILD_INPUT": "빌드 입력이 정책과 맞지 않아요. dockerfileMode / detectedAppType 등을 확인해 주세요.",
    "DOCKER_BUILD_FAILED": "앱을 이미지로 만드는 단계에서 문제가 발생했어요. Dockerfile 과 의존성 설정을 확인해 주세요.",
    "PREVIEW_PORT_UNAVAILABLE": "선택한 미리보기 포트를 지금 쓸 수 없어요. 다른 포트로 다시 시도해 주세요.",
    "PREVIEW_CONTAINER_START_FAILED": "미리보기 컨테이너가 시작되지 않았어요. 앱이 해당 포트에서 정말 듣는지 확인해 주세요.",
    "PREVIEW_HEALTHCHECK_FAILED": "미리보기 컨테이너가 응답하지 않아요. 앱의 health endpoint 또는 startup 시간을 확인해 주세요.",
    "INTERNAL_ERROR": "내부 오류가 발생했어요. 잠시 후 다시 시도하거나 운영자에게 문의해 주세요.",
}

# canonical next_action -> next_step 라인
NEXT_STEP_BY_ACTION = {
    "WAIT": "잠시 기다린 뒤 다시 확인해 주세요.",
    "OPEN_PREVIEW": "테스트용 미리보기 주소를 확인해 주세요.",
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
    source: str | None = None
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


def _coerce_failure(f: Any) -> dict[str, Any] | None:
    if f is None:
        return None
    if not isinstance(f, dict):
        return None
    return {
        "source": f.get("source", "unknown"),
        "errorCode": f.get("errorCode"),
        "errorSummary": f.get("errorSummary"),
        "nextAction": f.get("nextAction"),
    }


def _pick_cause(failure: dict[str, Any]) -> str:
    """canonical ErrorCode 면 매핑 우선, 아니면 errorSummary 또는 default."""
    code = failure.get("errorCode")
    if isinstance(code, str) and code in CAUSE_BY_CODE:
        return CAUSE_BY_CODE[code]
    if isinstance(code, str) and code:  # 미지 enum
        return f"원인을 정확히 분류하지 못했어요. (코드: {code})"
    summary = failure.get("errorSummary")
    if isinstance(summary, str) and summary.strip():
        return _trunc(summary.strip(), CAUSE_MAX_LEN)
    return "원인이 분류되지 않았어요. 로그를 확인해 주세요."


def _pick_summary(source: str) -> str:
    return SUMMARY_BY_SOURCE.get(source, SUMMARY_BY_SOURCE["unknown"])


def _pick_next_step(next_action: Any) -> str:
    if isinstance(next_action, str) and next_action in NEXT_STEP_BY_ACTION:
        return NEXT_STEP_BY_ACTION[next_action]
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


def shape(input_data: Any) -> FailureSummary:
    """build/preview failure → 4-구조 한국어 메시지 합성."""
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

    failure_raw = input_data.get("failure")
    preview_raw = input_data.get("previewFailure")
    failure = _coerce_failure(failure_raw)
    preview = _coerce_failure(preview_raw)

    if failure is None and preview is None:
        return FailureSummary(
            ok=False,
            errors=[_err(
                "MISSING_FIELD", "failure",
                "either failure or previewFailure is required",
            )],
        )

    # 둘 다 있으면 build 우선, preview 는 cause 끝에 부가 라인
    if failure is not None and preview is not None:
        primary = failure
        extra = preview
    else:
        primary = failure or preview
        extra = None

    source = primary.get("source") or "unknown"
    if source not in SUMMARY_BY_SOURCE:
        warnings.append(_err(
            "UNKNOWN_ENUM", "source",
            f"unknown source: {source!r}; treated as 'unknown'",
        ))
        source = "unknown"

    # cause
    cause = _pick_cause(primary)
    if extra is not None:
        extra_summary = _pick_cause(extra)
        if extra_summary and extra_summary != cause:
            cause = f"{cause} · 그리고 미리보기 단계에서도 {extra_summary}"

    # next_step
    next_action = primary.get("nextAction")
    if not isinstance(next_action, str) or not next_action:
        next_action = "NONE"
    if next_action not in NEXT_ACTIONS:
        warnings.append(_err(
            "UNKNOWN_ENUM", "nextAction",
            f"unknown nextAction: {next_action!r}; treated as 'NONE'",
        ))
        next_action = "NONE"
    next_step = _pick_next_step(next_action)

    # error_code 유효성
    error_code = primary.get("errorCode")
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
        summary=_pick_summary(source),
        cause=cause,
        next_step=next_step,
        build_id=build_id,
        logs_excerpt=logs_excerpt,
        next_action=next_action,
        source=source,
        error_code=error_code if isinstance(error_code, str) else None,
        warnings=warnings,
        errors=errors,
    )
