<!-- standard-ai-workflow-kit: v0.15.19-beta -->

# Session-End Skill Spec

- 문서 목적: `session-end` skill 을 실제 구현 가능한 수준의 입력/출력 계약과 동작 순서로 구체화한다.
- 범위: 목표, 입력 계약, 출력 계약, 가드 5종, 판단 절차, 실패 규칙, 권한 제한, 수동 대체 절차
- 대상 독자: AI agent 설계자, skill 구현자, 운영자, 프로젝트 온보딩 담당자
- 상태: draft
- 최종 수정일: 2026-07-27
- 관련 문서: `./session_start_skill_spec.md`, `./workflow_skill_catalog.md`, `./global_workflow_standard.md`, `./workflow_agent_topology.md`, `./stage_gate_pattern.md`

## 1. 목적

`session-end` skill 의 목적은 세션 종료 직전에 workflow 메타 정합성을 검증하고, 누락을 사전에 검출하는 것이다.

`session-start` 가 세션 진입 시 *baseline 복원* 만 한다면, `session-end` 는 세션 종료 시 *drift 검출* 을 책임진다. 두 skill 이 시작-종료 쌍을 이루며 workflow memory 의 일관성을 닫힌다.

배경 — 본 skill 의 도입 동기: 2026-07-27 세션에서 *워크트리가 v0.7.0 인데 HEAD 가 v0.8.12* 인 사각지대가 발견됐다. 단일 커밋(merge -s ours, force-push 부재) 가 아니어도 발생할 수 있는 drift — `state.json` 의 baseline / rev / latest_backlog_path / package.json 버전이 HEAD 와 갈라지는 모든 경우를 종료 시점에 검출한다.

## 2. 선행 원칙

- 공통 종료 순서는 `global_workflow_standard.md` §6 "세션 종료" 를 따른다.
- 본 skill 은 **drift 검출(read-mostly)** 이다. 자동 수정은 기본 모드에서 하지 않는다. `apply` 모드에서만 안전한 보정(rev +1 / latest_backlog_path = 최신 일일 백로그 / 5 package.json 통일)을 사용자가 명시적으로 켠다.
- 검출 결과는 `stage_completion` + `warnings` 로 emit 한다. 다음 세션의 `session-start` 가 즉시 발견할 수 있도록 한다.
- `done` 상태를 재판정하지 않는다 — 사용자가 명시적으로 close 하지 않은 in-progress 항목은 그대로 둔다.

## 3. 가드 9종 (9 Drift Detection Rules, v0.8.16 확장)

본 skill 은 다음 9종의 정합성 가드를 수행한다. 각 가드는 *PASS* 또는 *FAIL* 이며, FAIL 은 `warnings` 에 1줄로 적재된다. **v0.8.16 부터 5종 → 9종 확장** (G6~G9 추가).

| # | 가드 | 검출 항목 | FAIL 시 warnings 1줄 예시 |
|---|---|---|---|
| **G1** | state.json JSON 유효 | `json.load(state.json)` 성공 | `state.json: JSON parse failed (line N)` |
| **G2** | `state.current_baseline` 최신성 | `current_baseline` 헤더의 `vX.Y.Z` 가 HEAD 의 가장 최신 tag 와 일치 | `current_baseline=v0.7.0 이지만 HEAD latest tag=v0.8.12 (drift)` |
| **G3** | `state.session.rev_*` 정합 | `handoff_rev` == `session_handoff.md` 의 `## 핵심 (rev N)` N / `index_rev` == `work_backlog.md` 의 `rev N` / `latest_rev` == 최신 일일 백로그 의 `rev N` | `handoff_rev=121 but session_handoff.md latest rev=166 (drift)` |
| **G4** | `state.backlog.latest_backlog_path` 정합 | `latest_backlog_path` 가 `ai-workflow/memory/active/backlog/` 의 실제 최신 YYYY-MM-DD.md 와 일치 | `latest_backlog_path=2026-07-24.md but actual latest=2026-07-25.md (drift)` |
| **G5** | 5 package.json 버전 통일 | `apps/build-server` / `apps/build-monitor` / `packages/shared-contract` / `packages/shared-config` / `packages/db` 의 `"version"` field 가 모두 동일 | `package.json drift: build-server=0.7.0 build-monitor=0.8.12 ...` |
| **G6** | `current_baseline` ↔ CHANGELOG.md latest release | `current_baseline` 의 semver 가 CHANGELOG.md 의 가장 최신 `## N. vX.Y.Z (release entry)` 와 일치 | `current_baseline=v0.8.13 but CHANGELOG.md latest release=v0.8.14 (drift)` |
| **G7** | HEAD commit subject 정합 (release commit 검증) | HEAD 가 `release: vX.Y.Z ...` 형식이면 G3 잔존 여부 + handoff_rev 정합 확인 | `G3 drift 잔존: state.handoff_rev=X actual=Y (G3 보정 필요)` |
| **G8** | `session_handoff.md` 첫 줄 `Updated:` 헤더 정합 | 본문 첫 줄 `- Updated: ... (rev X→Y: **vA.B.C ...**)` 의 vA.B.C 가 CHANGELOG.md latest release 와 일치 | `session_handoff.md 첫 줄=v0.8.15 but CHANGELOG.md latest release=v0.8.13 (drift)` |
| **G9** | state.json semantic 검증 | 필수 필드(schema_version / purpose_digest_rev / session.rev / current_baseline) / 타입 / `latest_backlog_path` 2중복 단일화 정합 | `state.json semantic 검증 실패: schema_version missing; latest_backlog_path 2중복 drift ...` |

9종 가드 중 **G1** 은 hard fail (state.json 자체가 깨지면 다른 가드도 무의미) 이고, G2~G9 는 soft fail (drift 검출) 이다.

### 3.1 v0.8.16 확장 동기 (G6~G9 도입)

- **G6**: G2 가 통과해도 CHANGELOG.md 의 release entry 가 미갱신된 drift 는 검출 불가. CHANGELOG.md 의 release anchor 와 current_baseline 의 의미 정합을 보장.
- **G7**: release commit 의 semver (예: `release: v0.8.15 ...`) 가 session_handoff.md 의 rev 갱신과 의미 정합하는지 확인. G3 drift 잔존 시 자동 검출.
- **G8**: session_handoff.md 본문 첫 줄의 `Updated:` 헤더가 CHANGELOG.md 의 최신 release 와 어긋난 drift 검출. release commit 시 본문 첫 줄 갱신 누락 / CHANGELOG 갱신 누락 모두 검출.
- **G9**: state.json 의 의미적 정합 (필수 필드 / 타입 / 단일 출처) 을 G1 의 raw JSON 파싱 외에 검증. v0.8.15 의 schema 단일화 정책(`latest_backlog_path` 2중복 → 1중복) 의 회귀 방지.

### 3.2 G6~G9 적용 범위

- **G6~G9**: read-only 검출. apply 모드 자동 보정 없음 (의미 정합은 사용자 결정 영역).
- G1~G5 의 apply 모드는 G3/G4/G5 보정만 허용 (G2/G1 은 자동 수정 불가). G6~G9 도 동일 정책 — read-only.itor=0.8.12 ...` |

5종 가드 중 **G1** 은 hard fail (state.json 자체가 깨지면 다른 가드도 무의미) 이고, G2~G5 는 soft fail (drift 검출) 이다.

## 4. 입력 계약

### 4.1 필수 입력

- `workspace_root` — 프로젝트 루트 경로
- `state_path` — `ai-workflow/memory/active/state.json` 절대 또는 상대 경로

### 4.2 선택 입력

- `session_handoff_path` — 기본값 `<memory_dir>/session_handoff.md`
- `work_backlog_index_path` — 기본값 `<memory_dir>/work_backlog.md`
- `memory_dir` — 기본값 `<workspace_root>/ai-workflow/memory/active`
- `today` — ISO date (YYYY-MM-DD). 미지정 시 시스템 오늘 날짜.
- `apply` — boolean. true 면 안전한 보정을 자동 적용 (G3 rev, G4 latest_backlog_path, G5 package.json). 기본 false (검출만).

### 4.3 입력 해석 규칙

- `workspace_root` 가 없으면 즉시 실패.
- `state_path` 가 상대 경로면 `workspace_root` 기준 resolve.
- `apply=true` 인 경우에도 G2(current_baseline)와 G1(JSON 유효)는 자동 수정 불가 — 사용자 수동 확인 필수.

## 5. 출력 계약

본 skill 은 `session-start` 와 동형의 `stage_completion` 패턴을 따른다. 출력은 사람이 즉시 읽고 다음 행동으로 이어갈 수 있는 구조화 요약이어야 한다.

### 5.1 최소 출력 필드

- `summary` — 가드 9종 결과를 3~6줄로 요약. 첫 줄에 PASS/FAIL 요약.
- `guards` — 9종 가드 각각의 `{id, status: pass|fail, message}` 9 객체 list.
- `passed` — `bool`. 9종 모두 pass 면 true.
- `drift_items` — `guards` 중 fail 인 항목의 `id` list.
- `next_actions` — 권장 후속 행동 list (예: "state.json 의 current_baseline 을 v0.8.12 로 갱신").
- `warnings` — FAIL 항목 1줄 + 환경 노트 + drift 위험 등.
- `stage_completion` — Stage Gate Pattern v0.6.5+ 형식 (session-start 와 동일 schema).

### 5.2 권장 출력 예시 (drift 검출 시)

```yaml
summary:
- 5 guard 중 4 FAIL. workspace 가 v0.7.0 baseline 으로 멈춰 있고 HEAD 는 v0.8.12.
- 즉시 메타 동기화 필요.
- G1 (state.json 유효): PASS.
- G2 (current_baseline): FAIL (v0.7.0 vs v0.8.12).
- G5 (package.json 통일): FAIL (5종 중 3종 drift).
guards:
- {id: G1, status: pass, message: state.json JSON 유효}
- {id: G2, status: fail, message: current_baseline=v0.7.0 but latest tag=v0.8.12}
- {id: G3, status: fail, message: handoff_rev=121 but session_handoff.md latest rev=166}
- {id: G4, status: fail, message: latest_backlog_path=2026-07-24.md but actual=2026-07-25.md}
- {id: G5, status: fail, message: 5 package.json drift: 0.7.0 vs 0.8.12}
passed: false
drift_items: [G2, G3, G4, G5]
next_actions:
- "git merge --ff-only main 으로 workspace 동기화 (HEAD 가 main 보다 뒤처진 경우)"
- "또는 state.json current_baseline 을 v0.8.12 로 수동 갱신"
warnings:
- "G1 (state.json): JSON parse failed (line N)"  # G1 FAIL 시
stage_completion:
  stage_name: session-end
  stage_status: warning  # 또는 error (G1 fail), ok (모두 pass)
  next_stage: None
  approval_actor: user mandatory  # apply 모드 자동 보정 시 필수
  ...
```

### 5.3 stage_completion 정책

| 시나리오 | stage_status |
|---|---|
| 5종 모두 PASS | `ok` |
| G1 fail | `error` (다음 세션 baseline 복원 불가) |
| G2~G5 중 1개 이상 fail | `warning` |
| apply 모드로 모든 fail 해소 | `ok` (단, G2 는 수동 확인 필수이므로 `warning` 유지 가능) |

## 6. 동작 절차

### 6.1 사전 확인 (6.1)

1. `workspace_root` 가 실제 디렉터리인지 확인.
2. `state_path` 가 존재하고 읽기 가능한지 확인. 없으면 G1 fail.
3. `git` 명령이 PATH 에 있는지 확인 (G2 는 `git describe --tags` 사용).

### 6.2 G1 — state.json JSON 유효 (6.2)

1. `state_path` 를 `json.load(open(...))` 시도.
2. 성공 시 PASS, 실패 시 `JSONDecodeError.lineno` 를 message 에 포함해 FAIL.
3. JSON 유효성 자체를 G2~G5 의 전제로 사용 — G1 FAIL 시 G2~G5 는 모두 skip (warnings 에 "G1 fail → 후속 가드 skip" 1줄).

### 6.3 G2 — current_baseline 최신성 (6.3)

1. `git describe --tags HEAD` 로 최신 tag 추출 (예: `v0.8.12`).
2. `state_path` 에서 `current_baseline` 값 추출 — 정규식 `\*\*v(\d+\.\d+\.\d+)` 로 첫 semver 캡처.
3. 두 값 비교. 일치하면 PASS, 불일치하면 FAIL + 양쪽 값 message 에 포함.
4. `git describe --tags` 가 실패하면(태그 0개) G2 skip + "tag 없음 — semver drift 비교 skip" warnings 1줄.

### 6.4 G3 — rev 정합 (6.4)

1. `state.session.handoff_rev`, `state.session.index_rev`, `state.session.latest_rev` 추출.
2. `session_handoff.md` 본문에서 정규식 `## 핵심 \(rev (\d+)\)` 또는 `rev (\d+)→(\d+)` 의 최대 N 추출.
3. `work_backlog.md` 본문에서 정규식 `rev (\d+)→(\d+)` 또는 `rev (\d+):` 의 최대 N 추출.
4. `backlog/<최신 파일>` 본문에서 정규식 `rev (\d+)→(\d+)` 또는 `rev (\d+):` 의 최대 N 추출.
5. 각 rev 비교. 일치하지 않으면 FAIL + 어느 쪽이 어떤 값인지 message.

### 6.5 G4 — latest_backlog_path 정합 (6.5)

1. `backlog/` 디렉터리의 모든 `YYYY-MM-DD.md` 파일 중 가장 최신 날짜 추출.
2. `state.backlog.latest_backlog_path` 와 비교 (파일명만 또는 basename 만 비교).
3. 불일치 시 FAIL.

### 6.6 G5 — package.json 통일 (6.6)

1. 5종 `package.json` 의 `"version"` field 를 추출:
   - `apps/build-server/package.json`
   - `apps/build-monitor/package.json`
   - `packages/shared-contract/package.json`
   - `packages/shared-config/package.json`
   - `packages/db/package.json`
2. 5종 모두 같은 값이면 PASS. 아니면 FAIL + drift list message.
3. 파일 부재 시 1종 "missing" 으로 보고.

### 6.7 apply 모드 보정 (6.7, apply=true 일 때만)

G2 만 제외하고 다음 보정을 *사용자 승인 후* 적용:

- G3: `state.session.{handoff_rev,index_rev,latest_rev}` 를 실제 파일 rev 로 set.
- G4: `latest_backlog_path` 를 실제 최신 일일 백로그 파일로 set.
- G5: 5종 `package.json` 의 version 을 다수값(또는 가장 최신 tag 의 semver) 으로 통일.

G2 (current_baseline) 와 G1 (JSON 유효) 는 자동 보정 불가 — 사용자 명시 결정 필요.

### 6.8 최종 요약 (6.8)

1. `summary` 1줄: PASS 면 "5/5 guard pass — workflow meta 정합", FAIL 면 "N/5 guard fail — drift detected".
2. `next_actions` 채우기: drift 가드별로 다음 행동 1줄 권고.
3. `stage_completion` 빌드.

## 7. 판단 규칙

- 본 skill 은 *drift 검출* 만 책임진다. *drift 의 원인* (어떤 commit 이 누락됐는지) 은 진단하지 않는다 — `git log origin/main..HEAD` 같은 별도 진단을 권고만 한다.
- 5종 가드 모두 PASS 여도 *누락 가능성 0* 을 보장하지 않는다. (예: 커밋 메시지는 정합이지만 코드 변경이 부족한 경우는 본 skill 의 범위 밖.)
- G3 의 rev 추출 정규식이 매칭 실패하면 warnings 에 "rev pattern miss in <file>" 1줄 추가 + fail-safe 로 0 가정 (비교 skip).
- G4 의 일일 백로그가 *단 한 번도* 작성 안 된 신규 프로젝트면 warnings 에 "no daily backlog found — G4 skip" 1줄.

