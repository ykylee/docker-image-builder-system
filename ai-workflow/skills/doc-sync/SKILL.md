<!-- standard-ai-workflow-kit: v1.0.0-beta -->

# Doc-Sync Skill

- 문서 목적: `doc-sync` skill 의 역할과 구현 진입점을 정리한다.
- 범위: 목적, 연결 스펙, 예상 입력/출력, 권한 경계, 구현 메모
- 대상 독자: skill 구현자, AI agent 설계자, 운영자
- 상태: stable (v0.11.19 stable 승격)
- 최종 수정일: 2026-04-26
- 관련 문서: `../../core/doc_sync_skill_spec.md`, `../../core/workflow_skill_catalog.md`, `../../core/workflow_agent_topology.md`, `../../core/workflow_mcp_candidate_catalog.md`

## 1. 목적

변경 파일 목록을 바탕으로 함께 확인하거나 갱신해야 할 기준 문서, 허브 문서, 상태 문서를 추천하고 `session_handoff.md` 에 자동 반영한다.

## 2. 연결 스펙

- 상세 스펙: [../../core/doc_sync_skill_spec.md](../../core/doc_sync_skill_spec.md)
- 카탈로그: [../../core/workflow_skill_catalog.md](../../core/workflow_skill_catalog.md)

## 3. 예상 입력

- `project_profile_path`
- `changed_files`
- 선택적으로 `baseline_documents`, `hub_documents`, `session_handoff_path`, `latest_backlog_path`, `change_summary`

## 4. 예상 출력

- `impacted_documents`
- `hub_update_candidates`
- `stale_warnings`
- `reasoning_notes`
- `recommended_review_order`
- `follow_up_actions`

## 5. 권한 경계

- 읽기 추천 및 제한적 쓰기(apply) 단계
- `--apply` 사용 시 `session_handoff.md` 의 특정 섹션만 수정 허용
- 원본 프로젝트 문서의 자동 수정은 금지

## 6. 구현 메모

- 변경 파일을 문서/비문서로 분류
- runbook, handoff, backlog, 허브 문서를 서로 다른 후보 그룹으로 다룸
- 허브 stale 가능성과 결과 기록 누락 가능성을 별도 경고로 분리
- `ai-workflow/` 경로는 workflow 메타 레이어로 보고, 프로젝트 문서 탐색 후보에서는 기본적으로 제외한다.

## 7. 스킬 실행

- 실행 스크립트: [scripts/run_doc_sync.py](./scripts/run_doc_sync.py)
- 실행 예시 (추천 확인):
```bash
python3 skills/doc-sync/scripts/run_doc_sync.py \
  --project-profile-path docs/PROJECT_PROFILE.md \
  --session-handoff-path ai-workflow/memory/active/sessions \
  --changed-file app/main.py
```
- 실행 예시 (자동 반영):
```bash
python3 skills/doc-sync/scripts/run_doc_sync.py \
  --project-profile-path docs/PROJECT_PROFILE.md \
  --session-handoff-path ai-workflow/memory/active/sessions \
  --changed-file app/main.py \
  --apply
```

## 8. 현재 상태

- Beta 단계: 읽기 추천 및 제한적 쓰기 기능 지원
- `--apply` 플래그 사용 시 `session_handoff.md` 의 `다음에 읽을 문서` 섹션 자동 갱신
- 추천된 후속 조치(`follow_up_actions`)를 `session_handoff.md` 운영 메모에 추가
- 프로젝트별 문서 구조는 project profile 을 기준으로 해석함

## 9. v0.11.22+ Phase 3c — memory_index retrieval wiring (opt-in)

doc-sync 가 ADR-005 memory_index 의 retrieval 3-tuple (cue exact → BM25 fallback →
linked expansion) 결과를 *선택적* 으로 받아 output 의 `memory_index_query_output` field
에 emit 한다. 디스크 변경 ❌ (read-only retrieval). session-start 와 동일 패턴.

### 사용법

```bash
python3 skills/doc-sync/scripts/run_doc_sync.py \
  --project-profile-path <PROJECT_PROFILE.md> \
  --changed-file <path1> --changed-file <path2> \
  --memory-index-dir <ws>/ai-workflow/memory/active/memory_index \
  --memory-query-tokens "adr,memora,retrieval"
```

v0.15.21+ 부터 두 flag 는 **override** 다. flag 부재 시에도 workspace 표준
`ai-workflow/memory/active/memory_index` dir 이 존재하면 retrieval 이 **자동 활성**
(default query token `doc,sync,workflow`) 되어 telemetry source `doc-sync` 가 emit 된다
(Phase 13 AC2 source 다양성 ≥ 4 수렴). memory_index dir 이 없으면 zero-risk skip
(기존 caller 정합). flag 를 명시하면 dir/token override.

### Output 추가 field

`DocSyncOutput.memory_index_query_output` (optional, `dict[str, Any] | None`):

- `selected_ids` / `cue_hits` / `bm25_hits` / `expansion_hits` / `expansion_depth_used`
- `source_context`

부재 시 `None` (backward compat).

### 후속

- `backlog-update` skill 의 wiring (Phase 3d, 별도 release).
- ADR-006 retrospective 자리 (Phase 3d 완료 후).

## 다음에 읽을 문서

- skills 허브: [../README.md](../README.md)
- ADR-005 memory_index: [../../../docs/architecture/ADR-005-memora-inspired-memory-index.md](../../../docs/architecture/ADR-005-memora-inspired-memory-index.md)
- 상세 스펙: [../../core/doc_sync_skill_spec.md](../../core/doc_sync_skill_spec.md)
