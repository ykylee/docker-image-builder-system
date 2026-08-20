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
  - `apps/runner/internal/config/config.go`
  - `apps/runner/internal/config/config_test.go`
  - `apps/runner/cmd/runner/main.go`
  - `compose.dev.yaml`
  - `docs/PROJECT_PROFILE.md`

- 작업 내용: AUTH_MODE=required control-plane에서 RUNNER_AUTH_TOKEN 누락 시 Runner를 시작 단계에서 종료해 401 polling loop를 방지한다.
- 완료 기준:

## 🛠️ Implementation / Content

- 진행 현황: RUNNER_AUTH_REQUIRED 설정과 Config.Validate를 추가하고 token 누락 시 fail-fast를 구현했다.
- 다음 세션 시작 포인트: required mode Compose/Kubernetes 배포에서 RUNNER_AUTH_REQUIRED=true와 token Secret 주입을 실제 manifest까지 정렬한다.
- 남은 리스크: 현재는 Runner 시작 검증만 추가했으며 실제 배포 Secret 주입 경로는 후속 정렬 필요.

## ✅ Outcome

- 작업 결과: Go config/hostclient/worker 및 전체 go test ./... 통과.
- 검증 결과: go test ./... PASS; git diff --check 예정.
- 후속 작업:
