---
id: TASK-181
status: planned
created_at: 2026-08-16
source_anchor: generic-task-181
source_path: backlog/2026-08-16.md
kind: generic
---

# TASK-181 — service-db-lifecycle-recovery

## 📝 Description

- 상태: planned
- 우선순위: high
- 요청일: 2026-08-16
- 담당: codex
- 호스트명:
- 호스트 IP:
- 영향 문서:
-

- 작업 내용: 서비스 DB provisioning/Secret/rotation/purge를 부분 실패에서 재시도·보상 정리 가능한 상태 machine으로 완성한다.
- 완료 기준: PROVISIONING/READY/FAILED/ROTATING/PURGING 전이가 명시된다.
- 완료 기준: Secret/DB 실패 후 retry가 성공한다.
- 완료 기준: orphan schema/role/Secret 탐지 결과가 0건이다.
- 완료 기준: rotation 실패 시 기존 credential과 상태가 보존된다.

## 🛠️ Implementation / Content

- 진행 현황: provisioning, migration gate, 상태 조회, purge, rotation은 구현됐지만 실패 후 자동 retry와 orphan detector가 남아 있다.
- 다음 세션 시작 포인트: 실패 주입 fixture와 retry state machine을 추가한다.
- 남은 리스크: Kubernetes Secret과 Postgres role 변경의 보상 트랜잭션이 분산돼 있다.

## ✅ Outcome

- 작업 결과:
- 후속 작업:
