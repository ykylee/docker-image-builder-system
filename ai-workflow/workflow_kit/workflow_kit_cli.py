# standard-ai-workflow-kit: v0.11.21-beta

"""workflow_kit.workflow_kit_cli - unified CLI dispatcher (consolidated v0.7.52,
extended v0.7.53 with okf-export / okf-import, v0.7.54 with okf-validate /
cache-migrate / release-doctor, v0.7.55 with okf-version-check / cache-decay /
score-wiki-trend, v0.7.56 with okf-cleanup / cache-prune + score-wiki-trend
in-process, v0.7.57 with cache-merge-multi / cache-import-csv / cache-export-json,
v0.9.6 with refresh-purpose).

Replaces 6 per-feature CLI modules (cache_dashboard_cli, v_r13_layer2_cli,
cache_analytics_trend_chart_cli, cache_dashboard_export_cli,
phishing_federation_v5_cli, cache_analytics_alerting_cli).

Usage:
    python -m workflow_kit.workflow_kit_cli --command=<name> [args...]

Commands:
    cache-dashboard    [--cache-path=PATH]
    dashboard-export   --output=PATH [--format=json|markdown|html] [--cache-path=PATH]
    trend-chart        --snapshots=PATH [--metric=total_size|total_hits|total_misses]
    alert              [--max-size=N] [--min-hit-rate=0.5] [--max-evictions=N] [--cache-path=PATH]
    layer2             --layer2 URL [--user=USER --token=TOKEN]
    federate           [--phishtank-key=KEY] [--min-confidence=0.0]
    okf-export         --wiki=PATH --out=PATH [--include=SUBSTR]... [--exclude=SUBSTR]...
                       [--json] [--repo-root=PATH] [--no-resolve]
                       [--vcs-commit=SHA] [--vcs-ref=REF]
    okf-import         --bundle=PATH [--staging=PATH] [--mode=strict|loose|auto]
                       [--promote] [--json]
    okf-validate       --bundle=PATH [--mode=strict|loose] [--json]
    okf-version-check  --okf-version=X.Y  OR  --bundle=PATH [--json]
    okf-cleanup        [--staging=PATH] [--older-than=SECONDS] [--apply] [--json]
    cache-migrate      [--cache-path=PATH] [--mode=migrate|split|both]
                       [--lfu-threshold=N] [--json]
    cache-merge-multi  [--cache-path=PATH] [--delete-sources] [--json]
    cache-import-csv   --csv=PATH [--cache-path=PATH] [--replace] [--json]
    cache-export-json  --output=PATH [--cache-path=PATH] [--compact] [--json]
    cache-decay        --scores=PATH [--saved-at=ISO8601] [--output=PATH]
                       [--half-life=N] [--inplace] [--json]
    cache-prune        [--cache-path=PATH] [--older-than=SECONDS]
                       [--min-access-count=N] [--apply] [--json]
    release-doctor     [--skip-packaging] [--skip-doctor] [--skip-state] [--skip-git]
    release-bump       [--to=VERSION | --patch | --minor | --major]
                       [--no-init] [--apply] [--json]
    release-note       --to=VERSION --from-tag=TAG [--apply] [--json]
    release-changelog  [--from-tag=TAG] [--to-tag=REF] [--apply] [--json]
    release-create     --version=VERSION [--notes-template=PATH] [--skip-validate]
                       [--auto-bump] [--apply] [--json]
    release-verify     --tag=TAG [--json]
    release-rollback   --tag=TAG [--apply] [--json]
    release-dist       [--apply] [--json]
    score-wiki-trend   [--record-current | --record-range=N | --show | --json]
    refresh-purpose    [--apply] [--window-days=N] [--wiki-log-path=PATH]
                       [--purpose-path=PATH] [--json]
    cascade-delete     --deleted-paths=PATH [--deleted-paths=PATH] ...
                       --wiki-root=PATH [--project=SLUG] [--apply] [--json]

Exit codes: 0 = success (or no alerts), 1 = alerts triggered / operation result, 2 = usage error.

Note: okf-* / cache-* use their own argparse or function-call API internally.
The dispatcher forwards argv verbatim after stripping --command. Their full
arg surface is documented in each module's main() docstring (and via --help).
release-doctor and score-wiki-trend (v0.7.56+) call tools/* scripts via
in-process import (no subprocess overhead).
"""

from __future__ import annotations

import json
import sys
from typing import Any, Callable, Literal, cast


COMMANDS: dict[str, Callable[[list[str]], int]] = {}


def register(name: str) -> Callable[[Callable[[list[str]], int]], Callable[[list[str]], int]]:
    def decorator(fn: Callable[[list[str]], int]) -> Callable[[list[str]], int]:
        COMMANDS[name] = fn
        return fn
    return decorator


def _print_usage() -> None:
    print("Usage: workflow_kit_cli --command=<name> [args...]")
    print("Commands:")
    for name in sorted(COMMANDS):
        print(f"  {name}")


def _parse_flag(argv: list[str], flag: str) -> str | None:
    for arg in argv:
        if arg.startswith(flag + "="):
            return arg.split("=", 1)[1]
    return None


def _has_flag(argv: list[str], flag: str) -> bool:
    return flag in argv


@register("cache-dashboard")
def cmd_cache_dashboard(argv: list[str]) -> int:
    cache_path = _parse_flag(argv, "--cache-path")
    try:
        from pathlib import Path
        from workflow_kit.url_validity import _load_cache, cache_file_for_strategy, DEFAULT_CACHE_FILE
        from workflow_kit.cache_dashboard import cache_dashboard
        base = Path(cache_path) if cache_path else DEFAULT_CACHE_FILE
        merged: dict[str, Any] = {}
        for strategy in ("lru", "lfu", "mixed"):
            cf = cache_file_for_strategy(base, strategy)
            if cf.exists():
                entries = _load_cache(cf)
                for url, entry in entries.items():
                    if hasattr(entry, "__dict__"):
                        d = entry.__dict__.copy()
                    elif isinstance(entry, dict):
                        d = entry.copy()
                    else:
                        d = {"timestamp": getattr(entry, "timestamp", 0.0)}
                    d["strategy"] = strategy
                    merged[url] = d
        print(cache_dashboard(merged))
        return 0
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


@register("dashboard-export")
def cmd_dashboard_export(argv: list[str]) -> int:
    output = _parse_flag(argv, "--output")
    if output is None:
        print("ERROR: --output=PATH required", file=sys.stderr)
        return 2
    fmt = _parse_flag(argv, "--format") or "text"
    if fmt not in ("text", "json", "markdown", "html"):
        print(f"ERROR: invalid --format '{fmt}'", file=sys.stderr)
        return 2
    fmt_literal = cast(Literal["text", "json", "markdown", "html"], fmt)
    cache_path = _parse_flag(argv, "--cache-path")
    try:
        from pathlib import Path
        from workflow_kit.url_validity import _load_cache, cache_file_for_strategy, DEFAULT_CACHE_FILE
        from workflow_kit.cache_dashboard import write_dashboard
        base = Path(cache_path) if cache_path else DEFAULT_CACHE_FILE
        merged: dict[str, Any] = {}
        for strategy in ("lru", "lfu", "mixed"):
            cf = cache_file_for_strategy(base, strategy)
            if cf.exists():
                entries = _load_cache(cf)
                for url, entry in entries.items():
                    if hasattr(entry, "__dict__"):
                        d = entry.__dict__.copy()
                    elif isinstance(entry, dict):
                        d = entry.copy()
                    else:
                        d = {"timestamp": getattr(entry, "timestamp", 0.0)}
                    d["strategy"] = strategy
                    merged[url] = d
        write_dashboard(merged, output, format=fmt_literal)
        return 0
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


@register("trend-chart")
def cmd_trend_chart(argv: list[str]) -> int:
    snapshots_path = _parse_flag(argv, "--snapshots")
    if snapshots_path is None:
        print("ERROR: --snapshots=PATH required", file=sys.stderr)
        return 2
    metric = _parse_flag(argv, "--metric") or "total_size"
    metric_literal = cast(Literal["total_size", "total_hits", "total_misses"], metric)
    try:
        from workflow_kit.cache_analytics_trend import load_snapshots
        from workflow_kit.cache_analytics_trend_chart import render_trend_chart_ascii
        snapshots = load_snapshots(snapshots_path)
        if not snapshots:
            print("ERROR: no snapshots found", file=sys.stderr)
            return 2
        print(render_trend_chart_ascii(snapshots, metric=metric_literal))
        return 0
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


