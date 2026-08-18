---
id: TASK-180
status: planned
created_at: 2026-08-16
source_anchor: generic-task-180
source_path: backlog/2026-08-16.md
kind: generic
---

# TASK-180 — queue-lease-recovery

## 📝 Description

- 상태: planned
- 우선순위: high
- 요청일: 2026-08-16
- 담당: codex
- 호스트명:
- 호스트 IP:
- 영향 문서:
-

- 작업 내용: Runner/control-plane 재시작과 부분 실패에서 build queue가 자동 복구되도록 lease/reaper/retry 모델을 도입한다.
- 완료 기준: claimedAt/leaseExpiresAt/runnerId/retryCount가 영속화된다.
- 완료 기준: stale lease가 자동 requeue 또는 terminal 처리된다.
- 완료 기준: 중복 claim이 방지된다.
- 완료 기준: Runner 강제 종료 e2e와 Postgres 재시작 e2e가 통과한다.

## 🛠️ Implementation / Content

- 진행 현황: 현재 claim expiry/reaper/dead-letter 상태가 없어 stuck build 위험이 있다.
- 다음 세션 시작 포인트: 계약·migration·repository atomic claim 설계부터 시작한다.
- 남은 리스크: memory/Postgres repository 양쪽의 atomic semantics를 함께 유지해야 한다.

## ✅ Outcome

- 작업 결과:
- 후속 작업:
