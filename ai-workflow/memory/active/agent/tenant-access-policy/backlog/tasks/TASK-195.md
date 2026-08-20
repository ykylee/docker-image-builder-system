---
id: TASK-195
status: in_progress
created_at: 2026-08-20
source_anchor: generic-task-195
source_path: backlog/2026-08-20.md
kind: generic
---

# TASK-195 — proxy-artifact-factory-spike

## 📝 Description

- 상태: in_progress
- 우선순위: high
- 요청일: 2026-08-20
- 담당: codex
- 호스트명:
- 호스트 IP:
- 영향 문서:
  - `docs/operations/proxy-artifact-factory-2026-08-20.md`
  - `docs/design/proxy-artifact-factory-design-2026-08-20.md`
  - `docs/PROJECT_PROFILE.md`

- 작업 내용: Docker가 기본적으로 내부 Artifact Factory dependency proxy/pull-through cache를 사용하고, cache miss는 factory가 allow-listed upstream에서 다운로드·검증·저장해 같은 요청에 반환하도록 설계·검증한다. ecosystem 제약 시 prefetch 후 재시도하고, host local materialization은 최후 fallback으로 둔다.
- 완료 기준: (1) 내부 endpoint 기본 사용, (2) cache hit/miss/upstream allow-list fetch, (3) credential 비노출, (4) digest/lockfile 무결성, (5) prefetch 후 단 1회 Docker 재시도, (6) 장애별 오류 코드 e2e를 검증하고 direct BuildKit mirror/cache 대 자체 factory 채택을 결정한다.

## 🛠️ Implementation / Content

- 진행 현황: registry mirror·npm proxy·manifest·오류·보안 경계·MVP 검증 게이트 설계를 확정했다.
- 다음 세션 시작 포인트: Node/npm proxy fixture와 registry mirror fixture를 구현하고 cache hit/miss 및 integrity failure를 검증한다.
- 남은 리스크: 실제 proxy 네트워크와 upstream credential은 환경 의존적이며 staging 검증 전 운영 채택 불가.

## ✅ Outcome

- 작업 결과: dependency proxy/cache 논리 구성, Node/npm MVP, manifest·오류·보안 경계와 검증 게이트를 설계했다.
- 검증 결과: 설계 문서 cross-reference PASS; `git diff --check` PASS. 실제 proxy staging은 미실행.
- 후속 작업: 채택 시 registry digest/provenance와 retention 정책을 구현한다.
