"""failure-summary MCP.

See MCP.md in this directory for the input/output contract and behaviour.
"""

from .core import summarize, FailureSummaryResult

__all__ = ["summarize", "FailureSummaryResult"]
__version__ = "0.1.0"
