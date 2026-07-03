# CodeWhale Standard AI Workflow Skill

- skill 이름: `codewhale-workflow`
- 목적: CodeWhale 환경에서 표준 AI 워크플로우를 운영하기 위한 additive rule 을 제공한다.
- 범위: 세션 시작 순서, 한국어 보고, 백로그/handoff 관리, 프로젝트 프로파일 기반 탐색
- 대상: CodeWhale agent, 저장소 관리자
- 상태: draft
- 최종 수정일: 2026-07-03
- 관련 문서: `ai-workflow/memory/active/state.json`, `ai-workflow/memory/active/session_handoff.md`, `ai-workflow/memory/active/work_backlog.md`, `ai-workflow/memory/active/PROJECT_PROFILE.md`

## 중요 — Constitution 과의 관계

CodeWhale 의 Constitution (Article I-VIII) 이 이미 아래 규칙을 내장하고 있으므로,
본 skill 은 이를 **반복하지 않는다**:

- 검증 없이 완료 선언 금지 → Constitution Article II (Verification)
- 병렬 실행 / 독립 작업 fan-out → Constitution Article III (Momentum)
- 컨텍스트 관리 / plan 패턴 → Constitution Regulations
- 서브 에이전트 위임 전략 → Constitution Regulations (Orchestration)
- 실행 규율 (도구 사용, scope discipline) → Constitution Statutes

본 skill 은 Constitution 이 제공하지 않는 **워크플로우 고유 가치**만 주입한다.

## 1. 세션 시작 순서

CodeWhale 세션 시작 시 아래 순서로 workflow state docs 를 읽는다:

1. `ai-workflow/memory/active/state.json` — 현재 기준선
2. `ai-workflow/memory/active/session_handoff.md` — 이전 세션 인계
3. `ai-workflow/memory/active/work_backlog.md` — 작업 백로그 인덱스
4. `ai-workflow/memory/active/PROJECT_PROFILE.md` — 프로젝트 특화 규칙
5. (있으면) `ai-workflow/memory/active/PURPOSE.md` — 프로젝트 목적

## 2. 언어와 보고 원칙

- 사용자에게 직접 보여지는 작업 보고, 상태 요약, 문서 초안, handoff, backlog 갱신 문안은 **한국어**로 작성한다.
- 코드, 명령어, 파일 경로, 설정 key, 외부 시스템 고유 명칭은 원문 그대로 유지한다.
- Constitution Statutes 의 언어 규칙(사용자 메시지 언어 따라가기)을 따르되, 사용자 노출 산출물 언어는 본 항목이 우선한다.

## 3. 작업 상태값

| 상태 | 의미 |
| --- | --- |
| `planned` | 시작 준비는 됐지만 본격 수행 전 |
| `in_progress` | 현재 세션 또는 다음 세션에서 이어서 처리 중 |
| `blocked` | 외부 의존성 또는 결정 대기 때문에 진행 불가 |
| `done` | 완료 기준과 검증 근거를 갖춘 상태 |

## 4. 메모리 계층

- `ai-workflow/memory/active/` — workflow state docs (세션 복원, backlog 상태, handoff 의 source-of-truth)
- `PROJECT_PROFILE.md` 의 `docs/...` 경로 — 실제 프로젝트 문서 위치
- `ai-workflow/` 는 세션 복원과 workflow 상태 관리용 **메타 레이어**. 일반 프로젝트 코드/문서 탐색 범위에서 제외.

## 5. 세션 종료 원칙

세션 종료는 **memory 갱신 → commit → push** 순서:

1. **memory 갱신**: `state.json`, `session_handoff.md`, `work_backlog.md` 갱신
2. **최종 검증**: `workflow-linter` 실행 (문서 정합성)
3. **다음 세션 시작 포인트** + **종료 요약** 을 handoff 에 기재
4. **commit + push**: memory 갱신 포함 단일 commit

## 6. 백로그 관리

- 각 작업 항목 최소 필드: 작업명, 상태, 우선순위, 요청일, 완료일, 담당, 호스트명, 호스트 IP, 영향 문서, 작업 내용, 진행 현황, 완료 기준, 작업 결과, 다음 세션 시작 포인트, 남은 리스크, 후속 작업
- 날짜별 backlog: `ai-workflow/memory/active/backlog/YYYY-MM-DD.md`

## 7. 기본 검증 명령

```bash
# smoke check
node --version
# lint
./node_modules/.bin/tsc -p packages/shared-contract/tsconfig.json --noEmit && ./node_modules/.bin/tsc -p packages/shared-config/tsconfig.json --noEmit && ./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit && ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json --noEmit
# type check
./node_modules/.bin/tsc -p packages/shared-contract/tsconfig.json --noEmit && ./node_modules/.bin/tsc -p packages/shared-config/tsconfig.json --noEmit && ./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit && ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json --noEmit
# quick test
./node_modules/.bin/tsc -p packages/shared-contract/tsconfig.json --noEmit && ./node_modules/.bin/tsc -p packages/shared-config/tsconfig.json --noEmit && ./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit && ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json --noEmit && (cd apps/runner && go build ./...)
```

## 8. CodeWhale 특화 운영

- CodeWhale 의 `agent` 도구 (explore/plan/review/implementer/verifier) 는 workflow agent 토폴로지의 worker 분화와 정렬된다.
- 메인 오케스트레이터(parent) 는 조정/통합/사용자 보고에 집중하고, 대량 탐색/구현/검증은 서브 에이전트로 위임한다.
- Constitution Article VII (Domain Context) 에 따라, 본 workflow 는 CodeWhale 의 운영 컨텍스트로 동작한다.

## 다음에 읽을 문서

- `ai-workflow/README.md`
- `harnesses/codewhale/apply_guide.md`
- `workflow-source/core/workflow_harness_distribution.md` (CodeWhale 섹션)
