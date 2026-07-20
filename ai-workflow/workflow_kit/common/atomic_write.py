# standard-ai-workflow-kit: v0.15.19-beta

"""JSON / text file 의 atomic write helper (v0.7.15+).

SSOT 갱신 시 file write 의 *interrupted-write* 문제 (power loss, kill -9, mid-write crash)
해소. POSIX 의 `os.replace` 가 atomic (rename(2) 의 same-filesystem variant) 이므로:

    1. tempfile.NamedTemporaryFile 에 write
    2. fsync 로 disk 에 영구 기록
    3. os.replace(tmp, target) — atomic on POSIX

중간에 crash 나도 target file 은 *이전 version* 또는 *없음* 상태 보장. 둘 다 valid.

본 helper 는 SSOT JSON (state.json / work_backlog.md 등) 의 write caller 가 사용.

Usage:
    from workflow_kit.common.atomic_write import atomic_write_json, atomic_write_text

    atomic_write_json(state_path, {"session": {...}, "memory": {...}})
    atomic_write_text(notes_path, body)

Reference:
- POSIX rename(2): https://man7.org/linux/man-pages/man2/rename.2.html (atomic on same FS)
- Python os.replace: 3.3+ atomic on POSIX, may not be atomic on Windows
- v0.7.15 release note: SSOT (state.json, work_backlog.md) 의 interrupted-write issue
  발견 → 본 helper 도입
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any


def atomic_write_json(
    path: Path | str,
    data: Any,
    *,
    indent: int = 2,
    ensure_ascii: bool = False,
) -> None:
    """JSON file 을 atomic 하게 작성. POSIX guarantee (os.replace).

    Args:
        path: target file path. parent dir 없으면 생성.
        data: json.dump 가능 dict / list / scalar.
        indent: JSON indent (default 2).
        ensure_ascii: json.dump 의 ensure_ascii (default False; 한글 등 보존).

    Raises:
        OSError: parent dir 생성 실패 / disk full / permission 등.
        TypeError: data 가 JSON-serializable 아닐 시.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    # tmp file in same dir (same filesystem → os.replace atomic)
    fd, tmp_str = tempfile.mkstemp(
        dir=str(path.parent),
        prefix=f".{path.name}.",
        suffix=".tmp",
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=indent, ensure_ascii=ensure_ascii)
            f.flush()
            try:
                os.fsync(f.fileno())  # ensure data hits disk before rename
            except OSError:
                # fsync may fail on some filesystems; non-fatal (best-effort)
                pass
        os.replace(tmp_str, path)
    except Exception:
        # cleanup tmp file on any failure
        try:
            os.unlink(tmp_str)
        except OSError:
            pass
        raise


def atomic_write_text(
    path: Path | str,
    body: str,
    *,
    encoding: str = "utf-8",
) -> None:
    """Text file 을 atomic 하게 작성. POSIX guarantee (os.replace).

    Args:
        path: target file path.
        body: file 본문.
        encoding: file encoding (default utf-8).
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    fd, tmp_str = tempfile.mkstemp(
        dir=str(path.parent),
        prefix=f".{path.name}.",
        suffix=".tmp",
    )
    try:
        with os.fdopen(fd, "w", encoding=encoding) as f:
            f.write(body)
            f.flush()
            try:
                os.fsync(f.fileno())
            except OSError:
                pass
        os.replace(tmp_str, path)
    except Exception:
        try:
            os.unlink(tmp_str)
        except OSError:
            pass
        raise
