"""failure-summary-shaper skill.

See SKILL.md in this directory for the input/output contract and behaviour.
"""

from .core import shape, FailureSummary

__all__ = ["shape", "FailureSummary"]
__version__ = "0.1.0"
