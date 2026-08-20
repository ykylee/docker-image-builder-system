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
  - `apps/runner/internal/services/build_service.go`

- 작업 내용: Artifact Factory dependency proxy MVP의 구현 계획, milestone, WBS, critical path와 완료 게이트를 수립한다.
- Completion criteria: required profile missing coordinate가 명확한 실패로 보고되고 fallback profile은 기존 skip 동작을 유지한다.

## 🛠️ Implementation / Content

- Progress: artifactProfile.mode=required이고 RUNNER_ARTIFACT_COORDINATE가 비어 있으면 UNKNOWN_ERROR로 실패하도록 변경해 외부 네트워크 우회를 방지했다.
- Next session starting point: required/fallback 정책을 Docker build integration 및 운영 문서에 반영
- Remaining risks: memory repository source map과 실제 runtime repository 경계 또는 route lifecycle 추가 원인 확인 필요

## ✅ Outcome

- Result: Runner services/artifact/docker/worker/hostclient/queue go test 통과
- Verification: Runner services/artifact/docker/worker/hostclient/queue go test 통과
- 후속 작업: 4개 ecosystem fixture와 registry mirror 구현을 별도 WBS 작업으로 착수한다.
