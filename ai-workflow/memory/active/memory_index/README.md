<!-- standard-ai-workflow-kit: v0.15.19-beta -->

# Memory Index (ADR-005 Phase 1)

- 문서 목적: ADR-005 Memora-inspired Memory Index 의 *seed layer* 디렉토리. session-start / doc-sync / backlog-update 의 opt-in retrieval wiring (v0.11.22+ Phase 3b/c/d) 의 실 데이터 보존. Phase 13 AC2 telemetry sidecar (v0.13.1+).
- 범위: `entries/` + `telemetry/` 디렉토리 + 본 README + 스키마. entries 1 file = 1 MemoryEntry. telemetry 1 line = 1 retrieval call.
- 대상 독자: AI agent (memory retrieval), maintainer
- 상태: stable (seed: 2026-07-20, telemetry wired: 2026-07-20 v0.15.19)
- 최종 수정일: 2026-07-20
- 관련 문서:
  - [ADR-005](../../../../workflow-source/docs/architecture/ADR-005-memora-inspired-memory-index.md) (architecture spec, 표준 source 참고)
  - [`../../ai-workflow/workflow_kit/common/schemas/memory_index.py`](../../../../workflow_kit/common/schemas/memory_index.py) (Pydantic schema)
  - [`../../../../ai-workflow/workflow_kit/common/state/memory_index.py`](../../../../workflow_kit/common/state/memory_index.py) (helper module)

## 1. 디렉토리 layout

```
memory_index/
├── README.md          # 본 문서
├── entries/
│   ├── MEM-YYYY-MM-DD-001.json
│   ├── MEM-YYYY-MM-DD-002.json
│   └── ...
└── telemetry/         # v0.13.1+ Phase 13 AC2 (memory_index 활용도 측정)
    ├── .gitkeep
    └── events.jsonl   # opt-in retrieval 호출 누적 (1 line 1 event)
```

- `entries/*.json` 1 file = 1 MemoryEntry (ADR-005 §2).
- id 형식: `MEM-YYYY-MM-DD-NNN` (NNN = 같은 날짜에서 001~ 단조 증가).
- 신규 entry 생성: helper `save_memory_entry(<workspace_root>, <entry>)` (Pydantic validate + atomic_write_json) 사용 권장.
- `telemetry/events.jsonl` 1 line = 1 retrieval 호출 (Phase 13 AC2 telemetry sidecar).
  schema: `MemoryIndexTelemetryEvent` (`workflow_kit/common/schemas/memory_index.py`).
  자동 emit: 3 skill (session-start / doc-sync / backlog-update) + dispatcher `memory-index-query`.
  read: `summarize_telemetry(workspace_root)` 또는 `cmd_memory_index_telemetry` subcommand.

## 2. Seed entries (2026-07-20)

본 디렉토리는 TASK-114 본 세션 종합 RELEASE_NOTES 의 핵심 마일스톤 7개를 seed 한다 (frontend rewrite + M4.5 + source archive chunked + RFC 7233 + Postgres multi-runner + PROJECT_PROFILE baseline + migrate.ts CLI + TASK-114 종합). retrieval cue 다양성 보장을 위해 7개 seed entry 작성.

| id | primary_abstraction (요약) | source |
|---|---|---|
| `MEM-2026-07-20-001` | Frontend rewrite Svelte → React 7-PR 시리즈 TASK-088~094 | `docs/operations/single-port-react-2026-07-08.md` 외 4 |
| `MEM-2026-07-20-002` | M4.5 8-PR Group A~G + 디자인 토큰 단일화 TASK-095~101 | `docs/operations/admin-pages-react-2026-07-08.md` 외 4 |
| `MEM-2026-07-20-003` | Source archive chunked split + RFC 7233 Content-Range TASK-106~110 | `docs/operations/source-archive-chunked-2026-07-20.md` 외 3 |
| `MEM-2026-07-20-004` | Postgres multi-runner 운영 검증 TASK-082 + cross-backend TASK-113 | `docs/operations/multi-runner-claim-postgres-2026-07-06.md` 외 4 |
| `MEM-2026-07-20-005` | PROJECT_PROFILE §3 baseline 양축 동기화 (memory/postgres 동등) TASK-102 | `docs/PROJECT_PROFILE.md` 외 2 |
| `MEM-2026-07-20-006` | scripts/migrate.ts standalone CLI + 권고 scripts/db-migrate.sh TASK-103 | `scripts/db-migrate.sh` 외 3 |
| `MEM-2026-07-20-007` | TASK-114 본 세션 종합 RELEASE_NOTES + 운영 가이드 인덱스화 | `docs/RELEASE_NOTES-2026-07-20.md` 외 3 |

