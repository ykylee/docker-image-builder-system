# standard-ai-workflow-kit: v0.15.19-beta

"""

OKF (Open Knowledge Format) v0.1 spec 의 consumer. ADR-007 채택 — loose/strict mode
opt-in, OKF spec §9 의 5 MUST NOT reject 정책 (loose mode) + 우리 wiki strict lint
(strict mode) 의 *additive* 양립.

Spec reference: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md

두 ingest mode:
- **strict** (default): 우리 wiki lint (V-1, V-4, V-R9, V-T1, OKF §4.1 hard 3 rule) full
  적용. OKF spec 위반 시 reject.
- **loose**: OKF SPEC.md §9 의 5 MUST NOT 정책 적용 (unknown key / broken link /
  missing optional / unknown type tolerate). 우리 wiki 의 strict 4 lint 는 warn 만
  (V-1 error, V-4 warn, V-R9 disabled, V-T1 warn, OKF §4.1 hard 3 rule error).

Mode 결정 우선순위:
  1. CLI flag `--mode=loose|strict` (highest)
  2. bundle root `okf-bundle.yaml` manifest
  3. bundle root `index.md` frontmatter `okf_mode: loose`
  4. default = strict

OKF spec §11 의 bundle root `index.md` frontmatter `okf_version: "0.1"` detect (ADR-011).

Usage:
    from workflow_kit.okf_import import (
        import_okf_bundle,
        detect_mode,
        OkfImportError,
        ImportReport,
    )

    report = import_okf_bundle(
        bundle=Path("/path/to/okf-bundle"),
        staging=Path(".okf_staging/my-bundle"),
        mode="loose",
    )

CLI:
    python -m workflow_kit.okf_import --bundle <path> [--mode=loose|strict] [--staging <path>] [--promote] [--json]
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, cast

# Re-use frontmatter parser from okf_export
from workflow_kit.okf_export import (
    Frontmatter,
    _FRONTMATTER_RE,
    _parse_simple_yaml,
    OKF_RESERVED_FILES,
)

# ---------------------------------------------------------------------------
# OKF v0.1 spec constants (SPEC.md §4.1, §6, §9, §11)
# ---------------------------------------------------------------------------
OKF_SPEC_VERSION: str = "0.1"
OKF_HARD_RULE_FIELDS: tuple[str, ...] = ("type",)  # §4.1 required
OKF_RESERVED_FILENAMES: frozenset[str] = OKF_RESERVED_FILES

# OKF spec §9 MUST NOT reject list (loose mode)
LOOSE_MODE_TOLERANCE: tuple[str, ...] = (
    "missing_optional",
    "unknown_type",
    "unknown_key",
    "broken_link",
    "missing_index",
)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------
class OkfImportError(Exception):
    """Base error for OKF → wiki import."""


class OkfConformanceError(OkfImportError):
    """OKF spec §4.1 hard rule violation (3 hard rules: parseable frontmatter, non-empty type, reserved filename)."""


# ---------------------------------------------------------------------------
# Mode detection
# ---------------------------------------------------------------------------
Mode = Literal["strict", "loose"]


def detect_mode(
    bundle: Path,
    cli_mode: str | None = None,
) -> Mode:
    """OKF bundle 의 mode detect. 우선순위: CLI > manifest > index.md frontmatter > strict.

    Args:
        bundle: path to OKF bundle root
        cli_mode: explicit mode override (highest priority)

    Returns:
        "strict" or "loose"
    """
    if cli_mode is not None:
        if cli_mode not in ("strict", "loose"):
            raise OkfImportError(f"invalid mode: {cli_mode!r} (expected 'strict' or 'loose')")
        return cast(Mode, cli_mode)

    # 2. okf-bundle.yaml manifest
    manifest = bundle / "okf-bundle.yaml"
    if manifest.is_file():
        m = _parse_simple_yaml(manifest.read_text(encoding="utf-8"))
        declared = str(m.get("mode", "")).strip().lower()
        if declared in ("strict", "loose"):
            return cast(Mode, declared)

    # 3. index.md frontmatter
    index_md = bundle / "index.md"
    if index_md.is_file():
        text = index_md.read_text(encoding="utf-8")
        m_match = _FRONTMATTER_RE.match(text)
        if m_match:
            fm = _parse_simple_yaml(m_match.group(1))
            declared = str(fm.get("okf_mode", "")).strip().lower()
            if declared in ("strict", "loose"):
                return cast(Mode, declared)

    # 4. default
    return "strict"


# ---------------------------------------------------------------------------
# Version detection (ADR-011)
# ---------------------------------------------------------------------------
OUR_OKF_VERSION: tuple[int, int] = (0, 1)  # major, minor


@dataclass(frozen=True)
class VersionCheckResult:
    """Result of OKF spec version compatibility check (ADR-011)."""

    bundle_version: str | None
    our_version: str
    status: str  # "pass" | "warn" | "error"
    message: str


def _parse_okf_version(s: str | None) -> tuple[int, int] | None:
    """Parse "X.Y" string to (major, minor) tuple. Returns None if malformed.

    Spec §11: canonical form is "X.Y" (e.g. "0.1", "0.2", "1.0"). We accept:
    - "0.1" / "1.0" — canonical
    - "v0.1" / "v1.0" — common variant (strip 'v' prefix)
    - "0.1.0" / "0.1.5" — semver (ignore patch)

    Returns None for: "1", "0.1.0-beta", "abc", etc.
    """
    if not s:
        return None
    s = s.strip().lower()
    if s.startswith("v"):
        s = s[1:]
    # split by dot
    parts = s.split(".")
    if len(parts) < 2:
        return None
    try:
        major = int(parts[0])
        minor = int(parts[1])
    except ValueError:
        return None
    if major < 0 or minor < 0:
        return None
    return (major, minor)


def _check_version_compatibility(
    bundle_version: str | None,
    our_version: tuple[int, int] = OUR_OKF_VERSION,
) -> VersionCheckResult:
    """Check bundle version against our consumer version (ADR-011 policy).

    Policy (OKF spec §11):
    - exact match (major+minor equal) → pass
    - minor higher (same major, larger minor) → warn (backward-compatible)
    - major higher → error (breaking change)
    - older (lower major OR same major lower minor) → error
    - missing → warn (assume our version)
    - malformed → warn (best-effort)
    """
    our_str = f"{our_version[0]}.{our_version[1]}"
    parsed = _parse_okf_version(bundle_version)
    if parsed is None:
        if bundle_version is None or not bundle_version.strip():
            return VersionCheckResult(
                bundle_version=None,
                our_version=our_str,
                status="warn",
                message="no okf_version declared in bundle root index.md; assuming v" + our_str,
            )
        return VersionCheckResult(
            bundle_version=bundle_version,
            our_version=our_str,
            status="warn",
            message=f"malformed okf_version {bundle_version!r}; best-effort parse failed, assuming v{our_str}",
        )
    b_major, b_minor = parsed
    o_major, o_minor = our_version
    if b_major == o_major and b_minor == o_minor:
        return VersionCheckResult(
            bundle_version=bundle_version,
            our_version=our_str,
            status="pass",
            message=f"okf_version {bundle_version} matches our v{our_str}",
        )
    if b_major == o_major and b_minor > o_minor:
        return VersionCheckResult(
            bundle_version=bundle_version,
            our_version=our_str,
            status="warn",
            message=f"okf_version {bundle_version} > our v{our_str} (minor higher, backward-compatible per spec §11)",
        )
    if b_major > o_major:
        return VersionCheckResult(
            bundle_version=bundle_version,
            our_version=our_str,
            status="error",
            message=f"okf_version {bundle_version} has major > our v{our_str} (breaking change, our consumer cannot safely process)",
        )
    # older (lower major or same major lower minor)
    return VersionCheckResult(
        bundle_version=bundle_version,
        our_version=our_str,
        status="error",
        message=f"okf_version {bundle_version} < our v{our_str} (bundle is older than our consumer; refusing)",
    )
    return "strict"


# ---------------------------------------------------------------------------
# Bundle parsing
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class ParsedPage:
    """Parsed OKF bundle page."""

    source_path: Path
    relative_path: str  # bundle-relative (e.g. "concepts/foo.md")
    frontmatter: Frontmatter
    body: str


@dataclass(frozen=True)
class LintIssue:
    """Single lint issue from a page (warning or error)."""

    page: Path
    severity: Literal["error", "warn"]
    rule: str  # e.g. "V-1", "V-4", "V-R9", "V-T1", "OKF-§4.1", "OKF-§9"
    message: str


def _parse_bundle_pages(bundle: Path) -> list[ParsedPage]:
    """Parse all .md files in bundle (excluding reserved filenames per §3.1)."""
    pages: list[ParsedPage] = []
    for path in sorted(bundle.rglob("*.md")):
        if path.name in OKF_RESERVED_FILENAMES:
            continue
        text = path.read_text(encoding="utf-8")
        m = _FRONTMATTER_RE.match(text)
        if not m:
            # §4.1 hard rule 1: parseable frontmatter required
            # raise here; caller catches per-page in ImportReport
            continue
        try:
            fm = Frontmatter.parse(text)
        except Exception:  # noqa: BLE001
            continue
        body = m.group(2)
        rel = str(path.relative_to(bundle))
        pages.append(ParsedPage(source_path=path, relative_path=rel, frontmatter=fm, body=body))
    return pages


# ---------------------------------------------------------------------------
# Lint per mode
# ---------------------------------------------------------------------------
_WIKI_LOCATIONS: frozenset[str] = frozenset({"concepts", "decisions", "entities", "patterns", "queries"})


def _page_location_ok(relative_path: str) -> bool:
    """V-1: page is in a wiki-type directory (concepts/decisions/entities/patterns/queries)."""
    parts = Path(relative_path).parts
    if not parts:
        return False
    return parts[0] in _WIKI_LOCATIONS


def _check_v1_location(page: ParsedPage, mode: Mode) -> LintIssue | None:
    """V-1: page must be in a wiki-type subdir."""
    if _page_location_ok(page.relative_path):
        return None
    return LintIssue(
        page=page.source_path,
        severity="error" if mode == "strict" else "warn",
        rule="V-1",
        message=f"page not in wiki-type subdir: {page.relative_path!r} (expected one of {sorted(_WIKI_LOCATIONS)})",
    )


def _check_v4_index_structure(page: ParsedPage, mode: Mode) -> LintIssue | None:
    """V-4: stub — OKF bundle has no `index.md` anchor structure."""
    # V-4 applies to wiki `index.md`, not to OKF pages themselves.
    # For OKF pages, this is N/A. We never emit V-4 issues for OKF bundle pages.
    return None


def _check_v9_source_rule(page: ParsedPage, mode: Mode) -> LintIssue | None:
    """V-R9: archive source rule. Disabled in loose mode (external bundle has no archive path)."""
    if mode == "loose":
        return None
    # strict mode: V-R9 expects `last_ingested_from` to point inside `memory/archive/`.
    # OKF pages typically have external `resource` URL — strict mode would reject.
    lif = page.frontmatter.last_ingested_from
    if lif and ("archive/" in lif or lif.startswith("http")):
        return None
    return LintIssue(
        page=page.source_path,
        severity="error" if mode == "strict" else "warn",
        rule="V-R9",
        message=f"missing or invalid last_ingested_from (expected archive/ path or URL): got {lif!r}",
    )


def _check_okf_4_1_hard(page: ParsedPage) -> list[LintIssue]:
    """OKF spec §4.1 hard rules: 3 hard requirements (always error in both modes)."""
    issues: list[LintIssue] = []
    # 1. parseable frontmatter (already checked by caller; if we have a ParsedPage, it passed)
    # 2. non-empty `type`
    if not page.frontmatter.type.strip():
        issues.append(
            LintIssue(
                page=page.source_path,
                severity="error",
                rule="OKF-§4.1",
                message="missing or empty `type` field (OKF §4.1 required)",
            )
        )
    # 3. reserved filename — already filtered by _parse_bundle_pages
    return issues


def _check_v_t1_title_consistency(page: ParsedPage, mode: Mode) -> LintIssue | None:
    """V-T1: frontmatter `title` ↔ body `# H1` match (when `title` is set)."""
    title = page.frontmatter.title
    if title is None:
        return None  # frontmatter title absent → no comparison
    h1_match = re.search(r"^# (.+)$", page.body, re.MULTILINE)
    if not h1_match:
        return LintIssue(
            page=page.source_path,
            severity="error" if mode == "strict" else "warn",
            rule="V-T1",
            message=f"frontmatter title {title!r} but no body H1",
        )
    h1 = h1_match.group(1).strip()
    # normalize
    def norm(s: str) -> str:
        return re.sub(r"\s+", " ", s).strip().lower()
    if norm(title) == norm(h1):
        return None
    return LintIssue(
        page=page.source_path,
        severity="error" if mode == "strict" else "warn",
        rule="V-T1",
        message=f"title {title!r} != H1 {h1!r}",
    )


def _check_broken_link(page: ParsedPage, bundle: Path, mode: Mode) -> list[LintIssue]:
    """OKF spec §5.1: bundle-relative links. Loose mode tolerates broken; strict does not."""
    if mode == "loose":
        return []  # MUST NOT reject per §9
    issues: list[LintIssue] = []
    # find all bundle-relative links `](../path.md)` or `](path.md)`
    for m in re.finditer(r"\]\((\.\.?/[^)]+\.md(?:#[^)]*)?)\)", page.body):
        target_rel = m.group(1).lstrip("./")
        # target is relative to the page's directory
        page_dir = page.source_path.parent
        target_path = (page_dir / target_rel).resolve()
        if not target_path.exists():
            issues.append(
                LintIssue(
                    page=page.source_path,
                    severity="error",
                    rule="OKF-§5.1",
                    message=f"broken bundle-relative link: {m.group(1)!r}",
                )
            )
    return issues


def _check_unknown_frontmatter_key(page: ParsedPage, mode: Mode) -> LintIssue | None:
    """OKF spec §4.1: unknown additional keys allowed; warn in loose mode (no enforcement in either)."""
    # OKF spec explicitly allows unknown keys. Our wiki doesn't enforce this either.
    # Skip: no lint issue.
    return None


def lint_page(page: ParsedPage, bundle: Path, mode: Mode) -> list[LintIssue]:
    """Run all applicable lint rules on a single page per mode."""
    issues: list[LintIssue] = []
    for check in (_check_v1_location, _check_v4_index_structure, _check_v9_source_rule, _check_v_t1_title_consistency):
        issue = check(page, mode)
        if issue is not None:
            issues.append(issue)
    issues.extend(_check_okf_4_1_hard(page))
    issues.extend(_check_broken_link(page, bundle, mode))
    unknown = _check_unknown_frontmatter_key(page, mode)
    if unknown:
        issues.append(unknown)
    return issues


# ---------------------------------------------------------------------------
# Staging + promote
# ---------------------------------------------------------------------------
def _stage_page(page: ParsedPage, staging: Path) -> Path:
    """Copy page to staging directory. Returns staged path."""
    out_path = staging / page.relative_path
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        page.source_path.read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    return out_path

def cleanup_staging(
    staging_dir: Path,
    *,
    older_than_seconds: float | None = None,
    dry_run: bool = True,
) -> dict[str, int | str | bool]:
    """Clean up OKF staging directory (v0.7.56+, ADR-019 follow-up)."""
    import time as _time
    now = _time.time()
    if not staging_dir.exists():
        return {
            "scanned": 0, "removed": 0, "kept": 0,
            "dry_run": dry_run, "staging_dir": str(staging_dir),
        }
    files = [p for p in staging_dir.rglob("*") if p.is_file()]
    scanned = len(files)
    removed = 0
    kept = 0
    for f in files:
        try:
            mtime = f.stat().st_mtime
        except OSError:
            kept += 1
            continue
        age = now - mtime
        if older_than_seconds is not None and age <= older_than_seconds:
            kept += 1
            continue
        if not dry_run:
            try:
                f.unlink()
                removed += 1
            except OSError:
                kept += 1
        else:
            removed += 1
    return {
        "scanned": scanned, "removed": removed, "kept": kept,
        "dry_run": dry_run, "staging_dir": str(staging_dir),
    }

# ---------------------------------------------------------------------------
# Import report
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class ImportReport:
    """Result summary of an OKF to wiki import run."""

    mode: Mode
    pages_total: int
    pages_staged: int
    pages_with_errors: int
    pages_with_warnings: int
    staging_dir: Path
    issues: tuple[LintIssue, ...] = field(default_factory=tuple)
    errors: tuple[str, ...] = field(default_factory=tuple)
    promoted: bool = False
    okf_version: str | None = None
    version_check: VersionCheckResult | None = None
    r2_batch_warning: R2BatchWarning | None = None


@dataclass(frozen=True)
class R2BatchWarning:
    """R-2 batch compliance warning (v0.7.40+).

    The SCHEMA.md R-2 rule recommends cumulative ingest be batched (5-15 page
    per ingest event). A batch outside this range triggers a warning to remind
    the operator to consider splitting the ingest or running R-2 batch compliance.
    """
    page_count: int
    threshold_min: int
    threshold_max: int
    recommendation: str


R2_BATCH_THRESHOLD_MIN: int = 5
R2_BATCH_THRESHOLD_MAX: int = 15


def check_r2_batch_size(page_count: int) -> R2BatchWarning | None:
    """R-2 batch compliance heuristic (v0.7.40+).

    Returns R2BatchWarning if page_count is outside the 5-15 range.
    Returns None if page_count is in range.
    """
    if page_count < R2_BATCH_THRESHOLD_MIN:
        return R2BatchWarning(
            page_count=page_count,
            threshold_min=R2_BATCH_THRESHOLD_MIN,
            threshold_max=R2_BATCH_THRESHOLD_MAX,
            recommendation=f"batch is small ({page_count} < {R2_BATCH_THRESHOLD_MIN}). Consider bundling more pages or accepting the small batch.",
        )
    if page_count > R2_BATCH_THRESHOLD_MAX:
        return R2BatchWarning(
            page_count=page_count,
            threshold_min=R2_BATCH_THRESHOLD_MIN,
            threshold_max=R2_BATCH_THRESHOLD_MAX,
            recommendation=f"batch is large ({page_count} > {R2_BATCH_THRESHOLD_MAX}). Consider splitting or running R-2 batch compliance audit.",
        )
    return None


@dataclass(frozen=True)
class R2BatchAuditResult:
    """R-2 batch compliance audit summary (v0.7.41+)."""
    total_entries: int
    in_range: int
    too_small: int
    too_large: int
    source: str  # path to log.md


def audit_r2_batch_history(log_path: Path | None = None) -> R2BatchAuditResult:
    """R-2 batch compliance audit (v0.7.41+).

    Reads the wiki log.md and counts past ingest events categorized by batch
    size. Useful for retroactively checking whether past R-2 ingest events
    complied with the 5-15 page heuristic.

    Heuristic: counts `+ N` or `* N` patterns in log headers. These are
    approximate — for precise counts, query the git history.
    """
    if log_path is None:
        log_path = Path("ai-workflow/wiki/log.md")
    if not log_path.exists():
        return R2BatchAuditResult(
            total_entries=0, in_range=0, too_small=0, too_large=0,
            source=str(log_path),
        )
    text = log_path.read_text(encoding="utf-8")
    import re
    # Pattern: lines with "+ N new tests" or "N pages" mention (tests as proxy)
    in_range = len(re.findall(r"\+\s*([5-9]|1[0-5])\s*new\s*tests?\b", text, re.IGNORECASE))
    too_small = len(re.findall(r"\+\s*([1-4])\s*new\s*tests?\b", text, re.IGNORECASE))
    too_large = len(re.findall(r"\+\s*(1[6-9]|[2-9]\d|\d{3,})\s*new\s*tests?\b", text, re.IGNORECASE))
    return R2BatchAuditResult(
        total_entries=in_range + too_small + too_large,
        in_range=in_range,
        too_small=too_small,
        too_large=too_large,
        source=str(log_path),
    )



@dataclass(frozen=True)
class R2BatchPreciseAuditResult:
    """R-2 batch compliance precise audit (v0.7.42+, git history based)."""
    total_commits: int
    release_commits: int
    in_range: int
    too_small: int
    too_large: int
    source: str


def audit_r2_batch_history_precise(
    repo_root: Path | None = None,
    subprocess_run: Any = None,
    since: str | None = None,
) -> R2BatchPreciseAuditResult:
    """R-2 batch compliance precise audit (v0.7.42+).

    Uses `git log --oneline` to count past R-2 ingest events from commit messages.
    More precise than the regex-based log.md approach (audit_r2_batch_history) but
    requires git history access.

    Args:
        repo_root: git repo root (default: cwd)
        subprocess_run: optional injected subprocess.run for testing
        since: optional git ref to limit (e.g. "v0.7.32")
    """
    if subprocess_run is None:
        import subprocess as _sp
        subprocess_run = _sp.run
    if repo_root is None:
        repo_root = Path(".")
    cmd = ["git", "log", "--oneline"]
    if since:
        cmd.append(f"{since}..HEAD")
    try:
        result = subprocess_run(
            cmd,
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (FileNotFoundError, OSError, TimeoutError) as e:
        return R2BatchPreciseAuditResult(
            total_commits=0, release_commits=0, in_range=0, too_small=0, too_large=0,
            source=f"git log failed: {type(e).__name__}: {e}",
        )
    if result.returncode != 0:
        return R2BatchPreciseAuditResult(
            total_commits=0, release_commits=0, in_range=0, too_small=0, too_large=0,
            source=f"git log error: {result.stderr.strip()[:200]}",
        )
    # parse commits: look for "v0.7.X" tags + count "+ N" patterns in commit messages
    import re
    commits = result.stdout.strip().split("\n")
    total_commits = len([c for c in commits if c])
    in_range = 0
    too_small = 0
    too_large = 0
    release_commits = 0
    # extract commit message body (after sha + space)
    for line in commits:
        if not line.strip():
            continue
        # Get the commit message after the sha (permissive: sha may contain non-hex chars in tests)
        m = re.match(r"^\S+\s+(.*)$", line)
        if not m:
            continue
        msg = m.group(1)
        # Only count release/v0.7.X commits
        if "v0.7." not in msg and "release" not in msg.lower():
            continue
        release_commits += 1
        # Look for "+ N new tests" pattern
        range_m = re.search(r"\+\s*([5-9]|1[0-5])\s*new\s*tests?\b", msg, re.IGNORECASE)
        small_m = re.search(r"\+\s*([1-4])\s*new\s*tests?\b", msg, re.IGNORECASE)
        large_m = re.search(r"\+\s*(1[6-9]|[2-9]\d|\d{3,})\s*new\s*tests?\b", msg, re.IGNORECASE)
        if range_m:
            in_range += 1
        elif small_m:
            too_small += 1
        elif large_m:
            too_large += 1
    return R2BatchPreciseAuditResult(
        total_commits=total_commits,
        release_commits=release_commits,
        in_range=in_range,
        too_small=too_small,
        too_large=too_large,
        source=str(repo_root),
    )

# Bundle import entry point
# ---------------------------------------------------------------------------
def import_okf_bundle(
    bundle: Path,
    staging: Path | None = None,
    mode: str | None = None,
    promote: bool = False,
) -> ImportReport:
    """Import an OKF bundle into our wiki.

    Args:
        bundle: path to OKF bundle root
        staging: target staging directory (default: `.okf_staging/<bundle-name>/`)
        mode: "strict" | "loose" | None (auto-detect from manifest)
        promote: if True, copy staged pages into `ai-workflow/wiki/`

    Returns:
        ImportReport with counts, issues, and final state.
    """
    bundle = bundle.resolve()
    if not bundle.is_dir():
        raise OkfImportError(f"bundle path not found or not a directory: {bundle}")

    resolved_mode = detect_mode(bundle, cli_mode=mode)

    if staging is None:
        staging = Path(".okf_staging") / bundle.name
    staging = staging.resolve()
    staging.mkdir(parents=True, exist_ok=True)

    # OKF spec §11: detect okf_version
    okf_version: str | None = None
    index_md = bundle / "index.md"
    if index_md.is_file():
        text = index_md.read_text(encoding="utf-8")
        m = _FRONTMATTER_RE.match(text)
        if m:
            fm = _parse_simple_yaml(m.group(1))
            v = str(fm.get("okf_version", "")).strip()
            if v:
                okf_version = v

    pages = _parse_bundle_pages(bundle)
    all_issues: list[LintIssue] = []
    pages_with_errors = 0
    pages_with_warnings = 0
    pages_staged = 0
    errors: list[str] = []

    # ADR-011: version compatibility check
    version_check = _check_version_compatibility(okf_version)
    if version_check.status == "error" and resolved_mode == "strict":
        # major mismatch: strict mode refuses
        errors.append(f"version check failed: {version_check.message}")
        return ImportReport(
            mode=resolved_mode,
            pages_total=0,
            pages_staged=0,
            pages_with_errors=0,
            pages_with_warnings=0,
            staging_dir=staging,
            issues=(),
            errors=tuple(errors),
            promoted=False,
            okf_version=okf_version,
            version_check=version_check,
        )

    for page in pages:
        try:
            page_issues = lint_page(page, bundle, resolved_mode)
        except Exception as e:  # noqa: BLE001
            errors.append(f"{page.relative_path}: lint crashed: {e}")
            pages_with_errors += 1
            continue
        all_issues.extend(page_issues)

        page_errors = [i for i in page_issues if i.severity == "error"]
        page_warnings = [i for i in page_issues if i.severity == "warn"]
        if page_errors:
            pages_with_errors += 1
            # strict mode: don't stage pages with errors
            if resolved_mode == "strict":
                continue
        if page_warnings:
            pages_with_warnings += 1

        # stage the page (even with warnings in strict; with errors in loose)
        try:
            _stage_page(page, staging)
            pages_staged += 1
        except Exception as e:  # noqa: BLE001
            errors.append(f"{page.relative_path}: stage failed: {e}")

    # promote (loose mode OR strict with no errors)
    promoted = False
    if promote and pages_with_errors == 0 and not errors:
        wiki_root = Path("ai-workflow/wiki")
        if wiki_root.is_dir():
            for staged in staging.rglob("*.md"):
                rel = staged.relative_to(staging)
                dest = wiki_root / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(staged, dest)
            promoted = True

    # v0.7.40+ R-2 batch compliance check
    r2_batch_warning = check_r2_batch_size(len(pages))

    return ImportReport(
        mode=resolved_mode,
        pages_total=len(pages),
        pages_staged=pages_staged,
        pages_with_errors=pages_with_errors,
        pages_with_warnings=pages_with_warnings,
        staging_dir=staging,
        issues=tuple(all_issues),
        errors=tuple(errors),
        promoted=promoted,
        okf_version=okf_version,
        version_check=version_check,
        r2_batch_warning=r2_batch_warning,
    )

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def _build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="OKF v0.1 bundle → wiki ingest (v0.7.34+). Loose/strict mode.",
    )
    p.add_argument("--bundle", type=Path, required=True, help="OKF bundle root")
    p.add_argument("--staging", type=Path, default=None, help="staging dir (default: .okf_staging/<bundle-name>)")
    p.add_argument("--mode", choices=["strict", "loose", "auto"], default="auto", help="ingest mode")
    p.add_argument("--promote", action="store_true", help="promote staged pages to ai-workflow/wiki/ on success")
    p.add_argument("--json", action="store_true", help="JSON output")
    return p


def main(argv: list[str] | None = None) -> int:
    args = _build_arg_parser().parse_args(argv)
    cli_mode = None if args.mode == "auto" else args.mode
    try:
        report = import_okf_bundle(
            bundle=args.bundle,
            staging=args.staging,
            mode=cli_mode,
            promote=args.promote,
        )
    except OkfImportError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    if args.json:
        import json as _json
        print(
            _json.dumps(
                {
                    "mode": report.mode,
                    "pages_total": report.pages_total,
                    "pages_staged": report.pages_staged,
                    "pages_with_errors": report.pages_with_errors,
                    "pages_with_warnings": report.pages_with_warnings,
                    "staging_dir": str(report.staging_dir),
                    "promoted": report.promoted,
                    "okf_version": report.okf_version,
                    "errors": list(report.errors),
                    "issues": [
                        {"page": str(i.page), "severity": i.severity, "rule": i.rule, "message": i.message}
                        for i in report.issues
                    ],
                },
                indent=2,
            )
        )
    else:
        print(f"OKF bundle imported (mode={report.mode}, okf_version={report.okf_version or 'unknown'}):")
        print(f"  pages_total:        {report.pages_total}")
        print(f"  pages_staged:       {report.pages_staged}")
        print(f"  pages_with_errors:  {report.pages_with_errors}")
        print(f"  pages_with_warnings:{report.pages_with_warnings}")
        print(f"  staging_dir:        {report.staging_dir}")
        print(f"  promoted:           {report.promoted}")
        if report.errors:
            print(f"\n  errors ({len(report.errors)}):")
            for err in report.errors:
                print(f"    - {err}")
        if report.issues:
            print(f"\n  issues ({len(report.issues)}):")
            for i in report.issues:
                rel = i.page.name
                print(f"    [{i.severity}] {i.rule} {rel}: {i.message}")

    return 0 if report.pages_with_errors == 0 and not report.errors else 1


if __name__ == "__main__":
    sys.exit(main())
