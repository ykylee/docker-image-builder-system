# Phase 13 — Operational Intelligence v1.0 + 2-Year Guarantee Follow-up

- 문서 목적: Phase 12 close-out 후, v1.0.0 stable 진입 시점부터의 2-year SemVer guarantee 기간 동안의 follow-up 운영 작업을 정의한다.
- 범위: Quality Dashboard north-star, Telemetry, Self-Recover, Bidirectional Link (Phase 13 AC1~AC4) + stable API 운영 + 2-year backward compat follow-up + ADR-007 회귀 검증.
- 대상 독자: 저장소 maintainer (`ykylee`), AI workflow 설계자, 외부 consumer, v1.0.0 stable consumer.
- 상태: planned (Phase 13 진입 대기, v1.0.0 stable release 후 정식 start).
- 시작 예정: v1.0.0 stable release 직후 (target_milestone).
- 종료 예정: v3.0.0 stable 진입 시점 (2-year guarantee 종결).
- 최종 수정일: 2026-07-20
- 관련 문서: [`./maturity_matrix.json`](./maturity_matrix.json), [`./quality_dashboard_spec.md`](./quality_dashboard_spec.md), [`./stable_guarantee.md`](./stable_guarantee.md), [`./v1_0_0_entry_evaluation.md`](./v1_0_0_entry_evaluation.md), [`./workflow_kit_roadmap.md`](./workflow_kit_roadmap.md), [`../../ai-workflow/wiki/decisions/adr-007-deprecation-3rd-cycle-candidates.md`](../../ai-workflow/wiki/decisions/adr-007-deprecation-3rd-cycle-candidates.md)

## 0. Executive Summary

본 문서는 Phase 13 의 정체성과 follow-up 작업 범위를 정의한다.

- **Phase 13 의 본질**: v1.0.0 stable 진입 후 *2-year SemVer guarantee* 기간 동안의 follow-up 운영. Phase 12 의 "Operational Intelligence" + "Deprecation Stabilization" 위에서 *안정성* + *backward compat* + *north-star metric 수렴* 추구.
- **Phase 13 의 5 영역**: (1) Quality Dashboard north-star metric 수렴 (AC1), (2) Telemetry 활용도 (AC2), (3) Self-Recover + Bidirectional Link 후속 (AC3 / AC4+), (4) stable API 2-year 운영, (5) ADR-007 회귀 검증.
- **Phase 13 의 success criteria**: 모든 north-star metric 의 *수렴* (목표값 도달) + 2-year 동안 breaking change ≤ 1건 + 모든 smoke PASS.
- **Phase 13 의 scope 한계**: Phase 14+ 의 *신규 feature* (e.g. multi-tenant support, plugin ecosystem) 는 본 follow-up 의 scope 밖. 본 follow-up 은 운영 지능화 안정성 + backward compat 보장 한정.

## 1. Phase 13 의 정체성 (Thesis)

### 1.1 Phase 12 → Phase 13 의 transition

- **Phase 12** (2026-06-18 ~ 2026-07-20, v0.11.18 ~ v0.15.20, closed): *Operational Intelligence* + *Deprecation Stabilization* 중심. Quality Dashboard + Telemetry + Self-Recover + Bidirectional Link 의 prototype → stable 화 + 2-cycle deprecation 운영 검증 + 3rd cycle no-op (ADR-007) close-out.
- **Phase 13** (v1.0.0 stable 진입 후, planned): *2-year SemVer guarantee* + *north-star metric 수렴* + *backward compat 운영*. Phase 12 의 운영 지능화를 *안정* 상태로 유지하면서 외부 consumer 2-year 보장. 신규 feature 추가는 *범위 밖* (Phase 14+ 의 별도 milestone).

### 1.2 Phase 13 의 5영역 정체성

| 영역 | 정의 | success criteria |
|---|---|---|
| **(1) Quality Dashboard north-star** | silent_failing_cycles_count = 0 지속, 모든 panel 정상화 | 매 release 회귀 ❌ |
| **(2) Telemetry 활용도** | hit_rate ≥ 0.9 (현 1.0) 유지 + source 다양성 ≥ 4 (현 1) | 1+ release ≥ 1 query + hit |
| **(3) Self-Recover + Bidirectional Link** | drift 발생 시 자동 fix ≥ 95% (manual_required ≤ 5%) + wiki↔memory asymmetric = 0 | release-time 자동 verify |
| **(4) stable API 2-year 운영** | 25 __all__ entries + 12 skill + 11 MCP + 11 harness 의 backward compat 2년 유지 | breaking change ≤ 1건 (v2.0.0 까지) |
| **(5) ADR-007 회귀 검증** | deprecation 3rd cycle 부재 유지 + deprecation-free contract | 매 release `check_deprecation_3rd_cycle_v0_15_4.py` PASS |

### 1.3 Phase 13 의 본질적 목표

- **안정성 (Stability)**: Phase 12 의 운영 지능화 (Quality Dashboard + Telemetry + Self-Recover + Bidirectional Link) 가 *production 안정* 상태로 운영.
- **보장 (Guarantee)**: SemVer 2-year backward compat guarantee 정합 운영. stable API 25 entries + 12 skill + 11 MCP + 11 harness 의 API contract 가 2년 (2026-07-20 ~ 2028-07-20) 동안 안정.
- **수렴 (Convergence)**: north-star metric 의 *목표값 도달* (silent_failing 0, telemetry hit_rate 1.0, asymmetric 0 등) + 유지.
- **회귀 (Regression)**: ADR-007 (3rd cycle no-op) 의 discipline anchor 매 release 자동 verify.

## 2. Phase 13 의 AC (Acceptance Criteria) + north-star metric

Phase 12 의 4 acceptance criteria (AC1~AC4+) 의 **수렴 + 유지** 가 Phase 13 의 본질.

### 2.1 AC1 — Quality Dashboard north-star (`silent_failing_cycles_count`)

- **정의**: drift_prevention 의 silent_failing_cycles_count = 0 의 *지속적 수렴*.
- **현 시점 (2026-07-20)**: 0 ✅.
- **Phase 13 success**: 2-year (2026-07-20 ~ 2028-07-20) 동안 *항상 0*.
- **관련 smoke**: `check_drift_prevention_v0_11_23.py` (6 case) — `silent_failing_cycles_count` 검증.
- **fail mode**: release 시 silent_failing ≥ 1 → Phase 13 critical. 즉시 hotfix release.

### 2.2 AC2 — Telemetry 활용도 (`retrieval_hit_rate`)

- **정의**: memory_index telemetry 의 retrieval_hit_rate ≥ 0.9 + source 다양성 ≥ 4 (현 1 source: dispatcher).
- **현 시점 (2026-07-20)**: hit_rate 1.0 ✅ / source 1 (dispatcher).
- **Phase 13 success**: hit_rate ≥ 0.9 유지 + source 다양성 ≥ 4 (session-start / doc-sync / backlog-update / dispatcher 모두 활성).
- **관련 smoke**: `check_telemetry_cross_v0_15_6.py` (4 case) — events.jsonl parse + source 다양성 + hit_rate sanity.
- **action item**: 3 skill 의 retrieval 호출 활성화 (현 dispatcher 만 활성). activation 방법 — skill 명시 호출 또는 opt-in flag 적용.

### 2.3 AC3 — Self-Recover (drift detection → fix)

- **정의**: drift 발생 시 auto-fixable ≥ 95% + manual_required ≤ 5% + re-check PASS.
- **현 시점 (2026-07-20)**: 5 auto + 1 manual 정공법 + `cmd_self_recover` 정상 운영.
- **Phase 13 success**: 2-year 동안 auto-fix 비율 ≥ 95% 유지 + manual_required 시 `cmd_release` early return + scope creep warning 정상.
- **관련 smoke**: `check_self_recovering_v0_13_2.py` (8 case) — clean / loud fallback fix / README fix / dry-run / classify / re_check / format / emit.
- **cyclical discipline**: 매 major release 시 auto-fix ratio 측정 + manual_required 비율 측정.

### 2.4 AC4 — Bidirectional Link (wiki ↔ memory)

- **정의**: wiki pages × memory entries 의 bidirectional link symmetric + asymmetric_count = 0.
- **현 시점 (2026-07-20)**: asymmetric 0 ✅.
- **Phase 13 success**: 2-year 동안 symmetric 유지 + memory entry 추가 시 wiki frontmatter related_pages 자동 sync.
- **관련 smoke**: `check_bidir_link_v0_13_3.py` (6 case) — audit shape / path normalization / dry-run / sync / re-audit / format.
- **action item**: `cmd_bidir_link` 의 release-time 자동 호출 유지 (v0.13.3 close-out의 escape hatch `--skip-bidir-link` 명시).

### 2.5 AC5 — stable API 2-year 운영 (Phase 13 의 본질)

- **정의**: stable API 25 entries + 12 skill + 11 MCP + 11 harness 의 backward compat 2-year 보장.
- **현 시점 (2026-07-20)**: 25 entries frozen (v0.8.0 spec) + 12 skill stable + 11 MCP stable (1 removed) + 11 harness overlay.
- **Phase 13 success**: 2-year (2026-07-20 ~ 2028-07-20) 동안 backward compat 유지 + breaking change ≤ 1건 (semver minor patch).
- **관련 정공법**: [`./stable_guarantee.md`](./stable_guarantee.md) — public API surface + 5개 명시 제외 영역 + migration 3가지 정공법.
- **breaking change 정책**: 1 release `DeprecationWarning` → 다음 release `removal` (semver minor patch 이내).

### 2.6 AC6 — ADR-007 회귀 검증 (3rd cycle 부재)

- **정의**: `workflow_kit.common.decorators.v0_7_4_deprecated` decorator 외 다른 module 에서 직접 `DeprecationWarning` emit 0건.
- **현 시점 (2026-07-20)**: accepted (no-op) ✅.
- **Phase 13 success**: 2-year 동안 status `accepted` 유지 + 부재 확인 매 release.
- **관련 smoke**: `check_deprecation_3rd_cycle_v0_15_4.py` (3 case) — infrastructure vs surface 분리 검증.
- **cyclical discipline**: 매 major release 시 3 case 모두 PASS 확인.

## 3. Phase 13 의 follow-up 작업 (5 영역 × 3 우선순위)

### 3.1 우선순위 P0 (즉시, v1.0.0 stable 진입 직후)

#### P0-1: mypy strict venv 직접 verify (Break Point #3 close-out)

- **근거**: v0.15.20 v1.0.0_entry_evaluation.md 의 Gate 3 mypy strict 직접 verify 부재.
- **작업**: `.venv` 활성화 후 `mypy workflow-source/ --strict --extra mcp-sdk` 실행 → 0 errors 확인.
- **acceptance**: 0 errors + 109+ file clean + 신규 file (v0.15.16~v0.15.20 의 5 file 신규 + renderers.py 392 line + bootstrap 3 file + harness 2 file) 모두 strict 정합.
- **expected cycle**: v1.0.0 stable 진입 1 release 전.
- **관련 정공법**: CI 3-layer defense (Layer 1 CI + Layer 2 release-time gate + Cross-verify ci_sanity) 의 운영 검증.

#### P0-2: telemetry source 다양성 ≥ 4 (AC2 수렴)

- **근거**: 현 1 source (dispatcher) 만 활성. session-start / doc-sync / backlog-update 의 retrieval 호출 활성화 필요.
- **작업**: 3 skill 의 `memory-index-query` dispatcher 호출 활성화 + opt-in wiring 보강.
- **acceptance**: events.jsonl 의 by_source 에 4 source 모두 등장 + retrieval_hit_rate ≥ 0.9.
- **expected cycle**: v1.0.x 첫 patch release (v1.0.1~).

### 3.2 우선순위 P1 (단기, 1-3 release)

#### P1-1: CHANGELOG.md auto-gen lockdown (Phase 12 roadmap §8 권장 작업 후속)

- **근거**: `tools/release_pipeline.py release --apply` 의 changelog-gen pre-step 부재.
- **작업**: release pipeline 에 changelog auto-gen 추가 + Unreleased 본문 v0.7.10 ~ v0.15.20 누적 backfill.
- **acceptance**: 3 release 연속 auto-gen 결과 만족 (no manual edit) + commit message 와 release note 자동 정합.

#### P1-2: automated-repro-scaffold stable 승격

- **근거**: 9/11 stable (현 2 beta + 1 alpha residual).
- **작업**: 5/6 정합 조건 충족 (Pydantic schema + Error codes + smoke test + spec layer + frontmatter + apply field).
- **acceptance**: cumulative stable 10/12 + smoke test 5+ case + TSD 정합.

#### P1-3: git-conflict-resolver alpha → beta

- **근거**: alpha stage 의 잔여. opt-out 명시적.
- **작업**: smoke test + error_code 4종 정리 + spec layer 동기화.
- **acceptance**: beta stage 승격 + smoke test 5+ case + cyclic discipline.

### 3.3 우선순위 P2 (장기, 6+ month / year 1 / year 2)

#### P2-1: ADR-006 Memory Index 회고 본문 작성 (30일 누적 사용 후)

- **근거**: v0.11.22 자리 박기, 30일 누적 사용 데이터 후 작성 예정.
- **작업**: 2026-08-19 이후 (v0.11.22 + 30일) 회고 본문 작성 + ai-workflow/wiki/topics/ 추가.
- **acceptance**: 회고 본문 ≥ 200 line + 6 영역 (prototype / state.json hook / --merge opt-in / BM25 fallback / dispatcher entry / 3 skill wiring) + 회고 결론 + 후속 작업.

#### P2-2: long-running CI 안정성 검증 (1+ month)

- **근거**: Phase 12 의 후속 안정화 검증.
- **작업**: 1+ month 동안 매일 CI 의 drift prevention 6/6 + quality_dashboard 12/12 + smoke 24종 모두 PASS 누적 검증 + mypy strict 0 errors 누적.
- **acceptance**: 30+ 일 연속 PASS + 누적 release ≥ 3 회 + breaking change 0건.

#### P2-3: 2-year 종료 후 v2.0.0 진입 평가

- **근거**: Phase 13 의 success criteria 중 2-year guarantee 종결.
- **작업**: 2028-07-20 시점에 v2.0.0_entry_evaluation.md 신규 작성 + ADR-008 + Phase 14+ 정의.
- **acceptance**: v1.x 의 success criteria 모두 충족 + v2.0.0 의 follow-up 정의 + Phase 14+ 시작.

### 3.4 Out of scope (Phase 13 에서 다루지 않음)

- **신규 feature**: multi-tenant support / plugin ecosystem / 새로운 external integration. Phase 14+ 의 별도 milestone.
- **major API redesign**: stable API 25 entries 의 구조 변경. SemVer 2-year guarantee 정책 위배.
- **breaking change**: Phase 13 의 success criteria 는 "breaking change ≤ 1건 (semver minor patch 이내)". 신규 breaking change 시 별도 ADR.

## 4. Phase 13 의 cumulative discipline anchor (24 smoke)

Phase 12 의 24 smoke 가 Phase 13 의 cross-check anchor 유지. 매 major release 회귀 검증.

| 카테고리 | Smoke | Phase 13 success |
|---|---|---|
| Drift | check_drift_prevention_v0_11_23 | 6 case PASS (silent_failing 0, maturity fresh, harness 정합) |
| Harness | check_harness_v0_15_9 + check_harness_apply_guide_v0_15_13 | 11 harness 3-way set 동등 |
| Documentation | check_readme_cross / check_installation_usage / check_quickstart / check_sample_version / check_document_index / check_code_index / check_release_md / check_memory_governance_cross | 8 문서 × metric cross-check |
| Operational | check_quality_dashboard + check_phase15_dashboard_panels + check_smoke_trend_cross + check_telemetry_cross + check_memory_index_cross + check_maturity_distribution_cross | 6 panel/telemetry 정합 |
| Refresh | check_refresh_maturity (3종) | strict opt-out + release_error fallback + today override |
| Deprecation | check_deprecation_3rd_cycle_v0_15_4 | ADR-007 정합 (3 case PASS) |
| Append-only | check_appendonly_memory_layout | state.json + TASK file 정합 |
| infra | check_memory_lint + check_audit_mkdocs_links | memory + lint + mkdocs |

**cumulative**: 24/24 PASS + 회귀 0 (2-year 동안 지속).

## 5. Phase 13 의 release schedule

### 5.1 Year 1 (2026-07-20 ~ 2027-07-20)

| Quarter | 예상 release | 핵심 작업 |
|---|---|---|
| Q3 2026 | v1.0.0 stable + v1.0.1 (P0-1 mypy) | v1.0.0 정식 entry + mypy strict 정합 |
| Q4 2026 | v1.0.2 ~ v1.0.4 (P0-2 telemetry) | telemetry source 다양성 ≥ 4 |
| Q1 2027 | v1.1.0 (P1-1 changelog) + v1.1.1 (P1-2 repro-scaffold) | CHANGELOG auto-gen + repro-scaffold stable |
| Q2 2027 | v1.1.2 ~ v1.1.5 (P1-3 git-conflict-resolver) | alpha → beta + cumulative stability |

### 5.2 Year 2 (2027-07-20 ~ 2028-07-20)

