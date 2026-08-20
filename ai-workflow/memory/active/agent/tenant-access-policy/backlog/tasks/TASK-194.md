---
id: TASK-194
status: planned
created_at: 2026-08-20
source_anchor: generic-task-194
source_path: backlog/2026-08-20.md
kind: generic
---

# TASK-194 — runner-bound-lease-token

## 📝 Description

- 상태: planned
- 우선순위: high
- 요청일: 2026-08-20
- 담당: codex
- 호스트명:
- 호스트 IP:
- 영향 문서:
  - `.omx/plans/production-readiness-roadmap-2026-08-05.md`

- 작업 내용: Runner별 claim lease token과 phase ownership을 도입해 다른 Runner의 상태 변경을 차단한다.
- 완료 기준: lease expiry/재queue와 다른 Runner phase mutation 401/403 회귀가 통과한다.

## 🛠️ Implementation / Content

- 진행 현황: 현재 공통 required bearer와 stale lease recovery만 구현됨.
- 다음 세션 시작 포인트: claim response와 phase route 계약의 ownership 필드를 설계한다.
- 남은 리스크: 기존 Runner 계약 및 Postgres/memory 양쪽 변경이 필요하다.

## ✅ Outcome

- 작업 결과: 현재 TASK-180 stale recovery는 구현됨; runner-bound lease 미구현.
- 후속 작업: dead-letter와 retry 상한을 함께 결정한다.
