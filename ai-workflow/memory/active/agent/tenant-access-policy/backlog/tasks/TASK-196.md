---
id: TASK-196
status: in_progress
created_at: 2026-08-20
source_anchor: generic-task-196
source_path: backlog/2026-08-20.md
kind: generic
---

# TASK-196 — proxy-artifact-factory-implementation-plan

## 📝 Description

- Status: in_progress
- Priority: high
- 요청일: 2026-08-20
- Owner: codex
- 호스트명:
- 호스트 IP:
- 영향 문서:
  - `docs/design/proxy-artifact-factory-design-2026-08-20.md`
  - `docs/design/proxy-artifact-factory-wbs-2026-08-20.md`

- 작업 내용: Artifact Factory dependency proxy MVP의 구현 계획, milestone, WBS, critical path와 완료 게이트를 수립한다.
- Completion criteria: 코드 정책과 설계/WBS 정책이 일치하고 운영자가 모드별 동작을 확인할 수 있다.

## 🛠️ Implementation / Content

- Progress: Compose Runner E2E에서 잘못된 factory token으로 실제 build를 실행해 artifact lookup 401을 유도했다. Build detail이 FAILED, lastError.code=UNKNOWN_ERROR, message=FACTORY_AUTH_FAILED, phase history QUEUE_CLAIMED→SOURCE_PREPARED→FAILED를 남기는 것을 검증했다.
- Next session starting point: integrity mismatch 및 prefetch failure를 실제 compose build에서 각각 검증하고 full artifact E2E matrix를 CI smoke로 묶는다.
- Remaining risks: 현재 E2E는 memory backend와 fixture auth failure 기준; 실제 upstream proxy와 Keycloak은 로컬 검증 불가

## ✅ Outcome

- Result: Runner artifact auth failure phase/error mapping E2E 완료.
- Verification: bash scripts/smoke-runner-artifact-failure-e2e.sh PASS; go test ./... (apps/runner) PASS
- Follow-up: Runner integrity/prefetch failure E2E, CI matrix integration
