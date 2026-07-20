# standard-ai-workflow-kit: v0.15.19-beta

"""workflow_kit.cache_analytics_alerting - cache analytics threshold alerting (v0.7.51+).

ADR-024 follow-up: per-strategy cache 의 *threshold-based alerting* 의 *operational* 보강.
- AlertThresholds dataclass: max_size, min_hit_rate, max_evictions
- check_alerts(analytics, thresholds) -> list[Alert]
- format_alerts(alerts) -> str: human-readable alert summary

Threshold alerting 의 *operational* 의 *low-friction* 정공법.
External consumer 의 *machine-readable* 의 *operational* 보강.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class AlertThresholds:
    """Threshold config for cache analytics alerts (v0.7.51+).

    Attributes:
        max_size: alert if any strategy size exceeds this
        min_hit_rate: alert if any strategy hit_rate falls below this
        max_evictions: alert if any strategy evictions exceed this
    """
    max_size: int | None = None
    min_hit_rate: float | None = None
    max_evictions: int | None = None


@dataclass
class Alert:
    """Single cache alert (v0.7.51+)."""
    strategy: str
    metric: str
    value: float
    threshold: float
    severity: str  # 'warning' or 'critical'

    def to_dict(self) -> dict[str, Any]:
        return {
            "strategy": self.strategy,
            "metric": self.metric,
            "value": self.value,
            "threshold": self.threshold,
            "severity": self.severity,
        }


def check_alerts(
    analytics: dict[str, dict[str, Any]],
    thresholds: AlertThresholds,
) -> list[Alert]:
    """Check analytics against thresholds and return alerts (v0.7.51+).

    Args:
        analytics: dict of strategy -> {size, hits, misses, hit_rate, evictions}
        thresholds: AlertThresholds config

    Returns:
        List of Alert objects (empty if all under threshold)
    """
    alerts: list[Alert] = []
    for strategy, metrics in analytics.items():
        if thresholds.max_size is not None and metrics.get("size", 0) > thresholds.max_size:
            alerts.append(Alert(
                strategy=strategy,
                metric="size",
                value=float(metrics["size"]),
                threshold=float(thresholds.max_size),
                severity="warning",
            ))
        if thresholds.min_hit_rate is not None and metrics.get("hit_rate", 1.0) < thresholds.min_hit_rate:
            alerts.append(Alert(
                strategy=strategy,
                metric="hit_rate",
                value=float(metrics["hit_rate"]),
                threshold=float(thresholds.min_hit_rate),
                severity="critical",
            ))
        if thresholds.max_evictions is not None and metrics.get("evictions", 0) > thresholds.max_evictions:
            alerts.append(Alert(
                strategy=strategy,
                metric="evictions",
                value=float(metrics["evictions"]),
                threshold=float(thresholds.max_evictions),
                severity="warning",
            ))
    return alerts


def format_alerts(alerts: list[Alert]) -> str:
    """Format alerts as a human-readable summary (v0.7.51+).

    Args:
        alerts: list of Alert

    Returns:
        Multi-line summary string
    """
    if not alerts:
        return "No alerts (all metrics within thresholds)."
    lines = [f"Cache Alerts ({len(alerts)} active)", "=" * 60]
    for a in alerts:
        lines.append(
            f"[{a.severity.upper()}] {a.strategy}.{a.metric} = {a.value} (threshold: {a.threshold})"
        )
    return "\n".join(lines)
