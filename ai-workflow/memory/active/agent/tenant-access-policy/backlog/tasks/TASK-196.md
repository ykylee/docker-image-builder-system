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

- 작업 내용: Artifact Factory dependency proxy MVP의 구현 계획, milestone, WBS, critical path와 완료 게이트를 수립한다.
- 완료 기준: 4개 지원 ecosystem 모두 표준 proxy build arg가 생성되고 기존 빈 profile은 추가 arg를 만들지 않는다.

## 🛠️ Implementation / Content

- 진행 현황: Package proxy URL을 Python(PIP_INDEX_URL), npm(NPM_CONFIG_REGISTRY), Go(GOPROXY), Rust(CARGO_REGISTRIES_CRATES_IO_INDEX) 표준 변수로 매핑하고 4개 ecosystem 테스트를 추가했다.
- 다음 세션 시작 포인트: 실제 Dockerfile fixture에서 각 package manager가 proxy 변수로 동작하는 통합 검증
- 남은 리스크: 실제 proxy 제품과 staging 네트워크 검증은 아직 미실행.

## ✅ Outcome

- 작업 결과: Runner docker/services/worker/artifact/hostclient/queue go test 및 git diff --check 통과
- 검증 결과: Runner docker/services/worker/artifact/hostclient/queue go test 및 git diff --check 통과
- 후속 작업: 4개 ecosystem fixture와 registry mirror 구현을 별도 WBS 작업으로 착수한다.
