"""contract-drift-checker core.

`check_drift(input_data)` 가 `packages/shared-contract` 의 enum/field 와
canonical 문서 `docs/sdlc/contracts/01-shared-build-contract-baseline.md` 의
enum block / BuildRequest payload 표를 비교하고 drift 리포트를 만든다.

자세한 동작 규칙은 같은 디렉터리의 SKILL.md §1/§2 를 따른다.
"""

from __future__ import annotations

import importlib
import importlib.util
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

SKILL_VERSION = "v2"

# Python-side frozenset ↔ TS export mapping for the skill/MCP layer.
# TASK-061 introduced `apps/skill_mcp/contract/canonical.py` as the
# skill/MCP-side source-of-truth. Each Python constant MUST mirror the
# corresponding TS export; this mapping is what the drift checker cross-
# verifies in `checkPython` mode (on by default).
PYTHON_CANONICAL_MAP: dict[str, tuple[str, str, str]] = {
    # python_attr -> (ts_export, ts_filename, group_label)
    "CANONICAL_BUILD_STATUSES": ("canonicalBuildStatuses", "status.ts", "skillBuildStatuses"),
    "EXECUTION_STATUSES": ("executionStatuses", "status.ts", "executionStatuses"),
    "BUILD_PHASES": ("buildPhases", "phase.ts", "skillPhases"),
    "ERROR_CODES": ("errorCodes", "errors.ts", "skillErrorCodes"),
    # TASK-069: runner registry status enum (TS/Python/Go 3-way sync anchor).
    # admin menu 가 DISABLED 로 토글하면 Build Server 가 후속 claim 을 거부 —
    # 본 sync 가 깨지면 ADMIN UI 의 토글이 server 의 claim gate 와 정합이
    # 깨질 수 있다.
    "RUNNER_STATUSES": ("runnerStatuses", "runner-registry.ts", "skillRunnerStatuses"),
}
PYTHON_CANONICAL_MODULE = "apps.skill_mcp.contract.canonical"

# Go-side const ↔ TS export mapping for the Runner layer.
# TASK-062 introduced `apps/runner/internal/contract/` as the Go-side
# source-of-truth for phase / status / errorCode constants. Each
# const block file holds `ConstName = "VALUE"` declarations that the
# drift checker parses via regex and compares against the TS export.
#
# Group label `goXxx` distinguishes the Go sync group from Python
# `skillXxx` groups in `by_enum`.
#
# Note: Go mirror is partial — Runner's `build_control_client` structs
# also emit `status` / `lifecycleStatus` etc., but those are *fields*,
# not enum-value sets; they're handled by TS-side zod schema and don't
# need a Go enum mirror here.
GO_CANONICAL_MAP: dict[str, tuple[str, str, str, str]] = {
    # group_label -> (go_filename, ts_export, ts_filename, group_label)
    # ts_filename is used to find the same TS source the other groups use.
    "statusCanonical": (
        "status.go",
        "canonicalBuildStatuses",
        "status.ts",
        "goBuildStatuses",
    ),
    "executionStatuses": (
        "status.go",
        "executionStatuses",
        "status.ts",
        "goExecutionStatuses",
    ),
    "buildPhases": (
        "phase.go",
        "buildPhases",
        "phase.ts",
        "goBuildPhases",
    ),
    "errorCodes": (
        "errors.go",
        "errorCodes",
        "errors.ts",
        "goErrorCodes",
    ),
    # TASK-069: runner registry status (TS/Python/Go 3-way sync anchor).
    "runnerStatuses": (
        "runner_registry.go",
        "runnerStatuses",
        "runner-registry.ts",
        "goRunnerStatuses",
    ),
}
GO_CANONICAL_DIR = Path("apps/runner/internal/contract")

# canonical § 별 enum 매핑: (enum name, canonical_section, ts file, ts export)
# TASK-161 (P2-M2 Step 5): `previewStatuses` 제거 — legacy enum 이
# canonical 흡수되어 (Sub-commit A) docs/sdlc/contracts §6 항목이 사라짐.
ENUM_TARGETS = [
    ("buildStatuses", "§5", "status.ts", "buildStatuses"),
    ("buildPhases", "§7", "phase.ts", "buildPhases"),
    ("errorCodes", "§8", "errors.ts", "errorCodes"),
]