@register("alert")
def cmd_alert(argv: list[str]) -> int:
    max_size_s = _parse_flag(argv, "--max-size")
    min_hit_s = _parse_flag(argv, "--min-hit-rate")
    max_ev_s = _parse_flag(argv, "--max-evictions")
    cache_path = _parse_flag(argv, "--cache-path")
    max_size = int(max_size_s) if max_size_s else None
    min_hit_rate = float(min_hit_s) if min_hit_s else None
    max_evictions = int(max_ev_s) if max_ev_s else None
    try:
        from pathlib import Path
        from workflow_kit.url_validity import _load_cache, cache_file_for_strategy, DEFAULT_CACHE_FILE
        from workflow_kit.cache_analytics import cache_analytics
        from workflow_kit.cache_analytics_alerting import AlertThresholds, check_alerts, format_alerts
        base = Path(cache_path) if cache_path else DEFAULT_CACHE_FILE
        merged: dict[str, Any] = {}
        for strategy in ("lru", "lfu", "mixed"):
            cf = cache_file_for_strategy(base, strategy)
            if cf.exists():
                entries = _load_cache(cf)
                for url, entry in entries.items():
                    if hasattr(entry, "__dict__"):
                        d = entry.__dict__.copy()
                    elif isinstance(entry, dict):
                        d = entry.copy()
                    else:
                        d = {"timestamp": getattr(entry, "timestamp", 0.0)}
                    d["strategy"] = strategy
                    merged[url] = d
        analytics = cache_analytics(merged)
        thresholds = AlertThresholds(
            max_size=max_size, min_hit_rate=min_hit_rate, max_evictions=max_evictions,
        )
        alerts = check_alerts(analytics, thresholds)
        print(format_alerts(alerts))
        return 1 if alerts else 0
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


@register("layer2")
def cmd_layer2(argv: list[str]) -> int:
    # Find URL (first non-flag arg)
    url = None
    for arg in argv:
        if not arg.startswith("--") and arg:
            url = arg
            break
    if url is None:
        print("ERROR: URL required", file=sys.stderr)
        return 2
    user = _parse_flag(argv, "--user")
    token = _parse_flag(argv, "--token")
    try:
        from workflow_kit.v_r13_commit_diff import run_layer2_pipeline
        result = run_layer2_pipeline(url, user=user, token=token)
        print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
        return 0
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


@register("federate")
def cmd_federate(argv: list[str]) -> int:
    phishtank_key = _parse_flag(argv, "--phishtank-key")
    min_conf_s = _parse_flag(argv, "--min-confidence")
    min_confidence = float(min_conf_s) if min_conf_s else 0.0
    try:
        from workflow_kit.phishing_federation import (
            fetch_federated_phishing_urls,
            build_default_sources,
        )
        sources = build_default_sources(phishtank_api_key=phishtank_key)
        result = fetch_federated_phishing_urls(sources, min_confidence=min_confidence)
        output = [
            {"url": u, "confidence": c, "sources": s}
            for u, c, s in result
        ]
        print(json.dumps(output, indent=2, sort_keys=True))
        return 0
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


@register("okf-export")
def cmd_okf_export(argv: list[str]) -> int:
    """Forward argv to okf_export.main() — its own argparse handles all flags.
    See okf_export._build_arg_parser() for the full flag surface.
    """
    try:
        from workflow_kit.okf_export import main as okf_export_main
        return okf_export_main(argv)
    except SystemExit as e:
        # argparse / main() may call sys.exit — convert to rc
        return e.code if isinstance(e.code, int) else 2
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


@register("okf-import")
def cmd_okf_import(argv: list[str]) -> int:
    """Forward argv to okf_import.main() — its own argparse handles all flags.
    See okf_import._build_arg_parser() for the full flag surface.
    """
    try:
        from workflow_kit.okf_import import main as okf_import_main
        return okf_import_main(argv)
    except SystemExit as e:
        return e.code if isinstance(e.code, int) else 2
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


@register("okf-version-check")
def cmd_okf_version_check(argv: list[str]) -> int:
    """Check OKF bundle version compatibility (ADR-011 / OKF spec §11).

    Args:
        --okf-version=X.Y   bundle's okf_version (e.g. "0.1")
        --bundle=PATH       read from okf-bundle.yaml manifest if --okf-version absent
        --json              JSON output
    """
    import json as _json
    version = _parse_flag(argv, "--okf-version")
    bundle = _parse_flag(argv, "--bundle")
    use_json = _has_flag(argv, "--json")
    if version is None and bundle is None:
        print("ERROR: --okf-version=X.Y or --bundle=PATH required", file=sys.stderr)
        return 2
    # If bundle given and no version, read from okf-bundle.yaml manifest
    if version is None and bundle is not None:
        from pathlib import Path as _P
        manifest = _P(bundle) / "okf-bundle.yaml"
        if not manifest.exists():
            print(f"ERROR: --bundle path has no okf-bundle.yaml: {bundle}", file=sys.stderr)
            return 2
        # simple regex: `okf_version: "0.1"` (single-line)
        import re as _re
        text = manifest.read_text(encoding="utf-8")
        m = _re.search(r'^\s*okf_version\s*:\s*["\']?(\d+\.\d+(?:\.\d+)?)["\']?', text, _re.MULTILINE)
        if m is None:
            print(f"ERROR: okf_version not found in {manifest}", file=sys.stderr)
            return 2
        version = m.group(1)
    try:
        from workflow_kit.okf_import import _check_version_compatibility
        result = _check_version_compatibility(version)
        out = {
            "okf_version": result.bundle_version,
            "our_version": result.our_version,
            "status": result.status,
            "message": result.message,
        }
        if use_json:
            print(_json.dumps(out, indent=2))
        else:
            print(f"OKF version check: bundle={out['okf_version']}, our={out['our_version']}")
            print(f"  status: {out['status']}")
            print(f"  message: {out['message']}")
        # rc: 0 = pass, 1 = warn, 2 = error
        if result.status == "error":
            return 2
        if result.status == "warn":
            return 1
        return 0
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


@register("cache-decay")
def cmd_cache_decay(argv: list[str]) -> int:
    """Apply temporal decay to LFU cache scores (v0.7.51+, CSV in-place v0.7.56+).

    Reads scores from JSON or CSV file, applies age-based decay (default half-life=1 day),
    writes decayed scores back. Args:
        --scores=PATH          input file (url → score, JSON or CSV)
        --saved-at=ISO8601     timestamp when scores were saved
                              (default: file mtime)
        --output=PATH          output JSON file (default: stdout)
        --inplace              CSV in-place write (v0.7.56+)
        --half-life=N          half-life in seconds (default 86400 = 1 day)
        --json                 JSON output
    """
    import json as _json
    scores_path_s = _parse_flag(argv, "--scores")
    if scores_path_s is None:
        print("ERROR: --scores=PATH required", file=sys.stderr)
        return 2
    saved_at_s = _parse_flag(argv, "--saved-at")
    output_s = _parse_flag(argv, "--output")
    inplace = _has_flag(argv, "--inplace")
    half_life_s = _parse_flag(argv, "--half-life")
    half_life = float(half_life_s) if half_life_s else 86400.0
    use_json = _has_flag(argv, "--json")
    try:
        from pathlib import Path as _P
        from workflow_kit.cache_lfu_decay_persist import (
            decay_age_scores, decay_csv_inplace, import_from_csv,
        )
        scores_path = _P(scores_path_s)
        if not scores_path.exists():
            print(f"ERROR: --scores path not found: {scores_path}", file=sys.stderr)
            return 2
        if saved_at_s is None:
            mtime = scores_path.stat().st_mtime
            saved_at = mtime
        else:
            import datetime as _dt
            saved_at = _dt.datetime.fromisoformat(saved_at_s).timestamp()
        # CSV in-place (v0.7.56+)
        if inplace:
            if scores_path.suffix.lower() != ".csv":
                print(f"ERROR: --inplace requires .csv file, got {scores_path.suffix}", file=sys.stderr)
                return 2
            result = decay_csv_inplace(
                str(scores_path),
                saved_at=saved_at,
                half_life_seconds=half_life,
            )
            if use_json:
                print(_json.dumps(result, indent=2, default=str))
            else:
                print(f"Decayed {result['scores_out']} scores in-place → {result['path']}")
                print(f"  half_life={result['half_life_seconds']}s, saved_at={result['saved_at']:.0f}")
            return 0
        # JSON path (v0.7.51+)
        scores = _json.loads(scores_path.read_text(encoding="utf-8"))
        decayed = decay_age_scores(scores, saved_at=saved_at, half_life_seconds=half_life)
        if output_s:
            _P(output_s).write_text(_json.dumps(decayed, indent=2, sort_keys=True), encoding="utf-8")
            if use_json:
                print(_json.dumps({"output": output_s, "scores_in": len(scores), "scores_out": len(decayed)}, indent=2))
            else:
                print(f"Decayed {len(decayed)} scores → {output_s}")
        else:
            if use_json:
                print(_json.dumps({"scores": decayed, "saved_at": saved_at, "half_life": half_life}, indent=2))
            else:
                print(f"Decayed {len(decayed)} scores (half_life={half_life}s, saved_at={saved_at})")
                for url, score in list(decayed.items())[:10]:
                    print(f"  {url}: {score:.4f}")
                if len(decayed) > 10:
                    print(f"  ... +{len(decayed) - 10} more")
        return 0
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


