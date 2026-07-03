"""latest-build-status MCP.

See MCP.md in this directory for the input/output contract and behaviour.
"""

from .core import fetch_latest, LatestBuildResult  # noqa: F401

__all__ = ["fetch_latest", "LatestBuildResult"]
__version__ = "0.1.0"
