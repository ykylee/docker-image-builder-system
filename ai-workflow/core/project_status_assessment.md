<!-- standard-ai-workflow-kit: v0.11.21-beta -->

# Project Status Assessment (Standard AI Workflow)

- 문서 목적: `standard_ai_workflow` 저장소의 현재 작업 상태, 설계 성숙도, 공백 영역, 다음 우선순위를 공식 진단 문서 형태로 정리한다.
- 범위: 저장소 구조, 문서 완성도, 구현 공백, 적용 가능성, 다음 단계 권고안
- 대상 독자: 저장소 관리자, AI workflow 설계자, 도입 검토자, 프로젝트 온보딩 담당자
- 상태: v0.5.10-beta 기준
- 최종 수정일: 2026-06-09
- 관련 문서: `../README.md`, `./global_workflow_standard.md`, `./workflow_skill_catalog.md`, `./workflow_mcp_candidate_catalog.md`, `./workflow_agent_topology.md`, `./workflow_kit_roadmap.md`, `./prototype_promotion_scope.md`

## 1. 총평

이 저장소는 `v0.5.10-beta` 기준으로 단순한 문서 표준을 넘어, **실행 가능한 통합 Workflow Kit**로 완전히 진화했다. 핵심 11종 스킬의 Beta 승급과 더불어, contract v1 enforcement (output_validator + delegator), multi-component fan-out (choose_roles), 지능형 운영 보조 도구(`workflow-linter`, `project-status-assessment`), MCP transport dual-mode (jsonrpc-bridge 안정 + stdio-sdk 실험적) 를 갖추어 타 프로젝트에 즉시 배포 및 실운영이 가능한 수준의 기술적 완성도를 확보했다.

현재 기준으로는 하네스별 배포 패키지(`dist/`)와 도입 가이드(`docs/INSTALLATION_AND_USAGE.md`)까지 갖춰져 있으며, **Phase 11: 실전 파일럿 검증** 단계를 진행 중이다. Phase 1–10 은 모두 완료 상태이며, 현재 Phase 11 이 `in_progress` 다. 정식 phase 상태는 `workflow-source/core/maturity_matrix.json` 을 단일 진실 공급원(SSOT)으로 참조한다.

## 2. 현재 단계 판단

현재 저장소는 11단계 중 **Phase 11 진행 중** 상태다 (Phase 1–10 완료). 정식 phase 상태는 `workflow-source/core/maturity_matrix.json` 을 SSOT 로 참조한다.

1. Phase 1 (Concept) — 완료
2. Phase 2 (Template) — 완료
3. Phase 3 (Prototype) — 완료
4. Phase 4 (Beta/Pilot) — 완료
5. Phase 5 (Intelligence) — 완료
6. Phase 6 (Precision & Optimization) — 완료
7. Phase 7 (Intelligent Task Modes) — 완료
8. Phase 8 (Pilot Deployment & Integration) — 완료
9. Phase 9 (System Maturity & Multi-Agent Evolution) — 완료
10. Phase 10 (Document & Link Hygiene) — 완료
11. Phase 11 (Real-world Pilot Validation) — 진행 중

v0.5.10-beta (2026-06-08) 기준 판단 근거:

- **핵심 스킬 11종 Beta**: 모든 핵심 스킬이 `--apply` 또는 `--scaffold` 기능을 포함하여 실질적인 쓰기 파이프라인 완성. v0.5.7+ 5종 추가 (`code-index-update`, `project-status-assessment`, `automated-repro-scaffold`, `robust-patcher`, `git-conflict-resolver`).
- **Contract v1 Enforcement**: `output_validator` + `delegator.choose_role` / `delegator.choose_roles` 로 sub-agent 응답 자동 검증 및 MUST NOT delegate 7 패턴 거부.
- **Multi-component Fan-out**: `choose_roles` 로 병렬 sub-agent 위임, `validate_fanin_output` 으로 cross-ref 통합 검증.
- **MCP Transport Dual-mode**: `jsonrpc-bridge` (안정, 기본) + `stdio-sdk` (실험적, `Connection closed` 회귀 있음).
- **Interactive Harness Picker**: `--harness` 미지정 시 TTY 자동 picker (v0.5.8).
- **배포 체계 구축**: 하네스별 맞춤형 배포 패키지 생성, 의존성 자동 관리(`bootstrap_lib`), 6개 하네스 오버레이.
- **검증 자동화**: 52종 smoke test + GitHub Actions CI.

## 3. 잘 정리된 영역 (v0.5.10-beta 성과)

### 3.1 쓰기 파이프라인과 스캐폴딩
`validation-plan`의 `--scaffold` 기능과 각 스킬의 `--apply` 기능은 에이전트가 단순히 '제안'하는 수준을 넘어, 프로젝트 문서와 테스트 코드를 직접 '관리'할 수 있는 능력을 부여한다. `robust-patcher` (v0.5.7+) 는 로컬 LLM 친화적 Search-Replace + 퍼지 매칭 기반의 견고한 파일 수정을 제공한다.

### 3.2 Contract v1 기반 다중 에이전트 위임
orchestrator ↔ sub-agent 간 contract v1 enforcement (`output_validator` + `delegator`) 로 sub-agent 응답의 자동 검증과 MUST NOT delegate 7 패턴 거부가 적용된다. `choose_roles` (v0.5.7) 로 multi-component fan-out 이 가능하며, `validate_fanin_output` 으로 cross-ref 통합 검증을 수행한다.

### 3.3 지능형 정합성 관리
`workflow-linter`는 `maturity_matrix.json`과 `state.json`, `handoff`, `backlog` 간의 논리적 불일치를 탐지하여 컨텍스트 누적 시 발생할 수 있는 환각(Hallucination) 요소를 사전에 차단한다.

### 3.4 표준화된 출력 계약
모든 스킬과 MCP가 contract v1 output envelope (`status`, `error`, `error_code`, `warnings`, `source_context`, `tool_version`) 을 포함한 구조화된 JSON 출력을 제공하여 하네스나 오케스트레이터가 결과를 기계적으로 처리하기 용이해졌다.

### 3.5 범용적인 도입 도구
`bootstrap_lib`가 Python 및 Node.js 의존성을 자동 관리하고, interactive `--harness` picker (v0.5.8) 로 TTY 환경에서 자동 하네스 선택을 지원하며, 기존 프로젝트와 신규 프로젝트를 구분하여 최적의 초기 세트를 생성해준다.

## 4. 현재 공백과 한계 (Next Phase 과제)

### 4.1 지능형 자동 교정 (Auto-fix)
현재 `workflow-linter`는 불일치를 탐지하지만, 이를 자동으로 수정하고 반영하는 루틴은 아직 초기 단계다. 에이전트가 탐지 결과를 컨펌 한 번으로 바로잡는 지능화가 필요하다.

### 4.2 양방향 MCP 정식 승격
현재의 MCP 서버는 주로 읽기 및 초안 생성 위주다. 프로젝트 파일을 직접 수정하거나 Git 명령을 수행하는 '쓰기 성격'의 도구들을 위한 보안 경계 및 정식 서버 구조 확립이 필요하다.

### 4.3 운영 지표 및 마일스톤 관리
작업 이력을 기반으로 `state.json`의 베이스라인을 자동 갱신하거나, 특정 주기(예: TASK 10개 단위)로 마일스톤 요약을 자동 생성하는 지능형 운영 로직이 아직 보강되어야 한다.

## 5. 이 저장소의 현재 가치 (v0.5.10-beta 기준)

- **즉시 배포 가능한 키트**: `dist/` 패키지를 통해 어떤 프로젝트든 5분 내에 표준 워크플로우 도입 가능.
- **에이전트 친화적 구조**: contract v1 enforced delegation, MCP dual transport, interactive picker 로 어떤 하네스에서도 최적의 워크플로우 구성 가능.
- **검증된 안정성**: 52종 smoke test 및 CI 를 통해 도구의 신뢰성 확보.

## 6. 우선순위 권고 (Phase 11~12)

### 우선순위 1: Phase 11 실전 파일럿 검증 완료
Phase 11 pilot 시나리오 A/B/C 실행 완료 상태에서 파일럿 결과 보고서 작성 및 종료 판단.

### 우선순위 2: MCP stdio-sdk 안정화
`check_read_only_mcp_sdk_stdio.py` 의 `Connection closed` 회귀 해결 및 정식 SDK transport 승격.

### 우선순위 3: 실제 적용 확대
실제 외부 저장소에 v0.5.10-beta 패키지를 적용하고, 그 과정에서 발생하는 사소한 오동작이나 가이드의 모호함을 수정하여 안정성을 높인다.

## 7. 권장 완료 기준 (Phase 12 진입 기준)

- Phase 11 pilot 모든 성공 기준 충족.
- MCP stdio-sdk `Connection closed` 회귀 해결 및 정식 승격.
- 2개 이상의 실제 프로젝트에서 1개월 이상의 안정적인 운영 기록 확보.

## 8. 결론

Standard AI Workflow는 `v0.5.10-beta`를 통해 contract v1 enforcement, multi-component fan-out, 11종 스킬, MCP dual transport, interactive harness picker 등 기술적 기반을 완비했다. 현재 Phase 11 실전 파일럿 검증을 진행 중이며, MCP stdio-sdk 안정화와 실제 프로젝트 적용 확대를 통해 Phase 12 (패키지 승격) 진입을 목표로 한다.