# UPPER_SNAKE_CASE 단어 패턴
UPPER_WORD = re.compile(r"^[A-Z][A-Z0-9_]*$")

# TS: export const <name> = [ ... ] as const;
TS_ENUM_RE = re.compile(
    r"export\s+const\s+(\w+)\s*=\s*\[([^\]]*)\]\s*as\s+const\s*;",
    re.MULTILINE,
)

# TS: z.object({ key1: ..., key2: ... })
TS_OBJECT_RE = re.compile(
    r"z\.object\(\s*\{([^}]*)\}\s*\)",
    re.MULTILINE | re.DOTALL,
)

# TS object 안의 top-level key 추출: "  key: ..." 또는 "  key?:" 등
TS_KEY_RE = re.compile(r"^\s*(\w+)\s*\??\s*:\s*", re.MULTILINE)

# canonical markdown: ```text ... ``` block 안의 UPPER_SNAKE_CASE 단어
MD_CODE_BLOCK_RE = re.compile(r"```text\s*\n([^\n]*\n(?:\s*\S.*\n)*?)```", re.MULTILINE)

# canonical §3 표: "key | type | description" 형태의 GFM 행. 마크다운 표 첫 컬럼.
MD_TABLE_ROW_RE = re.compile(r"^\s*\|\s*`?(\w+)`?\s*\|", re.MULTILINE)


@dataclass
class DriftItem:
    """drift 한 건."""

    kind: str  # missing_in_code | extra_in_code | field_name_mismatch
    enum: str
    value: str
    canonical_section: str = ""

    def to_dict(self) -> dict[str, str]:
        return {
            "kind": self.kind,
            "enum": self.enum,
            "value": self.value,
            "canonical_section": self.canonical_section,
        }


@dataclass
class DriftSummary:
    total: int = 0
    missing_in_code: int = 0
    extra_in_code: int = 0
    by_enum: dict[str, dict[str, int]] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "total": self.total,
            "missing_in_code": self.missing_in_code,
            "extra_in_code": self.extra_in_code,
            "by_enum": dict(self.by_enum),
        }


@dataclass
class DriftReport:
    ok: bool
    drift_items: list[DriftItem] = field(default_factory=list)
    summary: DriftSummary = field(default_factory=DriftSummary)
    warnings: list[dict[str, str]] = field(default_factory=list)
    errors: list[dict[str, str]] = field(default_factory=list)
    skill_version: str = SKILL_VERSION

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "drift_items": [d.to_dict() for d in self.drift_items],
            "summary": self.summary.to_dict(),
            "warnings": list(self.warnings),
            "errors": list(self.errors),
            "ref": {
                "contract_doc": "docs/sdlc/contracts/01-shared-build-contract-baseline.md",
                "skill_version": self.skill_version,
            },
        }


def _err(code: str, field_name: str, message: str) -> dict[str, str]:
    return {"code": code, "field": field_name, "message": message}


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _extract_ts_enum(src: str, export_name: str) -> list[str] | None:
    """TS 파일에서 `export const <export_name> = [ ... ] as const;` 의 word 추출.

    같은 파일에 여러 `export const` 가 있을 때 (예: status.ts 안에
    buildStatuses / previewStatuses 둘 다) export_name 이 일치하는 첫 매치를 잡는다.
    매치가 없으면 None 반환.
    """
    body: str | None = None
    for m in TS_ENUM_RE.finditer(src):
        if m.group(1) == export_name:
            body = m.group(2)
            break
    if body is None:
        return None
    words: list[str] = []
    for token in re.split(r"[,\s]+", body):
        token = token.strip().strip('"').strip("'")
        if not token:
            continue
        if UPPER_WORD.match(token):
            words.append(token)
    return words


def _extract_ts_object_keys(src: str) -> list[str] | None:
    """`buildRequestSchema = z.object({ ... })` 의 top-level key 추출."""
    # z.object({ ... }) 만 잡으면 다른 schema 도 잡힐 수 있어, buildRequestSchema 라는
    # 할당 바로 뒤의 것만 잡는다.
    idx = src.find("buildRequestSchema")
    if idx == -1:
        return None
    m = TS_OBJECT_RE.search(src, idx)
    if not m:
        return None
    body = m.group(1)
    keys: list[str] = []
    for line in body.splitlines():
        km = TS_KEY_RE.match(line)
        if km:
            keys.append(km.group(1))
    return keys


def _extract_canonical_enums(text: str) -> dict[str, list[str]]:
    """canonical markdown 에서 ```text ... ``` block 안의 UPPER word 추출.

    block 등장 순서대로 canonical_section 을 부여한다. TASK-161 (P2-M2
    Step 5): §6 previewStatuses 제거 → 3개 block 매핑:
    §5 → buildStatuses, §7 → buildPhases, §8 → errorCodes.
    """
    blocks = MD_CODE_BLOCK_RE.findall(text)
    section_enum = {
        0: ("buildStatuses", "§5"),
        1: ("buildPhases", "§7"),
        2: ("errorCodes", "§8"),
    }
    result: dict[str, list[str]] = {}
    for i, body in enumerate(blocks):
        if i not in section_enum:
            continue
        enum_name, section = section_enum[i]
        words: list[str] = []
        for line in body.splitlines():
            for token in re.split(r"[,\s]+", line):
                token = token.strip().strip('"').strip("'")
                if not token:
                    continue
                if UPPER_WORD.match(token):
                    words.append(token)
        result[enum_name] = words
    return result


def _extract_canonical_request_fields(text: str) -> list[str]:
    """canonical §3 표 (필수/권장) 의 첫 컬럼 key 추출. 헤더 행은 제외.

    §3.1 "필수 필드" 표와 §3.2 "권장 필드" 표의 모든 key 합집합.
    """
    # §3 영역만 본다. §3 부터 §4 (Canonical Identifier Rules) 직전.
    start = text.find("## 3.")
    end = text.find("## 4.")
    if start == -1 or end == -1:
        return []
    section = text[start:end]
    rows: list[str] = []
    for line in section.splitlines():
        m = MD_TABLE_ROW_RE.match(line)
        if m and m.group(1) != "필드":  # 헤더 행 제외
            rows.append(m.group(1))
    # 중복 제거하되 순서 유지
    seen: set[str] = set()
    out: list[str] = []
    for r in rows:
        if r not in seen:
            seen.add(r)
            out.append(r)
    return out


def _resolve_path(repo_root: Path, relative: str) -> Path:
    """저장소 루트 기준 상대 경로 / 절대 경로 모두 처리."""
    p = Path(relative)
    if p.is_absolute():
        return p
    return repo_root / relative


def _load_python_canonical(repo_root: Path):
    """Dynamic-load `apps.skill_mcp.contract.canonical` from `repo_root`.

    Uses spec_from_file_location so the call does NOT consult
    ``sys.modules`` cache. This matters in tests where a fake temp
    directory is used as repo_root: importing through the cache would
    surface the real project module and miss test fixtures.

    Returns the module on success, None on failure (warning, not hard
    error — drift check still runs against TS / canonical markdown).
    """
    canonical_path = repo_root / "apps" / "skill_mcp" / "contract" / "canonical.py"
    if not canonical_path.is_file():
        return None
    try:
        spec = importlib.util.spec_from_file_location(
            f"{PYTHON_CANONICAL_MODULE}._at_{repo_root}", canonical_path
        )
        if spec is None or spec.loader is None:
            return None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    except Exception:
        return None


def _get_py_frozenset(mod: Any, attr: str) -> frozenset[str] | None:
    """Return the frozenset (or plain set) bound to `mod.attr`, or None."""
    try:
        v = getattr(mod, attr)
    except AttributeError:
        return None
    if isinstance(v, frozenset):
        return v
    if isinstance(v, set):
        return frozenset(v)
    return None


# Go const block pattern: `IdentName = "VALUE"` 로 매 줄.
# ident 는 Go 식별자 규칙 (대소문자 혼합 CamelCase / UPPER_SNAKE 둘 다 허용).
# value 는 UPPER_SNAKE_CASE 만 매칭 (canonical enum 표면 일치).
GO_CONST_LINE_RE = re.compile(
    r'^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([A-Z][A-Z0-9_]*)"\s*$',
    re.MULTILINE,
)


