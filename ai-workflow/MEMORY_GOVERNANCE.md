# AI-First Memory Governance

- 문서 목적: AI 에이전트가 관리하는 운영 문서(Workflow State)의 관리 규칙과 템플릿을 정의한다.
- 범위: 상태 문서 분류, 작성 표준, 메타데이터 요구사항
- 대상 독자: AI 에이전트, 저장소 관리자
- 상태: stable
- 최종 수정일: 2026-07-18
- 관련 문서: [../ai-workflow/WORKFLOW_INDEX.md](../ai-workflow/WORKFLOW_INDEX.md), [../README.md](../README.md)

이 문서는 `ai-workflow/memory/` 하위 문서를 작성할 때 AI 에이전트가 준수해야 할 규칙과 템플릿을 정의합니다.

## 1. 작성 규칙 (Writing Rules)

- **언어**: 사용자 보고용 요약은 한국어를 사용하되, 상태 값이나 기술적 명칭은 영문 표준을 권장합니다.
- **간결성**: 중복된 설명을 피하고, 변경 사항(Diff)과 다음 행동(Next Action)에 집중합니다.
- **구조화**: Key-Value 쌍(예: `Status: in_progress`) 또는 Markdown Table을 적극 활용합니다.
- **격리**: 문서 간의 의존성을 최소화하고, 각 파일이 독립적인 컨텍스트를 완결성 있게 담도록 합니다.

## 2. 표준 템플릿 (Standard Templates)

### 📂 Session Handoff (`session_handoff.md`)
```markdown
# Session Handoff
- Branch: [branch_name]
- Updated: [YYYY-MM-DD HH:mm]

## 🎯 Current Focus
[현재 작업의 핵심 목표 1줄]

## 📊 Work Status
- [TASK-ID] [Title]: [Status] ([Progress %])
- [최근 수행한 핵심 변경 사항 및 결과]

## ⏭️ Next Actions
- [ ] [다음에 즉시 수행할 작업]

## ⚠️ Risks & Blockers
- [차단 요소 또는 주의가 필요한 아키텍처적 결정 사항]
```

### 📂 Task Detail (`backlog/tasks/TASK-XXX.md`)
```markdown
---
id: TASK-XXX
status: [planned|in_progress|blocked|done]   # 진행 상태 축 — 판정 근거가 있을 때만 기재
created_at: YYYY-MM-DD
provenance: [migrated-legacy]                # (선택) 출처 축 — 이 task 가 어디서 왔는가
---
# [Task Title]

## 📝 Description
[작업의 정의 및 범위]

## 🛠️ Implementation Log
- [YYYY-MM-DD]: [수행 내용 요약]

## ✅ Outcome
[완료 시 결과물 또는 검증 결과]
```

#### 두 축을 섞지 않는다 (v1.0.0 §2.39)

`status` 는 **진행 상태**만 담고, 어휘는 `planned` / `in_progress` / `blocked` / `done`
넷으로 고정한다 (정본: `core/global_workflow_standard.md`, 코드 단일 출처:
`workflow_kit.common.project_docs.TASK_STATUSES`).

- **판정 근거가 없으면 `status` 를 쓰지 않는다.** 비워 두면 state builder 가
  `unknown_status_items` 에 `<ID>: <미기재>` 로 드러낸다. 근거 없이 `planned` 로 적는 것도
  판정이며, 이미 끝난 작업을 "아직 시작 안 함" 으로 기록하는 거짓이 된다.
- **"어디서 왔는가" 는 `provenance` 로 적는다.** `migrate_active_to_appendonly.py` 가
  어휘 밖의 `status: recorded` 를 쓰던 것이 이 경우다 — 그 값이 뜻한 것은 진행 상태가
  아니라 "legacy `work_backlog.md` 에서 이관됐고 진행 상태는 모른다" 는 출처 사실이었다.
  builder 는 그 값을 몰라 세 목록 어디에도 넣지 못했고, daily index fallback 이 "어느
  목록에도 없으니 done" 으로 되살려 **미완료 3건을 완료로 보고**했다.
- 자동화 도구는 `status` 를 **추측해서 채우지 않는다**. 근거를 가진 경우(예: 발행된 릴리스
  노트에서 이관한 entry)에만 쓰고, 나머지는 사람이 근거를 확인해 채운다.

### 📂 Daily Backlog Index (`backlog/YYYY-MM-DD.md`)
```markdown
# YYYY-MM-DD Branch Work Backlog

- Purpose: Link task detail files for one working day.
- Status: in_progress
- Updated: YYYY-MM-DD

## Tasks

- TASK-XXX Task title: `./tasks/YYYY-MM-DD_TASK-XXX.md`
```

- `backlog/tasks/*.md` is the source of truth for detailed task state.
- `backlog/YYYY-MM-DD.md` is a tracked lightweight index. Keep it small and link-oriented.
- On merge conflicts, rebuild the daily index from task links and resolve detailed state in each task file.

### 📂 Daily Backlog Index — v0.14.0+ layout (append-only)
```markdown
# Backlog Index — YYYY-MM-DD

- 문서 목적: 해당 날짜의 작업 항목(task) SSOT link 모음.
- 관련 문서: [./tasks/TASK-XXX.md](./tasks/TASK-XXX.md)

## Tasks

- **TASK-YYYY-MM-DD-001** [🔧 release] v0.13.3 — SemVer patch, Phase 13 AC4+ close-out
  - path: `backlog/tasks/TASK-YYYY-MM-DD-001.md`
  - source: `[[release/v0.13.3/backlog/2026-07-09.md]] {#release-v0-13-3}`
- **TASK-YYYY-MM-DD-002** [🔧 release] v0.13.2 — SemVer patch, Phase 13 AC3 close-out
  - path: `backlog/tasks/TASK-YYYY-MM-DD-002.md`
  - source: `[[release/v0.13.2/backlog/2026-07-09.md]] {#release-v0-13-2}`
```

`backlog-update --apply` 가 자동 생성하는 형태는 아래와 같다 (`source:` 는 legacy
migration 산출물에만 있고, 신규 task 는 `status:` 를 쓴다). `path:` 를 **markdown
link** 로 적는 이유는 `BacklogParser` 가 링크를 따라가 task 본문을 되찾기 때문이다 —
백틱만 쓰면 index 는 있는데 본문을 못 읽는 상태가 된다.

```markdown
- **TASK-2026-07-22-main-001** [release] v1.0.1 — 예시 작업
  - path: [`./tasks/TASK-2026-07-22-main-001.md`](./tasks/TASK-2026-07-22-main-001.md)
  - status: in_progress
```

**task ID 형식**: `TASK-<date>[-<branch-slug>]-<NNN>` (정본 패턴은
`workflow_kit.common.project_docs.TASK_ID_PATTERN` 단일 출처). 순번을 *브랜치 안에서만*
매기므로 두 브랜치가 같은 날 동시에 작업해도 겹치지 않고, 아카이브로 합쳐진 뒤에도
전역 유일하다. slug 없는 `TASK-2026-07-20-001` 은 branch-scoped 이전의 legacy 이며
같은 패턴으로 계속 인식된다.

### 📂 Per-Task SSOT — v0.14.0+ layout
```markdown
---
id: TASK-YYYY-MM-DD-NNN
status: planned | in_progress | done | blocked
created_at: YYYY-MM-DD
source_anchor: <legacy work_backlog anchor>
source_path: <legacy raw_path>
kind: release | session | generic
---

# TASK-YYYY-MM-DD-NNN — <title>

## 📝 Description
- 출처: `[[legacy/raw_path]] {#legacy-anchor}` (legacy work_backlog.md inline section)
- 분류: `<kind>`
- 작성일: YYYY-MM-DD

## 🛠️ Implementation / Content
<본문 — legacy entry 의 inline 본문 보존>

## ✅ Outcome
- v0.14.0 migration 으로 per-task SSOT 로 분리됨.
```

### 📂 Per-Session File — v0.14.0+ layout (was `session_handoff.md`)
```markdown
# Session — YYYY-MM-DD / <topic>

- 문서 목적: 특정 세션의 단기 메모리 (영구 보존은 wiki/topics/ 와 함께).
- 날짜: YYYY-MM-DD
- 주제: <session_analysis / audit_session / audit_follow_up / generic>
- 출처: `[[legacy/raw_path]] {#anchor}`
- 상태: stable

## 📋 Session Summary
<session 1-line summary>

## 🛠️ Detail
<session 본문>

## ✅ Outcome
- v0.14.0 migration 으로 per-session 파일로 분리됨.
```

### 📂 State.json — read-only snapshot (v1.0.0+ branch-scoped)
```json
{
  "schema_version": "1",
  "source_of_truth": {
    "project_profile_path": "docs/PROJECT_PROFILE.md",
    "session_handoff_path": "ai-workflow/memory/active/<branch>/sessions/",
    "work_backlog_index_path": "ai-workflow/memory/active/<branch>/backlog/",
    "daily_backlog_dir": "ai-workflow/memory/active/<branch>/backlog/",
    "tasks_dir": "ai-workflow/memory/active/<branch>/backlog/tasks/",
    "sessions_dir": "ai-workflow/memory/active/<branch>/sessions/"
  },
  "session": {
    "in_progress_items": [],
    "blocked_items": [],
    "recent_done_items": []
  }
}
```

**본 layout 결정의 동기**: sub-agent 2개+ 동시 fan-out 시 `state.json.recent_done_items` / `work_backlog.md` 의 3-way merge conflict 를 해소. 신규 layout 에서는 mutable 공유 파일이 `state.json` 단 1개 (rebuild race only), 나머지는 append-only 또는 자기 소유 파일. 자세한 분석: [`../ai-workflow/memory/active/README.md`](../ai-workflow/memory/active/README.md).

### 📂 Branch-scoped layout (v1.0.0+)

작업 상태는 **브랜치마다 물리적으로 분리**된다. 여러 브랜치/에이전트가 동시에 일해도
daily index / task 번호 / `state.json` 이 서로를 덮어쓰지 않는다.

```
ai-workflow/memory/
├── active/<branch>/          ← state.json, backlog/, sessions/  (main 도 동일)
├── archived/<branch>/        ← 종료된 브랜치 (.archived.json 메타 동반)
├── archive/YYYY-MM-DD/       ← R8 freeze (별개 개념 — 이름이 비슷하니 혼동 주의)
└── release/<version>/        ← release cycle 아카이브
```

- **공유(브랜치 무관)**: `PROJECT_PROFILE.md` / `PURPOSE.md` / `*_assessment.md` /
  `state.json.template` / `memory_index/`. `PROJECT_PROFILE.md` 가 `active/` 직속에 있어야
  경로 해석(`workflow_memory_dir` → `active/`)이 성립한다.
- **task ID**: `TASK-<date>-<slug>-<NNN>`. 순번을 *브랜치 안에서만* 매기므로 동시 생성해도
  겹치지 않고, 아카이브로 합쳐진 뒤에도 전역 유일하다.
- **자동 아카이브**: `active/<branch>/` 가 있는데 git 에 그 브랜치가 없으면 종료로 보고
  `archived/<branch>/` 로 옮긴다(역방향 점검 — hook 은 브랜치 삭제를 못 잡는다). 고아
  디렉터리가 구조적으로 생길 수 없다. 도구는 commit/push 를 하지 않으므로 **protected main
  과 호환**되며, 작업 브랜치에서 실행해 그 PR 에 실어 보낸다(piggyback).
- **집계는 파일이 아니라 뷰**: dashboard 가 `active/*/state.json` 을 모두 스캔해 합친다.
  main 전용 집계 파일이 없으므로 merge 마다 갱신할 대상 자체가 없다.
- **legacy fallback**: 경로 helper 는 branch-scoped 가 없고 legacy(`active/backlog/`)가 있으면
  legacy 를 반환한다. 미마이그레이션 저장소도 깨지지 않고 신규 생성만 수렴한다.
- 도구: `tools/migrate_memory_to_branch_scoped.py`, `tools/archive_branch_memory.py`.

**Deprecation timeline** (ADR-003 1st/2nd cycle):
- v0.14.0 (1st cycle 시작): 신규 layout 활성 + `work_backlog.md` fallback 유지
- v0.14.5 (2nd cycle 시작): `work_backlog.md` 는 `--legacy-memory` flag 있을 때만 read
- v0.15.0 (2nd cycle 종결): `work_backlog.md` / `.bak` drop

## 3. 에이전트 행동 지침

- **세션 종료 절차는 [`core/global_workflow_standard.md`](./core/global_workflow_standard.md) §8 을 따른다 — `memory 갱신 → commit → push` 순서**. 별도 turn "memory 에 적어줘" 분리 ❌. handoff/state.json/work_backlog 갱신을 commit 직전 같은 turn 에 묶어서, push 시점에 협업자가 memory 변경을 함께 볼 수 있도록 한다.
- 새로운 작업 시작 시 `tasks/` 폴더에 템플릿 기반의 신규 파일을 생성하십시오.
- 날짜별 백로그에는 신규 task 파일 링크만 추가하고, 긴 상세 기록은 task 파일에 남기십시오.
- 상태 업데이트 시 자연어 서술보다는 불렛 포인트와 상태 키워드를 우선하십시오.

## 4. Freeze 규칙 (R8, v0.6.1+)

- **freeze 시점**: session 종료 시 자동 (또는 수동 `memory-freeze` 스킬)
- **freeze 단위**: per-session (1일). `archive/YYYY-MM-DD/` 하위에 생성
- **freeze 내용**: `active/` 내 모든 `.md`, `.json`, `.template` 파일
- **freeze 동작**: COPY (NOT move). active/ 파일은 유지 (다음 세션에서 재사용)
- **immutability**: freeze 후 archive/ 는 읽기 전용 raw source (R9)
- **marker**: `.frozen` YAML 파일 (frozen_at, source, files 포함)
- **중복 freeze**: 같은 날짜 이미 frozen → skip (immutability 보존)
- **wiki ingest**: wiki-ingest 는 `archive/YYYY-MM-DD/` 만 source 로 사용 (R9). `active/` ingest 금지.