각 entry 의 `cue_anchors[]` 는 LLM retrieval 시 anchor match 의 진입점. `value_digest` 는 1줄 preview. `source_paths` 는 본문 원본 위치. `mentioned_in` 은 본 entry 를 참조하는 영구 문서/ADR/wiki 경로.

## 3. 운영 규칙

- **생성**: 새 session 또는 새 concept 발견 시 helper 로 entry 1개 생성.
  ```python
  from workflow_kit.common.schemas.memory_index import MemoryEntry, MergeState
  from workflow_kit.common.state.memory_index import save_memory_entry
  from datetime import datetime, timezone
  e = MemoryEntry(id="MEM-2026-07-20-008", ..., created_at=datetime.now(timezone.utc))
  save_memory_entry(Path("/Users/yklee/repos/docker-image-builder-system"), e)
  ```
- **merge**: ADR-005 §4 canonical merge. `apply_memory_merge(workspace_root, MemoryMergeRequest(source_ids=[...], apply=False))` 으로 dry-run 후 `--apply`.
- **validate**: `validate_memory_index(workspace_root)` 으로 주기적 검증 (duplicate id / duplicate primary_abstraction / source_paths 중복).
- **retrieval**: `query_memory_index_for_dispatcher(workspace_root, query_tokens=[...])` — session-start / doc-sync / backlog-update 의 opt-in wiring 의 실 호출.

## 4. retrieval wiring (어떤 skill 이 어떻게 쓰는가)

| skill | flag | behavior |
|---|---|---|
| `session-start` (Phase 3b) | `--memory-index-dir` + `--memory-query-tokens` 둘 다 지정 | 진입 시 memory_index 에서 query → hints emit. 부재 시 silent skip (main flow 방해 ❌). |
| `doc-sync` (Phase 3c) | 동일 | doc 갱신 시 memory_index query 후 영향 concept cross-ref. |
| `backlog-update` (Phase 3d) | 동일 | backlog entry 추가 시 memory_index query 후 관련 entry link. |

opt-in 이므로 **flag 미지정 시 silent skip** — main flow 에 영향 없음. wiring 의 목적은 *value-add* 이지 *block* 이 아님.

## 5. P0-3 self-dogfood 노트

TASK-115 reconcile (2026-07-20) 의 follow-up 항목 중 P0-3 (memory_index/ 디렉토리 실재성) 후보 해소. 본 commit 으로:

1. 디렉토리 layout 보강 (`entries/` + `telemetry/` 포함)
2. 본 README 작성 (schema + 운영 규칙 + retrieval wiring 명세)
3. seed entry 7개 작성 (TASK-114 의 핵심 milestone 7개)
4. helper module 의 동작 검증 (id pattern, schema validation, atomic write — 0 issues)
5. state.json memory_entries 필드에 7개 id 등록 (TASK-117 reconcile)

이후의 wiring 호출은 silent skip → 실 retrieval 으로 전환. P1-3 (drift 사례 분류) 의 seed data 로도 활용 가능.

## 다음에 읽을 문서
- 표준 source: [ADR-005](../../../../workflow-source/docs/architecture/ADR-005-memora-inspired-memory-index.md)
- 표준 source schema: [../../../../workflow-source/workflow_kit/common/schemas/memory_index.py](../../../../workflow-source/workflow_kit/common/schemas/memory_index.py)
- 표준 source helper: [../../../../workflow-source/workflow_kit/common/state/memory_index.py](../../../../workflow-source/workflow_kit/common/state/memory_index.py)
- 본 프로젝트의 종합 인덱스: [../../../../docs/RELEASE_NOTES-2026-07-20.md](../../../../docs/RELEASE_NOTES-2026-07-20.md)
