"""latest-build-status core.

`fetch_latest(input_data)` 가 Build Server 에서 build 상태를 조회하고
`build_status_explainer.explain()` 로 메시지 변환까지 수행한다.

자세한 동작 규칙은 같은 디렉터리의 MCP.md §3 을 따른다.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlencode

from apps.skill_mcp.contract import canonical as C
from apps.skill_mcp.skills.build_status_explainer import (
    Explanation,
    explain as explain_status,
)

MCP_VERSION = "v2"
DEFAULT_TIMEOUT_SECONDS = 5.0

# Build Server 응답의 canonical top-level keys (BuildStatusResponse).
# 정규화 후 보존할 키. canonical `BuildStatusResponse` 는 `build` 요약과
# 그 **형제** 블록(`test` / `deploy` / `lastError` / `lifecycle` /
# `resultDelivery` / `currentPhase`)으로 구성되므로, 둘을 한 dict 으로 합친
# 뒤 이 목록으로 거른다.
#
# TASK-163 (P2-M4): `runtimeUrl` 추가. 이 키가 목록에 없어서 컨테이너가 실제로
# 어디서 돌고 있는지를 MCP 소비자가 **영영 볼 수 없었다**(preview-era 의
# `previewUrl` 도 마찬가지로 빠져 있었다).
_BUILD_TOP_KEYS = (
    "buildId",
    "userId",
    "appName",
    "status",
    "currentPhase",
    "runtimeUrl",
    "createdAt",
    "startedAt",
    "finishedAt",
    "lifecycleStatus",
    "lifecycle",
    "image",
    "test",
    "deploy",
    "resultDelivery",
    "lastError",
)

# active (in-flight) build status — canonical 7종 + legacy forward-compat 2종.
# explain_status 의 분류 분기와 같은 canonical contract 을 따른다.
_ACTIVE_BUILD_STATUSES: frozenset[str] = frozenset(
    {
        # canonical in-flight statuses
        "RECEIVED",
        "QUEUED",
        "PREPARING_SOURCE",
        "BUILDING",
        "BUILD_SUCCESS",
        "TESTING",
        "TEST_SUCCESS",
        "DEPLOYING",
        "DEPLOY_SUCCESS",
        # legacy adapter statuses (forward-compat shim during migration window)
        "PREPARING_SOURCE",
        "TEST_SUCCESS",
    }
)

_TERMINAL_BUILD_STATUSES: frozenset[str] = frozenset(
    {
        # canonical terminal
        "COMPLETED",
        "FAILED",
        "CANCELLED",
    }
)

# build.status 값 중 active / terminal 어느 쪽에도 못 들어가는 경우 canonical
# 이 아닌 다른 status 로 정렬 fallback. canonical + legacy 합집합.
_CANONICAL_OR_LEGACY_STATUSES: frozenset[str] = frozenset(
    C.CANONICAL_BUILD_STATUSES
)

# TASK-163 (P2-M4): preview-era forward-map 제거.
#
# 여기에는 backend 가 `testDeployment` / `previewUrl` / preview 상태 어휘를
# 보내던 시절의 정규화가 있었다. P2-M1~M3 을 거치며 그 형태를 만들어내는
# 쪽이 전부 사라졌다 — 계약에서 `previewStatuses` 와 `TestDeployment` DTO 가
# 빠졌고, 엔드포인트는 `/container-test/*` 로 재설계됐고, runner 는 canonical
# ExecutionStatus 만 보낸다. 남은 정규화는 envelope 이전 형태의 top-level
# `error` → `lastError` 하나뿐이다.
def _normalize_legacy_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """envelope 이전 형태를 canonical 로 정규화.

    현재 유일한 대상은 top-level `error` → `lastError` 다. explain() 은
    항상 canonical payload 만 보도록 이 단계에서 형태를 맞춘다.
    """
    if not isinstance(payload, dict):
        return {}
    out = dict(payload)
    if "error" in out and "lastError" not in out:
        legacy_err = out.pop("error")
        if isinstance(legacy_err, dict):
            out["lastError"] = legacy_err
    return out


def _resolve_status(build: dict[str, Any]) -> str | None:
    """Build 객체에서 canonical status 값을 추출. legacy adapter 도 포함."""
    if not isinstance(build, dict):
        return None
    raw = build.get("status") or build.get("lifecycleStatus")
    if not isinstance(raw, str):
        return None
    if raw in _CANONICAL_OR_LEGACY_STATUSES:
        return raw
    return raw  # unknown — caller 가 warning 으로 노출


def _is_active(status: str | None) -> bool:
    return status is not None and status in _ACTIVE_BUILD_STATUSES


@dataclass
class LatestBuildResult:
    """fetch_latest() 의 반환값."""

    ok: bool
    build: dict[str, Any] | None = None
    explanation: dict[str, Any] | None = None
    warnings: list[dict[str, str]] = field(default_factory=list)
    errors: list[dict[str, str]] = field(default_factory=list)
    mcp_version: str = MCP_VERSION

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "ok": self.ok,
            "build": self.build,
            "explanation": self.explanation,
            "warnings": list(self.warnings),
            "errors": list(self.errors),
            "ref": {
                "contract_doc": "docs/sdlc/contracts/01-shared-build-contract-baseline.md",
                "design_doc": "docs/sdlc/design/06-user-messaging-and-failure-handling.md",
                "mcp_version": self.mcp_version,
            },
        }
        return out


def _err(code: str, field_name: str, message: str) -> dict[str, str]:
    return {"code": code, "field": field_name, "message": message}


def _normalize_build(payload: Any) -> dict[str, Any] | None:
    """Build Server 응답을 canonical build dict 로 정규화한다.

    - 전송 envelope(`data` / `result` / `payload`)로 감싸여 있으면 unwrap.
    - canonical `BuildStatusResponse`(`build` 요약 + 형제 블록)면 **합친다**.
    - `_BUILD_TOP_KEYS` 에 있는 키만 보존.
    - envelope 이전의 top-level `error` 는 canonical `lastError` 로 정규화.

    TASK-163 (P2-M4) 결함 수정 — 이전 구현은 `build` 를 다른 전송 envelope 과
    같이 취급해 **unwrap** 했다. 그 결과 canonical 응답에서 `build` 형제인
    `test` / `deploy` / `lastError` / `lifecycle` / `resultDelivery` /
    `currentPhase` 가 **전부 사라졌다** — MCP 소비자(AI 에이전트)는 빌드
    요약만 받고 컨테이너 테스트 결과도, 실패 이유도 볼 수 없었다.
    단위 테스트는 이미 평평한 fixture 를 넣고 있어 이 손실을 드러내지 못했고,
    실서버 검증(`apps/skill_mcp/scripts/verify-live-server.sh`)에서 잡혔다.
    """
    if payload is None:
        return None
    if not isinstance(payload, dict):
        return None
    # 순수 전송 envelope 만 unwrap 한다. `build` 는 canonical 응답의 한 필드지
    # envelope 이 아니다.
    for wrap_key in ("data", "result", "payload"):
        if wrap_key in payload and isinstance(payload[wrap_key], dict):
            payload = payload[wrap_key]
            break
    payload = _normalize_legacy_payload(payload)

    # canonical BuildStatusResponse: 요약과 형제 블록을 한 dict 으로 합친다.
    # 같은 키가 양쪽에 있으면 형제(바깥) 쪽이 더 구체적이므로 그쪽을 남긴다.
    merged: dict[str, Any] = {}
    inner = payload.get("build")
    if isinstance(inner, dict):
        merged.update(inner)
    merged.update({k: v for k, v in payload.items() if k != "build"})

    normalized: dict[str, Any] = {}
    for key in _BUILD_TOP_KEYS:
        if key in merged:
            normalized[key] = merged[key]
    return normalized


def _pick_latest_build(
    builds: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """`GET /builds?userId=...&appName=...` 응답에서 latest build 한 건을 선택.

    우선순위: active build 중 가장 최근 → 모두 terminal 이면 가장 최근 terminal.
    build 식별자는 `createdAt`/`startedAt`/`buildId` 순으로 비교한다.
    """
    if not builds:
        return None

    def _key(b: dict[str, Any]) -> tuple[int, str]:
        ts = b.get("createdAt") or b.get("startedAt") or ""
        # 정렬 안정성: timestamp 가 빈 값이면 buildId 의 사전식 비교로 fallback.
        return (1 if ts else 0, ts + b.get("buildId", ""))

    def _status(b: dict[str, Any]) -> str | None:
        return _resolve_status(b)

    active = [b for b in builds if _is_active(_status(b))]
    if active:
        return sorted(active, key=_key, reverse=True)[0]
    terminal = [b for b in builds if _status(b) in _TERMINAL_BUILD_STATUSES]
    if terminal:
        return sorted(terminal, key=_key, reverse=True)[0]
    # 알 수 없는 status 만 있을 때 — 가장 최근 1건 그대로 반환
    return sorted(builds, key=_key, reverse=True)[0]


def _http_get(url: str, timeout: float) -> tuple[int, Any]:
    """urllib 으로 GET 호출. (status_code, parsed_json_or_text) 반환.

    JSON 이 아니면 text 그대로 반환.
    """
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
        status = resp.getcode()
        body = resp.read()
    try:
        parsed = json.loads(body.decode("utf-8")) if body else None
    except (UnicodeDecodeError, json.JSONDecodeError):
        parsed = body.decode("utf-8", errors="replace")
    return status, parsed


def fetch_latest(input_data: Any) -> LatestBuildResult:
    """Build Server 에서 latest build 상태를 조회하고 explain() 까지 묶는다."""
    warnings: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []

    if not isinstance(input_data, dict):
        return LatestBuildResult(
            ok=False,
            errors=[_err("INVALID_INPUT", "<root>", "input must be a JSON object")],
        )

    user_id = input_data.get("userId")
    app_name = input_data.get("appName")
    build_id = input_data.get("buildId")
    base_url = (
        input_data.get("buildServerUrl")
        or os.environ.get("LATEST_BUILD_STATUS_DEFAULT_BASE_URL")
        or ""
    ).rstrip("/")
    dry_run = bool(input_data.get("dryRun"))
    fixture = input_data.get("fixture")
    timeout = float(input_data.get("timeoutSeconds") or DEFAULT_TIMEOUT_SECONDS)

    if not build_id and not (user_id and app_name):
        errors.append(_err(
            "MISSING_FIELD", "<root>",
            "either buildId or (userId + appName) is required",
        ))
    if not base_url and not dry_run:
        errors.append(_err(
            "MISSING_FIELD", "buildServerUrl",
            "buildServerUrl is required when dryRun is false",
        ))

    if errors:
        return LatestBuildResult(ok=False, errors=errors)

    # --- fetch ---
    raw_payload: Any = None
    if dry_run:
        if isinstance(fixture, list):
            # 목록 endpoint 형태 (buildId 없이 userId+appName 으로 호출한 결과 가정).
            raw_payload = fixture
        elif isinstance(fixture, dict):
            # 단건 build (buildId 호출) 또는 wrapped list `{ "builds": [...] }`.
            if "builds" in fixture and isinstance(fixture["builds"], list):
                raw_payload = fixture
            else:
                raw_payload = fixture
        else:
            errors.append(_err(
                "INVALID_INPUT", "fixture",
                "fixture must be a JSON object or list when dryRun is true",
            ))
            return LatestBuildResult(ok=False, errors=errors)
    else:
        try:
            if build_id:
                url = f"{base_url}/builds/{build_id}"
                status, body = _http_get(url, timeout)
                if status == 404:
                    return LatestBuildResult(
                        ok=False,
                        errors=[_err("BUILD_NOT_FOUND", "buildId", f"build not found: {build_id}")],
                    )
                if status >= 400:
                    return LatestBuildResult(
                        ok=False,
                        errors=[_err(
                            "BUILD_SERVER_ERROR", "buildServerUrl",
                            f"build server returned HTTP {status}",
                        )],
                    )
                raw_payload = body
            else:
                qs = urlencode({"userId": user_id, "appName": app_name})
                url = f"{base_url}/builds?{qs}"
                status, body = _http_get(url, timeout)
                if status >= 400:
                    return LatestBuildResult(
                        ok=False,
                        errors=[_err(
                            "BUILD_SERVER_ERROR", "buildServerUrl",
                            f"build server returned HTTP {status}",
                        )],
                    )
                # 목록 응답 가정: dict { builds: [...] } 또는 list 직접.
                if isinstance(body, dict) and isinstance(body.get("builds"), list):
                    raw_payload = body["builds"]
                elif isinstance(body, list):
                    raw_payload = body
                else:
                    warnings.append(_err(
                        "UNEXPECTED_LIST_RESPONSE", "buildServerUrl",
                        "list endpoint did not return builds array; expected list or {builds:[...]}",
                    ))
                    raw_payload = []
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            return LatestBuildResult(
                ok=False,
                errors=[_err("BUILD_SERVER_UNREACHABLE", "buildServerUrl", str(exc))],
            )

    # --- pick + normalize ---
    if build_id:
        if isinstance(raw_payload, list):
            # buildId + dry-run + list fixture 는 잘못된 호출.
            errors.append(_err(
                "INVALID_INPUT", "buildId",
                "buildId 는 단건 build fixture 와 함께 주어져야 합니다 (list 아님)",
            ))
            return LatestBuildResult(ok=False, errors=errors)
        build = _normalize_build(raw_payload)
        if not build:
            errors.append(_err(
                "INVALID_BUILD_RESPONSE", "build",
                "build response was not a JSON object",
            ))
            return LatestBuildResult(ok=False, errors=errors)
    else:
        # raw_payload 가 wrapped list `{ "builds": [...] }` 이면 unwrap.
        if isinstance(raw_payload, dict) and isinstance(raw_payload.get("builds"), list):
            raw_payload = raw_payload["builds"]
        if not isinstance(raw_payload, list):
            errors.append(_err(
                "INVALID_BUILD_RESPONSE", "builds",
                "list response was not a JSON array",
            ))
            return LatestBuildResult(ok=False, errors=errors)
        normalized_list = [b for b in (_normalize_build(item) for item in raw_payload) if b]
        if not normalized_list:
            return LatestBuildResult(
                ok=False,
                errors=[_err("BUILD_NOT_FOUND", "build", "no build for given userId + appName")],
            )
        build = _pick_latest_build(normalized_list)
        if build is None:
            return LatestBuildResult(
                ok=False,
                errors=[_err("BUILD_NOT_FOUND", "build", "no build for given userId + appName")],
            )

    # --- explain 위임 ---
    expl: Explanation = explain_status(build)
    return LatestBuildResult(
        ok=expl.ok and len(errors) == 0,
        build=build,
        explanation=expl.explanation,
        warnings=list(warnings) + list(expl.warnings),
        errors=list(errors) + list(expl.errors),
    )
