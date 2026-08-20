---
id: TASK-190
status: in_progress
created_at: 2026-08-20
source_anchor: generic-task-190
source_path: backlog/2026-08-20.md
kind: generic
---

# TASK-190 — runner-auth-fail-fast

## 📝 Description

- 상태: in_progress
- 우선순위: high
- 요청일: 2026-08-20
- 담당: codex
- 호스트명:
- 호스트 IP:
- 영향 문서:
  - `examples/k8s-control-plane-required-auth.yaml`
  - `examples/k8s-runner-required-auth.yaml`
  - `docs/operations/runner-isolation-rbac-2026-08-20.md`
  - `docs/PROJECT_PROFILE.md`
  - `docs/operations/keycloak-oidc-deployment-2026-08-18.md`

- 작업 내용: AUTH_MODE=required control-plane에서 RUNNER_AUTH_TOKEN 누락 시 Runner를 시작 단계에서 종료해 401 polling loop를 방지한다.
- 완료 기준:

## 🛠️ Implementation / Content

- 진행 현황: Runner 격리/RBAC 전환 문서와 socket 제거 수용 기준을 추가했다.
- 다음 세션 시작 포인트: apps/runner Kubernetes API 호출을 감사하고 kind/staging에서 rootless 경로와 최소 RBAC를 검증한다.
- 남은 리스크: 실제 cluster/RBAC 및 rootless build 검증은 아직 실행하지 않았다.

## ✅ Outcome

- 작업 결과: required-auth Kubernetes manifest와 Runner 격리/RBAC 전환 설계를 문서화했다.
- 검증 결과: Kubernetes YAML Ruby parse PASS (control-plane 4개 + Runner 2개); `git diff --check` PASS.
- 문서 검증: 격리 전환 설계 문서와 PROJECT_PROFILE cross-reference 확인 PASS.
- 후속 작업:
