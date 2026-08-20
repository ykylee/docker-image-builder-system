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
  - `compose.dev.runner-multi.yaml`
  - `compose.dev.runner-multi-postgres.yaml`
  - `compose.dev.required-auth.yaml`
  - `docs/PROJECT_PROFILE.md`

- 작업 내용: AUTH_MODE=required control-plane에서 RUNNER_AUTH_TOKEN 누락 시 Runner를 시작 단계에서 종료해 401 polling loop를 방지한다.
- 완료 기준:

## 🛠️ Implementation / Content

- 진행 현황: runner2/runner3에 auth env를 추가하고 required-auth overlay를 마지막에 전달하면 세 runner 모두 fail-fast/token 주입을 적용한다.
- 다음 세션 시작 포인트: Kubernetes runner/control-plane manifest가 존재하는 배포 경로에서 동일 Secret 주입 계약을 정렬한다.
- 남은 리스크: Kubernetes runner 예시는 아직 없어 Compose 경로만 검증됨.

## ✅ Outcome

- 작업 결과: memory/postgres multi-runner required config 렌더링에서 세 runner 모두 RUNNER_AUTH_REQUIRED=true와 token을 확인했다.
- 검증 결과: required multi-runner memory/postgres docker compose config PASS; git diff --check PASS.
- 후속 작업:
