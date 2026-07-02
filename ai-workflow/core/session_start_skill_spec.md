<!-- standard-ai-workflow-kit: v0.11.21-beta -->

# Session-Start Skill Spec

- 문서 목적: `session-start` skill 을 실제 구현 가능한 수준의 입력/출력 계약과 동작 순서로 구체화한다.
- 범위: 목표, 입력 계약, 출력 계약, 판단 절차, 실패 규칙, 쓰기 권한 제한, 수동 대체 절차
- 대상 독자: AI agent 설계자, skill 구현자, 운영자, 프로젝트 온보딩 담당자
- 상태: draft
- 최종 수정일: 2026-04-18
- 관련 문서: `./workflow_skill_catalog.md`, `./global_workflow_standard.md`, `./workflow_agent_topology.md`, `../templates/session_handoff_template.md`, `../templates/project_workflow_profile_template.md`, `./llm_wiki_concept_purpose_spec.md` (v0.9.5 part 2)

## 1. 목적

`session-start` skill 의 목적은 새 세션이 시작될 때 현재 프로젝트의 작업 기준선을 빠르게 복원하는 것이다.

이 skill 은 단순히 문서를 읽는 기능이 아니라, handoff, 백로그, 프로젝트 프로파일을 읽고 아래 산출물을 안정적으로 만들어내는 역할을 가진다.

- 현재 상태 요약
- 우선 확인할 진행 중 또는 차단 작업
- 다음에 읽거나 확인할 문서 경로
- 현재 세션에서 바로 시작할 수 있는 첫 행동 제안

## 2. 선행 원칙

- 공통 세션 시작 순서는 `global_workflow_standard.md` 를 따른다.
- 프로젝트별 문서 구조와 명령 체계는 프로젝트 프로파일을 우선 기준으로 삼는다.
- 문서 상태가 불완전하더라도 사실을 지어내지 않고, 누락 또는 불확실성을 출력에 명시한다.
- 이 skill 은 기본적으로 읽기 전용이며, 상태 문서를 직접 수정하지 않는다.

## 3. 입력 계약

### 3.1 필수 입력

- `session_handoff_path`
- 현재 프로젝트의 세션 인계 문서 경로
- `work_backlog_index_path`
- 날짜별 백로그 인덱스 문서 경로
- `project_profile_path`
- 프로젝트 특화 규칙과 문서 구조가 적힌 프로파일 문서 경로

### 3.2 선택 입력

- `latest_backlog_path`
- 이미 외부에서 최신 날짜 백로그 경로를 계산했다면 직접 전달 가능
- `changed_files`
- 세션 시작 전에 이미 알려진 변경 파일 목록이 있다면 참고 입력으로 사용 가능
- `environment_hint`
- 현재 호스트명, 실행 환경, 접근 제약 같은 부가 정보

### 3.3 입력 해석 규칙

- 필수 입력 문서는 모두 실제 파일이어야 한다.
- `latest_backlog_path` 가 없으면 백로그 인덱스에서 최신 백로그 후보를 찾는다.
- 프로젝트 프로파일에 문서 구조가 명시되어 있으면, 다른 휴리스틱보다 그 구조를 우선 적용한다.

## 4. 출력 계약

`session-start` 의 출력은 사람이 바로 읽고 다음 행동으로 이어갈 수 있는 구조화 요약이어야 한다.

최소 출력 필드:

- `summary`
- 현재 세션 기준선을 3~6줄 정도로 요약한 텍스트
- `in_progress_items`
- 현재 진행 중으로 판단한 작업 목록
- `blocked_items`
- 현재 차단 상태로 판단한 작업 목록
- `latest_backlog_path`
- 실제로 읽은 최신 백로그 문서 경로 또는 확인 실패 상태
- `next_documents`
- 다음에 읽을 문서 경로 목록
- `recommended_next_action`
- 세션 시작 직후 수행할 첫 행동 한 줄 제안
- `warnings`
- 누락 문서, 충돌 정보, stale 가능성, 불확실성 목록

권장 추가 출력 필드:

- `validation_notes`
- 이전 세션에서 검증이 미완료로 남은 항목 요약
- `environment_constraints`
- 현재 세션에 영향을 주는 접근 제약 또는 환경 차이


### 4.1. stage_completion (v0.6.5 신규)

본 skill 의 출력은 v0.6.5 부터 v0.6.4 의 [Stage Gate Pattern](../stage_gate_pattern.md) 의 `stage_completion` 필드를 포함한다. 이 필드는 다음 stage 로의 진행 gate 역할을 한다.

| Field | 값 | 비고 |
|---|---|---|
| `stage_name` | `session-start` | 본 skill 의 stage 식별자 |
| `stage_status` | `ok` / `warning` / `error` | skill 실행 결과 |
| `next_stage` | `None` (workflow end) | 다음 stage 이름. workflow 끝이면 `None` |
| `approval_actor` | `user` mandatory | auto-approval 차단 (state 문서 갱신) |
| `approval_timestamp` | ISO 8601 | user explicit approval 시각 |
| `artifacts` | [`ai-workflow/memory/active/state.json`, `ai-workflow/memory/active/session_handoff.md`] | 본 stage 의 검토 대상 artifact path |
| `requested_changes` | (empty or list) | user 가 요청한 변경 사항 |
| `notes` | 1-3 line | AI summary |

Gate 정책:
- `requested_changes` 비어있고 `approval_timestamp` + `approval_actor` 모두 있어야 gate 통과
- `approval_actor: "auto"` 는 명시적 차단 (state 문서 갱신 skill)
- 다음 stage 자동 진행 ❌ — user explicit approval 후에만 진행

상세:
- Pydantic v2 schema: [`../../workflow_kit/common/contracts/stage_gate.py`](../../workflow_kit/common/contracts/stage_gate.py) `StageCompletion`
- Output schema 가이드: [`../output_schema_guide.md` §3.4](../output_schema_guide.md)
- Stage Gate Pattern: [`../stage_gate_pattern.md`](../stage_gate_pattern.md)
- smoke test: [`../../tests/check_stage_gate_compliance.py`](../../tests/check_stage_gate_compliance.py)
## 5. 권장 출력 예시

```text
summary:
- 현재 기준선은 문서 표준화 1차 반영 완료 상태다.
- 진행 중 작업은 session-start skill 계약 구체화다.
- 문서 스모크 체크는 마지막 실행 기준 통과했다.

in_progress_items:
- TASK-031 session-start skill spec 작성

blocked_items:
- 없음

latest_backlog_path:
- docs/operations/backlog/2026-04-18.md

next_documents:
- docs/operations/session_handoff.md
- docs/operations/backlog/2026-04-18.md
- docs/operations/PROJECT_PROFILE.md

recommended_next_action:
- handoff와 최신 backlog의 불일치 여부를 먼저 확인한다.

warnings:
- 환경 기록 문서는 아직 정의만 있고 실제 샘플은 없다.
```

## 6. 동작 절차

### 6.1 문서 존재 확인

1. `session_handoff_path`, `work_backlog_index_path`, `project_profile_path` 존재 여부를 확인한다.
2. 누락 문서가 있으면 즉시 실패하지 말고, 읽을 수 있는 범위까지 진행하되 `warnings` 에 누락 사실을 기록한다.

### 6.2 handoff 읽기

1. 현재 기준선, 현재 주 작업 축, 진행 중 작업, 차단 작업, 최근 완료 작업, 주요 제약을 읽는다.
2. handoff 에서 다음에 읽을 문서가 명시되어 있으면 우선 수집한다.

### 6.3 최신 backlog 결정

1. `latest_backlog_path` 가 입력으로 있으면 그 경로를 우선 사용한다.
2. 없으면 backlog index에서 최신 날짜 문서를 찾는다.
3. 인덱스에 최신 링크가 없거나 애매하면 프로젝트 프로파일에 정의된 백로그 위치를 참고해 경고를 남긴다.

### 6.4 backlog 읽기

1. 최신 backlog 에서 `in_progress`, `blocked`, 최근 완료 또는 미검증 항목을 추린다.
2. handoff 와 backlog 의 상태가 다르면 둘 중 무엇이 최신인지 단정하지 말고 불일치 경고를 남긴다.

### 6.5 프로젝트 프로파일 읽기

1. 문서 구조, 기본 명령, 특화 검증 포인트, 환경 제약을 읽는다.
2. 세션 시작 후 곧바로 필요한 명령이나 접근 제약이 있으면 `recommended_next_action` 과 `environment_constraints` 에 반영한다.

### 6.6 최종 요약 생성

1. handoff 와 backlog 에 공통으로 나타나는 현재 우선 작업을 우선 요약한다.
2. 차단 항목이 있으면 이유와 영향 범위를 함께 짧게 요약한다.
3. 다음에 읽을 문서와 첫 행동 제안을 만든다.

## 7. 판단 규칙

- handoff 는 세션 맥락 복원용 기준 문서로 우선 신뢰하되, backlog 와 충돌 시 단정하지 않는다.
- backlog 는 작업 단위 상태 확인용 기준 문서로 사용한다.
- 프로젝트 프로파일은 명령과 경로 해석의 최우선 기준이다.
- `done` 상태는 재판정하지 않으며, 검증 여부를 별도 메모로만 드러낸다.
- 정보가 부족하면 "없음" 보다 "확인되지 않음" 을 우선 사용한다.

## 8. 실패 및 경고 규칙

### 8.1 실패로 처리할 조건

- 필수 입력 3개가 모두 없거나 읽을 수 없는 경우
- 프로젝트 프로파일이 없어 경로 해석과 기본 규칙 복원이 모두 불가능한 경우

### 8.2 경고로 처리할 조건

- handoff 는 있으나 최신 backlog 를 찾을 수 없는 경우
- backlog 는 있으나 handoff 와 진행 상태가 다르게 보이는 경우
- 프로젝트 프로파일에 정의된 문서 구조와 실제 입력 경로가 다른 경우
- 문서 메타데이터는 있으나 실제 내용이 비어 있는 경우

### 8.3 실패 시 최소 출력

실패하더라도 아래 정보는 남기는 것을 권장한다.

- 읽기에 성공한 문서 목록
- 읽기에 실패한 문서 목록과 원인
- 사람이 수동으로 먼저 확인해야 할 경로

## 9. 권한과 수정 제한

- 기본 권한은 읽기 전용이다.
- 상태 문서, backlog, handoff 를 직접 수정하지 않는다.
- `done` 상태 확정이나 차단 해제 판단을 수행하지 않는다.
- 후속 agent 나 사용자에게 넘길 요약과 경고만 만든다.

## 10. 수동 대체 절차

tool 이 없거나 skill 구현이 아직 없으면 아래 순서로 수동 수행한다.

1. handoff 문서를 읽고 현재 기준선과 진행 중 작업을 확인한다.
2. backlog index 와 최신 날짜 backlog 를 읽고 실제 작업 상태를 확인한다.
3. 프로젝트 프로파일을 읽고 문서 구조, 명령, 환경 제약을 확인한다.
4. 현재 세션의 첫 행동과 확인할 문서를 짧게 요약한다.

## 11. Extension Baseline Opt-In 통합 (v0.7.0+)

본 섹션은 v0.7.0 step 7 의 Extension 시스템 (`workflow-source/extensions/SCHEMA.md`) 과 session-start skill 의 통합 가이드.

### 11.1 3종 Baseline 목록

| Extension | Prefix | Rule Count | Opt-In File |
|---|---|---|---|
| security | SEC-WF | 6 | `extensions/security-baseline.opt-in.md` |
| testing | TST-WF | 6 | `extensions/testing-baseline.opt-in.md` |
| performance | PERF-WF | 6 | `extensions/performance-baseline.opt-in.md` |

### 11.2 통합 흐름

session-start 시 3종 baseline 에 대한 opt-in prompt 표시:

1. **detect existing status**: 각 baseline 의 `ai-workflow/memory/active/<name>_baseline_status.md` 존재 여부 확인
   - 존재: 기존 status 존중 (재 prompt 안 함)
   - 없음: 신규 prompt 표시

2. **단일 통합 prompt**: 3종 baseline 의 opt-in 을 한 prompt 에 표시 (선택). 또는 개별 prompt 3회 표시.

3. **응답 처리**: 각 baseline 마다:
   - `A) Yes` → `status: enabled, partial: false`
   - `B) No` → `status: disabled, partial: false`
   - `P) Partial` → `status: enabled, partial: true, partial_rules: [...]`
   - `X) ...` → custom

4. **status 파일 기록**:
   - `ai-workflow/memory/active/security_baseline_status.md`
   - `ai-workflow/memory/active/testing_baseline_status.md`
   - `ai-workflow/memory/active/performance_baseline_status.md`
   - 각 파일: `Extension Configuration` table + `decided_at` + `decided_by` + `standard_ref`

5. **state.json sync**: `ai-workflow/memory/active/state.json` 의 `<name>_baseline` 필드 갱신

6. **audit log**: `append_audit_log("opt_in", "<name>_baseline=<answer>")`

### 11.3 Default 정책

| 모드 | Default |
|---|---|
| Greenfield (신규 project) | security=A) Yes / testing=A) Yes / performance=P) Partial |
| Brownfield (기존 project) | 기존 status 존중. 없으면 security=B) No / testing=B) No / performance=B) No |
| CI/CD | opt-in prompt 표시 안 함, 기존 status 사용 |
| PoC / Prototype | 모든 baseline = B) No 권장 |

### 11.4 Session-Start 출력에 추가

기존 session-start 출력 (`summary`, `in_progress_items`, 등) 에 다음 추가:

```yaml
extension_baselines:
  security:
    status: enabled | disabled | partial
    source: extensions/security-baseline.opt-in.md
    partial_rules: []  # partial 시만
  testing: { ... }
  performance: { ... }
```

