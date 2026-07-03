"""contract-drift-checker skill.

See SKILL.md in this directory for the input/output contract and behaviour.
"""

from .core import check_drift, DriftItem, DriftSummary, DriftReport

__all__ = ["check_drift", "DriftItem", "DriftSummary", "DriftReport"]
__version__ = "0.1.0"
