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

- Progress: 4개 ecosystem fixture가 coordinate별 deterministic payload를 제공하고 manifest contentDigest·응답 헤더·실제 바이트 SHA-256을 검증하도록 확장했다. Runner artifact client에 Fetch 무결성 검증을 추가했다.
- Next session starting point: registry mirror와 ecosystem별 실제 package-manager install fixture를 추가하고 upstream deny 시나리오를 검증한다.
- Remaining risks: 실제 외부 Keycloak 및 프록시 네트워크는 로컬 환경에서 검증 불가

## ✅ Outcome

- Result: registry fixture content integrity 경계 구현 및 4개 ecosystem smoke 검증 완료.
- Verification: go test ./... (apps/runner) PASS; bash scripts/smoke-artifact-factory-ecosystems.sh PASS: python/npm/go/rust content digest verified
- Follow-up: registry mirror/base image digest fixture 및 upstream allow-list deny 테스트
