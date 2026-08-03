<!-- standard-ai-workflow-kit: v1.0.0-beta -->

# Backlog-Update Skill

- 문서 목적: `backlog-update` skill 의 역할과 구현 진입점을 정리한다.
- 범위: 목적, 연결 스펙, 예상 입력/출력, 권한 경계, 구현 메모
- 대상 독자: skill 구현자, AI agent 설계자, 운영자
- 상태: stable (v0.11.20 stable 승격)
- 최종 수정일: 2026-07-22
- 관련 문서: `../../core/backlog_update_skill_spec.md`, `../../core/workflow_skill_catalog.md`, `../../core/workflow_agent_topology.md`

## 1. 목적

날짜별 backlog 에 새 작업 항목을 생성하거나 기존 작업 항목의 상태 갱신 초안을 만든다.

## 2. 연결 스펙

- 상세 스펙: [../../core/backlog_update_skill_spec.md](../../core/backlog_update_skill_spec.md)
- 카탈로그: [../../core/workflow_skill_catalog.md](../../core/workflow_skill_catalog.md)

## 3. 예상 입력

- `project_profile_path`
- `task_brief`
- 조건부로 `daily_backlog_path`, `target_date`, `task_id`
- 선택적으로 `work_backlog_index_path`, `session_handoff_path`, `owner`, `affected_documents`, `validation_result`
- `kind` (`release` | `session` | `generic`, default `generic`) — task SSOT frontmatter 의 `kind` 이자 daily index 의 `[kind]` marker

## 4. 예상 출력

- `operation_type`
- `target_backlog_path`
- `task_id`
- `draft_entry`
- `status_recommendation`
- `fields_requiring_confirmation`
- `warnings`

### 4.1 `--apply` 산출물 layout (v0.14.0+ append-only)

- `backlog/tasks/TASK-<date>[-<branch-slug>]-<NNN>.md` — **본문의 SSOT**.
  frontmatter 6 key (`id` / `status` / `created_at` / `source_anchor` /
  `source_path` / `kind`) 필수.
- `backlog/<date>.md` — **link 모음**. task 본문을 인라인하지 않는다. 같은 task 를
  다시 apply 하면 해당 block 만 교체된다 (중복 ❌, 전체 재작성 ❌).
- `.bak` 파일은 만들지 않는다 (v0.15.0 에서 폐기된 개념).

규약은 `MEMORY_GOVERNANCE.md` §2 가 정본이고,
`tests/check_backlog_update_layout.py` 가 산출물을 그 규약과 대조한다.

## 5. 권한 경계

- 초안 생성과 갱신 제안 중심
- **`--apply` 없이는 저장소에 아무것도 쓰지 않는다** (state cache 재생성 포함)
- 검증 없는 `done` 확정 금지
- 존재하지 않는 task 를 사실처럼 갱신 금지
- `--apply` 를 주면 날짜별 backlog, backlog index, handoff 상태 목록을 좁은 범위에서 직접 갱신할 수 있다.

## 6. 구현 메모

- 신규 생성과 기존 갱신을 엄격히 분리
- backlog 경로는 프로젝트 프로파일 기준으로 해석
- handoff/index 후속 갱신은 메모로만 남기고 별도 단계로 분리
- backlog 또는 handoff 상태를 갱신한 뒤에는 source-of-truth 문서가 준비된 경우 `state.json` 을 자동 재생성하는 흐름을 기본 운영값으로 본다.

## 7. 예시 실행 (v0.11.20 stable 정합)

- 실행 스크립트: [scripts/run_backlog_update.py](./scripts/run_backlog_update.py)

```bash
# 기존 항목 갱신 (JSON 초안만 출력)
python3 skills/backlog-update/scripts/run_backlog_update.py \
  --project-profile-path examples/acme_delivery_platform/PROJECT_PROFILE.md \
  --daily-backlog-path examples/acme_delivery_platform/backlog/2026-04-18.md \
  --mode update \
  --task-id TASK-021 \
  --task-name "배송 상태 동기화 실패 대응 절차 문서 정리" \
  --task-brief "runbook 및 handoff 반영 상태를 점검했다." \
  --status in_progress

# --apply 로 backlog / index / handoff 까지 직접 반영
python3 skills/backlog-update/scripts/run_backlog_update.py \
  --project-profile-path examples/acme_delivery_platform/PROJECT_PROFILE.md \
  --daily-backlog-path examples/acme_delivery_platform/backlog/2026-04-18.md \
  --work-backlog-index-path examples/acme_delivery_platform/work_backlog.md \
  --session-handoff-path examples/acme_delivery_platform/session_handoff.md \
  --mode update \
  --task-id TASK-021 \
  --task-name "배송 상태 동기화 실패 대응 절차 문서 정리" \
  --task-brief "검증 대기 상태라 차단으로 되돌렸다." \
  --status blocked \
  --apply
```

- 현재 프로토타입은 backlog 파일을 직접 수정하지 않고 JSON 초안만 출력한다.
- `--apply` 를 주면 초안을 대상 backlog 파일에 반영하고, 가능한 경우 backlog index 와 handoff 상태 목록도 같이 동기화한다.

## 8. 현재 상태

- 읽기 전용 초안 생성 프로토타입 있음
- 신규 항목 생성과 기존 항목 갱신을 구분해 draft entry 와 경고를 출력할 수 있음
- `done` 상태는 검증 결과 없이 자동 확정하지 않음

## 9. v0.11.22+ Phase 3d — memory_index retrieval wiring (opt-in)

backlog-update 가 ADR-005 memory_index 의 retrieval 3-tuple (cue exact → BM25 fallback →
linked expansion) 결과를 *선택적* 으로 받아 output 의 `memory_index_query_output` field
에 emit 한다. 디스크 변경 ❌ (read-only retrieval). session-start / doc-sync 와 동일 패턴.

### 사용법

```bash
python3 skills/backlog-update/scripts/run_backlog_update.py \
  --project-profile-path <PROJECT_PROFILE.md> \
  --task-name "<name>" --task-brief "<brief>" \
  --memory-index-dir <ws>/ai-workflow/memory/active/memory_index \
  --memory-query-tokens "adr,memora,retrieval"
```

v0.15.21+ 부터 두 flag 는 **override** 다. flag 부재 시에도 workspace 표준
`ai-workflow/memory/active/memory_index` dir 이 존재하면 retrieval 이 **자동 활성**
(default query token `backlog,task,workflow`) 되어 telemetry source `backlog-update` 가
emit 된다 (Phase 13 AC2 source 다양성 ≥ 4 수렴). memory_index dir 이 없으면 zero-risk
skip (기존 caller 정합). flag 를 명시하면 dir/token override.

### Output 추가 field

`BacklogUpdateOutput.memory_index_query_output` (optional, `dict[str, Any] | None`):

- `selected_ids` / `cue_hits` / `bm25_hits` / `expansion_hits` / `expansion_depth_used`
- `source_context`

부재 시 `None` (backward compat).

### 후속

- v0.11.22 release 자체 (Phase 1~3d 묶음).
- ADR-006 retrospective 자리 (Phase 3d 완료 후 회고).

## 다음에 읽을 문서

- skills 허브: [../README.md](../README.md)
- 상세 스펙: [../../core/backlog_update_skill_spec.md](../../core/backlog_update_skill_spec.md)
- ADR-005 memory_index: [../../../docs/architecture/ADR-005-memora-inspired-memory-index.md](../../../docs/architecture/ADR-005-memora-inspired-memory-index.md)
