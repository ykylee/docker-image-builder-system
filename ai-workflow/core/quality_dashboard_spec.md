# Quality Dashboard Spec (v0.13.0)

- 문서 목적: `workflow_kit.workflow_kit_cli --command=dashboard` 가 emit 하는 5 panel snapshot 의 입력/출력 계약과 data shape 를 정의한다.
- 범위: panel 별 data source, field 정의, acceptance criteria, edge cases, drift detection
- 대상 독자: AI agent 설계자, dashboard consumer (release note 자동 emit, wiki sync), 운영자
- 상태: draft
- 최종 수정일: 2026-07-18
- 관련 문서:
  - [`./quality-dashboard-implementation-guide.md`](./quality-dashboard-implementation-guide.md) — wiki topic (구현 가이드)
  - [`./maturity_matrix.json`](./maturity_matrix.json) — Panel 1/2 의 data source
  - [`./workflow_kit/common/dashboard_data.py`](./workflow_kit/common/dashboard_data.py) — 구현 위치
  - [`./workflow_kit/workflow_kit_cli.py`](./workflow_kit/workflow_kit_cli.py) — `cmd_dashboard` 등록
  - [`./tests/check_quality_dashboard_v0_13_0.py`](./tests/check_quality_dashboard_v0_13_0.py) — smoke test

## 1. 목적

본 dashboard 는 Phase 13 (Operational Intelligence v1.0) 의 *sub-milestone v0.13.0* 으로, 운영자가 1 화면에서 다음을 한눈에 파악할 수 있도록 한다:

1. drift 발생 여부 + 누적 추세
2. skill / MCP maturity 분포 + promotion 진행도
3. memory_index 활용도
4. smoke 누적 + 실패 추세
5. release cycle 누적 (`state.json.session.recent_done_items` 시각화)

본 spec 은 wiki 의 [quality-dashboard-implementation-guide](../../ai-workflow/wiki/topics/quality-dashboard-implementation-guide.md) 가 *설계 가이드* 인 반면 *구현 계약* 으로, 본 spec 은 *충족해야 할* field shape 와 acceptance 조건을 명시한다.

## 2. CLI 사용법

```bash
# JSON snapshot (default)
python -m workflow_kit.workflow_kit_cli --command=dashboard --format=json

# markdown snapshot (wiki / release note 포함용)
python -m workflow_kit.workflow_kit_cli --command=dashboard --format=markdown

# 파일로 출력
python -m workflow_kit.workflow_kit_cli --command=dashboard --format=json --output=ai-workflow/dashboard/snapshot.json

# workspace override + option
python -m workflow_kit.workflow_kit_cli --command=dashboard \
    --workspace-root=/path/to/repo --recent-limit=3 --top-n=5
```

Flag:
| Flag | Default | 의미 |
|---|---|---|
| `--format` | `json` | `json` \| `markdown` |
| `--output` | (stdout) | emit file path |
| `--workspace-root` | (auto) | REPO_ROOT 자동 탐색 |
| `--recent-limit` | `5` | smoke_trend 의 release note 갯수 |
| `--top-n` | `10` | recent_releases 의 timeline 갯수 |

Exit code:
- `0` — success
- `2` — invalid args / exception

## 3. Snapshot shape (top-level)

```json
{
  "schema_version": "1.0",
  "tool_version": "v0.11.25-beta",
  "generated_at": "2026-07-09T01:30:00Z",
  "workspace_root": "/home/yklee/repos/standard_ai_workflow",
  "panels": { ... 5 panel dict ... }
}
```

| Field | Type | 비고 |
|---|---|---|
| `schema_version` | `str` | 본 spec version (semver Pydantic 아닌 plain str) |
| `tool_version` | `str` | `workflow_kit.__version__` loud fallback (ADR-003) |
| `generated_at` | `str` | UTC ISO 8601 `YYYY-MM-DDTHH:MM:SSZ` |
| `workspace_root` | `str` | 절대경로 |
| `panels` | `dict[str, dict]` | 5 panel 의 keyed dict |