def _extract_go_consts(src: str) -> dict[str, str] | None:
    """Go source 에서 `ConstName = "VALUE"` 매핑을 모두 추출.

    `apps/runner/internal/contract/*.go` 의 모든 const 블록 (단일 / 다중) 을
    모두 매칭. 매칭이 0건이면 None 반환.

    다음 패턴은 의도적으로 매칭하지 않는다:
    - quote 없이 bare 식별자만 있는 경우 (`MyConst = SomeOtherConst`)
    - 숫자 / boolean / 함수 호출
    - 따옴표 안에 UPPER_SNAKE 가 아닌 다른 문자가 섞인 경우
    """
    matches = GO_CONST_LINE_RE.findall(src)
    if not matches:
        return None
    out: dict[str, str] = {}
    for ident, value in matches:
        # 동일 ident 가 같은 파일에 두 번 정의되면 후행 값으로 덮어쓰기.
        out[ident] = value
    return out


def _resolve_go_value_set(consts: dict[str, str] | None, names: tuple[str, ...]) -> set[str] | None:
    """ident list 의 value 를 union 해서 set 으로 반환.

    `_extract_go_consts` 의 결과 dict 에서 주어진 ident name 들 (예:
    `("StatusReceived", "StatusQueued", ...)`) 의 value 를 모은다.

    ident 가 dict 에 없으면 무시 (drift 가 있을 수도 있으나 별도 표면).
    모두 없으면 None 반환.
    """
    if not consts:
        return None
    found: set[str] = set()
    for n in names:
        v = consts.get(n)
        if isinstance(v, str) and v:
            found.add(v)
    if not found:
        return None
    return found


