---
id: TASK-195
status: planned
created_at: 2026-08-20
source_anchor: generic-task-195
source_path: backlog/2026-08-20.md
kind: generic
---

# TASK-195 — proxy-artifact-factory-spike

## 📝 Description

- 상태: planned
- 우선순위: high
- 요청일: 2026-08-20
- 담당: codex
- 호스트명:
- 호스트 IP:
- 영향 문서:
  - `docs/operations/proxy-artifact-factory-2026-08-20.md`

- 작업 내용: Docker가 기본적으로 내부 Artifact Factory dependency proxy/pull-through cache를 사용하고, cache miss는 factory가 allow-listed upstream에서 다운로드·검증·저장해 같은 요청에 반환하도록 설계·검증한다. ecosystem 제약 시 prefetch 후 재시도하고, host local materialization은 최후 fallback으로 둔다.
- 완료 기준: cache hit/miss/upstream fetch e2e, credential 비노출·digest 무결성 검증, prefetch 후 Docker 재시도 검증을 수행하고 direct BuildKit mirror/cache 대 자체 factory 채택을 결정한다.

## 🛠️ Implementation / Content

- 진행 현황: 현재 BuildImage는 DOCKER_BUILDKIT=1만 설정하며 proxy/build cache 계약은 없다. 내부 dependency proxy 기본 경로, cache miss fetch, ecosystem별 prefetch, 최후 local fallback 계약을 설계 문서에 추가했다.
- 다음 세션 시작 포인트: 우선 지원 ecosystem 1개를 정하고 Dockerfile/package manager가 내부 factory endpoint를 기본 사용하도록 하는 fixture를 만든다.
- 남은 리스크: proxy credential 유출 및 mutable tag 공급망 위험이 있다.

## ✅ Outcome

- 작업 결과: 코드 점검에서 proxy 전달 경로 부재를 확인; live proxy 검증 미실행.
- 후속 작업: 채택 시 registry digest/provenance와 retention 정책을 구현한다.
