# standard-ai-workflow-kit: v1.0.0-beta

#!/usr/bin/env python3
"""Smoke checks for markdown docs in the standard AI workflow repository."""

from __future__ import annotations

import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MARKER_RE = re.compile(r"^<!--\s*standard-ai-workflow-kit:")

REQUIRED_METADATA = [
    "문서 목적",
    "범위",
    "대상 독자",
    "상태",
    "최종 수정일",
    "관련 문서",
]
ENGLISH_METADATA = [
    "Purpose",
    "Scope",
    "Audience",
    "Status",
    "Updated",
    "Related docs",
]
LINK_PATTERN = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
INLINE_TRIPLE_BACKTICK_RE = re.compile(r"```.*?```")
INLINE_BACKTICK_RE = re.compile(r"`[^`\n]*`")
SKIP_PREFIXES = ("http://", "https://", "mailto:", "#")
IGNORED_PARTS = {
    ".git",
    ".codex",
    ".opencode",
    ".venv",
    "venv",
    "env",
    ".venv-review",
    ".venv-copilot",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    "dist",
    "build",
    ".ai-workflow-backups",
    ".tmp-ai-workflow-runtime-hidden",
    "tmp",
    "tmp-test",
    "scratch",
    "templates",
    "releases",
    "archive",
    "tests",
}
IGNORED_PREFIX_PARTS = (".venv",)
# `ai-workflow/` 는 workflow-source 의 **runtime mirror** 이므로 하위 트리는 산문
# 문서 계약(문서 목적/범위/대상 독자/…)의 대상이 아니다. 아래 3개는 그 원칙에서
# 누락돼 있던 것으로, 각각 계약을 만족시키는 것이 **불가능하거나 부적절**하다:
#
#   - `dashboard/`  : `snapshot.md` 는 emit 되는 **생성물**. 재생성할 때마다 lint 가
#                     다시 깨지므로 구조적으로 통과할 수 없다.
#   - `memory/`     : 작업 상태(runtime state). `memory/release/*` 와 `memory/archived/*`
#                     는 governance 상 **immutable** 이라 metadata 를 넣으려면 불변성
#                     규칙 자체를 어겨야 한다. authored profile 은 `docs/PROJECT_PROFILE.md`
#                     이며 그쪽은 계속 lint 대상이다.
#   - `wiki/`       : `status` / `last_ingested_from` 라는 **자체 frontmatter 계약**을
#                     가지며 `check_wiki_drift.py` 가 이를 강제한다. 산문 계약을 겹쳐
#                     씌우면 서로 다른 두 스키마를 동시에 요구하게 된다.
#
# 최상위 `ai-workflow/README.md` 는 사람이 쓴 문서이므로 **제외하지 않는다**.
IGNORED_AI_WORKFLOW_SUBTREES = {
    ("ai-workflow", "core"),
    ("ai-workflow", "dashboard"),
    ("ai-workflow", "examples"),
    ("ai-workflow", "global-snippets"),
    ("ai-workflow", "harnesses"),
    ("ai-workflow", "mcp_servers"),
    ("ai-workflow", "memory"),
    ("ai-workflow", "schemas"),
    ("ai-workflow", "scripts"),
    ("ai-workflow", "skills"),
    ("ai-workflow", "templates"),
    ("ai-workflow", "wiki"),
    ("ai-workflow", "workflow_kit"),
}
# `docs/samples/` 는 배포용 샘플 번들(OKF bundle)로, 외부 포맷을 그대로 담은
# 데이터이지 본 저장소가 저술한 문서가 아니다.
IGNORED_DOCS_SUBTREES = {
    ("docs", "samples"),
}
IGNORED_WORKFLOW_SOURCE_SUBTREES = {
    ("workflow-source", "core"),
    ("workflow-source", "examples"),
    ("workflow-source", "global-snippets"),
    ("workflow-source", "harnesses"),
    ("workflow-source", "mcp_servers"),
    ("workflow-source", "schemas"),
    ("workflow-source", "scripts"),
    ("workflow-source", "skills"),
    ("workflow-source", "templates"),
    ("workflow-source", "workflow_kit"),
}


def iter_markdown_files() -> list[Path]:
    markdown_files: list[Path] = []
    for path in REPO_ROOT.rglob("*.md"):
        if set(path.parts).intersection(IGNORED_PARTS):
            continue
        rel_parts = path.relative_to(REPO_ROOT).parts
        if any(
            part == "node_modules"
            or part in IGNORED_PARTS
            or any(part.startswith(prefix) for prefix in IGNORED_PREFIX_PARTS)
            for part in rel_parts
        ):
            continue
        if len(rel_parts) >= 2 and tuple(rel_parts[:2]) in IGNORED_AI_WORKFLOW_SUBTREES:
            continue
        if len(rel_parts) >= 2 and tuple(rel_parts[:2]) in IGNORED_WORKFLOW_SOURCE_SUBTREES:
            continue
        if len(rel_parts) >= 2 and tuple(rel_parts[:2]) in IGNORED_DOCS_SUBTREES:
            continue
        markdown_files.append(path)
    return sorted(markdown_files)


def normalize_link_target(raw_target: str) -> str:
    target = raw_target.strip()
    if target.startswith("<") and target.endswith(">"):
        target = target[1:-1].strip()
    if "#" in target:
        target = target.split("#", 1)[0]
    return target


def normalize_metadata_line(line: str) -> str:
    """metadata 판정을 위해 강조 markup 을 제거한다.

    `- **상태: accepted**` 처럼 필드를 굵게 쓴 문서가 있는데, 강조는 표기일 뿐
    필드의 유무와 무관하다. 이를 누락으로 보면 **필드가 실제로 있는 문서를 red 로
    만드는 위양성**이 된다 (ADR-007 / MICROSOFT_MEMORA_EVALUATION 이 그랬다).
    """
    return line.replace("**", "").replace("__", "")


def check_metadata(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    # YAML frontmatter 로 시작하는 문서는 **machine-readable spec** 이다.
    # metadata 가 없는 게 아니라 다른 schema(`plan_id` / `type` / `status` / `version` /
    # `related`)로 들어 있다. 산문 계약을 요구하면 `# 제목` 을 frontmatter 앞에 넣어야
    # 하는데, 그러면 frontmatter 가 깨져 **기계 판독 문서를 산문 lint 때문에 망가뜨리는**
    # 셈이 된다. 현재 lint 범위에서 이에 해당하는 문서는 `.omo/plans/` 의 design-spec 뿐.
    if text.startswith("---\n"):
        return []
    lines = text.splitlines()
    header_lines = [normalize_metadata_line(line) for line in lines[:20]]
    required_metadata = REQUIRED_METADATA
    if has_metadata_set(header_lines, ENGLISH_METADATA):
        required_metadata = ENGLISH_METADATA
    missing = []
    for field in required_metadata:
        prefix = f"- {field}:"
        if not any(line.startswith(prefix) for line in header_lines):
            missing.append(field)
    # v1.0.2: bootstrap 이 배포물 첫 줄에 찍는 버전 마커
    # (`<!-- standard-ai-workflow-kit: vX -->`)는 **기계 주석**이지 산문이 아니다.
    # 위 frontmatter 예외와 같은 이유로, 마커 때문에 제목이 2번째 줄이 된 것을
    # "제목 없음" 으로 판정하지 않는다. 마커를 지우라고 하면 생성물을 손으로 고치게
    # 되고, 그건 smart-update 가 기대는 표식을 깨뜨린다.
    body_lines = lines[1:] if lines and MARKER_RE.match(lines[0]) else lines
    body_lines = body_lines[1:] if body_lines and not body_lines[0].strip() else body_lines
    if not body_lines or not body_lines[0].startswith("# "):
        missing.append("제목 헤더")
    return missing


def has_metadata_set(lines: list[str], fields: list[str]) -> bool:
    normalized = [normalize_metadata_line(line) for line in lines]
    return all(any(line.startswith(f"- {field}:") for line in normalized) for field in fields)


def strip_code_regions(text: str) -> str:
    """코드 영역을 제거해 **예시 링크**를 실제 링크로 오인하지 않게 한다.

    tutorial 의 heredoc 이나 템플릿 예시 안에는 독자가 *앞으로 만들* 파일을 가리키는
    링크(`[Hello concept](concepts/hello.md)`, `[./tasks/TASK-XXX.md](...)`)가 들어
    있다. 이는 우리 저장소의 링크가 아니므로 존재하지 않는 게 정상이다. 이를 broken
    link 로 세면 **문서를 정확히 쓸수록 red 가 되는** 위양성이 된다.

    줄 단위 fence(``` … ```), 표 셀처럼 한 줄 안에 들어간 ``` … ``` span, 그리고
    같은 줄에서 짝이 맞는 단일 backtick span 을 제거한다. 단일 backtick 을 지워도
    `[`./a.md`](./a.md)` 같은 정상 링크는 label 만 비고 `](target)` 는 남으므로
    계속 검사된다. 반대로 `` `[§4 Rules](path#s4-rules)` `` 처럼 링크 *형식 자체를
    설명하는 예시* 는 통째로 사라진다.
    """
    out: list[str] = []
    in_fence = False
    for line in text.splitlines():
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        line = INLINE_TRIPLE_BACKTICK_RE.sub(" ", line)
        out.append(INLINE_BACKTICK_RE.sub(" ", line))
    return "\n".join(out)


def check_links(path: Path) -> list[str]:
    errors: list[str] = []
    text = strip_code_regions(path.read_text(encoding="utf-8"))
    for match in LINK_PATTERN.finditer(text):
        raw_target = normalize_link_target(match.group(1))
        if not raw_target or raw_target.startswith(SKIP_PREFIXES):
            continue
        if "://" in raw_target:
            continue
        target_path = (path.parent / raw_target).resolve()
        # runtime layer(`ai-workflow/`) 로의 링크는 존재를 요구하지 않는다. 적용 전
        # 저장소에는 runtime layer 가 없을 수 있고, `check_source_without_runtime_layer`
        # 는 실제로 이 디렉터리를 숨긴 채 본 check 를 재실행한다.
        #
        # 이전에는 `"ai-workflow/"` / `"../ai-workflow/"` 문자열 prefix 로만 판정해
        # `../../ai-workflow/...` 처럼 **깊은 상대경로에서 면제가 깨졌다**. 경로를
        # 실제로 해석해 판정하면 깊이에 무관하게 동작한다.
        runtime_root = (REPO_ROOT / "ai-workflow").resolve()
        if target_path == runtime_root or target_path.is_relative_to(runtime_root):
            continue
        if not target_path.exists():
            errors.append(f"broken link `{raw_target}`")
    return errors


def main() -> int:
    failures: list[str] = []
    for path in iter_markdown_files():
        rel_path = path.relative_to(REPO_ROOT)
        missing_metadata = check_metadata(path)
        if missing_metadata:
            failures.append(
                f"{rel_path}: missing metadata fields: {', '.join(missing_metadata)}"
            )
        link_errors = check_links(path)
        for error in link_errors:
            failures.append(f"{rel_path}: {error}")

    targeted_phrases = {
        Path("workflow-source/core/global_workflow_standard.md"): [
            "task delegation 과 결과 통합에 집중하는 구성을 기본값으로 둔다.",
            "ask 는 genuinely blocking decision 이나 위험한 외부 작업으로만 좁히는 편을 기본 원칙으로 둔다.",
        ],
        Path("workflow-source/core/workflow_agent_topology.md"): [
            "메인 오케스트레이터가 직접 도구 호출을 수행하는 패턴은 기본값이 아니며",
            "권장 툴 성격: task-only delegation",
        ],
    }
    for rel_path, snippets in targeted_phrases.items():
        text = (REPO_ROOT / rel_path).read_text(encoding="utf-8")
        for snippet in snippets:
            if snippet not in text:
                failures.append(f"{rel_path}: missing required phrase `{snippet}`")

    if failures:
        print("Document smoke check failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print(f"Document smoke check passed for {len(iter_markdown_files())} markdown files.")
    return 0


def test_case_1() -> None:
    assert main() == 0, "case_1 smoke FAIL"


def test_case_2() -> None:
    assert main() == 0, "case_2 smoke FAIL"


def test_case_3() -> None:
    assert main() == 0, "case_3 smoke FAIL"


def test_case_4() -> None:
    assert main() == 0, "case_4 smoke FAIL"


def test_case_5() -> None:
    assert main() == 0, "case_5 smoke FAIL"



if __name__ == "__main__":
    sys.exit(main())