## 8. 실패 및 경고 규칙

### 8.1 실패로 처리할 조건 (stage_status=error)

- `workspace_root` 부재 또는 디렉터리 아님
- `state_path` 부재 (G1 fail)
- G1 fail (state.json JSON 깨짐)

### 8.2 경고로 처리할 조건 (stage_status=warning)

- G2~G5 중 1개 이상 fail
- `git describe --tags` 실패 (G2 skip)
- rev 패턴 매칭 실패 (G3 partial fail)
- 일일 백로그 부재 (G4 skip)
- 5종 중 일부 package.json 부재 (G5 partial fail)

### 8.3 실패 시 최소 출력

실패하더라도 다음은 남긴다:

- 어떤 가드가 fail 인지 (`guards`)
- 어떤 입력 경로가 문제였는지 (`warnings`)
- 사람이 수동으로 무엇을 해야 하는지 (`next_actions`)

## 9. 권한과 수정 제한

- 기본 권한은 **drift 검출(read-only)** 이다.
- `apply=true` 일 때만 G3/G4/G5 보정을 허용한다.
- G2 (`current_baseline`) 와 G1 (JSON 유효) 는 자동 수정 절대 불가 — 사용자 명시 결정 영역.
- 모든 `apply` 는 `stage_completion.approval_actor: user` + `approval_timestamp` 가 명시적으로 기록될 때만 활성화된다.
- `apply=false` (기본) 면 `state.json`, `*.md`, `package.json` 어떤 것도 수정하지 않는다.

## 10. 수동 대체 절차

tool 이 없거나 skill 구현이 아직 없으면 다음 4가지를 순서대로 확인한다.

1. `cat ai-workflow/memory/active/state.json | python3 -m json.tool` — JSON 유효성.
2. `git describe --tags HEAD` vs `state.current_baseline` — G2.
3. `state.session.{handoff_rev,index_rev,latest_rev}` vs 각 .md 파일의 `rev N` 헤더 — G3.
4. `state.backlog.latest_backlog_path` vs `ls -1 ai-workflow/memory/active/backlog/ | sort | tail -1` — G4.
5. 5종 `package.json` 의 `"version"` 동등성 — G5.

모두 통과면 종료 가능. FAIL 이 있으면 사용자 보고 후 동기화 진행.

## 11. 구현 체크리스트

- 5종 가드 모두 구현되었는가
- stage_completion 출력이 session-start 와 동형 schema 인가
- `apply=false` 가 기본이고 그 어떤 부수 효과도 없는가
- G2/G1 자동 수정 시도가 코드에 없는가 (수동 전용)
- 단위 테스트가 5종 가드의 PASS/FAIL 케이스 각각을 커버하는가
- `git describe` 실패 / `package.json` 부재 / 빈 백로그 같은 우아한 실패 경로가 동작하는가
- 출력이 1줄 summary + 구조화 list 라 사람이 즉시 읽을 수 있는가

## 다음에 읽을 문서

- skill 카탈로그: [./workflow_skill_catalog.md](./workflow_skill_catalog.md)
- session-start spec: [./session_start_skill_spec.md](./session_start_skill_spec.md)
- 공통 표준: [./global_workflow_standard.md](./global_workflow_standard.md)
- Stage Gate Pattern: [./stage_gate_pattern.md](./stage_gate_pattern.md)
- 구현체: [`../skills/session-end/scripts/run_session_end.py`](../skills/session-end/scripts/run_session_end.py)
- 스킬 카탈로그 entry: [`../skills/session-end/SKILL.md`](../skills/session-end/SKILL.md)
