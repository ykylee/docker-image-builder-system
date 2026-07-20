<!-- standard-ai-workflow-kit: v0.15.19-beta -->

# Harnesses

- 문서 목적: 표준 AI 워크플로우를 하네스별 배포 패키지로 맞출 때 참고할 타겟별 안내 문서를 모은다.
- 범위: Codex, OpenCode, MiniMax Code, Gemini CLI, Antigravity, Grok Build, Claude Code, Aider, Goose, Pi Coding Agent, CodeWhale 타겟별 파일 구성과 bootstrap 연결 방식, 공통 `AGENTS.md` 진입점, 추후 하네스 확장 포인트
- 대상 독자: 저장소 관리자, AI workflow 설계자, 하네스 통합 담당자
- 상태: draft
- 최종 수정일: 2026-07-20
- 관련 문서: `../core/workflow_harness_distribution.md`, `../scripts/bootstrap_workflow_kit.py`, `../scripts/bootstrap_lib/harnesses/__init__.py`

## 현재 지원 타겟

- [codex/README.md](./codex/README.md)
- [codex/apply_guide.md](./codex/apply_guide.md)
- [opencode/README.md](./opencode/README.md)
- [opencode/apply_guide.md](./opencode/apply_guide.md)
- [minimax-code/README.md](./minimax-code/README.md)
- [minimax-code/apply_guide.md](./minimax-code/apply_guide.md)
- [gemini-cli/README.md](./gemini-cli/README.md)
- [gemini-cli/apply_guide.md](./gemini-cli/apply_guide.md)
- [antigravity/README.md](./antigravity/README.md)
- [antigravity/apply_guide.md](./antigravity/apply_guide.md)
- [claude-code/README.md](./claude-code/README.md)
- [claude-code/apply_guide.md](./claude-code/apply_guide.md)
- [aider/README.md](./aider/README.md)
- [aider/apply_guide.md](./aider/apply_guide.md)
- [goose/README.md](./goose/README.md)
- [goose/apply_guide.md](./goose/apply_guide.md)
- [grok-build/README.md](./grok-build/README.md)
- [grok-build/apply_guide.md](./grok-build/apply_guide.md)
- [pi-dev/AGENTS.md](./pi-dev/AGENTS.md)
- [pi-dev/apply_guide.md](./pi-dev/apply_guide.md)
- [codewhale/README.md](./codewhale/README.md)
- [codewhale/apply_guide.md](./codewhale/apply_guide.md)

## 추후 확장용 템플릿

- [_template/README.md](./_template/README.md)

## 공통 원칙

- 하네스별 파일은 정책 원문이 아니라 공통 workflow 문서로 연결하는 오버레이다.
- 공통 문서 세트는 `ai-workflow/` 아래에 유지한다.
- 실제 하네스가 읽는 파일은 프로젝트 루트 또는 하네스 전용 디렉터리에 생성한다.
- 새 하네스는 레지스트리 기반 bootstrap 확장 방식으로 추가한다.
- 이번 릴리즈 배포 묶음의 기본 진입점은 `workflow_adoption_entrypoints.md` 와 `workflow_skill_catalog.md` 이다.
- 기본 export bundle 은 AI agent 런타임 사용에 필요한 파일만 포함하고, source docs 와 global snippets 는 기본적으로 제외한다.
- MCP 관련 draft 자료는 기본 배포 패키지에 넣지 않고, 필요할 때만 opt-in export 로 포함한다.

이번 릴리즈에서 하네스 소비자가 우선 읽을 파일:

- `bundle/ai-workflow/README.md`
- `bundle/ai-workflow/core/workflow_adoption_entrypoints.md`
- `bundle/ai-workflow/core/workflow_skill_catalog.md`
- `bundle/docs/PROJECT_PROFILE.md`
- `bundle/ai-workflow/memory/active/sessions`
- `bundle/ai-workflow/memory/active/backlog`
- `bundle/ai-workflow/wiki/index.md` (Wiki 진입점, R4 anchor 기반)

## bootstrap 예시

```bash
python3 scripts/bootstrap_workflow_kit.py \
  --target-root /tmp/example-repo \
  --project-slug example_repo \
  --project-name "Example Repo" \
  --harness codex \
  --harness opencode \
  --copy-core-docs
```

## 다음에 읽을 문서

- 배포 전략: [../core/workflow_harness_distribution.md](../core/workflow_harness_distribution.md)
- 하네스 템플릿: [./_template/README.md](./_template/README.md)
- 스크립트 안내: [../scripts/README.md](../scripts/README.md)
