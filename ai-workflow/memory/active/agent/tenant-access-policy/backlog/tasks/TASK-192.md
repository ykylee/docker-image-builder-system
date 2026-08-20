---
id: TASK-192
status: planned
created_at: 2026-08-20
source_anchor: generic-task-192
source_path: backlog/2026-08-20.md
kind: generic
---

# TASK-192 — runner-rootless-rbac

## 📝 Description

- 상태: planned
- 우선순위: high
- 요청일: 2026-08-20
- 담당: codex
- 호스트명:
- 호스트 IP:
- 영향 문서:
  - `docs/operations/runner-isolation-rbac-2026-08-20.md`

- 작업 내용: Runner host Docker socket 의존을 제거하고 rootless worker 및 namespace-scoped RBAC로 전환한다.
- 완료 기준: socket 없는 build/test와 RBAC deny 회귀가 통과한다.

## 🛠️ Implementation / Content

- 진행 현황: 설계 문서와 수용 기준만 정리됨.
- 다음 세션 시작 포인트: apps/runner Kubernetes API 호출 감사 후 rootless worker spike를 실행한다.
- 남은 리스크: 실제 cluster와 rootless worker가 현재 환경에서 미가용하다.

## ✅ Outcome

- 작업 결과: 설계 문서 cross-reference 확인.
- 후속 작업: NetworkPolicy 및 resource limit 검증을 추가한다.
