# standard-ai-workflow-kit: v0.15.19-beta

"""Phase 13 AC4+ self-documenting wiki ↔ memory bidirectional link helper (v0.13.3+).

본 모듈은 2 가지 작업을 통합한다:

  - **R-A (sync)**: `sync_memory_to_wiki(workspace_root)` 가 memory entry 의
    `mentioned_in[]` 의 wiki page path 를 순회 → 각 wiki page 의 frontmatter
    `related_pages` 에 memory entry file 의 in-repo relative path 자동 추가.
    idempotent — 이미 있으면 skip.
  - **R-C (audit)**: `audit_bidirectional_links(workspace_root)` 가 wiki pages ×
    memory entries 의 cross-reference 를 검증 → symmetric / asymmetric list
    와 정합성 metric emit.

`bidir_link.py` 는 `memory_index.py` 와 *독립적* 으로 호출 가능. 본 모듈은
wiki 의 `related_pages` field 만 갱신하므로 memory entry 자체는 변경하지
않음 — single source of truth (memory entry) → derivative (wiki) 정합.

정공법:
  - wiki frontmatter parse: `workflow_kit.okf_export.Frontmatter.parse` 재사용
  - wiki frontmatter emit: `Frontmatter.to_yaml` 신규 (단순 subset YAML emitter)
  - wiki page atomic write: `workflow_kit.common.atomic_write.atomic_write_text`
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from workflow_kit.common.atomic_write import atomic_write_text

# okf_export 의 Frontmatter 는 wiki frontmatter subset (yaml dep 회피) 의
# 표준 parser. 본 helper 가 재사용.
from workflow_kit.okf_export import Frontmatter


WIKI_SUBDIR: str = "ai-workflow/wiki"
MEMORY_INDEX_SUBDIR: str = "ai-workflow/memory/active/memory_index"
ENTRIES_SUBDIR: str = "entries"


# ---------------------------------------------------------------------------
# Path normalization
# ---------------------------------------------------------------------------


def normalize_memory_path_to_wiki_relative(path: str, workspace_root: Path) -> str | None:
    """in-repo 절대 path → wiki root relative path.

    예: `ai-workflow/wiki/topics/foo.md` + workspace_root → `topics/foo.md`.
    wiki path 가 아니면 None (caller 가 skip).
    """
    if not path:
        return None
    p = Path(path)
    # 이미 `topics/...` 같은 wiki relative 형식이면 그대로 사용.
    if not path.startswith(WIKI_SUBDIR + "/"):
        # 절대 path 가 아니어도 stem 만으로 매치 시도.
        # e.g. `topics/foo.md` 또는 `concepts/foo.md`
        parts = path.replace("\\", "/").split("/")
        if parts and parts[0] in {"topics", "concepts", "decisions", "entities", "patterns", "queries"}:
            return path
        return None
    rel = path[len(WIKI_SUBDIR) + 1:]
    return rel


def memory_entry_path_to_in_repo_relative(entry_id: str, workspace_root: Path) -> str:
    """memory entry id → in-repo absolute path (string).

    예: 'MEM-2026-07-09-001' → 'ai-workflow/memory/active/memory_index/entries/MEM-2026-07-09-001.json'.
    """
    return f"{MEMORY_INDEX_SUBDIR}/{ENTRIES_SUBDIR}/{entry_id}.json"


# ---------------------------------------------------------------------------
# Audit (R-C)
# ---------------------------------------------------------------------------


@dataclass
class BidirLinkAsymmetry:
    """한쪽만 cross-link 가 있는 비대칭 entry.

    `memory_entry_id` 와 `wiki_page` 는 *어느 한쪽* 만 link 를 가진 경우.
    양쪽 모두 link 가 있으면 symmetric.
    """

    memory_entry_id: str
    wiki_page: str
    direction: str  # "memory_only" | "wiki_only"


@dataclass
class BidirLinkAudit:
    """workspace 전체 의 wiki ↔ memory 양방향 link 정합성 audit 결과.

    Fields:
        total_wiki_pages: 전체 wiki page 갯수
        total_memory_entries: 전체 memory entry 갯수
        symmetric_links: 양쪽 모두 link 가 있는 (entry, wiki_page) pair 갯수
        asymmetric: BidirLinkAsymmetry list (한쪽만 link)
        wiki_pages_with_related_memory: wiki page 의 related_pages 에 memory entry
            path 가 1+ 이상 있는 page 갯수
        memory_entries_with_mentioned_wiki: memory entry 의 mentioned_in 에
            wiki page path 가 1+ 이상 있는 entry 갯수
        audited_at: ISO 8601 UTC timestamp
    """

    total_wiki_pages: int = 0
    total_memory_entries: int = 0
    symmetric_links: int = 0
    asymmetric: list[BidirLinkAsymmetry] = field(default_factory=list)
    wiki_pages_with_related_memory: int = 0
    memory_entries_with_mentioned_wiki: int = 0
    audited_at: str = ""

    @property
    def is_symmetric(self) -> bool:
        """asymmetric 0 이면 True (외부 consumer 가 신뢰 가능한 정합 상태)."""
        return len(self.asymmetric) == 0


def _iter_wiki_pages(workspace_root: Path) -> Iterable[Path]:
    """wiki root 아래 모든 .md page 순회. missing 시 empty."""
    wiki_root = workspace_root / WIKI_SUBDIR
    if not wiki_root.is_dir():
        return
    yield from sorted(wiki_root.rglob("*.md"))


def _load_wiki_related_memory_paths(wiki_page: Path) -> set[str]:
    """wiki page 의 frontmatter `related_pages` 중 memory entry path 만 set 으로 반환.

    path 가 memory index entry 패턴 (`ai-workflow/memory/active/memory_index/entries/MEM-*.json`)
    이거나 단순 stem (`MEM-2026-07-09-001`) 형태면 매치.
    """
    try:
        text = wiki_page.read_text(encoding="utf-8")
        fm = Frontmatter.parse(text)
    except Exception:
        return set()
    out: set[str] = set()
    for rp in fm.related_pages:
        if not rp:
            continue
        # 절대 path 형태
        if rp.startswith(MEMORY_INDEX_SUBDIR + "/") and rp.endswith(".json"):
            out.add(rp)
            continue
        # stem-only 형태
        if rp.startswith("MEM-") and not "/" in rp:
            out.add(rp)
            continue
    return out


def audit_bidirectional_links(workspace_root: Path) -> BidirLinkAudit:
    """R-C: wiki ↔ memory 양방향 link 의 정합성 audit.

    Returns:
        BidirLinkAudit. asymmetric 가 0 이면 `is_symmetric=True`.
    """
    from workflow_kit.common.state.memory_index import load_memory_index

    audit = BidirLinkAudit(audited_at=datetime.now(timezone.utc).isoformat())
    entries = load_memory_index(workspace_root)
    audit.total_memory_entries = len(entries)

    # wiki side: frontmatter related_pages 의 memory entry path 집합
    wiki_to_memory: dict[str, set[str]] = {}  # wiki_page_relpath → set of memory entry paths
    for page in _iter_wiki_pages(workspace_root):
        rel = page.relative_to(workspace_root / WIKI_SUBDIR).as_posix()
        mem_paths = _load_wiki_related_memory_paths(page)
        if mem_paths:
            audit.wiki_pages_with_related_memory += 1
        wiki_to_memory[rel] = mem_paths

    audit.total_wiki_pages = len(wiki_to_memory)

    # memory side: mentioned_in 의 wiki page path 집합
    # 각 (entry, wiki_page) pair 의 symmetric / asymmetric 분류.
    for entry in entries:
        entry_path = memory_entry_path_to_in_repo_relative(entry.id, workspace_root)
        # entry 의 mentioned_in 의 wiki page 경로들을 정규화.
        wiki_relpaths: set[str] = set()
        for m in entry.mentioned_in:
            m_rel: str | None = normalize_memory_path_to_wiki_relative(m, workspace_root)
            if m_rel:
                wiki_relpaths.add(m_rel)
        if wiki_relpaths:
            audit.memory_entries_with_mentioned_wiki += 1

        # 각 mentioned_in wiki page 에 대해 symmetric / asymmetric 판정.
        for wiki_rel in wiki_relpaths:
            mem_in_wiki = wiki_to_memory.get(wiki_rel, set())
            # 양쪽 모두 link 가 있어야 symmetric.
            # wiki side 의 related_pages 에 entry_path 또는 entry.id (stem) 가 있어야 함.
            entry_id_stem = entry.id
            is_symmetric = entry_path in mem_in_wiki or entry_id_stem in mem_in_wiki
            if is_symmetric:
                audit.symmetric_links += 1
            else:
                audit.asymmetric.append(BidirLinkAsymmetry(
                    memory_entry_id=entry.id,
                    wiki_page=wiki_rel,
                    direction="memory_only",
                ))

        # wiki side 만 link 가 있는 case (memory entry 는 mentioned_in 에 없지만
        # wiki page 의 related_pages 에는 entry 가 있는 경우).
        for wiki_rel, mem_paths in wiki_to_memory.items():
            if entry_path not in mem_paths and entry_id_stem not in mem_paths:
                continue  # wiki 도 link 없음 → 비대칭 아님
            if wiki_rel not in wiki_relpaths:
                # wiki 만 link 가 있음
                audit.asymmetric.append(BidirLinkAsymmetry(
                    memory_entry_id=entry.id,
                    wiki_page=wiki_rel,
                    direction="wiki_only",
                ))

    return audit


# ---------------------------------------------------------------------------
# Sync (R-A)
# ---------------------------------------------------------------------------


@dataclass
class BidirSyncChange:
    """sync 가 적용한 1 wiki page 의 변경."""
    wiki_page: str
    added_paths: list[str] = field(default_factory=list)
    already_present: list[str] = field(default_factory=list)


@dataclass
class BidirSyncResult:
    """sync_memory_to_wiki 의 결과."""
    mode: str  # "applied" | "dry-run"
    total_changes: int = 0
    changes: list[BidirSyncChange] = field(default_factory=list)
    audited_at: str = ""
    summary: str = ""

    @property
    def is_empty(self) -> bool:
        return self.total_changes == 0


def _emit_yaml_frontmatter(fm: Frontmatter, body: str, *, related_pages: list[str]) -> str:
    """Frontmatter 를 yaml 형식으로 emit (단순 subset).

    okf_export.Frontmatter.parse 와 *round-trip* 가능. 새 line list 와
    body 를 결합해 전체 page 본문 반환.
    """
    lines: list[str] = ["---"]
    # type (필수)
    if fm.type:
        lines.append(f"type: {fm.type}")
    # status
    if fm.status:
        lines.append(f"status: {fm.status}")
    # title
    if fm.title:
        lines.append(f"title: {fm.title}")
    # description
    if fm.description:
        lines.append(f"description: {fm.description}")
    # last_ingested_from
    if fm.last_ingested_from:
        lines.append(f"last_ingested_from: {fm.last_ingested_from}")
    # created / updated
    if fm.created:
        lines.append(f"created: {fm.created}")
    if fm.updated:
        lines.append(f"updated: {fm.updated}")
    # related_pages (override with new list — caller 가 dedup 보장)
    if related_pages:
        # multi-line list format (가독성)
        lines.append("related_pages:")
        for rp in related_pages:
            lines.append(f"  - {rp}")
    elif fm.related_pages:
        lines.append("related_pages:")
        for rp in fm.related_pages:
            lines.append(f"  - {rp}")
    # tags
    if fm.tags:
        lines.append("tags:")
        for t in fm.tags:
            lines.append(f"  - {t}")
    # adr_id
    if fm.adr_id:
        lines.append(f"adr_id: {fm.adr_id}")
    # vcs_commit / vcs_ref
    if fm.vcs_commit:
        lines.append(f"vcs_commit: {fm.vcs_commit}")
    if fm.vcs_ref:
        lines.append(f"vcs_ref: {fm.vcs_ref}")
    # r9_skip
    if fm.r9_skip:
        lines.append("r9_skip: true")
    # unknown fields preservation (raw 에서 known fields 제외)
    raw_known = {"type", "status", "title", "description", "last_ingested_from",
                 "created", "updated", "related_pages", "tags", "adr_id",
                 "vcs_commit", "vcs_ref", "r9_skip"}
    if fm.raw:
        for k, v in fm.raw.items():
            if k in raw_known:
                continue
            if isinstance(v, list):
                lines.append(f"{k}:")
                for item in v:
                    lines.append(f"  - {item}")
            elif v is not None:
                lines.append(f"{k}: {v}")
    lines.append("---")
    return "\n".join(lines) + "\n" + body


def _get_body_after_frontmatter(text: str) -> str:
    """wiki page 의 frontmatter block 이후 body 부분만 반환."""
    # okf_export._FRONTMATTER_RE 와 동일 패턴 — 재사용 안 함 (import 부담 회피).
    import re
    m = re.match(r"^---\n.*?\n---\n", text, flags=re.DOTALL)
    if not m:
        return text
    return text[m.end():]


def sync_memory_to_wiki(workspace_root: Path, *, dry_run: bool = True) -> BidirSyncResult:
    """R-A: memory entry.mentioned_in → wiki frontmatter related_pages 자동 추가.

    Args:
        workspace_root: REPO_ROOT
        dry_run: True 면 plan 만 emit (write 안 함). default True.

    Returns:
        BidirSyncResult. `changes` 에 변경된 wiki page 별 detail 포함.
        idempotent — 이미 related_pages 에 있으면 skip.
    """
    from workflow_kit.common.state.memory_index import load_memory_index

    result = BidirSyncResult(
        mode="dry-run" if dry_run else "applied",
        audited_at=datetime.now(timezone.utc).isoformat(),
    )
    entries = load_memory_index(workspace_root)

    # memory entry → mention 한 wiki page 의 (relpath, in-repo entry path) pair 수집.
    wiki_to_add: dict[str, set[str]] = {}  # wiki_relpath → set of entry paths to add
    for entry in entries:
        entry_path = memory_entry_path_to_in_repo_relative(entry.id, workspace_root)
        for m in entry.mentioned_in:
            rel = normalize_memory_path_to_wiki_relative(m, workspace_root)
            if not rel:
                continue
            wiki_to_add.setdefault(rel, set()).add(entry_path)

    # wiki page 별 frontmatter parse + related_pages 갱신
    for page in _iter_wiki_pages(workspace_root):
        rel = page.relative_to(workspace_root / WIKI_SUBDIR).as_posix()
        if rel not in wiki_to_add:
            continue
        try:
            text = page.read_text(encoding="utf-8")
            fm = Frontmatter.parse(text)
        except Exception:
            continue
        existing = list(fm.related_pages)
        existing_set = set(existing)
        to_add = sorted(p for p in wiki_to_add[rel] if p not in existing_set)
        if not to_add:
            continue
        new_related = existing + to_add
        body = _get_body_after_frontmatter(text)
        new_text = _emit_yaml_frontmatter(fm, body, related_pages=new_related)

        change = BidirSyncChange(
            wiki_page=rel,
            added_paths=to_add,
            already_present=sorted(wiki_to_add[rel] & existing_set),
        )
        if not dry_run:
            atomic_write_text(page, new_text)
        result.changes.append(change)
        result.total_changes += 1

    result.summary = (
        f"mode={result.mode} total_changes={result.total_changes} "
        f"wiki_pages_modified={len(result.changes)}"
    )
    return result