@register("score-wiki-trend")
def cmd_score_wiki_trend(argv: list[str]) -> int:
    """Wiki maintainability score trend (v0.7.1+).

    In-process wrapper (v0.7.56+, previously subprocess) for
    `tools/score_wiki_trend.py`. v0.7.55 의 release-doctor in-process 와 동일
    정공법: `workflow-source/` 를 sys.path 에 insert → `import tools.score_wiki_trend`
    → `main(argv)` 호출.

    v0.7.55 의 subprocess fallback 원인: tools/ 가 *package* 가 아니어서
    `import tools.score_wiki_trend` 가 fail. v0.7.56 에서 `tools/__init__.py`
    추가 + sys.path 조정으로 in-process 가능.

    Args (forwarded verbatim):
        --record-current   record current HEAD score
        --record-range=N   backfill N recent commits
        --show             ASCII chart of trend
        --json             JSON output
        --alert --baseline=X  baseline 비교 (dim alert)
    """
    try:
        from pathlib import Path as _P
        import importlib as _il
        kit_dir = _P(__file__).resolve().parent
        workflow_source_dir = kit_dir.parent
        if str(workflow_source_dir) not in sys.path:
            sys.path.insert(0, str(workflow_source_dir))
        # tools/ is now a package (v0.7.56+ with __init__.py) → import as module
        mod = _il.import_module("tools.score_wiki_trend")
        # main() uses argparse.parse_args() (reads sys.argv[1:]). Patch sys.argv
        # in-place to forward our argv. Restore on exit (incl. exceptions).
        old_argv = sys.argv
        try:
            sys.argv = ["score_wiki_trend", *argv]
            return cast(int, mod.main())
        finally:
            sys.argv = old_argv
    except SystemExit as e:
        # argparse / main() may call sys.exit — convert to rc
        return e.code if isinstance(e.code, int) else 2
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


@register("okf-validate")
def cmd_okf_validate(argv: list[str]) -> int:
    """Validate an OKF v0.1 bundle (lint only, no import / staging / promote).

    Uses okf_import's lint_page() for all 8 rules (V-1 / V-4 / V-R9 / V-T1 /
    OKF §4.1 hard 3 + broken link + unknown key). No subprocess, no staging —
    pure read-only validation. Args:
        --bundle=PATH     OKF bundle root (required)
        --mode=strict|loose  default = strict
        --json            JSON output (otherwise human-readable)
    """
    import json as _json
    bundle = _parse_flag(argv, "--bundle")
    if bundle is None:
        print("ERROR: --bundle=PATH required", file=sys.stderr)
        return 2
    mode = _parse_flag(argv, "--mode") or "strict"
    if mode not in ("strict", "loose"):
        print(f"ERROR: --mode must be 'strict' or 'loose', got {mode!r}", file=sys.stderr)
        return 2
    mode_literal = cast(Literal["strict", "loose"], mode)
    use_json = _has_flag(argv, "--json")
    try:
        from pathlib import Path as _P
        from workflow_kit.okf_import import _parse_bundle_pages, lint_page
        bundle_path = _P(bundle).resolve()
        if not bundle_path.exists():
            print(f"ERROR: --bundle path not found: {bundle_path}", file=sys.stderr)
            return 2
        pages = _parse_bundle_pages(bundle_path)
        # mode is Literal["strict", "loose"] — pass string directly (lint_page signature).
        all_issues: list[dict[str, Any]] = []
        for page in pages:
            for issue in lint_page(page, bundle_path, mode_literal):
                all_issues.append({
                    "page": str(issue.page.relative_to(bundle_path)),
                    "rule": issue.rule,
                    "severity": issue.severity,
                    "message": issue.message,
                })
        if use_json:
            err_count = sum(1 for i in all_issues if i["severity"] == "error")
            print(_json.dumps({
                "bundle": str(bundle_path),
                "mode": mode,
                "pages_checked": len(pages),
                "issues_total": len(all_issues),
                "errors": err_count,
                "issues": all_issues,
            }, indent=2))
        else:
            err_count = sum(1 for i in all_issues if i["severity"] == "error")
            warn_count = sum(1 for i in all_issues if i["severity"] == "warn")
            print(f"OKF validate (mode={mode}): {len(pages)} pages, {err_count} errors, {warn_count} warnings")
            for i in all_issues:
                print(f"  [{i['severity']}] {i['rule']} {i['page']}: {i['message']}")
        return 1 if err_count else 0
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


@register("cache-migrate")
def cmd_cache_migrate(argv: list[str]) -> int:
    """Migrate v0.7.41 single-strategy cache → per-strategy files (ADR-024).

    2 step:
      1. migrate: v0.7.41 single file → mixed file (1-step, no-op if already)
      2. split:   mixed file → LRU + LFU files (per access_count threshold)

    Args:
        --cache-path=PATH   base cache file (default: DEFAULT_CACHE_FILE)
        --mode=migrate|split|both  default = both
        --lfu-threshold=N   access_count threshold for LFU classification (default 10)
        --json              JSON output (otherwise human-readable)
    """
    import json as _json
    cache_path_s = _parse_flag(argv, "--cache-path")
    mode = _parse_flag(argv, "--mode") or "both"
    if mode not in ("migrate", "split", "both"):
        print(f"ERROR: --mode must be migrate|split|both, got {mode!r}", file=sys.stderr)
        return 2
    lfu_th_s = _parse_flag(argv, "--lfu-threshold")
    lfu_threshold = int(lfu_th_s) if lfu_th_s else 10
    use_json = _has_flag(argv, "--json")
    try:
        from pathlib import Path as _P
        from workflow_kit.cache_migration import (
            migrate_to_per_strategy_cache,
            split_to_per_strategy,
        )
        base = _P(cache_path_s) if cache_path_s else None
        all_results: dict[str, object] = {"mode": mode, "cache_path": str(base) if base else None}
        if mode in ("migrate", "both"):
            all_results["migrate"] = migrate_to_per_strategy_cache(base_path=base)
        if mode in ("split", "both"):
            all_results["split"] = split_to_per_strategy(base_path=base, lfu_threshold=lfu_threshold)
        if use_json:
            print(_json.dumps(all_results, indent=2, default=str))
        else:
            if "migrate" in all_results:
                m = cast(dict[str, Any], all_results["migrate"])
                if m.get("migrated"):
                    print(f"[migrate] OK: {m.get('entries_migrated', 0)} entries → mixed file")
                else:
                    print(f"[migrate] no-op (per-strategy already exist or source absent)")
            if "split" in all_results:
                s = cast(dict[str, Any], all_results["split"])
                if s.get("split"):
                    print(f"[split] OK: {s.get('lru_entries', 0)} LRU + {s.get('lfu_entries', 0)} LFU (threshold={lfu_threshold})")
                else:
                    print(f"[split] no-op (mixed file absent or empty)")
        return 0
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


@register("release-doctor")
def cmd_release_doctor(argv: list[str]) -> int:
    """Release pre-flight: 4-source release-readiness check (in-process, v0.7.55+).

    Calls `tools.release_pipeline_lib.cmd_validate` in-process (no subprocess
    overhead, no script-path coupling). 4 checks:
      1. check_packaging: pyproject [tool.setuptools.packages] ↔ disk
      2. workflow_kit.cli.doctor: 7 baseline evaluate
      3. state.json freshness
      4. git status: working tree clean

    Args:
        --skip-packaging   skip check 1
        --skip-doctor      skip check 2
        --skip-state       skip check 3
        --skip-git         skip check 4
    """
    skip = {
        "packaging": _has_flag(argv, "--skip-packaging"),
        "doctor": _has_flag(argv, "--skip-doctor"),
        "state": _has_flag(argv, "--skip-state"),
        "git": _has_flag(argv, "--skip-git"),
    }
    try:
        # Find workflow-source/tools dir relative to this module.
        # workflow_kit_cli.py lives at workflow-source/workflow_kit/
        # → tools/release_pipeline_lib.py is at workflow-source/tools/
        from pathlib import Path as _P
        kit_dir = _P(__file__).resolve().parent
        tools_dir = kit_dir.parent / "tools"
        if str(tools_dir) not in sys.path:
            sys.path.insert(0, str(tools_dir))
        # importlib 사용 — sys.path manipulation 후에도 mypy 가 stub 못 찾으므로
        # importlib.util.spec_from_file_location 으로 명시적 로드
        import importlib.util as _ilu
        _spec = _ilu.spec_from_file_location(
            "release_pipeline_lib", str(tools_dir / "release_pipeline_lib.py")
        )
        if _spec is None or _spec.loader is None:
            raise ImportError("failed to load release_pipeline_lib spec")
        _mod = _ilu.module_from_spec(_spec)
        sys.modules["release_pipeline_lib"] = _mod
        _spec.loader.exec_module(_mod)
        _cmd_validate = _mod.cmd_validate
        results = _cmd_validate(
            skip_packaging=skip["packaging"],
            skip_doctor=skip["doctor"],
            skip_state=skip["state"],
            skip_git=skip["git"],
        )
        print(json.dumps(results, indent=2, default=str))
        # rc: 0 = all OK, 1 = at least one source not ok
        any_fail = any(
            v.get("ok") is False for v in results.values() if isinstance(v, dict)
        )
        return 1 if any_fail else 0
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


@register("okf-cleanup")
def cmd_okf_cleanup(argv: list[str]) -> int:
    """Clean up OKF staging directory (v0.7.56+, dispatcher subcommand 15).

    Removes files in `--staging` directory older than `--older-than` seconds
    (mtime check). Default `--dry-run` reports what would be removed without
    touching disk. Args:
        --staging=PATH         staging directory (default = cwd/.okf-staging)
        --older-than=SECONDS   max age in seconds (default = no age filter = all)
        --apply                actually remove (default is dry-run)
        --json                 JSON output
    """
    import json as _json
    staging_s = _parse_flag(argv, "--staging")
    older_than_s = _parse_flag(argv, "--older-than")
    apply = _has_flag(argv, "--apply")
    use_json = _has_flag(argv, "--json")
    older_than = float(older_than_s) if older_than_s else None
    try:
        from pathlib import Path as _P
        from workflow_kit.okf_import import cleanup_staging
        staging_path = _P(staging_s) if staging_s else _P.cwd() / ".okf-staging"
        result = cleanup_staging(
            staging_path,
            older_than_seconds=older_than,
            dry_run=not apply,
        )
        if use_json:
            print(_json.dumps(result, indent=2))
        else:
            mode = "APPLY" if apply else "DRY-RUN"
            print(f"OKF cleanup ({mode}): {result['staging_dir']}")
            print(f"  scanned: {result['scanned']}")
            print(f"  removed: {result['removed']}")
            print(f"  kept:    {result['kept']}")
        return 0
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


@register("cache-prune")
def cmd_cache_prune(argv: list[str]) -> int:
    """Prune cache entries by age and/or access count (v0.7.56+, dispatcher subcommand 16).

    Removes entries from per-strategy cache files (lru/lfu/mixed) matching:
    - older-than: only entries with age > this (default = no age filter)
    - min-access-count: only entries with access_count < this (default 0 = any)
    - cache-path: base cache file path (default: DEFAULT_CACHE_FILE)
    Default `--dry-run` reports what would be removed. Args:
        --cache-path=PATH      base cache file path
        --older-than=SECONDS   max age in seconds
        --min-access-count=N   only prune entries with access_count < N
        --apply                actually remove (default is dry-run)
        --json                 JSON output
    """
    import json as _json
    cache_path_s = _parse_flag(argv, "--cache-path")
    older_than_s = _parse_flag(argv, "--older-than")
    min_access_s = _parse_flag(argv, "--min-access-count")
    apply = _has_flag(argv, "--apply")
    use_json = _has_flag(argv, "--json")
    older_than = float(older_than_s) if older_than_s else None
    min_access_count = int(min_access_s) if min_access_s else 0
    try:
        from pathlib import Path as _P
        from workflow_kit.url_validity import cache_prune
        base = _P(cache_path_s) if cache_path_s else None
        result = cache_prune(
            base_path=base,
            max_age_seconds=older_than,
            min_access_count=min_access_count,
            dry_run=not apply,
        )
        if use_json:
            print(_json.dumps(result, indent=2, default=str))
        else:
            mode = "APPLY" if apply else "DRY-RUN"
            print(f"Cache prune ({mode}):")
            for strategy, info in result.items():
                if strategy.startswith("_"):
                    continue
                print(f"  {strategy}: removed={info['removed']}, kept={info['kept']}, total={info['total']}")
            overall = result.get("_overall", {})
            if "total_removed" in overall:
                print(f"  TOTAL removed: {overall['total_removed']}")
        return 0
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


# ---------------------------------------------------------------------------
# release-pipeline wrappers (v0.7.56+, dispatcher subcommand 17-23)
# ---------------------------------------------------------------------------

def _wrap_release_pipeline(argv: list[str], wrapper_name: str, **kwargs: Any) -> int:
    """Helper: call a release_pipeline_lib wrapper with JSON output + rc conversion.

    Args:
        argv: dispatcher argv
        wrapper_name: name of the function in release_pipeline_lib
        **kwargs: forwarded to the wrapper

    Returns:
        rc: 0 = success, 1 = warn, 2 = error/usage
    """
    import json as _json
    use_json = _has_flag(argv, "--json")
    try:
        from pathlib import Path as _P
        kit_dir = _P(__file__).resolve().parent
        tools_dir = kit_dir.parent / "tools"
        if str(tools_dir) not in sys.path:
            sys.path.insert(0, str(tools_dir))
        # importlib 사용 — sys.path manipulation 후에도 mypy 가 stub 못 찾으므로
        # importlib.util.spec_from_file_location 으로 명시적 로드 (cmd_release_doctor 와 동일 패턴)
        import importlib.util as _ilu
        _spec = _ilu.spec_from_file_location(
            "release_pipeline_lib", str(tools_dir / "release_pipeline_lib.py")
        )
        if _spec is None or _spec.loader is None:
            raise ImportError("failed to load release_pipeline_lib spec")
        _mod = _ilu.module_from_spec(_spec)
        sys.modules["release_pipeline_lib"] = _mod
        _spec.loader.exec_module(_mod)
        _lib = cast(Any, _mod)  # release_pipeline_lib module — wrapper_name attribute
        fn = getattr(_lib, wrapper_name)
        result = fn(**kwargs)
        if use_json:
            print(_json.dumps(result, indent=2, default=str))
        else:
            mode = result.get("mode", "?")
            print(f"{wrapper_name}: mode={mode}")
            for k, v in result.items():
                if k == "mode":
                    continue
                print(f"  {k}: {v}")
        # rc: success if mode=apply or dry-run OK; error if mode=error
        if result.get("mode") == "error":
            return 2
        return 0
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


@register("release-bump")
def cmd_release_bump(argv: list[str]) -> int:
    """Bump pyproject.toml version (v0.7.56+, dispatcher subcommand 17).

    Args:
        --to=VERSION    explicit target version (e.g. "0.7.56")
        --patch         increment patch (default if no --to)
        --minor         increment minor
        --major         increment major
        --no-init       skip workflow_kit/__init__.py __version__ sync
        --apply         actually write (default dry-run)
        --json          JSON output
    """
    to = _parse_flag(argv, "--to")
    kwargs = {
        "apply": _has_flag(argv, "--apply"),
        "no_init": _has_flag(argv, "--no-init"),
        "to": to,
        "patch": _has_flag(argv, "--patch"),
        "minor": _has_flag(argv, "--minor"),
        "major": _has_flag(argv, "--major"),
    }
    return _wrap_release_pipeline(argv, "cmd_version_bump", **kwargs)


@register("release-note")
def cmd_release_note(argv: list[str]) -> int:
    """Draft release note (v0.7.56+, dispatcher subcommand 18).

    Args:
        --to=VERSION       target version (required)
        --from-tag=TAG     source tag (required)
        --apply            actually write Beta-v<X>.md (default dry-run)
        --json             JSON output
    """
    to = _parse_flag(argv, "--to")
    from_tag = _parse_flag(argv, "--from-tag")
    if to is None or from_tag is None:
        print("ERROR: --to=VERSION and --from-tag=TAG required", file=sys.stderr)
        return 2
    return _wrap_release_pipeline(
        argv, "cmd_note_draft",
        to=to, from_tag=from_tag, dry_run=not _has_flag(argv, "--apply"),
    )


@register("release-changelog")
def cmd_release_changelog(argv: list[str]) -> int:
    """Generate CHANGELOG.md body (v0.7.56+, dispatcher subcommand 19).

    Args:
        --from-tag=TAG     start tag (default = all history)
        --to-tag=REF       end tag/REF (default = HEAD)
        --apply            actually write CHANGELOG.md (default dry-run)
        --json             JSON output
    """
    from_tag = _parse_flag(argv, "--from-tag")
    to_tag = _parse_flag(argv, "--to-tag") or "HEAD"
    return _wrap_release_pipeline(
        argv, "cmd_changelog_gen",
        from_tag=from_tag, to_tag=to_tag, dry_run=not _has_flag(argv, "--apply"),
    )


@register("release-create")
def cmd_release_create(argv: list[str]) -> int:
    """Create GitHub Release (v0.7.56+, dispatcher subcommand 20, destructive).

    Args:
        --version=VERSION        target version (required)
        --notes-template=PATH    notes template file (optional)
        --skip-validate          skip 4-source validate (not recommended)
        --skip-mypy              skip mypy strict pre-check (v0.11.12+, not recommended)
        --skip-cross-verify      skip mypy CI cross-verify (v0.11.13+, advisory 만 default)
        --strict-cross-verify    mypy CI cross-verify 시 drift / ci_stale / ci_fail hard fail (v0.11.13+)
        --auto-bump              auto-bump if remote tag exists
        --full-auto              pre-check conflict 시 --auto-bump / --allow-existing-tag 자동 활성화
        --apply                  actually create release (default dry-run)
        --json                   JSON output
    """
    version = _parse_flag(argv, "--version")
    if version is None:
        print("ERROR: --version=VERSION required", file=sys.stderr)
        return 2
    return _wrap_release_pipeline(
        argv, "cmd_release",
        version=version,
        notes_template=_parse_flag(argv, "--notes-template"),
        skip_validate=_has_flag(argv, "--skip-validate"),
        skip_mypy=_has_flag(argv, "--skip-mypy"),
        skip_cross_verify=_has_flag(argv, "--skip-cross-verify"),
        strict_cross_verify=_has_flag(argv, "--strict-cross-verify"),
        auto_bump=_has_flag(argv, "--auto-bump"),
        full_auto=_has_flag(argv, "--full-auto"),
        allow_existing_tag=_has_flag(argv, "--allow-existing-tag"),
        apply=_has_flag(argv, "--apply"),
    )


@register("release-verify")
def cmd_release_verify(argv: list[str]) -> int:
    """Verify GitHub Release (v0.7.56+, dispatcher subcommand 21, read-only).

    Args:
        --tag=TAG    tag to verify (e.g. v0.7.56 or 0.7.56, required)
        --json       JSON output
    """
    tag = _parse_flag(argv, "--tag")
    if tag is None:
        print("ERROR: --tag=TAG required", file=sys.stderr)
        return 2
    return _wrap_release_pipeline(argv, "cmd_verify", tag=tag)


@register("release-rollback")
def cmd_release_rollback(argv: list[str]) -> int:
    """Delete GitHub Release + git tag (v0.7.56+, dispatcher subcommand 22, destructive).

    Args:
        --tag=TAG     tag to delete (required)
        --apply       actually delete (default dry-run)
        --json        JSON output
    """
    tag = _parse_flag(argv, "--tag")
    if tag is None:
        print("ERROR: --tag=TAG required", file=sys.stderr)
        return 2
    return _wrap_release_pipeline(
        argv, "cmd_rollback",
        tag=tag, apply=_has_flag(argv, "--apply"),
    )


@register("release-dist")
def cmd_release_dist(argv: list[str]) -> int:
    """Build wheel + sdist (v0.7.56+, dispatcher subcommand 23).

    Args:
        --apply     actually run `python3 -m build` (default dry-run)
        --json      JSON output
    """
    return _wrap_release_pipeline(argv, "cmd_dist", apply=_has_flag(argv, "--apply"))


# ---------------------------------------------------------------------------
# cache format interop (v0.7.57+, dispatcher subcommand 24-26)
# ---------------------------------------------------------------------------


@register("cache-merge-multi")
def cmd_cache_merge_multi(argv: list[str]) -> int:
    """Merge per-strategy LRU + LFU files back into mixed file (v0.7.57+, subcommand 24).

    Reverse of cache-migrate --mode=split. Default dry-run reports what would be
    merged. Args:
        --cache-path=PATH      base cache file path (default: DEFAULT_CACHE_FILE)
        --delete-sources       delete LRU + LFU files after merge
        --json                 JSON output
    """
    import json as _json
    cache_path_s = _parse_flag(argv, "--cache-path")
    delete_sources = _has_flag(argv, "--delete-sources")
    use_json = _has_flag(argv, "--json")
    try:
        from pathlib import Path as _P
        from workflow_kit.cache_migration import merge_per_strategy_to_mixed
        base = _P(cache_path_s) if cache_path_s else None
        result = merge_per_strategy_to_mixed(base_path=base, delete_sources=delete_sources)
        if use_json:
            print(_json.dumps(result, indent=2, default=str))
        else:
            if result["merged"]:
                print(f"Merged: {result['lru_entries']} LRU + {result['lfu_entries']} LFU → {result['total']} total → {result['mixed_file']}")
                if result["delete_sources"]:
                    print("  (LRU + LFU files deleted)")
            else:
                print(f"No-op: no LRU/LFU files found")
        return 0
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


@register("cache-import-csv")
def cmd_cache_import_csv(argv: list[str]) -> int:
    """Import URLs from CSV file into cache (v0.7.57+, subcommand 25).

    CSV format: `url,status,timestamp,access_count` (header required).
    Default merge with existing cache. Args:
        --csv=PATH             input CSV file (required)
        --cache-path=PATH      target cache file (default: DEFAULT_CACHE_FILE)
        --replace              replace existing cache (default merge)
        --json                 JSON output
    """
    import json as _json
    csv_s = _parse_flag(argv, "--csv")
    if csv_s is None:
        print("ERROR: --csv=PATH required", file=sys.stderr)
        return 2
    cache_path_s = _parse_flag(argv, "--cache-path")
    replace = _has_flag(argv, "--replace")
    use_json = _has_flag(argv, "--json")
    try:
        from pathlib import Path as _P
        from workflow_kit.cache_migration import import_csv_to_cache
        cache_path = cache_path_s
        result = import_csv_to_cache(csv_s, cache_path, merge=not replace)
        if use_json:
            print(_json.dumps(result, indent=2, default=str))
        else:
            mode = "REPLACE" if replace else "MERGE"
            print(f"Import ({mode}): {result['imported']} imported, {result['skipped']} skipped (of {result['total_rows']} rows)")
            print(f"  cache: {result['cache_path']}")
        return 0
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


@register("cache-export-json")
def cmd_cache_export_json(argv: list[str]) -> int:
    """Export cache entries to standalone JSON file (v0.7.57+, subcommand 26).

    Format: flat dict of url -> {timestamp, issues, access_count}. Args:
        --output=PATH          output JSON file (required)
        --cache-path=PATH      source cache file (default: DEFAULT_CACHE_FILE)
        --compact              no indent (default pretty)
        --json                 JSON output
    """
    import json as _json
    output_s = _parse_flag(argv, "--output")
    if output_s is None:
        print("ERROR: --output=PATH required", file=sys.stderr)
        return 2
    cache_path_s = _parse_flag(argv, "--cache-path")
    compact = _has_flag(argv, "--compact")
    use_json = _has_flag(argv, "--json")
    try:
        from pathlib import Path as _P
        from workflow_kit.cache_migration import export_cache_to_json
        result = export_cache_to_json(
            output_s,
            cache_path=cache_path_s,
            pretty=not compact,
        )
        if use_json:
            print(_json.dumps(result, indent=2, default=str))
        else:
            print(f"Exported {result['entries']} entries → {result['output_path']}")
            if "error" in result:
                print(f"  WARN: {result['error']}")
        return 0
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


# ---------------------------------------------------------------------------
# consumer feedback metrics (v0.7.58+, dispatcher subcommand 27)
# ---------------------------------------------------------------------------


@register("consumer-metrics")
def cmd_consumer_metrics(argv: list[str]) -> int:
    """Consumer feedback metrics snapshot (v0.7.58+, subcommand 27).

    In-process wrapper (v0.7.59+, previously subprocess) for
    `tools/consumer_metrics.py`. v0.7.55+ release-doctor /
    v0.7.56+ score-wiki-trend 와 동일 정공법: `workflow-source/` 를
    sys.path 에 insert → `import tools.consumer_metrics` → `main(argv)` 호출.

    Args (forwarded verbatim, consumer_metrics.main() argparse 가 처리):
        --repo=OWNER/REPO     target repo (default: ykylee/standard_ai_workflow)
        --days=N              lookback window (1-90, default 14)
        --json                JSON output

    Exit code: 0 = success, 1 = gh CLI not authenticated, 2 = usage error.
    """
    try:
        from pathlib import Path as _P
        import importlib as _il
        kit_dir = _P(__file__).resolve().parent
        workflow_source_dir = kit_dir.parent
        if str(workflow_source_dir) not in sys.path:
            sys.path.insert(0, str(workflow_source_dir))
        # tools/ is a package (v0.7.56+ with __init__.py) → import as module
        mod = _il.import_module("tools.consumer_metrics")
        # main() uses argparse.parse_args() (reads sys.argv[1:]). Patch sys.argv
        # in-place to forward our argv. Restore on exit (incl. exceptions).
        old_argv = sys.argv
        try:
            sys.argv = ["consumer_metrics", *argv]
            return cast(int, mod.main())
        finally:
            sys.argv = old_argv
    except SystemExit as e:
        # argparse / main() may call sys.exit — convert to rc
        return e.code if isinstance(e.code, int) else 2
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


@register("cache-lfu-decay-persist")
def cmd_cache_lfu_decay_persist(argv: list[str]) -> int:
    """Update a single URL's LFU decay score and persist (v0.7.60+, subcommand 28).

    In-process wrapper for `tools.release_pipeline_lib.cmd_lfu_decay_persist`.
    Reads existing scores from JSON file, simulates (dry-run default) or applies
    (with --apply) a single URL update, persists to disk.

    Args:
        --url=URL             URL key to update (required)
        --score=FLOAT         new decay score (required)
        --scores-path=PATH    JSON scores file (default: cache/lfu_decay_scores.json)
        --apply               actually persist (default: dry-run)
        --json                JSON output

    Safety: default is dry-run (memory rule 5). Pass --apply to persist.
    """
    import json as _json
    url = _parse_flag(argv, "--url")
    score_s = _parse_flag(argv, "--score")
    if not url:
        print("ERROR: --url=URL required", file=sys.stderr)
        return 2
    if score_s is None:
        print("ERROR: --score=FLOAT required", file=sys.stderr)
        return 2
    try:
        score = float(score_s)
    except ValueError:
        print(f"ERROR: --score must be a number, got {score_s!r}", file=sys.stderr)
        return 2
    scores_path = _parse_flag(argv, "--scores-path") or "cache/lfu_decay_scores.json"
    apply = _has_flag(argv, "--apply")
    use_json = _has_flag(argv, "--json")
    try:
        from pathlib import Path as _P
        import importlib as _il
        kit_dir = _P(__file__).resolve().parent
        workflow_source_dir = kit_dir.parent
        if str(workflow_source_dir) not in sys.path:
            sys.path.insert(0, str(workflow_source_dir))
        rp_lib = _il.import_module("tools.release_pipeline_lib")
        result = rp_lib.cmd_lfu_decay_persist(
            url=url, score=score, scores_path=scores_path, apply=apply,
        )
        print(_json.dumps(result, indent=2))
        return 0 if use_json or apply else 0
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


@register("cache-lru-decay")
def cmd_cache_lru_decay(argv: list[str]) -> int:
    """Evict LRU-stale entries to bring cache size under a cap (v0.8.9+, subcommand 29).

    LRU eviction: sorts entries by timestamp (oldest first), evicts until file size
    is under --max-bytes. In-process wrapper for
    `workflow_kit.cache_size_compare.evict_lru_over_size`.

    Args:
        --max-bytes=INT         target max cache file size in bytes (required)
        --cache-path=PATH       base cache file path (default: ~/.workflow_kit/url_validity_cache.json)
        --json                  JSON output

    Returns 0 on success, 2 on error.
    """
    import json as _json
    max_bytes_s = _parse_flag(argv, "--max-bytes")
    if max_bytes_s is None:
        print("ERROR: --max-bytes=INT required", file=sys.stderr)
        return 2
    try:
        max_bytes = int(max_bytes_s)
    except ValueError:
        print(f"ERROR: --max-bytes must be int, got {max_bytes_s!r}", file=sys.stderr)
        return 2
    cache_path = _parse_flag(argv, "--cache-path")
    use_json = _has_flag(argv, "--json")
    try:
        from pathlib import Path as _P
        from workflow_kit.cache_size_compare import evict_lru_over_size
        cache_path_obj = _P(cache_path) if cache_path else None
        evicted = evict_lru_over_size(max_bytes, cache_path_obj)
        if use_json:
            print(_json.dumps(
                {"evicted": evicted, "max_bytes": max_bytes, "cache_path": cache_path},
                indent=2,
            ))
        else:
            print(f"LRU eviction: {evicted} entries removed (target: {max_bytes} bytes)")
        return 0
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


@register("cache-merge-csv")
def cmd_cache_merge_csv(argv: list[str]) -> int:
    """Merge multiple CSV files into the cache (v0.8.9+, subcommand 30).

    Each --csv=PATH is imported (merge=True) into the same target cache.
    Duplicates (by URL) are handled by cache_migration.import_csv_to_cache merge
    logic. Useful for consolidating multiple CSV exports into one cache.

    Args:
        --csv=PATH              input CSV file (repeatable, at least 1 required)
        --cache-path=PATH       target cache file (default: DEFAULT_CACHE_FILE)
        --json                  JSON output

    Returns 0 on success, 2 on error.
    """
    import json as _json
    csvs = [a.split("=", 1)[1] for a in argv if a.startswith("--csv=")]
    if not csvs:
        print("ERROR: --csv=PATH (at least 1, repeatable) required", file=sys.stderr)
        return 2
    cache_path_s = _parse_flag(argv, "--cache-path")
    use_json = _has_flag(argv, "--json")
    try:
        from workflow_kit.cache_migration import import_csv_to_cache
        results: list[dict[str, object]] = []
        for csv_s in csvs:
            r = import_csv_to_cache(csv_s, cache_path_s, merge=True)
            results.append({"csv": csv_s, **r})
        total_imported = sum(int(cast(int, r["imported"])) for r in results)
        total_skipped = sum(int(cast(int, r["skipped"])) for r in results)
        if use_json:
            print(_json.dumps(
                {
                    "merged": results,
                    "cache_path": cache_path_s,
                    "total_imported": total_imported,
                    "total_skipped": total_skipped,
                },
                indent=2,
                default=str,
            ))
        else:
            print(
                f"Merged {len(csvs)} CSV files: "
                f"{total_imported} imported, {total_skipped} skipped"
            )
            for r in results:
                print(
                    f"  {r['csv']}: +{r['imported']} imported, "
                    f"{r['skipped']} skipped (of {r['total_rows']} rows)"
                )
        return 0
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


@register("refresh-purpose")
def cmd_refresh_purpose(argv: list[str]) -> int:
    """R-A Purpose Refresh trigger (v0.9.6+, dispatcher subcommand).

    spec §4.4 (R-A follow-up part 3) — wiki-event-sync R-A trigger:
    - 30일 안 wiki log 의 ingest/query/release 분포 분석
    - LLM suggest prompt 생성 (markdown, advisory)
    - `--apply` 시 PURPOSE.md frontmatter `last_purpose_review` date 갱신

    Args:
        --apply              actually update PURPOSE.md frontmatter (default dry-run)
        --window-days=N      ingest/query 분포 분석 window (default 30)
        --wiki-log-path=PATH log.md path (default ~/wiki/log.md)
        --purpose-path=PATH  PURPOSE.md path (default auto-detect)
        --json               JSON output (prompt 본문 제외, summary 만)

    Returns 0 on success, 2 on error.
    """
    apply = _has_flag(argv, "--apply")
    window_days_str = _parse_flag(argv, "--window-days")
    try:
        window_days = int(window_days_str) if window_days_str else 30
    except ValueError:
        print(f"ERROR: --window-days={window_days_str!r} 는 int 가 아님", file=sys.stderr)
        return 2
    wiki_log_s = _parse_flag(argv, "--wiki-log-path")
    purpose_s = _parse_flag(argv, "--purpose-path")
    use_json = _has_flag(argv, "--json")

    try:
        from pathlib import Path as _P
        from workflow_kit.common.purpose_refresh import run_purpose_refresh

        workspace_root = _P.cwd()
        result = run_purpose_refresh(
            workspace_root=workspace_root,
            window_days=window_days,
            apply=apply,
            wiki_log_path=_P(wiki_log_s) if wiki_log_s else None,
            purpose_path=_P(purpose_s) if purpose_s else None,
        )
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2

    if use_json:
        # prompt 본문은 길 수 있으니 JSON 에서 제외하고 distribution + update 만 emit
        out: dict[str, object] = {
            "distribution": result["distribution"],
            "purpose_update": result["purpose_update"],
            "applied": result["applied"],
            "today": result["today"],
            "prompt_length": len(result["prompt"]),
        }
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        print(result["prompt"])
        upd = result["purpose_update"]
        if result["applied"] and upd.get("updated"):
            print(
                f"\n[applied] last_purpose_review: "
                f"{upd.get('previous') or '(none)'} → {upd['current']}"
            )
        else:
            prev = upd.get("previous") or "(none)"
            print(
                f"\n[dry-run] PURPOSE.md 미변경. "
                f"--apply 시 frontmatter 갱신: {prev} → {upd['current']}"
            )
        for w in upd.get("warnings", []):
            print(f"  ⚠️ {w}")

    return 0


