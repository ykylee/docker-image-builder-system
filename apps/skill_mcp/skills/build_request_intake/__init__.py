"""build-request-intake skill.

See SKILL.md in this directory for the input/output contract and behaviour.
"""

from .core import shape, ShapeResult  # noqa: F401

__all__ = ["shape", "ShapeResult"]
__version__ = "0.1.0"
