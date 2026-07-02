<!-- standard-ai-workflow-kit: v0.11.21-beta -->

# Workflow Kit Roadmap

- 문서 목적: `standard_ai_workflow` 저장소의 현재 성숙도와 다음 단계 작업을 상위 로드맵 형태로 정리한다.
- 범위: 현재 단계 평가, 단계별 목표, 우선순위 로드맵, 완료 기준, 권장 작업 순서
- 대상 독자: 저장소 관리자, AI workflow 설계자, 구현자, 프로젝트 온보딩 담당자
- 상태: draft
- 최종 수정일: 2026-06-18
- 관련 문서: `./project_status_assessment.md`, `./workflow_skill_catalog.md`, `./workflow_mcp_candidate_catalog.md`, `./output_schema_guide.md`, `./prototype_promotion_scope.md`, `./read_only_mcp_transport_promotion.md`, `../skills/README.md`, `../mcp_servers/README.md`, `../examples/end_to_end_skill_demo.md`, `../examples/end_to_end_mcp_demo.md`, `../examples/output_samples/README.md`

## 1. 현재 단계 (Phase 11 close → Phase 12 in-progress: 운영 지능화 + deprecation 운영 안정화)

현재 저장소는 아래 12단계 중 **Phase 11 close + Phase 12 in-progress** 상태다. (Phase 1–11 완료, Phase 12 in_progress)

1. 개념 정리 단계 — Phase 1 (완료)
2. 표준 문서와 템플릿 분리 단계 — Phase 2 (완료)
3. 실행 가능한 프로토타입 도입 단계 — Phase 3 (완료)
4. 다수 프로젝트 실운영 검증 및 Beta 안정화 단계 — Phase 4 (완료)
5. 운영 지능화 및 품질 거버넌스 단계 — Phase 5 (완료)
6. 정밀도 및 최적화 단계 — Phase 6 (완료)
7. 지능형 작업 모드 도입 단계 — Phase 7 (완료)
8. 실전 파일럿 배포 및 통합 고도화 단계 — Phase 8 (완료)
9. 시스템 성숙도 및 다중 에이전트 진화 단계 — Phase 9 (완료)
10. 문서 및 링크 위생 단계 — Phase 10 (완료)
11. **실전 파일럿 검증 단계 — Phase 11 (완료, 2026-06-18 v0.9.0 release)**: DevHub 실전 파일럿 + contract v1 검증 + stable API frozen + generated JSON Schema SSOT + mypy strict 단계적 격상 18 file clean + read-only MCP transport + release-dist 1-command + **deprecation 1st cycle 실제 적용** (`phishing_federation_v4.fetch_federated_phishing_urls_v4` → DeprecationWarning) + SSOT 정합 + mypy config 정합
12. **운영 지능화 + deprecation 운영 안정화 단계 — Phase 12 (진행 중, 2026-06-18~)**: Phase 11 의 *외부 consumer 정합* 위에서 *내부 운영 품질* 심화 — deprecation 2nd cycle (1st 검증 기반) + mypy strict cumulative 18 → 33+ file (full strict 도달은 v1.0.0 milestone) + release pipeline automation (--apply 만으로 cycle close) + deprecation policy contract test (`workflow_kit.__all__` 의 deprecation-free 검증) + consumer signal 2nd wave (v0.7.62 follow-up 2차)

현재 판단 근거 (v0.9.0, 2026-06-18 기준):

- **Phase 1–11 완결**: Phase 11 의 모든 성공 기준 충족 (pilot A/B/C 실행 + contract v1 안정 + reusable package 1단계 + deprecation 1st cycle 적용 + SSOT 정합 회복 + mypy config 정합).
- **Phase 12 진행 중**: v0.9.0 release 직후 kickoff. v0.9.x follow-up 으로 deprecation 2nd cycle + mypy strict cumulative 격상 + release pipeline automation.
- **v0.9.0-beta 기준 (package: standard-ai-workflow 0.9.1, runtime `__version__` = v0.9.1-beta)**:
  - Deprecation Policy Operational Spec 신규 (221 lines, 9 sections, spec §3 lifecycle + §3.3 1st cycle 영향 symbol)
  - SSOT 정합: pyproject 0.8.1 → 0.9.1, runtime v0.9.1-beta (drift 정직하게 인정 — chapter 1 의 `version-bump --minor` 의 patch bump interaction, spec §4.2/§4.3 patch)
  - mypy config 정합: `[tool.mypy]` unknown option 5개 → `[tool.workflow-doctor]` section 분리 (v0.8.0~v0.8.15 의 strict validation bypass 버그 fix)
  - mypy strict cumulative: 18 file clean (mypy 2.1.0 stricter checking 으로 `workflow_kit_cli.py` 49 error 노출 — v0.8.6 release note 의 "44 error → 0" 은 mypy 1.x 기준, 별도 후속)
  - 누적 smoke test: 162/162 PASS 유지 (신규 6 test 는 별도 subset)
  - deprecation 1st cycle: `phishing_federation_v4.fetch_federated_phishing_urls_v4` → `DeprecationWarning` (stacklevel=2, deprecated + replacement + v0.10.0 removal 3-element message)
  - 작업 모드(Task Modes) 정의: 분석, 설계, 구현 등 6가지 작업 성격에 따른 워크플로우 최적화 명세화 및 템플릿 통합 완료
  - DevHub 파일럿 성공: 실제 대규모 프로젝트(DevHub)에 v0.9.0-beta 기반 운영 안정성 확인

## 1.1 현재 릴리즈 기준 정리 (v0.9.0-beta)

`v0.5.10-beta` (2026-06-08) 기준으로 완료된 성과:

- **쓰기 파이프라인 완성**: 모든 핵심 스킬에 `--apply` 또는 `--scaffold` 옵션 도입.
- **지능형 온보딩**: `project-status-assessment`를 통해 기존 프로젝트 도입 비용 획기적 절감.
- **통합 데모 러너**: `run_demo_workflow.py`를 통해 전 과정 E2E 시나리오(쓰기 포함) 재현 가능.
- **의존성 자동 관리**: `bootstrap` 도구가 Python/Node 환경에 맞춰 도구 의존성을 자동 설정.
- **출력 계약 엄격화**: 모든 도구가 표준 에러 코드와 `source_context`를 포함한 구조화된 JSON 출력을 제공.

다음 릴리즈(Phase 11 완료 이후)로 넘긴 것:

- **운영 지능화**: `git_history_summarizer`, `workflow_log_rotator` 등 MCP 도구의 심화 통합.
- **자동 재현 고도화**: `automated-repro-scaffold` 스킬의 AI 에이전트 연동 강화.
- **품질 대시보드**: 워크플로우 운영 지표 및 품질 점수 시각화 가이드.
- **정식 MCP SDK 안정화**: stdio-sdk `Connection closed` 회귀 해결 및 정식 승격.

## 2. 현재 자산

### 문서와 템플릿

- 공통 코어 표준: [global_workflow_standard.md](./global_workflow_standard.md)
- 프로젝트 상태 진단: [project_status_assessment.md](./project_status_assessment.md)
- 프로젝트/세션 템플릿: [../templates/](../templates/)

### 실행형 skill 프로토타입 (11종)

- [../skills/session-start/SKILL.md](../skills/session-start/SKILL.md)
- [../skills/backlog-update/SKILL.md](../skills/backlog-update/SKILL.md)
- [../skills/doc-sync/SKILL.md](../skills/doc-sync/SKILL.md)
- [../skills/merge-doc-reconcile/SKILL.md](../skills/merge-doc-reconcile/SKILL.md)
- [../skills/validation-plan/SKILL.md](../skills/validation-plan/SKILL.md)
- [../skills/code-index-update/SKILL.md](../skills/code-index-update/SKILL.md)
- [../skills/workflow-linter/SKILL.md](../skills/workflow-linter/SKILL.md)
- [../skills/project-status-assessment/SKILL.md](../skills/project-status-assessment/SKILL.md)
- [../skills/automated-repro-scaffold/SKILL.md](../skills/automated-repro-scaffold/SKILL.md)
- [../skills/robust-patcher/SKILL.md](../skills/robust-patcher/SKILL.md)
- [../skills/git-conflict-resolver/SKILL.md](../skills/git-conflict-resolver/SKILL.md)

### 실행형 MCP 프로토타입

- [../mcp_servers/latest-backlog/MCP.md](../mcp_servers/latest-backlog/MCP.md)
- [../mcp_servers/check-doc-metadata/MCP.md](../mcp_servers/check-doc-metadata/MCP.md)
- [../mcp_servers/check-doc-links/MCP.md](../mcp_servers/check-doc-links/MCP.md)
- [../mcp_servers/create-backlog-entry/MCP.md](../mcp_servers/create-backlog-entry/MCP.md)
- [../mcp_servers/suggest-impacted-docs/MCP.md](../mcp_servers/suggest-impacted-docs/MCP.md)
- [../mcp_servers/check-quickstart-stale-links/MCP.md](../mcp_servers/check-quickstart-stale-links/MCP.md)

### 데모와 검증

- skill 흐름 데모: [../examples/end_to_end_skill_demo.md](../examples/end_to_end_skill_demo.md)
- MCP 흐름 데모: [../examples/end_to_end_mcp_demo.md](../examples/end_to_end_mcp_demo.md)
- bootstrap 생성물 샘플: [../examples/bootstrap_output_samples.md](../examples/bootstrap_output_samples.md)
- 출력 샘플 허브: [../examples/output_samples/README.md](../examples/output_samples/README.md)
- 문서 무결성 검사: [../tests/check_docs.py](../tests/check_docs.py)
- bootstrap 스모크 검사: [../tests/check_bootstrap.py](../tests/check_bootstrap.py)
- 52종 전체 smoke test: [../tests/](../tests/)
- 기존 프로젝트 온보딩 runner: [../scripts/run_existing_project_onboarding.py](../scripts/run_existing_project_onboarding.py)
- read-only MCP transport 승격 기준: [read_only_mcp_transport_promotion.md](./read_only_mcp_transport_promotion.md)

## 3. 상위 목표

다음 단계의 상위 목표는 아래 세 가지다.

1. 문서와 프로토타입을 공용 계약 중심으로 정리한다.
2. 개별 프로토타입을 연결해 실제 workflow kit 형태를 만든다.
3. 둘 이상의 실제 프로젝트에서 적용 가능한 수준까지 검증한다.
4. (New) 워크플로우 운영 데이터를 지능적으로 요약하고 품질을 자동 관리한다.

## 4. 현재까지 완료된 축
...
## 5. 다음 우선순위 로드맵
...
### 우선순위 6: 운영 지능화 및 품질 거버넌스 (Phase 5) - 완료
...
### 우선순위 7: 시스템 성숙도 및 다중 에이전트 진화 (Phase 9) - 계획 중

목표:
- **Strict Data Contracts**: Pydantic을 활용한 엄격한 입출력 스키마 강제.
- **Official MCP v1.0 SDK**: 읽기 전용을 넘어선 정식 양방향 MCP SDK 전환.
- **Multi-Agent Orchestration**: 워커 분화(doc/code/validation) 및 Antigravity sub-agent 연동.
- **고급 스킬**: `git-conflict-resolver` 등 실전형 고난도 스킬 추가.

성과:
- 에이전트가 자신의 작업 이력을 Git 기반으로 자동 요약(`summarize_git_history`)할 수 있다.
- 워크플로우 문서 간의 불일치가 `workflow-linter`와 `rotate_workflow_logs`에 의해 관리된다.
- `assess_milestone_progress`를 통해 마일스톤 진척도가 80%를 넘을 경우 전환이 자동으로 제안된다.
- `automated-repro-scaffold`를 통해 버그 재현 샌드박스를 자동으로 구축할 수 있다.

### 완료 또는 사용 가능한 상태

- 공통 코어 문서, 템플릿, 하네스 가이드, 전역 snippet 가이드가 정리돼 있다.
- bootstrap 스크립트가 신규 프로젝트와 기존 프로젝트 도입 모드를 모두 지원하며, interactive `--harness` picker (v0.5.8) 를 통해 TTY 자동 선택 가능.
- 6개 하네스 대상: `Codex`, `OpenCode`, `Gemini CLI`, `Antigravity`, `MiniMax Code`, `pi-dev`.
- skill 11종과 MCP 12종의 실행형 프로토타입이 있다.
- skill 통합 demo runner 와 end-to-end 문서가 있다.
- 출력 스키마 가이드와 skill/MCP/runner 대표 출력 샘플 허브가 있다.
- 사용자 노출 산출물은 한국어, 내부 처리는 간결하게 유지한다는 운영 원칙이 core 문서와 bootstrap 생성물에 반영돼 있다.
- 기존 프로젝트 bootstrap 이후 assessment -> backlog/handoff -> validation/code-index 순으로 이어지는 후속 루틴이 있다.
- 승격 범위 문서가 있어 package/server 화 대상을 분리해서 계획할 수 있다.
- `workflow_kit/common` 패키지에 경로/Markdown/메타데이터/파서/정규화/runner/contracts/schemas/server helper 가 누적되고 있다.
- `workflow_kit/contract_v1/` (v0.5.6+, v0.5.7 multi-component 확장) 에 Pydantic v2 기반 delegation enforcement helpers (`output_validator`, `delegator.choose_role`, `delegator.choose_roles`) 가 있다.
- `workflow_kit/server` 에 read-only registry, direct-call entrypoint, JSON-RPC draft bridge, MCP v1 SDK candidate 가 있다.
- read-only descriptor, 하네스 MCP 예시, JSON-RPC fixture 가 `schemas/` 산출물로 export 되고 harness package 에 포함된다.
- runtime output contract 가 generated JSON Schema, manifest outputSchema, sample validation 에 함께 쓰인다.
- 52개 smoke test 묶음이 문서, bootstrap, harness export, output sample, generated schema, validation/code-index, onboarding runner, read-only MCP bundle, contract v1 multi-component, wire guide 회귀까지 커버한다.
- skill 11종 모두가 독립 `tests/check_*.py` smoke 경로를 갖추는 방향으로 정리되고 있다.

### 아직 비어 있는 축

- 정식 MCP SDK transport (`stdio-sdk`) 의 `Connection closed` 회귀 해결
- read-only input schema 의 Pydantic v2 기반 강타입 계약 전면 적용
- 결과 payload builder 와 orchestration 계층의 추가 reusable package 추출
- 실제 저장소 시범 적용 결과 (Phase 11 pilot 진행 중)
- 쓰기 성격 draft MCP 의 permission 경계 정리
- core 문서 간 중복 축소와 README 상태 단일 출처 정리
- smoke CI 결과 가시성 추가 개선

## 5. 다음 우선순위 로드맵

### 우선순위 1: Phase 11 실전 파일럿 검증 완료

현재 상태:
- Phase 11 pilot 시나리오 A (Linter & Steward), B (Feedback Loop), C (Git Resolver) 실행 및 피드백 반영 완료.
- 파일럿 결과 보고서 작성 및 Phase 11 종료 판단 진행 중.

목표:
- `phase11_pilot_validation_plan.md` 의 모든 성공 기준 충족.
- contract v1 enforcement (`choose_roles` + `validate_fanin_output`) 의 실전 안정성 검증.
- Phase 11 종료 후 Phase 12 (패키지 승격) 진입 판단.

### 우선순위 2: 실제 적용 검증

목표:
- 실제 저장소에 시범 적용하거나, 최소 1개의 추가 실제 사례를 문서화한다.

권장 산출물:
- 실제 적용 기록
- 적용 전/후 차이 요약
- 파일럿 후보 체크리스트 보강
- 첫 세션 브리핑 예시

완료 기준:
- 현재 규칙이 특정 샘플에 과도하게 맞춰진 것은 아닌지 실제 피드백으로 검증 가능하다.
- 복사 적용 시 어떤 문서를 어디까지 바꾸면 되는지 더 명확해진다.
- 하네스가 `onboarding_summary`, `warnings`, `orchestration_plan` 을 실제 첫 세션 브리핑에서 소비할 수 있음을 확인한다.
- pre-release package 를 실제 다른 저장소나 다른 환경에서 풀어 적용한 기록이 최소 1건 이상 남는다.

### 우선순위 3: runner/schema 계약 고정과 smoke CI 안정화

현재 상태:

- `core/output_schema_guide.md` 는 이미 존재한다.
- skill/MCP/runner 대표 출력 JSON 샘플 허브가 있다.
- `status`, `tool_version`, `warnings`, `source_context` 공통 필드는 1차 정리됐다.
- skill 6종과 runner 2종은 구조화된 `error`/`error_code` 패턴을 따른다.
- runner 실패 경로는 smoke test 와 GitHub Actions smoke workflow 로 확인된다.
- `tool_version` 값은 `workflow_kit.__version__` 을 단일 출처로 쓰도록 정리됐다.
- 대표 output sample 검사는 공통 계약 맵과 실제 `workflow_kit.__version__` 값을 기준으로 수행된다.
- runtime contract 에서 generated JSON Schema 를 생성하고, read-only manifest/descriptor 의 outputSchema 에도 같은 생성 결과를 사용한다.

목표:

- skill/MCP/runner 전반에서 공통 출력 규칙과 `error`/`warnings`/`source_context` 사용 기준을 더 명확히 한다.
- representative sample 과 smoke test 가 같은 계약을 바라보도록 정렬한다.
- sample contract 정적 schema 초안을 유지하고, 필요 시 JSON Schema 로 승격한다.
- `tests/check_*.py` 묶음의 실패 원인이 CI 로그에서 바로 식별되도록 정리한다.
- nested payload 와 error source_context 중 아직 얕게 검증하는 영역을 점진적으로 좁힌다.

권장 산출물:

- `examples/output_samples/*.json`
- `schemas/output_sample_contracts.json`
- `core/output_schema_guide.md` 보강
- 필요 시 `schemas/` 또는 실패 규칙 부록 문서
- 대표 skill 다건의 실패 처리 패턴

완료 기준:

- 같은 성격의 경고/실패 필드가 이름과 의미 면에서 과도하게 흩어지지 않는다.
- 샘플과 실제 프로토타입 출력이 같은 실패 계약을 공유한다.
- 실패 케이스 샘플과 예외 종료 스크립트 정리가 따라온다.
- runner 성공/실패 경로가 smoke test 와 샘플에서 함께 검증된다.
- `tool_version` 변경 시 수정 지점이 한 군데로 제한된다.

### 우선순위 4: reusable package 및 MCP server 승격 착수

목표:

- 시작된 `workflow_kit/common` 추출을 결과 payload builder 와 orchestration helper 까지 확장하고, read-only JSON-RPC draft bridge 를 정식 MCP SDK transport 로 승격할 준비를 한다.

권장 대상:

- profile / backlog / handoff 파서
- metadata / link / quickstart 검사 유틸
- session/doc-sync/validation/orchestration helper
- `latest_backlog`, `check_doc_metadata`, `check_doc_links`, `suggest_impacted_docs`, `check_quickstart_stale_links`

완료 기준:

- 기존 스크립트가 공통 라이브러리를 호출하도록 재구성된다.
- 읽기 전용 MCP server 1호 범위가 registry/direct-call/descriptor/fixture 수준에서 코드 구조로 시작됐다.
- `workflow_kit/` 패키지 루트가 향후 server 내부 구현에서도 재사용 가능한 구조로 정리된다.
- runner 들의 subprocess 호출과 단계별 입력 조립도 공통 helper 를 재사용한다.
- 정식 SDK transport 승격 전후에 유지할 descriptor 계약과 변경 가능한 envelope 가 분리된다.

### 우선순위 5: 릴리즈 운영 정리

목표:

- pre-release 패키지, 릴리즈 노트, 배포 산출물 업로드 흐름을 더 반복 가능한 운영 절차로 정리한다.

권장 산출물:

- 릴리즈 노트 템플릿
- package manifest 와 changelog 연결 기준
- GitHub pre-release 업로드 절차 문서

완료 기준:

- 버전별 패키지 산출물과 릴리즈 노트가 같은 구조로 반복 생성된다.
- 하네스별 zip 업로드와 릴리즈 본문 작성이 반자동 이상으로 재현 가능하다.
- source-docs 포함 프로필과 minimal runtime 프로필의 사용 기준이 문서화된다.

## 6. 권장 2주 순서

### 1주차

- pre-release package 를 외부 저장소나 별도 환경에 실제 적용해보기
- 파일럿 후보 선정 및 적용 기록 남기기
- release note 와 package guide 피드백 반영

### 2주차

- 실제 저장소 시범 적용 1건 이상 추가 기록
- output/orchestration helper package 추출 범위 재검토
- MCP server 기본 경로 승격 여부 판단
- release/changelog 자동화 가능성 검토

## 7. 단계별 완료 기준

### Phase 10 완료 기준

- skill 11종과 MCP 12종의 출력 계약이 샘플과 함께 정리돼 있다.
- 통합 demo runner 또는 동등한 연결 실행 흐름이 있다.
- 기존 프로젝트 도입 후속 루틴의 프로토타입이 있다.
- contract v1 enforcement (output_validator + delegator) 완료.
- multi-component fan-out/in (choose_roles) 완료.
- 문서/링크 위생 (Phase 10) 완료.
- 52종 smoke test 통과.

### Phase 11 완료 기준 (v0.9.0 시점 모두 충족 ✅)

- [x] Phase 11 pilot 시나리오 A/B/C 실행 및 성공 기준 충족.
- [x] contract v1 실전 검증 (`choose_roles` + `validate_fanin_output`) 안정.
- [x] 두 개 이상 프로젝트에 적용 가능한 예시 또는 시범 적용 결과가 있다 (DevHub).
- [x] MCP/skill 프로토타입 중 일부가 실제 reusable package 또는 server 형태로 승격됐다 (workflow_kit.common 30+ submodule, jsonrpc-bridge 안정).
- [x] Stable API frozen (v0.8.0)
- [x] generated JSON Schema SSOT (v0.8.0, 21 family, 85,743 bytes)
- [x] mypy strict 단계적 격상 cumulative (v0.8.1~v0.8.14, 18 file clean with mypy 2.1.0)
- [x] read-only MCP transport (v0.8.10-11)
- [x] release-dist 1-command (v0.8.15)
- [x] **Deprecation 1st cycle 실제 적용** (v0.9.0, `phishing_federation_v4.fetch_federated_phishing_urls_v4` DeprecationWarning)
- [x] SSOT 정합 (v0.9.0, pyproject 0.8.1 → 0.9.1, runtime v0.9.1-beta)
- [x] mypy config 정합 (v0.9.0, [tool.workflow-doctor] section 분리)

### Phase 12 완료 기준 (in-progress 기준 정의)

- [ ] Deprecation 2nd cycle 적용 (1st cycle 의 정책 운영 검증 결과 기반, 2nd cycle 영향 symbol 식별 + DeprecationWarning 추가)
- [ ] mypy strict cumulative 18 → 33+ file (1 release = 1-2 file 격상)
- [ ] release pipeline automation (`--apply` 만으로 version-bump + note-draft + release cycle close)
- [ ] deprecation policy contract test (`workflow_kit.__all__` 의 모든 symbol 이 *deprecation-free* 하거나 *명시적 deprecation marker* 가 있는지 contract test)
- [ ] consumer signal 2nd wave (v0.7.62 consumer_metrics 의 *2차 follow-up* — trend + digest 의 *운영 활용*)
- [ ] (별도 후속) workflow_kit_cli.py 49 mypy error 격상, full strict 도달 v1.0.0 milestone

## 8. 현재 권장 다음 작업

현재 시점에서 가장 권장하는 다음 작업은 아래 순서다 (Phase 12 기준).

1. **deprecation 2nd cycle 영향 symbol 식별** — 1st cycle 의 *운영 검증 결과* (consumer 의 warning log 빈도, migration 비용) 기반
2. **mypy strict cumulative 격상** — workflow_kit_cli.py 49 error 우선 처리 (가장 큰 단일 파일)
3. **release pipeline automation** — `--apply` 만으로 cycle close 가능하도록 in-process 통합
4. **deprecation policy contract test** — `workflow_kit.__all__` 의 모든 symbol 의 deprecation 상태 contract verify
5. (별도 후속) read-only input schema Pydantic v2 전면 적용, MCP stdio-sdk `Connection closed` 회귀 해결

이 순서는 현재 저장소가 가진 자산을 "Phase 12 = 운영 지능화 + deprecation 운영 안정화" 로 심화하는 데 초점을 둔다.

추가 메모:

- OpenCode overlay 에서는 `workflow-code-worker` 를 실제 구현, 설정 수정, 빌드/컴파일 확인을 맡는 기본 실행 worker 로 해석하는 기준을 유지한다.
- Phase 12 의 release note 는 `Beta-v0.9.x.md` 형식 유지 (chapter 별 release note 분할 ❌, v0.9.0 = 1 release note 묶음).

## 9. 외부 리뷰 반영 메모

외부 리뷰 브랜치(`review/external-review`)에서 제안된 항목 중 현재 계획에 반영할 내용은 아래와 같다.

즉시 반영 완료:

- `.gitignore` 보강으로 export/venv/cache 산출물 누수 방지
- `tests/check_*.py` 묶음을 기준으로 한 GitHub Actions smoke CI 추가
- `tool_version` 단일 소스화
- read-only MCP descriptor, JSON-RPC fixture, transport 승격 기준 spec 추가

단기 계획에 반영:

- 대표 skill 여러 종에서 `error_code` 포함 구조화 실패 출력 패턴 적용
- `tests/README.md` 에 CI 와 동일한 원샷 실행 명령 유지
- 실제 적용 전까지는 공통 라이브러리 확장을 계속하되, 새 추출은 파서/분류/추천 로직 우선으로 제한
- 정식 MCP SDK transport 승격 전에는 draft bridge/fixture 와 실제 SDK envelope 차이를 먼저 분리

논의 후 결정:

- `session-end` 대칭 흐름 추가
- core 문서 중복 축소와 README 상태 단일 출처 정리
- 공개 표준의 최소 필드와 선택 필드 재계층화

## 다음에 읽을 문서

- 상태 진단: [./project_status_assessment.md](./project_status_assessment.md)
- 출력 스키마 가이드: [./output_schema_guide.md](./output_schema_guide.md)
- skill 카탈로그: [./workflow_skill_catalog.md](./workflow_skill_catalog.md)
- 승격 범위 문서: [./prototype_promotion_scope.md](./prototype_promotion_scope.md)
- read-only transport 승격 기준: [./read_only_mcp_transport_promotion.md](./read_only_mcp_transport_promotion.md)
- package 루트: [../workflow_kit/README.md](../workflow_kit/README.md)
- 출력 샘플 허브: [../examples/output_samples/README.md](../examples/output_samples/README.md)
- skill 허브: [../skills/README.md](../skills/README.md)
- mcp 허브: [../mcp_servers/README.md](../mcp_servers/README.md)