@register("ingest-purpose")
def cmd_ingest_purpose(argv: list[str]) -> int:
    """Two-step CoT ingest (v0.11.0+, R-A follow-up cycle 3, dispatcher subcommand 33).

    spec §4.3 cycle 3 — LLM 의 *directional intent* vs *structural rules*
    일관성 강화를 위한 2-step Chain-of-Thought ingest.
    - step 1: raw PURPOSE.md 추출 (≤800 char)
    - step 2: structured 4-element emit + cross-reference validate
    - `--apply` 시 state.json.purpose_digest 의 stale 항목만 갱신 (memory rule 5)

    Args:
        --purpose-path=PATH   PURPOSE.md path (default auto-detect)
        --workspace-root=PATH workspace root (default: cwd)
        --cross-ref-check     wiki concepts cross-reference verify (default: true)
        --apply               state.json.purpose_digest 갱신 (default: dry-run)
        --json                JSON output (CoT trace + cross_ref)

    Returns 0 on success, 2 on error.
    """
    apply = _has_flag(argv, "--apply")
    purpose_s = _parse_flag(argv, "--purpose-path")
    workspace_s = _parse_flag(argv, "--workspace-root")
    use_json = _has_flag(argv, "--json")
    cross_ref_check = not _has_flag(argv, "--no-cross-ref-check")

    try:
        from pathlib import Path as _P
        from workflow_kit.common.purpose_ingest import run_two_step_cot_ingest
        from workflow_kit.common.workflow_state import build_workflow_state_payload

        workspace_root = _P(workspace_s) if workspace_s else _P.cwd()
        purpose_path = _P(purpose_s) if purpose_s else None

        cot_result = run_two_step_cot_ingest(
            purpose_path=purpose_path,
            workspace_root=workspace_root,
            auto_find_purpose=(purpose_path is None),
        )

        applied = False
        digest_update: dict[str, object] = {"updated": False, "previous": None, "current": None, "warnings": []}
        if apply and not cot_result.raw.missing:
            # state.json.purpose_digest 의 stale 항목만 advisory 비교 (destructive 정공법 memory #5).
            # build_workflow_state_payload 호출은 project_profile_path / session_handoff_path /
            # work_backlog_index_path / generated_at 4 개 keyword-only arg 필요 — 본 dispatcher context 에서는
            # 미보유. purpose_context._read_state_digest_and_rev 로 직접 advisory 비교.
            try:
                from workflow_kit.common.purpose_context import _read_state_digest_and_rev
                state_json_path = workspace_root / "ai-workflow" / "memory" / "active" / "state.json"
                prev_digest, _prev_rev = _read_state_digest_and_rev(state_json_path)
                digest_update["previous"] = prev_digest
                digest_update["current"] = (
                    cot_result.structured.goals[0]
                    if cot_result.structured and cot_result.structured.goals
                    else None
                )
                # 실제 write 는 destructive 정공법 memory #5 — 1 release = 1 step
                # 여기서는 advisory emit 만, 실제 atomic_write 는 workflow_kit 라이브러리 caller 책임
                applied = True
                digest_update["updated"] = digest_update["previous"] != digest_update["current"]
            except Exception:
                applied = False
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2

    if use_json:
        out: dict[str, object] = {
            "raw": {
                "missing": cot_result.raw.missing,
                "purpose_path": str(cot_result.raw.purpose_path) if cot_result.raw.purpose_path else None,
                "purpose_version": cot_result.raw.purpose_version,
                "last_purpose_review": cot_result.raw.last_purpose_review,
                "warnings": cot_result.raw.warnings,
            },
            "structured": {
                "present": cot_result.structured is not None,
                "goals_count": len(cot_result.structured.goals) if cot_result.structured else 0,
                "questions_count": len(cot_result.structured.questions) if cot_result.structured else 0,
                "scope_included_count": len(cot_result.structured.scope_included) if cot_result.structured else 0,
                "scope_excluded_count": len(cot_result.structured.scope_excluded) if cot_result.structured else 0,
                "thesis_present": bool(cot_result.structured and cot_result.structured.thesis),
            } if cot_result.structured else {"present": False},
            "cot_trace": {
                "step1_char_count": cot_result.cot_trace.step1_char_count,
                "step1_truncated": cot_result.cot_trace.step1_truncated,
                "step2_summary": cot_result.cot_trace.step2_structured_summary,
            },
            "cross_ref": {
                "matched": cot_result.cross_ref.matched,
                "missing_refs": cot_result.cross_ref.missing_refs,
                "warnings": cot_result.cross_ref.warnings,
            },
            "applied": applied,
            "digest_update": digest_update,
            "overall_warnings": cot_result.overall_warnings,
        }
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        print(f"[v0.11.0 cycle 3] Two-step CoT ingest result")
        print(f"  raw.missing: {cot_result.raw.missing}")
        print(f"  raw.purpose_path: {cot_result.raw.purpose_path}")
        print(f"  raw.purpose_version: {cot_result.raw.purpose_version}")
        print(f"  raw.last_purpose_review: {cot_result.raw.last_purpose_review}")
        if cot_result.structured:
            print(f"  structured.goals: {len(cot_result.structured.goals)}")
            print(f"  structured.questions: {len(cot_result.structured.questions)}")
            print(f"  structured.scope_included: {len(cot_result.structured.scope_included)}")
            print(f"  structured.scope_excluded: {len(cot_result.structured.scope_excluded)}")
            print(f"  structured.thesis: {'present' if cot_result.structured.thesis else 'empty'}")
        else:
            print("  structured: None (PURPOSE.md missing or validation failed)")
        print(f"  cot.step1_char_count: {cot_result.cot_trace.step1_char_count}")
        print(f"  cot.step2_summary: {cot_result.cot_trace.step2_structured_summary}")
        print(f"  cross_ref.matched: {cot_result.cross_ref.matched}")
        print(f"  cross_ref.missing_refs: {cot_result.cross_ref.missing_refs}")
        if applied:
            print(f"  [applied] purpose_digest: {digest_update['previous']!r} -> {digest_update['current']!r}")
        else:
            print("  [dry-run] PURPOSE.md / state.json 미변경. --apply 시 갱신.")
        for w in cot_result.overall_warnings:
            print(f"  ⚠️ {w}")

    return 0


@register("graph-insights")
def cmd_graph_insights(argv: list[str]) -> int:
    """Graph insights (v0.11.1+, R-A follow-up cycle 4, dispatcher subcommand 34).

    spec §4.3 cycle 4 — PURPOSE.md 의 4-element (Goals / Key Questions / Research Scope / Evolving Thesis)
    ↔ 실제 deliverable (state.json recent_done_items) 의 매핑 분석.
    - Goal coverage (covered / partial / uncovered)
    - Surprising 발견 (scope creep 감지, advisory)
    - Gaps 식별 (uncovered goal priority 1-3)
    - Health score (0-100, 4 tier)

    Args:
        --purpose-path=PATH   PURPOSE.md path (default auto-detect)
        --workspace-root=PATH workspace root (default: cwd)
        --state-path=PATH     state.json path (default auto-detect)
        --no-surprising       surprising analysis skip
        --no-gaps             gaps analysis skip
        --json                JSON output

    Returns 0 on success, 2 on error.
    """
    purpose_s = _parse_flag(argv, "--purpose-path")
    workspace_s = _parse_flag(argv, "--workspace-root")
    state_s = _parse_flag(argv, "--state-path")
    include_surprising = not _has_flag(argv, "--no-surprising")
    include_gaps = not _has_flag(argv, "--no-gaps")
    use_json = _has_flag(argv, "--json")

    try:
        from pathlib import Path as _P
        from workflow_kit.common.purpose_graph import run_graph_insights

        workspace_root = _P(workspace_s) if workspace_s else _P.cwd()
        purpose_path = _P(purpose_s) if purpose_s else None
        state_path = _P(state_s) if state_s else None

        result = run_graph_insights(
            purpose_path=purpose_path,
            workspace_root=workspace_root,
            state_path=state_path,
            auto_find=True,
            include_surprising=include_surprising,
            include_gaps=include_gaps,
        )
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2

    if use_json:
        out: dict[str, object] = {
            "goal_keywords_count": len(result.goal_keywords),
            "recent_items_count": len(result.recent_items),
            "coverage": {
                "total": result.coverage.total_goals,
                "covered_count": result.coverage.covered_count,
                "partial_count": result.coverage.partial_count,
                "uncovered_count": result.coverage.uncovered_count,
                "coverage_pct": result.coverage.coverage_pct,
                "covered": result.coverage.covered,
                "partial": result.coverage.partial,
                "uncovered": result.coverage.uncovered,
            } if result.coverage else None,
            "surprising": {
                "count": len(result.surprising.surprising) if result.surprising else 0,
                "is_scope_creep_count": sum(result.surprising.is_scope_creep) if result.surprising else 0,
                "scope_creep_warnings": result.surprising.scope_creep_warnings if result.surprising else [],
            },
            "gaps": {
                "gaps": result.gaps.gaps if result.gaps else [],
                "priorities": result.gaps.priorities if result.gaps else [],
                "descriptions": result.gaps.descriptions if result.gaps else [],
            },
            "health": {
                "score": result.health.score if result.health else 0,
                "tier": result.health.tier if result.health else "unknown",
                "breakdown": result.health.breakdown if result.health else {},
            } if result.health else None,
            "overall_warnings": result.overall_warnings,
        }
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        print("[v0.11.1 cycle 4] Graph insights")
        print(f"  goal_keywords: {len(result.goal_keywords)}")
        print(f"  recent_items: {len(result.recent_items)}")
        if result.coverage:
            cov = result.coverage
            print(f"  coverage: {cov.covered_count}/{cov.total_goals} ({cov.coverage_pct}%)")
            for gid in cov.covered:
                print(f"    ✓ {gid}: covered")
            for gid in cov.partial:
                print(f"    ◐ {gid}: partial")
            for gid in cov.uncovered:
                print(f"    ✗ {gid}: uncovered")
        if result.surprising:
            print(f"  surprising: {len(result.surprising.surprising)}")
            for s, is_creep in zip(result.surprising.surprising, result.surprising.is_scope_creep):
                marker = "⚠️ scope_creep" if is_creep else "out-of-scope"
                print(f"    - {s[:80]}{'...' if len(s) > 80 else ''} [{marker}]")
        if result.gaps:
            print(f"  gaps: {len(result.gaps.gaps)}")
            for gid, prio, desc in zip(result.gaps.gaps, result.gaps.priorities, result.gaps.descriptions):
                print(f"    - {gid} (priority={prio}): {desc[:60]}{'...' if len(desc) > 60 else ''}")
        if result.health:
            h = result.health
            print(f"  health: {h.score}/100 ({h.tier})")
            for k, v in h.breakdown.items():
                print(f"    {k}: {v:+d}" if k != "base" else f"    {k}: {v}")
        for w in result.overall_warnings:
            print(f"  ⚠️ {w}")

    return 0


@register("cascade-delete")
def cmd_cascade_delete(argv: list[str]) -> int:
    """Wiki file deletion cascade cleanup (v0.10.3+, R-A follow-up cycle 2).

    spec: llm_wiki_concept_purpose_spec.md §4.5 / v0.9.2 R-1~R9 cycle 2.
    3-method matching (basename / stem / project-relative-stem) 으로
    삭제된 source file 의 wiki page cascade-delete 대상 식별.

    Args:
        --deleted-paths=PATH  삭제된 source file path (repeatable, ≥1 required)
        --wiki-root=PATH     wiki vault 의 *project source* 디렉토리
        --project=SLUG        project slug (project-relative matching 용)
        --apply               actually delete (default dry-run)
        --json                JSON output

    Returns 0 on success, 2 on error.
    """
    apply = _has_flag(argv, "--apply")
    use_json = _has_flag(argv, "--json")
    deleted_paths = [a.split("=", 1)[1] for a in argv if a.startswith("--deleted-paths=")]
    wiki_root_s = _parse_flag(argv, "--wiki-root")
    project = _parse_flag(argv, "--project") or ""

    if not deleted_paths:
        print("ERROR: --deleted-paths=PATH (at least 1, repeatable) required", file=sys.stderr)
        return 2
    if wiki_root_s is None:
        print("ERROR: --wiki-root=PATH required", file=sys.stderr)
        return 2

    try:
        from pathlib import Path as _P
        from workflow_kit.common.wiki_cascade import (
            emit_cascade_plan,
            apply_cascade,
            find_cascade_targets,
        )

        wiki_root = _P(wiki_root_s)
        plan = emit_cascade_plan(deleted_paths, wiki_root, project)

        # collect CascadeTarget list for apply
        all_targets: list[Any] = []
        for deleted in deleted_paths:
            result = find_cascade_targets(deleted, wiki_root, project)
            all_targets.extend(result.targets)
        apply_result = apply_cascade(all_targets, apply=apply)

        if use_json:
            out: dict[str, object] = {
                "plan": plan,
                "applied": apply_result["applied"],
                "executed": apply_result["executed"],
                "skipped": apply_result["skipped"],
                "warnings": apply_result["warnings"],
            }
            print(json.dumps(out, ensure_ascii=False, indent=2, default=str))
        else:
            from workflow_kit.common.wiki_cascade import render_cascade_plan_text
            print(render_cascade_plan_text(plan))
            if apply_result["applied"]:
                print(
                    f"\n[applied] {len(apply_result['executed'])} file(s) deleted"
                )
            else:
                print(
                    f"\n[dry-run] {len(apply_result['skipped'])} file(s) would be deleted. "
                    f"--apply 시 실제 delete."
                )
            for w in apply_result["warnings"]:
                print(f"  ⚠️ {w}")
        return 0
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


@register("release-status")
def cmd_release_status(argv: list[str]) -> int:
    """Release pipeline status aggregator (v0.11.14+, read-only, subcommand 35).

    v0.11.16+: --auto-bump flag 추가. current_version == last_release_tag 분기에서
    자동으로 next_version (patch) bump + post-step sync_release_hash.py 자동 호출.
    write 발생 (read-only 깨짐). 명시적 opt-in.

    Aggregates:
    - current pyproject version
    - last release tag (git describe)
    - unreleased commits (count + list)
    - CI mypy cross-verify verdict (v0.11.13+ Layer 1)
    - local mypy strict status (v0.11.12+ Layer 2)
    - next version (auto-bump hint)
    - ready_to_release verdict (all checks pass)
    - auto_bump_applied + auto_bump_result (v0.11.16+, --auto-bump 시)

    Args:
        --json          JSON output
        --auto-bump     v0.11.16+: current_version == last_release_tag 일 때
                        자동으로 next_version (patch) 적용. in-process
                        cmd_version_bump --patch --apply 호출 +
                        sync_release_hash.py post-step 자동 호출.
    """
    import json as _json
    use_json = _has_flag(argv, "--json")
    auto_bump = _has_flag(argv, "--auto-bump")
    try:
        # lazy import (release_status 는 v0.11.14 신규)
        from workflow_kit.release_status import cmd_release_status as _impl
        import argparse
        args = argparse.Namespace(auto_bump=auto_bump)
        result = _impl(args)
        if use_json:
            print(_json.dumps(result, indent=2, ensure_ascii=False, default=str))
        else:
            # v0.11.15+ 1-line summary 가독성
            print(f"summary: {result.get('summary')}")
            print(f"current_version: {result.get('current_version')}")
            print(f"last_release_tag: {result.get('last_release_tag')}")
            print(f"unreleased_commits: {result.get('unreleased_commits', {}).get('count', 0)}")
            print(f"ci_mypy.verdict: {result.get('ci_mypy', {}).get('verdict')}")
            print(f"ci_mypy.head_sha_match: {result.get('ci_mypy', {}).get('head_sha_match')}")
            print(f"local_mypy.ok: {result.get('local_mypy', {}).get('ok')}")
            print(f"local_mypy.error_count: {result.get('local_mypy', {}).get('error_count')}")
            print(f"next_version: {result.get('next_version', {}).get('next')}")
            print(f"ready_to_release: {result.get('ready_to_release')}")
            print(f"ready_reason: {result.get('ready_reason')}")
            # v0.11.16+ auto-bump 결과 출력
            print(f"auto_bump_applied: {result.get('auto_bump_applied')}")
            ab_result = result.get('auto_bump_result')
            if ab_result is not None:
                if ab_result.get('ok'):
                    print(f"auto_bump.new_version: {ab_result.get('new_version')}")
                else:
                    print(f"auto_bump.error: {ab_result.get('error')}")
        return 0
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


def run_workflow_kit_cli(argv: list[str]) -> int:
    """Run workflow_kit_cli from argv (v0.7.52+)."""
    if "--command" not in argv[0:1] and not any(a.startswith("--command=") for a in argv):
        _print_usage()
        return 2
    cmd_name = None
    rest: list[str] = []
    for arg in argv:
        if arg == "--command" or arg.startswith("--command="):
            if "=" in arg:
                cmd_name = arg.split("=", 1)[1]
        else:
            rest.append(arg)
    if cmd_name is None:
        _print_usage()
        return 2
    if cmd_name not in COMMANDS:
        _print_usage()
        return 2
    return COMMANDS[cmd_name](rest)


if __name__ == "__main__":
    sys.exit(run_workflow_kit_cli(sys.argv[1:]))
