# standard-ai-workflow-kit: v1.0.0-beta

"""workflow_kit.cli.doctor — v0.7.4 CLI wrapper for 7 baseline compliance evaluation.

Usage:
    python -m workflow_kit.cli.doctor                       # all 7 baseline
    python -m workflow_kit.cli.doctor --baseline=security   # 1 baseline
    python -m workflow_kit.cli.doctor --json                # JSON output
    python -m workflow_kit.cli.doctor --pretty              # pretty table
    python -m workflow_kit.cli.doctor --exit-on-fail        # exit per config.fail_on
    python -m workflow_kit.cli.doctor --config-path workflow-source   # 설정 위치 명시

v0.7.3 의 7 baseline dispatcher (security / testing / performance / security-auth /
testing-property-based / performance-memory / resiliency) 를 CLI 로 expose.
v0.7.4 추가: 7 baseline 통합 evaluate_all + pretty table 출력 + --exit-on-fail.
v0.7.7 추가: load_config() integration (v0.7.6 의 [tool.workflow-doctor] 5 field 사용).
  - fail_on (CI threshold) 의 *enum* 적용: compliant | advisory | non_compliant
  - partial_rules / opt_in / thresholds / excluded_paths 의 *summary 표시* (deferred follow-up: state-aware variant)
  - --show-config flag: 현재 load 된 config 의 to_dict() 출력
v1.0.5 (§2.49) 수정: **기준 경로와 설정 출처**.
  - `--project-root` default 가 모듈 위치 기반(`parent × 5`)이라 이 저장소에서
    `/home/yklee/repos` = 저장소 루트의 **두 단계 위** 를 가리켰다. 설치본에서는 아예
    사용자 프로젝트와 무관한 경로다. 이제 **cwd** 가 기본.
  - `--config-path` 신설. `[tool.workflow-doctor]` 가 workspace root 가 아닌 곳에 있는
    저장소(이 저장소가 그렇다 — `workflow-source/pyproject.toml`)를 위해.
  - 출력 3종(`--show-config` / `--json` / pretty)에 **config_provenance** 를 싣는다.
    설정이 적용된 것과 조용히 기본값으로 떨어진 것이 구별되지 않아 위 결함이 오래
    살아남았다 (§2.47 과 같은 축).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from workflow_kit.common.metadata import DoctorConfig

# v1.0.5(§2.49): 예전 default 는 `Path(__file__).resolve().parent × 5` 였다.
# 이 저장소에서 그 값은 `/home/yklee/repos` — **저장소 루트의 두 단계 위**다. 그리고
# kit 이 site-packages 에 설치되면 그 경로는 사용자의 프로젝트와 아무 관계도 없다.
# 모듈 위치로 사용자의 workspace 를 추측할 수 있다는 전제 자체가 틀렸다.
#
# 이제 **cwd** 를 기본으로 쓴다. 추측이 아니라 호출자가 서 있는 자리이고, 틀렸을 때
# 산출물의 provenance 로 곧바로 드러난다.
def default_project_root() -> Path:
    """`--project-root` 기본값 — 모듈 위치가 아니라 **cwd**."""
    return Path.cwd()

# 7 baseline dispatcher
ALL_BASELINES = [
    "security",
    "testing",
    "performance",
    "security-auth",
    "testing-property-based",
    "performance-memory",
    "resiliency",
]


def evaluate(project_root: Path, baseline: str | None = None, config: DoctorConfig | None = None) -> dict[str, Any]:
    """7 baseline compliance 평가 (single or all).

    v0.7.8+ config (DoctorConfig) 인자 추가. config 있으면:
    1. project_root/state.json read → in-memory state dict
    2. config.partial_rules[baseline] 가 있으면 state[f"{baseline}_baseline"]["partial_rules"] 에 merge
    3. config.opt_in[baseline] 가 있으면 state[f"{baseline}_baseline"]["status"] = "enabled" + opt_in rule list
    4. merged state 로 evaluate_compliance / evaluate_all 호출 (state=...)

    즉 v0.7.7 의 *display only* (config partial: ... footer) 가 *actual apply* 로 격상.

    Args:
        project_root: 프로젝트 루트 (state.json 위치)
        baseline: 단일 baseline name, None 이면 7 baseline 모두
        config: DoctorConfig (optional). None 이면 v0.7.7 behavior (state.json only).

    Returns:
        dict with single baseline result or all 7 baseline results
    """
    from workflow_kit.common.contracts.baselines import (
        evaluate_all,
        evaluate_compliance,
    )
    from workflow_kit.common.contracts.baselines import _read_state_json

    # v0.7.8+ in-memory state override
    state: dict[str, Any] | None = None
    if config is not None:
        state = _read_state_json(project_root)
        # config key (hyphen, e.g. "security-auth") → baselines.py key (underscore, "security_auth")
        # state key 가 f"{baseline}_baseline" 형식 — _get_partial_rules(state, "security_auth")
        # 가 state["security_auth_baseline"] 찾으므로 normalize 필요
        def _normalize_key(bl_name: str) -> str:
            return bl_name.replace("-", "_")
        # config.partial_rules[baseline] → state[f"{baseline}_baseline"]["partial_rules"] merge
        for bl_name, rules in config.partial_rules.items():
            if not rules:
                continue
            bl_key = f"{_normalize_key(bl_name)}_baseline"
            bl_config = state.setdefault(bl_key, {})
            existing_partial = bl_config.get("partial_rules", [])
            # union (state 가 우선, config 가 추가)
            merged = list(dict.fromkeys(list(existing_partial) + list(rules)))
            bl_config["partial_rules"] = merged
        # config.opt_in[baseline] → state[f"{baseline}_baseline"]["status"] = "enabled" + opt_in rule list
        for bl_name, opt_in_rules in config.opt_in.items():
            if not opt_in_rules:
                continue
            bl_key = f"{_normalize_key(bl_name)}_baseline"
            bl_config = state.setdefault(bl_key, {})
            bl_config["status"] = "enabled"
            # opt_in rule 도 partial_rules 에 add (state partial mode hard constraint 의 일종)
            existing_partial = bl_config.get("partial_rules", [])
            merged = list(dict.fromkeys(list(existing_partial) + list(opt_in_rules)))
            bl_config["partial_rules"] = merged

    if baseline:
        cs = evaluate_compliance(project_root, baseline, state=state)
        return {baseline: cs.to_dict()}

    all_summaries = evaluate_all(project_root, state=state)
    return {name: cs.to_dict() for name, cs in all_summaries.items()}


def render_pretty(
    results: dict[str, Any],
    config: DoctorConfig | None = None,
    provenance: dict[str, str] | None = None,
) -> str:
    """7 baseline 결과를 사람이 읽기 좋은 table 로.

    v0.7.7+: config (DoctorConfig) 인자 추가. config 있으면:
    - footer 에 fail_on threshold 명시
    - config 의 partial_rules / opt_in 표시 (deferred: 실제 적용은 follow-up)

    v1.0.5(§2.49): provenance 인자 추가. **설정이 어디서 왔는지를 footer 첫 줄에 적는다** —
    기본값으로 떨어진 것을 읽는 사람이 알아야 표의 숫자를 해석할 수 있다.
    """
    from workflow_kit.common.metadata import DoctorConfig

    lines = []
    lines.append("=" * 78)
    lines.append(f" Workflow Doctor — 7 Baseline Compliance Report (v0.7.7)")
    lines.append("=" * 78)
    for baseline_name, cs in results.items():
        # status icon
        status_icon = {
            "compliant": "✓",
            "advisory": "△",
            "non_compliant": "✗",
            "not_applicable": "—",
        }.get(cs["status"], "?")

        lines.append(f"\n[{status_icon}] {baseline_name}: {cs['status']}")
        if cs.get("partial_rules"):
            lines.append(f"   partial rules: {', '.join(cs['partial_rules'])}")
        # v0.7.7+ config.partial_rules 가 있으면 표시 (state.json override 후보)
        if config and config.partial_rules.get(baseline_name):
            config_partial = ", ".join(config.partial_rules[baseline_name])
            lines.append(f"   config partial: {config_partial} (state.json 부재 시 fallback)")
        # v0.7.7+ opt_in 표시
        if config and config.opt_in.get(baseline_name):
            config_opt_in = ", ".join(config.opt_in[baseline_name])
            lines.append(f"   config opt_in: {config_opt_in} (default disable, opt-in 시 enable)")
        lines.append(f"   {'rule_id':<14} {'title':<40} {'status':<14}")
        lines.append(f"   {'-' * 70}")
        for r in cs["results"]:
            icon = {
                "compliant": "✓",
                "advisory": "△",
                "non_compliant": "✗",
                "not_applicable": "—",
            }.get(r["status"], "?")
            title_short = r["title"][:38] + ".." if len(r["title"]) > 40 else r["title"]
            lines.append(f"   {icon} {r['rule_id']:<12} {title_short:<40} {r['status']:<14}")
            if r.get("notes"):
                notes_short = r["notes"][:70] + "..." if len(r["notes"]) > 70 else r["notes"]
                lines.append(f"      └─ {notes_short}")
    lines.append("\n" + "=" * 78)
    # summary
    total = sum(len(cs["results"]) for cs in results.values())
    compliant = sum(
        1
        for cs in results.values()
        for r in cs["results"]
        if r["status"] == "compliant"
    )
    non_compliant = sum(
        1
        for cs in results.values()
        for r in cs["results"]
        if r["status"] == "non_compliant"
    )
    advisory = sum(
        1
        for cs in results.values()
        for r in cs["results"]
        if r["status"] == "advisory"
    )
    lines.append(
        f" Summary: {total} rule total, "
        f"{compliant} compliant, "
        f"{advisory} advisory, "
        f"{non_compliant} non_compliant"
    )
    # v1.0.5+ 출처 먼저 — 기본값으로 떨어졌으면 그 사실을 숫자보다 먼저 본다.
    if provenance is not None:
        source = provenance.get("config_source", "?")
        consulted = provenance.get("config_consulted_path", "?")
        if source == "default":
            reason = provenance.get("config_default_reason", "?")
            lines.append(
                f" Config source: default ({reason}) — {consulted} → "
                f"**선언한 설정이 적용되지 않았다**. --config-path 로 명시할 수 있다."
            )
        else:
            lines.append(f" Config source: {source} — {consulted}")
        lines.append(f" Project root: {provenance.get('project_root', '?')} (state.json 기준)")

    # v0.7.7+ config footer
    if config is not None:
        lines.append(f" Config: fail_on={config.fail_on} (severity ≥ {config.fail_on} → exit 1)")
        if config.thresholds:
            thresholds_str = ", ".join(f"{k}={v}" for k, v in config.thresholds.items())
            lines.append(f"         thresholds: {thresholds_str}")
        if config.excluded_paths:
            excluded_str = ", ".join(config.excluded_paths)
            lines.append(f"         excluded_paths: {excluded_str}")
    lines.append("=" * 78)
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    from workflow_kit.common.metadata import load_config_with_provenance, should_fail

    parser = argparse.ArgumentParser(
        prog="workflow-doctor",
        description="Workflow 7 baseline compliance evaluator (v0.7.7+)",
    )
    parser.add_argument(
        "--project-root",
        type=Path,
        default=None,
        help="workspace root (state.json 을 찾는 기준). default: cwd",
    )
    parser.add_argument(
        "--config-path",
        type=Path,
        default=None,
        help="[tool.workflow-doctor] 를 담은 pyproject.toml (또는 그것이 있는 디렉터리). "
             "생략하면 --project-root 를 묻는다. 어느 파일을 물었고 설정을 얻었는지는 "
             "--show-config / --json 산출물의 config_provenance 에 남는다.",
    )
    parser.add_argument(
        "--baseline",
        choices=ALL_BASELINES + ["all"],
        default="all",
        help="평가할 baseline (default: all)",
    )
    output_group = parser.add_mutually_exclusive_group()
    output_group.add_argument("--json", action="store_true", help="JSON 출력")
    output_group.add_argument("--pretty", action="store_true", help="테이블 형식 출력 (default)")
    parser.add_argument(
        "--exit-on-fail",
        action="store_true",
        help=f"config.fail_on threshold 이상 발견 시 exit 1 (default fail_on=non_compliant)",
    )
    parser.add_argument(
        "--show-config",
        action="store_true",
        help="현재 load 된 [tool.workflow-doctor] config 출력 (5 field)",
    )

    args = parser.parse_args(argv)
    baseline = None if args.baseline == "all" else args.baseline
    project_root = args.project_root if args.project_root is not None else default_project_root()

    # v0.7.7+ load_config integration
    # v1.0.5(§2.49): **무엇을 물었고 얻었는지를 함께 낸다.** load_config 는 어떤 경우에도
    # 실패하지 않아서, 선언한 설정이 적용된 것과 조용히 기본값으로 떨어진 것이 출력에서
    # 구별되지 않았다 — 잘못된 기본 경로가 그래서 오래 살아남았다 (§2.47 과 같은 축).
    config, provenance = load_config_with_provenance(args.config_path or project_root)
    provenance_out = {"project_root": str(project_root), **provenance.to_dict()}

    # --show-config: config 만 출력하고 종료
    if args.show_config:
        # 기존 5 field 는 **top-level 그대로** 둔다 (v0.7.7 계약). 출처는 옆에 붙인다 —
        # 소비자를 깨지 않으면서 "이 값이 어디서 왔는지" 를 같은 산출물에서 읽게 한다.
        print(json.dumps(
            {**config.to_dict(), "config_provenance": provenance_out},
            indent=2, ensure_ascii=False,
        ))
        return 0

    try:
        results = evaluate(project_root, baseline, config=config)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2

    if args.json:
        # v0.7.7+ JSON output 에 config 추가. v1.0.5: 출처도 함께.
        out = {
            "config": config.to_dict(),
            "config_provenance": provenance_out,
            "results": results,
        }
        print(json.dumps(out, indent=2, ensure_ascii=False))
    else:
        # pretty = default
        print(render_pretty(results, config=config, provenance=provenance_out))

    if args.exit_on_fail:
        # v0.7.7+ should_fail() integration — config.fail_on enum 기반
        for cs in results.values():
            if should_fail(cs["status"], config):
                return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
