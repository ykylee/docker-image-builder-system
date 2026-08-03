# standard-ai-workflow-kit: v1.0.0-beta

"""Core logic for robust SEARCH/REPLACE patching with fuzzy matching."""

from __future__ import annotations

import difflib
from pathlib import Path
from typing import Any, TypedDict


class PatchBlock(TypedDict):
    search: list[str]
    replace: list[str]


def normalize_lines(lines: list[str]) -> list[str]:
    """Return lines stripped of leading/trailing whitespace, ignoring empty lines."""
    return [line.strip() for line in lines if line.strip()]


def fuzzy_find_block(
    source_lines: list[str], 
    search_lines: list[str], 
    threshold: float = 0.8
) -> tuple[int, int]:
    """
    Find the most similar block in source_lines matching search_lines.
    Returns (start_index, length) in source_lines, or (-1, 0) if no match.
    """
    norm_search = normalize_lines(search_lines)
    if not norm_search:
        return -1, 0

    search_len = len(norm_search)

    valid_source_indices = []
    norm_source = []
    for i, line in enumerate(source_lines):
        if line.strip():
            norm_source.append(line.strip())
            valid_source_indices.append(i)

    if not norm_source:
        return -1, 0

    best_match_idx = -1
    best_length = 0
    best_ratio = 0.0

    # Sliding window search
    for i in range(len(norm_source)):
        # Allow slight variations in window size (+/- 2 lines)
        for size_diff in range(-2, 3):
            w_size = search_len + size_diff
            if w_size <= 0 or i + w_size > len(norm_source):
                continue

            window = norm_source[i : i + w_size]
            ratio = difflib.SequenceMatcher(None, window, norm_search).ratio()

            if ratio > best_ratio:
                best_ratio = ratio
                best_match_idx = valid_source_indices[i]
                end_idx = valid_source_indices[i + w_size - 1]
                best_length = end_idx - best_match_idx + 1

            if ratio == 1.0:
                break
        if best_ratio == 1.0:
            break

    if best_ratio >= threshold:
        return best_match_idx, best_length
    return -1, 0


def parse_patch_blocks(patch_content: str) -> list[PatchBlock]:
    """Parse SEARCH/REPLACE blocks from patch string."""
    blocks: list[PatchBlock] = []
    search_block: list[str] = []
    replace_block: list[str] = []
    state = "NONE"

    for line in patch_content.splitlines(keepends=True):
        if line.startswith("<<<<<<< SEARCH"):
            state = "SEARCH"
            search_block = []
            replace_block = []
            continue
        elif line.startswith("======="):
            if state == "SEARCH":
                state = "REPLACE"
            continue
        elif line.startswith(">>>>>>> REPLACE"):
            if state == "REPLACE":
                blocks.append({"search": search_block, "replace": replace_block})
            state = "NONE"
            continue

        if state == "SEARCH":
            search_block.append(line)
        elif state == "REPLACE":
            replace_block.append(line)

    return blocks


def apply_robust_patch(
    file_path: Path,
    patch_content: str,
    *,
    dry_run: bool = False
) -> tuple[bool, str]:
    """
    Parse and apply SEARCH/REPLACE blocks to a file.
    Returns (success, message).

    Backwards-compatible wrapper — callers that don't need per-block detail can
    continue using this 2-tuple. For per-block detail (v0.11.21 stable 정합),
    use :func:`apply_robust_patch_detailed` instead.
    """
    success, message, _details = apply_robust_patch_detailed(
        file_path=file_path,
        patch_content=patch_content,
        dry_run=dry_run,
    )
    return success, message


def apply_robust_patch_detailed(
    file_path: Path,
    patch_content: str,
    *,
    dry_run: bool = False,
) -> tuple[bool, str, list[dict[str, Any]]]:
    """
    Apply SEARCH/REPLACE blocks and return per-block detail for traceability.

    Returns ``(success, message, applied_blocks)`` where each entry in
    ``applied_blocks`` is a dict with keys:
      - ``block_index`` (int, 0-based)
      - ``matched`` (bool)
      - ``fuzzy_score`` (float | None; 1.0 = exact, lower = fuzzy)
      - ``preview`` (str | None; first 80 chars of the SEARCH block)

    The ``applied_blocks`` list has the same length as the input SEARCH/REPLACE
    blocks (one entry per block, in the same order). Failed blocks have
    ``matched=False``; successful exact-match blocks have ``fuzzy_score=1.0``;
    fuzzy-matched blocks have ``fuzzy_score<1.0``.
    """
    if not file_path.exists():
        return False, f"File not found: {file_path}", []

    original_text = file_path.read_text(encoding="utf-8")
    original_lines = original_text.splitlines(keepends=True)
    lines = list(original_lines)

    blocks = parse_patch_blocks(patch_content)
    if not blocks:
        return False, "No valid SEARCH/REPLACE block found in patch content.", []

    applied_blocks: list[dict[str, Any]] = []

    # Apply blocks one by one
    for i, block in enumerate(blocks):
        search_lines = block["search"]
        replace_lines = block["replace"]

        start_idx, length = fuzzy_find_block(lines, search_lines)
        preview = "".join(search_lines).strip()[:80] if search_lines else ""
        if start_idx == -1:
            # Record the failed block then abort — atomic semantics.
            applied_blocks.append(
                {
                    "block_index": i,
                    "matched": False,
                    "fuzzy_score": None,
                    "preview": preview,
                }
            )
            return (
                False,
                f"Could not find a reliable match for SEARCH block #{i+1}.",
                applied_blocks,
            )

        # Compute fuzzy score for traceability — difflib.SequenceMatcher.ratio()
        # on the joined text. Exact match → 1.0.
        search_text = "".join(search_lines).strip()
        if start_idx >= 0 and length > 0:
            matched_text = "".join(lines[start_idx : start_idx + length]).strip()
            ratio = difflib.SequenceMatcher(None, search_text, matched_text).ratio()
        else:
            ratio = 1.0

        lines = lines[:start_idx] + replace_lines + lines[start_idx + length :]
        applied_blocks.append(
            {
                "block_index": i,
                "matched": True,
                "fuzzy_score": round(ratio, 3),
                "preview": preview,
            }
        )

    new_content = "".join(lines)

    # Syntax check for Python files
    if file_path.suffix == ".py":
        try:
            compile(new_content, str(file_path), "exec")
        except SyntaxError as e:
            return (
                False,
                f"Patch would result in SyntaxError: {e}",
                applied_blocks,
            )

    if not dry_run:
        file_path.write_text(new_content, encoding="utf-8")

    return True, f"Successfully applied {len(blocks)} patch block(s).", applied_blocks
