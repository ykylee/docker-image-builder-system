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
  - `docs/PROJECT_PROFILE.md`
  - `docs/operations/keycloak-oidc-deployment-2026-08-18.md`

- 작업 내용: AUTH_MODE=required control-plane에서 RUNNER_AUTH_TOKEN 누락 시 Runner를 시작 단계에서 종료해 401 polling loop를 방지한다.
- 완료 기준:

## 🛠️ Implementation / Content

- 진행 현황: Kubernetes control-plane/Runner standalone required-auth manifest를 추가해 AUTH_SECRET과 RUNNER_AUTH_TOKEN Secret 주입을 문서화했다.
- 다음 세션 시작 포인트: 실제 cluster apply 또는 rootless worker/RBAC 격리 설계를 검증한다.
- 남은 리스크: Runner 예시는 host Docker socket을 사용하며 실제 cluster/RBAC 검증은 미실행.

## ✅ Outcome

- 작업 결과: Runner manifest는 cluster-local control-plane URL, RUNNER_AUTH_REQUIRED=true, token SecretRef를 포함한다.
- 검증 결과: Kubernetes YAML Ruby parse PASS (4+2 docs); git diff --check PASS.
- 후속 작업:
