<!-- standard-ai-workflow-kit: v0.11.21-beta -->

# Workflow Adoption Entry Points

- 문서 목적: 표준 AI 워크플로우를 도입할 때 `신규 프로젝트` 와 `작업 중인 프로젝트` 두 가지 진입 경로를 구분해 시작 절차를 정리한다.
- 범위: 도입 모드별 목표, 추천 시작 순서, 자동화 가능 범위, 주의점
- 대상 독자: 저장소 관리자, 개발자, 운영자, AI agent, 프로젝트 온보딩 담당자
- 상태: draft
- 최종 수정일: 2026-06-09
- 관련 문서: `./global_workflow_standard.md`, `./project_status_assessment.md`, `./existing_project_onboarding_contract.md`, `../scripts/bootstrap_workflow_kit.py`
- 상태 문서/프로젝트 문서 경계: `./workflow_state_vs_project_docs.md`

## 1. 도입 경로 개요

표준 AI 워크플로우 도입은 아래 두 경로로 나눠서 생각하는 것이 가장 실용적이다.

1. 신규 프로젝트
2. 작업 중인 프로젝트

두 경우 모두 최종적으로는 같은 문서 세트로 수렴하지만, 시작 시점의 입력과 자동화 초점은 다르다.

## 2. 신규 프로젝트 도입

### 목표

- 공통 문서 구조를 빠르게 깔고, 프로젝트 특화 규칙만 얇게 채운다.
- 문서 경로, 기본 명령, 검증 규칙을 초기부터 표준 포맷으로 맞춘다.

### 추천 시작 순서

1. `bootstrap_workflow_kit.py --adoption-mode new` 로 기본 문서 세트를 생성한다.
2. `PROJECT_PROFILE.md` 에 프로젝트 목적, 문서 구조, 명령, 검증 규칙을 채운다.
3. `session_handoff.md` 와 날짜별 backlog 에 첫 작업 기준선을 적는다.
4. `generate_workflow_state.py` 로 `state.json` 을 생성하거나 갱신해 빠른 세션 기준선을 맞춘다.
4. 이후 skill/MCP 도입 범위를 정한다.

### 자동화 포인트

- 문서 세트 생성
- core 문서 복사
- 첫 backlog 파일 생성

### 주의점

- 신규 프로젝트는 자동 추정할 기존 코드베이스가 없으므로, profile 문서의 TODO 를 반드시 사람이 채워야 한다.
- 운영 절차가 아직 없는 상태라면 profile 문서의 예외 규칙 섹션부터 먼저 정리하는 편이 좋다.

## 3. 작업 중인 프로젝트 도입

### 목표

- 기존 코드베이스와 문서 구조를 빠르게 읽고, 워크플로우용 문서 초안을 자동 생성한다.
- 현재 저장소 현실에 맞는 도입 경로를 제시해 "빈 템플릿" 상태를 줄인다.

### 추천 시작 순서

1. `bootstrap_workflow_kit.py --adoption-mode existing` 로 저장소 분석과 문서 초안을 생성한다.
2. `repository_assessment.md` 에 적힌 추정 스택, 명령, 문서 위치를 실제 운영 규칙과 대조한다.
3. `PROJECT_PROFILE.md` 에 자동 추정값을 확정 또는 수정한다.
4. `session_handoff.md` 와 backlog 에 현재 진행 중인 실제 작업과 리스크를 반영한다.
5. `generate_workflow_state.py` 로 `state.json` 을 갱신한다.
6. 이후 문서 동기화, 세션 시작, backlog 갱신 흐름을 단계적으로 도입한다.

### bootstrap 직후 후속 루틴

기존 프로젝트 모드에서는 bootstrap 직후 아래 스크립트로 첫 온보딩 순서를 재현할 수 있다.

```bash
python3 scripts/run_existing_project_onboarding.py \
  --project-profile-path /path/to/project/ai-workflow/memory/active/PROJECT_PROFILE.md \
  --session-handoff-path /path/to/project/ai-workflow/memory/active/session_handoff.md \
  --work-backlog-index-path /path/to/project/ai-workflow/memory/active/work_backlog.md \
  --backlog-dir-path /path/to/project/ai-workflow/memory/active/backlog \
  --repository-assessment-path /path/to/project/ai-workflow/memory/active/repository_assessment.md
```

이 스크립트는 아래 순서를 읽기 전용으로 이어준다.

1. latest backlog 식별
2. session-start 기준선 복원
3. validation-plan 으로 초기 검증 수준 정리
4. code-index-update 로 README/허브/index 재확인 후보 정리

이때 `ai-workflow/` 문서는 세션 복원과 workflow 상태 관리용 메타 레이어로 취급하고, 일반 프로젝트 문서 탐색 범위에는 기본적으로 넣지 않는 편이 좋다.

즉, bootstrap 으로 만든 기존 프로젝트 초안을 “사람이 바로 검토할 수 있는 후속 계획”까지 연결하는 용도다.

