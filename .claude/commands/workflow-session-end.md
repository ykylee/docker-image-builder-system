<!-- standard-ai-workflow-kit: v0.15.19-beta -->

# /workflow-session-end

> Claude Code slash command. 표준 AI 워크플로우 의 *session-end* 진입점.

## 역할

이 command 는 세션 종료 직전에 workflow meta 의 drift 를 **가드 5종** 으로 사전 검출한다:

1. **G1** — `state.json` JSON 유효
2. **G2** — `state.current_baseline` 의 semver == HEAD 최신 tag
3. **G3** — `state.session.{handoff_rev,index_rev,latest_rev}` == 각 `.md` 의 `rev N` 헤더
4. **G4** — `state.backlog.latest_backlog_path` == `backlog/` 의 실제 최신 YYYY-MM-DD.md
5. **G5** — 5종 `package.json` 의 `"version"` field 동등 (build-server / build-monitor / shared-contract / shared-config / db)

`session-start` 가 *baseline 복원* 만 한다면, `session-end` 는 *drift 검출* 을 담당한다. 두 skill 이 시작-종료 쌍을 이룬다.

## 절차

1. `python3 ai-workflow/skills/session-end/scripts/run_session_end.py --workspace-root "$PWD"` 실행
2. `passed: true` 면 세션 종료 가능
3. `passed: false` 면 `drift_items` + `next_actions` 보고 후 **사용자 결정**:
   - 자동 보정 가능 (G3/G4/G5) → `--apply --approval-actor "$USER"` 로 재실행
   - 사용자 수동 결정 영역 (G2 / G1) → 사용자 confirm 후 다음 행동 합의
4. 한국어로 1줄 요약 + drift 항목 + 권장 다음 행동 보고
5. **중간 reasoning / 중복 요약 / 자기 설명 금지** — 사용자에게는 *결론* 만

## 권한

- 기본 (인자 없음) 은 read-only drift 검출. 어떤 파일도 수정하지 않음.
- `--apply --approval-actor <actor>` 일 때만 G3/G4/G5 안전 보정 (G2 / G1 은 자동 수정 불가).
- 모든 보정은 `*.bak.<timestamp>` 으로 백업 후 진행.

## language + context 원칙

- 사용자에게 보이는 보고 = 한국어
- file path, semver, rev 숫자 = 원문
- drift 발견 시 1줄 message 만 (긴 추론 ❌)
- `session_handoff.md` / `work_backlog.md` / `state.json` 갱신은 보정 후 자동으로 follow-up `/workflow-doc-sync` 권장

## 다음에 읽을 문서

- `ai-workflow/core/session_end_skill_spec.md` — 상세 스펙
- `ai-workflow/skills/session-end/SKILL.md` — skill 카드
- `ai-workflow/memory/active/state.json` — 현재 baseline

## 도입 사례

2026-07-27 세션에서 본 command 의 도입 동기:
- 워크트리가 `ykylee/crinoid` 브랜치 v0.7.0 에서 머물러 있었고 HEAD pointer 는 v0.8.12 를 가리킴.
- `git status` 가 clean 으로 보고되어 drift 가 숨겨져 있었음.
- 본 command 가 있었다면 세션 종료 시점에 즉시 검출되어 다음 세션의 baseline 복원이 정상화됨.
