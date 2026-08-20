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
  - `compose.dev.required-auth.yaml`
  - `docs/PROJECT_PROFILE.md`
  - `docs/operations/keycloak-oidc-deployment-2026-08-18.md`

- 작업 내용: AUTH_MODE=required control-plane에서 RUNNER_AUTH_TOKEN 누락 시 Runner를 시작 단계에서 종료해 401 polling loop를 방지한다.
- 완료 기준:

## 🛠️ Implementation / Content

- 진행 현황: required-auth Compose overlay 추가: AUTH_MODE=required, AUTH_SECRET, RUNNER_AUTH_REQUIRED=true, RUNNER_AUTH_TOKEN을 함께 주입.
- 다음 세션 시작 포인트: Kubernetes runner/control-plane manifest가 존재하는 배포 경로에서 동일 Secret 주입 계약을 정렬한다.
- 남은 리스크: 현재 Kubernetes runner 예시는 없어 Compose overlay만 정렬됨.

## ✅ Outcome

- 작업 결과: credential 누락 config 실패와 placeholder credential config 렌더링을 검증했다.
- 검증 결과: missing secret docker compose config FAIL as expected; supplied secret config PASS; git diff --check PASS.
- 후속 작업:
