<!-- standard-ai-workflow-kit: v0.15.19-beta -->

# /workflow-session-start

> Claude Code slash command. 표준 AI 워크플로우 의 *session-start* 진입점.

## 역할

이 command 는 `ai-workflow/memory/active/` 의 *현재 baseline* 을 복원한다:

1. `state.json` 읽기 — `latest_backlog_path` + `in_progress_items` + `recent_done_items`
2. `session_handoff.md` 읽기 — 이전 세션의 인계 사항
3. `work_backlog.md` 읽기 — 현재 작업 목록 anchor
4. `PROJECT_PROFILE.md` 읽기 — 프로젝트 메타
5. (있으면) `PURPOSE.md` 읽기 — directional intent 1-line + body excerpt ≤200 token

## 절차

1. `ai-workflow/memory/active/state.json` 부터 읽고 현재 baseline 요약
2. `session_handoff.md` + `work_backlog.md` 의 anchor 로 3~7개 후속 작업 후보 선정
3. 한국어로 1줄 요약 + 3-5개 다음 작업 후보 + 권장 다음 행동 보고
4. **중간 reasoning / 중복 요약 / 자기 설명 금지** — 사용자에게는 *결론* 만

## language + context 원칙

- 사용자에게 보이는 보고는 한국어
- 코드, 명령어, file path, 설정 key 는 원문 그대로
- handoff / backlog 에는 *다음 세션에 꼭 필요한 사실* 만 남겨 context 누적 최소화

## next step

요약 + 후보 보고 후 사용자 confirm 시:
- `/workflow-backlog-update` 로 오늘 작업 등록
- 또는 `/workflow-doc-sync` 로 영향 문서 동기화

## 관련 문서

- `ai-workflow/memory/active/state.json`
- `ai-workflow/memory/active/sessions`
- `ai-workflow/memory/active/backlog`
- `docs/PROJECT_PROFILE.md`
- (있으면) `ai-workflow/memory/active/PURPOSE.md`
