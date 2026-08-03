# standard-ai-workflow-kit: v1.0.0-beta

"""workflow_kit.cache_analytics_trend_chart - ASCII chart for cache trend (v0.7.50+).

ADR-024 follow-up: cache trend 의 *visualization* (text-based chart) 의 *operational* 보강.
- render_trend_chart_ascii(snapshots, metric, *, width=60, height=10) -> str
- Uses only ASCII chars (no matplotlib dependency)
- Bar chart per snapshot, scaled to fit width

ASCII chart 의 *zero-dependency* 의 *operational* 의 *low-friction* 정공법.
External consumer 의 *machine-readable* 의 *operational* 보강.
"""

from __future__ import annotations

from typing import Any, Literal


def render_trend_chart_ascii(
    snapshots: list[dict[str, Any]],
    metric: Literal["total_size", "total_hits", "total_misses"] = "total_size",
    *,
    width: int = 60,
    height: int = 10,
) -> str:
    """Render cache trend as ASCII bar chart (v0.7.50+).

    Args:
        snapshots: list of snapshot dicts (must have 'timestamp' + metric key)
        metric: which metric to chart (default total_size)
        width: chart width in chars
        height: chart height in chars

    Returns:
        Multi-line ASCII chart string
    """
    if not snapshots:
        return "No snapshots to render."
    values = [float(s.get(metric, 0)) for s in snapshots]
    max_val = max(values) if values else 0.0
    if max_val == 0:
        return f"No data for metric '{metric}'."
    lines = [
        f"Trend Chart: {metric} (max={max_val:.0f}, snapshots={len(snapshots)})",
        "=" * width,
    ]
    bar_chars = "█"
    # Build chart from top to bottom (row 0 = top)
    for row in range(height, 0, -1):
        threshold = (row / height) * max_val
        line = ""
        for val in values:
            if val >= threshold:
                line += bar_chars
            else:
                line += " "
        lines.append(f"{threshold:>6.0f} |{line}|")
    # X-axis labels (timestamps)
    lines.append(f"     +{'─' * len(values)}+")
    lines.append(f"      t0    " + " " * (len(values) - 8) + f"t{len(values) - 1}")
    return "\n".join(lines)
