"""build-request-intake core.

입력 dict 를 받아 shared contract 의 BuildRequest 정합 형태로 정규화하고,
결정적 JSON payload 와 warnings / errors 를 함께 반환한다.

자세한 동작 규칙은 같은 디렉터리의 SKILL.md §4 를 따른다.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

# canonical contract version. shared contract 가 bump 될 때 같이 올린다.
CONTRACT_VERSION = "v1"

# appName 정규식: a-z, 0-9, 하이픈, 첫 글자는 숫자 불가, 길이 1~63.
_APP_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")
_ENV_KEY_RE = re.compile(r"^[A-Z0-9_]+$")

# BuildRequest canonical key 순서.
PAYLOAD_KEY_ORDER = ("userId", "appName", "sourceRef", "env", "extra")

# BuildRequest 가 직접 다루는 canonical keys (env / extra 제외).
_CANONICAL_TOP_KEYS = ("userId", "appName", "sourceRef")


@dataclass
class ShapeResult:
    """shape() 의 반환값.

    Attributes:
        ok: errors 가 비어있는 경우에만 True.
        payload: 정규화된 BuildRequest dict (key 순서 고정).
        warnings: 사용자 노출 가능한 경고 목록.
        errors: payload 사용을 막는 오류 목록.
        contract_version: 이 결과가 따르는 canonical contract 버전.
    """

    ok: bool
    payload: dict[str, Any] = field(default_factory=dict)
    warnings: list[dict[str, str]] = field(default_factory=list)
    errors: list[dict[str, str]] = field(default_factory=list)
    contract_version: str = CONTRACT_VERSION

    def to_dict(self) -> dict[str, Any]:
        """결정적 dict 표현을 반환한다 (JSON 직렬화용)."""
        return {
            "ok": self.ok,
            "payload": self.payload,
            "warnings": list(self.warnings),
            "errors": list(self.errors),
            "ref": {
                "contract_doc": "docs/sdlc/contracts/01-shared-build-contract-baseline.md",
                "contract_version": self.contract_version,
            },
        }


def _issue(
    issues: list[dict[str, str]],
    code: str,
    field_name: str,
    message: str,
) -> None:
    issues.append({"code": code, "field": field_name, "message": message})


def _normalize_string(value: Any) -> tuple[str | None, str | None]:
    """문자열 값을 트림하고, 빈 문자열이면 None, 그 외는 트림된 문자열을 반환.

    Returns:
        (normalized, raw_or_none). 입력 자체가 None 이면 (None, None).
    """
    if value is None:
        return None, None
    if not isinstance(value, str):
        # 문자열이 아니면 호출자가 따로 INVALID_TYPE 에러로 처리한다.
        return None, None
    trimmed = value.strip()
    if not trimmed:
        return None, ""
    return trimmed, value


def shape(input_data: Any) -> ShapeResult:
    """BuildRequest payload 초안을 만든다.

    Args:
        input_data: dict (또는 JSON 호환 매핑). None / 비 dict 도 허용하되
            그 경우 errors 에 `INVALID_INPUT` 가 추가된다.

    Returns:
        ShapeResult. `result.to_dict()` 이 SKILL.md §1.2 의 출력 형태다.
    """
    warnings: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []

    if not isinstance(input_data, dict):
        _issue(
            errors,
            "INVALID_INPUT",
            "<root>",
            "input must be a JSON object",
        )
        return ShapeResult(ok=False, errors=errors)

    # 1) canonical top-level fields
    user_id, _ = _normalize_string(input_data.get("userId"))
    app_name, _ = _normalize_string(input_data.get("appName"))
    source_ref, _ = _normalize_string(input_data.get("sourceRef"))

    if user_id is None:
        # SKILL.md §4: MISSING_FIELD 는 warnings 와 errors 양쪽에 표기하여
        # payload 사용이 정당화되지 않도록 한다 (ok=false).
        _issue(
            warnings,
            "MISSING_FIELD",
            "userId",
            "userId is required by BuildRequest contract",
        )
        _issue(
            errors,
            "MISSING_FIELD",
            "userId",
            "userId is required by BuildRequest contract",
        )
    if app_name is None:
        _issue(
            warnings,
            "MISSING_FIELD",
            "appName",
            "appName is required by BuildRequest contract",
        )
        _issue(
            errors,
            "MISSING_FIELD",
            "appName",
            "appName is required by BuildRequest contract",
        )
    elif not _APP_NAME_RE.match(app_name):
        _issue(
            errors,
            "INVALID_APP_NAME",
            "appName",
            "appName must match ^[a-z0-9][a-z0-9-]{0,62}$",
        )
    if source_ref is None:
        _issue(
            warnings,
            "MISSING_FIELD",
            "sourceRef",
            "sourceRef is required by BuildRequest contract",
        )
        _issue(
            errors,
            "MISSING_FIELD",
            "sourceRef",
            "sourceRef is required by BuildRequest contract",
        )

    # 2) env 정규화
    env_value = input_data.get("env")
    env_normalized: dict[str, str] = {}
    if env_value is None:
        env_normalized = {}
    elif not isinstance(env_value, dict):
        _issue(
            errors,
            "INVALID_ENV",
            "env",
            "env must be a JSON object of string keys to string values",
        )
        env_normalized = {}
    else:
        for raw_key, raw_val in env_value.items():
            if not isinstance(raw_key, str):
                _issue(
                    warnings,
                    "INVALID_ENV_KEY",
                    f"env.{raw_key!r}",
                    "env keys must be strings",
                )
                continue
            if not _ENV_KEY_RE.match(raw_key):
                _issue(
                    warnings,
                    "INVALID_ENV_KEY",
                    f"env.{raw_key}",
                    "env key should match ^[A-Z0-9_]+$ (kept as-is for now)",
                )
            if not isinstance(raw_val, str):
                _issue(
                    warnings,
                    "INVALID_ENV_VALUE",
                    f"env.{raw_key}",
                    "env values should be strings; coerced to str()",
                )
                env_normalized[raw_key] = str(raw_val)
            else:
                env_normalized[raw_key] = raw_val

    # 3) extra (canonical 외 필드) — 알 수 없는 top-level 필드 모으기
    extra: dict[str, Any] = {}
    for key, value in input_data.items():
        if key in _CANONICAL_TOP_KEYS or key == "env":
            continue
        # null/빈 값은 굳이 extra 에 넣지 않는다.
        if value is None:
            continue
        extra[key] = value
        _issue(
            warnings,
            "UNKNOWN_FIELD",
            key,
            f"field '{key}' is not part of BuildRequest v1; moved to extra",
        )

    # 4) payload 합성 — key 순서 고정
    payload: dict[str, Any] = {}
    payload["userId"] = user_id
    payload["appName"] = app_name
    payload["sourceRef"] = source_ref
    payload["env"] = env_normalized
    if extra:
        payload["extra"] = extra

    # 5) ok 결정: errors 가 비어있을 때만 True
    ok = len(errors) == 0

    return ShapeResult(
        ok=ok,
        payload=payload,
        warnings=warnings,
        errors=errors,
        contract_version=CONTRACT_VERSION,
    )
