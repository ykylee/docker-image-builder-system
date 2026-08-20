---
id: TASK-193
status: planned
created_at: 2026-08-20
source_anchor: generic-task-193
source_path: backlog/2026-08-20.md
kind: generic
---

# TASK-193 — keycloak-live-token-smoke

## 📝 Description

- 상태: planned
- 우선순위: high
- 요청일: 2026-08-20
- 담당: codex
- 호스트명:
- 호스트 IP:
- 영향 문서:
  - `docs/operations/keycloak-oidc-deployment-2026-08-18.md`

- 작업 내용: Keycloak 연결 가능 환경에서 OIDC access-token audience와 realm role mapper를 실 token으로 검증한다.
- 완료 기준: audience/role/expiry/rotation 실 smoke가 통과하고 운영 체크리스트가 갱신된다.

## 🛠️ Implementation / Content

- 진행 현황: fake issuer와 negative claim 회귀는 완료됨.
- 다음 세션 시작 포인트: Keycloak 접근 가능한 staging endpoint와 realm/client 값을 확보한다.
- 남은 리스크: 현재 환경에서는 외부 IdP 연결이 불가능하다.

## ✅ Outcome

- 작업 결과: principal.test.ts 20/20 PASS; live smoke 미실행.
- 후속 작업: 실패 시 token claim diagnostics를 보강한다.
