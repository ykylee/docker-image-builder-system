<!-- standard-ai-workflow-kit: v1.0.0-beta -->

# Session-End Skill

- 문서 목적: `session-end` skill 프로토타입의 역할과 구현 진입점을 정리한다.
- 범위: 목적, 연결 스펙, 가드 9종, 예상 입력/출력, 권한 경계, 구현 메모
- 대상 독자: skill 구현자, AI agent 설계자, 운영자
- 상태: draft (v0.15.19-beta 신규 도입)
- 최종 수정일: 2026-07-27
- 관련 문서: `../../core/session_end_skill_spec.md`, `../../core/session_start_skill_spec.md`, `../../core/workflow_skill_catalog.md`, `../../core/workflow_agent_topology.md`

## 1. 목적

세션 종료 직전에 workflow 메타 정합성을 9종 가드로 검증하고 drift 를 사전 검출한다. `session-start` 가 *baseline 복원* 만 한다면, `session-end` 는 *drift 검출* 을 책임진다. 두 skill 이 시작-종료 쌍을 이루며 workflow memory 의 일관성을 닫힌다.

배경 — 2026-07-27 세션에서 *워크트리가 v0.7.0 인데 HEAD 가 v0.8.12* 인 사각지대가 발견됨. 단일 force-push 가 아니어도 발생할 수 있는 drift — `state.json` 의 baseline / rev / latest_backlog_path / package.json 버전이 HEAD 와 갈라지는 모든 경우를 종료 시점에 검출한다.

## 2. 연결 스펙

- 상세 스펙: [`../../core/session_end_skill_spec.md`](../../core/session_end_skill_spec.md)
- 카탈로그: [`../../core/workflow_skill_catalog.md`](../../core/workflow_skill_catalog.md)
- session-start (쌍 skill): [`../../core/session_start_skill_spec.md`](../../core/session_start_skill_spec.md)

## 3. 가드 9종 (Drift Detection Rules, v0.8.16 확장)

| # | 가드 | 검출 항목 |
|---|---|---|
| **G1** | `state.json` JSON 유효 | `json.load` 성공 |
| **G2** | `current_baseline` 최신성 | `state.current_baseline` semver == HEAD latest tag |
| **G3** | `state.session.rev_*` 정합 | `handoff_rev` / `index_rev` / `latest_rev` == 각 .md 파일의 `rev N` 헤더 |
| **G4** | `state.backlog.latest_backlog_path` 정합 | `latest_backlog_path` == `backlog/` 의 실제 최신 YYYY-MM-DD.md |
| **G5** | 5종 `package.json` 통일 | `apps/build-server` / `apps/build-monitor` / `packages/shared-contract` / `packages/shared-config` / `packages/db` 의 `"version"` field 동등 |
| **G6** | `current_baseline` ↔ CHANGELOG.md latest release | `current_baseline` semver == CHANGELOG.md 의 가장 최신 `## N. vX.Y.Z (release entry)` |
| **G7** | HEAD commit subject 정합 | HEAD commit subject 가 `release: vX.Y.Z ...` 형식이면 G3 잔존 여부 + handoff_rev 정합 확인 |
| **G8** | `session_handoff.md` 첫 줄 `Updated:` 헤더 정합 | 본문 첫 줄의 `**vA.B.C ...**` 가 CHANGELOG.md latest release 와 일치 |
| **G9** | state.json semantic 검증 | 필수 필드(schema_version / purpose_digest_rev / session.rev / current_baseline) / 타입 / `latest_backlog_path` 2중복 단일화 정합 |

G1 은 hard fail (state.json 자체 깨짐 → 다음 세션 baseline 복원 불가), G2~G9 는 soft fail (drift 검출). **v0.8.16 부터 G6~G9 추가** — 5종 → 9종 확장.

## 4. 예상 입력

- `workspace_root` (필수) — 프로젝트 루트 경로
- `state_path` (필수) — `ai-workflow/memory/active/state.json` 절대/상대 경로
- `session_handoff_path` (선택) — 기본 `<memory_dir>/session_handoff.md`
- `work_backlog_index_path` (선택) — 기본 `<memory_dir>/work_backlog.md`
- `memory_dir` (선택) — 기본 `<workspace_root>/ai-workflow/memory/active`
- `today` (선택) — ISO date. 미지정 시 시스템 오늘 날짜.
- `apply` (선택, boolean, 기본 false) — 안전한 보정을 자동 적용할지 여부

## 5. 예상 출력

- `summary` — 가드 9종 결과 3~6줄 요약
- `guards` — 9종 가드 각각의 `{id, status, message}` list
- `passed` — 9종 모두 pass 면 true
- `drift_items` — fail 인 가드 id list
- `next_actions` — 권장 후속 행동 list
- `warnings` — fail 항목 + 환경 노트
- `stage_completion` — Stage Gate Pattern v0.6.5+ 형식 (session-start 와 동형)

## 6. 권한 경계

- **기본 (apply=false)** 은 drift 검출(read-only). 어떤 파일도 수정하지 않음.
- **`apply=true`** 일 때만 G3/G4/G5 보정 허용. 단, `stage_completion.approval_actor: user` 명시 필수.
- **G2 (current_baseline)** 와 **G1 (JSON 유효)** 는 자동 수정 절대 불가 — 사용자 명시 결정 영역.
- 모든 `apply` 보정은 backup 파일을 남긴 뒤 진행 (`*.bak.<timestamp>`).

## 7. 구현 메모

- 가드 9종 모두 PASS 여도 *누락 가능성 0* 을 보장하지는 않음 (코드/문서 변경은 본 skill 범위 밖).
- G3 의 rev 패턴은 `## 핵심 (rev N)` / `rev N→M` / `rev N:` 모두 지원.
- G4 의 일일 백로그 부재 시 (신규 프로젝트) skip + advisory 1줄.
- G5 의 5종 중 일부 파일 부재 시 partial fail 로 보고.
- `git describe --tags` 실패 (태그 0개) 시 G2 skip + advisory.
- 출력이 사람이 즉시 읽을 수 있도록 `summary` 첫 줄에 PASS/FAIL 요약 명시.

## 8. 스킬 실행

### 8.1 프로토타입 스크립트

```bash
python3 ai-workflow/skills/session-end/scripts/run_session_end.py \
  --workspace-root "$PWD" \
  --state-path ai-workflow/memory/active/state.json \
  --today "$(date +%Y-%m-%d)"
```

### 8.2 apply 모드 (자동 보정)

```bash
python3 ai-workflow/skills/session-end/scripts/run_session_end.py \
  --workspace-root "$PWD" \
  --state-path ai-workflow/memory/active/state.json \
  --apply \
  --approval-actor "$USER"
```

### 8.3 종료 전 권장 호출

본 skill 은 다음 두 경우에 호출 권장:

1. **세션 종료 직전** — 사용자 보고 후 마지막 단계로 `session-end` 실행.
2. **PR push 직전** — pre-push hook 또는 수동 호출. 다른 브랜치/원격과 동기화 후 검증.

## 9. 도입 사례 (Adoption Case)

2026-07-27 세션에서 본 skill 의 도입 동기가 된 사각지대:

- 워크트리가 v0.7.0 (`ykylee/crinoid` 브랜치) 에 머물러 있었음.
- HEAD pointer 는 v0.8.12 (`49f3e99`) 를 가리킴.
- `git status` 가 clean 으로 보고되어 drift 가 숨겨져 있었음 (인덱스 blob == v0.7.0 blob, 워크트리 == 인덱스).
- 사용자가 *"세션 종료 시점에 메타 정합을 꼭 해야해"* 라고 명시 요구.
- 해소: fast-forward merge 로 즉시 동기화 + 본 skill 신설로 재발 방지 가드 설치.

이 사례가 본 skill 의 *G2 / G3 / G4 / G5 가드가 모두 FAIL 했던 케이스* 에 해당한다.

## 다음에 읽을 문서

- 스펙: [`../../core/session_end_skill_spec.md`](../../core/session_end_skill_spec.md)
- 카탈로그: [`../../core/workflow_skill_catalog.md`](../../core/workflow_skill_catalog.md)
- 쌍 skill: [`../../core/session_start_skill_spec.md`](../../core/session_start_skill_spec.md)
- 글로벌 표준: [`../../core/global_workflow_standard.md`](../../core/global_workflow_standard.md)
- Stage Gate: [`../../core/stage_gate_pattern.md`](../../core/stage_gate_pattern.md)
- 구현체: [`scripts/run_session_end.py`](scripts/run_session_end.py)
