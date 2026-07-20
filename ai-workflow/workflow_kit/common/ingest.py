# standard-ai-workflow-kit: v0.15.19-beta

"""Atomic session ingest helper for T3 (multi-file atomic write).

Write lock + .partial suffix pattern ensures that a session's full state
(handoff, backlog, state.json, work_backlog.md) is either ALL written or
NONE written.  Designed for the ``backlog-update --apply`` integration path.
"""

from __future__ import annotations

import json
import shutil
import tempfile
from datetime import date, datetime
from pathlib import Path
from typing import Any


#: Lock file path inside the active memory directory.
LOCK_FILE = ".ingest_lock"


class IngestLockedError(RuntimeError):
    """Another ingest is in progress."""


def acquire_lock(memory_active: Path) -> None:
    lock = memory_active / LOCK_FILE
    if lock.exists():
        raise IngestLockedError(
            f"Ingest lock held at {lock}. "
            "Wait for the concurrent operation to finish or remove the lock manually."
        )
    lock.touch()


def release_lock(memory_active: Path) -> None:
    lock = memory_active / LOCK_FILE
    if lock.exists():
        lock.unlink()


def ingest_session_atomic(
    *,
    memory_active: Path,
    handoff_content: str = "",
    backlog_content: str = "",
    state_content: dict[str, Any] | None = None,
    backlog_index_content: str = "",
    today: date | None = None,
) -> dict[str, str]:
    """Atomically write the full session state into *memory_active*.

    Parameters
    ----------
    memory_active : Path
        The ``ai-workflow/memory/active/`` directory.
    handoff_content : str
        ``session_handoff.md`` body.
    backlog_content : str
        ``backlog/YYYY-MM-DD.md`` body.
    state_content : dict | None
        ``state.json`` payload (will be JSON-serialised).  If *None* the
        file is not touched.
    backlog_index_content : str
        ``work_backlog.md`` body update.  If empty the file is not touched.
    today : date | None
        The session date (defaults to ``date.today()``).

    Returns
    -------
    dict[str, str]
        A mapping ``{logical_key: written_path}`` that callers can forward
        to the state-cache updater.

    Raises
    ------
    IngestLockedError
        Another ingest is in progress.
    """
    today = today or date.today()
    today_iso = today.isoformat()

    # Resolve target paths
    backlog_dir = memory_active / "backlog"
    handoff_path = memory_active / "session_handoff.md"
    backlog_path = backlog_dir / f"{today_iso}.md"
    state_path = memory_active / "state.json"
    worklog_path = memory_active / "work_backlog.md"

    # Acquire lock  -----------------------------------------------------------
    acquire_lock(memory_active)
    try:
        # Create backlog dir if needed
        backlog_dir.mkdir(parents=True, exist_ok=True)

        written: dict[str, str] = {}

        # Write handoff (partial → rename)
        if handoff_content:
            _atomic_write(handoff_path, handoff_content)
            written["handoff"] = str(handoff_path)

        # Write daily backlog
        if backlog_content:
            _atomic_write(backlog_path, backlog_content)
            written["backlog"] = str(backlog_path)

        # Write state.json
        if state_content is not None:
            _atomic_write_json(state_path, state_content)
            written["state"] = str(state_path)

        # Write backlog index (work_backlog.md)
        if backlog_index_content:
            _atomic_write(worklog_path, backlog_index_content)
            written["worklog"] = str(worklog_path)

        return written

    finally:
        release_lock(memory_active)


def _atomic_write(path: Path, content: str) -> None:
    """Write *content* to *path* atomically via a temp file + rename."""
    tmp = path.with_suffix(path.suffix + ".partial")
    tmp.write_text(content, encoding="utf-8")
    tmp.replace(path)


def _atomic_write_json(path: Path, data: Any) -> None:
    """Write *data* as pretty-printed JSON atomically."""
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    _atomic_write(path, payload)
