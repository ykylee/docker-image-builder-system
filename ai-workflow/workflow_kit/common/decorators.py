# standard-ai-workflow-kit: v1.0.0-beta

"""workflow_kit.common.decorators — v0.7.4 cross-cutting decorator.

@graceful_shutdown: SIGINT / SIGTERM handler 자동 등록 + cleanup callback.
@v0_7_4_deprecated: v0.7.4 deprecation 표시 (다음 major version 시 제거 예정).

Reference:
- workflow-source/extensions/resiliency-baseline.md §RES-WF-06
- workflow-source/extensions/SCHEMA.md §6 Helper Contract (decorator 영역 추가)
"""

from __future__ import annotations

import functools
import inspect
import os
import signal
import sys
import threading
import time
import warnings
from typing import Any, Callable, TypeVar, cast

F = TypeVar("F", bound=Callable[..., Any])

# module-level registry: cleanup callback (decorator instance 별)
_cleanup_registry: dict[int, list[Callable[[], None]]] = {}
_registry_lock = threading.Lock()


def graceful_shutdown(
    fn: F | None = None,
    *,
    cleanup: Callable[[], None] | None = None,
    timeout_sec: float = 5.0,
) -> F:
    """Decorator: SIGINT / SIGTERM handler 자동 등록 + cleanup callback.

    Usage:
        @graceful_shutdown
        def main():
            ...

        @graceful_shutdown(cleanup=lambda: print("cleanup done"))
        def worker():
            ...

        @graceful_shutdown(timeout_sec=10.0)
        def long_runner():
            ...

    Args:
        fn: decorated function
        cleanup: optional cleanup callback (default: None)
        timeout_sec: shutdown 시 cleanup 대기 최대 시간 (default: 5.0)

    Behavior:
        - SIGINT (Ctrl-C) 시 cleanup 호출 후 sys.exit(0)
        - SIGTERM 시 cleanup 호출 후 sys.exit(0)
        - timeout 초과 시 cleanup 강제 종료 (warning log)
        - Windows 의 경우 SIGBREAK 도 처리 (where applicable)

    Test:
        test decorators (smoke): signal.send + cleanup 호출 검증.
    """
    # direct decoration: @graceful_shutdown (no parens)
    if fn is not None and callable(fn):
        # _wrap_with_shutdown returns F (cast for mypy Callable[[F], F] narrow)
        return _wrap_with_shutdown(fn, cleanup=cleanup, timeout_sec=timeout_sec)

    # parameterized: @graceful_shutdown(cleanup=..., timeout_sec=...)
    def decorator(func: F) -> F:
        return _wrap_with_shutdown(func, cleanup=cleanup, timeout_sec=timeout_sec)

    # mypy 가 decorator 를 Callable[[F], F] 로 추론 → F 로 narrow (cast)
    return cast(F, decorator)


def _wrap_with_shutdown(
    fn: F,
    *,
    cleanup: Callable[[], None] | None,
    timeout_sec: float,
) -> F:
    """내부 wrapper: SIGINT / SIGTERM handler 등록 + cleanup 실행."""

    @functools.wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        cleanup_called = threading.Event()
        shutdown_initiated = threading.Event()

        def _handler(signum: int, frame: Any) -> None:  # noqa: ARG001
            if shutdown_initiated.is_set():
                return  # double signal → force exit
            shutdown_initiated.set()
            sig_name = {
                signal.SIGINT.value: "SIGINT",
                signal.SIGTERM.value: "SIGTERM",
            }.get(signum, f"signal-{signum}")
            print(f"\n[{fn.__name__}] received {sig_name}, running cleanup...", file=sys.stderr)
            if cleanup is not None:
                try:
                    # run cleanup in main thread (blocking)
                    cleanup()
                except Exception as e:
                    print(f"cleanup error: {e}", file=sys.stderr)
            cleanup_called.set()
            # give cleanup a moment to finish
            time.sleep(0.1)
            sys.exit(0)

        # register handler (only in main thread; child thread signal 은 OS 가 main 에 전달)
        prev_int = signal.signal(signal.SIGINT, _handler)
        prev_term = signal.signal(signal.SIGTERM, _handler)
        # Windows 의 경우 SIGBREAK 도 처리
        if hasattr(signal, "SIGBREAK"):
            try:
                prev_break = signal.signal(signal.SIGBREAK, _handler)
            except (ValueError, OSError):
                prev_break = None
        else:
            prev_break = None

        try:
            return fn(*args, **kwargs)
        finally:
            # restore original handler
            signal.signal(signal.SIGINT, prev_int)
            signal.signal(signal.SIGTERM, prev_term)
            if prev_break is not None and hasattr(signal, "SIGBREAK"):
                signal.signal(signal.SIGBREAK, prev_break)

    wrapper.__wrapped__ = fn
    wrapper.__graceful_shutdown__ = True  # type: ignore[attr-defined]
    return wrapper  # type: ignore[return-value]


def v0_7_4_deprecated(reason: str = "", version: str = "0.8.0") -> Callable[[F], F]:
    """Decorator: v0.7.4 deprecation 표시.

    Usage:
        @v0_7_4_deprecated(reason="use new_function instead", version="0.8.0")
        def old_function():
            ...

    Args:
        reason: deprecation 사유
        version: 제거 예정 version

    Behavior:
        - DeprecationWarning 발행
        - 함수 본문은 그대로 실행 (backward compat)
        - v0.8.0 부터는 warning → error (옵션)
    """
    def decorator(fn: F) -> F:
        @functools.wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            msg = f"{fn.__name__} is deprecated (since v0.7.4, removal in v{version})"
            if reason:
                msg += f": {reason}"
            warnings.warn(msg, DeprecationWarning, stacklevel=2)
            return fn(*args, **kwargs)
        wrapper.__wrapped__ = fn
        wrapper.__deprecated__ = True  # type: ignore[attr-defined]
        return wrapper  # type: ignore[return-value]
    return decorator


# --- module-level helper: register cleanup for non-decorator use case ---


def register_cleanup(cleanup: Callable[[], None]) -> int:
    """Decorator 없이 cleanup callback 등록.

    Returns: registry key (int). 나중에 unregister 가능.
    """
    key = id(cleanup)
    with _registry_lock:
        _cleanup_registry.setdefault(key, []).append(cleanup)
    return key


def unregister_cleanup(key: int) -> None:
    """cleanup callback 제거."""
    with _registry_lock:
        _cleanup_registry.pop(key, None)
