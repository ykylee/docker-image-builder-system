---
id: TASK-181
status: done
created_at: 2026-08-17
source_anchor: generic-task-181
source_path: backlog/2026-08-17.md
kind: generic
---

# TASK-181 — service-db-lifecycle-recovery

## 📝 Description

- 상태: done
- 우선순위: high
- 요청일: 2026-08-17
- 담당:
- 호스트명:
- 호스트 IP:
- 영향 문서:
-

- 작업 내용: Service DB lifecycle failure 상태 보존 및 orphan provisioning recovery
- 완료 기준:

## 🛠️ Implementation / Content

- 진행 현황: Postgres 실제 roundtrip 완료. service DB provision으로 schema/role 생성 후 updated_at을 stale로 조정해 recoverStaleProvisioning이 1건을 FAILED로 전환하는 것을 확인하고, purge로 schema/role/metadata 정리까지 검증.
- 다음 세션 시작 포인트: TASK-182 runtime hardening/observability 진행
- 남은 리스크:

## ✅ Outcome

- 작업 결과: Secret provisioning 실패와 stale PROVISIONING row가 영구 진행 상태로 남지 않고 FAILED로 관찰되며, operator retry/purge가 가능한 lifecycle 상태를 보장한다.
- 검증 결과: pnpm check PASS; service DB tests 7/7 PASS; Build Server full tests 254/254 PASS; Postgres migration bootstrap PASS; Postgres provision→stale recovery→purge PASS; git diff --check PASS
- 후속 작업:
