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

- Progress: Registry mirror fixture에 OCI manifest/blob digest endpoint를 추가하고 ARTIFACT_FACTORY_ALLOWED_UPSTREAMS 기반 upstream allow-list를 적용했다. 허용 host hit, 비허용 host 403, unknown digest 404를 smoke로 검증했다.
- Next session starting point: ecosystem별 실제 package-manager install fixture를 추가하고 proxy miss에서 허용 upstream fetch를 검증한다.
- Remaining risks: 실제 외부 Keycloak 및 프록시 네트워크는 로컬 환경에서 검증 불가; Docker daemon 전역 mirror 설정은 staging에서 별도 검증 필요

## ✅ Outcome

- Result: M1 registry mirror 및 upstream 정책 fixture 완료.
- Verification: go test ./... (apps/runner) PASS; bash scripts/smoke-registry-mirror-fixture.sh PASS: manifest/blob hit, upstream deny, digest miss
- Follow-up: Python/npm/Go/Rust package-manager install 및 upstream fetch/deny/integrity matrix
