# standard-ai-workflow-kit: v1.0.0-beta

#!/usr/bin/env python3
"""Optional official MCP Python SDK stdio server candidate for the read-only bundle."""

from __future__ import annotations

import argparse
import asyncio
import importlib
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import cast, Any

REPO_ROOT = Path(__file__).resolve().parents[3]
SOURCE_ROOT = REPO_ROOT / "workflow-source"
if str(SOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(SOURCE_ROOT))

from workflow_kit import __version__ as TOOL_VERSION
from workflow_kit.common.optional_deps import optional_dependency_for
from workflow_kit.server.read_only_entrypoint import invoke_tool
from workflow_kit.server.read_only_registry import READ_ONLY_SERVER_NAME, build_transport_tool_descriptors


# import 대상의 정본은 `common/optional_deps.py` 다 (TASK-2026-07-29-main-002).
# 여기에 복제해 두면 갈라진다 — 실제로 mcp 2.0.0 이 이름을 옮겼을 때 이 목록은
# 아무것도 몰랐다. 이 모듈이 **직접 import 하는** required 목록만 가져온다
# (alternative 묶음은 `mcp_v1_server.py` 쪽 관심사다).
_MCP_SDK_DEPENDENCY = optional_dependency_for("mcp-sdk")
SDK_IMPORT_TARGETS = _MCP_SDK_DEPENDENCY.required_modules if _MCP_SDK_DEPENDENCY else ()


@dataclass(frozen=True)
class OfficialSdkModules:
    types: Any
    stdio: Any
    lowlevel: Any
    models: Any


def _import_sdk_modules() -> OfficialSdkModules:
    return OfficialSdkModules(
        types=importlib.import_module("mcp.types"),
        stdio=importlib.import_module("mcp.server.stdio"),
        lowlevel=importlib.import_module("mcp.server.lowlevel"),
        models=importlib.import_module("mcp.server.models"),
    )


def sdk_runtime_status() -> dict[str, object]:
    """stdio-sdk server 의 runtime status + descriptor 정합 검증.

    v0.11.25 cycle 의 fix: sdk_available=True 일 때 transport_ready=True advertise
    (이전 experimental 박힘 상태 → stable 전환). mcp 1.27.0 의 CallToolResult(_meta=...,
    structuredContent=...) API 정합 (가설 A 의 *historical* 원인 — 구 SDK 의 kwarg 미지원 —
    해소 확인).
    """
    missing_modules: list[str] = []
    resolved_modules: dict[str, str] = {}
    for module_name in SDK_IMPORT_TARGETS:
        try:
            module = importlib.import_module(module_name)
        except ModuleNotFoundError:
            missing_modules.append(module_name)
            continue
        module_path = getattr(module, "__file__", None)
        resolved_modules[module_name] = module_path or "<namespace>"

    descriptors = build_transport_tool_descriptors()
    sdk_available = not missing_modules
    return {
        "status": "ok",
        "server_name": READ_ONLY_SERVER_NAME,
        "tool_version": TOOL_VERSION,
        "transport_ready": sdk_available,
        "sdk_candidate_phase": (
            "official_sdk_stable" if sdk_available
            else "official_sdk_optional_candidate"
        ),
        "sdk_available": sdk_available,
        "sdk_import_targets": list(SDK_IMPORT_TARGETS),
        "missing_modules": missing_modules,
        "resolved_modules": resolved_modules,
        "tool_count": descriptors["tool_count"],
        "descriptor_target": descriptors["descriptor_target"],
        "candidate_module": "workflow_kit.server.read_only_mcp_sdk",
    }


def _text_content_from_payload(sdk_types: Any, name: str, payload: dict[str, Any]) -> Any:
    text_representation: str
    if name == "smart_context_reader" and "extracted_content" in payload:
        text_representation = "\n\n".join(payload["extracted_content"])
    else:
        text_representation = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    return sdk_types.TextContent(type="text", text=text_representation)


def _call_tool_result_for_payload(
    sdk_types: Any, name: str, payload: dict[str, Any], *, force_error: bool = False
) -> Any:
    # camelCase kwarg 를 계속 쓴다. mcp 2.0.0 이 field 를 snake_case 로 바꿨지만
    # (`isError` → `is_error`, `structuredContent` → `structured_content`) alias 로
    # 양쪽을 받는다 (`populate_by_name` + camel alias generator, 실측). 여기서
    # 갈라 쓰면 버전 분기가 하나 더 생긴다.
    #
    # `isError` 는 **생성 시점에** 정한다. 예전에는 호출부가 `result.isError = True`
    # 로 나중에 덮었는데, 2.0.0 에서 그 이름의 attribute 는 `is_error` 라 대입이
    # 조용히 빗나간다 — 실패한 tool 호출이 성공으로 보고될 자리였다.
    return sdk_types.CallToolResult(
        content=[_text_content_from_payload(sdk_types, name, payload)],
        structuredContent=payload,
        isError=force_error or payload.get("status") == "error",
        _meta={
            "transport_ready": False,
            "sdk_candidate_phase": "official_sdk_optional_candidate",
            "tool": name,
        },
    )


