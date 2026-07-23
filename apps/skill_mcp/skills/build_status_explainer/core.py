"""build-status-explainer core (v3 — legacy fallback 제거).

`explain(input_data)` 가 Build Server 의 status 응답을 받아 3-tier 메시지
(system / agent / user) 와 next_action 을 만든다.

TASK-161 (P2-M2 Step 5): legacy `testDeployment` 입력 fallback 코드
제거. canonical `test`(ContainerTestResult) 만 받는다. canonical
`test.status` 는 `executionStatuses` union (NOT_STARTED / IN_PROGRESS /
SUCCESS / FAILED / SKIPPED). backward-compat 가 필요하면 caller 가
normalizer 를 거치면 된다.

TASK-061 의 contract rename 으로:
- Enum은 모두 `apps.skill_mcp.contract.canonical` 의 frozenset 으로 통일
  (BUILD_STATUSES, EXECUTION_STATUSES, BUILD_PHASES, ERROR_CODES,
  NEXT_ACTIONS). 더 이상 skill 안에 literal 복제본 없음 → drift 차단.
- 입력 payload 가 legacy preview-era 형태(`status` + `testDeployment`
  preview field) 거나 canonical 형태(`lifecycle` / `image` / `test` /
  `deploy` / `resultDelivery`) 거나 모두 받는다. canonical 이 우선이고
  legacy 는 forward-compat shim 으로 consume 만.
- 출력의 `next_action` 은 canonical `OPEN_DEPLOYMENT` 를 사용 (legacy
  `OPEN_PREVIEW` 는 더 이상 emit 하지 않는다).
- message table 은 12 canonical statuses + legacy compat mapping 까지
  모두 커버.

자세한 동작 규칙은 같은 디렉터리의 SKILL.md §4 를 따른다.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from apps.skill_mcp.contract import canonical as C

CONTRACT_VERSION = "v3"
EXPLANATION_VERSION = "v3"

# Canonical unions (single source of truth).
BUILD_STATUSES = C.CANONICAL_BUILD_STATUSES
EXECUTION_STATUSES = C.EXECUTION_STATUSES
PHASES = C.BUILD_PHASES
ERROR_CODES = C.ERROR_CODES
NEXT_ACTIONS = C.NEXT_ACTIONS
TERMINAL_BUILD_STATUSES = frozenset({"COMPLETED", "FAILED", "CANCELLED"})


# Canonical 12-status message table. Keys are the canonical


# Canonical 12-status message table. Keys are the canonical
# canonicalBuildStatuses from `apps.skill_mcp.contract.canonical`.
_AGENT_MSG_BY_BUILD_STATUS: dict[str, str] = {
    "RECEIVED": "요청이 접수됐고, 큐 진입을 준비합니다.",
    "QUEUED": "요청이 큐에 들어갔고, 곧 빌드가 시작될 예정입니다.",
    "PREPARING_SOURCE": "소스 아카이브를 가져오고 빌드 입력을 준비하는 중입니다.",
    "BUILDING": "Docker 이미지를 빌드하는 중입니다.",
    "BUILD_SUCCESS": "이미지 빌드가 끝났고, 다음 단계(컨테이너 테스트)로 넘어갑니다.",
    "TESTING": "테스트용 컨테이너를 띄워 동작을 확인하는 중입니다.",
    "TEST_SUCCESS": "컨테이너 테스트가 통과했고, 다음 단계(외부 배포)로 넘어갑니다.",
    "DEPLOYING": "외부 시스템으로 배포하는 중입니다.",
    "DEPLOY_SUCCESS": "외부 배포가 끝났고, 결과 전달 단계로 넘어갑니다.",
    "COMPLETED": "빌드가 끝까지 완료됐습니다.",
    "FAILED": "빌드 또는 테스트 또는 배포 단계에서 실패가 발생했습니다.",
    "CANCELLED": "사용자에 의해 취소된 빌드입니다.",
}


_USER_MSG_BY_BUILD_STATUS: dict[str, str] = {
    "RECEIVED": "요청을 잘 받았어요. 잠시만 기다려 주세요.",
    "QUEUED": "큐에서 차례를 기다리고 있어요.",
    "PREPARING_SOURCE": "코드를 가져오는 중이에요. 조금만 기다려 주세요.",
    "BUILDING": "지금 이미지를 만들고 있어요. 조금만 기다려 주세요.",
    "BUILD_SUCCESS": "이미지는 완성됐고, 이제 컨테이너 테스트를 돌리고 있어요.",
    "TESTING": "테스트 컨테이너를 띄우는 중이에요. 보통 1~2분 정도 걸려요.",
    "TEST_SUCCESS": "컨테이너 테스트가 통과했어요. 이제 외부로 배포할게요.",
    "DEPLOYING": "외부 시스템으로 보내는 중이에요. 조금만 더 기다려 주세요.",
    "DEPLOY_SUCCESS": "배포가 끝났어요. 결과를 정리해 알려드릴게요.",
    "COMPLETED": "전 과정이 끝났어요. 결과를 확인해 주세요.",
    "FAILED": "빌드가 실패했어요. 잠시 아래 안내를 확인해 주세요.",
    "CANCELLED": "이 빌드는 취소됐어요. 다시 시도하려면 새 요청을 보내 주세요.",
}


def _user_msg_for_test_testing() -> str:
    return "테스트 컨테이너를 띄우는 중이에요. 거의 다 됐어요."


def _user_msg_for_test_ready(test_runtime_url: str | None) -> str:
    base = "테스트 결과가 준비됐어요."
    if test_runtime_url:
        return f"{base} 아래에서 확인해 주세요: {test_runtime_url}"
    return base


def _user_msg_for_test_expired_or_failed() -> str:
    return "테스트 컨테이너가 끝나지 않았어요. 로그를 확인하거나 새 빌드를 요청해 주세요."


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
        "BUILD_NOT_FOUND": "CHECK_SOURCE",
        "LOGS_NOT_FOUND": "CHECK_SOURCE",
        "QUEUE_CLAIM_FAILED": "CONTACT_OPERATOR",
        "DOCKER_BUILD_FAILED": "FIX_DOCKERFILE",
        "PREVIEW_PROVISION_FAILED": "FIX_PORT",
        "DEPLOYMENT_FAILED": "CONTACT_OPERATOR",
        "ACTIVE_BUILD_EXISTS": "WAIT",
        "UNKNOWN_ERROR": "CONTACT_OPERATOR",
    }
    return table.get(error_code, "CONTACT_OPERATOR")


def _next_action_for_build_status(
    status: str,
    test_execution_status: str | None,
) -> str:
    """Canonical status + test.executionStatus -> next_action.

    `OPEN_DEPLOYMENT` 는 `DEPLOY_SUCCESS` 또는 `TEST_SUCCESS` 도달 시점
    (deploy 가 트리거되기 직전 또는 직후) 의 사용자 액션. canonical 의
    canonicalBuildStatuses 값만 받는다.
    """
    if status == "TEST_SUCCESS":
        # test 끝남 → deploy 직전. 사용자는 잠깐 기다리거나 결과 확인.
        return "WAIT"
    if status == "DEPLOYING":
        return "WAIT"
    if status == "DEPLOY_SUCCESS":
        return "OPEN_DEPLOYMENT"
    if status == "COMPLETED":
        return "NONE"
    if status == "FAILED":
        return "CONTACT_OPERATOR"
    if status == "CANCELLED":
        return "NONE"
    # in-flight (RECEIVED, QUEUED, PREPARING_SOURCE, BUILDING, BUILD_SUCCESS,
    # TESTING, …) or unknown canonical.
    return "WAIT"


def _resolve_test_runtime_url(build: dict[str, Any], test_block: dict[str, Any] | None) -> str | None:
    """Best-effort runtime URL for the success-state user message.

    Canonical `test.containerRef` is the canonical reference to the running
    test container. Sub-commit A 의 type-level fix 이후 `test.runtimeUrl` 도
    옵션으로 사용 가능.
    """
    if not isinstance(test_block, dict):
        return None
    ref = test_block.get("containerRef")
    if isinstance(ref, str) and ref:
        return ref
    runtime_url = test_block.get("runtimeUrl")
    if isinstance(runtime_url, str) and runtime_url:
        return runtime_url
    return None


def _resolve_canonical_build_block(input_data: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any] | None, list[dict[str, str]]]:
    """Extract (build_summary, test_block, errors) from canonical payload.

    Canonical payload shape (BuildStatusResponse):
      { "build": {...}, "lastError": {...} | null, "lifecycle": {...},
        "image": {...}, "test": {...}, "deploy": {...}, "resultDelivery": {...}, ... }

    Returns (build_summary, test_block_or_None, errors). `build_summary`
    always has at least a `status` key for the downstream message-table
    lookup.
    """
    errors: list[dict[str, str]] = []

    canonical_build = input_data.get("build")
    if not isinstance(canonical_build, dict):
        return {}, None, errors
    test = input_data.get("test")
    if test is not None and not isinstance(test, dict):
        errors.append(_err("INVALID_TYPE", "test", "test must be a JSON object when provided"))
        test = None
    return canonical_build, test, errors


def _execution_status_from_test(test_block: dict[str, Any] | None) -> str | None:
    """Canonical `test.status` ∈ EXECUTION_STATUSES.

    Unknown enum values are returned raw so the caller can attach a warning.
    """
    if test_block is None:
        return None
    raw = test_block.get("status")
    if not isinstance(raw, str):
        return None
    return raw


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


def _err(code: str, field_name: str, message: str) -> dict[str, str]:
    return {"code": code, "field": field_name, "message": message}


def explain(input_data: Any) -> Explanation:
    """Build status 응답을 3-tier 메시지로 변환한다 (canonical v2)."""
    warnings: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []

    if not isinstance(input_data, dict):
        errors.append(_err("INVALID_INPUT", "<root>", "input must be a JSON object"))
        return Explanation(ok=False, errors=errors)

    # canonical or legacy payload → (build_summary, test_block, errors)
    build_summary, test_block, parse_errors = _resolve_canonical_build_block(input_data)
    errors.extend(parse_errors)

    # Also pull canonical `lastError` (BuildStatusResponse.lastError).
    last_error = input_data.get("lastError")

    status = build_summary.get("status") if isinstance(build_summary, dict) else None
    if status is None:
        # legacy top-level fallback for callers that pass `{ status, currentPhase, ... }` flat.
        status = input_data.get("status")
    if status is None:
        errors.append(_err("MISSING_FIELD", "status", "status is required"))
    elif status not in BUILD_STATUSES:
        warnings.append(_err(
            "UNKNOWN_ENUM", "status", f"unknown build status: {status!r}",
        ))

    phase = build_summary.get("currentPhase") if isinstance(build_summary, dict) else None
    if phase is None:
        phase = input_data.get("currentPhase")
    if phase is not None and phase not in PHASES:
        warnings.append(_err(
            "UNKNOWN_ENUM", "currentPhase", f"unknown phase: {phase!r}",
        ))

    test_execution = _execution_status_from_test(test_block)
    if test_execution is not None and test_execution not in EXECUTION_STATUSES:
        warnings.append(_err(
            "UNKNOWN_ENUM", "test.status",
            f"unknown test execution status: {test_execution!r}",
        ))

    # error block: prefer canonical BuildStatusResponse.lastError, then build.error, then legacy error.
    error_obj: Any = None
    if isinstance(last_error, dict):
        error_obj = last_error
    elif last_error is not None:
        errors.append(_err("INVALID_TYPE", "lastError", "lastError must be a JSON object when provided"))
    if error_obj is None:
        error_obj = (
            build_summary.get("error") if isinstance(build_summary, dict) else None
        ) or input_data.get("error")
    error_code: str | None = None
    if error_obj is not None:
        if not isinstance(error_obj, dict):
            errors.append(_err("INVALID_TYPE", "error", "error must be a JSON object"))
        else:
            error_code = error_obj.get("code")
            if error_code is not None and error_code not in ERROR_CODES:
                warnings.append(_err(
                    "UNKNOWN_ENUM", "error.code",
                    f"unknown error code: {error_code!r}",
                ))

    logs_obj = input_data.get("logs")
    log_tail: list[str] = []
    if logs_obj is not None:
        if not isinstance(logs_obj, dict) or not isinstance(logs_obj.get("tail"), list):
            warnings.append(_err(
                "INVALID_TYPE", "logs",
                "logs.tail must be a list of strings",
            ))
        else:
            log_tail = [str(line) for line in logs_obj["tail"]]

    # status 가 없거나 root 가 잘못되면 여기서 멈춘다.
    if any(e["code"] in ("MISSING_FIELD", "INVALID_INPUT", "INVALID_TYPE")
           and e["field"] in ("status", "<root>", "error")
           for e in errors):
        return Explanation(ok=False, warnings=warnings, errors=errors)

    # --- 메시지 합성 (canonical 메시지 테이블) ---
    # Legacy forward-mapping: TEST_READY ↔ TEST_SUCCESS (test 단계 성공),
    # CLAIMED ↔ QUEUED (서버가 빌드를 잡았고 큐에 남아있음), 나머지 그대로.
    canonical_status = (
        status if status in BUILD_STATUSES else (
            "TEST_SUCCESS" if status == "TEST_SUCCESS" else
            "QUEUED" if status == "PREPARING_SOURCE" else
            status
        )
    )
    system_payload: dict[str, Any] = {
        "status": canonical_status,
        "phase": phase,
        "test": test_execution,
    }
    agent_msg = _AGENT_MSG_BY_BUILD_STATUS.get(
        canonical_status,
        _AGENT_MSG_BY_BUILD_STATUS.get(
            canonical_status, f"알 수 없는 build status 입니다: {status}"
        ),
    ) if canonical_status in _AGENT_MSG_BY_BUILD_STATUS else (
        _AGENT_MSG_BY_BUILD_STATUS.get(status, f"알 수 없는 build status 입니다: {status!r}")
        if status else "build status 가 비어 있습니다."
    )
    user_msg = _USER_MSG_BY_BUILD_STATUS.get(canonical_status) or (
        _USER_MSG_BY_BUILD_STATUS.get(status, f"현재 상태를 해석할 수 없어요 (status={status!r}).")
        if status else "현재 build 상태를 알 수 없어요."
    )

    # Canonical `TESTING` + test.status=IN_PROGRESS → 더 구체적인 user 메시지.
    if canonical_status == "TESTING" and test_execution == "IN_PROGRESS":
        user_msg = _user_msg_for_test_testing()

    # canonical `TEST_SUCCESS` → test 완료 알림.
    if canonical_status == "TEST_SUCCESS":
        test_runtime_url = _resolve_test_runtime_url(build_summary, test_block)
        if test_execution in ("SUCCESS", None):
            user_msg = _user_msg_for_test_ready(test_runtime_url)

    # canonical `DEPLOY_SUCCESS` or `COMPLETED` → 결과 전달 직전 안내.
    next_action = _next_action_for_build_status(canonical_status, test_execution)
    error_summary: str | None = None

    # canonical COMPLETED + test.status == SKIPPED|FAILED → TTL 만료 또는
    # 실패. legacy preview-era 의 EXPIRED/STOPPED 의미가 SKIPPED 에 흡수됨.
    if canonical_status == "COMPLETED" and test_execution in ("SKIPPED", "FAILED"):
        next_action = "RETRY"
        error_summary = _error_summary_from_logs(log_tail) or None
        user_msg = _user_msg_for_test_expired_or_failed()

    if canonical_status == "TEST_SUCCESS" and test_execution == "FAILED":
        # test 단계에서 실패 → 메시지 덮어쓰기.
        user_msg = _user_msg_for_test_expired_or_failed()
        next_action = _next_action_for_error_code(error_code) if error_code else "RETRY"
        error_summary = _error_summary_from_logs(log_tail) or None

    if canonical_status == "FAILED":
        next_action = _next_action_for_error_code(error_code) if error_code else "CONTACT_OPERATOR"
        error_summary = _error_summary_from_logs(log_tail) or None
        if error_code == "DOCKER_BUILD_FAILED":
            user_msg = "이미지 빌드가 실패했어요. Dockerfile 의 베이스 이미지 / 빌드 단계를 확인해 주세요."
        elif error_code == "PREVIEW_PROVISION_FAILED":
            user_msg = "테스트 환경 준비에 실패했어요. 앱이 실제로 듣는 포트와 의존성을 확인해 주세요."
        elif error_code == "INVALID_REQUEST":
            user_msg = "요청에 잘못된 값이 있어요. 입력 필드를 다시 확인해 주세요."
        elif error_code in ("BUILD_NOT_FOUND", "LOGS_NOT_FOUND"):
            user_msg = "내부 식별자 문제로 빌드를 찾지 못했어요. 새 빌드를 요청해 주세요."
        elif error_code == "QUEUE_CLAIM_FAILED":
            user_msg = "빌드 큐에서 빌드를 가져오지 못했어요. 잠시 후 다시 시도해 주세요."
        elif error_code == "UNKNOWN_ERROR":
            user_msg = "내부 오류가 발생했어요. 운영팀에 문의해 주세요."

    # 최종: 알려지지 않은 status 는 ok=false, next_action=NONE.
    ok = len(errors) == 0
    if status and status not in BUILD_STATUSES:
        next_action = "NONE"
        ok = False
    if next_action not in NEXT_ACTIONS:
        next_action = "NONE"
        ok = False

    is_terminal = canonical_status in TERMINAL_BUILD_STATUSES

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