## 4. Panel 1 — Drift Prevention Status

Data source: `workflow-source/core/maturity_matrix.json` + git HEAD commit

```json
{
  "guard_status": "unknown",
  "guard_cases": 6,
  "expected_cases": 6,
  "maturity_last_updated": "2026-07-09",
  "maturity_last_updated_source": "maturity_matrix.json",
  "harness_supported_count": 10,
  "head_commit_date": "2026-07-09",
  "last_updated_delta_days": 0,
  "silent_failing_cycles_count": 0,
  "phase": "Phase 12 (done, v0.15.20) → Phase 13 (planned, v1.0.0 stable 진입 후)"
}
```

| Field | Type | 비고 |
|---|---|---|
| `guard_status` | `Literal["unknown", "pass", "fail"]` | inline 실행은 v0.13.1 의 sync-maturity-matrix hook 에서 후속 |
| `guard_cases` | `int` | expected_cases 와 정합 (현 release 6) |
| `expected_cases` | `int` | `EXPECTED_DRIFT_GUARD_CASES` 상수 (=6) |
| `maturity_last_updated` | `str` (ISO date) | `maturity_matrix.json.last_updated` |
| `harness_supported_count` | `int` | `maturity_matrix.json.harnesses.supported` list length |
| `head_commit_date` | `str` (ISO date) | `git log -1 --format=%cd --date=short` |
| `last_updated_delta_days` | `int \| None` | maturity ↔ head 의 일수 차이 (drift indicator) |
| `silent_failing_cycles_count` | `int` | **Phase 13 AC1 north-star metric** — 0 으로 수렴 목표 |

## 5. Panel 2 — Maturity Distribution

Data source: `maturity_matrix.json.{skills, mcp_tools, transports, harnesses, milestones}`

```json
{
  "skills": {"total": 12, "stable": 12, "beta": 0, "alpha": 0, "prototype": 0, "by_stage": {"stable": 12}},
  "mcp_tools": {"total": 12, "stable": 8, "beta": 4, "alpha": 0, "prototype": 0, "by_stage": {"stable": 8, "beta": 4}},
  "transports": {"stdio_sdk": "stable", "jsonrpc_bridge": "stable"},
  "harnesses": {"supported": 10, "supported_names": ["codex", "opencode", ...]},
  "milestones": {"total": 12, "done": 11, "in_progress": 1, "planned": 0, "by_status": {"done": 11, "in_progress": 1}}
}
```

각 stage distribution 의 field:
- `total`: dict value count
- `stable` / `beta` / `alpha` / `prototype`: stage 별 count
- `by_stage`: `dict[str, int]` — 전체 stage 분포 (stable 외 stage 추가 시 자동 흡수)

## 6. Panel 3 — Memory Index Utilization

Data source: `ai-workflow/memory/active/memory_index/entries/MEM-*.json`

```json
{
  "entries_total": 7,
  "entries_by_merge_state": {"active": 7},
  "cue_anchors_top": [{"anchor": "P0", "count": 2}, ...],
  "cue_anchors_unique": 40,
  "cumulative_timeline": [{"date": "2026-07-09", "count": 7}],
  "first_entry_date": "2026-07-09",
  "last_entry_date": "2026-07-09",
  "retrieval_hit_rate": 0.0,
  "retrieval_hit_rate_source": "pending_phase_13_ac2_telemetry"
}
```

| Field | Type | 비고 |
|---|---|---|
| `entries_total` | `int` | `MEM-*.json` file 갯수 (parse 성공 기준) |
| `entries_by_merge_state` | `dict[str, int]` | `merge_state` field 분포 |
| `cue_anchors_top` | `list[{anchor: str, count: int}]` | 상위 20 anchor |
| `cue_anchors_unique` | `int` | unique anchor 갯수 |
| `cumulative_timeline` | `list[{date: str, count: int}]` | 일자별 누적 entry 갯수 |
| `first_entry_date` / `last_entry_date` | `str` (ISO date) | `created_at[:10]` 의 min/max |
| `retrieval_hit_rate` | `float` | **Phase 13 AC2** — 현 release 0 (telemetry 미구현) |
| `retrieval_hit_rate_source` | `str` | `pending_phase_13_ac2_telemetry` marker |

## 7. Panel 4 — Smoke Trend

Data source: `workflow-source/releases/Beta-v*.md` 의 본문 regex parse + `workflow-source/tests/check_*.py` file count

```json
{
  "cumulative_total": 40,
  "cumulative_pass": 40,
  "cumulative_pass_rate": 1.0,
  "recent_releases": [
    {"version": "Beta-v0.11.25", "pass": 40, "total": 40, "release_note_path": "workflow-source/releases/Beta-v0.11.25.md"},
    {"version": "Beta-v0.11.24", "pass": 40, "total": 40, "release_note_path": "workflow-source/releases/Beta-v0.11.24.md"}
  ],
  "smoke_files_count": 170
}
```

| Field | Type | 비고 |
|---|---|---|
| `cumulative_total` / `cumulative_pass` | `int` | 가장 최근 release note 의 `**N/N PASS**` parse 결과 |
| `cumulative_pass_rate` | `float` (0.0 ~ 1.0) | pass / total |
| `recent_releases` | `list` | `--recent-limit` 만큼 (default 5), semver-natural sort (newest first) |
| `smoke_files_count` | `int` | `tests/check_*.py` 의 실제 file 갯수 (cross-check) |

Sort key: `Beta-v0.9.6` < `Beta-v0.10.0` (semver-natural, lexicographic 함정 회피).

## 8. Panel 5 — Recent Release Cycle

Data source: `ai-workflow/memory/active/state.json.session.recent_done_items`

```json
{
  "items_total": 60,
  "top_n": 10,
  "timeline": [
    {"index": 0, "preview": "2026-07-09 (audit-follow-up): ... (≤120 char + ellipsis)", "length": 5420},
    ...
  ]
}
```

| Field | Type | 비고 |
|---|---|---|
| `items_total` | `int` | `recent_done_items` 전체 길이 |
| `top_n` | `int` | `--top-n` 값 (default 10) |
| `timeline` | `list` | preview (≤120 char) + length |

## 9. Acceptance Criteria

본 spec 의 acceptance 는 구현 가이드 §4 정합:

| AC | 조건 | 검증 위치 |
|---|---|---|
| AC1 | `dashboard --json` 가 5 panel 의 data 를 1 dict 로 emit | smoke test case 1/2 |
| AC2 | 5 panel 모두 *실제 data* (fixture 아님) 기반 | smoke test case 1 (각 panel 별 count > 0) |
| AC3 | release --apply 시 dashboard snapshot 자동 갱신 | v0.13.1 sub-milestone (현 release 외) |
| AC4 | snapshot 의 `last_updated ≤ release commit date` | `last_updated_delta_days >= 0` (현 release 0) |

추가 smoke test 정합 (check_quality_dashboard_v0_13_0.py):
- 5 panel shape verify
- `guard_cases == expected_cases == 6`
- `skills.stable >= 1`, `mcp_tools.total >= 1`, `harnesses.supported >= 1`
- `memory_index.entries_total >= 1`
- `smoke.cumulative_pass > 0` (실제 release note parse 결과)
- `recent_releases.items_total >= 1`
- CLI `--format=json` 정상 동작 + valid JSON
- CLI `--format=markdown` 정상 동작 + 5 panel 헤더 포함
- CLI invalid `--format` → exit 2 + stderr 'invalid' 포함
- CLI `--output=PATH` 정상 emit

## 10. Edge Cases

1. **memory_index 부재**: `entries_dir` 부재 시 모든 field 0 / empty list.
2. **maturity_matrix.json parse 실패**: 모든 count 0 + transports/harnesses empty.
3. **release note 본문에 `**N/N PASS**` 패턴 부재** (e.g. v0.11.21): `recent_releases` 에서 제외 (skip). 빈 list 면 `cumulative_pass=0`.
4. **git log 실패**: `head_commit_date=""`, `last_updated_delta_days=None`.
5. **semver sort 함정**: `Beta-v0.9.6` 와 `Beta-v0.10.0` 의 lexicographic 비교 시 '9' > '1' 으로 잘못 분류되는 함정 회피 (`_release_version_key`).

## 11. 호환성 / Risk

1. **No public API 추가**: `workflow_kit.common.dashboard_data` 는 internal module (public API 표면 미확장). 2-year SemVer stable guarantee 유지.
2. **No new dependency**: 표준 library (json / re / subprocess / pathlib / datetime / collections) 만 사용.
3. **read-only**: 모든 collector 는 file read + git log 만 수행. file write / mutation 없음.
4. **subprocess `git log` timeout 5초**: CI / low-resource 환경에서 hang 방지.
5. **telemetry 부재 (Panel 3 retrieval_hit_rate)**: Phase 13 AC2 후속 — 본 release 는 marker 만 emit.

## 12. 후속 작업 (v0.13.1+)

1. ~~**release --apply 자동 emit**~~ ✅ v0.13.1 완료 — `tools/release_pipeline.py cmd_release` 의 마지막 step 에 `_emit_dashboard_post_release` hook 추가.
2. ~~**drift guard inline 실행**~~ ✅ v0.13.1 완료 — `run_drift_prevention_guard_inline` 가 `check_drift_prevention_v0_11_23.py` 를 subprocess 로 호출, 6 case 의 PASS/FAIL 을 parse 한 뒤 `guard_status='pass'|'fail'|'error'` emit.
3. **memory_index telemetry**: opt-in retrieval 호출 횟수 측정을 `memory_index/retrieval_log.jsonl` 에 append → dashboard 가 tail 분석.
4. ~~**정적 HTML dashboard**~~ ✅ v0.13.2 완료 — `render_dashboard_html` + `--format=html` + `--publish`.

## 13. v0.13.1 — drift guard inline + release post-emit

### 13.1 Panel 1 확장 (inline guard)

기존 `guard_status='unknown'` marker 를 **inline 실행 결과** 로 교체.

새 field:
| Field | Type | 비고 |
|---|---|---|
| `guard_status` | `Literal["pass", "fail", "error"]` | inline 실행 결과. v0.13.0 의 `'unknown'` 은 legacy 옵션 (`inline_guard=False`) |
| `guard_cases_pass` | `int` | pass case 갯수 |
| `guard_cases_fail` | `int` | fail case 갯수 |
| `guard_failure_names` | `list[str]` | fail case 의 name (drift 발생 시) |
| `guard_executed_at` | `str` (ISO 8601) | inline 실행 timestamp |
| `guard_runtime_ms` | `int` | inline 실행 소요 시간 (ms) |

내부 구현: `run_drift_prevention_guard_inline(workspace_root, *, timeout=30)` —
`workflow-source/tests/check_drift_prevention_v0_11_23.py` 의 main() 을 subprocess 로
호출하여 stdout line 의 `PASS:` / `FAIL:` / `=== PASS|FAIL: N/M ===` 패턴을 regex parse.

`collect_dashboard_snapshot(inline_guard=False)` 으로 legacy v0.13.0 behavior 유지.

### 13.2 release post-emit hook

`tools/release_pipeline.py` 의 `cmd_release` 의 `gh release create` 성공 후 자동 호출:

```python
def _emit_dashboard_post_release(args, results) -> dict:
    """dashboard markdown snapshot 을 ai-workflow/dashboard/snapshot.md 로 emit."""
```

CLI option:
| Flag | Default | 의미 |
|---|---|---|
| `--skip-dashboard-emit` | False | 후속 emit skip. 결과 `status='skipped'` |
| `--dashboard-output=PATH` | `ai-workflow/dashboard/snapshot.md` | 출력 경로 override |

동작:
1. **project_root** = `REPO_ROOT.parent` (git repo root = workflow-source 의 부모)
   - ai-workflow/ 가 project root 아래에 있으므로 정합.
2. **PYTHONPATH=REPO_ROOT** (workflow-source) → subprocess 환경 prepend.
3. **subprocess CWD=project_root** + `--output={absolute path}`.
4. 결과는 `results['dashboard_emit']` dict 로 attach.

Release 결과 dict 확장:
```python
results['dashboard_emit'] = {
    "status": "ok" | "skipped" | "error",
    "path": "ai-workflow/dashboard/snapshot.md",  # status='ok' 시
    "bytes": 3179,
    "executed_at": "2026-07-09T01:56:24Z",
    "duration_ms": 116,
    "reason": "--skip-dashboard-emit",  # status='skipped' 시
    "error": "...",                     # status='error' 시
}
```

**Fail policy**: dashboard emit 실패 시 release 자체는 **성공** (warning 만 stderr print). 이유: dashboard 는 *supplemental* — release 가 이미 GH 측에 push 된 상태.

### 13.3 인수 기준 (v0.13.1)

| AC | 조건 | 검증 |
|---|---|---|
| AC1.5 | `guard_status in {'pass','fail','error'}` (v0.13.0 의 'unknown' ❌) | smoke test case 1/6 |
| AC1.6 | `guard_cases_pass + guard_cases_fail == guard_cases` 일치 | smoke test case 6 |
| AC1.7 | release `_emit_dashboard_post_release(args={skip:False})` 시 status='ok' | smoke test case 7 |
| AC1.8 | release `_emit_dashboard_post_release(args={skip:True})` 시 status='skipped' | smoke test case 7 |
| AC1.9 | release `--dashboard-output=/path` 시 해당 위치 emit | smoke test case 7 |
| AC1.10 | emit 실패 (e.g. timeout) 시 release fail ❌ | manual + smoke test |

## 14. v0.13.2 — 정적 HTML dashboard renderer

### 14.1 `render_dashboard_html(snapshot) -> str`

단일 self-contained HTML page emit. Chart.js CDN + 5 panel widget.

| Feature | 비고 |
|---|---|
| Chart.js CDN | `https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js` (MIT) |
| Dark mode | `prefers-color-scheme: dark` 자동 인식 |
| Graceful degradation | JS off 시 static fallback 그대로 표시 (`<canvas>` + table) |
| Self-contained | 외부 CSS / image 없음. Chart.js CDN 만 external |
| HTML escape | `<`, `>`, `&`, `"`, `'` 모두 escape (`_html_escape`) |

### 14.2 Panel → Chart 매핑

| Panel | Chart.js widget | Data source |
|---|---|---|
| Panel 1 (drift_prevention) | static (Canvas 없음 — guard_status + table) | `guard_status`, `guard_cases_pass`, `silent_failing_cycles_count` 등 |
| Panel 2 (maturity) | stacked bar (`chart-maturity`) | `skills` + `mcp_tools` 의 stable / beta / alpha |
| Panel 3 (memory_index) | line (`chart-memory`) | `cumulative_timeline` 의 date + count |
| Panel 4 (smoke_trend) | line (`chart-smoke`) | `recent_releases` 의 version + pass |
| Panel 5 (recent_releases) | `<ul class="timeline">` (정적 list) | `timeline` 의 preview |

### 14.3 CLI 확장 (v0.13.2)

`--format` 에 `html` 추가:

```bash
PYTHONPATH=workflow-source python -m workflow_kit.workflow_kit_cli \
    --command=dashboard --format=html \
    --output=ai-workflow/dashboard/snapshot.html
```

신규 flag:
| Flag | 의미 |
|---|---|
| `--publish` | `--output` 외 추가 로 `docs/dashboard/index.html` copy (GitHub Pages 정합) |
| `--inline-guard=false` | (v0.13.1+) drift guard inline 실행 skip. legacy `'unknown'` marker 출력 |

### 14.4 인수 기준 (v0.13.2)

| AC | 조건 | 검증 |
|---|---|---|
| AC2.1 | `render_dashboard_html(snap)` 가 `<!DOCTYPE html>` 시작 + `</html>` 종료 | smoke test case 8 |
| AC2.2 | Chart.js CDN reference + 5 panel label 모두 포함 | smoke test case 8/9 |
| AC2.3 | `silent_failing_cycles_count` 가 HTML 에 포함 (Phase 13 AC1 north-star 시각화) | smoke test case 8 |
| AC2.4 | `--format=html` CLI 정상 emit | smoke test case 9 |
| AC2.5 | `--publish` 시 `docs/dashboard/index.html` 추가 copy | smoke test case 10 |

### 14.5 호환성 / Risk

1. **Chart.js 외부 CDN 의존**: jsdelivr outage 시 chart 미렌더링 (static fallback 으로 *graceful*).
2. **외부 공개 시 보안**: dashboard 가 운영 metric 노출 → PII / 보안 검토 필요. 본 spec §1.2 비대상.
3. **GitHub Pages publish**: 별도 workflow 의 `--publish` 호출 필요. 본 spec 범위 외.

## 15. 검증 결과 (현 release)

- `python -m workflow_kit.workflow_kit_cli --command=dashboard --format=json` 정상 emit (5 panel + top-level, inline guard 결과 포함).
- `python -m workflow_kit.workflow_kit_cli --command=dashboard --format=markdown` 정상 emit (5 panel 헤더 포함).
- `PYTHONPATH=workflow-source python -c "from workflow_kit.common.dashboard_data import run_drift_prevention_guard_inline; print(run_drift_prevention_guard_inline('.'))"`
  → `guard_status: 'pass', cases_pass: 6/6, runtime_ms: ~40ms` 확인.
- `python workflow-source/tests/check_quality_dashboard_v0_13_0.py` → **10/10 PASS** (v0.13.0 5 + v0.13.1 2 + v0.13.2 3).
- 출력 sample (현 snapshot):
  - `drift_prevention.guard_status = 'pass'` / `guard_cases_pass = 6` / `guard_runtime_ms ≈ 40`
  - `drift_prevention.silent_failing_cycles_count = 0` (Phase 13 AC1 정합)
  - `maturity_distribution.skills.stable = 12` / `mcp_tools.beta = 4`
  - `memory_index_utilization.entries_total = 7`
  - `smoke_trend.cumulative_pass = 40` / `cumulative_total = 40` (Beta-v0.11.25 정합)
  - `recent_releases.items_total = 60`

## 다음에 읽을 문서

- [`./quality-dashboard-implementation-guide.md`](./quality-dashboard-implementation-guide.md) — wiki topic (설계 가이드)
- [`../../ai-workflow/wiki/topics/phase-13-definition-north-star.md`](../../ai-workflow/wiki/topics/phase-13-definition-north-star.md) — north-star metric 정의
- [`./maturity_matrix.json`](./maturity_matrix.json) — Panel 1/2 data source
- [`./tools/release_pipeline.py`](./tools/release_pipeline.py) — `_emit_dashboard_post_release` v0.13.1+
- [`./tests/check_quality_dashboard_v0_13_0.py`](./tests/check_quality_dashboard_v0_13_0.py) — 10 case smoke (v0.13.0 5 + v0.13.1 2 + v0.13.2 3)