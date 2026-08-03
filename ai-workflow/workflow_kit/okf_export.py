# standard-ai-workflow-kit: v1.0.0-beta

"""workflow_kit.okf_export — wiki → OKF bundle export helper (PoC, v0.7.33+).

OKF (Open Knowledge Format) v0.1 spec 의 reference: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md

Wiki page (markdown + YAML frontmatter) 를 OKF "concept" 문서로 변환하여
지정 directory 에 bundle 로 export. 우리 wiki 의 5 type (entity/concept/decision/pattern/query) 을
OKF 의 free-string `type` 으로 그대로 보존 (OKF spec §4.1: type 은 non-empty string, no registry).

Frontmatter mapping (우리 wiki → OKF v0.1, 양방향 OKF compatible 보장):
  - `type`         → `type`           (우리 enum ⊂ OKF string, 그대로)
  - `title`        → `title`          (OKF recommended, optional)
  - `description`  → `description`    (OKF recommended, optional)
  - `last_ingested_from` (URL/path) → `resource` (if URL) OR `tags` (`ingested_from:<path>`) (if in-repo path)
  - `tags`         → `tags`           (union with derived from `status`, `related_pages`)
  - `updated`      → `timestamp`      (YYYY-MM-DD → YYYY-MM-DDTHH:MM:SSZ)
  - `created`      → extra `created`  (OKF 가 unknown key tolerate, spec §4.1 Extensions)
  - `status`       → extra `status`   (OKF 가 unknown key tolerate)
  - `related_pages` → extra `related_pages` (and emit as cross-links in body §5.1)
  - `r9_skip`      → extra `r9_skip` (OKF 가 unknown key tolerate)
  - `last_ingested_from` 의 path 가 in-repo 일 때 → body 에 `## Citations` section 추가

Cross-link rewriting (OKF §5.1 bundle-relative):
  - 위키 `[[path/to/page]]` → `[page](../path/to/page.md)` body cross-link
  - `[[path/to/page#anchor]]` → `[page](../path/to/page.md#anchor)`

Usage:
    from workflow_kit.okf_export import export_wiki_to_okf, WikiToOkfError

    export_wiki_to_okf(
        wiki_root=Path("ai-workflow/wiki"),
        out_bundle=Path("/tmp/okf_bundle"),
        page_filter=lambda p: p.name != "okf-open-knowledge-format.md",  # skip self
    )

CLI:
    python -m workflow_kit.okf_export --wiki ai-workflow/wiki --out /tmp/okf_bundle
    python -m workflow_kit.okf_export --wiki ai-workflow/wiki --out /tmp/okf_bundle --include okf-open-knowledge-format
    python -m workflow_kit.okf_export --wiki ai-workflow/wiki/concepts/okf-open-knowledge-format.md --out /tmp/okf_one
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterable

# ---------------------------------------------------------------------------
# OKF v0.1 spec constants (SPEC.md §3.1 reserved filenames, §4.1 frontmatter)
# ---------------------------------------------------------------------------
OKF_RESERVED_FILES: frozenset[str] = frozenset({"index.md", "log.md"})

# Our wiki 5 valid `type` values (SCHEMA.md §1) — all map cleanly to OKF free-string
OKF_WIKI_VALID_TYPES: frozenset[str] = frozenset({"entity", "concept", "decision", "pattern", "query"})


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------
class WikiToOkfError(Exception):
    """Base error for wiki → OKF export."""


class InvalidFrontmatterError(WikiToOkfError):
    """Wiki page 의 frontmatter 가 우리 schema 위반."""


# ---------------------------------------------------------------------------
# Frontmatter (YAML)
# ---------------------------------------------------------------------------
_FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n(.*)\Z", re.DOTALL)


@dataclass(frozen=True)
class Frontmatter:
    """Parsed wiki page frontmatter (subset of our schema, OKF-export relevant fields)."""

    type: str
    status: str | None
    title: str | None
    description: str | None
    last_ingested_from: str | None
    created: str | None
    updated: str | None
    related_pages: tuple[str, ...]
    tags: tuple[str, ...]
    adr_id: str | None
    vcs_commit: str | None  # ADR-018/019: per-page commit SHA for pinned URL
    vcs_ref: str | None    # ADR-018: per-page ref (branch/tag) for ref-pinned URL
    r9_skip: bool
    raw: dict[str, object] = field(default_factory=dict)
    @classmethod
    def parse(cls, text: str) -> "Frontmatter":
        """Parse wiki frontmatter block. Raises InvalidFrontmatterError on missing `type`."""
        m = _FRONTMATTER_RE.match(text)
        if not m:
            raise InvalidFrontmatterError("no YAML frontmatter block found (--- delimiters)")
        body_yaml = m.group(1)
        # Minimal YAML parse — our schema uses scalar values + list-of-strings only.
        # Avoid pulling in PyYAML dependency for this PoC.
        raw: dict[str, object] = _parse_simple_yaml(body_yaml)

        if "type" not in raw or not str(raw["type"]).strip():
            raise InvalidFrontmatterError("missing or empty `type` field (required by OKF §4.1)")

        type_val = str(raw["type"]).strip()
        if type_val not in OKF_WIKI_VALID_TYPES:
            # OKF 자체는 free-string tolerate. 우리 가 strict. warn 만.
            pass

        return cls(
            type=type_val,
            status=str(raw.get("status", "")).strip() or None,
            title=str(raw.get("title", "")).strip() or None,
            description=str(raw.get("description", "")).strip() or None,
            last_ingested_from=str(raw.get("last_ingested_from", "")).strip() or None,
            created=str(raw.get("created", "")).strip() or None,
            updated=str(raw.get("updated", "")).strip() or None,
            related_pages=tuple(_as_str_list(raw.get("related_pages"))),
            tags=tuple(_as_str_list(raw.get("tags"))),
            adr_id=str(raw.get("adr_id", "")).strip() or None,
            vcs_commit=str(raw.get("vcs_commit", "")).strip() or None,
            vcs_ref=str(raw.get("vcs_ref", "")).strip() or None,
            r9_skip=bool(raw.get("r9_skip", False)),
            raw=raw,
        )


def _parse_simple_yaml(body: str) -> dict[str, object]:
    """Minimal YAML parser for our frontmatter subset:
    - `key: value` (scalar string)
    - `key:` (empty / null)
    - `key: [a, b, c]` (inline list)
    - `key:\n  - a\n  - b` (block list)
    Lines starting with `#` are comments.
    """
    out: dict[str, object] = {}
    lines = body.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            i += 1
            continue
        if ":" not in line and not line.startswith(" "):
            i += 1
            continue
        # Detect key (not indented)
        if not line.startswith((" ", "\t")):
            key, _, rest = line.partition(":")
            key = key.strip()
            rest = rest.strip()
            if not rest:
                # could be block list
                # peek next non-empty lines for "- ..."
                j = i + 1
                block_items: list[str] = []
                while j < len(lines):
                    nxt = lines[j]
                    if not nxt.strip():
                        j += 1
                        continue
                    if nxt.lstrip().startswith("- "):
                        block_items.append(nxt.lstrip()[2:].strip())
                        j += 1
                    else:
                        break
                if block_items:
                    out[key] = block_items
                    i = j
                    continue
                else:
                    out[key] = ""
                    i += 1
                    continue
            # inline list `[a, b]`
            if rest.startswith("[") and rest.endswith("]"):
                inner = rest[1:-1].strip()
                if not inner:
                    out[key] = []
                else:
                    out[key] = [s.strip().strip('"\'') for s in inner.split(",") if s.strip()]
                i += 1
                continue
            # boolean / scalar
            if rest in ("true", "True", "yes"):
                out[key] = True
            elif rest in ("false", "False", "no"):
                out[key] = False
            elif rest in ("null", "None", "~"):
                out[key] = None
            else:
                # strip surrounding quotes
                if (rest.startswith('"') and rest.endswith('"')) or (
                    rest.startswith("'") and rest.endswith("'")
                ):
                    rest = rest[1:-1]
                out[key] = rest
            i += 1
        else:
            i += 1
    return out


def _as_str_list(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return []
        # Inline list
        if s.startswith("[") and s.endswith("]"):
            inner = s[1:-1].strip()
            if not inner:
                return []
            return [t.strip().strip('"\'') for t in inner.split(",") if t.strip()]
        return [s]
    return [str(value)]


# ---------------------------------------------------------------------------
# Mapping: wiki frontmatter → OKF frontmatter
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class OkfMapping:
    """Mapping decision log (per OKF spec §4.1)."""

    frontmatter_lines: tuple[str, ...]
    body_suffix: tuple[str, ...]  # extra body section(s) appended (e.g. ## Citations, ## See Also)


def _date_to_iso8601(date_str: str | None) -> str | None:
    """`YYYY-MM-DD` → `YYYY-MM-DDTHH:MM:SSZ` (OKF recommended, ISO 8601)."""
    if not date_str:
        return None
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        return None
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _derive_resource(
    last_ingested_from: str | None,
    *,
    repo_root: Path | None = None,
    resolve: bool = True,
    vcs_commit: str | None = None,
    vcs_ref: str | None = None,
) -> str | None:
    """OKF `resource`: canonical URI for the underlying asset (ADR-006 + ADR-018).

    Resolution order:
    1. URL form (`http://` / `https://`) → 그대로 사용
    2. in-repo path + `vcs_commit` 명시 → commit-pinned URL (immutable, ADR-018)
    3. in-repo path + `vcs_ref` 명시 → ref-pinned URL (mutable but explicit)
    4. in-repo path + `resolve=True` + `repo_root` → `path_resolver.resolve_in_repo_path_to_url`
    5. in-repo path + `resolve=False` → None (ADR-006 status quo)
    6. None / empty → None
    """
    if not last_ingested_from:
        return None
    if last_ingested_from.startswith(("http://", "https://")):
        return last_ingested_from
    if not resolve or repo_root is None:
        return None
    # Lazy import to avoid hard dependency if not used
    try:
        from workflow_kit.path_resolver import (
            resolve_in_repo_path_to_url,
            resolve_in_repo_path_to_url_pinned,
        )
    except ImportError:
        return None
    # commit-pinned URL (immutable) takes precedence over default-branch URL
    if vcs_commit or vcs_ref:
        return resolve_in_repo_path_to_url_pinned(
            last_ingested_from, repo_root,
            commit_sha=vcs_commit, ref=vcs_ref,
        )
    return resolve_in_repo_path_to_url(last_ingested_from, repo_root)


def _extract_title_and_description(body: str, fallback_title: str) -> tuple[str, str | None]:
    """Derive `title` (first H1) and `description` (first prose paragraph) from body.

    OKF §4.1 권장 field 가 frontmatter 에 없으면 body 에서 derive. 이건 consumer-friendly
    (index.md 생성기, search snippet) 위해 중요.
    """
    # title: 첫 `# ` (H1)
    title = fallback_title
    description: str | None = None
    lines = body.splitlines()
    i = 0
    # skip leading empty lines
    while i < len(lines) and not lines[i].strip():
        i += 1
    # first non-empty, non-heading paragraph
    prose_buf: list[str] = []
    saw_heading_or_block = False
    for line in lines[i:]:
        s = line.strip()
        if s.startswith("# "):
            title = s[2:].strip()
            saw_heading_or_block = True
            continue
        if s.startswith(("#", "```", "|", "- ", "* ", "> ", "###", "##")):
            if prose_buf:
                break
            saw_heading_or_block = True
            continue
        if not s:
            if prose_buf:
                break
            continue
        # plain prose line
        if not saw_heading_or_block and not title:
            continue
        prose_buf.append(s)
        if len(prose_buf) >= 3:
            break
    if prose_buf:
        joined = " ".join(prose_buf)
        if len(joined) > 200:
            joined = joined[:197] + "..."
        description = joined
    return title, description


def _derive_tags(frontmatter: Frontmatter) -> tuple[str, ...]:
    """OKF `tags` = wiki `tags` ∪ derived from `status` + `type`."""
    out: list[str] = list(frontmatter.tags)
    if frontmatter.status:
        out.append(f"status:{frontmatter.status}")
    if frontmatter.type:
        out.append(f"wiki-type:{frontmatter.type}")
    # de-dupe, preserve order
    seen: set[str] = set()
    deduped: list[str] = []
    for t in out:
        if t not in seen:
            seen.add(t)
            deduped.append(t)
    return tuple(deduped)


def map_frontmatter_to_okf(
    frontmatter: Frontmatter,
    body: str = "",
    *,
    repo_root: Path | None = None,
    resolve: bool = True,
    vcs_commit: str | None = None,
    vcs_ref: str | None = None,
    content_hash: str | None = None,
    range_refs: tuple[str, str] | None = None,
) -> OkfMapping:
    """wiki Frontmatter → OKF frontmatter (SPEC.md §4.1) + body suffix (Citations §8).

    vcs_commit/vcs_ref priority: explicit kwarg > frontmatter field. Per-page
    frontmatter `vcs_commit` field override site-wide CLI (ADR-018 follow-up).


    Field ordering follows SPEC.md §4.1 권장 priority:
    """
    okf: dict[str, object] = {}

    # required
    okf["type"] = frontmatter.type

    # recommended (priority order per SPEC.md §4.1)
    # 1. title — frontmatter 우선, 없으면 body H1 에서 derive, 그것도 없으면 파일명 stem
    fallback_title = frontmatter.type  # last-resort fallback
    body_title: str | None = None
    body_description: str | None = None
    if body:
        body_title, body_description = _extract_title_and_description(body, fallback_title)
    if frontmatter.title:
        okf["title"] = frontmatter.title
    elif body_title:
        okf["title"] = body_title
    # 2. description — frontmatter 우선, 없으면 body 첫 prose paragraph
    if frontmatter.description:
        okf["description"] = frontmatter.description
    elif body_description:
        okf["description"] = body_description
    # 3. resource — URL last_ingested_from 만 매핑
    # vcs_commit priority: kwarg > frontmatter field
    effective_vcs_commit = vcs_commit if vcs_commit else frontmatter.vcs_commit
    effective_vcs_ref = vcs_ref if vcs_ref else frontmatter.vcs_ref
    resource = _derive_resource(frontmatter.last_ingested_from, repo_root=repo_root, resolve=resolve, vcs_commit=effective_vcs_commit, vcs_ref=effective_vcs_ref)
    # v0.7.39+ ADR-019 layer 1: append ?hash=sha256:<hex> when content_hash provided
    if resource and content_hash:
        sep = "&" if "?" in resource else "?"
        resource = f"{resource}{sep}hash={content_hash}"
    # v0.7.40+ ADR-019 layer 2: append ?range=<sha1>..<sha2> when range_refs provided
    if resource and range_refs:
        sha1, sha2 = range_refs
        sep = "&" if "?" in resource else "?"
        resource = f"{resource}{sep}range={sha1}..{sha2}"
    if resource:
        okf["resource"] = resource
    tags = _derive_tags(frontmatter)
    if tags:
        okf["tags"] = list(tags)
    timestamp = _date_to_iso8601(frontmatter.updated) or _date_to_iso8601(frontmatter.created)
    if timestamp:
        okf["timestamp"] = timestamp

    # Extensions (SPEC.md §4.1: producers MAY include additional keys; consumers SHOULD NOT reject)
    if frontmatter.created:
        okf["created"] = frontmatter.created
    if frontmatter.status:
        okf["status"] = frontmatter.status
    if frontmatter.related_pages:
        okf["related_pages"] = list(frontmatter.related_pages)
    if frontmatter.adr_id:
        okf["adr_id"] = frontmatter.adr_id
    if frontmatter.r9_skip:
        okf["r9_skip"] = True
    if frontmatter.last_ingested_from and not resource:
        # in-repo path — preserve as extra key (unknown key OK per §4.1)
        okf["last_ingested_from"] = frontmatter.last_ingested_from

    # serialize
    lines: list[str] = ["---"]
    for key, value in okf.items():
        if isinstance(value, list):
            if all(isinstance(v, str) and "," not in v and "[" not in v and "]" not in v for v in value):
                inline = ", ".join(value)
                lines.append(f"{key}: [{inline}]")
            else:
                lines.append(f"{key}:")
                for v in value:
                    lines.append(f"  - {v}")
        elif isinstance(value, bool):
            lines.append(f"{key}: {'true' if value else 'false'}")
        elif isinstance(value, str):
            if any(c in value for c in [":", "#", "&", "*", "{", "}", "[", "]", "|", ">", "<", "%", "@", "`"]):
                lines.append(f'{key}: "{value}"')
            else:
                lines.append(f"{key}: {value}")
        else:
            lines.append(f"{key}: {value}")
    lines.append("---")

    # body suffix: ## Citations for in-repo last_ingested_from (per SPEC.md §8)
    body_suffix: list[str] = []
    if frontmatter.last_ingested_from and not resource:
        body_suffix.append("")
        body_suffix.append("## Citations")
        body_suffix.append("")
        body_suffix.append(f"[1] [{frontmatter.last_ingested_from}]({frontmatter.last_ingested_from})")
    if frontmatter.related_pages:
        body_suffix.append("")
        body_suffix.append("## See Also")
        body_suffix.append("")
        for ref in frontmatter.related_pages:
            # OKF §5.1 bundle-relative link
            body_suffix.append(f"- [{ref}](../{ref})")

    return OkfMapping(frontmatter_lines=tuple(lines), body_suffix=tuple(body_suffix))


# ---------------------------------------------------------------------------
# Body rewriting: [[wiki-link]] → [text](../path.md#anchor)
# ---------------------------------------------------------------------------
_WIKI_LINK_RE = re.compile(r"\[\[([^\]]+?)\]\]")


def rewrite_wiki_links_to_okf(body: str) -> str:
    """[[path/to/page]] → [page](../path/to/page.md)
    [[path/to/page#anchor]] → [page](../path/to/page.md#anchor)
    """

    def _sub(m: re.Match[str]) -> str:
        target = m.group(1).strip()
        if "#" in target:
            path, _, anchor = target.partition("#")
            path = path.strip()
            anchor = anchor.strip()
        else:
            path = target
            anchor = ""
        # display text: page basename (sans path prefix)
        display = path.rsplit("/", 1)[-1] if path else target
        # OKF bundle-relative: ../<path>.md
        if not path.endswith(".md"):
            url = f"../{path}.md"
        else:
            url = f"../{path}"
        if anchor:
            url = f"{url}#{anchor}"
        return f"[{display}]({url})"

    return _WIKI_LINK_RE.sub(_sub, body)


def generate_index_md(
    pages: list[tuple[Path, str, Frontmatter]],
    *,
    okf_version: str = "0.1",
    generated_at: str | None = None,
    generator: str = "workflow_kit.okf_export v0.7.34+",
) -> str:
    """Generate bundle root `index.md` content.

    OKF SPEC.md §6 index file format. Frontmatter per §11 `okf_version`.
    Body: section heading per type (concepts/decisions/entities/patterns/queries)
    with bullet list of `[title](relative-url) — description` entries.

    Args:
        pages: list of (out_path, relative_path, frontmatter) tuples for emitted pages
        okf_version: OKF spec version to declare in frontmatter
        generated_at: ISO 8601 timestamp (default: now UTC)
        generator: generator identifier string

    Returns:
        Full index.md content (frontmatter + body), ready to write.
    """
    if generated_at is None:
        generated_at = datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # group by top-level dir (concepts/decisions/entities/patterns/queries)
    by_type: dict[str, list[tuple[str, str, str]]] = {}
    for _out_path, rel, fm in pages:
        parts = Path(rel).parts
        if not parts:
            continue
        type_dir = parts[0]
        # title fallback: H1 from body if not in frontmatter (we use fm.title if set)
        title = fm.title or Path(rel).stem
        description = (fm.description or "").strip()
        # shorten description to 1 line
        if description and len(description) > 120:
            description = description[:117] + "..."
        entry = (rel, title, description)
        by_type.setdefault(type_dir, []).append(entry)

    # stable ordering by type dir name + relative path
    type_order = ["concepts", "decisions", "entities", "patterns", "queries"]
    sorted_types = sorted(by_type.keys(), key=lambda t: (type_order.index(t) if t in type_order else 99, t))

    # frontmatter
    lines: list[str] = ["---"]
    lines.append(f"okf_version: \"{okf_version}\"")
    lines.append(f"generated_at: \"{generated_at}\"")
    lines.append(f"generator: \"{generator}\"")
    lines.append("---")
    lines.append("")
    lines.append("# Knowledge Bundle Index")
    lines.append("")
    lines.append(f"Auto-generated by `{generator}` on {generated_at}. OKF spec v{okf_version}.")
    lines.append("")

    for type_dir in sorted_types:
        type_title = type_dir.capitalize()
        lines.append(f"## {type_title}")
        lines.append("")
        for rel, title, description in sorted(by_type[type_dir], key=lambda e: e[0]):
            if description:
                lines.append(f"- [{title}]({rel}) — {description}")
            else:
                lines.append(f"- [{title}]({rel})")
        lines.append("")
    return "\n".join(lines) + "\n"


def _compute_bundle_integrity_hash(
    pages: list[tuple[Path, str, Frontmatter]],
) -> str:
    """SHA256 of all exported page bytes, sorted by relative path (deterministic).

    v0.7.38+ ADR-019 convention. The integrity hash is byte-level; consumers can
    recompute and compare to detect any byte change in the bundle.
    """
    import hashlib
    sha = hashlib.sha256()
    for out_path, rel, _fm in sorted(pages, key=lambda e: e[1]):
        sha.update(out_path.read_bytes())
    return f"sha256:{sha.hexdigest()}"


def _write_bundle_manifest(
    out_bundle: Path,
    pages: list[tuple[Path, str, Frontmatter]],
    *,
    vcs_commit: str | None = None,
    vcs_ref: str | None = None,
) -> Path:
    """Emit `okf-bundle.yaml` (per-bundle manifest) at the bundle root.

    Schema (v0.7.38+, ADR-019 convention):
      okf_version: "0.1"
      generated_at: <ISO 8601>
      generator: "workflow_kit.okf_export vX.Y.Z"
      vcs_commit: <sha>  (optional)
      vcs_ref: <ref>     (optional)
      integrity_hash: "sha256:<hex>"
      page_count: N
    """
    import hashlib
    try:
        from workflow_kit import __version__ as _wk_version
    except (ImportError, ModuleNotFoundError):
        _wk_version = "unknown"
    integrity = _compute_bundle_integrity_hash(pages)
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    manifest_lines = [
        f"okf_version: '0.1'",
        f"generated_at: '{generated_at}'",
        f"generator: 'workflow_kit.okf_export {_wk_version}'",
    ]
    if vcs_commit:
        manifest_lines.append(f"vcs_commit: '{vcs_commit}'")
    if vcs_ref:
        manifest_lines.append(f"vcs_ref: '{vcs_ref}'")
    manifest_lines.append(f"integrity_hash: '{integrity}'")
    manifest_lines.append(f"page_count: {len(pages)}")
    manifest_path = out_bundle / "okf-bundle.yaml"
    manifest_path.write_text("\n".join(manifest_lines) + "\n", encoding="utf-8")
    return manifest_path


# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class ExportReport:
    """Result summary of a wiki → OKF export run."""

    pages_exported: int
    pages_skipped: int
    out_bundle: Path
    errors: tuple[str, ...] = field(default_factory=tuple)


def _is_wiki_page(path: Path, wiki_root: Path) -> bool:
    """wiki page 인지 판별: 5 type 디렉토리 안의 .md."""
    if path.suffix != ".md":
        return False
    try:
        rel = path.relative_to(wiki_root)
    except ValueError:
        return False
    parts = rel.parts
    if not parts:
        return False
    if parts[0] not in ("concepts", "decisions", "entities", "patterns", "queries"):
        return False
    if path.name in OKF_RESERVED_FILES or path.name in ("SCHEMA.md", "INGEST_GUIDE.md", "index.md", "log.md"):
        return False
    return True


def _out_path_for_wiki_page(wiki_page: Path, wiki_root: Path, out_bundle: Path) -> Path:
    """wiki page path → OKF bundle path.

    Example:
        ai-workflow/wiki/concepts/foo.md → <bundle>/concepts/foo.md
        ai-workflow/wiki/decisions/adr-005-x.md → <bundle>/decisions/adr-005-x.md
    """
    rel = wiki_page.relative_to(wiki_root)
    return out_bundle / rel


def export_wiki_page(
    wiki_page: Path,
    out_path: Path,
    *,
    repo_root: Path | None = None,
    resolve: bool = True,
    vcs_commit: str | None = None,
    vcs_ref: str | None = None,
    content_hash: str | None = None,
    range_refs: tuple[str, str] | None = None,
) -> tuple[int, int]:
    text = wiki_page.read_text(encoding="utf-8")

    # split frontmatter / body
    m = _FRONTMATTER_RE.match(text)
    if not m:
        raise InvalidFrontmatterError(f"{wiki_page}: no frontmatter block")
    body_text = m.group(2).rstrip("\n")
    fm = Frontmatter.parse(text)
    # v0.7.39+ ADR-019 layer 1: auto-compute content_hash from full page text (frontmatter + body)
    if content_hash == "auto":
        import hashlib
        content_hash = "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()
    mapping = map_frontmatter_to_okf(fm, body=body_text, repo_root=repo_root, resolve=resolve, vcs_commit=vcs_commit, vcs_ref=vcs_ref, content_hash=content_hash, range_refs=range_refs)
    body_rewritten = rewrite_wiki_links_to_okf(body_text)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_text = "\n".join(mapping.frontmatter_lines) + "\n" + body_rewritten + "\n"
    if mapping.body_suffix:
        out_text += "\n".join(mapping.body_suffix) + "\n"
    out_path.write_text(out_text, encoding="utf-8")
    return (1, 0)
def export_wiki_to_okf(
    wiki_root: Path,
    out_bundle: Path,
    page_filter: Callable[[Path], bool] | None = None,
    *,
    repo_root: Path | None = None,
    resolve: bool = True,
    vcs_commit: str | None = None,
    vcs_ref: str | None = None,
    emit_manifest: bool = True,
    content_hash: str | None = None,
    range_refs: tuple[str, str] | None = None,
) -> ExportReport:
    """Export a wiki directory tree to an OKF bundle directory.

    Args:
        wiki_root: path to ai-workflow/wiki/ (or subdir thereof)
        out_bundle: target bundle directory (created if missing)
        page_filter: optional predicate(wiki_page) → bool. True = include.
        repo_root: path to git repository root (for `path_resolver` integration)
        resolve: if True (default), in-repo `last_ingested_from` path → GitHub URL
            via `workflow_kit.path_resolver`. Set False to skip resolve (ADR-006 status quo).

    Returns:
        ExportReport with counts and any per-file errors.
    """
    wiki_root = wiki_root.resolve()
    out_bundle = out_bundle.resolve()
    out_bundle.mkdir(parents=True, exist_ok=True)
    exported = 0
    skipped = 0
    errors: list[str] = []
    collected_pages: list[tuple[Path, str, Frontmatter]] = []

    for path in sorted(wiki_root.rglob("*.md")):
        if not _is_wiki_page(path, wiki_root):
            continue
        if page_filter and not page_filter(path):
            skipped += 1
            continue
        try:
            out_path = _out_path_for_wiki_page(path, wiki_root, out_bundle)
            ex, sk = export_wiki_page(
                path, out_path, repo_root=repo_root, resolve=resolve,
                vcs_commit=vcs_commit, vcs_ref=vcs_ref, content_hash=content_hash, range_refs=range_refs,
            )
            skipped += sk
            exported += ex
            try:
                rel = str(out_path.relative_to(out_bundle))
                exported_text = out_path.read_text(encoding="utf-8")
                fm = Frontmatter.parse(exported_text)
                collected_pages.append((out_path, rel, fm))
            except Exception:
                pass
        except WikiToOkfError as e:
            errors.append(str(e))
            skipped += 1

    # emit bundle root index.md (OKF SPEC.md §6 + §11)
    if collected_pages:
        try:
            index_content = generate_index_md(collected_pages)
            (out_bundle / "index.md").write_text(index_content, encoding="utf-8")
        except Exception as e:
            errors.append(f"index.md emission failed: {e}")

    # emit per-bundle manifest: okf-bundle.yaml (v0.7.38+, ADR-019 convention)
    # integrity_hash = SHA256 of all exported page bytes (deterministic order)
    if emit_manifest and collected_pages:
        try:
            _write_bundle_manifest(
                out_bundle, collected_pages,
                vcs_commit=vcs_commit, vcs_ref=vcs_ref,
            )
        except Exception as e:
            errors.append(f"okf-bundle.yaml emission failed: {e}")
    return ExportReport(
        pages_exported=exported,

        pages_skipped=skipped,
        out_bundle=out_bundle,
        errors=tuple(errors),
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def _build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="workflow_kit.okf_export",
        description="wiki → OKF v0.1 bundle export (PoC, v0.7.33+).",
    )
    p.add_argument(
        "--wiki",
        type=Path,
        required=True,
        help="path to ai-workflow/wiki/ root (or single .md page)",
    )
    p.add_argument(
        "--out",
        type=Path,
        required=True,
        help="output OKF bundle directory (created if missing)",
    )
    p.add_argument(
        "--include",
        action="append",
        default=[],
        help="page name substring to include (repeatable); default = all",
    )
    p.add_argument(
        "--exclude",
        action="append",
        default=[],
        help="page name substring to exclude (repeatable); applied after --include",
    )
    p.add_argument(
        "--json",
        action="store_true",
        help="JSON output (ExportReport as JSON)",
    )
    p.add_argument(
        "--repo-root",
        type=Path,
        default=None,
        help="path to git repo root (for path_resolver integration, ADR-008)",
    )
    p.add_argument(
        "--no-resolve",
        action="store_true",
        help="skip in-repo path → URL resolve (ADR-006 status quo; default: resolve ON)",
    )
    p.add_argument(
        "--vcs-commit",
        help="commit SHA for commit-pinned URL emit (ADR-018). Format: 7-40 hex chars.",
    )
    p.add_argument(
        "--vcs-ref",
        help="ref (branch/tag) for ref-pinned URL emit (ADR-018).",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    args = _build_arg_parser().parse_args(argv)
    wiki = args.wiki.resolve()
    if not wiki.exists():
        print(f"ERROR: --wiki path not found: {wiki}", file=sys.stderr)
        return 2

    if wiki.is_file():
        # single page mode
        if wiki.suffix != ".md":
            print(f"ERROR: --wiki file is not .md: {wiki}", file=sys.stderr)
            return 2
        try:
            # Use wiki's parent as root so the relative path resolves under "concepts/..." etc.
            guessed_root = wiki.parent.parent  # .../concepts/foo.md → .../concepts/.. = wiki
            out_path = args.out / wiki.relative_to(guessed_root)
            ex, sk = export_wiki_page(wiki, out_path)
            report = ExportReport(pages_exported=ex, pages_skipped=sk, out_bundle=args.out.resolve())
        except WikiToOkfError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
    else:
        includes: list[str] = list(args.include)
        excludes: list[str] = list(args.exclude)

        def _filter(p: Path) -> bool:
            name = p.name
            if includes and not any(inc in name for inc in includes):
                return False
            if excludes and any(exc in name for exc in excludes):
                return False
            return True

        repo_root = (args.repo_root or wiki).parent.parent.parent.parent  # heuristic: walk up from wiki/ to repo root
        # better: if --repo-root explicit, use it; else try to find git root
        if args.repo_root is None:
            from workflow_kit.path_resolver import _detect_origin_url
            # try each parent until origin found
            for candidate in [wiki, *wiki.parents]:
                if _detect_origin_url(candidate) is not None:
                    repo_root = candidate
                    break
            else:
                repo_root = wiki  # fallback
        report = export_wiki_to_okf(
            wiki, args.out, page_filter=_filter, repo_root=repo_root, resolve=not args.no_resolve,
        )

    if args.json:
        import json as _json

        print(
            _json.dumps(
                {
                    "pages_exported": report.pages_exported,
                    "pages_skipped": report.pages_skipped,
                    "out_bundle": str(report.out_bundle),
                    "errors": list(report.errors),
                },
                indent=2,
            )
        )
    else:
        print(f"OKF bundle exported: {report.out_bundle}")
        print(f"  pages_exported: {report.pages_exported}")
        print(f"  pages_skipped:  {report.pages_skipped}")
        if report.errors:
            print(f"  errors ({len(report.errors)}):")
            for err in report.errors:
                print(f"    - {err}")
    return 0 if not report.errors else 1


if __name__ == "__main__":
    sys.exit(main())
