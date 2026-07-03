"""contract-drift-checker core.

`check_drift(input_data)` 가 `packages/shared-contract` 의 enum/field 와
canonical 문서 `docs/sdlc/contracts/01-shared-build-contract-baseline.md` 의
enum block / BuildRequest payload 표를 비교하고 drift 리포트를 만든다.

자세한 동작 규칙은 같은 디렉터리의 SKILL.md §1/§2 를 따른다.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

SKILL_VERSION = "v1"

# canonical § 별 enum 매핑: (enum name, canonical_section, ts file, ts export)
ENUM_TARGETS = [
    ("buildStatuses", "§5", "status.ts", "buildStatuses"),
    ("previewStatuses", "§6", "status.ts", "previewStatuses"),
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

    block 등장 순서대로 canonical_section 을 부여한다. block 4개를 매핑:
    §5 → buildStatuses, §6 → previewStatuses, §7 → buildPhases, §8 → errorCodes.
    """
    blocks = MD_CODE_BLOCK_RE.findall(text)
    section_enum = {
        0: ("buildStatuses", "§5"),
        1: ("previewStatuses", "§6"),
        2: ("buildPhases", "§7"),
        3: ("errorCodes", "§8"),
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
