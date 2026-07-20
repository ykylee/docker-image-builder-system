# standard-ai-workflow-kit: v0.15.19-beta

"""workflow_kit.cache_dashboard - per-strategy cache dashboard (consolidated v0.7.52).

Replaces cache_dashboard_export (json/md/html writers). All output formats in
one module:
- cache_dashboard(cache) -> str: formatted text table
- cache_dashboard_dict(cache) -> dict: machine-readable dict
- render_dashboard(cache, format='text'|'json'|'markdown'|'html') -> str: any format

Per-strategy cache dashboard 의 *formatted output* 의 *operational* 의 *low-friction* 정공법.
"""

from __future__ import annotations

import json
from typing import Any, Literal


def cache_dashboard(
    cache: dict[str, dict[str, Any]],
    *,
    hits_field: str = "hits",
    miss_field: str = "misses",
    eviction_field: str = "evictions",
) -> str:
    """Format per-strategy cache analytics as a dashboard table.

    Args:
        cache: dict of url -> entry
        hits_field: name of hits counter field
        miss_field: name of misses counter field
        eviction_field: name of evictions counter field

    Returns:
        Multi-line formatted table string. Columns: strategy, size, hits, misses, hit_rate, evictions.
    """
    from workflow_kit.cache_analytics import cache_analytics
    by_strategy = cache_analytics(
        cache, hits_field=hits_field, miss_field=miss_field, eviction_field=eviction_field,
    )
    lines = [
        "Per-Strategy Cache Dashboard",
        "=" * 60,
        f"{'strategy':<10} {'size':>6} {'hits':>8} {'misses':>8} {'hit_rate':>10} {'evictions':>10}",
        "-" * 60,
    ]
    for strategy in sorted(by_strategy.keys()):
        s = by_strategy[strategy]
        lines.append(
            f"{strategy:<10} {s['size']:>6} {s['hits']:>8} {s['misses']:>8} "
            f"{s['hit_rate']:>10.4f} {s['evictions']:>10}"
        )
    lines.append("=" * 60)
    total_size = sum(s["size"] for s in by_strategy.values())
    total_hits = sum(s["hits"] for s in by_strategy.values())
    total_misses = sum(s["misses"] for s in by_strategy.values())
    total_evictions = sum(s["evictions"] for s in by_strategy.values())
    total_requests = total_hits + total_misses
    overall_hit_rate = (total_hits / total_requests) if total_requests > 0 else 0.0
    lines.append(
        f"{'TOTAL':<10} {total_size:>6} {total_hits:>8} {total_misses:>8} "
        f"{overall_hit_rate:>10.4f} {total_evictions:>10}"
    )
    return "\n".join(lines)


def cache_dashboard_dict(
    cache: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Return dashboard as dict (machine-readable)."""
    from workflow_kit.cache_analytics import cache_analytics, cache_analytics_summary
    return {
        "strategies": cache_analytics(cache),
        "totals": cache_analytics_summary(cache),
    }


def render_dashboard(
    cache: dict[str, dict[str, Any]],
    *,
    format: Literal["text", "json", "markdown", "html"] = "text",
) -> str:
    """Render dashboard in any supported format.

    Args:
        cache: dict of url -> entry
        format: output format (text|json|markdown|html)

    Returns:
        Formatted string
    """
    if format == "text":
        return cache_dashboard(cache)
    if format == "json":
        return json.dumps(cache_dashboard_dict(cache), indent=2, sort_keys=True)
    if format == "markdown":
        data = cache_dashboard_dict(cache)
        lines = [
            "# Per-Strategy Cache Dashboard",
            "",
            "| strategy | size | hits | misses | hit_rate | evictions |",
            "| --- | ---: | ---: | ---: | ---: | ---: |",
        ]
        for strategy in sorted(data["strategies"].keys()):
            s = data["strategies"][strategy]
            lines.append(
                f"| {strategy} | {s['size']} | {s['hits']} | {s['misses']} | "
                f"{s['hit_rate']:.4f} | {s['evictions']} |"
            )
        totals = data["totals"]
        lines.append(
            f"| **TOTAL** | **{totals['total_size']}** | **{totals['total_hits']}** | "
            f"**{totals['total_misses']}** | **{totals['overall_hit_rate']:.4f}** | "
            f"**{totals['total_evictions']}** |"
        )
        return "\n".join(lines)
    if format == "html":
        data = cache_dashboard_dict(cache)
        rows = []
        for strategy in sorted(data["strategies"].keys()):
            s = data["strategies"][strategy]
            rows.append(
                f"<tr><td>{strategy}</td><td>{s['size']}</td><td>{s['hits']}</td>"
                f"<td>{s['misses']}</td><td>{s['hit_rate']:.4f}</td><td>{s['evictions']}</td></tr>"
            )
        totals = data["totals"]
        rows.append(
            f'<tr style="font-weight:bold"><td>TOTAL</td><td>{totals["total_size"]}</td>'
            f'<td>{totals["total_hits"]}</td><td>{totals["total_misses"]}</td>'
            f'<td>{totals["overall_hit_rate"]:.4f}</td><td>{totals["total_evictions"]}</td></tr>'
        )
        return (
            '<!DOCTYPE html>\n<html><head><title>Cache Dashboard</title>'
            '<style>table{border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 8px}'
            'th{background:#eee}</style></head><body>\n'
            '<h1>Per-Strategy Cache Dashboard</h1>\n'
            '<table>\n'
            '<tr><th>strategy</th><th>size</th><th>hits</th><th>misses</th>'
            '<th>hit_rate</th><th>evictions</th></tr>\n'
            + "\n".join(rows)
            + "\n</table>\n</body></html>"
        )
    raise ValueError(f"unknown format: {format}")


def write_dashboard(
    cache: dict[str, dict[str, Any]],
    path: str,
    *,
    format: Literal["text", "json", "markdown", "html"] = "text",
) -> None:
    """Write dashboard to disk in the given format."""
    import os
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    content = render_dashboard(cache, format=format)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)
