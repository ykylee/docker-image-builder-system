<!-- standard-ai-workflow-kit: v1.0.0-beta -->

# Project Status Assessment (Standard AI Workflow)

- 문서 목적: `standard_ai_workflow` 저장소의 현재 작업 상태, 설계 성숙도, 공백 영역, 다음 우선순위를 공식 진단 문서 형태로 정리한다.
- 범위: 저장소 구조, 문서 완성도, 구현 공백, 적용 가능성, 다음 단계 권고안
- 대상 독자: 저장소 관리자, AI workflow 설계자, 도입 검토자, 프로젝트 온보딩 담당자
- 상태: v0.11.22-beta 기준
- 최종 수정일: 2026-07-21
- 관련 문서: `../README.md`, `./global_workflow_standard.md`, `./workflow_skill_catalog.md`, `./workflow_mcp_candidate_catalog.md`, `./workflow_agent_topology.md`, `./workflow_kit_roadmap.md`, `./prototype_promotion_scope.md`, `./maturity_matrix.json`

## 1. 총평

이 저장소는 `v0.11.22-beta` 기준으로 **Phase 1–11 모두 완료, Phase 12 (운영 지능화 + deprecation 안정화) in_progress** 상태다. 핵심 11종 skill 중 9종이 stable 채널로 승격 완료되었고 (v0.11.19 ~ v0.11.21, 3 batch), **FULL mypy strict** 도달 (v0.11.18, 109 file clean, 0 errors), **ADR-005 Memora-inspired Memory Index** 의 Phase 1~3d 8 release 가 v0.11.22 사이클에서 모두 완료됐다. **CodeWhale 하네스** 가 10번째 하네스로 추가됐다 (v0.10.4, 2026-07-03).

정식 phase / skill / harness 상태는 **`workflow-source/core/maturity_matrix.json`** 을 SSOT 로 참조한다. 본 문서는 그 SSOT 의 *해설 + 진단* 본문이다.

## 2. 현재 단계 판단 (Phase 12 in_progress)

### 2.1 Phase 진행 상황 SSOT 정합 (v0.11.22-beta 기준)

| 단계 | 이름 | 상태 | 비고 |
| --- | --- | --- | --- |
| Phase 1 | Concept | done |  |
| Phase 2 | Template | done |  |
| Phase 3 | Prototype | done |  |
| Phase 4 | Beta/Pilot | done |  |
| Phase 5 | Intelligence | done |  |
| Phase 6 | Precision & Optimization | done |  |
| Phase 7 | Intelligent Task Modes | done |  |
| Phase 8 | Pilot Deployment & Integration | done |  |
| Phase 9 | System Maturity & Multi-Agent Evolution | done |  |
| Phase 10 | Document & Link Hygiene | done |  |
| Phase 11 | Real-world Pilot Validation | **done** (v0.9.0, 2026-06-18) | DevHub 실전 파일럿 + contract v1 + stable API frozen + read-only MCP transport + deprecation 1st cycle |
| Phase 12 | Operational Intelligence + Deprecation Stabilization | **in_progress** (2026-06-18 ~) | mypy FULL strict, 9 skill stable, ADR-005 Memory Index, CodeWhale harness |

Phase 11 닫힘은 v0.9.0 (release note `Beta-v0.9.0.md` 에서 명시). 본 진단서는 Phase 12 in_progress 기준 작성. 12단계 외에 별도의 13단계는 정의돼 있지 않으며, 후속 milestone 인 v1.0.0 은 Phase 12 의 SemVer stable guarantee 진입 시점.

### 2.2 v0.11.22-beta (2026-07-03) 기준 판단 근거

- **Skill 11종 → 9 stable**: v0.11.19 (1st batch, 4 skill: session-start / doc-sync / validation-plan / code-index-update) → v0.11.20 (2nd batch, 4 skill: backlog-update / merge-doc-reconcile / workflow-linter / project-status-assessment) → v0.11.21 (3rd batch, 1 skill: robust-patcher). 남은 2종: automated-repro-scaffold (beta, scaffold 만) + git-conflict-resolver (alpha). task-modes 도 stable (independent track).
- **MCP 12종**: stable 8 (`latest_backlog`, `check_doc_metadata`, `check_doc_links`, `create_backlog_entry`, `suggest_impacted_docs`, `create_session_handoff_draft`, `create_environment_record_stub`, `check_quickstart_stale_links`) + beta 4 (`git_history_summarizer`, `workflow_log_rotator`, `smart_context_reader`, `apply_robust_patch`).
- **FULL mypy strict 도달** (v0.11.18, commit `4253eed` 12 file residual 격상, 107 file clean). 누적: v0.11.21 기준 109 file clean. 0 errors. pyproject `dev` extra mypy pin `==2.1.0`. CI mypy-strict workflow passing.
- **ADR-005 Memory Index Phase 1~3d 완료** (v0.11.22, 8 release). `ai-workflow/memory/active/memory_index/` 메타데이터 레이어 + `--merge` opt-in canonical merge + BM25 stdlib 2단계 fallback + dispatcher entry (`memory-index-query` skill beta) + 3 skill opt-in wiring (session-start / doc-sync / backlog-update).
- **ADR-006**: Memory Index retrospective 자리 박기 (`34fb07f`). 회고 본문은 v0.11.23+ 또는 실 사용 30일 후 작성.
- **CodeWhale 하네스** (v0.10.4, commit `cf0060d`, 2026-07-03) — 10번째 하네스. `HARNESS_SPECS` 레지스트리 등록 + 단일 `SKILL.md` overlay (Constitution 이 verification/parallelism/context 담당, 본 overlay 는 session start + Korean output + backlog mgmt 만 추가).
- **Stable API frozen** (v0.8.0, 2-year SemVer guarantee: v0.8.0 → v2.0.0). Deprecation 1st cycle 적용 (v0.9.0, `phishing_federation_v4.fetch_federated_phishing_urls_v4`). Deprecation 2nd cycle 후속 candidate 식별 (v0.9.3 완료 + 후속).
- **release pipeline 자동화** (v0.7.9+): `tools/release_pipeline.py` 8 subcommand (validate / version-bump / note-draft / changelog-gen / release / gen-schema / verify / rollback / dist) + `--apply` flag. CI mypy-strict workflow + Layer 2 release-time gate cross-verify (v0.11.13+).

## 3. 잘 정리된 영역 (v0.11.22-beta 성과)

### 3.1 Skill 안정화 3 batch (9 → 11 → stable 9)
`skill_beta_criteria.md` §3.1 6 정합 조건 (CLI argparse / Pydantic schema / error_code 4종 / 단일 명령 / 예시 실행 섹션 / smoke test PASS) 모두 충족 시 `beta → stable` 승격. v0.11.19 ~ v0.11.21 의 3 batch 로 9종 stable. 누적: `stable=9 / beta=2 / prototype=4` (skill task 모드 / memory-index-query / ...).

### 3.2 Memora-inspired Memory Index (ADR-005)
본 ADR 은 v0.11.22 에 end-to-end milestone 도달:
- **Phase 1** (prototype): `workflow_kit/common/state/memory_index.py` helper + schema + smoke.
- **Phase 1.5** (state.json hook): `state.json` 생성 시 optional `memory_entries[]` 추가.
- **Phase 2** (--merge opt-in): canonical merge + provenance 합집합.
- **Phase 2b** (BM25 fallback): stdlib only 2단계 fallback (embedding 없이 fallback 가능).
- **Phase 3** (dispatcher entry): `memory-index-query` skill beta.
- **Phase 3b1 / 3c / 3d** (3 skill opt-in wiring): `session-start` / `doc-sync` / `backlog-update` 에 retrieval hint 통합.
- **ADR-006**: retrospective 자리 박기 (회고 본문은 후속 release 또는 30일 후).

본질적 가치: 본문/검색 분리로 retrieval 비용 ↓, canonical anchor 기반 cross-doc reconcile 가 가능해짐.

### 3.3 mypy FULL strict + Layer 1/Layer 2 defense
- v0.8.1 ~ v0.8.15: 19 file strict clean.
- v0.11.0 cycle 3 (+ purpose_ingest.py) → v0.11.18 FULL strict 도달 (107 file clean).
- v0.11.21: 109 file strict clean.
- **Layer 1**: CI `mypy-strict.yml` workflow (push to main + PR + workflow_dispatch).
- **Layer 2**: `release_pipeline validate` 의 mypy source 5번째 (REPO_ROOT.parent cwd + 절대경로). v0.11.13 `cross-verify` 로 verdict 결정.
- v0.11.12 의 `--skip-mypy` flag 는 escape hatch 로 유지.

### 3.4 CodeWhale 하네스 (10번째)
v0.10.4 (commit `cf0060d`, 2026-07-03) 추가. 6 file 변경 (+370 line). 단일 SKILL.md overlay (Constitution handles verification/parallelism/context). `HARNESS_SPECS` + `register_harness_builder` 한 줄 등록. 본 추가가 다른 하네스의 spec/overlay 파일을 건드리지 않는 것이 보장됨 (`isolated registration path`).

## 4. 현재 공백과 한계 (Phase 12 잔여 + v1.0.0 milestone 전)

### 4.1 README.md / CHANGELOG.md auto-gen automation 신뢰 회복
2026-06-14 이후 `tools/release_pipeline.py changelog-gen` 이 한 번도 실행되지 않아 CHANGELOG.md 가 0.7.9 에서 멈춰 있다. v0.7.10 ~ v0.11.22 까지 91 release cycle 의 본문이 누락. v0.11.22 사이클에서 1회 복구 + 후속 release 부터는 `release_pipeline release --apply` 시 자동 실행으로 정책 lockdown 필요.

### 4.2 Git conflict resolver (alpha → beta)
git-conflict-resolver 가 v0.5.10 부터 alpha 단계에서 멈춰 있다. stable 진입 시 smoke test + error_code 정리 + spec layer 동기화 작업이 후속으로 남아 있음.

### 4.3 MCP stdio-sdk 정식 승격 잔여
`stdio-sdk` 의 `Connection closed` 회귀가 v0.8.10~v0.8.11 부터 관측됐고, jsonrpc-bridge 가 안정 기본으로 유지 중. read-only input schema 의 Pydantic v2 강타입 계약 전면 적용은 후속. (v0.11.22 의 ADR-005 Memory Index 는 별도 layer 이므로 직접 영향 ❌)

### 4.4 v1.0.0 milestone 진입 평가
Phase 12 의 SemVer stable guarantee 2-year 진입 (v0.8.0 → v2.0.0) 을 위한 **v1.0.0** milestone 평가 시점. 진입 후보:
- 11/11 skill stable (현재 9/11, 후속 2종 stable 시).
- consumer 1+ months 안정 운영 데이터 (ADR-006 회고 본문 작성 트리거).
- deprecation 1st/2nd cycle 운영 검증 완료.
- long-running CI mypy-strict + release pipeline 자동화 안정화.

## 5. 이 저장소의 현재 가치 (v0.11.22-beta 기준)

- **즉시 배포 가능한 키트**: 91 release cycle 누적, 9 stable skill + 8 stable MCP + 10 harness + FULL mypy strict. 다운스트림이 `pip install -e ".[mcp-sdk,dev]"` 한 줄로 editable link 가능.
- **에이전트 친화적 retrieval layer**: ADR-005 Memory Index 가 본문/검색 분리로 context load 비용을 줄이고 cross-doc reconcile 을 강화.
- **타입 안전성**: 109 file mypy strict clean + Layer 1/Layer 2 mypy defense + release pipeline 자동화.
- **하네스 호환성**: 10개 하네스 (Codex, OpenCode, Gemini CLI, Antigravity, MiniMax Code, CodeWhale, Claude Code, Aider, Goose, pi-dev). 신규 하네스 추가는 `HARNESS_SPECS` + `register_harness_builder` 한 줄.
- **검증된 안정성**: 누적 smoke test 200+ (`workflow-source/tests/check_*.py`) + CI mypy-strict + consumer feedback GH Pages.

## 6. 우선순위 권고 (Phase 12 잔여 + ADR-006 후속)

### 우선순위 1: CHANGELOG.md + README.md sync 자동화 lockdown
`tools/release_pipeline.py release --apply` 에 `changelog-gen --apply` 자동 pre-step 으로 추가. 본 시점에서 수동 1회 backfill (Unreleased 본문 = v0.7.10 ~ v0.11.22 누적 changelog auto-gen 결과).

### 우선순위 2: ADR-006 회고 본문 작성
v0.11.22 의 Memory Index 8 release 누적 후 `≥ 14일` 또는 `≥ 30일` 누적 사용 데이터 후 작성. merge rule / 3-tuple retrieval / skill wiring latency 의 실측 metric 기반.

### 우선순위 3: 2 남은 skill stable 승격
automated-repro-scaffold (beta) + git-conflict-resolver (alpha) 의 stable 진입 블로커 해소. **9/11 → 11/11 stable** 시 자연스러운 v1.0.0 milestone 진입 후보.

### 우선순위 4: MCP stdio-sdk 정식 승격 + read-only input schema 강타입화
현황 회귀 (`Connection closed`) fix 후 정식 SDK transport 승격. read-only input schema 의 Pydantic v2 강타입 계약 전면 적용.

## 7. 권장 완료 기준 (v1.0.0 milestone 진입)

- 11/11 skill stable.
- CHANGELOG.md auto-gen 안정적 운영 (3 release 연속 auto-gen 결과 만족).
- 1+ months 운영 데이터 (ADR-006 회고 본문 작성 완료).
- MCP stdio-sdk 정식 승격.
- deprecation policy contract test (`workflow_kit.__all__` 의 모든 symbol 의 deprecation 상태 verify).
- Long-running CI mypy-strict + release pipeline 자동화 안정성 1+ months 검증.

## 8. 결론

Standard AI Workflow 는 `v0.11.22-beta` 에서 Phase 1–11 모두 완료 + Phase 12 in_progress 상태로, 다음 마일스톤인 v1.0.0 (SemVer stable guarantee 2-year 진입) 을 향해 진화하고 있다. **FULL mypy strict (109 file clean)**, **9/11 skill stable**, **ADR-005 Memory Index Phase 1~3d 완결**, **CodeWhale 10번째 하네스 추가**, **release pipeline 자동화** 가 v0.11.x 사이클의 핵심 성과다. 다음 우선순위는 (1) CHANGELOG 자동화 lockdown, (2) ADR-006 회고 본문, (3) 2 남은 skill stable 승격, (4) MCP stdio-sdk 정식 승격 + read-only input schema 강타입화다.
