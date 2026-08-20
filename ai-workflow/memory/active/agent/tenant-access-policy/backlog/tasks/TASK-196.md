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
  - `apps/runner/internal/docker/client.go`
  - `apps/runner/internal/services/build_service.go`

- 작업 내용: Artifact Factory dependency proxy MVP의 구현 계획, milestone, WBS, critical path와 완료 게이트를 수립한다.
- 완료 기준: profile이 없는 빌드는 기존 docker build와 동일하고 profile이 있는 빌드는 endpoint build args를 전달한다.

## 🛠️ Implementation / Content

- 진행 현황: Docker Client에 ArtifactBuildOptions와 결정적 build arg 생성기를 추가하고 BuildService가 claim profile을 build 옵션으로 전달하도록 연결했다.
- 다음 세션 시작 포인트: 실제 Dockerfile fixture에서 Python/npm/Go/Rust별 표준 package manager 설정과 cache hit/miss를 검증
- 남은 리스크: 실제 proxy 제품과 staging 네트워크 검증은 아직 미실행.

## ✅ Outcome

- 작업 결과: Runner docker/services/worker/artifact/hostclient/queue go test 및 git diff --check 통과
- 검증 결과: Runner docker/services/worker/artifact/hostclient/queue go test 및 git diff --check 통과
- 후속 작업: 4개 ecosystem fixture와 registry mirror 구현을 별도 WBS 작업으로 착수한다.
