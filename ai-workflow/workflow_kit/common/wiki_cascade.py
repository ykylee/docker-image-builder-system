# standard-ai-workflow-kit: v1.0.0-beta

"""Wiki file deletion cascade cleanup (v0.10.3, R-A follow-up cycle 2).

Karpathy ``llm-wiki.md`` + llm_wiki (nashsu) 의 *wiki 운영 R-1~R9 cycle* 의
*file deletion cascade* 정공법을 standard_ai_workflow 에 흡수.

기존 ``~/wiki/skills/wiki-event-sync/scripts/wiki-event-sync.py`` 의
``affected_pages()`` 가 *edit* 방향 (commit/push/PR/merge/release 시 영향 page
식별) 의 3-method matching 을 한다. 본 module 은 *delete* 방향 (source file
삭제 시 cascade-delete 대상 wiki page 식별) 의 같은 3-method matching +
destructive subcommand 정공법 (apply=False default) 의 dry-run pattern.

3-method matching (SSOT ``file_to_stem``):
1. **basename + .md** (legacy, v0.1.0 rule)
2. **stem 변환** (kebab-case + lower) — schema/naming.md §2
3. **project-relative stem 변환** (L1 wiki page 가 raw mirror 의
   ``<project>/<dir>/...`` 하위에 있을 때 project-relative path 의 stem 시도)

Cross-project 적용: 다른 wiki 운영 workflow 도 *3-method matching* +
*destructive subcommand 정공법* 의 *delete cascade* 적용 가능.
"""
from __future__ import annotations

import json
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


#: In-memory SSOT stem 변환 함수 (caller 가 override 가능). v0.4.0 wiki-event-sync
#: 의 ``_lib/stem.py::file_to_stem`` 와 동등 contract: kebab-case + lower + 특수문자
#: 치환. 본 module 은 *외부 wiki vault* 에 의존하지 않고 자체 SSOT 보유.
def file_to_stem(path: str) -> str:
    """파일 path → wiki page stem (kebab-case + lower).

    예:
    - ``AGENTS.md`` → ``agents``
    - ``opencode.json`` → ``opencode``
    - ``scripts/bootstrap_lib/wiki.py`` → ``scripts-bootstrap-lib-wiki``
    - ``v0_9_0_deprecation_policy_spec.md`` → ``v0-9-0-deprecation-policy-spec``
    """
    # 확장자 제거
    stem = re.sub(r"\.[^./\\]+$", "", path)
    # path separator → dash
    stem = stem.replace("/", "-").replace("\\", "-")
    # 비-alphanumeric → dash
    stem = re.sub(r"[^a-zA-Z0-9]+", "-", stem)
    # lowercase + 중복 dash 제거
    stem = re.sub(r"-+", "-", stem.lower()).strip("-")
    return stem


#: Project-relative L1 wiki 디렉토리 후보 (raw mirror 의 <project>/ 직하위 wiki 디렉토리)
#: v0.9.2 L3 raw mirror 구조 (raw/projects/<project>/...) 와 정합
PROJECT_WIKI_PREFIXES: tuple[str, ...] = (
    "",  # 1st try: file basename 그대로 (stem 변환 없이)
    "ai-workflow/",
    "workflow-source/",
    "docs/",
    "wiki/",
    "raw/",
    "raw/projects/",  # raw mirror 의 projects/ 직하위
)


@dataclass(frozen=True)
class CascadeTarget:
    """A wiki page that should be cascade-deleted (3-method match)."""
    path: Path
    method: str  # "basename" | "stem" | "project-relative-stem"


