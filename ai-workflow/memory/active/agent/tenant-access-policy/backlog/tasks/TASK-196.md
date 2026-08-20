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

- 상태: in_progress
- 우선순위: high
- 요청일: 2026-08-20
- 담당: codex
- 호스트명:
- 호스트 IP:
- 영향 문서:
  - `apps/runner/internal/services/build_service.go`
  - `apps/runner/internal/worker/worker.go`

- 작업 내용: Artifact Factory dependency proxy MVP의 구현 계획, milestone, WBS, critical path와 완료 게이트를 수립한다.
- 완료 기준: profile과 coordinate가 있는 claim에서 factory lookup이 수행되고 unavailable/upstream 차단 시 prefetch fallback이 한 번 수행된다.

## 🛠️ Implementation / Content

- 진행 현황: Worker가 Artifact Factory client를 wiring하고 BuildService가 claim profile 및 RUNNER_ARTIFACT_COORDINATE 기준 lookup/prefetch preflight를 수행하도록 연결했다.
- 다음 세션 시작 포인트: Docker build 옵션에 ecosystem proxy URL과 registry mirror를 주입하고 실제 Docker fixture를 검증
- 남은 리스크: 실제 proxy 제품과 staging 네트워크 검증은 아직 미실행.

## ✅ Outcome

- 작업 결과: Runner services/worker/artifact/hostclient/queue go test 통과
- 검증 결과: Runner services/worker/artifact/hostclient/queue go test 통과
- 후속 작업: 4개 ecosystem fixture와 registry mirror 구현을 별도 WBS 작업으로 착수한다.