def check_drift(input_data: Any, *, repo_root: Path | None = None) -> DriftReport:
    """drift 검사. `repo_root` 미지정 시 cwd 기준."""
    warnings: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []
    drift_items: list[DriftItem] = []

    if not isinstance(input_data, dict):
        return DriftReport(
            ok=False,
            errors=[_err("INVALID_INPUT", "<root>", "input must be a JSON object")],
        )

    root = repo_root or Path(os.environ.get("CONTRACT_DRIFT_REPO_ROOT") or ".").resolve()

    contract_rel = input_data.get("contractPath", "packages/shared-contract/src/build")
    canonical_rel = input_data.get(
        "canonicalPath", "docs/sdlc/contracts/01-shared-build-contract-baseline.md"
    )
    enums_requested = input_data.get(
        "enums", [t[0] for t in ENUM_TARGETS]
    )
    check_request = bool(input_data.get("checkRequest", True))
    check_python = bool(input_data.get("checkPython", True))
    check_go = bool(input_data.get("checkGo", True))

    if not isinstance(enums_requested, list) or not all(
        isinstance(e, str) for e in enums_requested
    ):
        return DriftReport(
            ok=False,
            errors=[_err(
                "INVALID_INPUT", "enums",
                "enums must be a list of strings",
            )],
        )
    valid_enum_names = {t[0] for t in ENUM_TARGETS}
    unknown = [e for e in enums_requested if e not in valid_enum_names]
    if unknown:
        return DriftReport(
            ok=False,
            errors=[_err(
                "INVALID_INPUT", "enums",
                f"unknown enum name(s): {unknown}; valid: {sorted(valid_enum_names)}",
            )],
        )

    contract_dir = _resolve_path(root, contract_rel)
    canonical_path = _resolve_path(root, canonical_rel)

    if not contract_dir.is_dir():
        return DriftReport(
            ok=False,
            errors=[_err(
                "MISSING_FIELD", "contractPath",
                f"contract directory not found: {contract_dir}",
            )],
        )
    if not canonical_path.is_file():
        return DriftReport(
            ok=False,
            errors=[_err(
                "MISSING_FIELD", "canonicalPath",
                f"canonical file not found: {canonical_path}",
            )],
        )

    # canonical 읽기
    try:
        canonical_text = _read_text(canonical_path)
    except OSError as exc:
        return DriftReport(
            ok=False,
            errors=[_err("IO_ERROR", "canonicalPath", str(exc))],
        )

    canonical_enums = _extract_canonical_enums(canonical_text)

    # enum 별 비교
    by_enum: dict[str, dict[str, int]] = {}
    missing_total = 0
    extra_total = 0

    for enum_name, section, ts_filename, ts_export in ENUM_TARGETS:
        if enum_name not in enums_requested:
            continue
        ts_path = contract_dir / ts_filename
        if not ts_path.is_file():
            warnings.append({
                "code": "PARSE_ERROR",
                "field": enum_name,
                "message": f"TS file not found: {ts_path}",
            })
            by_enum[enum_name] = {"missing": 0, "extra": 0, "shared": 0}
            continue
        try:
            ts_src = _read_text(ts_path)
        except OSError as exc:
            warnings.append({
                "code": "IO_ERROR",
                "field": enum_name,
                "message": str(exc),
            })
            by_enum[enum_name] = {"missing": 0, "extra": 0, "shared": 0}
            continue

        ts_words = _extract_ts_enum(ts_src, ts_export)
        if ts_words is None:
            warnings.append({
                "code": "PARSE_ERROR",
                "field": enum_name,
                "message": f"could not locate `export const {ts_export}` in {ts_path}",
            })
            by_enum[enum_name] = {"missing": 0, "extra": 0, "shared": 0}
            continue
        ts_set = set(ts_words)
        canon_words = canonical_enums.get(enum_name, [])
        canon_set = set(canon_words)

        missing = canon_set - ts_set  # canonical only
        extra = ts_set - canon_set  # TS only
        shared = canon_set & ts_set

        for v in canon_words:
            if v in missing:
                drift_items.append(DriftItem(
                    kind="missing_in_code",
                    enum=enum_name,
                    value=v,
                    canonical_section=section,
                ))
        for v in ts_words:
            if v in extra:
                drift_items.append(DriftItem(
                    kind="extra_in_code",
                    enum=enum_name,
                    value=v,
                    canonical_section=section,
                ))

        by_enum[enum_name] = {
            "missing": len(missing),
            "extra": len(extra),
            "shared": len(shared),
        }
        missing_total += len(missing)
        extra_total += len(extra)

    # BuildRequest field 비교
    if check_request:
        ts_request_path = contract_dir / "request.ts"
        if not ts_request_path.is_file():
            warnings.append({
                "code": "PARSE_ERROR",
                "field": "buildRequestFields",
                "message": f"TS file not found: {ts_request_path}",
            })
        else:
            try:
                ts_request_src = _read_text(ts_request_path)
            except OSError as exc:
                warnings.append({
                    "code": "IO_ERROR",
                    "field": "buildRequestFields",
                    "message": str(exc),
                })
            else:
                ts_fields = _extract_ts_object_keys(ts_request_src) or []
                canon_fields = _extract_canonical_request_fields(canonical_text)
                ts_field_set = set(ts_fields)
                canon_field_set = set(canon_fields)

                # 한 쪽에만 있으면 drift; 양쪽 다 있으면 shared.
                # 단, 이름이 같은 경우는 그대로 shared 로 본다 (대소문자/스네이크 변형은
                # 본 skill 범위 밖, 정확 일치만 인정).
                missing = canon_field_set - ts_field_set
                extra = ts_field_set - canon_field_set
                shared = canon_field_set & ts_field_set

                for v in canon_fields:
                    if v in missing:
                        drift_items.append(DriftItem(
                            kind="missing_in_code",
                            enum="buildRequestFields",
                            value=v,
                            canonical_section="§3",
                        ))
                for v in ts_fields:
                    if v in extra:
                        drift_items.append(DriftItem(
                            kind="extra_in_code",
                            enum="buildRequestFields",
                            value=v,
                            canonical_section="§3",
                        ))

                by_enum["buildRequestFields"] = {
                    "missing": len(missing),
                    "extra": len(extra),
                    "shared": len(shared),
                }
                missing_total += len(missing)
                extra_total += len(extra)

    # Python-side canonical enums (`apps/skill_mcp/contract/canonical.py`).
    # Each Python frozenset MUST mirror the corresponding TS export. This
    # block is the structural guarantee that the skill/MCP layer can't
    # quietly re-introduce legacy pre-canonical values.
    if check_python:
        py_mod = _load_python_canonical(root)
        if py_mod is None:
            warnings.append({
                "code": "PARSE_ERROR",
                "field": "pythonCanonical",
                "message": (
                    f"could not import {PYTHON_CANONICAL_MODULE}; "
                    "verify repo_root points to the project root"
                ),
            })
        else:
            for py_attr, (ts_export, ts_filename, group_label) in PYTHON_CANONICAL_MAP.items():
                py_set = _get_py_frozenset(py_mod, py_attr)
                if py_set is None:
                    warnings.append({
                        "code": "PARSE_ERROR",
                        "field": group_label,
                        "message": (
                            f"could not read Python frozenset "
                            f"{PYTHON_CANONICAL_MODULE}.{py_attr}"
                        ),
                    })
                    by_enum[group_label] = {"missing": 0, "extra": 0, "shared": 0}
                    continue

                ts_path = contract_dir / ts_filename
                if not ts_path.is_file():
                    warnings.append({
                        "code": "PARSE_ERROR",
                        "field": group_label,
                        "message": f"TS file not found: {ts_path}",
                    })
                    by_enum[group_label] = {"missing": 0, "extra": 0, "shared": 0}
                    continue
                try:
                    ts_src = _read_text(ts_path)
                except OSError as exc:
                    warnings.append({
                        "code": "IO_ERROR",
                        "field": group_label,
                        "message": str(exc),
                    })
                    by_enum[group_label] = {"missing": 0, "extra": 0, "shared": 0}
                    continue

                ts_words = _extract_ts_enum(ts_src, ts_export)
                if ts_words is None:
                    warnings.append({
                        "code": "PARSE_ERROR",
                        "field": group_label,
                        "message": (
                            f"could not locate `export const {ts_export}` "
                            f"in {ts_path}"
                        ),
                    })
                    by_enum[group_label] = {"missing": 0, "extra": 0, "shared": 0}
                    continue
                ts_set = set(ts_words)

                missing = py_set - ts_set  # Python only -> ts drift
                extra = ts_set - py_set    # TS only -> Python drift
                shared = py_set & ts_set

                for v in sorted(py_set):
                    if v in missing:
                        drift_items.append(DriftItem(
                            kind="missing_in_code",
                            enum=group_label,
                            value=v,
                            canonical_section="python",
                        ))
                for v in ts_words:
                    if v in extra:
                        drift_items.append(DriftItem(
                            kind="extra_in_code",
                            enum=group_label,
                            value=v,
                            canonical_section="python",
                        ))

                by_enum[group_label] = {
                    "missing": len(missing),
                    "extra": len(extra),
                    "shared": len(shared),
                }
                missing_total += len(missing)
                extra_total += len(extra)

    # Go-side canonical enums (`apps/runner/internal/contract/*.go`). Each
    # const-block file's declared `IdentName = "VALUE"` lines are parsed
    # and compared against the corresponding TS export. Parser is regex-
    # based (no Go AST) but reliable for the simple `ConstName = "VALUE"`
    # pattern that we maintain. Drift here means one of three layers
    # (TS / Python / Go) is out of sync with another.
    if check_go:
        go_const_cache: dict[str, dict[str, str] | None] = {}
        for go_filename in {m[0] for m in GO_CANONICAL_MAP.values()}:
            go_path = _resolve_path(root, GO_CANONICAL_DIR / go_filename)
            if not go_path.is_file():
                warnings.append({
                    "code": "PARSE_ERROR",
                    "field": "goCanonical",
                    "message": f"Go canonical file not found: {go_path}",
                })
                go_const_cache[go_filename] = None
                continue
            try:
                go_src = _read_text(go_path)
            except OSError as exc:
                warnings.append({
                    "code": "IO_ERROR",
                    "field": "goCanonical",
                    "message": str(exc),
                })
                go_const_cache[go_filename] = None
                continue
            go_const_cache[go_filename] = _extract_go_consts(go_src)

        for group_key, (go_filename, ts_export, ts_filename, group_label) in GO_CANONICAL_MAP.items():
            go_consts = go_const_cache.get(go_filename)
            if go_consts is None:
                by_enum[group_label] = {"missing": 0, "extra": 0, "shared": 0}
                continue

            # Get the TS values (cached re-read or just read fresh).
            ts_path = contract_dir / ts_filename
            if not ts_path.is_file():
                warnings.append({
                    "code": "PARSE_ERROR",
                    "field": group_label,
                    "message": f"TS file not found: {ts_path}",
                })
                by_enum[group_label] = {"missing": 0, "extra": 0, "shared": 0}
                continue
            try:
                ts_src = _read_text(ts_path)
            except OSError as exc:
                warnings.append({
                    "code": "IO_ERROR",
                    "field": group_label,
                    "message": str(exc),
                })
                by_enum[group_label] = {"missing": 0, "extra": 0, "shared": 0}
                continue
            ts_words = _extract_ts_enum(ts_src, ts_export)
            if ts_words is None:
                warnings.append({
                    "code": "PARSE_ERROR",
                    "field": group_label,
                    "message": (
                        f"could not locate `export const {ts_export}` in {ts_path}"
                    ),
                })
                by_enum[group_label] = {"missing": 0, "extra": 0, "shared": 0}
                continue
            ts_set = set(ts_words)

            # Identify which Go const identifiers map to this group.
            # For statusCanonical/statusLegacy we walk the file's
            # identifiers; for buildPhases/errorCodes/executionStatuses
            # we collect values from the resolved const declarations.
            if group_key == "statusCanonical":
                wanted_idents = (
                    "StatusReceived", "StatusQueued",
                    "StatusPreparingSource", "StatusBuilding",
                    "StatusBuildSuccess", "StatusTesting",
                    "StatusTestSuccess", "StatusDeploying",
                    "StatusDeploySuccess", "StatusCompleted",
                    "StatusFailed", "StatusCancelled",
                )
            elif group_key == "statusLegacy":
                wanted_idents = (
                    "StatusPreparingSource", "StatusTestSuccess",
                )
            elif group_key == "executionStatuses":
                wanted_idents = (
                    "ExecutionStatusNotStarted",
                    "ExecutionStatusInProgress",
                    "ExecutionStatusSuccess",
                    "ExecutionStatusFailed",
                    "ExecutionStatusSkipped",
                )
            elif group_key == "buildPhases":
                wanted_idents = tuple(p for p in go_consts if p.startswith("Phase"))
            elif group_key == "errorCodes":
                wanted_idents = tuple(p for p in go_consts if p.startswith("ErrorCode"))
            elif group_key == "runnerStatuses":
                # TASK-069: Runner registry status (ACTIVE/DISABLED). The
                # file is `runner_registry.go`, so a generic prefix filter
                # would be brittle — explicit ident list.
                wanted_idents = (
                    "RunnerStatusActive",
                    "RunnerStatusDisabled",
                )
            else:
                wanted_idents = ()

            if wanted_idents:
                go_value_set = _resolve_go_value_set(go_consts, wanted_idents) or set()
            else:
                go_value_set = set()

            missing = go_value_set - ts_set  # Go only -> ts drift
            extra = ts_set - go_value_set  # TS only -> Go drift
            shared = go_value_set & ts_set

            for v in sorted(go_value_set):
                if v in missing:
                    drift_items.append(DriftItem(
                        kind="missing_in_code",
                        enum=group_label,
                        value=v,
                        canonical_section="go",
                    ))
            for v in ts_words:
                if v in extra:
                    drift_items.append(DriftItem(
                        kind="extra_in_code",
                        enum=group_label,
                        value=v,
                        canonical_section="go",
                    ))

            by_enum[group_label] = {
                "missing": len(missing),
                "extra": len(extra),
                "shared": len(shared),
            }
            missing_total += len(missing)
            extra_total += len(extra)

    total = missing_total + extra_total

    total = missing_total + extra_total
    summary = DriftSummary(
        total=total,
        missing_in_code=missing_total,
        extra_in_code=extra_total,
        by_enum=by_enum,
    )
    ok = total == 0 and len(errors) == 0
    return DriftReport(
        ok=ok,
        drift_items=drift_items,
        summary=summary,
        warnings=warnings,
        errors=errors,
    )
