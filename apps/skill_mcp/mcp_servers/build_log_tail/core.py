"""build-log-tail core.

`tail(input_data)` 가 Build Server `GET /builds/{buildId}/logs` endpoint 를 호출하고
last N lines 또는 since-cursor 기반 incremental tail 을 반환한다.

자세한 동작 규칙은 같은 디렉터리의 MCP.md §3 을 따른다.
"""

from __future__ import annotations

import hashlib
import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlencode
from urllib.parse import quote as _url_quote

MCP_VERSION = "v1"
DEFAULT_TIMEOUT_SECONDS = 5.0
DEFAULT_TAIL = 200
MAX_TAIL = 5000


@dataclass
class TailResult:
    """tail() 의 반환값."""

    ok: bool
    lines: list[str] = field(default_factory=list)
    next_since: str | None = None
    truncated: bool = False
    total_returned: int = 0
    warnings: list[dict[str, str]] = field(default_factory=list)
    errors: list[dict[str, str]] = field(default_factory=list)
    mcp_version: str = MCP_VERSION

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "lines": list(self.lines),
            "next_since": self.next_since,
            "truncated": self.truncated,
            "total_returned": self.total_returned,
            "warnings": list(self.warnings),
            "errors": list(self.errors),
            "ref": {
                "contract_doc": "docs/sdlc/contracts/01-shared-build-contract-baseline.md",
                "mcp_version": self.mcp_version,
            },
        }


def _err(code: str, field_name: str, message: str) -> dict[str, str]:
    return {"code": code, "field": field_name, "message": message}


def _http_get(url: str, timeout: float) -> tuple[int, bytes]:
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
        status = resp.getcode()
        body = resp.read()
    return status, body


def _parse_log_body(body: bytes) -> tuple[list[str], str | None, bool | None]:
    """Build Server logs endpoint 응답을 (lines, next_since, truncated) 로 파싱.

    지원 형식:
    - JSON: { "lines": [...], "next_since"?: str, "truncated"?: bool }
    - JSON: top-level array ["a", "b"]
    - NDJSON: 한 줄 = 한 record (JSON object 또는 string)
    - plain text: 줄바꿈 기준 split
    """
    text = body.decode("utf-8", errors="replace").strip()
    if not text:
        return [], None, None

    # 1) JSON 시도
    if text.startswith("{") or text.startswith("["):
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, dict):
            lines_raw = parsed.get("lines")
            if isinstance(lines_raw, list):
                lines = [str(x) for x in lines_raw]
                next_since = parsed.get("next_since")
                truncated = parsed.get("truncated")
                return (
                    lines,
                    str(next_since) if isinstance(next_since, str) else None,
                    bool(truncated) if isinstance(truncated, bool) else None,
                )
        elif isinstance(parsed, list):
            return [str(x) for x in parsed], None, None

    # 2) NDJSON 시도 (각 줄이 JSON object or string)
    lines_nd: list[str] = []
    is_ndjson = False
    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        try:
            obj = json.loads(stripped)
        except json.JSONDecodeError:
            lines_nd.append(stripped)
            continue
        is_ndjson = True
        if isinstance(obj, dict):
            # { "line": "..." } 또는 { "message": "..." } 같은 형태 허용.
            for k in ("line", "message", "text", "msg"):
                if k in obj and isinstance(obj[k], str):
                    lines_nd.append(obj[k])
                    break
            else:
                lines_nd.append(json.dumps(obj, ensure_ascii=False))
        else:
            lines_nd.append(str(obj))
    if is_ndjson or lines_nd:
        return lines_nd, None, None

    # 3) plain text fallback
    return [line for line in text.split("\n") if line], None, None


def _synthesize_next_since(lines: list[str], since: str | None) -> str | None:
    """Build Server 가 next_since 를 주지 않으면 마지막 라인 + 라인 수로 opaque cursor 합성."""
    if not lines:
        return since  # 변동 없음
    last = lines[-1]
    digest = hashlib.sha1(last.encode("utf-8", errors="replace")).hexdigest()[:8]
    return f"{digest}:{len(lines)}"


