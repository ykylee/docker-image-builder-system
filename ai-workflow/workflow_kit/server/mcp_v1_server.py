# standard-ai-workflow-kit: v1.0.0-beta

"""Official MCP SDK server wrapper (mcp 1.x / 2.x 양쪽 지원).

mcp 2.0.0 이 `mcp.server.fastmcp` 모듈 자체를 없애고 `mcp.server.mcpserver.MCPServer`
로 옮겼다. 단일 이름에만 의존하면 SDK 를 올리는 순간 `HAS_FASTMCP=False` → `sys.exit(1)`
로 조용히 죽는다 (2026-07-29 실측). 그래서 **두 이름을 모두 시도하고, 어느 쪽이 잡혔는지
`MCP_SERVER_SOURCE` 에 남긴다** — 어느 구현으로 돌고 있는지가 진단에 필요하다.

두 클래스의 계약은 이 wrapper 가 쓰는 범위에서 동일함을 실측으로 확인했다 (1.29.0 / 2.0.0):

- ``__init__``  : 첫 위치 인자가 ``name``
- ``.tool()``   : ``name`` / ``description`` 키워드를 받고, 함수를 그대로 돌려주는
                  decorator 를 반환 (1.x ``Callable[[AnyFunction], AnyFunction]`` /
                  2.x ``Callable[[_CallableT], _CallableT]``)
- ``.run()``    : 인자 없이 부르면 양쪽 다 stdio transport

차이가 있어 **일부러 쓰지 않는** 것: 2.x ``MCPServer`` 는 ``version`` 키워드를 받지만
1.x ``FastMCP`` 는 받지 않는다. 이 wrapper 의 ``version`` 은 예전부터 서버에 전달되지 않고
있었고, 여기서 전달하기 시작하면 두 서버가 광고하는 version 이 바뀐다 — 이관 범위 밖이라
기존 동작을 유지한다.
"""

from __future__ import annotations

import sys
from typing import Any, Callable, cast

# import 순서는 신순(新順) — 새 SDK 를 쓰는 환경이 구 경로를 먼저 더듬지 않게 한다.
_MCP_SERVER_FACTORY: Any = None
MCP_SERVER_SOURCE: str | None = None

try:  # mcp >= 2.0
    from mcp.server.mcpserver import MCPServer as _MCPServerV2

    _MCP_SERVER_FACTORY = _MCPServerV2
    MCP_SERVER_SOURCE = "mcp.server.mcpserver.MCPServer"
except ImportError:
    try:  # mcp 1.x
        from mcp.server.fastmcp import FastMCP as _FastMCPV1

        _MCP_SERVER_FACTORY = _FastMCPV1
        MCP_SERVER_SOURCE = "mcp.server.fastmcp.FastMCP"
    except ImportError:
        _MCP_SERVER_FACTORY = None
        MCP_SERVER_SOURCE = None

HAS_MCP_SERVER = _MCP_SERVER_FACTORY is not None
# 하위 호환 별칭. 이름이 `fastmcp` 를 가리키지만 판정은 "SDK 서버 구현이 있는가" 다.
HAS_FASTMCP = HAS_MCP_SERVER


class WorkflowMCPv1Server:
    """Wrapper for the official MCP server implementation."""

    def __init__(self, name: str, version: str = "1.0.0"):
        if not HAS_MCP_SERVER:
            print(
                "Error: 'mcp' SDK not installed (mcp.server.mcpserver / mcp.server.fastmcp "
                "둘 다 import 실패). Run 'pip install mcp' to use MCP server features.",
                file=sys.stderr,
            )
            sys.exit(1)

        self.mcp: Any = _MCP_SERVER_FACTORY(name)

    def tool(self, name: str | None = None, description: str | None = None) -> Callable[..., Any]:
        """Decorator to register a tool."""
        # `self.mcp` 는 어느 SDK 가 잡혔는지에 따라 달라져 Any 다. 선언한 계약으로 좁혀
        # 돌려준다 — 두 구현 모두 "함수를 그대로 돌려주는 decorator" 라 이 widening 은 안전하다.
        return cast(Callable[..., Any], self.mcp.tool(name=name, description=description))

    def run(self) -> None:
        """Run the server over stdio."""
        self.mcp.run()


def create_v1_server(name: str, version: str) -> WorkflowMCPv1Server:
    """Factory function for MCP servers."""
    return WorkflowMCPv1Server(name, version=version)