| Quarter | 예상 release | 핵심 작업 |
|---|---|---|
| Q3 2027 | v1.2.0 (P2-1 ADR-006 회고) | 회고 본문 작성 + 후속 작업 |
| Q4 2027 | v1.2.1 ~ v1.2.5 (P2-2 long-running CI) | 누적 안정성 + 누적 release ≥ 10 |
| Q1 2028 | v1.3.0 (Phase 14+ entry 평가) | Phase 13 close-out + Phase 14 진입 |
| Q2 2028 | v1.3.x + v2.0.0_entry_evaluation.md | v2.0.0 진입 평가 + ADR-008 |

### 5.3 종결 (2028-07-20)

- Phase 13 close-out.
- Phase 14+ 시작 (v2.0.0 정식 entry 평가).
- ADR-008 (Phase 14+ 의 정의) 작성.

## 6. Phase 13 의 success criteria (2-year 종료 시점)

| Criteria | 2-year 목표 | 측정 방법 |
|---|---|---|
| stable API backward compat | breaking change ≤ 1건 | `git log --grep="BREAKING"` |
| 25 __all__ entries frozen | 0 change | `git log -- workflow_kit/__init__.py` |
| 12 skill stable | 0 change (stable → beta / prototype / removed) | maturity_matrix.skills |
| 11 MCP stable | removed ≤ 1 (이미 1) | maturity_matrix.mcp_tools |
| 11 harness overlay | 0 change (additive 만) | file system 정합 |
| 24 smoke PASS | 0 fail / 0 regression | 회귀 테스트 |
| Panel 1 silent_failing | 항상 0 | check_drift_prevention |
| Panel 3/8 telemetry | hit_rate ≥ 0.9 + source ≥ 4 | check_telemetry_cross |
| AC1+AC2+AC3+AC4 | 모두 PASS + north-star 수렴 | check_drift / check_telemetry / check_self_recovering / check_bidir_link |
| ADR-007 status | `accepted` 유지 | check_deprecation_3rd_cycle |
| Cumulative release | ≥ 12 (year 1) + ≥ 12 (year 2) = ≥ 24 | git tag count |

## 7. Phase 13 의 cross-reference

| 영역 | 본 Phase 13 follow-up 정의 | 관련 anchor |
|---|---|---|
| Quality Dashboard north-star | §2.1 AC1 | [`./quality_dashboard_spec.md`](./quality_dashboard_spec.md) |
| Telemetry 활용도 | §2.2 AC2 | (telemetry 인프라 v0.13.1 close-out) |
| Self-Recover | §2.3 AC3 | (self-recovering drift prevention v0.13.2 close-out) |
| Bidirectional Link | §2.4 AC4 | (bidir-link v0.13.3 close-out) |
| stable API 2-year 운영 | §2.5 AC5 + §3 follow-up | [`./stable_guarantee.md`](./stable_guarantee.md) |
| ADR-007 회귀 검증 | §2.6 AC6 | (deprecation 3rd cycle v0.15.4 close-out) |
| Phase 12 close-out | §0 + §1 | maturity_matrix.Phase 12 status done |
| Phase 14+ 진입 | §5.2 / §5.3 | (v2.0.0_entry_evaluation.md, 후속 작성) |

## 8. 다음에 읽을 문서

- [./maturity_matrix.json](./maturity_matrix.json) — Phase 12 `status: done` + closed_in_release + closed_note + highlights (42 entry)
- [./stable_guarantee.md](./stable_guarantee.md) — v1.0.0 SemVer 2-year backward compat guarantee
- [./v1_0_0_entry_evaluation.md](./v1_0_0_entry_evaluation.md) — 6 gate criteria + Break Point #1~#3 close-out
- [./workflow_kit_roadmap.md](./workflow_kit_roadmap.md) — Phase 12 누적 / 후속 / Phase 13 follow-up
- [./quality_dashboard_spec.md](./quality_dashboard_spec.md) — Quality Dashboard 8 panel + Phase 13 AC1 north-star
- [`../../ai-workflow/wiki/decisions/adr-007-deprecation-3rd-cycle-candidates.md`](../../ai-workflow/wiki/decisions/adr-007-deprecation-3rd-cycle-candidates.md) — ADR-007 3rd cycle no-op accepted
- [`../../ai-workflow/memory/release/v0.11.22/session_handoff.md`](../../ai-workflow/memory/release/v0.11.22/session_handoff.md) — Phase 12 시작점 session handoff