세부 입력/출력 계약과 단계별 연결 규칙은 [./existing_project_onboarding_contract.md](./existing_project_onboarding_contract.md) 에서 별도로 관리한다.

하네스 소비 관점의 권장 순서는 아래와 같다.

1. `status`
2. `onboarding_summary.recommended_next_steps`
3. `warnings`
4. `orchestration_plan`
5. `validation_plan`
6. `code_index_update`

즉, 첫 세션에서는 사람이 읽을 요약과 리스크를 먼저 보여주고, 그 다음 worker 분배나 세부 검증 근거를 여는 편이 가장 자연스럽다.

### 자동화 포인트

- 상위 디렉터리 구조 스캔
- 기술 스택 후보 감지
- docs/tests/source 디렉터리 감지
- 설치, 실행, 테스트 명령 추정
- repository assessment 문서 생성
- handoff/backlog 초기 항목 자동 작성

### 주의점

- 자동 추정한 명령은 편의용 초안일 뿐이며, 실제 CI/CD 또는 운영 절차와 다를 수 있다.
- 기존 문서 체계가 이미 있다면 별도 워크플로우 문서를 둘지, 기존 문서 위치에 흡수할지 먼저 결정해야 한다.
- 리뷰 규칙, 배포 승인 규칙, 환경 제약은 자동 추정하기 어렵기 때문에 반드시 사람이 보강해야 한다.
- 실제 파일럿 적용 대상은 [../templates/pilot_candidate_checklist.md](../templates/pilot_candidate_checklist.md) 기준으로 먼저 추리는 편이 좋다.

## 4. 어떤 경로를 고를지 판단 기준

- 아직 저장소 골격만 있는 경우:
- `new`
- 이미 코드와 테스트, 문서가 존재하는 경우:
- `existing`
- 코드가 조금 있지만 운영 규칙이 거의 없는 경우:
- `existing` 으로 시작하되, 신규 프로젝트처럼 profile 문서를 적극 보완한다.

## 5. 권장 출력물

- 신규 프로젝트:
- `PROJECT_PROFILE.md`, `session_handoff.md`, `work_backlog.md`, 날짜별 backlog
- 작업 중인 프로젝트:
- 위 문서 세트 + `repository_assessment.md`

## 6. 이번 릴리즈 기준 권장 도입 묶음

이번 릴리즈에서는 MCP 연결보다 workflow/skill 구성과 온보딩 실적용 준비를 우선한다.

### 6.1 첫 세션 기본 묶음

기존 프로젝트 첫 세션에서는 아래 순서를 기본 묶음으로 권장한다.

1. `run_existing_project_onboarding.py`
2. `session-start`
3. `validation-plan`
4. `code-index-update`

이 묶음의 목적은 “현재 기준선 복원 + 검증 계획 + 허브/색인 재확인” 이다.

### 6.2 작업 등록/문서 정렬 묶음

실제 작업을 이어갈 때는 아래 순서를 권장한다.

1. `backlog-update`
2. `doc-sync`
3. 필요 시 `merge-doc-reconcile`
4. `generate_workflow_state.py`

이 묶음의 목적은 “오늘 작업 항목 정리 + 영향 문서 반영 + 병합 후 문서 정합성 회복 + 빠른 세션 기준선 재생성” 이다.

### 6.3 다음 릴리즈로 미루는 항목

- MCP stdio-sdk 정식 승격 (현재 `Connection closed` 회귀 해결 필요)
- read-only MCP 운영 경로 단일화 (jsonrpc-bridge → stdio-sdk 전환)
- MCP capability 확장과 정식 client 상호운용 범위 확대

즉, 이번 릴리즈의 성공 기준은 MCP 연결이 아니라 "workflow 문서/skill 묶음만으로 신규/기존 프로젝트 첫 세션을 안정적으로 시작할 수 있는가" 에 둔다.

## 7. v0.6.4 권장 도입 묶음 (Question Format + Stage Gate)

v0.6.4 부터는 두 가지 신규 패턴을 첫 도입 묶음에 추가한다. 두 패턴 모두 AIDLC (`awslabs/aidlc-workflows`) 의 3-Phase Lifecycle 와 Adaptive Execution 에서 차용한 메커니즘이며, 우리 v0.6.3-beta 의 inline Q&A + skill output 후 implicit next-step 의 약점을 보강한다.

### 7.1 Question File Format 패턴 (★★★ 권장)

AIDLC 의 `common/question-format-guide.md` 패턴을 차용. 핵심:

- **모든 Q&A 는 별도 question 파일** (예: `<phase>-questions.md`) 에 작성. inline Q&A 또는 채팅으로 직접 묻기 ❌.
- **multiple choice + `[Answer]:` tag** 형식 강제. 옵션 사이 빈 줄 (CommonMark strict renderer 호환).
- **"Other" 옵션은 필수** — 모든 질문의 마지막 옵션. A/B/C/D + X 형식.
- **Contradiction/ambiguity detection** 후 clarification file 자동 생성. 사용자가 모호한 답 ("mix of", "depends", "not sure") 을 하면 follow-up 질문 자동 추가.
- **Gate**: 모든 `[Answer]:` tag 가 채워질 때까지 다음 stage 진행 금지.

