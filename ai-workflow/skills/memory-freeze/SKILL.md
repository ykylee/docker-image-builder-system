# Memory-Freeze Skill (R8)

- 문서 목적: session 종료 시 `ai-workflow/memory/active/` 의 mutable 상태를 `ai-workflow/memory/archive/YYYY-MM-DD/` 로 freeze. R8 (Memory Raw Freeze) 규칙 구현.
- 범위: freeze 트랜지션, `.frozen` 마커, atomic rename, archive 무결성
- 대상 독자: AI agent, workflow 설계자
- 상태: stable (v1.0.1+, 실행 계약 smoke 6/6 — `../../tests/check_memory_freeze_skill.py`)
- 최종 수정일: 2026-07-22
- 관련 문서: `../../.omo/plans/v0.6.1-plus-memory-raw-ops-design.md` §4 R8, `../../MEMORY_GOVERNANCE.md`

## 1. 목적

session 종료 시점에 현재 `active/` 의 mutable workflow state 를 `archive/YYYY-MM-DD/` 로 immutable freeze. freeze 후 archive/ 는 읽기 전용 raw source (R9). freeze 가 wiki-ingest 의 source 가 됨.

## 2. 연결 스펙

- R8 규칙: `v0.6.1-plus-memory-raw-ops-design.md` §4 R8
- R10 Freeze Lint: `../../tests/check_memory_freeze_lint.py`

## 3. 실행

```bash
python3 scripts/run_memory_freeze.py
```

## 4. 예상 입력

- `--active-root` (default: `ai-workflow/memory/active/`)
- `--archive-root` (default: `ai-workflow/memory/archive/`)
- `--freeze-date` (default: 오늘 날짜 ISO, YYYY-MM-DD)

## 5. 예상 출력

- `archive_path`: 생성된 archive 디렉토리 경로
- `frozen_files`: freeze 된 파일 목록
- `file_count`: freeze 된 파일 수
- `status`: success / skipped (이미 freeze 된 날짜) / error

## 6. 권한 경계

- read: `active/` 내 모든 파일
- write: `archive/YYYY-MM-DD/` 생성 + `.frozen` 마커
- NEVER: `active/` 파일 삭제 (freeze = copy, NOT move)
- NEVER: `archive/` 기존 freeze 수정 (immutable)

## 7. freeze 프로토콜

1. `archive/YYYY-MM-DD/` mkdir
2. `active/` 내 모든 `.md` `.json` 파일을 `archive/YYYY-MM-DD/` 로 copy
3. `.frozen` 마커 작성 (YAML 형식, `frozen_at`, `source`, `files`)
4. stdout 에 archive 경로 + 파일 목록 출력
5. 이미 freeze 된 날짜면 skip (기존 freeze 는 immutable)


## v0.6.5 Stage Completion

본 skill 의 출력은 v0.6.5 부터 v0.6.4 의 [Stage Gate Pattern](../../../core/stage_gate_pattern.md) 의 `stage_completion` 필드를 포함한다.

| Field | 값 |
|---|---|
| `stage_name` | `memory-freeze` |
| `next_stage` | `(workflow end)` |
| `approval_actor` | `user` mandatory (state 문서 영향) |
| `approval_timestamp` | ISO 8601 |

자세한 spec: [`core/stage_gate_pattern.md`](../../../core/stage_gate_pattern.md), [`core/output_schema_guide.md §3.4`](../../../core/output_schema_guide.md).