@dataclass
class CascadeResult:
    """Result of find_cascade_targets()."""
    deleted_path: str
    targets: list[CascadeTarget] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def find_cascade_targets(
    deleted_path: str,
    wiki_root: Path,
    project: str = "",
) -> CascadeResult:
    """Find wiki pages that should be cascade-deleted (3-method matching).

    Args:
        deleted_path: 삭제된 source file 의 project-relative path
            (e.g. ``"workflow-source/AGENTS.md"``)
        wiki_root: wiki vault 의 *project source* 디렉토리
            (e.g. ``Path("~/wiki/wiki/projects/standard-ai-workflow/sources")``)
        project: project slug (project-relative matching 시 prefix 로 사용).
            empty string 이면 *raw basename* 시도만.

    Returns:
        CascadeResult with:
        - deleted_path: input echo
        - targets: list of CascadeTarget (3-method dedup)
        - warnings: 부재 / read 실패 시 advisory
    """
    result = CascadeResult(deleted_path=deleted_path)

    if not wiki_root.is_dir():
        result.warnings.append(f"wiki_root 부재: {wiki_root} (cascade 대상 식별 불가)")
        return result

    if not deleted_path.strip():
        result.warnings.append("deleted_path 가 비어있음")
        return result

    p = Path(deleted_path)
    candidates: list[tuple[Path, str]] = []

    # 1) file basename + .md (p.name 가 이미 .md 포함 → 그대로 사용)
    candidates.append((wiki_root / p.name, "basename"))

    # 2) stem 변환
    stem = file_to_stem(deleted_path)
    candidates.append((wiki_root / f"{stem}.md", "stem"))

    # 3) project-relative stem 변환
    if project:
        # 두 가지 prefix pattern 시도:
        # (a) f"{project}/{prefix}" (e.g. "standard-ai-workflow/workflow-source/")
        # (b) f"raw/projects/{project}/{prefix}" (raw mirror 의 projects/ 직하위)
        prefix_candidates: list[str] = []
        for prefix in PROJECT_WIKI_PREFIXES:
            prefix_candidates.append(f"{project}/{prefix}".rstrip("/"))
        for prefix in PROJECT_WIKI_PREFIXES:
            prefix_candidates.append(f"raw/projects/{project}/{prefix}".rstrip("/"))

        for full_prefix in prefix_candidates:
            try:
                rel = p.relative_to(full_prefix)
            except ValueError:
                continue
            rel_stem = file_to_stem(str(rel))
            candidates.append((wiki_root / f"{rel_stem}.md", f"project-relative-stem[{full_prefix}]"))
            break  # 첫 매칭 prefix 만 시도

    # dedup + 실재 file 만 (case-insensitive filesystem 정합 — Path.samefile() 로 비교)
    seen: list[Path] = []
    for cand_path, method in candidates:
        # Path.samefile() 가 case-insensitive filesystem 에서 같은 file 로 인식
        is_duplicate = False
        for s in seen:
            try:
                if cand_path.samefile(s):
                    is_duplicate = True
                    break
            except OSError:
                # samefile 실패 시 path 문자열 비교 fallback
                if str(cand_path) == str(s):
                    is_duplicate = True
                    break
        if is_duplicate:
            continue
        seen.append(cand_path)
        if cand_path.exists():
            result.targets.append(CascadeTarget(path=cand_path, method=method))

    if not result.targets:
        result.warnings.append(
            f"3-method matching 결과 cascade-delete 대상 없음: {deleted_path}"
        )

    return result


def emit_cascade_plan(
    deleted_paths: list[str],
    wiki_root: Path,
    project: str = "",
) -> dict[str, Any]:
    """여러 deleted file 의 cascade plan 을 JSON dict 로 emit.

    Args:
        deleted_paths: 삭제된 source file 들의 project-relative path list
        wiki_root: wiki vault 의 *project source* 디렉토리
        project: project slug

    Returns:
        {
            "deleted_count": int,
            "total_targets": int,
            "plans": [
                {
                    "deleted_path": "...",
                    "targets": [{"path": "...", "method": "..."}, ...],
                    "warnings": [...]
                }
            ],
            "warnings": [...]  # global warnings
        }
    """
    all_warnings: list[str] = []
    plans: list[dict[str, Any]] = []
    total_targets = 0

    for dp in deleted_paths:
        result = find_cascade_targets(dp, wiki_root, project)
        all_warnings.extend(result.warnings)
        plans.append({
            "deleted_path": result.deleted_path,
            "targets": [
                {"path": str(t.path), "method": t.method}
                for t in result.targets
            ],
            "warnings": result.warnings,
        })
        total_targets += len(result.targets)

    return {
        "deleted_count": len(deleted_paths),
        "total_targets": total_targets,
        "plans": plans,
        "warnings": all_warnings,
    }


def apply_cascade(
    targets: list[CascadeTarget],
    apply: bool = False,
) -> dict[str, Any]:
    """cascade-delete 대상 wiki page 들을 삭제 (또는 dry-run).

    Args:
        targets: CascadeTarget list (from find_cascade_targets)
        apply: True 면 실제 delete, False 면 dry-run (default)

    Returns:
        {
            "applied": bool,
            "executed": [{"path": str, "method": str}, ...],
            "skipped": [{"path": str, "method": str}, ...],
            "warnings": [...]
        }
    """
    executed: list[dict[str, str]] = []
    skipped: list[dict[str, str]] = []
    warnings: list[str] = []

    for t in targets:
        if apply:
            try:
                t.path.unlink()
                executed.append({"path": str(t.path), "method": t.method})
            except OSError as e:
                warnings.append(f"delete 실패: {t.path} ({e})")
                skipped.append({"path": str(t.path), "method": t.method})
        else:
            skipped.append({"path": str(t.path), "method": t.method})

    return {
        "applied": apply,
        "executed": executed,
        "skipped": skipped,
        "warnings": warnings,
    }


def render_cascade_plan_text(plan: dict[str, Any]) -> str:
    """JSON dict plan 을 human-readable text 로 render (advisory emit 용)."""
    lines: list[str] = []
    lines.append(f"# Wiki Cascade-Delete Plan (advisory)\n")
    lines.append(f"- deleted_count: {plan['deleted_count']}")
    lines.append(f"- total_targets: {plan['total_targets']}\n")
    for p in plan["plans"]:
        lines.append(f"\n## {p['deleted_path']}")
        if p["targets"]:
            for t in p["targets"]:
                lines.append(f"  - [{t['method']}] {t['path']}")
        else:
            lines.append("  (cascade 대상 없음)")
        for w in p["warnings"]:
            lines.append(f"  ⚠️ {w}")
    if plan["warnings"]:
        lines.append("\n## Global warnings")
        for w in plan["warnings"]:
            lines.append(f"- ⚠️ {w}")
    return "\n".join(lines) + "\n"
