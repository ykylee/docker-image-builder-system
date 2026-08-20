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
  - `apps/build-server/src/repositories/memory-build-repository.ts`

- 작업 내용: Artifact Factory dependency proxy MVP의 구현 계획, milestone, WBS, critical path와 완료 게이트를 수립한다.
- Completion criteria: 업로드 직후 claim이 발생해도 source bytes가 build record에서 유지되어 Runner GET이 404가 되지 않는다.

## 🛠️ Implementation / Content

- Progress: Memory StoredBuild에 uploadedSourceArchive snapshot을 추가하고 claim source gate, GET, DELETE가 이를 우선 사용하도록 보강했다. memory repository 테스트 33건 통과.
- Next session starting point: 수정 이미지로 Runner compose E2E를 재실행해 artifact preflight 로그 확인
- Remaining risks: memory backend source archive lifecycle race 또는 Runner claim/upload 순서 문제로 preflight E2E가 차단됨

## ✅ Outcome

- Result: build-server tsc 및 memory-build-repository 테스트 33건 통과
- Verification: build-server tsc 및 memory-build-repository 테스트 33건 통과
- 후속 작업: 4개 ecosystem fixture와 registry mirror 구현을 별도 WBS 작업으로 착수한다.