def tail(input_data: Any) -> TailResult:
    """Build Server logs endpoint 의 tail / incremental slice 을 반환한다."""
    warnings: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []

    if not isinstance(input_data, dict):
        return TailResult(
            ok=False,
            errors=[_err("INVALID_INPUT", "<root>", "input must be a JSON object")],
        )

    build_id = input_data.get("buildId")
    if not isinstance(build_id, str) or not build_id.strip():
        errors.append(_err(
            "MISSING_FIELD", "buildId",
            "buildId is required and must be a non-empty string",
        ))

    tail_n_raw = input_data.get("tail", DEFAULT_TAIL)
    if isinstance(tail_n_raw, bool):
        # bool 은 int 의 서브타입 — 거부
        errors.append(_err(
            "INVALID_INPUT", "tail",
            "tail must be an integer (0..5000), not bool",
        ))
        tail_n = DEFAULT_TAIL
    elif isinstance(tail_n_raw, int):
        tail_n = tail_n_raw
    elif isinstance(tail_n_raw, str):
        try:
            tail_n = int(tail_n_raw)
        except ValueError:
            errors.append(_err(
                "INVALID_INPUT", "tail",
                f"tail must be an integer, got {tail_n_raw!r}",
            ))
            tail_n = DEFAULT_TAIL
    else:
        errors.append(_err(
            "INVALID_INPUT", "tail",
            f"tail must be an integer, got type {type(tail_n_raw).__name__}",
        ))
        tail_n = DEFAULT_TAIL

    if not (0 <= tail_n <= MAX_TAIL):
        errors.append(_err(
            "INVALID_INPUT", "tail",
            f"tail must be in 0..{MAX_TAIL}, got {tail_n}",
        ))

    since = input_data.get("since")
    if since is not None and not isinstance(since, str):
        errors.append(_err(
            "INVALID_INPUT", "since",
            "since must be a string or null",
        ))
        since = None
    if isinstance(since, str) and not since.strip():
        since = None  # 빈 문자열은 무시

    base_url = (
        input_data.get("buildServerUrl")
        or os.environ.get("LATEST_BUILD_STATUS_DEFAULT_BASE_URL")
        or ""
    ).rstrip("/")
    dry_run = bool(input_data.get("dryRun"))
    fixture = input_data.get("fixture")
    timeout = float(input_data.get("timeoutSeconds") or DEFAULT_TIMEOUT_SECONDS)

    if not base_url and not dry_run:
        errors.append(_err(
            "MISSING_FIELD", "buildServerUrl",
            "buildServerUrl is required when dryRun is false",
        ))

    # tail / since / buildId / buildServerUrl 중 하나라도 invalid 면 여기서 멈춤.
    critical = [e for e in errors if e["code"] in ("MISSING_FIELD", "INVALID_INPUT")]
    if critical:
        return TailResult(ok=False, errors=errors)

    # --- fetch ---
    lines: list[str] = []
    server_next_since: str | None = None
    server_truncated: bool | None = None

    if dry_run:
        if isinstance(fixture, list):
            lines = [str(x) for x in fixture]
        elif isinstance(fixture, str):
            # NDJSON 또는 plain text 로 간주
            fake_lines, fake_next, fake_trunc = _parse_log_body(fixture.encode("utf-8"))
            lines = fake_lines
            server_next_since = fake_next
            server_truncated = fake_trunc
        elif isinstance(fixture, dict):
            raw_lines = fixture.get("lines")
            if isinstance(raw_lines, list):
                lines = [str(x) for x in raw_lines]
            else:
                errors.append(_err(
                    "INVALID_INPUT", "fixture",
                    "fixture dict must have 'lines' as a list",
                ))
                return TailResult(ok=False, errors=errors)
            ns = fixture.get("next_since")
            if isinstance(ns, str):
                server_next_since = ns
            tr = fixture.get("truncated")
            if isinstance(tr, bool):
                server_truncated = tr
        else:
            errors.append(_err(
                "INVALID_INPUT", "fixture",
                "fixture must be list, str, or dict",
            ))
            return TailResult(ok=False, errors=errors)
    else:
        qs: dict[str, str] = {"tail": str(tail_n)}
        if since:
            qs["since"] = since
        # buildId 는 path segment 이므로 urlencode 와 별도로 escape.
        url = f"{base_url}/builds/{_url_quote(build_id, safe='')}/logs?{urlencode(qs)}"
        try:
            status, body = _http_get(url, timeout)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            return TailResult(
                ok=False,
                errors=[_err("BUILD_SERVER_UNREACHABLE", "buildServerUrl", str(exc))],
            )
        if status == 404:
            return TailResult(
                ok=False,
                errors=[_err("BUILD_NOT_FOUND", "buildId", f"build not found: {build_id}")],
            )
        if status >= 400:
            return TailResult(
                ok=False,
                errors=[_err(
                    "BUILD_SERVER_ERROR", "buildServerUrl",
                    f"build server returned HTTP {status}",
                )],
            )
        lines, server_next_since, server_truncated = _parse_log_body(body)
        # live 응답에서 next_since / truncated 가 비어있으면 합성.
        if server_next_since is None:
            server_next_since = _synthesize_next_since(lines, since)
        if server_truncated is None:
            server_truncated = tail_n > 0 and len(lines) >= tail_n

    # tail 적용: dry-run 에서 tail_n 으로 자르기.
    truncated = bool(server_truncated) if server_truncated is not None else False
    if tail_n > 0 and len(lines) > tail_n:
        lines = lines[-tail_n:]
        truncated = True
    next_since = server_next_since if server_next_since is not None else _synthesize_next_since(lines, since)

    ok = len(errors) == 0
    return TailResult(
        ok=ok,
        lines=lines,
        next_since=next_since,
        truncated=truncated,
        total_returned=len(lines),
        warnings=warnings,
        errors=errors,
    )
