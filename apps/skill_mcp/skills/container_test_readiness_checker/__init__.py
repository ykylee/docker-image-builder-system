"""container-test-readiness-checker skill.

See SKILL.md in this directory for the input/output contract and behaviour.
"""

from .core import check_readiness, ReadinessCard, ReadinessResult

__all__ = ["check_readiness", "ReadinessCard", "ReadinessResult"]
__version__ = "0.1.0"
