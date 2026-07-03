"""build-status-explainer skill.

See SKILL.md in this directory for the input/output contract and behaviour.
"""

from .core import explain, Explanation, EXPLANATION_VERSION  # noqa: F401

__all__ = ["explain", "Explanation", "EXPLANATION_VERSION"]
__version__ = "0.1.0"
