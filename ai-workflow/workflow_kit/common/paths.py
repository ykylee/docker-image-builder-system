# standard-ai-workflow-kit: v1.0.0-beta

"""Filesystem path helpers shared across workflow kit prototypes."""

from __future__ import annotations
import os
import subprocess
from pathlib import Path, PurePosixPath


BRANCH_ENV_KEYS = (
    "CODEX_WORKFLOW_BRANCH",
    "GITHUB_HEAD_REF",
    "GITHUB_REF_NAME",
    "CI_COMMIT_REF_NAME",
    "BRANCH_NAME",
)


def resolve_existing_path(raw: str) -> Path:
    """Resolve a path and fail early when the target does not exist."""
    path = Path(raw).expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(f"path does not exist: {path}")
    return path


def safe_relpath(path: Path, start: Path) -> str:
    """Return a relative version of a path if it is under start, otherwise absolute string."""
    try:
        resolved_path = path.resolve()
        resolved_start = start.resolve()
        if resolved_path.is_relative_to(resolved_start):
            return os.path.relpath(resolved_path, resolved_start)
        return str(resolved_path)
    except (ValueError, OSError):
        return str(path)


def path_exists_relative(base: Path, raw: str | None) -> Path | None:
    if not raw:
        return None
    candidate = (base / raw).resolve()
    if candidate.exists():
        return candidate
    return None


def declared_doc_path(base: Path, raw: str | None) -> str | None:
    if not raw:
        return None
    return str((base / raw).resolve())


def workflow_memory_dir(project_profile_path: Path) -> Path:
    """Return the base directory for workflow memory (ai-workflow/memory/active/).

    `PROJECT_PROFILE.md` 는 두 위치에 놓일 수 있다:

    - `<ws>/docs/PROJECT_PROFILE.md` — bootstrap 이 만드는 정식 배치(f23ba2f 로 통일).
      메모리는 `<ws>/ai-workflow/memory/active/` 에 생성된다.
    - `<ws>/ai-workflow/memory/active/PROJECT_PROFILE.md` — profile 이 메모리 안에
      있는 배치. 이 경우 profile 의 부모가 곧 memory dir 이다.

    두 배치 모두 **`active/` 를 포함한 같은 dir** 로 수렴해야 한다. docs/ 분기에서
    `/ "active"` 가 빠져 있어(`memory/` 반환) 정식 배치의 backlog / sessions /
    state.json 이 전부 `active/` 한 단계씩 어긋났고, 그 결과 state cache 가
    daily_backlog_dir 부재로 skip 되었다. `state/cache.py` 주석의 "v0.6.0.1 의
    `/ "active"` 후속 fix 누락" 이 가리키던 지점이 바로 여기다.

    아직 마이그레이션하지 않은 저장소(`memory/` 바로 아래에 파일이 있고 `active/` 가
    없는 경우)는 깨뜨리지 않도록 legacy 로 fallback 한다 — 저장소 전반의
    `_branch_scoped_dir` / `workflow_state_path` 와 같은 관례.
    """
    profile_dir = project_profile_path.resolve().parent
    if profile_dir.name == "docs":
        memory_root = (profile_dir.parent / "ai-workflow" / "memory").resolve()
        active_dir = memory_root / "active"
        if not active_dir.exists() and memory_root.exists():
            return memory_root
        return active_dir
    return profile_dir


def _branch_scoped_dir(project_profile_path: Path, leaf: str) -> Path:
    """branch-scoped path 를 반환하되, 미마이그레이션 저장소는 legacy 로 fallback.

    v1.0.0 branch-scoped memory: 작업 상태(backlog / sessions / state.json)는
    `active/<branch>/` 하위로 분리해 다중 동시 작업의 충돌을 물리적으로 없앤다.
    다만 아직 마이그레이션하지 않은 저장소(`active/<leaf>` 가 직접 존재)를 깨뜨리지
    않도록, branch-scoped 가 없고 legacy 가 있으면 legacy 를 반환한다.
    **신규 생성은 항상 branch-scoped** 이므로 마이그레이션은 점진적으로 수렴한다.
    """
    branch_scoped = workflow_branch_dir(project_profile_path) / leaf
    if branch_scoped.exists():
        return branch_scoped
    legacy = workflow_memory_dir(project_profile_path) / leaf
    if legacy.exists():
        return legacy
    return branch_scoped


def workflow_backlog_dir(project_profile_path: Path) -> Path:
    """Return the daily-backlog directory (v1.0.0 branch-scoped append-only layout).

    본 directory 는 `active/<branch>/backlog` 으로, YYYY-MM-DD.md daily index 들을 포함.
    MEMORY_GOVERNANCE.md §2 의 "Daily Backlog Index" 템플릿 정공법.
    """
    return _branch_scoped_dir(project_profile_path, "backlog")


def workflow_tasks_dir(project_profile_path: Path) -> Path:
    """Return the per-task directory (v0.14.0+ append-only layout).

    본 directory 는 memory_dir / 'backlog' / 'tasks' 으로, TASK-<date>-<NNN>.md
    per-task SSOT 들을 포함.
    """
    return workflow_backlog_dir(project_profile_path) / "tasks"


def workflow_sessions_dir(project_profile_path: Path) -> Path:
    """Return the per-session directory (v0.14.0+ append-only layout).

    본 directory 는 `active/<branch>/sessions` 으로, session-analysis / audit-follow-up
    같은 per-session 파일들을 포함. 기존 legacy `session_handoff.md` (단일 파일,
    overwrite race) 의 후속.
    """
    return _branch_scoped_dir(project_profile_path, "sessions")


def project_workspace_root(project_profile_path: Path) -> Path:
    profile_dir = project_profile_path.resolve().parent
    if profile_dir.name == "docs":
        return profile_dir.parent
    memory_dir = workflow_memory_dir(project_profile_path)
    if memory_dir.name == "memory" and memory_dir.parent.name == "ai-workflow":
        return memory_dir.parent.parent.resolve()
    return memory_dir


def _usable_branch_name(raw: str | None) -> str | None:
    if raw is None:
        return None
    branch = raw.strip()
    for prefix in ("refs/heads/", "refs/remotes/origin/"):
        if branch.startswith(prefix):
            branch = branch[len(prefix):]
            break
    if not branch or branch == "HEAD" or branch.startswith("/"):
        return None
    path = PurePosixPath(branch)
    if any(part in {"", ".", ".."} for part in path.parts):
        return None
    return branch


def get_current_branch() -> str:
    """Return a branch-safe workflow memory slug, falling back to main.

    The git lookup is anchored at this module's parent repo (``workflow-source/..``)
    rather than the current process CWD, so callers invoking this from a
    sandboxed temp directory (smoke tests, sub-agents, MCP servers) still see
    the real workflow repo's branch.

    Detached HEAD (e.g. CI checkout at a specific SHA) returns the commit
    short SHA (7-char prefix) as a stable, collision-resistant slug instead
    of the bare ``HEAD`` literal, which would otherwise fall through to
    ``main`` and lose the context. F-7 (v0.7.26) fix.
    """
    for env_key in BRANCH_ENV_KEYS:
        branch = _usable_branch_name(os.environ.get(env_key))
        if branch:
            return branch

    return _git_branch_slug(Path(__file__).resolve().parents[3]) or "main"


def _git_branch_slug(repo_root: Path) -> str | None:
    """``repo_root`` 를 기준으로 branch slug 를 조회. git 저장소가 아니면 None.

    F-7 fix: detached HEAD (branch == "HEAD") 는 "main" 으로 흘리지 않고 commit
    short SHA (7자) 를 돌려준다 — CI checkout / 특정 commit 참조의 안정적 식별자.
    """
    try:
        branch = subprocess.check_output(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=str(repo_root),
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
    except (subprocess.CalledProcessError, FileNotFoundError, NotADirectoryError, OSError):
        return None

    if branch == "HEAD":
        try:
            short_sha = subprocess.check_output(
                ["git", "rev-parse", "--short=7", "HEAD"],
                cwd=str(repo_root),
                stderr=subprocess.DEVNULL,
                text=True,
            ).strip()
            if short_sha and len(short_sha) >= 7:
                return short_sha
        except (subprocess.CalledProcessError, FileNotFoundError, NotADirectoryError, OSError):
            pass
        return None

    return _usable_branch_name(branch)


def branch_for_workspace(workspace_root: Path) -> str:
    """``workspace_root`` **자신의** git 컨텍스트에서 branch slug 를 얻는다 (v1.0.1+).

    `get_current_branch()` 는 *이 모듈이 속한 저장소* 를 기준으로 본다 — sandbox 에서
    호출하는 caller 를 위한 의도된 동작이다. 그러나 workspace 로 파라미터화된 함수에
    그대로 합성하면 **접두는 인자에서, branch 는 딴 데서** 오게 된다:

        cwd=repoA(main)     : state_path_for_workspace(repoB) → repoB/…/active/main/
        cwd=repoB(feature)  : state_path_for_workspace(repoA) → repoA/…/active/feature/

    같은 인자에 대해 호출 위치가 답을 바꾼다. 그래서 workspace 를 받는 쪽은 그
    workspace 의 git 을 본다. workspace 가 git 저장소가 아니면(temp workspace 등)
    기존 동작으로 되돌아간다.
    """
    for env_key in BRANCH_ENV_KEYS:
        branch = _usable_branch_name(os.environ.get(env_key))
        if branch:
            return branch
    return _git_branch_slug(Path(workspace_root)) or get_current_branch()


def workflow_branch_dir(project_profile_path: Path) -> Path:
    """Return the branch-specific directory within the memory dir.

    v1.0.6(§2.50): branch 를 **이 workspace 의 git** 에서 얻는다. v1.0.1 이
    `state_path_for_workspace` 에만 적용한 규칙이었는데(`branch_for_workspace` 참조),
    profile 을 받는 이쪽은 `get_current_branch()` 를 그대로 쓰고 있었다. 그래서 같은
    workspace 에 대해 두 해석기가 **다른 branch** 를 냈다 — 실측:

        repoB(feature/probe-branch) 의 profile 로
          state_path_for_workspace → …/active/feature/probe-branch/state.json
          workflow_branch_dir      → …/active/main            ← 모듈 저장소의 branch

    state.json 과 handoff/backlog 가 서로 다른 branch 디렉터리를 가리키게 된다.
    """
    base_dir = workflow_memory_dir(project_profile_path)
    branch = branch_for_workspace(project_workspace_root(project_profile_path))
    # Normalize branch name for filesystem safety if needed,
    # but here we allow nested folders if branch name has '/'
    return (base_dir / branch).resolve()


def memory_root_dir(project_profile_path: Path) -> Path:
    """Return `ai-workflow/memory/` — active/ 와 archived/ 의 공통 부모.

    `workflow_memory_dir` 는 PROJECT_PROFILE.md 위치에 따라 `memory/active` 를 가리킬
    수 있으므로, archived/ 를 조립할 때는 반드시 본 helper 로 부모를 얻는다.
    """
    memory_dir = workflow_memory_dir(project_profile_path)
    if memory_dir.name == "active":
        return memory_dir.parent
    return memory_dir


def workflow_state_path(project_profile_path: Path) -> Path:
    """Return the branch-scoped `state.json` path.

    state.json 은 builder 가 rebuild 하는 *생성물* 이고 브랜치마다 작업 상태가 다르므로
    branch-scoped 가 옳다. 미마이그레이션 저장소는 legacy(`active/state.json`) fallback.
    """
    branch_scoped = workflow_branch_dir(project_profile_path) / "state.json"
    if branch_scoped.exists():
        return branch_scoped
    legacy = workflow_memory_dir(project_profile_path) / "state.json"
    if legacy.exists():
        return legacy
    return branch_scoped


def path_in_active(active_dir: Path, leaf: str, branch: str | None = None) -> Path:
    """`active/` 디렉터리를 **직접** 아는 caller 용 branch-scoped 경로 조립.

    workspace root 를 역산하지 않는다 — caller 가 넘기는 active dir 은 표준
    `<ws>/ai-workflow/memory/active` 가 아닐 수 있기 때문이다(테스트 fixture 등).
    branch-scoped 가 없으면 legacy(`<active>/<leaf>`) 로 fallback 하고, 둘 다 없으면
    branch-scoped 를 반환한다(신규 생성은 항상 branch-scoped).

    branch-scoped fallback 규칙은 반드시 본 helper 한 곳에만 둔다 — 규칙을 복사해
    둔 caller 가 layout 변경을 놓치는 것이 `refresh_wiki_memory` red 의 원인이었다.
    """
    active = Path(active_dir)
    slug = _usable_branch_name(branch) or get_current_branch()
    branch_scoped = active / slug / leaf
    if branch_scoped.exists():
        return branch_scoped
    legacy = active / leaf
    if legacy.exists():
        return legacy
    return branch_scoped


def state_path_in_active(active_dir: Path, branch: str | None = None) -> Path:
    """`active/` 디렉터리를 직접 아는 caller 용 branch-scoped `state.json` 경로."""
    return path_in_active(active_dir, "state.json", branch)


def memory_dir_for_workspace(workspace_root: Path) -> Path:
    """workspace root 기준 `ai-workflow/memory/` — active/ 와 archived/ 의 공통 부모.

    workspace root 만 아는 caller 가 **경로를 손으로 조립하지 않도록** 하는 정본 진입점.
    `"ai-workflow" / "memory" / "active"` 를 각자 이어 붙이던 것이 18개 파일로 번져
    있었고, 그중 하나만 어긋나도 조용히 다른 파일을 읽는다 (§2.20 과 같은 부류).
    """
    return Path(workspace_root) / "ai-workflow" / "memory"


def memory_active_dir(workspace_root: Path) -> Path:
    """workspace root 기준 `ai-workflow/memory/active/`.

    브랜치 무관 **공유** 계층이다 (`PROJECT_PROFILE.md` / `PURPOSE.md` / `memory_index/`).
    브랜치별 작업 상태는 `active/<branch>/` 이고, 그건 `state_path_for_workspace` 나
    `workflow_branch_dir` 로 얻는다.
    """
    return memory_dir_for_workspace(workspace_root) / "active"


def state_path_for_workspace(workspace_root: Path, branch: str | None = None) -> Path:
    """workspace root 기준 branch-scoped `state.json` 경로.

    `PROJECT_PROFILE.md` 가 아니라 workspace root 만 아는 caller (dashboard / baselines /
    ingest / CLI) 용. branch-scoped 가 없고 legacy(`active/state.json`) 가 있으면 legacy 를
    반환하므로 미마이그레이션 저장소에서도 안전하다.
    """
    active = memory_active_dir(workspace_root)
    # branch 는 **이 workspace 의** git 에서 얻는다 — 호출 위치가 답을 바꾸면 안 된다.
    slug = _usable_branch_name(branch) or branch_for_workspace(Path(workspace_root))
    branch_scoped = active / slug / "state.json"
    if branch_scoped.exists():
        return branch_scoped
    legacy = active / "state.json"
    if legacy.exists():
        return legacy
    return branch_scoped


def workflow_archived_branch_dir(project_profile_path: Path, branch: str | None = None) -> Path:
    """Return `memory/archived/<branch>` — 종료된 브랜치의 메모리 보관 위치.

    브랜치 작업이 끝나면(git 에서 해당 브랜치가 사라지면) `active/<branch>/` 를 이곳으로
    옮겨 과거 이력 조회 대상으로 남긴다. 고아 디렉터리가 생기지 않게 하는 장치.
    """
    # v1.0.6(§2.50): 명시 인자 → **이 workspace 의 git** → 모듈 저장소 순.
    # active/ 와 archived/ 가 다른 branch 를 가리키면 아카이브가 엉뚱한 곳으로 간다.
    slug = _usable_branch_name(branch) or branch_for_workspace(
        project_workspace_root(project_profile_path)
    )
    return (memory_root_dir(project_profile_path) / "archived" / slug).resolve()


def path_exists_from_profile(project_profile_path: Path, raw: str | None) -> Path | None:
    if not raw:
        return None
    # Check branch-specific dir first, then fall back to workspace root
    branch_dir = workflow_branch_dir(project_profile_path)
    candidate = (branch_dir / raw).resolve()
    if candidate.exists():
        return candidate
    return path_exists_relative(project_workspace_root(project_profile_path), raw)


def declared_doc_path_from_profile(project_profile_path: Path, raw: str | None) -> str | None:
    if not raw:
        return None
    return declared_doc_path(project_workspace_root(project_profile_path), raw)
