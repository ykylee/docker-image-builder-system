# standard-ai-workflow-kit: v0.15.19-beta

"""workflow-source 의 [tool.workflow-doctor] pyproject.toml metadata loader (v0.7.6+).

project 의 pyproject.toml 에 [tool.workflow-doctor] section 이 있으면 load,
없거나 invalid 면 default fallback. partial_rules / opt_in / thresholds /
excluded_paths / fail_on 등 *workflow 외부화 config* 의 SSOT.

Usage:
    from workflow_kit.common.metadata import load_config, DoctorConfig

    config = load_config()  # project_root 인자 생략 시 cwd 기준
    if config.partial_rules.get("resiliency"):
        for rule in config.partial_rules["resiliency"]:
            # rule = "RES-WF-01" — hard constraint
            ...
    if config.fail_on == "non_compliant" and cs.status == "non_compliant":
        sys.exit(1)

Reference:
- workflow-source/pyproject.toml 의 [tool.workflow-doctor] section (선택)
- workflow_kit.common.contracts.baselines.evaluate_compliance() (rule spec)
- workflow_kit.cli.doctor (v0.7.4+, 이 metadata 의 1차 consumer)
- memory #3 "Runtime tooling 패턴" — 1회용 helper → 정식 CLI tool + config layer
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# pyproject.toml 의 [tool.workflow-doctor] section key
SECTION = "tool.workflow-doctor"

# tomllib (3.11+) / tomli (3.10) 분기
if sys.version_info >= (3, 11):
    import tomllib
else:  # pragma: no cover
    import tomli as tomllib  # type: ignore[no-redef, import-not-found]


@dataclass
class DoctorConfig:
    """workflow-doctor 의 외부화 config.

    Attributes:
        partial_rules: baseline 별 hard constraint rule list. evaluate_compliance 의
            partial_rules 인자로 전달. 해당 rule 의 non_compliant 는 hard fail.
        opt_in: baseline 별 opt-in rule dict. opt-in rule 은 default disable,
            명시적 enable 시에만 evaluate 대상.
        thresholds: alert threshold dict. score_alert (0.0~1.0), memory_alert_mb 등.
        excluded_paths: lint skip glob list (e.g. ["build/*", ".venv/*"]).
        fail_on: evaluate_compliance 결과 status 가 이 값 이상이면 exit 1.
            "compliant" | "advisory" | "non_compliant". default: "non_compliant".
    """

    partial_rules: dict[str, list[str]] = field(default_factory=dict)
    opt_in: dict[str, list[str]] = field(default_factory=dict)
    thresholds: dict[str, float] = field(default_factory=dict)
    excluded_paths: list[str] = field(default_factory=list)
    fail_on: str = "non_compliant"

    def to_dict(self) -> dict[str, Any]:
        """JSON-serializable dict 변환 (CI integration 용)."""
        return {
            "partial_rules": self.partial_rules,
            "opt_in": self.opt_in,
            "thresholds": self.thresholds,
            "excluded_paths": self.excluded_paths,
            "fail_on": self.fail_on,
        }


def _default_config() -> DoctorConfig:
    """기본 config (pyproject.toml 에 section 부재 시)."""
    return DoctorConfig(
        partial_rules={},
        opt_in={},
        thresholds={"score_alert": 0.3, "memory_alert_mb": 100.0},
        excluded_paths=["build/*", ".venv/*", ".venv-build/*", "__pycache__/*"],
        fail_on="non_compliant",
    )


def load_config(project_root: Path | str | None = None) -> DoctorConfig:
    """pyproject.toml 의 [tool.workflow-doctor] section 을 load.

    - project_root: pyproject.toml 위치. None 이면 cwd 기준 상위 dir 탐색.
    - section 부재 / file 부재 / invalid TOML 시 default fallback.
    - 절대 실패하지 않음 (운영 안정성).
    """
    if project_root is None:
        project_root = Path.cwd()
    elif isinstance(project_root, str):
        project_root = Path(project_root)

    pyproject = project_root / "pyproject.toml"
    if not pyproject.exists():
        return _default_config()

    try:
        with pyproject.open("rb") as f:
            data = tomllib.load(f)
    except (tomllib.TOMLDecodeError, OSError):
        return _default_config()

    section = data.get("tool", {}).get("workflow-doctor")
    if not isinstance(section, dict):
        return _default_config()

    # partial_rules: dict[str, list[str]] 검증
    partial_raw = section.get("partial_rules", {})
    partial_rules: dict[str, list[str]] = {}
    if isinstance(partial_raw, dict):
        for k, v in partial_raw.items():
            if isinstance(v, list) and all(isinstance(x, str) for x in v):
                partial_rules[k] = list(v)

    # opt_in: 동일 검증
    opt_in_raw = section.get("opt_in", {})
    opt_in: dict[str, list[str]] = {}
    if isinstance(opt_in_raw, dict):
        for k, v in opt_in_raw.items():
            if isinstance(v, list) and all(isinstance(x, str) for x in v):
                opt_in[k] = list(v)

    # thresholds: dict[str, float]
    thresholds_raw = section.get("thresholds", {})
    thresholds: dict[str, float] = {}
    if isinstance(thresholds_raw, dict):
        for k, v in thresholds_raw.items():
            if isinstance(v, (int, float)):
                thresholds[k] = float(v)

    # excluded_paths: list[str]
    excluded_raw = section.get("excluded_paths", [])
    excluded_paths: list[str] = []
    if isinstance(excluded_raw, list):
        excluded_paths = [x for x in excluded_raw if isinstance(x, str)]

    # fail_on: enum 검증
    fail_on_raw = section.get("fail_on", "non_compliant")
    fail_on = fail_on_raw if fail_on_raw in ("compliant", "advisory", "non_compliant") else "non_compliant"

    return DoctorConfig(
        partial_rules=partial_rules,
        opt_in=opt_in,
        thresholds=thresholds,
        excluded_paths=excluded_paths,
        fail_on=fail_on,
    )


def should_fail(status: str, config: DoctorConfig) -> bool:
    """현재 status 가 fail_on 임계값 이상인지 검증.

    severity 순서: non_compliant (3) > advisory (2) > compliant (1) > not_applicable (0)
    """
    severity = {"not_applicable": 0, "compliant": 1, "advisory": 2, "non_compliant": 3}
    threshold = severity.get(config.fail_on, 3)
    current = severity.get(status, 0)
    return current >= threshold and current > 0