def _invoke_and_wrap(sdk_types: Any, name: str, arguments: dict[str, Any] | None) -> Any:
    """tool 호출 → CallToolResult. 1.x/2.x 공용 본문."""
    returncode, payload = invoke_tool(name, json.dumps(arguments or {}, ensure_ascii=False))
    return _call_tool_result_for_payload(sdk_types, name, payload, force_error=returncode != 0)


def _tool_models(sdk: OfficialSdkModules) -> list[Any]:
    descriptors = build_transport_tool_descriptors()
    # descriptors type 이 dict[str, object] → .get("tools") object 명시적 narrow
    tools_list = (
        cast("list[object]", descriptors.get("tools", []))
        if isinstance(descriptors.get("tools"), list)
        else []
    )
    return [
        sdk.types.Tool(
            name=cast("dict[str, object]", descriptor)["name"],
            description=cast("dict[str, object]", descriptor)["description"],
            inputSchema=cast("dict[str, object]", descriptor)["inputSchema"],
            outputSchema=cast("dict[str, object]", descriptor)["outputSchema"],
            annotations=cast("dict[str, object]", descriptor)["annotations"],
        )
        for descriptor in tools_list
    ]


def uses_handler_registration(server: Any) -> bool:
    """이 SDK 가 handler 등록형(mcp >= 2.0)인가, decorator 형(1.x)인가.

    버전 문자열이 아니라 **계약의 존재**로 가른다 — 버전 비교는 fork/backport 에서
    틀리고, 여기서 알고 싶은 것은 "`add_request_handler` 가 있는가" 하나다.
    """
    return hasattr(server, "add_request_handler")


def build_lowlevel_server() -> Any:
    """1.x decorator 형과 2.x handler 등록형을 모두 조립한다.

    mcp 2.0.0 이 `Server` 의 `list_tools` / `call_tool` decorator 를 없애고
    `add_request_handler(method, params_type, handler)` 로 바꿨다. decorator 만 알던
    코드는 그 환경에서 `AttributeError: 'Server' object has no attribute 'list_tools'`
    로 죽는다 — 이 파손은 `mcp-inspector` workflow 만 잡고, 그 workflow 는
    `server/**` 가 바뀔 때만 돈다.

    handler 계약 (2.x, SDK 소스 실측):
      - `on_list_tools(ctx, params) -> types.ListToolsResult`
      - `on_call_tool(ctx, params)  -> types.CallToolResult`
      - method/params_type 쌍: `("tools/list", PaginatedRequestParams)`,
        `("tools/call", CallToolRequestParams)`
    """
    sdk = _import_sdk_modules()
    server = sdk.lowlevel.Server(READ_ONLY_SERVER_NAME)
    tools = _tool_models(sdk)

    if uses_handler_registration(server):  # mcp >= 2.0
        async def on_list_tools(ctx: Any, params: Any) -> Any:
            return sdk.types.ListToolsResult(tools=tools)

        async def on_call_tool(ctx: Any, params: Any) -> Any:
            # 1.x 는 (name, arguments) 를 풀어서 줬고, 2.x 는 params 객체로 준다.
            return _invoke_and_wrap(sdk.types, params.name, getattr(params, "arguments", None))

        server.add_request_handler("tools/list", sdk.types.PaginatedRequestParams, on_list_tools)
        server.add_request_handler("tools/call", sdk.types.CallToolRequestParams, on_call_tool)
        return server

    # mcp 1.x — decorator 형
    @server.list_tools()  # type: ignore[untyped-decorator]
    async def list_tools() -> list[Any]:
        return tools

    @server.call_tool(validate_input=False)  # type: ignore[untyped-decorator]
    async def call_tool(name: str, arguments: dict[str, Any]) -> Any:
        return _invoke_and_wrap(sdk.types, name, arguments)

    return server


async def run_stdio_server() -> None:
    sdk = _import_sdk_modules()
    server = build_lowlevel_server()
    async with sdk.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            sdk.models.InitializationOptions(
                server_name=READ_ONLY_SERVER_NAME,
                server_version=TOOL_VERSION,
                capabilities=server.get_capabilities(
                    notification_options=sdk.lowlevel.NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Optional official MCP Python SDK stdio server candidate.")
    parser.add_argument(
        "--print-sdk-runtime",
        action="store_true",
        help="Print SDK availability/runtime metadata as JSON.",
    )
    parser.add_argument(
        "--stdio-sdk",
        action="store_true",
        help="Run the official MCP Python SDK stdio server when the SDK is installed.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.print_sdk_runtime:
        print(json.dumps(sdk_runtime_status(), ensure_ascii=False, indent=2, sort_keys=True))
        return 0
    if args.stdio_sdk:
        status = sdk_runtime_status()
        if not status["sdk_available"]:
            print(
                json.dumps(
                    {
                        "status": "error",
                        "error_code": "missing_official_mcp_sdk",
                        "error": "Official MCP Python SDK is not installed in this environment.",
                        "source_context": status,
                    },
                    ensure_ascii=False,
                    indent=2,
                    sort_keys=True,
                )
            )
            return 1
        asyncio.run(run_stdio_server())
        return 0

    print(
        json.dumps(
            {
                "status": "error",
                "error_code": "missing_sdk_action",
                "error": "--print-sdk-runtime or --stdio-sdk is required",
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
