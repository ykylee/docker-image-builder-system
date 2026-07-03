"""build-status-explainer core.

`explain(input_data)` 가 Build Server 의 status 응답을 받아
3-tier 메시지 (system / agent / user) 와 next_action 을 만든다.

자세한 동작 규칙은 같은 디렉터리의 SKILL.md §4 를 따른다.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

CONTRACT_VERSION = "v1"
EXPLANATION_VERSION = "v1"

# canonical enum 집합 (docs/sdlc/contracts/01-shared-build-contract-baseline.md §5/§6/§7/§8)
BUILD_STATUSES = frozenset(
    {
        "QUEUED",
        "PREPARING",
        "VALIDATING",
        "BUILDING",
        "IMAGE_BUILT",
        "TEST_DEPLOYING",
        "TEST_READY",
        "COMPLETED",
        "FAILED",
        "CANCELLED",
    }
)

PREVIEW_STATUSES = frozenset(
    {
        "QUEUED",
        "RESERVED",
        "STARTING",
        "READY",
        "FAILED",
        "EXPIRED",
        "STOPPED",
    }
)

PHASES = frozenset(
    {
        "REQUEST_ACCEPTED",
        "SOURCE_PREPARING",
        "INPUT_VALIDATING",
        "DOCKER_BUILDING",
        "IMAGE_REGISTERED",
        "PREVIEW_QUEUEING",
        "PREVIEW_STARTING",
        "PREVIEW_READY",
        "FAILED",
    }
)

ERROR_CODES = frozenset(
    {
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
    }
)

TERMINAL_BUILD_STATUSES = frozenset({"COMPLETED", "FAILED", "CANCELLED"})

NEXT_ACTIONS = frozenset(
    {
        "WAIT",
        "OPEN_PREVIEW",
        "RETRY",
        "FIX_DOCKERFILE",
        "FIX_PORT",
        "CHECK_SOURCE",
        "CONTACT_OPERATOR",
        "NONE",
    }
)


def _agent_msg_for_build_status(status: str) -> str:
    """시스템 상태 → 한국어 에이전트 메시지."""
    table = {
        "QUEUED": "요청이 큐에 들어갔고, 곧 빌드가 시작될 예정입니다.",
        "PREPARING": "소스 코드를 가져오고 빌드 입력을 준비하는 중입니다.",
        "VALIDATING": "Dockerfile과 실행 포트 등 입력을 검증하는 중입니다.",
        "BUILDING": "Docker 이미지를 빌드하는 중입니다.",
        "IMAGE_BUILT": "이미지 빌드가 끝났고, 미리보기 환경 준비로 넘어갑니다.",
        "TEST_DEPLOYING": "테스트용 미리보기 컨테이너를 띄우는 중입니다.",
        "TEST_READY": "앱 실행 준비는 끝났고, 사용자 안내용 preview 가 활성화되었습니다.",
        "COMPLETED": "빌드가 완료되었고, 사용 가능한 preview 가 함께 종료되었습니다.",
        "FAILED": "빌드 또는 미리보기 단계에서 실패가 발생했습니다.",
        "CANCELLED": "사용자에 의해 취소된 빌드입니다.",
    }
    return table.get(status, f"알 수 없는 build status 입니다: {status}")


def _user_msg_for_build_status(status: str) -> str:
    table = {
        "QUEUED": "요청을 잘 받았어요. 잠시만 기다려 주세요.",
        "PREPARING": "코드를 가져오는 중이에요. 조금만 기다려 주세요.",
        "VALIDATING": "입력을 확인하고 있어요.",
        "BUILDING": "지금 이미지를 만들고 있어요. 조금만 기다려 주세요.",
        "IMAGE_BUILT": "이미지는 완성됐고, 이제 미리보기 환경을 띄우는 중이에요.",
        "TEST_DEPLOYING": "테스트용 미리보기 주소를 만들고 있어요. 거의 다 됐어요.",
        "TEST_READY": "앱이 실행 준비 상태가 됐어요. 곧 미리보기 주소를 알려드릴게요.",
        "COMPLETED": "빌드가 끝났고, 미리보기까지 모두 마무리됐어요.",
        "FAILED": "빌드가 실패했어요. 잠시 아래 안내를 확인해 주세요.",
        "CANCELLED": "이 빌드는 취소됐어요. 다시 시도하려면 새 요청을 보내 주세요.",
    }
    return table.get(status, f"현재 상태를 해석할 수 없어요 (status={status}).")


def _user_msg_for_preview_building() -> str:
    return "미리보기 주소를 만들고 있어요. 거의 다 됐어요."


def _user_msg_for_preview_ready(preview_url: str | None) -> str:
    if preview_url:
        return f"미리보기 주소가 준비됐어요. 아래 링크에서 확인해 주세요: {preview_url}"
    return "미리보기 주소가 준비됐어요."


def _user_msg_for_preview_expired_or_stopped() -> str:
    return "이 preview 는 만료되었거나 정지된 상태예요. 다시 빌드해 주세요."


def _error_summary_from_logs(log_tail: list[str]) -> str:
    """로그 첫 줄 + 마지막 줄을 짧게 발췌한다."""
    if not log_tail:
        return ""
    first = log_tail[0]
    last = log_tail[-1] if len(log_tail) > 1 else ""
    pieces: list[str] = []
    for raw in (first, last):
        if not raw:
            continue
        compact = re.sub(r"\s+", " ", str(raw)).strip()
        if len(compact) > 80:
            compact = compact[:77] + "..."
        pieces.append(compact)
    return " | ".join(p for p in pieces if p)


def _next_action_for_error_code(error_code: str | None) -> str:
    if not error_code:
        return "NONE"
    table = {
        "INVALID_REQUEST": "CHECK_SOURCE",
        "SOURCE_ARCHIVE_NOT_FOUND": "CHECK_SOURCE",
        "DOCKERFILE_NOT_FOUND": "CHECK_SOURCE",
        "INVALID_RUNTIME_PORT": "FIX_PORT",
        "INVALID_BUILD_INPUT": "FIX_DOCKERFILE",
        "DOCKER_BUILD_FAILED": "FIX_DOCKERFILE",
        "PREVIEW_PORT_UNAVAILABLE": "FIX_PORT",
        "PREVIEW_CONTAINER_START_FAILED": "RETRY",
        "PREVIEW_HEALTHCHECK_FAILED": "RETRY",
        "INTERNAL_ERROR": "CONTACT_OPERATOR",
    }
    return table.get(error_code, "CONTACT_OPERATOR")


def _next_action_for_build_status(
    status: str,
    preview_status: str | None,
) -> str:
    if status == "TEST_READY":
        # preview 가 READY 면 OPEN_PREVIEW, 아니면 WAIT
        if preview_status == "READY":
            return "OPEN_PREVIEW"
        return "WAIT"
    if status == "COMPLETED":
        if preview_status == "READY":
            return "OPEN_PREVIEW"
        if preview_status in ("EXPIRED", "STOPPED"):
            return "RETRY"
        return "NONE"
    if status == "FAILED":
        return _next_action_for_error_code(None)  # 기본; error_code 는 호출자가 채움
    if status == "CANCELLED":
        return "NONE"
    # in-flight
    return "WAIT"


@dataclass
class Explanation:
    """explain() 의 결과 표현."""

    ok: bool
    explanation: dict[str, Any] = field(default_factory=dict)
    warnings: list[dict[str, str]] = field(default_factory=list)
    errors: list[dict[str, str]] = field(default_factory=list)
    contract_version: str = CONTRACT_VERSION
    explanation_version: str = EXPLANATION_VERSION

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "explanation": self.explanation,
            "warnings": list(self.warnings),
            "errors": list(self.errors),
            "ref": {
                "contract_doc": "docs/sdlc/contracts/01-shared-build-contract-baseline.md",
                "design_doc": "docs/sdlc/design/06-user-messaging-and-failure-handling.md",
                "contract_version": self.contract_version,
                "explanation_version": self.explanation_version,
            },
        }


def explain(input_data: Any) -> Explanation:
    """Build status 응답을 3-tier 메시지로 변환한다."""
    warnings: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []

    if not isinstance(input_data, dict):
        errors.append(
            {
                "code": "INVALID_INPUT",
                "field": "<root>",
                "message": "input must be a JSON object",
            }
        )
        return Explanation(ok=False, errors=errors)

    status = input_data.get("status")
    if status is None:
        errors.append(
            {
                "code": "MISSING_FIELD",
                "field": "status",
                "message": "status is required",
            }
        )
    elif status not in BUILD_STATUSES:
        warnings.append(
            {
                "code": "UNKNOWN_ENUM",
                "field": "status",
                "message": f"unknown build status: {status!r}",
            }
        )

    phase = input_data.get("currentPhase")
    if phase is not None and phase not in PHASES:
        warnings.append(
            {
                "code": "UNKNOWN_ENUM",
                "field": "currentPhase",
                "message": f"unknown phase: {phase!r}",
            }
        )

    preview_obj = input_data.get("testDeployment")
    if preview_obj is not None and not isinstance(preview_obj, dict):
        errors.append(
            {
                "code": "INVALID_TYPE",
                "field": "testDeployment",
                "message": "testDeployment must be a JSON object",
            }
        )
        preview_obj = None
    preview_status: str | None = None
    preview_url: str | None = None
    if isinstance(preview_obj, dict):
        preview_status = preview_obj.get("status")
        if preview_status is not None and preview_status not in PREVIEW_STATUSES:
            warnings.append(
                {
                    "code": "UNKNOWN_ENUM",
                    "field": "testDeployment.status",
                    "message": f"unknown preview status: {preview_status!r}",
                }
            )
        preview_url = preview_obj.get("previewUrl")
        if preview_url is not None and not isinstance(preview_url, str):
            warnings.append(
                {
                    "code": "INVALID_TYPE",
                    "field": "testDeployment.previewUrl",
                    "message": "previewUrl must be a string",
                }
            )
            preview_url = None

    error_obj = input_data.get("error")
    error_code: str | None = None
    if error_obj is not None:
        if not isinstance(error_obj, dict):
            errors.append(
                {
                    "code": "INVALID_TYPE",
                    "field": "error",
                    "message": "error must be a JSON object",
                }
            )
        else:
            error_code = error_obj.get("code")
            if error_code is not None and error_code not in ERROR_CODES:
                warnings.append(
                    {
                        "code": "UNKNOWN_ENUM",
                        "field": "error.code",
                        "message": f"unknown error code: {error_code!r}",
                    }
                )

    logs_obj = input_data.get("logs")
    log_tail: list[str] = []
    if logs_obj is not None:
        if not isinstance(logs_obj, dict) or not isinstance(logs_obj.get("tail"), list):
            warnings.append(
                {
                    "code": "INVALID_TYPE",
                    "field": "logs",
                    "message": "logs.tail must be a list of strings",
                }
            )
        else:
            log_tail = [str(line) for line in logs_obj["tail"]]

    # status 가 없거나 root 가 잘못되면 여기서 멈춘다.
    if any(e["code"] in ("MISSING_FIELD", "INVALID_INPUT", "INVALID_TYPE")
           and e["field"] in ("status", "<root>", "testDeployment", "error")
           for e in errors):
        return Explanation(ok=False, warnings=warnings, errors=errors)

    # --- 메시지 합성 ---
    system_payload: dict[str, Any] = {
        "status": status,
        "phase": phase,
        "preview": preview_status,
    }
    agent_msg = _agent_msg_for_build_status(status) if status else "build status 가 비어 있습니다."
    user_msg = _user_msg_for_build_status(status) if status else "현재 build 상태를 알 수 없어요."

    is_terminal = status in TERMINAL_BUILD_STATUSES
    next_action = _next_action_for_build_status(status, preview_status)
    error_summary: str | None = None

    if preview_status == "READY" and status in ("TEST_READY", "COMPLETED"):
        # preview 가 사용 가능하면 user 메시지를 구체화
        user_msg = _user_msg_for_preview_ready(preview_url)
    elif status in ("TEST_READY", "COMPLETED") and preview_status in (
        "QUEUED",
        "RESERVED",
        "STARTING",
    ):
        user_msg = _user_msg_for_preview_building()
    elif status == "COMPLETED" and preview_status in ("EXPIRED", "STOPPED"):
        user_msg = _user_msg_for_preview_expired_or_stopped()
    elif preview_status == "FAILED" and status != "FAILED":
        # build 가 FAILED 가 아닌데 preview 만 FAILED 인 경우
        next_action = _next_action_for_error_code(error_code) if error_code else "RETRY"
        error_summary = _error_summary_from_logs(log_tail) or "preview 가 실패 상태로 표시됩니다."
        user_msg = "미리보기 환경이 실패했어요. 잠시 아래 안내를 확인해 주세요."

    if status == "FAILED":
        # error_code 가 있으면 그 매핑, 없으면 CONTACT_OPERATOR
        if error_code:
            next_action = _next_action_for_error_code(error_code)
        else:
            next_action = "CONTACT_OPERATOR"
        error_summary = _error_summary_from_logs(log_tail) or None
        if error_code == "DOCKER_BUILD_FAILED":
            user_msg = "이미지 빌드가 실패했어요. Dockerfile 의 베이스 이미지 / 빌드 단계를 확인해 주세요."
        elif error_code in ("SOURCE_ARCHIVE_NOT_FOUND", "DOCKERFILE_NOT_FOUND"):
            user_msg = "소스 또는 Dockerfile 을 찾을 수 없어요. 저장소 경로와 파일 존재를 확인해 주세요."
        elif error_code in ("INVALID_RUNTIME_PORT", "PREVIEW_PORT_UNAVAILABLE"):
            user_msg = "실행 포트 설정에 문제가 있어요. 앱이 실제로 듣는 포트로 맞춰 주세요."
        elif error_code == "INVALID_REQUEST":
            user_msg = "요청에 잘못된 값이 있어요. 입력 필드를 다시 확인해 주세요."
        elif error_code == "INTERNAL_ERROR":
            user_msg = "내부 오류가 발생했어요. 운영팀에 문의해 주세요."

    # 최종: 알 수 없는 status 인 경우 ok=false
    ok = len(errors) == 0
    if status and status not in BUILD_STATUSES:
        # build status 자체가 unknown 이면 ok=false, next_action=NONE
        next_action = "NONE"
        ok = False

    explanation = {
        "system": system_payload,
        "agent": agent_msg,
        "user": user_msg,
        "next_action": next_action,
        "is_terminal": is_terminal,
        "error_summary": error_summary,
    }

    return Explanation(
        ok=ok,
        explanation=explanation,
        warnings=warnings,
        errors=errors,
    )