적용 위치:
- `project_workflow_profile_template.md` — 프로젝트별 profile 작성 시 clarification file 자동 emit
- `ask_user` 호출 빈도 ↓ (한 popup 에 multi-question 압축)
- `workflow_kit/common/contracts/question_format.py` (v0.6.4 신규) — question file parser + answer validator

상세 spec: [./question_file_format.md](./question_file_format.md)

### 7.2 Stage Gate 명시화 패턴 (★★★ 권장)

AIDLC 의 construction phase 가 2-option completion message (Request Changes / Continue to Next Stage) 를 강제하는 패턴을 차용. 우리 11종 skill 의 output 후 implicit next-step 의 약점을 보강.

핵심:

- **모든 skill output 후 표준 2-option approval prompt** 자동 emit. (1) Request Changes, (2) Continue to Next Stage.
- **Output schema 보강**: `output_schema_guide.md` §3.2 에 `stage_completion` 필드 추가. `requested_changes` (free text) + `next_stage` (enum) + `approval_timestamp` (ISO 8601).
- **Audit log 통합**: 각 stage completion 의 approval 을 `workflow_kit/memory/active/audit.md` 에 append-only 로 기록. ISO 8601 timestamp, raw user input 그대로.
- **Gate 위반 시**: skill 다음 단계 자동 진행 ❌. 사용자 explicit approval 후에만 진행.

적용 위치:
- 11종 skill spec 의 §X "Completion Message" 표준화 (각 spec 의 §N 에 cross-ref 추가)
- `workflow_kit/common/contracts/stage_gate.py` (v0.6.4 신규) — completion message schema + validator
- `output_schema_guide.md` §3.2 — stage_completion 필드 정의

상세 spec: [./stage_gate_pattern.md](./stage_gate_pattern.md)

### 7.3 두 패턴의 결합 효과

- **Question File Format** + **Stage Gate** = "사용자 결정의 SSOT 화" + "결정 시점의 강제 검증"
- AIDLC 의 audit.md append-only 정책 + 우리 `wiki-prompt-log` 의 raw mirror 정책이 자연스럽게 정합
- Phase 11 실전 파일럿 (Devhub Example × Contract v1) 의 후속으로 v0.6.4 Phase 12 실전 검증 진행 시 두 패턴을 1차 적용 대상으로

## 릴리스 및 안정성 업데이트 (v0.5.10-beta, 2026-06-09)

### 릴리스 상태: Phase 11 진행 중
- 현재 워크플로우 키트는 **Phase 11: 실전 파일럿 검증** 단계에 있습니다.
- Phase 1–10 완료. 주요 성과: contract v1 enforcement, multi-component fan-out, interactive harness picker, MCP dual transport, 52종 smoke test 안정 통과.
- 정식 phase 상태: `workflow-source/core/maturity_matrix.json` 참조.

### 기술적 안정성 개선: 빈 프로젝트 오판 방지
- **이슈**: 기존 프로젝트 도입 모드(`--adoption-mode existing`)에서 대상 프로젝트가 비어 있을 때, `ai-workflow` 키트 내부의 스크립트(scripts/, tests/ 등)를 프로젝트 코드로 오인하는 현상이 발견되었습니다.
- **해결**: `iter_repo_files` 및 `analyze_repo_structure` 함수에 `ignore_dirs` 필터링 로직을 강화했습니다. 이제 키트 디렉토리를 명시적으로 무시하여 순수 대상 프로젝트의 컨텍스트만 정확히 수집합니다.
- **효과**: "빈 저장소에 워크플로우를 먼저 배포하고 프로젝트를 시작"하는 패턴에서도 분석 결과가 왜곡되지 않고 청결한 상태를 유지합니다.

## 다음에 읽을 문서

- 공통 표준: [./global_workflow_standard.md](./global_workflow_standard.md)
- 상태 진단: [./project_status_assessment.md](./project_status_assessment.md)
- 기존 프로젝트 온보딩 계약: [./existing_project_onboarding_contract.md](./existing_project_onboarding_contract.md)
- 스크립트 안내: [../scripts/README.md](../scripts/README.md)
- 파일럿 후보 선정 체크리스트: [../templates/pilot_candidate_checklist.md](../templates/pilot_candidate_checklist.md)
- **v0.6.4 신규**: [./question_file_format.md](./question_file_format.md) — AIDLC 차용 multi-choice + [Answer]: tag 패턴
- **v0.6.4 신규**: [./stage_gate_pattern.md](./stage_gate_pattern.md) — skill output 후 2-option approval gate
