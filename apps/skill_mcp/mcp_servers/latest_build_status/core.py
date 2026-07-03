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

from apps.skill_mcp.skills.build_status_explainer import (
    Explanation,
    explain as explain_status,
)

MCP_VERSION = "v1"
DEFAULT_TIMEOUT_SECONDS = 5.0

# Build Server 응답의 canonical top-level keys (canonical contract §9).
# 시간 키 (`createdAt` / `startedAt` / `finishedAt`) 도 포함하여 latest build 선택 시
# 정렬 기준으로 쓸 수 있도록 한다.
_BUILD_TOP_KEYS = (
    "buildId",
    "userId",
    "appName",
    "status",
    "currentPhase",
    "createdAt",
    "startedAt",
    "finishedAt",
    "image",
    "testDeployment",
    "error",
)

# active build status 집합 — explain_status.BUILD_STATUSES 와 동기화되어야 하지만
# 본 MCP 의 우선순위 분기에서만 쓰므로 안전하게 inline 으로 둔다.
_ACTIVE_BUILD_STATUSES = frozenset(
    {
        "QUEUED",
        "PREPARING",
        "VALIDATING",
        "BUILDING",
        "IMAGE_BUILT",
        "TEST_DEPLOYING",
        "TEST_READY",
    }
)

_TERMINAL_BUILD_STATUSES = frozenset({"COMPLETED", "FAILED", "CANCELLED"})


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

    - dict 가 `data` / `result` / `build` 키로 wrap 되어 있으면 unwrap.
    - top-level keys 중 알려진 것만 보존.
    """
    if payload is None:
        return None
    if not isinstance(payload, dict):
        return None
    for wrap_key in ("data", "result", "build", "payload"):
        if wrap_key in payload and isinstance(payload[wrap_key], dict):
            payload = payload[wrap_key]
            break
    normalized: dict[str, Any] = {}
    for key in _BUILD_TOP_KEYS:
        if key in payload:
            normalized[key] = payload[key]
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

    active = [b for b in builds if b.get("status") in _ACTIVE_BUILD_STATUSES]
    if active:
        return sorted(active, key=_key, reverse=True)[0]
    # terminal 만 있을 때
    terminal = [b for b in builds if b.get("status") in _TERMINAL_BUILD_STATUSES]
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
