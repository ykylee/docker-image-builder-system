"""build-log-tail MCP.

See MCP.md in this directory for the input/output contract and behaviour.
"""

from .core import tail, TailResult  # noqa: F401

__all__ = ["tail", "TailResult"]
__version__ = "0.1.0"