`warnings` 필드에:
- "Security baseline disabled — production-grade 강제 안 됨"
- "Testing baseline partial mode — TST-WF-01 + 02 만 hard constraint"
- "Performance baseline partial mode — PERF-WF-01 + 04 만 hard constraint"

### 11.5 Runtime 통합 (v0.7.1+ follow-up)

`workflow_kit.common.contracts.<name>_baseline.evaluate_compliance()` (v0.7.1+ follow-up) 가 session-start 출력의 `extension_baselines` 데이터를 받아 stage completion message 의 Compliance Summary 자동 emit.

본 spec 은 v0.7.0 step 7 spec level. runtime helper 는 v0.7.1+ follow-up.

## 12. 구현 체크리스트

- 입력 경로 존재 여부를 검증하는가
- backlog 최신 문서를 안정적으로 찾는가
- handoff 와 backlog 불일치를 경고로 드러내는가
- 프로젝트 프로파일을 기준으로 경로와 명령을 해석하는가
- 출력이 구조화되어 다음 agent 또는 사람이 재사용 가능한가
- 읽기 전용 원칙을 지키는가

## 13. Purpose Context Load (v0.9.5 chapter 9 R-A part 2)

본 섹션은 [./llm_wiki_concept_purpose_spec.md](./llm_wiki_concept_purpose_spec.md) §4.3 part 2 의
session-start 통합 가이드. v0.9.4 에서 `state.json.purpose_digest` 1-line 자동 생성이 완료된
후속으로, v0.9.5 는 session-start 가 *directional intent* (PURPOSE.md + state.json) 를
context load 시점에 자동 read 한다.

### 13.1 추가 입력

없음 (기존 입력으로 workspace_root + state.json 경로 도출).

### 13.2 추가 출력

- `purpose_context: SessionStartPurposeContext | None`
  - `purpose_digest: str | None` — `state.json.purpose_digest` 1-line
  - `purpose_digest_rev: str | None` — `state.json.purpose_digest_rev` (YYYY-MM-DD)
  - `purpose_path: str | None` — 자동 detect 된 PURPOSE.md 절대 path
  - `body_excerpt: str | None` — PURPOSE.md 본문 (frontmatter 제외) ≤800 char
  - `body_excerpt_truncated: bool` — 원본 본문이 800 char 초과 시 true
  - `body_excerpt_char_count: int` — 실제 excerpt 의 char 수
  - `scope_included: list[str]` — PURPOSE.md §3 포함 영역
  - `scope_excluded: list[str]` — PURPOSE.md §3 제외 영역
  - `scope_warnings: list[str]` — §3 parse 실패 / PURPOSE.md 부재 시 advisory

### 13.3 동작 절차 추가 (6.7 신규)

1. workspace_root = `project_workspace_root(project_profile_path)`
2. state.json path = `workflow_memory_dir(project_profile_path) / "state.json"`
3. `build_purpose_context(workspace_root, state_path)` 호출 (helper module)
4. output_model 에 `purpose_context` 채워서 반환
5. `scope_warnings` 는 기존 `warnings` list 에 extend (graceful skip 시 "PURPOSE.md 부재" advisory 1줄 추가)

### 13.4 Graceful skip 정책

- `state.json` 부재 / JSON 파싱 실패 / `purpose_digest` field 부재 → `purpose_digest = None`
- `PURPOSE.md` 부재 → `body_excerpt = None`, `scope_included = []`, `scope_excluded = []`, `scope_warnings = ["PURPOSE.md 부재 — scope check skipped"]`
- 어떤 경우에도 skill 실행은 **실패하지 않음**. `purpose_context` field 가 null 또는 partial fill 만 된다.

### 13.5 Acceptance Criterion (spec §4.3 part 2 #1)

- session-start output_model 에 `purpose_context` field 존재
- PURPOSE.md + state.json 모두 있는 경우, `purpose_digest` + `body_excerpt` (≤800 char) + `scope_included/excluded` 모두 populate
- PURPOSE.md 부재 시 graceful skip (`scope_warnings` 에 advisory 1줄)

## 다음에 읽을 문서

- skill 카탈로그: [./workflow_skill_catalog.md](./workflow_skill_catalog.md)
- 공통 표준: [./global_workflow_standard.md](./global_workflow_standard.md)
- agent 토폴로지: [./workflow_agent_topology.md](./workflow_agent_topology.md)
- Extension 시스템: [../extensions/SCHEMA.md](../extensions/SCHEMA.md)
- 3종 baseline opt-in: [../extensions/security-baseline.opt-in.md](../extensions/security-baseline.opt-in.md), [../extensions/testing-baseline.opt-in.md](../extensions/testing-baseline.opt-in.md), [../extensions/performance-baseline.opt-in.md](../extensions/performance-baseline.opt-in.md)
