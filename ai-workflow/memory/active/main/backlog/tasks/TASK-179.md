---
id: TASK-179
status: done
created_at: 2026-08-16
source_anchor: generic-task-179
source_path: backlog/2026-08-16.md
kind: generic
---

# TASK-179 — runner-auth-isolation

## 📝 Description

- 상태: done
- 우선순위: high
- 요청일: 2026-08-16
- 담당:
- 호스트명:
- 호스트 IP:
- 영향 문서:
  - `apps/runner/internal/hostclient/build_control_client.go; apps/runner/internal/config/config.go; apps/runner/internal/worker/worker.go; compose.dev.yaml; docs/PROJECT_PROFILE.md`

- 작업 내용: Runner 제어 API bearer token 주입 foundation
- 완료 기준:

## 🛠️ Implementation / Content

- 진행 현황: RUNNER_AUTH_TOKEN 주입, AUTH_MODE=required 서명 토큰 왕복 검증, rotation/Compose 운영 절차 문서화를 완료.
- 다음 세션 시작 포인트: TASK-180 queue lease/recovery 설계 및 구현
- 남은 리스크:

## ✅ Outcome

- 작업 결과: Runner 제어 API는 토큰 설정 시 보호 경계를 통과하고, 토큰 미설정 legacy 모드와 public build intake 정책을 유지한다.
- 검증 결과: Build Server principal tests 8/8 PASS; Go runner ./... PASS; pnpm check PASS; Build Server full tests 250/250 PASS; git diff --check PASS
- 후속 작업:
