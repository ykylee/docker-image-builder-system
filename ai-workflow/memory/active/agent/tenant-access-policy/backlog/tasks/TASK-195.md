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

- 작업 내용: Docker proxy 환경의 build 실패를 줄이기 위해 proxy profile/cache 직접 전달과 immutable artifact factory를 비교 검토한다.
- 완료 기준: proxy e2e와 credential 비노출 검증을 수행하고 direct BuildKit cache 대 factory 채택을 결정한다.

## 🛠️ Implementation / Content

- 진행 현황: 현재 BuildImage는 DOCKER_BUILDKIT=1만 설정하며 proxy/build cache 계약은 없음.
- 다음 세션 시작 포인트: 환경 독립적인 proxy fixture와 trusted artifact recipe를 정의한다.
- 남은 리스크: proxy credential 유출 및 mutable tag 공급망 위험이 있다.

## ✅ Outcome

- 작업 결과: 코드 점검에서 proxy 전달 경로 부재를 확인; live proxy 검증 미실행.
- 후속 작업: 채택 시 registry digest/provenance와 retention 정책을 구현한다.
