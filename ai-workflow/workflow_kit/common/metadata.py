# standard-ai-workflow-kit: v1.0.0-beta

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
    # v1.0.2: `type: ignore[no-redef, import-not-found]` 제거 — 둘 다 발동하지 않는다.
    # python_version=3.10 에서 위 if 분기가 unreachable 이라 no-redef 가 생기지 않고,
    # import-not-found 는 config 의 ignore_missing_imports=true 가 이미 덮는다.
    import tomli as tomllib


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


#: `config_source` 어휘 — 설정이 **어디서 왔는지**. 판정이 아니라 출처다.
CONFIG_SOURCE_PYPROJECT = "pyproject"
CONFIG_SOURCE_DEFAULT = "default"

#: default 로 떨어진 *이유*. "설정을 안 썼다" 와 "설정을 썼는데 못 읽었다" 는 다른 사실이다.
CONFIG_REASON_FILE_MISSING = "file_missing"
CONFIG_REASON_SECTION_MISSING = "section_missing"
CONFIG_REASON_PARSE_ERROR = "parse_error"


@dataclass
class ConfigProvenance:
    """설정을 **어디에 물었고 무엇을 얻었는지**.

    `load_config` 는 어떤 경우에도 실패하지 않는다(운영 안정성). 좋은 성질이지만,
    그 대가로 "선언한 설정이 적용됐다" 와 "조용히 기본값으로 떨어졌다" 가 산출물에서
    구별되지 않았다 — 실제로 `run_workflow_linter` 는 저장소 루트보다 한 단계 위를
    물어 왔고, 그래서 `[tool.workflow-doctor]` 가 한 번도 적용된 적이 없었는데
    아무 신호도 없었다. 이제 물어본 경로와 결과를 함께 돌려준다.

    Attributes:
        consulted: 물어본 pyproject.toml 경로 (항상 있다).
        path: 실제로 읽어 설정을 얻은 파일. default 로 떨어졌으면 None.
        source: `CONFIG_SOURCE_PYPROJECT` | `CONFIG_SOURCE_DEFAULT`.
        reason: default 일 때 그 이유 (`CONFIG_REASON_*`). 아니면 None.
    """

    consulted: Path
    path: Path | None
    source: str
    reason: str | None = None

    def to_dict(self) -> dict[str, str]:
        """JSON-serializable dict (skill 산출물의 `source_context` 용, 값은 전부 str)."""
        out = {
            "config_consulted_path": str(self.consulted),
            "config_source": self.source,
        }
        if self.path is not None:
            out["config_path"] = str(self.path)
        if self.reason is not None:
            out["config_default_reason"] = self.reason
        return out


def _default_config() -> DoctorConfig:
    """기본 config (pyproject.toml 에 section 부재 시)."""
    return DoctorConfig(
        partial_rules={},
        opt_in={},
        thresholds={"score_alert": 0.3, "memory_alert_mb": 100.0},
        excluded_paths=["build/*", ".venv/*", ".venv-build/*", "__pycache__/*"],
        fail_on="non_compliant",
    )


def resolve_config_path(project_root: Path | str | None = None) -> Path:
    """물어볼 pyproject.toml 경로를 정한다 — **탐색하지 않는다**.

    - `None`: cwd 의 `pyproject.toml`. **상위 dir 을 거슬러 올라가지 않는다**
      (이전 docstring 은 "cwd 기준 상위 dir 탐색" 이라고 적고 있었지만 코드는 그런
      적이 없다. 안 하는 일을 한다고 적어 두면 호출자가 경로를 명시하지 않는다).
    - 파일 경로를 주면 그 파일을 그대로 쓴다 (`--config-path a/b/pyproject.toml`).
    - 디렉터리를 주면 그 아래 `pyproject.toml`.
    """
    if project_root is None:
        return Path.cwd() / "pyproject.toml"
    root = Path(project_root)
    if root.is_file():
        return root
    return root / "pyproject.toml"


def load_config_with_provenance(
    project_root: Path | str | None = None,
) -> tuple[DoctorConfig, ConfigProvenance]:
    """`load_config` + **어디에 물어 무엇을 얻었는지**.

    해석 로직은 여기 한 곳뿐이고 `load_config` 는 이걸 부른다 — 출처를 보고하는
    경로와 실제로 설정을 쓰는 경로가 갈라지면, 보고가 사실이 아니게 된다.
    """
    pyproject = resolve_config_path(project_root)

    if not pyproject.is_file():
        return _default_config(), ConfigProvenance(
            consulted=pyproject, path=None,
            source=CONFIG_SOURCE_DEFAULT, reason=CONFIG_REASON_FILE_MISSING,
        )

    try:
        with pyproject.open("rb") as f:
            data = tomllib.load(f)
    except (tomllib.TOMLDecodeError, OSError):
        return _default_config(), ConfigProvenance(
            consulted=pyproject, path=None,
            source=CONFIG_SOURCE_DEFAULT, reason=CONFIG_REASON_PARSE_ERROR,
        )

    section = data.get("tool", {}).get("workflow-doctor")
    if not isinstance(section, dict):
        return _default_config(), ConfigProvenance(
            consulted=pyproject, path=None,
            source=CONFIG_SOURCE_DEFAULT, reason=CONFIG_REASON_SECTION_MISSING,
        )
    provenance = ConfigProvenance(
        consulted=pyproject, path=pyproject, source=CONFIG_SOURCE_PYPROJECT,
    )

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
    ), provenance


def load_config(project_root: Path | str | None = None) -> DoctorConfig:
    """pyproject.toml 의 [tool.workflow-doctor] section 을 load.

    - project_root: pyproject.toml 이 있는 디렉터리, 또는 toml 파일 자체.
      `None` 이면 **cwd 의 pyproject.toml** (상위 dir 탐색 ❌).
    - section 부재 / file 부재 / invalid TOML 시 default fallback.
    - 절대 실패하지 않음 (운영 안정성). 그래서 **default 로 떨어진 사실이 조용하다** —
      그것을 구별해야 하면 `load_config_with_provenance` 를 쓴다.
    """
    config, _provenance = load_config_with_provenance(project_root)
    return config


def should_fail(status: str, config: DoctorConfig) -> bool:
    """현재 status 가 fail_on 임계값 이상인지 검증.

    severity 순서: non_compliant (3) > advisory (2) > compliant (1) > not_applicable (0)
    """
    severity = {"not_applicable": 0, "compliant": 1, "advisory": 2, "non_compliant": 3}
    threshold = severity.get(config.fail_on, 3)
    current = severity.get(status, 0)
    return current >= threshold and current > 0
